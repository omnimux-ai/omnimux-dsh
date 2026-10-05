/**
 * 账号监控瀑布流的薄适配层（spec §9.1/§9.3）。
 *
 * 与 `plugins/omnimux-assets/src/client/masonry.js` 同一范式：贪心分列决策
 * 一律调用共享核心 `distributeColumns` / `columnsForWidth`，本文件只做
 * 「内容类型 → 形态/比例/高度」的解析，绝不重写第三套算法。
 *
 * 纯函数，零 DOM、零 window：媒体区在 <img> 加载前就按数据里的比例占位
 * （§9.3 / V3 / V7），因此比例只可能来自数据字段，绝不测量 naturalWidth。
 */

import {
  columnsForWidth as columnsForWidthCore,
  distributeColumns as distributeColumnsCore,
} from '../../../omnimux/src/client/components/library-flow/masonry-layout.js'

/** spec §9.3：最小列宽、间距、列数区间。 */
export const RIVAL_MIN_COL_WIDTH = 220
export const RIVAL_GAP = 16
export const RIVAL_MIN_COLS = 2
export const RIVAL_MAX_COLS = 6

/** spec §9.3：所有卡片最小高度（放得下约 135px 悬停层）。 */
export const RIVAL_MIN_CARD_HEIGHT = 144

/** spec §9.1：图文比例区间 4:5（最高）— 1.91:1（最宽），数据缺失回 4:5。 */
export const RIVAL_IMAGE_RATIO_MIN = 4 / 5
export const RIVAL_IMAGE_RATIO_MAX = 1.91
export const RIVAL_DEFAULT_IMAGE_RATIO = 4 / 5

const CARD_TYPES = new Set(['short-video', 'long-video', 'image', 'text', 'text-media'])
const VIDEO_RATIO = 16 / 9
const SHORT_VIDEO_RATIO = 9 / 16

/** 卡片 1px 描边（上 + 下）：估算按渲染的 border-box 高度计，含这 2px。 */
const CARD_BORDER = 2
/** 文本卡几何（§9.1/§9.3）：内边距 12×2、胶囊行 28 + 间距 8、正文行高 20。 */
const TEXT_PAD_V = 24
const PILL_ROW = 28 + 8
const BODY_LINE = 20
const TEXT_MAX_LINES = 8
const TEXT_MEDIA_BODY_LINES = 3
const TEXT_MEDIA_GAP = 10
/** 14px 正文、中文按 1 字宽计的每行字数：floor((columnWidth − 24) / 14)。 */
const TEXT_CHAR_PX = 14
/** 媒体卡标题几何（§9.1）：13px 中文字宽、行高 18、标题区左右各 12、上 10 + 下 12。 */
const TITLE_CHAR_PX = 13
const TITLE_ZONE_PAD_H = 24
const TITLE_ZONE_PAD_V = 10 + 12
const TITLE_LINE = 18
const TITLE_MAX_LINES = 2
/** 西文/数字按半宽折算的系数——够近似真实换行，又不引入字体测量依赖。 */
const ASCII_WIDTH_FACTOR = 0.55

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * 一段文本的估算占位宽度（px）。中文、全角与 CJK 标点按整宽，其余按半宽
 * 折算。
 * @param {string} text
 * @param {number} unitPx 全角字符的字宽（正文 14、标题 13）
 */
function textWidthPx(text, unitPx) {
  let px = 0
  for (const ch of String(text || '')) {
    px += ch.codePointAt(0) > 0x2e7f ? unitPx : unitPx * ASCII_WIDTH_FACTOR
  }
  return px
}

/**
 * 标题在列宽下的估算行数，按 §9.1 每类卡的截断上限收：短视频/图文 1 行、
 * 长视频 2 行。上限是 cap 不是常量——文本装一行时按一行算。
 * @param {Record<string, any>} card
 * @param {number} columnWidth
 * @param {'short-video'|'long-video'|'image'} type
 */
function titleLines(card, columnWidth, type) {
  const maxLines = type === 'long-video' ? TITLE_MAX_LINES : 1
  const perLine = Math.max(1, columnWidth - TITLE_ZONE_PAD_H - CARD_BORDER)
  return Math.max(1, Math.min(maxLines, Math.ceil(textWidthPx(card?.title || '', TITLE_CHAR_PX) / perLine)))
}

