import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  RIVAL_DEFAULT_IMAGE_RATIO,
  RIVAL_GAP,
  RIVAL_IMAGE_RATIO_MAX,
  RIVAL_IMAGE_RATIO_MIN,
  RIVAL_MIN_CARD_HEIGHT,
  RIVAL_MIN_COL_WIDTH,
  rivalCardHeightPx,
  rivalCardTypeOf,
  rivalColumnsForWidth,
  rivalMediaRatioOf,
  rivalPlacements,
  rivalRatioOf,
} from './rival-masonry.js'

/**
 * Thin adapter tests for the 账号监控 masonry.
 *
 * Two things this file deliberately does NOT do:
 *   - it never re-implements the shared greedy splitter to "verify" itself —
 *     instead every `rivalPlacements` case re-computes the column index from a
 *     spec-literal height model (the oracle below) and compares;
 *   - it never touches the DOM: the adapter must stay a pure function so media
 *     area can be reserved before any <img> loads (spec §9.3, V3/V7).
 */

/* ---------------------------------------------------------------- oracle */

/**
 * Spec-literal heights in px at `columnWidth` (spec §9.3 + §9.1).
 * This is the independent truth source: the formulas here come from the spec
 * table, not from the module under test, so a regression in the adapter shows.
 */
function oracleHeightPx(card, columnWidth) {
  const type = card.card_type || card.type
  if (type === 'text') {
    const chars = [...String(card.title || '')].length
    const perLine = Math.max(1, Math.floor((columnWidth - 24) / 14))
    const lines = Math.max(1, Math.min(8, Math.ceil(chars / perLine)))
    const pill = card.velocity ? 36 : 0
    return Math.max(144, 24 + pill + lines * 20)
  }
  if (type === 'text-media') {
    const mediaRatio = card.type === 'video' || card.media_kind === 'video'
      ? 16 / 9
      : clamp(Number.isFinite(card.ratio) ? card.ratio : 4 / 5, 0.8, 1.91)
    return Math.max(144, 24 + 36 + 60 + 10 + (columnWidth - 24) / mediaRatio)
  }
  const media = type === 'short-video' ? 9 / 16
    : type === 'long-video' ? 16 / 9
    : clamp(Number.isFinite(card.ratio) ? card.ratio : 4 / 5, 0.8, 1.91)
  const lines = type === 'long-video' ? 2 : 1
  return columnWidth / media + 24 + 18 * lines
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * The spec's own placement rule, re-derived per card: place into the column
 * with the smallest accumulated height; ties go to the leftmost column.
 */
function oracleColumns(cards, columns, columnWidth) {
  const bottoms = new Array(columns).fill(0)
  const heights = cards.map((card) => oracleHeightPx(card, columnWidth))
  const result = new Map()
  for (const card of cards) {
    let target = 0
    for (let i = 1; i < columns; i += 1) {
      if (bottoms[i] < bottoms[target]) target = i
    }
    result.set(card.id, { col: target, top: bottoms[target] })
    bottoms[target] += heights.shift() + 16
  }
  return result
}

/* ---------------------------------------------------------------- cards */

const mediaCard = (id, card_type, extra = {}) => ({
  id,
  card_type,
  title: `title-${id}`,
  ...extra,
})

const TEXT_LONG =
  '做了三个月 AI 视效，最大的体会是：镜头语言比模型更重要。同一段提示词，加上「低机位缓推」和「焦点从前景移到人物」，成片质感直接上一个台阶。很多人卡在画面抖、主体漂，其实是没给运动加约束。下周把团队内部在用的 12 种运镜模板整理出来，评论区告诉我你最想先看哪一种。'
const TEXT_SHORT = '角色一致性终于不用靠抽卡了：一张参考图，跨镜头保持同一张脸。'

/* ---------------------------------------------------------------- tests */

describe('rival-masonry — 卡片形态归一', () => {
  it('maps host types onto the five spec §9.1 shapes', () => {
    assert.equal(rivalCardTypeOf({ type: 'video', source_platform: 'tiktok' }), 'short-video')
    assert.equal(rivalCardTypeOf({ type: 'video', source_platform: 'youtube' }), 'long-video')
    assert.equal(rivalCardTypeOf({ type: 'image', source_platform: 'instagram' }), 'image')
    assert.equal(rivalCardTypeOf({ type: 'text', source_platform: 'x', has_media: false }), 'text')
    assert.equal(rivalCardTypeOf({ type: 'text', source_platform: 'x', has_media: true }), 'text-media')
  })

  it('keeps an already-normalized card_type verbatim', () => {
    for (const t of ['short-video', 'long-video', 'image', 'text', 'text-media']) {
      assert.equal(rivalCardTypeOf({ card_type: t }), t)
    }
  })

  it('falls back through the platform when the host type is missing', () => {
    assert.equal(rivalCardTypeOf({ source_platform: 'tiktok' }), 'short-video')
    assert.equal(rivalCardTypeOf({ source_platform: 'instagram' }), 'image')
    assert.equal(rivalCardTypeOf({ source_platform: 'x' }), 'text')
    assert.equal(rivalCardTypeOf({ source_platform: 'youtube' }), 'long-video')
    assert.equal(rivalCardTypeOf({}), 'short-video', 'unknown rows default to the tallest shape')
  })

  it('classifies X posts by media presence, never by duration alone', () => {
    // duration only means "a video may exist": a text post with an embedded
    // image still renders text-media. An X post with no media stays text.
    assert.equal(rivalCardTypeOf({ type: 'video', source_platform: 'x', media_kind: 'image' }), 'text-media')
    assert.equal(rivalCardTypeOf({ type: 'image', source_platform: 'x' }), 'text-media')
  })
})

describe('rival-masonry — 媒体比例', () => {
  it('uses the fixed ratios of the two video shapes', () => {
    assert.equal(rivalMediaRatioOf({ card_type: 'short-video' }), 9 / 16)
    assert.equal(rivalMediaRatioOf({ card_type: 'long-video' }), 16 / 9)
  })

  it('clamps image ratio into the spec §9.1 interval (4:5 … 1.91:1), missing → 4:5', () => {
    assert.equal(rivalMediaRatioOf({ card_type: 'image', ratio: null }), 4 / 5)
    assert.equal(rivalMediaRatioOf({ card_type: 'image', ratio: 0.5 }), 0.8, 'taller than 4:5 crops at 4:5')
    assert.equal(rivalMediaRatioOf({ card_type: 'image', ratio: 3 }), 1.91, 'wider than 1.91:1 crops at 1.91:1')
    assert.equal(rivalMediaRatioOf({ card_type: 'image', ratio: 1 }), 1)
    assert.equal(RIVAL_IMAGE_RATIO_MIN, 0.8)
    assert.equal(RIVAL_IMAGE_RATIO_MAX, 1.91)
    assert.equal(RIVAL_DEFAULT_IMAGE_RATIO, 0.8)
  })

  it('text-media uses 16:9 for video and the image interval for pictures', () => {
    assert.equal(rivalMediaRatioOf({ card_type: 'text-media', media_kind: 'video' }), 16 / 9)
    assert.equal(rivalMediaRatioOf({ card_type: 'text-media', media_kind: 'image', ratio: 2.4 }), 1.91)
    assert.equal(rivalMediaRatioOf({ card_type: 'text-media', ratio: null }), 16 / 9, 'missing kind defaults to the video ratio')
  })

  it('rivalRatioOf returns the media ratio for media cards, columnWidth/height for text', () => {
    assert.equal(rivalRatioOf({ card_type: 'image', ratio: 1 }, 220), 1)
    const r = rivalRatioOf({ card_type: 'text', title: TEXT_SHORT }, 220)
    assert.ok(r > 1, 'a short tweet is wider than tall under the min-height floor')
    assert.ok(Math.abs(r - 220 / 144) < 1e-9)
  })
})

describe('rival-masonry — 高度估算（§9.3 参考值护栏）', () => {
  it('long tweet (#11, 134 chars, with pill) ≈ 220px at 220px column', () => {
    const h = rivalCardHeightPx({ card_type: 'text', title: TEXT_LONG, velocity: { text: '飙升 2.6k/h' } }, 220)
    assert.equal(h, 24 + 36 + 8 * 20, 'spec §9.3: pill row 28+8 + 8 lines × 20 + padding')
    assert.ok(h <= 220 + 1e-9 && h > 200, 'must sit at the spec ceiling, not above it')
  })

  it('short tweet (#12, 30 chars) clamps at the 144px floor', () => {
    const h = rivalCardHeightPx({ card_type: 'text', title: TEXT_SHORT, velocity: { text: '观察 260/h' } }, 220)
    assert.equal(h, RIVAL_MIN_CARD_HEIGHT)
    assert.equal(RIVAL_MIN_CARD_HEIGHT, 144)
  })

  it('text-card without a pill does not reserve the pill row', () => {
    const h = rivalCardHeightPx({ card_type: 'text', title: TEXT_SHORT }, 220)
    assert.equal(h, 144, '24 + 3×20 = 84 → floor 144')
  })

  it('text-media estimate lands at the spec ≈238px', () => {
    const h = rivalCardHeightPx({ card_type: 'text-media', media_kind: 'video', title: 'x'.repeat(140) }, 220)
    assert.ok(Math.abs(h - (24 + 36 + 60 + 10 + (220 - 24) / (16 / 9))) < 1e-9)
    assert.ok(h < 250 && h > 230, 'spec: text-media ≈ 238px at 220px')
  })

  it('media cards: media height + title zone (long-video 2 lines, others 1)', () => {
    const w = 220
    assert.ok(Math.abs(rivalCardHeightPx({ card_type: 'short-video' }, w) - (w / (9 / 16) + 42)) < 1e-9)
    assert.ok(Math.abs(rivalCardHeightPx({ card_type: 'long-video' }, w) - (w / (16 / 9) + 60)) < 1e-9)
    assert.ok(Math.abs(rivalCardHeightPx({ card_type: 'image', ratio: null }, w) - (w / 0.8 + 42)) < 1e-9)
  })
})

describe('rival-masonry — 列数断点（§9.3 断点表）', () => {
  it('container width → columns across every spec boundary', () => {
    const cases = [
      [300, 2], [691, 2], [692, 3], [927, 3], [928, 4],
      [1163, 4], [1164, 5], [1399, 5], [1400, 6], [2000, 6],
    ]
    for (const [width, expected] of cases) {
      assert.equal(
        rivalColumnsForWidth(width),
        expected,
        `width ${width}px must give ${expected} columns`,
      )
    }
    assert.equal(RIVAL_MIN_COL_WIDTH, 220)
    assert.equal(RIVAL_GAP, 16)
  })

  it('column width never drops below 220px when width is finite', () => {
    for (const width of [692, 928, 1164, 1400]) {
      const n = rivalColumnsForWidth(width)
      const colW = (width - 16 * (n - 1)) / n
      assert.ok(colW >= 220, `width ${width} produced column ${colW}px`)
    }
  })
})

describe('rival-masonry — rivalPlacements 最短列放置', () => {
  it('places the first row across columns 0..n-1 and later cards into the shortest column', () => {
    const w = 220
    const cards = [
      mediaCard('a', 'short-video'),
      mediaCard('b', 'long-video'),
      mediaCard('c', 'image'),
      { id: 'd', card_type: 'text', title: TEXT_SHORT, velocity: { text: '观察 260/h' } },
      mediaCard('e', 'text-media', { media_kind: 'video', title: 'x'.repeat(60) }),
      mediaCard('f', 'image', { ratio: 1 }),
      mediaCard('g', 'short-video'),
    ]
    const expected = oracleColumns(cards, 3, w)
    const { placements } = rivalPlacements(cards, 3, w)
    for (const card of cards) {
      const e = expected.get(card.id)
      const p = placements.get(card.id)
      assert.ok(p, `card ${card.id} missing a placement`)
      assert.equal(p.col, e.col, `card ${card.id} column`)
      assert.ok(Math.abs(p.top - e.top) <= 1, `card ${card.id} top ${p.top} vs oracle ${e.top}`)
    }
  })

  it('ties go to the leftmost column', () => {
    const w = 220
    const cards = [
      mediaCard('a', 'long-video'),   // 183.75
      mediaCard('b', 'long-video'),   // 183.75
      mediaCard('c', 'image'),        // column heights tie at col2 being empty anyway
      mediaCard('d', 'image', { ratio: 1 }), // col heights: a=199.75,b=199.75,c=262 → d → shortest a (0)
      mediaCard('e', 'short-video'),
    ]
    const { placements } = rivalPlacements(cards, 3, w)
    assert.equal(placements.get('a').col, 0)
    assert.equal(placements.get('b').col, 1)
    assert.equal(placements.get('c').col, 2)
    // After the first three: bottoms are ~199.75, ~199.75, ~301 → 'd' sees a tie
    // between col0 and col1 (identical long-video heights) and must take col0.
    assert.equal(placements.get('d').col, 0)
    assert.equal(placements.get('e').col, 1)
  })

  it('earlier cards never move when new cards arrive (append stability)', () => {
    const w = 220
    const first = [
      mediaCard('a', 'short-video'),
      mediaCard('b', 'long-video'),
      mediaCard('c', 'image'),
    ]
    const withMore = [...first, mediaCard('d', 'image', { ratio: 1 }), mediaCard('e', 'text-media', { media_kind: 'video' })]
    const before = rivalPlacements(first, 3, w).placements
    const after = rivalPlacements(withMore, 3, w).placements
    for (const card of first) {
      assert.equal(after.get(card.id).col, before.get(card.id).col, `${card.id} moved columns`)
      assert.equal(after.get(card.id).top, before.get(card.id).top, `${card.id} moved vertically`)
    }
  })

  it('container height covers the tallest column and every card stays ≥144px tall', () => {
    const w = 220
    const cards = [
      mediaCard('a', 'short-video'),
      { id: 'b', card_type: 'text', title: TEXT_SHORT },
      mediaCard('c', 'image'),
      mediaCard('d', 'long-video'),
    ]
    const { placements, height } = rivalPlacements(cards, 2, w)
    const maxBottom = Math.max(...[...placements.values()].map((p) => p.top + p.height))
    assert.equal(height, maxBottom, 'container must cover the tallest column without a trailing gap')
    for (const card of cards) {
      assert.ok(placements.get(card.id).height >= 144, `${card.id} below the 144px floor`)
    }
  })
})
