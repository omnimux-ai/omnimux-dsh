import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MediaConfigControls, useMediaGenerationConfig } from './MediaConfigControls.jsx';
import { MediaSlotGroup, readDuration } from './MediaSlotGroup.jsx';
import { ReferencePickerPopover } from './ReferencePickerPopover.jsx';
import { peekComposerPrefill, subscribeComposerPrefill } from '../../../omnimux/src/client/media-viewer/composer-prefill.js';
import { claimPrefillWhenVisible, isElementShown } from './prefill-claim.js';
import { clampPromptTextareaHeight } from './prompt-textarea-height.js';
import {
  VIDEO_MODE_OPTIONS,
  activeOperation,
  cleanAnnotationPrefix,
  deriveAdaptiveOperation,
  extractSlotKeyFromBucketKey,
  inferMimeType,
  isAllowedReferenceUrl,
  imageOpDisplayLabel,
  makeBucketKey,
  operationsOf,
  rejectionOf,
  slotPlan,
  groupLockOf,
  sizeOf,
  visibleSlots,
} from './media-slot.js';
import { getGlobalMediaViewerStore } from '../../../omnimux/src/client/media-viewer/media-viewer-store.js';

export { makeBucketKey, cleanAnnotationPrefix, isAllowedReferenceUrl };

const VIDEO_MODE_IDS = {
  文生视频: 'text_to_video',
  首帧: 'first_frame',
  首尾帧: 'first_last_frame',
  全能参考: 'video_multi_ref',
  视频编辑: 'video_edit',
};

