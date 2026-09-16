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
 * 规范（Issue #2062）：
 * 插件不再清除用户保存的偏宽宽度记录。无论当前列宽多窄，用户拖拽保存的有效宽度
 * 均完整保留于 localStorage；原生公式在列宽收窄时会自动进行动态安全钳制，无需也不得删档。
 * 护栏仅对真正损坏/非法的值（非有限正数）做安全兜底。
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
 * 判断偏好是否损坏或非法。
 * 遵循用户决策（Issue #2062）：插件不得清除用户保存的偏宽记录，任何合法有效数值均保留。
 * 仅对损坏的非法值（非有限正数）返回 true。
 * @param {string | null} raw 存档原文。
 * @param {number} [_columnWidth] 会话列宽度（保持兼容签名）。
 * @returns {boolean}
 */
export function isStaleWidthPreference(raw, _columnWidth) {
  if (raw == null || raw === '') return false
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return true
  // 偏宽偏好（如 900、920.68 等）坚决不删，完整保留用户设置
  return false
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
