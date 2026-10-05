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

/** 文本卡几何（§9.1/§9.3）：内边距 12×2、胶囊行 28 + 间距 8、正文行高 20。 */
const TEXT_PAD_V = 24
const PILL_ROW = 28 + 8
const BODY_LINE = 20
const TEXT_MAX_LINES = 8
const TEXT_MEDIA_BODY_LINES = 3
const TEXT_MEDIA_GAP = 10
/** 14px 正文、中文按 1 字宽计的每行字数：floor((columnWidth − 24) / 14)。 */
const TEXT_CHAR_PX = 14

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
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
 * 比例（资产层 MASONRY_AUDIO_RATIO 的同款手法），让无媒体卡也能进入
 * 共享核心的「卡 → 比例」接口。
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

/** 文本卡估算正文行数：字数 ÷ 每行字数，1–8 行。 */
function textBodyLines(card, columnWidth) {
  const chars = [...String(card?.title || '')].length
  if (chars === 0) return 1
  const perLine = Math.max(1, Math.floor((columnWidth - TEXT_PAD_V) / TEXT_CHAR_PX))
  return Math.max(1, Math.min(TEXT_MAX_LINES, Math.ceil(chars / perLine)))
}

const hasPill = (card) => Boolean(card?.velocity && String(card.velocity.text || '') !== '')

/**
 * 一张卡的估算高度（px）。所有结果满足 ≥ 144px（§9.3 悬停层高度）。
 * - `text`：24 + (胶囊?36) + 行数×20
 * - `text-media`：24 + 36 + 3×20 + 10 + (columnWidth−24) ÷ 媒体比
 * - 媒体类：columnWidth ÷ 媒体比 + 24 + 18 × 标题行数（long-video 2 行，其余 1 行）
 * @param {Record<string, any>} card
 * @param {number} columnWidth
 * @returns {number}
 */
export function rivalCardHeightPx(card, columnWidth) {
  const w = Number(columnWidth) > 0 ? Number(columnWidth) : RIVAL_MIN_COL_WIDTH
  const type = rivalCardTypeOf(card)
  if (type === 'text') {
    const lines = textBodyLines(card, w)
    return Math.max(RIVAL_MIN_CARD_HEIGHT, TEXT_PAD_V + (hasPill(card) ? PILL_ROW : 0) + lines * BODY_LINE)
  }
  if (type === 'text-media') {
    const mediaH = (w - TEXT_PAD_V) / rivalMediaRatioOf(card)
    return Math.max(RIVAL_MIN_CARD_HEIGHT, TEXT_PAD_V + PILL_ROW + TEXT_MEDIA_BODY_LINES * BODY_LINE + TEXT_MEDIA_GAP + mediaH)
  }
  const lines = type === 'long-video' ? 2 : 1
  return w / rivalMediaRatioOf(card) + TEXT_PAD_V + 18 * lines
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
 * 贪心决策只调用共享核心；`top` 用「估算卡高 + gap」按桶内顺序累加——
 * 核心的卡身系数只服务灵感库，这里的累计高度必须来自本适配层自己的
 * 估算，两者不可混用。
 *
 * @param {Array<Record<string, any>>} cards
 * @param {number} columns
 * @param {number} columnWidth
 * @returns {{ placements: Map<string, {col:number, top:number, height:number}>, height: number, columnHeights: number[] }}
 */
export function rivalPlacements(cards, columns, columnWidth) {
  const w = Number(columnWidth) > 0 ? Number(columnWidth) : RIVAL_MIN_COL_WIDTH
  const list = Array.isArray(cards) ? cards : []
  const buckets = distributeColumnsCore(list, columns, (card) => rivalRatioOf(card, w))
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
