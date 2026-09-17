/**
 * 资产中心网格的列数推导。
 *
 * 网格曾经把列数完全交给 `repeat(auto-fill, minmax(180px, 1fr))`，列数于是随窗口
 * 无限膨胀：1560px 的内容区实测铺出 7 列，卡片被压得看不清。这里把「一行放几列」
 * 收敛成一个可单测的纯函数，上限 5 列，下限 2 列。
 *
 * 最小列宽 260px 不是随手取的：它由四个目标断点反解而来——容器 1560 / 1280 /
 * 1024 / 768 分别要得到 5 / 4 / 3 / 2 列。取 `(width + gap) / (minWidth + gap)` 向下
 * 取整后再封顶，四个断点同时成立；换成 180px 则 1280 会得到 6 列，上限就形同虚设。
 *
 * 纯函数：不读 DOM、不读 window，宽度由调用方传入，因此边界可以逐条断言。
 */

/** 一行最多几列。 */
export const GRID_MAX_COLUMNS = 5

/** 一行最少几列：再窄也要保住两列，一列在宽屏上会把卡片拉成整屏宽。 */
export const GRID_MIN_COLUMNS = 2

/** 每列的最小宽度，见文件头对 260 的推导。 */
export const GRID_MIN_COLUMN_WIDTH = 260

/** 列间距，与样式表里的 `gap` 必须一致，否则列数算出来会和实际排版对不上。 */
export const GRID_GAP = 12

/**
 * 给定容器宽度，返回该宽度下一行放几列。
 *
 * 宽度不可用（未挂载、容器塌陷、传入 NaN）时返回下限而不是抛错：网格在首帧还没
 * 测量到宽度，抛错会把整个货架打空，两列至少是能看的。
 * @param {number} containerWidth 内容区宽度（CSS px）
 * @returns {number} `[GRID_MIN_COLUMNS, GRID_MAX_COLUMNS]` 之间的整数
 */
export function gridColumnsFor(containerWidth) {
  const width = Number(containerWidth)
  if (!Number.isFinite(width) || width <= 0) return GRID_MIN_COLUMNS
  const fit = Math.floor((width + GRID_GAP) / (GRID_MIN_COLUMN_WIDTH + GRID_GAP))
  return Math.max(GRID_MIN_COLUMNS, Math.min(GRID_MAX_COLUMNS, fit))
}
