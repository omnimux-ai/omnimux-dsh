/**
 * 输入框宽度护栏：让原生自适应公式重新生效，并防止宽度偏好再被写歪。
 *
 * 原生（`packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx`）：
 *   CONTENT_MIN = 640，CONTENT_EDGE_BUDGET = 176，偏好键 `dsh.conversation.contentWidth`
 *   resolveContentWidth(列宽, 偏好):
 *     max = max(640, 列宽 - 176)
 *     有偏好 → min(max(偏好, 640), max)
 *     无偏好 → max(680, min(列宽 × 0.64, 920))
 *   输入框卡片上限 = 内容宽 + 32
 *
 * 问题：存档里残留一个 920.68px 的偏好后，输入框被钉在 `偏好 + 32` 上，
 * 原生自适应（随列宽按 0.64 收缩、上限 920）彻底失效 —— 宽列时顶到 952px。
 *
 * 护栏只做一件事：**偏好值超过当前列宽下的原生自适应上限时，删掉它**，让原生公式复位。
 * 不超过就不动，原生宽度拖拽手柄在合法范围内的调整必须保留。
 */

import { hostWindow } from './workbench/host-adapter.js'

/** 原生偏好存档键。 */
export const COMPOSER_WIDTH_PREF_KEY = 'dsh.conversation.contentWidth'
/** 原生常量：内容宽下限。 */
export const COMPOSER_CONTENT_MIN_PX = 640
/** 原生常量：列宽到内容宽的边距预算。 */
export const COMPOSER_CONTENT_EDGE_BUDGET_PX = 176
/** 原生自适应下限。 */
export const COMPOSER_ADAPTIVE_FLOOR_PX = 680
/** 原生自适应上限。 */
export const COMPOSER_ADAPTIVE_CEILING_PX = 920
/** 会话列容器（用于量当前列宽）。 */
export const CONVERSATION_COLUMN_SELECTOR = '[data-conversation-scroll]'

/**
 * 原生自适应内容宽（无偏好时原生会算出的值）。纯函数，便于单测。
 * @param {number} columnWidth 会话列宽度。
 * @returns {number}
 */
export function resolveAdaptiveContentWidth(columnWidth) {
  const width = Number(columnWidth)
  if (!Number.isFinite(width) || width <= 0) return COMPOSER_ADAPTIVE_FLOOR_PX
  return Math.max(COMPOSER_ADAPTIVE_FLOOR_PX, Math.min(width * 0.64, COMPOSER_ADAPTIVE_CEILING_PX))
}

/**
 * 判断偏好是否越界（超过当前列宽下的自适应上限）。
 * @param {string | null} raw 存档原文。
 * @param {number} columnWidth 会话列宽度。
 * @returns {boolean} 越界应清除时为真。
 */
export function isStaleWidthPreference(raw, columnWidth) {
  if (raw == null || raw === '') return false
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return true
  return value > resolveAdaptiveContentWidth(columnWidth) + 1
}

/**
 * 跑一次护栏：越界就删除偏好，让原生自适应复位。
 * @param {Window | undefined} [win]
 * @param {Element | null} [column]
 * @returns {{ cleared: boolean, value?: string }}
 */
export function guardComposerWidthPreference(win = hostWindow(), column = null) {
  const storage = win?.localStorage
  const doc = win?.document
  if (!storage || !doc) return { cleared: false }
  const node = column || doc.querySelector?.(CONVERSATION_COLUMN_SELECTOR)
  const columnWidth = Number(node?.getBoundingClientRect?.().width) || 0
  if (columnWidth <= 0) return { cleared: false }
  let raw = null
  try {
    raw = storage.getItem(COMPOSER_WIDTH_PREF_KEY)
  } catch {
    return { cleared: false }
  }
  if (!isStaleWidthPreference(raw, columnWidth)) return { cleared: false }
  try {
    storage.removeItem(COMPOSER_WIDTH_PREF_KEY)
  } catch {
    return { cleared: false }
  }
  return { cleared: true, value: raw ?? undefined }
}

/**
 * 安装护栏：启动跑一次，并在会话列尺寸变化时复检（偏好被原生手柄写大后会再次被纠正）。
 * @param {Window | undefined} [win]
 * @returns {() => void} 取消函数
 */
export function installComposerWidthGuard(win = hostWindow()) {
  if (!win?.document) return () => {}
  const doc = win.document
  const run = () => {
    guardComposerWidthPreference(win)
  }
  run()

  const Observer = win.ResizeObserver
  const column = doc.querySelector?.(CONVERSATION_COLUMN_SELECTOR)
  if (typeof Observer !== 'function' || !column) return () => {}
  let frame = null
  const observer = new Observer(() => {
    if (frame != null) return
    frame = win.requestAnimationFrame?.(() => {
      frame = null
      run()
    }) ?? null
    if (frame == null) run()
  })
  observer.observe(column)
  return () => {
    observer.disconnect()
    if (frame != null) win.cancelAnimationFrame?.(frame)
  }
}
