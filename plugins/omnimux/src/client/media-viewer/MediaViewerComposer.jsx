import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { MediaConfigControls, useMediaGenerationConfig } from './MediaConfigControls.jsx';
import { peekComposerPrefill, subscribeComposerPrefill, takeComposerPrefill } from './composer-prefill.js';

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
  refThumbnails = [],
}) {
  // 提示词输入框默认空。聊天里的提示词块点「使用提示词生成」后填入一次，不自动发送。
  const handedOff = useSyncExternalStore(subscribeComposerPrefill, peekComposerPrefill, () => null);
  const [prompt, setPrompt] = useState('');
  const config = useMediaGenerationConfig({ initialMode });
  // 先解构出被 effect / 回调读取的方法再依赖：将来宿主换了实现也不会读到过期闭包。
  const { mode, setMode, closePopovers } = config;

  // 聊天提示词块一键填入：只写文本 + 切模式并收起浮层，不自动提交。
  useEffect(() => {
    if (!handedOff) return;
    const request = takeComposerPrefill(handedOff.token);
    if (!request) return;
    setPrompt(request.prompt);
    setMode(request.kind === 'video' ? 'video' : 'image');
    closePopovers();
  }, [handedOff, setMode, closePopovers]);

  const handleSend = () => {
    const trimmed = prompt.trim();
    if (!trimmed || disabled) return;
    // 提交后收起还开着的浮层（模型级联 / 参数面板），与抽取共享控件前一致。
    closePopovers();
    setPrompt(''); // 提交后立即清空输入框

    onDirectSubmit?.({
      prompt: trimmed,
      kind: mode,
      model: config.model?.id,
      channel: config.channel?.id,
      params: config.params,
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
      {/* 1. 顶部参考素材缩略图 (仅在有真实参考图时渲染，绝不使用死假图) */}
      {refThumbnails && refThumbnails.length > 0 ? (
        <div className="omx-mv-ref-row">
          {refThumbnails.map((item, idx) => (
            <div key={item.id || idx} className="omx-mv-ref-thumb" title={item.title || `参考图 ${idx + 1}`}>
              <img src={item.url} alt={item.title || '参考图'} />
              <span className="omx-mv-ref-tag">@{item.label || `Image ${idx + 1}`}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* 2. 提示词输入区域 (默认空，随心输入) */}
      <div className="omx-mv-prompt-box">
        <textarea // exempt-ui01: 专用多模态提示词输入框
          className="omx-mv-prompt-textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="随心输入画面提示词，支持回车立即直连生成…"
          rows={2}
          disabled={disabled}
        />
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
