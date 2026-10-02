/**
 * 图像生成提示词框的高度夹取。
 * 下限沿用现有矮高度；上限是 10 行可见文字（字号 × 行高）。
 * 组件只负责测量内容高度，数字只写在这里。
 */

export const PROMPT_TEXTAREA_MIN_HEIGHT_PX = 52
export const PROMPT_TEXTAREA_LINE_HEIGHT = 1.6
export const PROMPT_TEXTAREA_FONT_SIZE_PX = 14
export const PROMPT_TEXTAREA_MAX_VISIBLE_LINES = 10

export function promptTextareaMaxHeightPx() {
  // 行高先按浏览器习惯取整到 0.1px（14 × 1.6 = 22.4），再乘行数。
  // 多行文本框还有约 4px 行盒余量：加上后正好 10 行不出现滚动条，第 11 行才在框内滚动。
  const line = Math.round(PROMPT_TEXTAREA_FONT_SIZE_PX * PROMPT_TEXTAREA_LINE_HEIGHT * 10) / 10
  return Math.ceil(PROMPT_TEXTAREA_MAX_VISIBLE_LINES * line + 4)
}

/** @param {number} contentHeightPx 文本本身撑开的高度（不含夹取） */
export function clampPromptTextareaHeight(contentHeightPx) {
  const max = promptTextareaMaxHeightPx()
  const raw = Number.isFinite(contentHeightPx) ? contentHeightPx : 0
  return Math.min(max, Math.max(PROMPT_TEXTAREA_MIN_HEIGHT_PX, Math.ceil(raw)))
}
