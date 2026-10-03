/**
 * 「优化提示词」图标按钮的样式。
 *
 * 与仓库既有做法一致：样式集中在本模块样式表，JSX 零内联业务样式
 * （design.md UI02）；色彩一律取官方 `--dsw-alias-*` token，不新造色值。
 *
 * 形态：32×32 幽灵图标按钮（design.md §5.3 Ghost / IconButton），
 * 圆角 8px，悬停提亮文字色 + 浅底，按压缩放微动效。
 * 运行态把 sparkles 图标换成旋转圆环（同一枚 SVG，只换路径），
 * 禁重入靠按钮 disabled 表达，不加任何文字或徽标（文案白名单红线）。
 */

export const PROMPT_OPTIMIZER_STYLE_ID = 'omnimux-prompt-optimizer-style'

export const PROMPT_OPTIMIZER_CSS = `
/* 包裹层只承担悬停提示：disabled 按钮不派发事件，title 挂在外层才可见。 */
.omx-optimize-seat {
  display: inline-flex;
  flex: none;
}

.omx-optimize-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease,
    transform 120ms cubic-bezier(0.16, 1, 0.3, 1);
  flex: none;
}

.omx-optimize-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.omx-optimize-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.omx-optimize-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}

.omx-optimize-btn:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}

.omx-optimize-btn svg {
  flex: none;
  display: block;
}

.omx-optimize-spinner {
  animation: omx-optimize-spin 0.8s linear infinite;
}

@keyframes omx-optimize-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .omx-optimize-spinner { animation: none; }
}

/* 失败轻提示的浮层定位：正文用既有 .omx-quick-shortcut-notice（通知 JSX 与样式类
   只有一份，不自造第二套），这里只包一层定位壳把提示悬在输入框上方。 */
.omx-optimize-notice-float {
  position: fixed;
  left: 50%;
  bottom: 96px;
  transform: translateX(-50%);
  z-index: 2147482000;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-elevated);
  box-shadow: 0 10px 28px var(--dsw-alias-bg-mask-1);
  pointer-events: none;
}

.omx-optimize-notice-float .omx-quick-shortcut-notice {
  flex-basis: auto;
  color: var(--dsw-alias-label-primary);
}
`;

/**
 * 幂等注入样式表。
 * @param {Document | null} [doc]
 * @returns {HTMLStyleElement | null} 样式节点；不取得生命周期租约
 */
export function ensurePromptOptimizerStyles(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || !doc.head) return null
  let style = doc.getElementById(PROMPT_OPTIMIZER_STYLE_ID)
  if (!style) {
    style = doc.createElement('style')
    style.id = PROMPT_OPTIMIZER_STYLE_ID
    doc.head.appendChild(style)
  }
  if (style.textContent !== PROMPT_OPTIMIZER_CSS) style.textContent = PROMPT_OPTIMIZER_CSS
  return style
}

/** 每个挂载实例持一份租约，归零时移除样式节点。 */
export function acquirePromptOptimizerStyles(doc = typeof document !== 'undefined' ? document : null) {
  const style = ensurePromptOptimizerStyles(doc)
  if (!style?.getAttribute) return () => {}
  const count = Number(style.getAttribute('data-users')) || 0
  style.setAttribute('data-users', String(count + 1))
  let released = false
  return () => {
    if (released) return
    released = true
    const remaining = Math.max(0, (Number(style.getAttribute('data-users')) || 1) - 1)
    if (remaining) style.setAttribute('data-users', String(remaining))
    else style.remove()
  }
}
