/**
 * 三分栏中间会话栏「比例制」的纯数值真源（对齐 MiniMax Design 3.0.16 分栏算法）。
 *
 * 本模块无 DOM 依赖、无副作用，只做数值换算，便于逐档单测：
 * 比例归一化、像素预算、宽度↔比例往返换算。装配层
 * （`sidebar-toggle-topbar.js` / `workbench/geometry.js`）负责把结果写成 CSS 变量。
 *
 * 权威链（防 #2097 复发）：**稳态**由比例决定像素；**交互期**以外壳 authored 几何为准，
 * 比例只记录不干预。本模块只提供纯函数，任何一侧都不得用测量值反推宽度再写回。
 *
 * 落点差异说明：技术方案 §4.1 把本模块列在 `workbench/` 下，任务规格 §5 与 Issue #2608
 * 的交付清单把它定在 `src/client/` 根（与 `conversation-box.js`、`conversation-collapse.js`
 * 同层）。实现以规格为准。
 */

/** 对齐竞品 `MIN_CHAT_RATIO`。 */
export const CONVERSATION_RATIO_MIN = 0
/** 对齐竞品 `MAX_CHAT_RATIO`。 */
export const CONVERSATION_RATIO_MAX = 0.72
/** 对齐竞品 `DEFAULT_WORKSPACE_CHAT_RATIO`。 */
export const CONVERSATION_RATIO_DEFAULT = 0.3
/**
 * 可用性护栏：竞品 `TARGET_MIN_CHAT_WIDTH` 为 220，本产品取 360 ——
 * 360px 以下输入区控件退化为图标密度（用户 2026-09-23 拍板）。
 * 拖拽下限与派生下限统一到本值。
 */
export const CONVERSATION_MIN_CHAT_PX = 360
/** 对齐竞品 `TARGET_MIN_CANVAS_WIDTH`：画布至少保留这么宽。 */
export const CONVERSATION_MIN_CANVAS_PX = 320
/** 对齐竞品 `DIVIDER_LAYOUT_WIDTH`；实测 1920 三轨之和等于视口，分隔线零占宽。 */
export const DIVIDER_LAYOUT_WIDTH = 0

/**
 * 夹紧到合法比例区间。非有限数按区间下界处理（供内部算式使用）。
 * @param {unknown} value
 * @returns {number}
 */
export function clampConversationRatio(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return CONVERSATION_RATIO_MIN
  return Math.min(CONVERSATION_RATIO_MAX, Math.max(CONVERSATION_RATIO_MIN, n))
}

/**
 * 持久化/外部输入的归一化：缺失或非法一律回落默认比例，绝不产生 NaN 比例。
 *
 * 显式拒绝 `null` / `undefined` / 空串 / 布尔 / 对象：`Number(null)` 与 `Number('')`
 * 都等于 0（有限数），若按「有限数即夹紧」处理，一个「键不存在」会被静默解读为
 * 比例 0，把中栏压到下限。这里把「缺失」与「0」区分开。
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeConversationRatio(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? clampConversationRatio(value) : CONVERSATION_RATIO_DEFAULT
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? clampConversationRatio(n) : CONVERSATION_RATIO_DEFAULT
  }
  return CONVERSATION_RATIO_DEFAULT
}

/**
 * 舞台宽 = 窗口内容宽 − 左栏。
 *
 * 收起左栏时使用「展开态左栏基线」作为分母，使收起动作对中栏宽度成为恒等变换
 * （契约 INV-1/INV-2 保宽：释放宽度全部进画布）。
 *
 * 两个输入都不得是「由本插件刚写入的值决定的测量读数」（契约 INV-4 禁自证读数）：
 * `viewportWidth` 来自窗口、`railVisiblePx`/`railBaselinePx` 来自外壳 authored 栅格或其记忆。
 * @param {{ viewportWidth: number, railVisiblePx?: number, railBaselinePx?: number, collapsed?: boolean }} input
 * @returns {number} 非负整数像素
 */
export function conversationStageWidthPx({ viewportWidth, railVisiblePx = 0, railBaselinePx = 0, collapsed = false } = {}) {
  const viewport = Number(viewportWidth)
  if (!Number.isFinite(viewport)) return 0
  const rail = collapsed ? Math.max(0, railBaselinePx || 0) : Math.max(0, railVisiblePx || 0)
  return Math.max(0, Math.round(viewport) - rail)
}

/**
 * 语义等价于竞品 `resolveWorkspaceStagePixelBudget(stageWidth, chatRatio)`。
 *
 * 中栏 = clamp(round(舞台 × 比例), 下限, min(舞台 × 72%, 舞台 − 320))；
 * 上限小于下限时下限优先，画布拿剩余。`Math.round` 只作用于中栏宽度。
 * @param {number} stageWidth
 * @param {unknown} ratio
 * @returns {{ chatWidth: number, minChatWidth: number, maxChatWidth: number }}
 */
export function resolveConversationPixelBudget(stageWidth, ratio) {
  const stage = Math.max(0, Number.isFinite(Number(stageWidth)) ? Number(stageWidth) : 0)
  const availablePaneWidth = Math.max(0, stage - DIVIDER_LAYOUT_WIDTH)
  const ratioMax = stage * CONVERSATION_RATIO_MAX
  const minChatWidth = Math.min(CONVERSATION_MIN_CHAT_PX, availablePaneWidth)
  const desiredMaxChatWidth = Math.min(ratioMax, Math.max(0, availablePaneWidth - CONVERSATION_MIN_CANVAS_PX))
  const maxChatWidth = Math.max(minChatWidth, desiredMaxChatWidth)
  const preferredChatWidth = Math.round(stage * normalizeConversationRatio(ratio))
  const chatWidth = Math.min(maxChatWidth, Math.max(minChatWidth, preferredChatWidth))
  return { chatWidth, minChatWidth, maxChatWidth }
}

/**
 * 稳态中栏宽度：比例权威。
 * @param {number} stageWidth
 * @param {unknown} ratio
 * @returns {number} 整数像素
 */
export function conversationWidthFromRatio(stageWidth, ratio) {
  return resolveConversationPixelBudget(stageWidth, ratio).chatWidth
}

/**
 * 拖拽反推：像素 → 比例（夹紧后写回，保证持久化的比例与拖拽结果一致）。
 * @param {number} stageWidth
 * @param {number} chatWidth
 * @returns {number}
 */
export function ratioFromConversationWidth(stageWidth, chatWidth) {
  const stage = Math.max(0, Number(stageWidth))
  if (!(stage > 0) || !Number.isFinite(chatWidth)) return CONVERSATION_RATIO_DEFAULT
  return clampConversationRatio(chatWidth / stage)
}
