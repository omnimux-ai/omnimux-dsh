/**
 * 三分栏「比例制」的持久化真源（Issue #2608 / 方案 §4.5）。
 *
 * **只存比例，不存像素**：像素是「比例 × 舞台」的函数，把某一时刻的窗口宽度写进磁盘，
 * 换个窗口尺寸就必然错位——这正是旧实现「同一软件多套版式」的来源之一。
 * 全局一份（不按会话 / 页签分片），键 `omnimux.conversationRatio`。
 *
 * 三种读结果必须区分开，否则「老用户迁移」与「损坏值回落」会互相吃掉：
 *
 * | 存储状态 | 返回 | 调用方动作 |
 * | --- | --- | --- |
 * | 命中且合法 | 该比例 | 直接按比例算中栏 |
 * | **键缺失** | `null` | 走「老用户按当前实际宽度反推一次」的迁移路径 |
 * | 键存在但损坏 | 默认比例 `0.3` | 按默认值算，并机会性写回清洗后的值 |
 *
 * 本模块不依赖 DOM 几何：迁移所需的舞台/宽度由调用方（已持有外壳 authored 栅格的模块）
 * 量好后传入，保证「比例」与「读数来源」两件事各自只有一个真源。
 */

import {
  CONVERSATION_RATIO_DEFAULT,
  conversationStageWidthPx,
  normalizeConversationRatio,
  ratioFromConversationWidth,
} from '../conversation-ratio.js'

/** 全局唯一的持久化键。 */
export const WORKSPACE_LAYOUT_KEY = 'omnimux.conversationRatio'
/** 持久化载荷版本；结构变化时用于识别旧载荷。 */
export const WORKSPACE_LAYOUT_VERSION = 1
/** 拖拽期写比例的防抖窗口（对齐竞品；`pointerup` 走立即写，不受此值影响）。 */
export const CHAT_RATIO_PERSIST_DEBOUNCE_MS = 250
/** 写入去抖阈值：与已存值差小于此值视为同一比例，不重复写。 */
export const CHAT_RATIO_WRITE_EPSILON = 5e-4

/** @type {ReturnType<typeof setTimeout> | null} */
let pendingTimer = null
/** @type {number | null} */
let pendingRatio = null

function resolveStorage(explicit) {
  if (explicit) return explicit
  try {
    return globalThis.window?.localStorage ?? globalThis.localStorage ?? null
  } catch {
    // 隐私模式 / 沙箱下访问 localStorage 会抛错：无存储即无持久化，绝不冒泡打断布局同步。
    return null
  }
}

function resolveTimers() {
  try {
    return globalThis.window ?? globalThis
  } catch {
    return globalThis
  }
}

/**
 * 读取已存比例。
 * @param {{ storage?: Storage | null }} [opts]
 * @returns {number | null} 合法比例；键缺失返回 `null`；损坏返回默认比例
 */
export function readChatRatio(opts = {}) {
  const storage = resolveStorage(opts.storage)
  if (!storage) return null
  let raw = null
  try {
    raw = storage.getItem(WORKSPACE_LAYOUT_KEY)
  } catch {
    return null
  }
  if (raw === null || raw === undefined) return null

  let payload = null
  try {
    payload = JSON.parse(raw)
  } catch {
    // 损坏载荷：按默认比例处理并机会性清洗，绝不让一个坏字节把中栏压到下限。
    writeChatRatio(CONVERSATION_RATIO_DEFAULT, { storage })
    return CONVERSATION_RATIO_DEFAULT
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    writeChatRatio(CONVERSATION_RATIO_DEFAULT, { storage })
    return CONVERSATION_RATIO_DEFAULT
  }
  const value = payload.chatRatio
  const isUsable = (typeof value === 'number' && Number.isFinite(value))
    || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
  if (!isUsable) {
    writeChatRatio(CONVERSATION_RATIO_DEFAULT, { storage })
    return CONVERSATION_RATIO_DEFAULT
  }
  const normalized = normalizeConversationRatio(value)
  if (normalized !== value) writeChatRatio(normalized, { storage })
  return normalized
}

/**
 * 立即写入比例（归一化后）。与已存值差小于 {@link CHAT_RATIO_WRITE_EPSILON} 时跳过。
 * @param {unknown} ratio
 * @param {{ storage?: Storage | null, force?: boolean }} [opts]
 * @returns {boolean} 是否发生了真实写入
 */
