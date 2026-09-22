import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MediaConfigControls, useMediaGenerationConfig } from './MediaConfigControls.jsx';
import { MediaSlotGroup } from './MediaSlotGroup.jsx';
import { peekComposerPrefill, subscribeComposerPrefill, takeComposerPrefill } from './composer-prefill.js';
import { clampPromptTextareaHeight } from './prompt-textarea-height.js';
import { VIDEO_MODE_OPTIONS, operationsOf, slotPlan } from './media-slot.js';

const VIDEO_MODE_IDS = {
  文生视频: 'text_to_video',
  首帧: 'first_frame',
  首尾帧: 'first_last_frame',
  全能参考: 'video_multi_ref',
  视频编辑: 'video_edit',
};

/**
 * 图像/视频生成专用输入面板 (MediaViewerComposer)
 *
 * 1. 彻底清除死数据：Prompt 默认空，无真实素材不占位；
 * 2. 动态接通执行中枢模型目录 (/omnimux/model-catalog)；
 * 3. 按钮排布：【生成方式】 ｜ 【模型】 ｜ 【参数展示】 ──► 【直连提交】；
 * 4. 1:1 复刻画布节点三级级联与参数配置面板。
 *
 * 「生成方式 / 模型 / 参数」三件套的**实现已抽到 `MediaConfigControls.jsx`**，
 * 与输入框下方的快捷方式共用同一份状态机与同一套面板（DOM 与类名保持不变），
 * 本组件只负责提示词区、提交动作与右侧发送按钮。
 */
export function MediaViewerComposer({
  onDirectSubmit,
  initialMode = 'image',
  disabled = false,
}) {
  // 提示词输入框默认空。聊天里的提示词块点「使用提示词生成」后填入一次，不自动发送。
  const handedOff = useSyncExternalStore(subscribeComposerPrefill, peekComposerPrefill, () => null);
  const [prompt, setPrompt] = useState('');
  const [buckets, setBuckets] = useState({});
  const [notice, setNotice] = useState('');
  const promptRef = useRef(null);
  const promptBoxRef = useRef(null);
  const config = useMediaGenerationConfig({ initialMode });
  // 先解构出被 effect / 回调读取的方法再依赖：将来宿主换了实现也不会读到过期闭包。
  const { mode, setMode, closePopovers, model, videoGenMode, setVideoGenMode } = config;

  // 聊天提示词块一键填入：只写文本 + 切模式并收起浮层，不自动提交。
  useEffect(() => {
    if (!handedOff) return;
    const request = takeComposerPrefill(handedOff.token);
    if (!request) return;
    setPrompt(request.prompt);
    setMode(request.kind === 'video' ? 'video' : 'image');
    closePopovers();
  }, [handedOff, setMode, closePopovers]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 2400);
    return () => clearTimeout(timer);
  }, [notice]);

  const videoModeId = VIDEO_MODE_IDS[videoGenMode] ?? 'text_to_video';
  const videoChoices = VIDEO_MODE_OPTIONS.filter((option) => (
    operationsOf(model, 'video').some((operation) => operation.id === option.id)
  ));
  const slots = slotPlan(model, mode, videoModeId);

  useEffect(() => {
    if (mode !== 'video' || videoChoices.length === 0) return;
    if (!videoChoices.some((option) => option.id === videoModeId)) {
      setVideoGenMode(videoChoices[0].label);
    }
  }, [mode, videoChoices, videoModeId, setVideoGenMode]);

  const bucketKey = (slot) => `${mode}:${model?.id ?? ''}:${slot.key}`;

  // 按内容行数变高，最多露出 10 行；再多的字在框里滚动。
  // 文字变了要重算。窗口或侧栏把外层挤窄、拉宽、折行变了，也要重算。
  // 只听外层宽度：听输入框自己会被「量高 → 变高」再次触发，来回抖。
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

  const handleSend = () => {
    const trimmed = prompt.trim();
    if (!trimmed || disabled) return;
    // 提交后收起还开着的浮层（模型级联 / 参数面板），与抽取共享控件前一致。
    closePopovers();
    const assets = slots.flatMap((slot) => (buckets[bucketKey(slot)] ?? []).map((item) => ({
      slot: slot.slot,
      type: slot.type,
      role: slot.role,
      name: item.name,
      file: item.file,
    })));
    setPrompt(''); // 提交后立即清空输入框

    onDirectSubmit?.({
      prompt: trimmed,
      kind: mode,
      model: model?.id,
      channel: config.channel?.id,
      params: config.params,
      assets,
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="omx-mv-composer-root">
      {notice ? <div className="omx-slot-notice" role="status">{notice}</div> : null}

      {mode === 'video' && videoChoices.length > 0 ? (
        <div className="omx-slot-modes" role="tablist" aria-label="视频生成模式">
          {videoChoices.map((option) => (
            <button // exempt-ui01: 与输入框胶囊同一行的模式切换，高度 32px
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

      {/* 提示词与素材卡槽同一行。没有契约槽位时只留输入框，不放占位图。 */}
      <div className="omx-mv-prompt-row">
        {slots.length > 0 ? (
          <div className="omx-slot-row">
            {slots.map((slot) => (
              <MediaSlotGroup
                key={bucketKey(slot)}
                slot={slot}
                items={buckets[bucketKey(slot)] ?? []}
                disabled={disabled}
                onChange={(items) => setBuckets((prev) => ({ ...prev, [bucketKey(slot)]: items }))}
                onReject={setNotice}
              />
            ))}
          </div>
        ) : null}
        <div className="omx-mv-prompt-box" ref={promptBoxRef}>
          <textarea // exempt-ui01: 专用多模态提示词输入框
            ref={promptRef}
            className="omx-mv-prompt-textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'image'
              ? '描述你想生成或修改的内容；如已上传参考图，可输入 @ 引用'
              : '描述视频画面内容和动态过程，使用 @ 指定参考图或参考视频'}
            rows={2}
            disabled={disabled}
          />
        </div>
      </div>

      {/* 3. 底部操作工具栏 (单行流不折行：生成方式 ｜ 模型 ｜ 参数展示 ──► 发送) */}
      <div className="omx-mv-toolbar-bar">
        <div className="omx-mv-toolbar-left">
          <MediaConfigControls config={config} showModeSwitch />
        </div>

        {/* 右侧：纯黑白 Ink CTA 主发送按钮 */}
        <div className="omx-mv-toolbar-right">
          <button // exempt-ui01: 纯黑白主发送按钮
            type="button"
            className="omx-send-cta-btn"
            onClick={handleSend}
            disabled={disabled || !prompt.trim()}
            title="立即直连生成 (Enter)"
            aria-label="立即直连生成"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default MediaViewerComposer;
