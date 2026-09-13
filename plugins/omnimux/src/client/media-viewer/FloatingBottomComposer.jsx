import React, { useState } from 'react';

/**
 * FloatingBottomComposer
 * Floating bottom input bar for 2-column mode, matching Screenshot 2.
 *
 * @param {{
 *   refThumbUrl?: string,
 *   elapsedText?: string,
 *   modelName?: string,
 *   onSubmit?: (text: string) => void,
 *   hidden?: boolean,
 * }} props
 */
export function FloatingBottomComposer({
  refThumbUrl = '',
  elapsedText = '用时 2m 11s',
  modelName = 'GPT-6 Astra 中',
  onSubmit,
  hidden = false,
}) {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (!text.trim()) return;
    onSubmit?.(text);
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`omx-mv-composer ${hidden ? 'hidden' : ''}`}>
      <div className="omx-mv-composer__elapsed">
        <span>{elapsedText}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>

      <div className="omx-mv-composer__body">
        {refThumbUrl ? (
          <div className="omx-mv-composer__thumb">
            <img
              src={refThumbUrl}
              alt="参考图"
              className="omx-mv-composer__thumb-img"
            />
          </div>
        ) : null}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="随心输入…"
          rows={1}
          className="omx-mv-composer__textarea"
        />
      </div>

      <div className="omx-mv-composer__bottom">
        <div className="omx-mv-composer__bottom-left">
          <button // exempt-ui01: 侧栏底部输入框附件操作按钮
            type="button"
            className="omx-chat-media-tail__btn"
            title="添加素材附件"
            aria-label="添加素材附件"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <div className="omx-mv-composer__perm-pill">
            完全访问
          </div>
        </div>

        <div className="omx-mv-composer__bottom-right">
          <div className="omx-mv-composer__model-pill">
            {modelName}
          </div>
          <button // exempt-ui01: 侧栏底部输入框语音按钮
            type="button"
            className="omx-chat-media-tail__btn"
            title="语音输入"
            aria-label="语音输入"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </button>
          <button // exempt-ui01: 侧栏底部输入框发送按钮
            type="button"
            onClick={handleSend}
            title="发送指令"
            aria-label="发送指令"
            className="omx-mv-composer__send-btn"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