/**
 * Host `type` + 平台 → spec §9.1 的五种卡片形态。
 *
 * `card_type` 已是五形态值时原样通过；否则按平台与媒体存在性推导：
 *   - video 平台维度：tiktok/instagram/reels → short-video，youtube → long-video；
 *   - instagram 的 image → image；
 *   - X 的 tweet：有内嵌媒体 → text-media，否则 → text。
 * 未知行回退到最高的 short-video——放错列的代价小于把媒体卡压扁。
 * @param {Record<string, any>} card
 * @returns {'short-video'|'long-video'|'image'|'text'|'text-media'}
 */
export function rivalCardTypeOf(card) {
  const declared = String(card?.card_type || '')
  if (CARD_TYPES.has(declared)) return declared
  const platform = String(card?.source_platform || card?.account?.platform || '').toLowerCase()
  const kind = String(card?.type || '').toLowerCase()
  const hasMedia = card?.has_media === true
    || String(card?.cover_src || card?.cover_key || '') !== ''
    || String(card?.video_url || '') !== ''

  if (platform === 'x' || platform === 'twitter' || platform === 'threads') {
    // A declared image/video type IS media presence, even when no cover made it
    // into the row yet — the card keeps the text-media shape and renders the
    // dark placeholder rather than collapsing to a bare text card.
    if (kind === 'video' || kind === 'image') return 'text-media'
    return hasMedia ? 'text-media' : 'text'
  }
  if (platform === 'youtube') return 'long-video'
  if (platform === 'instagram' || platform === 'pinterest') {
    return kind === 'video' ? 'short-video' : 'image'
  }
  if (platform === 'tiktok' || platform === 'douyin' || platform === 'kuaishou') {
    return 'short-video'
  }
  if (kind === 'video') return 'short-video'
  if (kind === 'image') return 'image'
  return 'short-video'
}

/**
 * spec §9.1 媒体宽高比（宽 / 高）。
 * `image` 与图片型 `text-media` 读 `card.ratio` 并裁到 [4:5, 1.91:1]；
 * 缺失回 4:5。`text` 没有媒体，返回值仅作调用方兜底，不代表媒体。
 * @param {Record<string, any>} card
 * @returns {number}
 */
export function rivalMediaRatioOf(card) {
  const type = rivalCardTypeOf(card)
  if (type === 'short-video') return SHORT_VIDEO_RATIO
  if (type === 'long-video') return VIDEO_RATIO
  if (type === 'text-media') {
    if (String(card?.media_kind || '') === 'image') {
      return clamp(validRatio(card?.ratio), RIVAL_IMAGE_RATIO_MIN, RIVAL_IMAGE_RATIO_MAX)
    }
    return VIDEO_RATIO
  }
  if (type === 'image') {
    return clamp(validRatio(card?.ratio), RIVAL_IMAGE_RATIO_MIN, RIVAL_IMAGE_RATIO_MAX)
  }
  return SHORT_VIDEO_RATIO
}

function validRatio(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : RIVAL_DEFAULT_IMAGE_RATIO
}

/**
 * 分列用比例：媒体类就是媒体比；纯文本卡是「列宽 ÷ 估算高度」反解的等效
 * 比例（资产层 MASONRY_AUDIO_RATIO 的同款手法）。放置决策已经不再走它——
 * `rivalPlacements` 经 `heightOf` 直接用 `rivalCardHeightPx`——保留导出
 * 供需要比例视角的调用方与契约测试使用。
 * @param {Record<string, any>} card
 * @param {number} columnWidth
 * @returns {number}
 */
export function rivalRatioOf(card, columnWidth) {
  if (rivalCardTypeOf(card) === 'text') {
    return columnWidth / rivalCardHeightPx(card, columnWidth)
  }
  return rivalMediaRatioOf(card)
}

/** 文本卡估算正文行数：按近似像素宽换行，1–8 行。 */
function textBodyLines(card, columnWidth) {
  const width = textWidthPx(card?.title || '', TEXT_CHAR_PX)
  if (width === 0) return 1
  const perLine = Math.max(1, columnWidth - CARD_BORDER - TEXT_PAD_V)
  return Math.max(1, Math.min(TEXT_MAX_LINES, Math.ceil(width / perLine)))
}

const hasPill = (card) => Boolean(card?.velocity && String(card.velocity.text || '') !== '')

