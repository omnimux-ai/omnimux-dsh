import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MediaConfigControls, useMediaGenerationConfig } from './MediaConfigControls.jsx';
import { MediaSlotGroup } from './MediaSlotGroup.jsx';
import { ReferencePickerPopover } from './ReferencePickerPopover.jsx';
import { peekComposerPrefill, subscribeComposerPrefill, takeComposerPrefill } from './composer-prefill.js';
import { clampPromptTextareaHeight } from './prompt-textarea-height.js';
import {
  VIDEO_MODE_OPTIONS,
  activeOperation,
  cleanAnnotationPrefix,
  deriveAdaptiveOperation,
  extractSlotKeyFromBucketKey,
  inferMimeType,
  isAllowedReferenceUrl,
  makeBucketKey,
  operationsOf,
  rejectionOf,
  slotPlan,
} from './media-slot.js';
import { getGlobalMediaViewerStore } from './media-viewer-store.js';

export { makeBucketKey, cleanAnnotationPrefix, isAllowedReferenceUrl };

const VIDEO_MODE_IDS = {
  文生视频: 'text_to_video',
  首帧: 'first_frame',
  首尾帧: 'first_last_frame',
  全能参考: 'video_multi_ref',
  视频编辑: 'video_edit',
};

function isUrlReferencedElsewhere(url, excludeKey, currentBuckets) {
  if (!url || !currentBuckets) return false;
  for (const [k, items] of Object.entries(currentBuckets)) {
    if (k === excludeKey) continue;
    if (Array.isArray(items) && items.some((it) => it?.url === url)) {
      return true;
    }
  }
  return false;
}

/**
 * 图像/视频生成专用输入面板 (MediaViewerComposer)
 * 动态接通执行中枢模型目录 (/omnimux/model-catalog)
 * 7 大交互闭环与方案 C 双轨打点自适应机制：
 * 1. 外置垂直胶囊切换器（上图像、下视频，间距 10px），移除内部重复的模式下拉按钮；
 * 2. 跨模态平滑迁移素材（图像素材迁移为视频首帧，反之亦然）；
 * 3. 方案 C 双轨打点自适应：订阅 savedAnnotations 自动原图入槽、双向提示词同步与清空退槽；
 * 4. 提交时组装方位 Prompt 与 annotations 结构化数组。
 */