const ICONS_MODE = {
  ref: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="14" height="14" rx="2" />
      <path d="M8 21h12a2 2 0 0 0 2-2V8" />
      <circle cx="7" cy="7" r="1.5" />
      <path d="m14 12-2.5-2.5-4.5 4.5" />
    </svg>
  ),
  frames: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="2.5" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="17" x2="22" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  text: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
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
  const submittingRef = useRef(false);
  const currentDraftRef = useRef(prompt);
  currentDraftRef.current = prompt;
  const isSwitchingRef = useRef(false);
  const config = useMediaGenerationConfig({ initialMode });
  const { mode, setMode, closePopovers, model, videoGenMode, setVideoGenMode } = config;
  const paramsRef = useRef(config.params);
  paramsRef.current = config.params;

  // 聊天提示词块一键填入：只写文本 + 切模式并收起浮层，不自动提交。
  // 宿主可能同时挂着一个隐藏的图像生成页，只有用户看得见的这一份才取走请求。
  useEffect(() => {
    if (!handedOff) return undefined;
    return claimPrefillWhenVisible(handedOff, {
      isVisible: () => isElementShown(promptRef.current),
      onClaim: (request) => {
        setPrompt(request.prompt);
        setUserPromptSuffix(request.prompt);
        userPromptSuffixRef.current = request.prompt;
        setMode(request.kind === 'video' ? 'video' : 'image');
        closePopovers();
      },
    });
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

  // 图像素材签名：推导必须且只能随素材增减触发，
  // 把生成方式标签列入依赖会让推导结果被标签状态回弹（缺陷回归）。
  const imageBucketsDependencyKey = useMemo(() => {
    if (mode !== 'image') return '';
    const prefix = makeBucketKey('image', model?.id, '');
    return Object.entries(buckets)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => `${k}:${Array.isArray(v) ? v.map((item) => item?.id ?? item?.name ?? item?.url).join(',') : (v ? '1' : '0')}`)
      .sort()
      .join('|');
  }, [mode, model?.id, buckets]);

  // 契约驱动当前选中的操作 ID：图像由实际放入的素材数量推导（已取消手选生成方式），视频沿用页签。
  // 只随素材签名重算，不订阅任何生成方式标签，避免推导结果被手选状态回弹。
  const currentOperationId = useMemo(() => {
    if (mode === 'video') return videoModeId;
    const prefix = makeBucketKey('image', model?.id, '');
    const scopedImageBuckets = Object.fromEntries(
      Object.entries(bucketsRef.current || {}).filter(([key]) => key.startsWith(prefix))
    );
    return deriveAdaptiveOperation(model, 'image', scopedImageBuckets)?.id ?? 'text_to_image';
  }, [mode, videoModeId, model, imageBucketsDependencyKey]);

  const slots = useMemo(
    () => slotPlan(model, mode, currentOperationId),
    [model, mode, currentOperationId]
  );

  useEffect(() => {
    if (mode !== 'video' || videoChoices.length === 0) return;
    const hasMultiRef = videoChoices.some((option) => option.id === 'video_multi_ref');
    if (hasMultiRef && videoModeId === 'text_to_video') {
      // 文生页签已并入参考：初始/残余 text_to_video 状态吸附到全能参考，
      // 空素材提交时由推导回落 text_to_video，用户无感。
      const refOpt = videoChoices.find((option) => option.id === 'video_multi_ref');
      setVideoGenMode(refOpt.label);
      return;
    }
    if (!videoChoices.some((option) => option.id === videoModeId)) {
      setVideoGenMode(videoChoices[0].label);
    }
  }, [mode, videoChoices, videoModeId, setVideoGenMode]);

  const opModeTabs = useMemo(() => {
    const modelOps = operationsOf(model, mode);
    if (!modelOps || modelOps.length === 0) return [];

    if (mode === 'video') {
      const tabs = [];
      // 1. 全能参考 / 参考图：基于执行中枢 video_multi_ref 动态识别
      if (modelOps.some((op) => op.id === 'video_multi_ref')) {
        tabs.push({
          id: 'ref',
          label: '参考',
          icon: ICONS_MODE.ref,
          active: videoModeId === 'video_multi_ref',
          onClick: () => setVideoGenMode('全能参考'),
        });
      }
      // 2. 首帧 / 首尾帧：基于执行中枢 first_frame 或 first_last_frame 动态识别
      if (modelOps.some((op) => op.id === 'first_frame' || op.id === 'first_last_frame')) {
        const hasDouble = modelOps.some((op) => op.id === 'first_last_frame');
        tabs.push({
          id: 'frames',
          label: hasDouble ? '首帧/首尾帧' : '首帧',
          icon: ICONS_MODE.frames,
          active: videoModeId === 'first_frame' || videoModeId === 'first_last_frame',
          onClick: () => setVideoGenMode(hasDouble ? '首尾帧' : '首帧'),
        });
      }
      // 3. 视频编辑：基于执行中枢 video_edit 动态识别
      if (modelOps.some((op) => op.id === 'video_edit')) {
        tabs.push({
          id: 'edit',
          label: '编辑',
          icon: ICONS_MODE.edit,
          active: videoModeId === 'video_edit',
          onClick: () => setVideoGenMode('视频编辑'),
        });
      }
      // 文生视频基准页签：仅当模型没有 video_multi_ref 契约时才需要单列——
      // 同上游接口（/v1/videos/generations），空素材的参考模式即文生，
      // 具备全能参考时参考页签已覆盖文生路径，单列会造成两入口同果。
      const hasMultiRef = modelOps.some((op) => op.id === 'video_multi_ref');
      if (modelOps.some((op) => op.id === 'text_to_video') && !hasMultiRef) {
        tabs.unshift({
          id: 'text',
          label: '文生视频',
          icon: ICONS_MODE.text,
          active: videoModeId === 'text_to_video',
          onClick: () => setVideoGenMode('文生视频'),
        });
      }
      // 页签只剩 1 个时没有切换价值，隐藏整行避免死开关。
      return tabs.length > 1 ? tabs : [];
    }

    // 图像模式已取消手选生成方式：生成方式由实际放入的素材数量自动推导，不再渲染页签行。
    return [];
  }, [model, mode, videoModeId, setVideoGenMode]);

  const bucketKey = useCallback(
    (slot) => makeBucketKey(mode, model?.id, slot?.key),
    [mode, model?.id]
  );

  // 契约组合规则（inputGroups）：组内必需素材未放入时，组外卡槽不可单独添加。
  const slotOperation = useMemo(
    () => activeOperation(model, mode, currentOperationId),
    [model, mode, currentOperationId]
  );
  const slotLockReason = useCallback(
    (slot, sourceBuckets = bucketsRef.current, keyOf = bucketKey, opSlots = slots, op = slotOperation) =>
      groupLockOf(op, slot, opSlots, (member) => (sourceBuckets || {})[keyOf(member)] || []),
    [bucketKey, slots, slotOperation]
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

  // 自适应收敛模式（仅随素材增减运行；不订阅 videoGenMode，避免手动切换被回弹）
  useEffect(() => {
    if (mode !== 'video' || !model) return;
    const prefix = makeBucketKey('video', model?.id, '');
    const scopedVideoBuckets = Object.fromEntries(
      Object.entries(bucketsRef.current).filter(([k]) => k.startsWith(prefix))
    );
    const adaptiveOp = deriveAdaptiveOperation(model, 'video', scopedVideoBuckets, videoModeId);
    if (adaptiveOp) {
      const matchOpt = VIDEO_MODE_OPTIONS.find((opt) => opt.id === adaptiveOp.id);
      if (matchOpt && matchOpt.label !== videoGenMode) {
        setVideoGenMode(matchOpt.label);
      }
    }
  }, [mode, model, videoBucketsDependencyKey, setVideoGenMode]);

  // 图像生成方式与素材卡槽消费端自适应算法：
  // 空卡槽 -> 文生图；单图 -> 图片编辑（无则参考类）；多图 -> 参考类。
  // 仅在素材签名变化时推导展示标签；已取消手选，推导结果只同步给展示层。
  useEffect(() => {
    if (mode !== 'image' || !model) return;
    const prefix = makeBucketKey('image', model?.id, '');
    const scopedImageBuckets = Object.fromEntries(
      Object.entries(bucketsRef.current).filter(([k]) => k.startsWith(prefix))
    );
    const adaptiveOp = deriveAdaptiveOperation(model, 'image', scopedImageBuckets);
    if (adaptiveOp) {
      const targetLabel = imageOpDisplayLabel(adaptiveOp);
      if (config.imageOpMode !== targetLabel) {
        config.setImageOpMode(targetLabel);
      }
    }
  }, [mode, model, imageBucketsDependencyKey, config.setImageOpMode]);

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

    const key = bucketKey(activeSlot);
    const currentList = bucketsRef.current[key] || [];

    const lock = slotLockReason(activeSlot);
    if (lock) {
      setNotice(lock);
      return false;
    }

    const sizedFile = Number.isFinite(sizeOf(asset)) ? { ...pseudoFile, size: sizeOf(asset) } : pseudoFile;
    const reason = rejectionOf(sizedFile, activeSlot, duration, { existing: currentList });
    if (reason) {
      setNotice(reason);
      return false;
    }
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
        [key]: [...list, {
          ...asset,
          id: itemId,
          isLocalUpload,
          markBadge: activeSlot.label || undefined,
          ...(Number.isFinite(duration) ? { durationSec: duration } : {}),
        }],
      };
    });
    setNotice(`素材 [${asset.title || asset.name}] 已入槽`);
    return true;
  }, [disabled, slots, targetSlot, bucketKey, setNotice, slotLockReason]);

  // 粘贴图片/视频/音频进素材卡槽：优先当前操作能装的卡槽；
  // 装不下时按 deriveAdaptiveOperation 推导适配操作（单图→编辑、多图→参考）后重试。
  const handlePasteFiles = useCallback(async (files) => {
    if (disabled || !model || !files?.length) return;
    const mediaFiles = [...files].filter((file) => /^(image|video|audio)\//.test(file?.type || ''));
    if (mediaFiles.length === 0) return;

    // 贴素材按主导类型分模态：视频/音频 → 视频模式，纯图片 → 图像模式。
    // 直接用目标模态算 bucketKey，不走 mode 变量（setMode 后当前 render 的 mode 仍是旧值）。
    const hasVideoOrAudio = mediaFiles.some((f) => /^(video|audio)\//.test(f.type || ''));
    const hasImage = mediaFiles.some((f) => /^image\//.test(f.type || ''));
    const intendedMode = hasVideoOrAudio && !hasImage ? 'video' : (hasImage && !hasVideoOrAudio ? 'image' : mode);
    const effectiveBucketKey = (slot) => makeBucketKey(intendedMode, model?.id, slot?.key);
    // 目标模态必须真的存在可容纳该媒体类型的卡槽才切换；否则不切，让原模式照常提示。
    const effectiveSlots = mode === intendedMode
      ? slots
      : slotPlan(model, intendedMode).filter((slot) =>
          mediaFiles.some((f) => (f.type || '').split('/')[0] === slot.type));
    const effectiveMode = effectiveSlots.length > 0 ? intendedMode : mode;
    const tryAdd = async (slot, file, existing, op = null, opSlots = null) => {
      const key = effectiveBucketKey(slot);
      const list = existing[key] || [];
      const lock = groupLockOf(
        op || activeOperation(model, effectiveMode, effectiveMode === mode ? currentOperationId : undefined),
        slot,
        opSlots || effectiveSlots,
        (member) => existing[effectiveBucketKey(member)] || [],
      );
      if (lock) return lock;
      const room = slot.max == null ? Infinity : slot.max;
      if (list.length >= room) return 'full';
      const needsDuration = slot.durationMax != null && (slot.type === 'video' || slot.type === 'audio');
      const duration = needsDuration ? await readDuration(file) : null;
      if (needsDuration && !Number.isFinite(duration)) return '这个文件读不出来';
      const reason = rejectionOf(file, slot, duration, { existing: list });
      if (reason) return reason;
      existing[key] = [...list, {
        id: `paste-${Date.now()}-${list.length}-${file.name || 'clip'}`,
        name: file.name || `粘贴${slot.type === 'video' ? '视频' : '图片'}`,
        type: file.type,
        url: URL.createObjectURL(file),
        file,
        isLocalUpload: true,
        ...(Number.isFinite(duration) ? { durationSec: duration } : {}),
      }];
      return 'ok';
    };

    if (mode !== effectiveMode) setMode(effectiveMode);

    const nextBuckets = { ...(bucketsRef.current || {}) };
    const accepted = [];
    const rejected = [];

    // 组合规则下音频常依赖图/视频先入槽：同批粘贴时音频排在最后。
    const orderedFiles = [...mediaFiles].sort((a, b) =>
      Number(/^audio\//.test(a.type || '')) - Number(/^audio\//.test(b.type || '')));
    for (const file of orderedFiles) {
      const mediaType = (file.type || '').split('/')[0];
      // 1) 当前（目标）操作 slots 里按类型+容量找首个可用卡槽
      let target = (effectiveSlots || []).find((s) => s.type === mediaType && ((nextBuckets[effectiveBucketKey(s)] || []).length < (s.max == null ? Infinity : s.max)));
      let outcome = 'no-slot';
      if (target) outcome = await tryAdd(target, file, nextBuckets);
      if (outcome === 'ok') { accepted.push(file); continue; }
      rejected.push({ file, reason: outcome === 'full' ? 'full' : outcome });
    }

    // 2) 目标操作装不下的媒体文件：按素材推导适配操作，用其正式卡槽再匹配一次。
    // 必须用 slotPlan 取正式归一化卡槽（reference/first_frame 等），不能手造虚拟 key，
    // 否则粘贴物落进不渲染的 bucket——界面看不到但占着位。
    if (rejected.length > 0) {
      const scopedPrefix = makeBucketKey(effectiveMode, model?.id, '');
      const scoped = Object.fromEntries(
        Object.entries(nextBuckets).filter(([k]) => k.startsWith(scopedPrefix))
      );
      const adaptiveOp = deriveAdaptiveOperation(model, effectiveMode, scoped, currentOperationId);
      const candidateOps = [...new Set([adaptiveOp, ...(operationsOf(model, effectiveMode) || [])].filter(Boolean))];
      const stillRejected = [];
      for (const { file, reason: firstReason } of rejected) {
        const mediaType = (file.type || '').split('/')[0];
        let placed = false;
        for (const op of candidateOps) {
          if (placed) break;
          const allOpSlots = slotPlan(model, effectiveMode, op.id);
          const opSlots = allOpSlots.filter((s) => s.type === mediaType);
          for (const slot of opSlots) {
            if (placed) break;
            const outcome = await tryAdd(slot, file, nextBuckets, op, allOpSlots);
            if (outcome !== 'ok') continue;
            accepted.push(file);
            placed = true;
            // 粘贴落位后同步展示层操作标签（image_to_image / inpaint_outpaint 也归一为参考类文案）
            if (effectiveMode === 'image') {
              const label = imageOpDisplayLabel(op);
              if (label && label !== config.imageOpMode) config.setImageOpMode?.(label);
            } else {
              const opt = VIDEO_MODE_OPTIONS.find((o) => o.id === op.id);
              if (opt && opt.label !== videoGenMode) setVideoGenMode?.(opt.label);
            }
          }
        }
        if (!placed) stillRejected.push({ file, reason: firstReason });
      }
      rejected.length = 0;
      rejected.push(...stillRejected);
    }

    if (accepted.length > 0) {
      setBuckets(nextBuckets);
      const extra = rejected.length > 0 ? `，${rejected.length} 项未入槽` : '';
      setNotice(`已粘贴 ${accepted.length} 项素材${extra}`);
    } else {
      // 满载识别：首轮已有 'full'，或所有可用卡槽都已达到上限（不再误报“不支持”）
      const slotFull = effectiveSlots && effectiveSlots.length > 0 && effectiveSlots.every((s) => ((nextBuckets[effectiveBucketKey(s)] || []).length >= (s.max == null ? Infinity : s.max)));
      const anyFull = rejected.some((r) => r.reason === 'full') || slotFull;
      const firstReason = rejected.find((r) => typeof r.reason === 'string' && r.reason !== 'full' && r.reason !== 'no-slot')?.reason;
      setNotice(anyFull ? '卡槽已满，无法再添加素材' : (firstReason || '当前生成方式不支持粘贴该类型素材'));
    }
  }, [disabled, model, slots, mode, videoGenMode, currentOperationId, config, bucketKey, setVideoGenMode, setMode, setNotice]);

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
    if (!trimmed || disabled || submittingRef.current) return;
    closePopovers();
    setPickerOpen(false);

    const scopedPrefix = makeBucketKey(mode, model?.id, '');
    const scopedBuckets = Object.fromEntries(
      Object.entries(bucketsRef.current).filter(([key]) => key.startsWith(scopedPrefix))
    );
    let activeOp = activeOperation(model, mode, currentOperationId) || deriveAdaptiveOperation(model, mode, scopedBuckets);

    // 参考页签空素材 = 文生视频（同上游接口按参数区分）：
    // 停留在 multi_ref 且无素材时回退 text_to_video，而非按参考拦空请求。
    if (mode === 'video' && currentOperationId === 'video_multi_ref') {
      const hasAnyMaterial = Object.values(scopedBuckets).some((val) => Array.isArray(val) && val.length > 0);
      if (!hasAnyMaterial) {
        const textOp = (operationsOf(model, 'video') || []).find((op) => op.id === 'text_to_video');
        if (textOp) activeOp = textOp;
      }
    }

    // 首尾帧模式允许单首帧常驻，但提交时若仅首帧或仅尾帧，需按实际素材降级为合法操作（Issue #3045）
    if (mode === 'video' && (currentOperationId === 'first_last_frame' || activeOp?.id === 'first_last_frame')) {
      const videoOps = operationsOf(model, 'video') || [];
      const hasFirst = Object.entries(scopedBuckets).some(([k, v]) => {
        const slotKey = extractSlotKeyFromBucketKey(k).toLowerCase();
        return (slotKey.includes('first_frame') || slotKey.includes('firstframe')) && Array.isArray(v) && v.length > 0;
      });
      const hasLast = Object.entries(scopedBuckets).some(([k, v]) => {
        const slotKey = extractSlotKeyFromBucketKey(k).toLowerCase();
        return (slotKey.includes('last_frame') || slotKey.includes('lastframe')) && Array.isArray(v) && v.length > 0;
      });
      if (hasFirst && !hasLast) {
        const ffOp = videoOps.find((op) => op.id === 'first_frame');
        activeOp = ffOp || videoOps.find((op) => op.id === 'text_to_video') || activeOp;
      } else if (!hasFirst && hasLast) {
        const textOp = videoOps.find((op) => op.id === 'text_to_video');
        activeOp = textOp || activeOp;
      } else if (!hasFirst && !hasLast) {
        const textOp = videoOps.find((op) => op.id === 'text_to_video');
        activeOp = textOp || activeOp;
      }
    }

    // 视频：文生视频是纯文本操作，素材不随请求发出（保持既有语义）。
    const isVideoTextOnly = mode === 'video' && activeOp?.id === 'text_to_video';
    const submitSlots = slotPlan(model, mode, activeOp?.id);
    const opInputs = activeOp?.inputs || [];

    // 图像模式：契约里没有任何接受媒体输入的操作时，已放入的素材不可能被消费，
    // 必须显式提示并阻断，严禁静默丢弃后仍按文生图出图。
    const imageAttachedCount = mode === 'image'
      ? Object.values(scopedBuckets).reduce((sum, items) => (
        sum + (Array.isArray(items) ? items.filter((item) => !item?.type || item.type === 'image').length : 0)
      ), 0)
      : 0;
    const imageContractAcceptsMedia = operationsOf(model, 'image').some((op) => (op?.inputs || []).some(
      (input) => input && input.type !== 'text' && input.role !== 'prompt'
    ));
    if (mode === 'image' && imageAttachedCount > 0 && !imageContractAcceptsMedia) {
      setNotice('当前模型不支持参考图，请更换支持参考图的模型或移除素材');
      return;
    }

    // 若当前模型操作不支持参考图且槽位为 guidedOnly：只要存在素材项（无论是否有打点），阻断提交并提示，严禁静默丢弃！
    const hasUnsupportedGuidedWithItems = !isVideoTextOnly && submitSlots.some((slot) => {
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

    const assets = isVideoTextOnly ? [] : submitSlots.flatMap((slot) => {
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
      const allowedMax = (slot.max != null && Number.isFinite(slot.max)) ? slot.max : Infinity;
      const validItems = items.slice(0, allowedMax);
      return validItems.map((item) => ({
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
    // 服务端只认可消费的地址，不能按 assetId 解析素材（normalize 遇无 URL 行会静默丢弃）。
    // 因此仅本地 File（提交前物化成 data URL）可豁免地址校验；assetId 不能豁免，
    // 否则「有 assetId 无 URL」的参考行会被服务端无声吃掉——参考图被忽略且无任何报错。
    const hasInvalidFragment = assets.some((a) => {
      if (a.file) return false;
      const url = String(a.url || '');
      return !isAllowedReferenceUrl(a.url) || url.startsWith('blob:');
    });
    if (hasInvalidFragment) {
      setNotice('参考素材地址无效，请重新选择');
      return;
    }

    // 推导出的操作确实要求素材（契约 min≥1）而卡槽为空时才拦空载荷：
    // 图像按素材数量推导，空素材必落到文生图，正常不可达；视频保留原有前置拦截。
    const derivedOpRequiresMaterial = mode === 'video' || (activeOp?.inputs || []).some((input) =>
      input && input.type !== 'text' && input.role !== 'prompt' && Number.isFinite(input.min) && input.min >= 1);
    if (!isVideoTextOnly && derivedOpRequiresMaterial && assets.length === 0) {
      setNotice('请先在卡槽放入素材');
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

    submittingRef.current = true;
    const submission = onDirectSubmit?.({
      onAccepted: () => {
        submittingRef.current = false;
        if (currentDraftRef.current !== prompt) return;
        setPrompt('');
        setUserPromptSuffix('');
        userPromptSuffixRef.current = '';
      },
      onRejected: () => { submittingRef.current = false; },
      prompt: synthesizedPrompt,
      rawPrompt: trimmed,
      kind: mode,
      operation: activeOp?.id,
      activeOperation: activeOp,
      model: model?.id,
      channel: config.channel?.id,
      params: paramsRef.current,
      assets,
      annotations: annotationsPayload,
    });
    Promise.resolve(submission).finally(() => { submittingRef.current = false; });
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
    currentOperationId,
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

      {/* 2. 输入框主卡片容器（捕获粘贴图片/视频/音频进素材卡槽；文本照常走原生粘贴） */}
      <div
        className="omx-mv-composer-root"
        onPaste={(event) => {
          const files = [...(event.clipboardData?.files || [])].filter((f) => /^(image|video|audio)\//.test(f?.type || ''));
          if (files.length === 0) return;
          event.preventDefault();
          handlePasteFiles(files);
        }}
      >
        {/* 选择参考浮层面板（正上方 8px 弹出） */}
        <ReferencePickerPopover
          open={pickerOpen}
          targetSlot={targetSlot}
          onClose={handleClosePicker}
          onSelectAsset={handleSelectAsset}
          onError={setNotice}
        />

        {notice ? <div className="omx-slot-notice" role="status">{notice}</div> : null}

        {/* 输入框内侧顶栏：生成方式选项卡（素材卡槽上方）。图像模式已取消手选，无页签时不渲染整行 */}
        {opModeTabs.length > 0 && (
          <div className="omx-composer-header-row">
            <div className="omx-slot-modes" role="tablist" aria-label="生成方式">
              {opModeTabs.map((tab) => (
                <button // exempt-ui01: 模式切换单项
                  key={tab.id}
                  type="button"
                  role="tab"
                  className={`omx-slot-mode${tab.active ? ' is-active' : ''}`}
                  aria-pressed={tab.active}
                  onClick={tab.onClick}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 提示词与素材卡槽上下分层自适应排布 */}
        <div className="omx-mv-prompt-row">
          {slots.length > 0 && (
            (mode === 'image') ||
            (mode === 'image' && config.imageOpMode !== '文生图') ||
            (mode === 'video' && videoModeId !== 'text_to_video') ||
            slots.some((s) => (buckets[bucketKey(s)] ?? []).length > 0)
          ) ? (
            <div className="omx-slot-row">
              {visibleSlots(slots, slotOperation, (member) => (buckets || {})[bucketKey(member)] || []).map((slot, index, shown) => {
                const slotItems = buckets[bucketKey(slot)] ?? [];
                const prevSlot = shown[index - 1];
                const nextSlot = shown[index + 1];
                const nextItems = nextSlot ? (buckets[bucketKey(nextSlot)] ?? []) : [];
                // 首帧槽后紧跟尾帧槽才算成对；单首帧/单尾帧方式保持原样
                const pairedFirst = slot.role === 'first_frame' && nextSlot?.role === 'last_frame';
                const pairedLast = slot.role === 'last_frame' && prevSlot?.role === 'first_frame';
                let framePair = null;
                if (pairedFirst) {
                  framePair = 'first';
                } else if (pairedLast) {
                  framePair = 'last';
                }
                // 成对两槽均空时，在两卡之间插入纯装饰换向分隔箭头
                const showFrameSwap = pairedFirst && slotItems.length === 0 && nextItems.length === 0;
                return (
                  <React.Fragment key={bucketKey(slot)}>
                    <MediaSlotGroup
                  framePair={framePair}
                  slot={slot}
                  items={slotItems}
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
                  lockReason={slotLockReason(slot, buckets)}
                    />
                    {showFrameSwap ? (
                      <span className="omx-slot-swap" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 3 4 7l4 4" />
                          <path d="M4 7h16" />
                          <path d="m16 21 4-4-4-4" />
                          <path d="M20 17H4" />
                        </svg>
                      </span>
                    ) : null}
                  </React.Fragment>
                );
              })}
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

        {/* 3. 底部操作工具栏 (单行流不折行：移除内部模式切换与生成方式，仅保留模型与纯参数展示 ──► 发送) */}
        <div className="omx-mv-toolbar-bar">
          <div className="omx-mv-toolbar-left">
            <MediaConfigControls config={config} showModeSwitch={false} showOpMode={false} />
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