/**
 * 一张卡的估算高度（px，border-box，含上下各 1px 描边）。
 * 所有结果满足 ≥ 144px（§9.3 悬停层高度）。
 *
 * 这是本文件唯一的高度真源：`rivalPlacements` 的分列决策与 `top` 累加、
 * `RivalMasonry` 的容器高都消费同一个数——不再经过共享核心的
 * 「比例 → 卡身系数」换算（那是灵感库的口径，不是这个卡的几何）。
 * - `text`：24 + (胶囊?36) + 正文行数×20 + 描边 2
 * - `text-media`：24 + (胶囊?36) + 正文行数(≤3)×20 + 10 + (内宽−24) ÷ 媒体比 + 描边 2
 * - 媒体类：内宽 ÷ 媒体比 + 标题区(22 + 行数×18) + 描边 2；
 *   行数按真实换行估（≤2），不再恒取截断上限
 * @param {Record<string, any>} card
 * @param {number} columnWidth
 * @returns {number}
 */
export function rivalCardHeightPx(card, columnWidth) {
  const w = Number(columnWidth) > 0 ? Number(columnWidth) : RIVAL_MIN_COL_WIDTH
  const inner = Math.max(0, w - CARD_BORDER)
  const type = rivalCardTypeOf(card)
  if (type === 'text') {
    const lines = textBodyLines(card, w)
    return Math.max(RIVAL_MIN_CARD_HEIGHT, TEXT_PAD_V + (hasPill(card) ? PILL_ROW : 0) + lines * BODY_LINE + CARD_BORDER)
  }
  if (type === 'text-media') {
    const lines = Math.min(TEXT_MEDIA_BODY_LINES, textBodyLines(card, w))
    const mediaH = (inner - TEXT_PAD_V) / rivalMediaRatioOf(card)
    return Math.max(RIVAL_MIN_CARD_HEIGHT, TEXT_PAD_V + (hasPill(card) ? PILL_ROW : 0) + lines * BODY_LINE + TEXT_MEDIA_GAP + mediaH + CARD_BORDER)
  }
  const lines = titleLines(card, w, type)
  return inner / rivalMediaRatioOf(card) + TITLE_ZONE_PAD_V + lines * TITLE_LINE + CARD_BORDER
}

/**
 * 容器宽度 → 列数。`columnsForWidth` 代入 §9.3 常量后与规格公式
 * `max(2, min(6, floor((W + 16) / 236)))` 逐字等价。
 * @param {number} containerWidth
 * @returns {number}
 */
export function rivalColumnsForWidth(containerWidth) {
  return columnsForWidthCore(containerWidth, {
    minColWidth: RIVAL_MIN_COL_WIDTH,
    gap: RIVAL_GAP,
    minCols: RIVAL_MIN_COLS,
    maxCols: RIVAL_MAX_COLS,
  })
}

/**
 * 列宽（等分，§9.3）。
 * @param {number} containerWidth
 * @param {number} columns
 * @returns {number}
 */
export function rivalColumnWidth(containerWidth, columns) {
  const n = Math.max(RIVAL_MIN_COLS, Math.floor(Number(columns)) || RIVAL_MIN_COLS)
  return (containerWidth - RIVAL_GAP * (n - 1)) / n
}

/**
 * 逐张放入放置前底边最高的列（最短列；等高取最左）。
 *
 * 贪心决策调用共享核心，但**决策与 `top` 累加用同一个高度函数**：
 * `rivalCardHeightPx + RIVAL_GAP`。核心默认的「比例 → 卡身系数」口径只服务
 * 灵感库，直接拿它做放置会把两张卡的相对高度排错（两套度量的差值随卡型
 * 变化，错误只在 ≥2 排卡时才显形）。
 *
 * @param {Array<Record<string, any>>} cards
 * @param {number} columns
 * @param {number} columnWidth
 * @returns {{ placements: Map<string, {col:number, top:number, height:number}>, height: number, columnHeights: number[] }}
 */
export function rivalPlacements(cards, columns, columnWidth) {
  const w = Number(columnWidth) > 0 ? Number(columnWidth) : RIVAL_MIN_COL_WIDTH
  const list = Array.isArray(cards) ? cards : []
  const buckets = distributeColumnsCore(
    list,
    columns,
    undefined,
    (card) => rivalCardHeightPx(card, w) + RIVAL_GAP,
  )
  const placements = new Map()
  const columnHeights = []
  for (let col = 0; col < buckets.length; col += 1) {
    let top = 0
    for (const card of buckets[col]) {
      const height = rivalCardHeightPx(card, w)
      placements.set(placementKey(card), { col, top, height })
      top += height + RIVAL_GAP
    }
    columnHeights[col] = Math.max(0, top - RIVAL_GAP)
  }
  return {
    placements,
    height: columnHeights.length ? Math.max(...columnHeights) : 0,
    columnHeights,
  }
}

function placementKey(card) {
  return String(card?.id ?? '')
}