export function MediaViewerComposer({
  onDirectSubmit,
  initialMode = 'image',
  disabled = false,
}) {
  const store = getGlobalMediaViewerStore();
  const storeState = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { activeId, mediaList } = storeState;
  const activeItem = mediaList.find((m) => m.id === activeId) || mediaList[0];
  const activeItemId = activeItem?.id;
  const activeItemTitle = activeItem?.title;
  const activeItemUrl = activeItem?.url;
  const mediaAnnotations = storeState.annotationsByMediaId?.[activeItemId] || [];
  const savedAnnotations = useMemo(
    () => mediaAnnotations.filter((a) => a.status === 'saved'),
    [mediaAnnotations]
  );

  // 提示词输入框默认空。聊天里的提示词块点「使用提示词生成」后填入一次，不自动发送。
  const handedOff = useSyncExternalStore(subscribeComposerPrefill, peekComposerPrefill, () => null);
  const [prompt, setPrompt] = useState('');
  const [userPromptSuffix, setUserPromptSuffix] = useState('');
  const userPromptSuffixRef = useRef(userPromptSuffix);
  userPromptSuffixRef.current = userPromptSuffix;
  const [buckets, setBuckets] = useState({});
  const bucketsRef = useRef(buckets);
  bucketsRef.current = buckets;

  // 只释放本组件创建的本地上传 blob。画布当前图和其他槽位共用的 URL 不在这里销毁。
  useEffect(() => {
    return () => {
      const seen = new Set();
      Object.values(bucketsRef.current).forEach((items) => {
        if (!Array.isArray(items)) return;
        items.forEach((item) => {
          const url = item?.url;
          if (!item?.isLocalUpload || typeof url !== 'string' || !url.startsWith('blob:') || seen.has(url)) return;
          seen.add(url);
          URL.revokeObjectURL(url);
        });
      });
    };
  }, []);
  const [notice, setNotice] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetSlot, setTargetSlot] = useState(null);
  const targetSlotRef = useRef(targetSlot);
  targetSlotRef.current = targetSlot;

  const promptRef = useRef(null);
  const promptBoxRef = useRef(null);
  const isSwitchingRef = useRef(false);
  const config = useMediaGenerationConfig({ initialMode });
  const { mode, setMode, closePopovers, model, videoGenMode, setVideoGenMode } = config;
  const paramsRef = useRef(config.params);
  paramsRef.current = config.params;

  // 聊天提示词块一键填入：只写文本 + 切模式并收起浮层，不自动提交。
  useEffect(() => {
    if (!handedOff) return;
    const request = takeComposerPrefill(handedOff.token);
    if (!request) return;
    setPrompt(request.prompt);
    setUserPromptSuffix(request.prompt);
    userPromptSuffixRef.current = request.prompt;
    setMode(request.kind === 'video' ? 'video' : 'image');
    closePopovers();
  }, [handedOff, setMode, closePopovers]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 2400);
    return () => clearTimeout(timer);
  }, [notice]);

  const videoModeId = VIDEO_MODE_IDS[videoGenMode] ?? 'text_to_video';
  const videoChoices = useMemo(() => (
    VIDEO_MODE_OPTIONS.filter((option) => (
      operationsOf(model, 'video').some((operation) => operation.id === option.id)
    ))
  ), [model]);
  const slots = useMemo(
    () => slotPlan(model, mode, videoModeId),
    [model, mode, videoModeId]
  );

  useEffect(() => {
    if (mode !== 'video' || videoChoices.length === 0) return;
    if (!videoChoices.some((option) => option.id === videoModeId)) {
      setVideoGenMode(videoChoices[0].label);
    }
  }, [mode, videoChoices, videoModeId, setVideoGenMode]);

  const bucketKey = useCallback(
    (slot) => makeBucketKey(mode, model?.id, slot?.key),
    [mode, model?.id]
  );

  const handleClosePicker = useCallback(() => {
    setPickerOpen(false);
  }, []);

  // 方案 C 双轨打点自适应机制：订阅 savedAnnotations
  useEffect(() => {
    if (mode !== 'image') return;
    if (!slots || slots.length === 0) return;

    const firstSlot = slots[0];
    const key = bucketKey(firstSlot);

    if (savedAnnotations.length > 0) {
      // 1. 画布保存打点时，自动将当前模特原图注入卡槽 Slot 1 并带上「标记 N」角标
      const badgeText = `标记 ${savedAnnotations.length}`;
      const expectedId = `canvas-model-${activeItemId || 'default'}`;
      const expectedName = activeItemTitle || '当前模特原图';
      const rawUrl = activeItemUrl || '';
      const expectedUrl = isAllowedReferenceUrl(rawUrl) ? rawUrl : '';

      const currentBuckets = bucketsRef.current || {};
      const currentList = currentBuckets[key] || [];
      const existingIdx = currentList.findIndex((item) => item.isCanvasModel);

      if (!expectedUrl) {
        // 当 expectedUrl 为空时，若卡槽内存在 isCanvasModel 模特项，不提前 return，而是穿透执行清理将其剔除，防止僵尸模特数据
        if (existingIdx >= 0) {
          const removed = currentList[existingIdx];
          if (
            removed?.isLocalUpload &&
            removed?.url?.startsWith('blob:') &&
            removed.url !== activeItemUrl &&
            !isUrlReferencedElsewhere(removed.url, key, bucketsRef.current)
          ) {
            URL.revokeObjectURL(removed.url);
          }
          setBuckets((prev) => {
            const list = prev[key] || [];
            if (!list.some((item) => item.isCanvasModel)) return prev;
            return { ...prev, [key]: list.filter((item) => !item.isCanvasModel) };
          });
        }
      } else if (existingIdx >= 0) {
        const current = currentList[existingIdx];
        if (
          current.id === expectedId &&
          current.name === expectedName &&
          current.url === expectedUrl &&
          current.markBadge === badgeText
        ) {
          // 状态未变化，不触发更新
        } else {
          if (
            current.isLocalUpload &&
            current.url?.startsWith('blob:') &&
            current.url !== expectedUrl &&
            current.url !== activeItemUrl &&
            !isUrlReferencedElsewhere(current.url, key, bucketsRef.current)
          ) {
            URL.revokeObjectURL(current.url);
          }
          setBuckets((prev) => {
            const list = prev[key] || [];
            const idx = list.findIndex((item) => item.isCanvasModel);
            if (idx < 0) return prev;
            const next = [...list];
            next[idx] = {
              ...list[idx],
              id: expectedId,
              name: expectedName,
              url: expectedUrl,
              markBadge: badgeText,
            };
            return { ...prev, [key]: next };
          });
        }
      } else {
        const room = firstSlot.max == null ? Infinity : firstSlot.max;
        if (currentList.length >= room && !currentList.some((it) => it.isCanvasModel)) {
          setNotice('当前卡槽已满，无法自动加入标记原图；请清空一个卡槽后再使用标记生成');
          setBuckets((prev) => prev);
        } else {
          const modelAsset = {
            id: expectedId,
            name: expectedName,
            url: expectedUrl,
            isCanvasModel: true,
            markBadge: badgeText,
            type: 'image',
          };
          const combined = [modelAsset, ...currentList];
          const truncated = combined.slice(room);
          for (const item of truncated) {
            if (
              item?.isLocalUpload &&
              item?.url?.startsWith('blob:') &&
              item.url !== activeItemUrl &&
              !isUrlReferencedElsewhere(item.url, key, bucketsRef.current)
            ) {
              URL.revokeObjectURL(item.url);
            }
          }
          setBuckets((prev) => {
            const list = prev[key] || [];
            if (list.length >= room && !list.some((it) => it.isCanvasModel)) {
              return prev;
            }
            const c = [modelAsset, ...list];
            return { ...prev, [key]: c.slice(0, room) };
          });
        }
      }

      // 2. 输入框自动同步「标记 1：...；标记 2：...」，保留用户补充描述
      // 打点独立存在时剔除末尾多余的全角分号
      const prefix = savedAnnotations.map((a) => `标记 ${a.index}：${a.text}`).join('；');
      const suffix = userPromptSuffixRef.current;
      const fullText = suffix ? `${prefix}；${suffix}` : prefix;
      setPrompt(fullText);
    } else {
      // 清空打点时，原图退槽，输入框打点前缀精准清除
      const currentList = (bucketsRef.current || {})[key] || [];
      const hasCanvas = currentList.some((item) => item.isCanvasModel);
      if (hasCanvas) {
        const removed = currentList.filter((item) => item.isCanvasModel);
        for (const item of removed) {
          if (item.isLocalUpload && item.url?.startsWith('blob:') && item.url !== activeItemUrl) {
            URL.revokeObjectURL(item.url);
          }
        }
        setBuckets((prev) => {
          const list = prev[key] || [];
          if (!list.some((item) => item.isCanvasModel)) return prev;
          const filtered = list.filter((item) => !item.isCanvasModel);
          return { ...prev, [key]: filtered };
        });
      }
      setPrompt(userPromptSuffixRef.current || '');
    }
  }, [savedAnnotations, activeItemId, activeItemTitle, activeItemUrl, mode, model?.id, slots, bucketKey]);

  const videoSlots = useMemo(() => {
    if (mode !== 'video' || !model) return [];
    const ops = operationsOf(model, 'video');
    const list = [...(slots || [])];
    const seen = new Set(list.map((s) => s.key));
    for (const op of ops) {
      for (const input of op.inputs || []) {
        if (!input || input.type === 'text' || input.role === 'prompt') continue;
        const role = input.role ?? 'reference';
        const rawSlot = input.slot ?? role;
        let slotKeyPart = rawSlot;
        if (input.type === 'image') {
          if (role === 'reference' && (rawSlot === 'reference_images' || rawSlot === 'reference')) {
            slotKeyPart = 'reference';
          } else if (role === 'first_frame' || rawSlot === 'first_frame') {
            slotKeyPart = 'first_frame';
          } else if (role === 'last_frame' || rawSlot === 'last_frame') {
            slotKeyPart = 'last_frame';
          }
        }
        const key = `${input.type}:${role}:${slotKeyPart}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            key,
            slot: rawSlot,
            type: input.type,
            role,
          });
        }
      }
    }
    return list;
  }, [mode, model, slots]);

  // 提取用于视频模式推导的稳定依赖键（避免无关状态变动触发）
  const videoBucketsDependencyKey = useMemo(() => {
    if (mode !== 'video') return '';
    return Object.entries(buckets)
      .filter(([k]) => {
        const slotKey = extractSlotKeyFromBucketKey(k);
        const matched = videoSlots.find((s) => s.key === slotKey || bucketKey(s) === k);
        if (!matched) return false;
        return (
          matched.role === 'first_frame' ||
          matched.role === 'last_frame' ||
          matched.role === 'video' ||
          matched.type === 'video'
        );
      })
      .map(([k, v]) => `${k}:${Array.isArray(v) ? v.map((item) => item?.id ?? item?.name).join(',') : (v ? '1' : '0')}`)
      .sort()
      .join('|');
  }, [mode, buckets, videoSlots, bucketKey]);

  // 自适应收敛模式
  useEffect(() => {
    if (mode !== 'video' || !model) return;
    const prefix = makeBucketKey('video', model?.id, '');
    const scopedVideoBuckets = Object.fromEntries(
      Object.entries(bucketsRef.current).filter(([k]) => k.startsWith(prefix))
    );
    const adaptiveOp = deriveAdaptiveOperation(model, 'video', scopedVideoBuckets);
    if (adaptiveOp) {
      const matchOpt = VIDEO_MODE_OPTIONS.find((opt) => opt.id === adaptiveOp.id);
      if (matchOpt && matchOpt.label !== videoGenMode) {
        setVideoGenMode(matchOpt.label);
      }
    }
  }, [mode, model, videoBucketsDependencyKey, videoGenMode, setVideoGenMode]);

  // 跨模态平滑迁移素材（从最新状态即时推导，避免闭包陈旧；有素材迁移才提示“已装配”，无素材仅提示“已切换模式”）
  const handleSwitchMode = useCallback((newMode) => {
    if (disabled || mode === newMode || isSwitchingRef.current) return;
    isSwitchingRef.current = true;
    try {
      closePopovers();
      setPickerOpen(false);

      let migrated = false;

      if (newMode === 'video') {
        // 图像 -> 视频：即时推导图像槽，寻找第一张图片素材迁移为视频首帧
        const currentImgSlots = slotPlan(model, 'image');
        let sourceImgSlotKey = null;
        let firstImg = null;
        for (const slot of currentImgSlots) {
          const k = makeBucketKey('image', model?.id, slot.key);
          const items = (bucketsRef.current[k] || []).filter((item) => !item.type || item.type === 'image');
          if (items.length > 0) {
            firstImg = items[0];
            sourceImgSlotKey = k;
            break;
          }
        }

        if (firstImg && sourceImgSlotKey) {
          const firstFrameSlotPlan = slotPlan(model, 'video', 'first_frame');
          const firstFrameSlot = firstFrameSlotPlan.find((s) => s.role === 'first_frame') || firstFrameSlotPlan[0];
          if (firstFrameSlot) {
            const vKey = makeBucketKey('video', model?.id, firstFrameSlot.key);
            const migratedUrl = firstImg.url;
            const oldTargetItems = (bucketsRef.current || {})[vKey] || [];
            for (const item of oldTargetItems) {
              if (
                item.isLocalUpload &&
                item.url?.startsWith('blob:') &&
                item.url !== migratedUrl &&
                item.url !== activeItemUrl &&
                !isUrlReferencedElsewhere(item.url, vKey, bucketsRef.current)
              ) {
                URL.revokeObjectURL(item.url);
              }
            }
            setBuckets((prev) => {
              const srcList = prev[sourceImgSlotKey] || [];
              const nextSrcList = srcList.filter((item) => item !== firstImg && item.id !== firstImg.id);
              return {
                ...prev,
                [sourceImgSlotKey]: nextSrcList,
                [vKey]: [{
                  ...firstImg,
                  url: firstImg.url,
                  markBadge: '首帧',
                }],
              };
            });
            migrated = true;
          }
        }
        setMode('video');
        if (migrated) {
          setNotice('已无缝迁移至视频模式 · 首帧已装配');
        } else {
          setNotice('已切换模式');
        }
      } else {
        // 视频 -> 图像：即时推导视频槽，寻找首帧素材迁移为图像素材
        const currentVideoSlots = slotPlan(model, 'video', videoModeId);
        const firstFrameSlot = currentVideoSlots.find((s) => s.role === 'first_frame');
        const srcVideoKey = firstFrameSlot ? makeBucketKey('video', model?.id, firstFrameSlot.key) : null;
        const firstFrameItems = srcVideoKey
          ? (bucketsRef.current[srcVideoKey] || [])
          : [];

        if (firstFrameItems.length > 0 && srcVideoKey) {
          const firstFrame = firstFrameItems[0];
          const imgSlots = slotPlan(model, 'image');
          const imgSlot = imgSlots[0];
          if (imgSlot) {
            const imgKey = makeBucketKey('image', model?.id, imgSlot.key);
            const migratedUrl = firstFrame.url;
            const oldTargetItems = (bucketsRef.current || {})[imgKey] || [];
            for (const item of oldTargetItems) {
              if (
                item.isLocalUpload &&
                item.url?.startsWith('blob:') &&
                item.url !== migratedUrl &&
                item.url !== activeItemUrl &&
                !isUrlReferencedElsewhere(item.url, imgKey, bucketsRef.current)
              ) {
                URL.revokeObjectURL(item.url);
              }
            }
            setBuckets((prev) => {
              const srcList = prev[srcVideoKey] || [];
              const nextSrcList = srcList.filter((item) => item !== firstFrame && item.id !== firstFrame.id);
              return {
                ...prev,
                [srcVideoKey]: nextSrcList,
                [imgKey]: [{
                  ...firstFrame,
                  url: firstFrame.url,
                  markBadge: undefined,
                }],
              };
            });
            migrated = true;
          }
        }
        setMode('image');
        if (migrated) {
          setNotice('已切换至图像模式 · 素材已同步');
        } else {
          setNotice('已切换模式');
        }
      }
    } finally {
      setTimeout(() => {
        isSwitchingRef.current = false;
      }, 150);
    }
  }, [disabled, mode, closePopovers, model, videoModeId, setMode, setNotice, activeItemUrl]);

  const handleOpenPicker = useCallback((slot) => {
    closePopovers();
    setTargetSlot(slot);
    targetSlotRef.current = slot;
    setPickerOpen(true);
  }, [closePopovers]);

  const handleSelectAsset = useCallback((asset, slot) => {
    if (disabled) return false;
    if (!asset || !slots || slots.length === 0) return false;
    const activeSlot = slot || targetSlotRef.current || targetSlot || slots[0];
    if (!activeSlot || !activeSlot.key) return false;

    const exactMime = inferMimeType(asset);
    const inferredType = exactMime ? exactMime.split('/')[0] : (asset.type || activeSlot.type || '');
    const safeSubtype = inferredType === 'video' ? 'video/mp4' : (inferredType === 'audio' ? 'audio/mpeg' : 'image/jpeg');
    const fileType = exactMime || safeSubtype;
    const pseudoFile = asset.file
      ? { ...asset.file, type: asset.file.type || fileType, name: asset.file.name || asset.name || asset.title }
      : (fileType ? { type: fileType, name: asset.name || asset.title } : null);
    if (!pseudoFile) {
      setNotice('当前素材缺少类型信息，无法入槽');
      return false;
    }

    const rawDuration = asset.duration ?? asset.durationSec ?? asset.metadata?.duration ?? asset.metadata?.durationSec;
    const duration = typeof rawDuration === 'number' && Number.isFinite(rawDuration)
      ? rawDuration
      : (typeof rawDuration === 'string' && !Number.isNaN(Number(rawDuration)) ? Number(rawDuration) : null);

    if (activeSlot.durationMax != null && (activeSlot.type === 'video' || activeSlot.type === 'audio')) {
      if (duration == null) {
        setNotice('当前文件格式不符合要求');
        return false;
      }
    }

    const reason = rejectionOf(pseudoFile, activeSlot, duration);
    if (reason) {
      setNotice(reason);
      return false;
    }

    const key = bucketKey(activeSlot);
    const currentList = bucketsRef.current[key] || [];
    const room = activeSlot.max == null ? Infinity : activeSlot.max;
    if (currentList.length >= room) {
      setNotice(room === Infinity ? '卡槽已满，无法再添加素材' : `最多添加 ${room} 个`);
      return false;
    }

    setBuckets((prev) => {
      const list = prev[key] || [];
      if (list.length >= room) return prev;
      const itemId = `${asset.id || asset.assetId || 'asset'}-${Date.now()}-${list.length}`;
      const isLocalUpload = Boolean(asset.file) && !asset.assetId && String(asset.url || '').startsWith('blob:');
      return {
        ...prev,
        [key]: [...list, { ...asset, id: itemId, isLocalUpload, markBadge: activeSlot.label || undefined }],
      };
    });
    setNotice(`素材 [${asset.title || asset.name}] 已入槽`);
    return true;
  }, [disabled, slots, targetSlot, bucketKey, setNotice]);

  // 按内容行数变高，最多露出 10 行；再多的字在框里滚动。
  useLayoutEffect(() => {
    const node = promptRef.current;
    const box = promptBoxRef.current;
    if (!node) return undefined;
    const fit = () => {
      node.style.height = 'auto';
      node.style.height = `${clampPromptTextareaHeight(node.scrollHeight)}px`;
    };
    fit();
    if (!box || typeof ResizeObserver !== 'function') return undefined;
    let width = box.clientWidth;
    const observer = new ResizeObserver(() => {
      const next = box.clientWidth;
      if (next === width) return;
      width = next;
      fit();
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [prompt]);

  const handlePromptChange = useCallback((e) => {
    const val = e.target.value;
    setPrompt(val);
    setUserPromptSuffix(cleanAnnotationPrefix(val, savedAnnotations));
  }, [savedAnnotations]);

  const handleSend = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || disabled) return;
    closePopovers();
    setPickerOpen(false);

    const scopedPrefix = makeBucketKey(mode, model?.id, '');
    const scopedBuckets = Object.fromEntries(
      Object.entries(bucketsRef.current).filter(([key]) => key.startsWith(scopedPrefix))
    );
    const activeOp = deriveAdaptiveOperation(model, mode, scopedBuckets);
    const submitSlots = slotPlan(model, mode, activeOp?.id);
    const opInputs = activeOp?.inputs || [];

    // 若当前模型操作不支持参考图且槽位为 guidedOnly：只要存在素材项（无论是否有打点），阻断提交并提示，严禁静默丢弃！
    const hasUnsupportedGuidedWithItems = submitSlots.some((slot) => {
      if (!slot.guidedOnly) return false;
      const items = buckets[bucketKey(slot)] ?? [];
      if (items.length === 0) return false;
      const isAccepted = opInputs.some((input) => {
        if (!input || input.type === 'text' || input.role === 'prompt') return false;
        return (
          (input.slot && input.slot === slot.slot) ||
          (input.role && input.role === slot.role && input.type === slot.type)
        );
      });
      return !isAccepted;
    });

    if (hasUnsupportedGuidedWithItems) {
      setNotice('当前模型不支持参考图，请切换支持参考图的模型或清空卡槽素材');
      return;
    }

    const assets = submitSlots.flatMap((slot) => {
      const items = buckets[bucketKey(slot)] ?? [];
      if (items.length === 0) return [];
      if (slot.guidedOnly) {
        const isAccepted = opInputs.some((input) => {
          if (!input || input.type === 'text' || input.role === 'prompt') return false;
          return (
            (input.slot && input.slot === slot.slot) ||
            (input.role && input.role === slot.role && input.type === slot.type)
          );
        });
        if (!isAccepted) return [];
      }
      return items.map((item) => ({
        slot: slot.slot,
        type: slot.type,
        role: slot.role,
        name: item.name || item.title,
        url: item.url,
        assetId: item.assetId,
        file: item.file,
      }));
    });

    // 本地音视频没有可提交地址。图片仍由提交前物化成 data URL。
    const hasLocalMediaFile = assets.some((a) => a.file && !a.assetId && (a.type === 'video' || a.type === 'audio'));
    if (hasLocalMediaFile) {
      setNotice('请先上传本地音视频到资产库后再用于生成');
      return;
    }
    const hasInvalidFragment = assets.some((a) => {
      if (a.assetId || a.file) return false;
      const url = String(a.url || '');
      return !isAllowedReferenceUrl(a.url) || url.startsWith('blob:');
    });
    if (hasInvalidFragment) {
      setNotice('参考素材地址无效，请重新选择');
      return;
    }

    // 组装方位 Prompt 与 annotations 数组
    // 保留人类可读说明与结构化区域重绘语法
    let synthesizedPrompt = trimmed;
    if (savedAnnotations.length > 0) {
      const formattedAnnotations = savedAnnotations.map((a) => {
        const safeText = (a.text || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const x = Number.isFinite(a.xPercent) ? a.xPercent.toFixed(1) : '0.0';
        const y = Number.isFinite(a.yPercent) ? a.yPercent.toFixed(1) : '0.0';
        return `[区域重绘 标记${a.index}: 坐标(x: ${x}%, y: ${y}%) 要求: "${safeText}"]`;
      }).join(' ');
      synthesizedPrompt = `${trimmed} ${formattedAnnotations}`;
    }

    const annotationsPayload = savedAnnotations.map((a) => {
      const xPct = Number.isFinite(a.xPercent) ? a.xPercent : 0;
      const yPct = Number.isFinite(a.yPercent) ? a.yPercent : 0;
      return {
        id: a.id,
        index: a.index,
        normalized_x: Math.round((xPct / 100) * 1000) / 1000,
        normalized_y: Math.round((yPct / 100) * 1000) / 1000,
        comment: a.text,
        createdAt: a.createdAt || Date.now(),
      };
    });

    setPrompt('');
    setUserPromptSuffix('');
    userPromptSuffixRef.current = '';

    onDirectSubmit?.({
      prompt: synthesizedPrompt,
      rawPrompt: trimmed,
      kind: mode,
      operation: activeOp?.id,
      model: model?.id,
      channel: config.channel?.id,
      params: paramsRef.current,
      assets,
      annotations: annotationsPayload,
    });
  }, [
    prompt,
    disabled,
    closePopovers,
    slots,
    buckets,
    bucketKey,
    savedAnnotations,
    onDirectSubmit,
    mode,
    model,
    videoModeId,
    config.channel?.id,
  ]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="omx-mv-composer-outer">
      {/* 1. 输入框左侧外置垂直胶囊切换器（上图像、下视频，间距 10px，对标图 4） */}
      <div className="omx-external-mode-rail" role="tablist" aria-label="生成类型切换">
        <button // exempt-ui01: 外置垂直模式切换按钮
          type="button"
          role="tab"
          aria-selected={mode === 'image'}
          className={`omx-external-mode-btn${mode === 'image' ? ' is-active' : ''}`}
          onClick={() => handleSwitchMode('image')}
          title="图像模式"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span className="omx-external-mode-text">图像</span>
        </button>
        <button // exempt-ui01: 外置垂直模式切换按钮
          type="button"
          role="tab"
          aria-selected={mode === 'video'}
          className={`omx-external-mode-btn${mode === 'video' ? ' is-active' : ''}`}
          onClick={() => handleSwitchMode('video')}
          title="视频模式"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="23 7 16 12 23 17 23 7"/>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
          <span className="omx-external-mode-text">视频</span>
        </button>
      </div>

      {/* 2. 输入框主卡片容器 */}
      <div className="omx-mv-composer-root">
        {/* 选择参考浮层面板（正上方 8px 弹出） */}
        <ReferencePickerPopover
          open={pickerOpen}
          targetSlot={targetSlot}
          onClose={handleClosePicker}
          onSelectAsset={handleSelectAsset}
          onError={setNotice}
        />

        {notice ? <div className="omx-slot-notice" role="status">{notice}</div> : null}

        {mode === 'video' && videoChoices.length > 0 ? (
          <div className="omx-slot-modes" role="tablist" aria-label="视频生成模式">
            {videoChoices.map((option) => (
              <button // exempt-ui01: 模式切换单项
                key={option.id}
                type="button"
                className={`omx-slot-mode${option.id === videoModeId ? ' is-active' : ''}`}
                aria-pressed={option.id === videoModeId}
                onClick={() => setVideoGenMode(option.label)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {/* 提示词与素材卡槽同一行 */}
        <div className="omx-mv-prompt-row">
          {slots.length > 0 ? (
            <div className="omx-slot-row">
              {slots.map((slot) => (
                <MediaSlotGroup
                  key={bucketKey(slot)}
                  slot={slot}
                  items={buckets[bucketKey(slot)] ?? []}
                  disabled={disabled}
                  onChange={(items) => {
                    const key = bucketKey(slot);
                    const nextItems = Array.isArray(items) ? items : [];
                    const nextUrls = new Set(nextItems.map((item) => item?.url));
                    const currentItems = (bucketsRef.current || {})[key] || [];
                    for (const item of currentItems) {
                      if (
                        item?.isLocalUpload &&
                        item?.url?.startsWith('blob:') &&
                        !nextUrls.has(item.url) &&
                        item.url !== activeItemUrl &&
                        !isUrlReferencedElsewhere(item.url, key, bucketsRef.current)
                      ) {
                        URL.revokeObjectURL(item.url);
                      }
                    }
                    setBuckets((prev) => ({ ...prev, [key]: nextItems }));
                  }}
                  onReject={setNotice}
                  onOpenReferencePicker={handleOpenPicker}
                />
              ))}
            </div>
          ) : null}
          <div className="omx-mv-prompt-box" ref={promptBoxRef}>
            <textarea // exempt-ui01: 专用多模态提示词输入框
              ref={promptRef}
              className="omx-mv-prompt-textarea"
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'image'
                ? '描述你想生成或修改的内容；如已上传参考图，可输入 @ 引用'
                : '描述视频画面内容和动态过程，使用 @ 指定参考图或参考视频'}
              rows={2}
              disabled={disabled}
            />
          </div>
        </div>

        {/* 3. 底部操作工具栏 (单行流不折行：移除内部模式切换，仅保留模型与参数展示 ──► 发送) */}
        <div className="omx-mv-toolbar-bar">
          <div className="omx-mv-toolbar-left">
            <MediaConfigControls config={config} showModeSwitch={false} />
          </div>

          <div className="omx-mv-toolbar-right">
            <button // exempt-ui01: 纯黑白主发送按钮
              type="button"
              className="omx-send-cta-btn"
              onClick={handleSend}
              disabled={disabled || !prompt.trim()}
              title="立即直连生成 (Enter)"
              aria-label="立即直连生成"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MediaViewerComposer;