export function writeChatRatio(ratio, opts = {}) {
  const storage = resolveStorage(opts.storage)
  if (!storage) return false
  const normalized = normalizeConversationRatio(ratio)
  if (opts.force !== true) {
    const current = readStoredNumber(storage)
    if (current !== null && Math.abs(current - normalized) < CHAT_RATIO_WRITE_EPSILON) return false
  }
  try {
    storage.setItem(
      WORKSPACE_LAYOUT_KEY,
      JSON.stringify({ version: WORKSPACE_LAYOUT_VERSION, chatRatio: normalized }),
    )
    return true
  } catch {
    return false
  }
}

function readStoredNumber(storage) {
  try {
    const payload = JSON.parse(storage.getItem(WORKSPACE_LAYOUT_KEY))
    const value = payload?.chatRatio
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

/**
 * 防抖写入：拖拽期每帧都会产生一个新比例，逐帧落盘既无必要也伤性能。
 * @param {unknown} ratio
 * @param {{ storage?: Storage | null, delayMs?: number }} [opts]
 */
export function schedulePersistChatRatio(ratio, opts = {}) {
  pendingRatio = normalizeConversationRatio(ratio)
  const delay = Number.isFinite(opts.delayMs) ? Math.max(0, Number(opts.delayMs)) : CHAT_RATIO_PERSIST_DEBOUNCE_MS
  const timers = resolveTimers()
  if (pendingTimer !== null) {
    try { timers.clearTimeout(pendingTimer) } catch { /* ignore */ }
    pendingTimer = null
  }
  pendingTimer = timers.setTimeout(() => {
    pendingTimer = null
    const value = pendingRatio
    pendingRatio = null
    if (value !== null) writeChatRatio(value, { storage: opts.storage })
  }, delay)
}

/**
 * 立即写入并取消待发的防抖写（拖拽结算专用）。
 * @param {unknown} ratio
 * @param {{ storage?: Storage | null }} [opts]
 * @returns {boolean} 是否发生了真实写入
 */
export function persistChatRatioNow(ratio, opts = {}) {
  cancelPendingPersist()
  return writeChatRatio(ratio, opts)
}

/**
 * 取消待发的防抖写。卸载 / 测试复位时调用，避免野定时器在文档销毁后触发。
 * @returns {boolean} 是否取消了待发写
 */
export function cancelPendingPersist() {
  const had = pendingTimer !== null
  if (pendingTimer !== null) {
    try { resolveTimers().clearTimeout(pendingTimer) } catch { /* ignore */ }
    pendingTimer = null
  }
  pendingRatio = null
  return had
}

/**
 * 老用户首跑迁移：按**当前实际几何**反推一次比例并落盘。
 *
 * 反推口径与拖拽期的 authored 权威完全同源：中栏 = 视口 − 可见左栏 − 外壳 authored 第三轨。
 * 这样升级后首开的中栏像素与升级前一致（AC-11），之后才按比例跟随缩放。
 *
 * **调用前提**：调用方必须已确认外壳的第三轨是**用户自己**的版式（外壳 `panels.rightbar`
 * 已是数字），否则全新用户会被反推成「外壳默认 45% 面板」的比例，永远看不到产品默认 30%。
 * 另外本函数自带幂等护栏：已存比例时直接返回已存值，绝不覆盖——迁移只允许发生一次。
 * @param {{ viewportWidth?: number, railVisiblePx?: number, railBaselinePx?: number, collapsed?: boolean, rightTrackPx?: number }} geometry
 * @param {{ storage?: Storage | null }} [opts]
 * @returns {number | null} 落盘的比例；几何不足以反推时返回 `null`（不写、不改默认值）
 */
export function migrateChatRatioFromAuthoredGeometry(geometry = {}, opts = {}) {
  const existing = readChatRatio(opts)
  if (existing !== null) return existing
  const viewport = Number(geometry.viewportWidth)
  const rightTrack = Number(geometry.rightTrackPx)
  if (!Number.isFinite(viewport) || viewport <= 0) return null
  if (!Number.isFinite(rightTrack) || rightTrack <= 0) return null
  const railVisiblePx = Math.max(0, Number(geometry.railVisiblePx) || 0)
  const chatWidth = Math.max(0, Math.round(viewport) - railVisiblePx - Math.round(rightTrack))
  if (!(chatWidth > 0)) return null
  const stage = conversationStageWidthPx({
    viewportWidth: viewport,
    railVisiblePx,
    railBaselinePx: Math.max(0, Number(geometry.railBaselinePx) || 0),
    collapsed: geometry.collapsed === true,
  })
  if (!(stage > 0)) return null
  const ratio = ratioFromConversationWidth(stage, chatWidth)
  writeChatRatio(ratio, opts)
  return ratio
}

/**
 * 测试专用：清空待发防抖写。存储内容本身由测试自备的 storage 承担。
 */
export function resetWorkspaceLayoutStoreForTests() {
  cancelPendingPersist()
}
