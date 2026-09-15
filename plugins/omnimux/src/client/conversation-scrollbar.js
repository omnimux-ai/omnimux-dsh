/**
 * 会话栏滚动条按需显示（overlay 式存在感，但保留原生滚动条本体）。
 *
 * 会话栏滚动容器是宿主渲染的 `[data-conversation-scroll]`，插件不接管滚动，
 * 只控制滑块何时可见：默认透明 → 发生滚动时浮现 → 静置约 900ms 后隐去；
 * 指针停在装订线上或按住拖动时保持可见，保证用户随时能抓住它精确拖动。
 *
 * 机制只用 `::-webkit-scrollbar-thumb`，**不用**标准属性 `scrollbar-color`：
 * 实机 A/B 实测（Dev App，CDP + 截图逐列比对），给该容器加
 * `scrollbar-color: transparent transparent` 会让 `scrollbar-gutter` 预留的装订线
 * 从 16px 整体塌缩为 0，滚动条一出现/消失会话内容就横向跳动 8px；
 * 伪元素方案只改滑块绘制，容器 offsetWidth/clientWidth 与改动前完全一致。
 *
 * 与 `components/SplitModalDialog.jsx` 的 `is-scrolling` 同源范式（透明 → 显示 →
 * 静置收起），这里换成数据属性 + 文档级捕获监听，因为容器由宿主渲染、插件不持有组件。
 */

/** 注入样式表的 id。 */
export const CONVERSATION_SCROLLBAR_STYLE_ID = 'omnimux-conversation-scrollbar'
/** 会话栏滚动容器（宿主渲染，按数据属性定位）。 */
export const SCROLL_CONTAINER_SELECTOR = '[data-conversation-scroll]'
/** 滑块可见时打在滚动容器上的标记。 */
export const SCROLL_ACTIVE_ATTR = 'data-omnimux-scroll-active'
/** 最后一次滚动后滑块驻留时长（毫秒）。 */
export const SCROLL_REVEAL_DWELL_MS = 900
/** 指针进入容器右缘多少像素内视为「要抓滚动条」。 */
export const SCROLLBAR_GRAB_BAND_PX = 20

export const CONVERSATION_SCROLLBAR_CSS = `
/* 默认透明：滚动条仍在原位占位，只是不绘制滑块。 */
${SCROLL_CONTAINER_SELECTOR}::-webkit-scrollbar-thumb{
  background:transparent;
  border-radius:3px;
  transition:background-color 260ms ease;
}
/* 滚动中 / 指针落在装订线上 / 正在拖动：浮现滑块。 */
${SCROLL_CONTAINER_SELECTOR}[${SCROLL_ACTIVE_ATTR}]::-webkit-scrollbar-thumb{
  background:var(--dsw-alias-border-l3, rgba(255,255,255,.28));
}
`

/** @returns {Document | undefined} */
function hostDocument() {
  return typeof document !== 'undefined' ? document : undefined
}

/**
 * 指针是否落在「可以抓住滚动条」的装订线区域内。
 * 纯函数，便于单测覆盖边界（含容器外的坐标）。
 * @param {{ left: number, right: number, top: number, bottom: number }} rect
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} [band]
 * @returns {boolean}
 */
export function isScrollbarGrabZone(rect, clientX, clientY, band = SCROLLBAR_GRAB_BAND_PX) {
  if (!rect) return false
  const insideY = clientY >= rect.top && clientY <= rect.bottom
  if (!insideY) return false
  const distance = rect.right - clientX
  return distance >= 0 && distance <= band
}

/**
 * 注入（或刷新）滚动条样式表。幂等。
 * @param {Document | undefined} [doc]
 * @returns {HTMLStyleElement | null}
 */
export function ensureConversationScrollbarChrome(doc = hostDocument()) {
  if (!doc?.head) return null
  const existing = doc.getElementById(CONVERSATION_SCROLLBAR_STYLE_ID)
  if (existing instanceof doc.defaultView.HTMLStyleElement || existing?.tagName === 'STYLE') {
    if (existing.textContent !== CONVERSATION_SCROLLBAR_CSS) existing.textContent = CONVERSATION_SCROLLBAR_CSS
    return existing
  }
  const style = doc.createElement('style')
  style.id = CONVERSATION_SCROLLBAR_STYLE_ID
  style.textContent = CONVERSATION_SCROLLBAR_CSS
  doc.head.append(style)
  return style
}

/**
 * 安装滚动浮现行为。
 *
 * 监听放在 document 捕获阶段：元素滚动事件不冒泡，捕获阶段才能统一收到，
 * 且容器由宿主随时挂载/卸载，不必自己观察 DOM。
 * @param {Document | undefined} [doc]
 * @returns {() => void} 取消函数
 */
export function installConversationScrollbarReveal(doc = hostDocument()) {
  if (!doc?.addEventListener) return () => {}
  const timers = new WeakMap()
  /** 指针停在装订线上或正在拖动时，静置计时器不得收起滑块。 */
  const held = new WeakSet()

  const clearTimer = (el) => {
    const timer = timers.get(el)
    if (timer == null) return
    const win = doc.defaultView
    if (win?.clearTimeout) win.clearTimeout(timer)
    else clearTimeout(timer)
    timers.delete(el)
  }

  const hide = (el) => {
    timers.delete(el)
    if (held.has(el)) return
    el.removeAttribute?.(SCROLL_ACTIVE_ATTR)
  }

  const reveal = (el) => {
    if (!el?.setAttribute) return
    el.setAttribute(SCROLL_ACTIVE_ATTR, '')
    clearTimer(el)
    const win = doc.defaultView
    const setTimer = win?.setTimeout ? win.setTimeout.bind(win) : setTimeout
    timers.set(el, setTimer(() => hide(el), SCROLL_REVEAL_DWELL_MS))
  }

  const containerOf = (target) => {
    if (!target || typeof target.closest !== 'function') return null
    return target.closest(SCROLL_CONTAINER_SELECTOR)
  }

  const onScroll = (event) => {
    const el = containerOf(event.target)
    if (el) reveal(el)
  }

  const onPointerMove = (event) => {
    const el = containerOf(event.target)
    if (!el) return
    const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null
    if (!isScrollbarGrabZone(rect, event.clientX, event.clientY)) return
    // 指针悬在装订线上，或正按住拖动：滑块保持可见，让用户抓得住。
    held.add(el)
    reveal(el)
  }

  const onPointerLeave = (event) => {
    const el = containerOf(event.target)
    if (!el) return
    held.delete(el)
  }

  doc.addEventListener('scroll', onScroll, { capture: true, passive: true })
  doc.addEventListener('pointermove', onPointerMove, { capture: true, passive: true })
  doc.addEventListener('pointerleave', onPointerLeave, { capture: true, passive: true })

  return () => {
    doc.removeEventListener('scroll', onScroll, { capture: true })
    doc.removeEventListener('pointermove', onPointerMove, { capture: true })
    doc.removeEventListener('pointerleave', onPointerLeave, { capture: true })
    for (const el of doc.querySelectorAll(SCROLL_CONTAINER_SELECTOR)) {
      el.removeAttribute?.(SCROLL_ACTIVE_ATTR)
    }
  }
}
