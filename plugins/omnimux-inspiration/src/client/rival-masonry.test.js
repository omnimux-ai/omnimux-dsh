import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  rivalWrapLines,
  RIVAL_GLYPH_WIDTH_FACTOR,
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
import { RIVAL_CSS } from './rival-styles.js'

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
 *
 * Geometry is border-box: the card carries 1px top + 1px bottom border (2px),
 * media/title zones use the inner width (columnWidth − 2), and line counts are
 * approximated per rendered text width (CJK ≈ font-size, ASCII ≈ 0.55×).
 */
/**
 * Word-boundary line model mirroring the implementation's `rivalWrapLines`:
 * CJK characters break per character, runs of half-width characters are
 * unbreakable words, line-trailing whitespace is swallowed, and an overlong
 * word occupies one line (overflow:hidden truncation). Kept formula-identical
 * by design: this layer asserts「决策与给定几何一致」— geometry correctness
 * is carried by the real-browser measurement, not by this oracle.
 */
function oracleWrapLines(text, unit, lineWidth) {
  const width = Math.max(1, lineWidth)
  const atoms = []
  let open = null
  for (const ch of String(text || '')) {
    const cp = ch.codePointAt(0)
    if (/[ \t\n\r\f\v]/.test(ch)) { open = null; atoms.push({ space: true }); continue }
    if (cp === 0x00a0 || cp === 0x202f || cp === 0xfeff || cp === 0x2060) {
      if (!open) { open = { word: '' }; atoms.push(open) }
      open.word += ch
      continue
    }
    if (cp > 0x2e7f) { open = null; atoms.push({ cjk: ch }); continue }
    if (!open) { open = { word: '' }; atoms.push(open) }
    open.word += ch
    if (cp === 0x2d || cp === 0x2010) open = null
  }
  let lines = 1
  let used = 0
  let pending = false
  for (const atom of atoms) {
    if (atom.space) { pending = true; continue }
    const w = atom.cjk ? unit : [...atom.word].reduce((s, c) => s + unit * 0.55, 0)
    const glue = pending && used > 0 ? unit * 0.55 : 0
    pending = false
    if (used === 0) { used = Math.min(w, width); continue }
    if (used + glue + w <= width) { used += glue + w; continue }
    lines += 1
    used = Math.min(w, width)
  }
  return lines
}

function oracleHeightPx(card, columnWidth) {
  const inner = columnWidth - 2
  const type = card.card_type || card.type
  // The pill row exists only when velocity carries a non-empty text — the same
  // predicate the render layer and the estimate now share (R4-1).
  const pill = card.velocity && String(card.velocity.text || '') !== '' ? 36 : 0
  if (type === 'text') {
    const lines = Math.max(1, Math.min(8, oracleWrapLines(card.title, 14, inner - 24)))
    return Math.max(144, 24 + pill + lines * 20 + 2)
  }
  if (type === 'text-media') {
    const mediaRatio = card.type === 'video' || card.media_kind === 'video'
      ? 16 / 9
      : clamp(Number.isFinite(card.ratio) ? card.ratio : 4 / 5, 0.8, 1.91)
    const lines = Math.max(1, Math.min(3, oracleWrapLines(card.title, 14, inner - 24)))
    return Math.max(144, 24 + pill + lines * 20 + 10 + (inner - 24) / mediaRatio + 2)
  }
  const media = type === 'short-video' ? 9 / 16
    : type === 'long-video' ? 16 / 9
    : clamp(Number.isFinite(card.ratio) ? card.ratio : 4 / 5, 0.8, 1.91)
  const lines = Math.max(1, Math.min(2, oracleWrapLines(card.title, 13, columnWidth - 26)))
  return Math.max(144, inner / media + 22 + 18 * lines + 2)
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
  it('long tweet (#11, 134 chars, with pill) ≈ 222px at 220px column', () => {
    const h = rivalCardHeightPx({ card_type: 'text', title: TEXT_LONG, velocity: { text: '飙升 2.6k/h' } }, 220)
    assert.equal(h, 24 + 36 + 8 * 20 + 2, '§9.3: 24 padding + pill row 28+8 + 8 lines × 20 + border 2')
    assert.ok(h <= 222 + 1e-9 && h > 200, 'must sit at the spec ceiling (≈220), not above it')
  })

  it('short tweet (#12, 30 chars) clamps at the 144px floor', () => {
    const h = rivalCardHeightPx({ card_type: 'text', title: TEXT_SHORT, velocity: { text: '观察 260/h' } }, 220)
    assert.equal(h, RIVAL_MIN_CARD_HEIGHT)
    assert.equal(RIVAL_MIN_CARD_HEIGHT, 144)
  })

  it('text-card without a pill does not reserve the pill row', () => {
    const h = rivalCardHeightPx({ card_type: 'text', title: TEXT_SHORT }, 220)
    assert.equal(h, 144, '24 + 3×20 + 2 = 86 → floor 144')
  })

  it('text-media estimate lands at the spec ≈238px', () => {
    // 30 个 CJK 字逐字可断 → 3 行封顶；不可断的纯 ASCII 长词只占 1 行
    //（R4 词边界模型，另有专项断言覆盖）。
    const h = rivalCardHeightPx({ card_type: 'text-media', media_kind: 'video', title: '横'.repeat(30), velocity: { text: '飙升 1.2k/h' } }, 220)
    assert.ok(Math.abs(h - (24 + 36 + 60 + 10 + (220 - 26) / (16 / 9) + 2)) < 1e-9)
    assert.ok(h < 250 && h > 230, 'spec: text-media ≈ 238px at 220px')
  })

  it('media cards: inner media height + title zone + border (long-video wraps to 2 lines)', () => {
    const w = 220
    const inner = w - 2
    assert.ok(Math.abs(rivalCardHeightPx({ card_type: 'short-video' }, w) - (inner / (9 / 16) + 22 + 18 + 2)) < 1e-9)
    assert.ok(Math.abs(rivalCardHeightPx({ card_type: 'long-video', title: '评'.repeat(30) }, w) - (inner / (16 / 9) + 22 + 36 + 2)) < 1e-9)
    assert.ok(Math.abs(rivalCardHeightPx({ card_type: 'image', ratio: null }, w) - (inner / 0.8 + 22 + 18 + 2)) < 1e-9)
  })

  it('a short long-video title stays one line — the clamp is a cap, not a constant', () => {
    const w = 220
    const inner = w - 2
    // §9.4 #2/#9：两行截断上限不等于两行占位——QA D1 实测这两张只有 1 行。
    assert.ok(
      Math.abs(rivalCardHeightPx({ card_type: 'long-video', title: '2026 十款智能喂食器横评' }, w) - (inner / (16 / 9) + 22 + 18 + 2)) < 1e-9,
      'short titles render a single line even though the clamp allows two',
    )
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

/* --------------------------- R4：估算层建模缺陷 --------------------------- */

describe('rival-masonry — R4 胶囊行判据收敛（复审 ①）', () => {
  it('velocity 是对象但 text 为空 → 与无胶囊同高，不预留 36px', () => {
    // 判据必须与 VelocityPill 的早退（!text → null）一致；否则渲染层真值
    // velocity 时仍会渲染空 pill-row，卡片比估算高 36px，同列下方卡片重叠。
    const bare = { card_type: 'text', title: TEXT_LONG }
    for (const velocity of [{}, { text: '' }, { tier: 'watch' }]) {
      const h = rivalCardHeightPx({ ...bare, velocity }, 220)
      assert.equal(h, rivalCardHeightPx(bare, 220), `velocity=${JSON.stringify(velocity)} must not reserve the pill row`)
      assert.equal(h, 24 + 8 * 20 + 2, 'no 36px pill reservation')
    }
  })

  it('velocity.text 非空 → 预留 36px（正向钉住，防反向回归）', () => {
    const h = rivalCardHeightPx({ card_type: 'text', title: TEXT_LONG, velocity: { text: '飙升 2.6k/h' } }, 220)
    assert.equal(h, 24 + 36 + 8 * 20 + 2)
  })
})

describe('rival-masonry — R4 词边界换行模型（复审 ②）', () => {
  it('词装行：8 个 hashtag 在 220px 列占 8 行（逐字符密排会少估）', () => {
    const title = Array(8).fill('#sundayfunday').join(' ')
    // 每个 hashtag ≈ 12×14×0.55 ≈ 92.4px + 空格 7.7px；行宽 220-2-24=194px，
    // 每行只能装 2 个词（密排估 ≈5 行，真实词边界换行 = 8 行）。
    assert.equal(rivalWrapLines(title, 14, 194), 8)
    assert.equal(rivalCardHeightPx({ card_type: 'text', title }, 220), 24 + 8 * 20 + 2)
  })

  it('超行宽单词占 1 行不折行（overflow:hidden 截断行为）', () => {
    const url = 'https://x.com/someone/status/1234567890?ref_src=twsrc%5Etfw%7Ctwcamp'
    // 77 个 ASCII 字符（无连字符）≈ 590px ≫ 194px 行宽：CSS 不折词。
    // R7-① 修正断言：'?' 是 EX 断后码位，Chrome 实测此串 2 行（在 '?' 后
    // 断出 "ef_src=…" 一行）——1 行期望建立在「无断后码位」的旧模型上。
    assert.equal(rivalWrapLines(url, 14, 194), 2)
    // 对照：不含断后码位的纯长词仍 1 行截断。
    const plain = 'https://x.com/someone/status/1234567890/extra/segment/path'
    assert.equal(rivalWrapLines(plain, 14, 194), 1)
    const h = rivalCardHeightPx({ card_type: 'text-media', media_kind: 'video', title: url }, 220)
    assert.ok(Math.abs(h - (24 + 2 * 20 + 10 + (220 - 26) / (16 / 9) + 2)) < 1e-9,
      `two-line estimate after EX break, got ${h}`)
  })

  it('中文正文仍是逐字可断（回归：既有中文夹具结果不变）', () => {
    assert.equal(rivalCardHeightPx({ card_type: 'text', title: TEXT_LONG }, 220), 24 + 8 * 20 + 2)
    assert.equal(rivalCardHeightPx({ card_type: 'text', title: TEXT_SHORT }, 220), 144)
  })

  it('混合文本：CJK 与拉丁片段交界处可断行', () => {
    // "混 合" 间空格 + CJK 逐字 → 不会把整段当成不可断长词。
    const title = '发布workflow更新后 pipeline 依然稳定'
    const lines = rivalWrapLines(title, 14, 194)
    assert.ok(lines >= 2, `mixed text should wrap at CJK/Latin boundaries, got ${lines}`)
  })
})

describe('rival-masonry — R5 连字符断行与不换行空格（复审 ④⑤）', () => {
  it('连字符后可断行：6 段连字符长词不再按一个不可断词估算', () => {
    // UAX#14：浏览器在 '-' 之后可断行。把整串当一个不可断词会严重少算行数
    // （QA 41 卡夹具 w1 在 194px 行宽实测：连字符模型 5 行、Chrome 4 行；
    // 旧整词模型估算 1 行会被 144px 下限吞掉——F-1：此处「整词模型 1 行 /
    // 生产 196px 实测 4 行」的旧注释数字不可复现，已按 194px 口径改写）。
    const word = 'state-of-the-art-video-pipeline-for-vfx-shot-generation-workflow'
    const lines = rivalWrapLines(word, 14, 194)
    assert.ok(lines >= 2, `hyphenated word must be allowed to break after '-', got ${lines}`)
  })

  it('连字符断行使高连字符词不再少算：估算行数与实测行数同量级', () => {
    // 8 段各 ≈6 字符的连字符串：每段 ≈ 6×14×0.55 ≈ 46px，
    // 行宽 194px 每行约 4 段 → 3 行，而不是把 370px 当 1 行截断。
    const word = 'abcdef-abcdef-abcdef-abcdef-abcdef-abcdef-abcdef-abcdef'
    assert.ok(rivalWrapLines(word, 14, 194) >= 3, 'six-segment hyphenated word must wrap, not truncate to one line')
  })

  it('不换行空格（NBSP / NNBSP / WJ）不可断行、不产生断点', () => {
    // U+00A0/U+202F/U+FEFF 是"不换行空格"：浏览器不在这里断行，且宽度保留。
    // `\s` 会把它们误当可断空白 → 实测 1 行的串被模型算成多行。
    const nbsp = `aaa${' '}bbb${' '}ccc`
    assert.equal(rivalWrapLines(nbsp, 14, 194), 1, 'NBSP must not act as a breakable space')
    const narrowNoBreak = `aaa${' '}bbb${' '}ccc`
    assert.equal(rivalWrapLines(narrowNoBreak, 14, 60), 1, 'NBSP-joined words stay glued even past line width (overflow)')
    const wj = `aaa${'﻿'}bbb`
    assert.equal(rivalWrapLines(wj, 14, 194), 1, 'FEFF (word joiner) is part of the word, never a break')
  })
})

describe('rival-masonry — R6 断行码位全集（复审 ① 回归）', () => {
  // 红证据要求：R5 把空白判定收窄成 /[ \t\n\r\f\v]/ 后，下列 UAX#14 BA/ZW/BK
  // 码位被并入词内 → 整串当不可断词估成 1 行。本套件逐个码位钉住分类；
  // Chrome 真机对照由 harness/codepoint-probe.mjs 执行。
  it('UAX#14 BA 全宽/窄空格一律可断行（U+1680, 2000–2006, 2008–200A, 205F）', () => {
    const BA = ['1680', '2000', '2001', '2002', '2003', '2004', '2005', '2006', '2008', '2009', '200a', '205f']
    for (const hex of BA) {
      const sep = String.fromCodePoint(parseInt(hex, 16))
      const text = ['alpha', 'bravo', 'charlie', 'delta', 'echo'].join(sep)
      const lines = rivalWrapLines(text, 14, 130)
      assert.ok(lines >= 2, `U+${hex.toUpperCase()} must be a breakable space, got ${lines}`)
    }
  })

  it('U+200B 是零宽可断点：不增宽度但允许断行', () => {
    const text = ['onetwothree', 'fourfivesix', 'seveneightnine', 'teneleventwelve'].join('​')
    // （上一行 join 的参数是字面 U+200B）
    const lines = rivalWrapLines(text, 14, 130)
    assert.ok(lines >= 2, `U+200B must allow a line break, got ${lines}`)
  })

  it('U+2028 / U+2029 在 Chrome 按可折叠空白断行（实测 5 词窄行 2 行而非 5 行）', () => {
    // Chrome 把它们当断行机会（white-space:normal 下与 \n 同行为），不是
    // UAX#14 的强制换行——模型按可折叠空白对齐真机。
    const sep28 = String.fromCodePoint(0x2028)
    const sep29 = String.fromCodePoint(0x2029)
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo']
    assert.equal(rivalWrapLines(`aa${sep28}bb`, 14, 194), 1, 'fits on one line: collapsible break, not a forced line')
    assert.ok(rivalWrapLines(words.join(sep28), 14, 130) >= 2, 'U+2028 must allow a break')
    assert.ok(rivalWrapLines(words.join(sep29), 14, 130) >= 2, 'U+2029 must allow a break')
  })

  it('不可断集合保持：U+00A0 / U+202F / U+FEFF / U+2060 / U+2007 并入词内', () => {
    for (const hex of ['00a0', '202f', 'feff', '2060', '2007']) {
      const sep = String.fromCodePoint(parseInt(hex, 16))
      const text = `aaa${sep}bbb${sep}ccc`
      const lines = rivalWrapLines(text, 14, 60)
      assert.equal(lines, 1, `U+${hex.toUpperCase()} must stay inside the word (no break), got ${lines}`)
    }
  })

  it('U+3000 仍走 CJK 分支、U+2011 留在词内（既有行为不变）', () => {
    const ideographic = `中　文　空　格　分　隔`
    const lines = rivalWrapLines(ideographic, 14, 44)
    assert.ok(lines >= 2, `U+3000/CJK chars must allow breaks, got ${lines}`)
    const nbh = `aaa‑bbb`
    assert.equal(rivalWrapLines(nbh, 14, 60), 1, 'U+2011 non-breaking hyphen stays in the word')
  })
})

describe('rival-masonry — R4 媒体卡最小高度下限（复审 ③）', () => {
  it('列宽 <220 时媒体卡估算仍 ≥144（CSS min-height 对所有卡生效）', () => {
    // 列宽 190：inner 188 / 1.91 + 22 + 18 + 2 ≈ 140.4 → 需钳到 144。
    const h = rivalCardHeightPx({ card_type: 'image', ratio: 1.91, title: 'x' }, 190)
    assert.ok(h >= RIVAL_MIN_CARD_HEIGHT, `media card must respect the 144px floor, got ${h}`)
    assert.equal(h, RIVAL_MIN_CARD_HEIGHT)
  })
})

/* --------------------------- R7：判据迁入套件 + 锁表 --------------------------- */

describe('rival-masonry — R7 断行判据迁入套件（QA Q1/Q4 阻塞）', () => {
  // 判据与实现解耦：本清单按 UAX#14 类表（官方 LineBreak.txt）枚举，
  // 不是照模型自身的断行集合挑的——QA 第 5 轮的教训正是「判据只活在外部
  // 脚本且码位清单不含 ?」，导致 EX 缺口零鉴别力。Chrome 实测行为见
  // harness/codepoint-probe.mjs 与 R7 报告（qa5-sy-probe / r7 探针输出）。
  //
  // 逐码位探针法（与 Chrome 对照同一口径）：等长词窄行 → 可断分隔符给
  // 多行，粘住给 1 行。

  it('UAX#14 EX 断后机会：? 及同类叹问号后允许断行（Q1 红证据）', () => {
    // QA 定点实验：Chrome 在 URL 查询串 '?' 之后断行（lines-dump 逐行原文
    // "…/cinematic?" 行尾），'?' 换成 '/'、'+' 不换、换成 '-' 换 →
    // 断点在 EX 不在字符形态。'!' 是 Chrome 对 UAX#14 的定制（不断），见下条。
    const EX_BREAK_AFTER = ['003f', '05c6', '061b', '061f', '06d4', '07f9',
      '1945', '2762', '2cf9', '2cfe', '2e2e', '2e53', 'a60e', 'fe56']
    for (const hex of EX_BREAK_AFTER) {
      const sep = String.fromCodePoint(parseInt(hex, 16))
      const text = `aa${sep}bbbbbbbb`
      const lines = rivalWrapLines(text, 14, 60)
      assert.ok(lines >= 2, `U+${hex.toUpperCase()} (EX) must allow a break AFTER it — got ${lines} (Chrome 实测 2 行)`)
    }
  })

  it('UAX#14 HH / HY / B2 连字符族断后机会（含 QA 漏码位清单）', () => {
    // QA/OCR 第 5 轮清单：00AD 058A 05BE 1400 2E17 2E40 2013 2014——其中
    // 00AD/058A/05BE/1400/2E17/2E40 在官方 LineBreak.txt 属 HH（hyphen）、
    // 2014 属 B2、2013 属 BA；HH/B2 与 HY(002D)/2010 同为「断后」语义，
    // Chrome 对整族实测均断（R7 探针 8/8）。
    const HYPHEN_AFTER = {
      HH: ['00ad', '058a', '05be', '1400', '2010', '2e17', '2e40'],
      HY: ['002d'],
      B2: ['2014'],
    }
    for (const [cls, list] of Object.entries(HYPHEN_AFTER)) {
      for (const hex of list) {
        const sep = String.fromCodePoint(parseInt(hex, 16))
        const text = `aa${sep}bbbbbbbb`
        const lines = rivalWrapLines(text, 14, 60)
        assert.ok(lines >= 2, `U+${hex.toUpperCase()} (${cls}) must allow a break after — got ${lines}`)
      }
    }
  })

  it('UAX#14 BA 非空格码位断后机会（官方 LineBreak.txt 全枚举，≤BMP）', () => {
    // 断行集合漏掉的 BA：竖线、各文字 danda/节标点、连字符点等——按类表全
    // 枚举而不是手选「像空格」的码位。空格族（1680/2000-200A/205F/3000/0009）
    // 已由 R6 用例覆盖，这里钉「词内」成员。
    const BA_AFTER = ['0964', '0965', '0e5a', '0e5b', '0f0b', '0f34',
      '0f7f', '0f85', '0fbe', '0fbf', '0fd2', '104a', '104b', '1361', '16eb',
      '16ec', '16ed', '1735', '1736', '17d4', '17d5', '17d8', '17da', '1804',
      '1805', '1b4e', '1b4f', '1b5a', '1b5b', '1b5d', '1b5e', '1b5f', '1b60',
      '1b7d', '1b7e', '1b7f', '1c3b', '1c3c', '1c3d', '1c3e', '1c3f', '1c7e',
      '1c7f', '2012', '2013', '2027', '2056', '2058', '2059', '205a', '205b',
      '205d', '205e', '2800', '2cfa', '2cfb', '2cfc', '2cff', '2d70', '2e0e',
      '2e0f', '2e10', '2e11', '2e12', '2e13', '2e14', '2e15', '2e19', '2e2a',
      '2e2b', '2e2c', '2e2d', '2e30', '2e31', '2e33', '2e34', '2e3c', '2e3d',
      '2e3e', '2e41', '2e43', '2e44', '2e45', '2e46', '2e47', '2e48', '2e49',
      '2e4a', '2e4c', '2e4e', '2e4f', 'a4fe', 'a4ff', 'a60d', 'a60f', 'a6f3',
      'a6f4', 'a6f5', 'a6f6', 'a6f7', 'a8ce', 'a8cf', 'a92e', 'a92f', 'a9c7',
      'a9c8', 'a9c9', 'a9cf', 'aa40', 'aa41', 'aa42', 'aa44', 'aa45', 'aa46',
      'aa47', 'aa48', 'aa49', 'aa4a', 'aa4b', 'aa5d', 'aa5e', 'aa5f', 'aaf0',
      'aaf1', 'abeb']
    for (const hex of BA_AFTER) {
      const sep = String.fromCodePoint(parseInt(hex, 16))
      const text = `aa${sep}bbbbbbbb`
      const lines = rivalWrapLines(text, 14, 60)
      assert.ok(lines >= 2, `U+${hex.toUpperCase()} (BA) must allow a break after — got ${lines}`)
    }
  })

  it('UAX#14 BK/ZW 保持可断；U+000C 对齐 Chrome 实测（不断行，Q2）', () => {
    // BK 的 {000B,000C} 是规范上的强制换行，但 Chrome 对 VT/FF 实测均不断行
    //（R7 探针 chrome=1）——模型按真机不按规范名头。2028/2029 的 Chrome 行为
    // 是断行机会（R6 已钉）。ZW=200B。
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo']
    const ls = String.fromCodePoint(0x2028)
    const ps = String.fromCodePoint(0x2029)
    const zw = String.fromCodePoint(0x200b)
    assert.ok(rivalWrapLines(words.join(ls), 14, 130) >= 2, 'U+2028 keeps break')
    assert.ok(rivalWrapLines(words.join(ps), 14, 130) >= 2, 'U+2029 keeps break')
    assert.ok(rivalWrapLines(words.join(zw), 14, 130) >= 2, 'U+200B ZW keeps break')
    const ff = String.fromCodePoint(0x000c)
    assert.equal(rivalWrapLines(`aaa${ff}bbb`, 14, 60), 1, 'U+000C form feed: Chrome 实测不断行，模型必须一致')
    const vt = String.fromCodePoint(0x000b)
    assert.equal(rivalWrapLines(`aaa${vt}bbb`, 14, 60), 1, 'U+000B vertical tab stays glued')
  })

  it('UAX#14 GL/WJ 不并入断后集合：NBSP/NNBSP/FIGURE/2011/180E/WJ 不断', () => {
    const NO_BREAK = ['00a0', '202f', '2007', '2011', '180e', '2060', 'feff']
    for (const hex of NO_BREAK) {
      const sep = String.fromCodePoint(parseInt(hex, 16))
      const text = `aaa${sep}bbb`
      assert.equal(rivalWrapLines(text, 14, 60), 1, `U+${hex.toUpperCase()} must stay glued, got a break`)
    }
  })

  it('U+0021 / U+007C 是 Chrome 对 UAX#14 的定制：不断后（红绿边界钉住防误加）', () => {
    // UAX#14 把 '!' 与 '?' 同列 EX，但 Chrome 实测 '!' 之后不断行（词中上下文
    // 与 5 词窄行两种探针均 chrome=1）；QA 报告注明其 '!'/EX 推断未真机实证。
    // 本断言把真机口径钉死：模型不得对 '!' 加断后，否则方向性高估。
    assert.equal(rivalWrapLines('aa!bbbbbbbb', 14, 60), 1, "U+0021: Chrome 不断后，模型不得按 EX 断（规范/真机分歧已登记）")
    // U+007C 同为 BA 但 Chrome 实测不断后（codepoint-probe chrome=1）。
    assert.equal(rivalWrapLines('aa|bbbbbbbb', 14, 60), 1, "U+007C: Chrome 不断后，模型不得按 BA 断（规范/真机分歧已登记）")
    // 对照：? 断后，证明同表兄弟类的行为不是「整类不做」。
    assert.ok(rivalWrapLines('aa?bbbbbbbb', 14, 60) >= 2)
  })

  it('生产形态回归：含 ? 的 text-media 正文按 EX 断后多算 1 行（QA qa39 复现）', () => {
    // QA 64 卡夹具 qa39：194px 正文宽下 Chrome 3 行、缺 EX 模型 2 行 →
    // 卡面矮 20px → 同列 4px 重叠。判据是行数，不写死高度数值。
    const title = 'Read more: https://example.com/interpolation/benchmark/cinematic?ref=qa'
    const lines = rivalWrapLines(title, 14, 194)
    assert.equal(lines, 3, `Chrome 实测 3 行（? 后断出 "ref=qa" 一行），got ${lines}`)
  })

  it('CJK 上下文不抑制断后：<CJK>？<拉丁词> 行数与 Chrome 一致（#3166 决策一）', () => {
    // R8 收口：R7 引入的「非 CJK 守卫」（断后码位仅在非 CJK 字符之后生效，
    // 附带 :286 例外与 charWidthFactor 特例）把全角 ？！ 粘进后续拉丁词——
    // QA 反证它既无益于其声称要修的 20px 高估（按任何夹具复现不出），
    // 又是新高估的成因；去掉守卫后 9 个坏例回到 Chrome 行数，而 ?-in-URL
    // 的修复不受影响（上面 qa39 断言不变红）。以下形态钉死 Chrome 行数，
    // 防止守卫被加回来。
    assert.equal(rivalWrapLines('中文？abc def', 14, 60), 2,
      'Chrome 2 行：？ 后可断、"abc def" 排第二行；守卫把 ？ 粘进 abc 后多算 1 行')
    assert.equal(rivalWrapLines('中文？abc def', 14, 50), 2,
      'Chrome 2 行（更窄列宽同形）')
    assert.equal(rivalWrapLines('中文？aa中文bb？cc', 14, 50), 3,
      'Chrome 3 行：两个 ？ 都在 CJK 后仍按断后语义断开')
  })
})

describe('rival-masonry — R9 行首禁则「拉回」语义（R8 悬挂前提被真机证伪）', () => {
  // R8 把行首禁则由「前一字随标点下行（拉回）」改成「悬挂占满行尾」，
  // 依据是探针观察到溢出；复审用 155 夹具 × 14 宽度扫描证伪：Chrome 首行
  // 溢出 >0.5px 的条数为 0——放不下时前一 CJK 字与标点一起下行。
  // A/B（111 夹具 × 真 Chrome）：悬挂 mismatch 52（低估 49）、拉回 22（低估 4），
  // 低估=卡片高度不足=同列重叠，正是本线一直在打的缺陷族。
  // 注意适用域：拉回只在前一原子是 CJK 字时发生；前驱是不可断词原子时
  // Chrome 让标点留在行尾（词整体下行），行数与悬挂同形——word+﹖ 夹具
  // 两模型同给 5 行，不能用作鉴别夹具。
  it('行首禁则拉回：标点放不下时前一 CJK 字随之下行（悬挂给 2、真机 3）', () => {
    // 每条都在悬挂/拉回间有鉴别力：悬挂 2 行、拉回/Chrome 3 行。
    assert.equal(rivalWrapLines('中中中中，文文文文', 14, 63), 3,
      'Chrome 3 行：，放不下时第 4 个「中」随之下行；悬挂只占满行尾会少算一整行')
    assert.equal(rivalWrapLines('中中中中中。文文文文', 14, 77), 3,
      'Chrome 3 行：句号触发同一拉回机理')
    assert.equal(rivalWrapLines('中中中中，，，文文文文', 14, 63), 3,
      'Chrome 3 行：连续禁则标点按前一原子逐个拉回，不得再少算')
  })
  it('防回退：行首禁则不是悬挂——溢出形态在夹具宽度扫描中为 0 例', () => {
    // 与上一条同一形态单独成 it：若有人把分支改回「used += glue + atomW
    // 悬挂」而不改其它，此断言立刻变红（悬挂输出 2、拉回输出 3）。
    assert.equal(rivalWrapLines('中中中中，文文文文', 14, 63), 3,
      'hang model gives 2, pull-back (Chrome-verified) gives 3 — regression guard')
  })
})

describe('rival-styles — R7 字体前提与禁用态守卫（④⑤）', () => {
  // 与 QA B-4 / PM M1 同源：样式字符串是产物本身，断言其契约即可在套件内
  // 鉴别「回退到无显式字体/无 :not(:disabled)」的错误实现。
  it('文本/标题元素显式声明 font-family（字宽表前提；QA B-4）', () => {
    assert.ok(/\.omnimux-rival-card-text\s*\{[^}]*font-family:/s.test(RIVAL_CSS),
      'card-text must declare font-family explicitly — glyph width table is SF Pro 14px calibrated')
    assert.ok(/\.omnimux-rival-card-title\s*\{[^}]*font-family:/s.test(RIVAL_CSS),
      'card-title must declare font-family explicitly')
  })
  it('会 disabled 的元素全集 × 其每条 hover 规则都带 :not(:disabled)（PM M1 → #3166 类级）', () => {
    // 同类缺陷第三次逃逸（R5 act-btn → R6 act-primary → R7 filter-jump）
    // 证明断言必须钉在「类」上而不是实例上：本枚举覆盖生产里所有真的会
    // disabled 的元素——act-btn（原帖按钮 source_url 不安全时 disabled）、
    // act-primary（复刻按钮 busy 时 disabled）、filter-jump（账号行跳转
    // profileUrl 不安全时 disabled）。新增 disabled 元素须同步扩此表；
    // 断言按类逐条校验 RIVAL_CSS 里该类的**每一条** :hover 规则。
    const DISABLED_CAPABLE = [
      'omnimux-rival-act-btn',
      'omnimux-rival-act-primary',
      'omnimux-rival-filter-jump',
    ]
    for (const cls of DISABLED_CAPABLE) {
      // R9 放宽匹配（逃逸通路修补）：hover 相关选择器有两种形态——
      // 自身 hover `.cls:hover`（含 [attr] 等复合形态）与祖先驱动
      // `:hover .cls`（如生产 .filter-row:hover .filter-jump）。任一
      // 含 .cls 与 :hover 的选择器行都收进来逐条查 :not(:disabled)。
      const hoverRules = RIVAL_CSS.match(
        new RegExp(`[^{}]*(?:\\.${cls}(?![\\w-])[^{]*:hover|:hover[^{]*\\.${cls}(?![\\w-]))[^{]*`, 'g'),
      ) || []
      assert.ok(hoverRules.length > 0, `${cls} should have hover rules in the stylesheet`)
      for (const rule of hoverRules) {
        assert.ok(
          rule.includes(':not(:disabled)'),
          `${cls} hover rule lacks :not(:disabled) — disabled ${cls} still shows hover affordance (rule: ${rule.trim()})`,
        )
      }
    }
  })
  it('省略号挂在 label 元素而非按钮容器（PM M2/M3）', () => {
    assert.ok(
      /\.omnimux-rival-act-btn > span:not\(\.omnimux-rival-vh\)[^}]*text-overflow:\s*ellipsis/s.test(RIVAL_CSS),
      'ellipsis must live on the kit Button label span (production DOM is button>span.label)',
    )
    assert.ok(
      /\.omnimux-rival-overlay-metrics\s*\{[^}]*display:\s*inline-block[^}]*text-overflow:\s*ellipsis/s.test(RIVAL_CSS),
      'metrics row needs a block-level container for text-overflow to reach its text node',
    )
  })
})

describe('rival-masonry — R7 逐字形字宽表锁表断言（QA Q3 阻塞）', () => {
  // 前提（QA Q3 + 代码复审 B-4）：表值来自 Chrome canvas.measureText，
  // 字体为 SF Pro / -apple-system 14px——与 rival-styles 显式声明的字体栈
  //（同 build-demo.mjs --font-family）一致。换字体族须用 codepoint-probe.mjs
  // 重新标定；表外 ASCII 回落 ASCII_WIDTH_FACTOR，>0x2E7F 按整宽。
  // 锁表 = 断言表内代表值与统一系数 0.592 显著不同，使「整体退回 0.592」
  // 立即变红。计数口径（#3166-⑤）：EXPECT 实收 18 个字形（非 17）；
  // 断后集合 BREAK_AFTER 实收 304 条（LineBreak.txt 18.0.0 官方 306 减
  // Chrome 定制 {0021,007C}），版本漂移须重跑集合差。
  const EXPECT = {
    '1': 0.453, 'i': 0.236, 'l': 0.242, 'f': 0.351, 'r': 0.370,
    'a': 0.541, 'e': 0.561, 'w': 0.764, 'm': 0.859, 'A': 0.663,
    'M': 0.863, 'W': 0.957, '0': 0.619, '?': 0.502, '#': 0.619,
    '@': 0.907, '/': 0.294, ' ': 0.271,
  }
  it('GLYPH_WIDTH_FACTOR 表内代表字形逐项钉住（SF Pro 14px 标定值）', () => {
    assert.ok(RIVAL_GLYPH_WIDTH_FACTOR, 'width table must be exported for the suite')
    for (const [ch, factor] of Object.entries(EXPECT)) {
      assert.equal(RIVAL_GLYPH_WIDTH_FACTOR[ch], factor, `glyph ${JSON.stringify(ch)} factor changed — SF Pro 14px calibrated value`)
      // 方向性断言：逐字形必须显著不同于统一系数 0.592 才有存在意义
      //（窄字符 i/l/f/r 与宽字符 m/w/@/W）。
      if (['i', 'l', 'f', 'r', 'w', 'm', '@', 'W'].includes(ch)) {
        assert.ok(Math.abs(factor - 0.592) > 0.05, `glyph ${ch} would be invisible to a uniform-0.592 regression`)
      }
    }
  })
  it('逐字形宽度在行数层可分辨：窄词与宽词不同宽（退回 0.592 变红）', () => {
    // 8 对 'ii'：逐字形词宽 2×0.236·14 = 6.6px、'ww' = 21.4px；窄行 60px
    // 下窄词对 2 行、宽词对更多——统一 0.592 下两者词宽同为 16.6px，行数
    // 差消失。退回统一系数必然变红。
    const narrow = rivalWrapLines('ii ii ii ii ii ii ii ii', 14, 60)
    const wide = rivalWrapLines('ww ww ww ww ww ww ww ww', 14, 60)
    assert.ok(wide > narrow, `per-glyph widths must rank 'w' wider than 'i' (narrow=${narrow} wide=${wide})`)
    assert.equal(narrow, 2, `narrow glyph rows: got ${narrow} (uniform 0.592 would give 3+)`)
  })
  it('表外回落语义钉住：未覆盖 ASCII → 0.592；已知偏差边界', () => {
    // DEL(0x7F) 未在表内 → 统一系数且不断行；边界已登记（复审 F-2/Q6，
    // #3166-④ 修正方向）：真机实测 U+200D ZWJ → Chrome 0px vs 模型 8.288
    //（+8.288 安全方向）、U+2011 → +1.835（安全）；真正的最坏低估是
    // U+2E3B −28.271px，社媒常见 U+2764 ❤ −4.454、U+2192 → −4.242、
    // emoji −4.0；扫 11,751 个表外码位中 8,443 个是低估——旧注记的
    //「ZWJ/2011 最大偏差 −5.15px（低估）」方向与码位都错，已按实测重写。
    assert.equal(rivalWrapLines('aa\x7fbbbbbbbb', 14, 60), 1, 'DEL falls back to the uniform factor and stays glued')
  })
})

describe('rival-masonry — R10 行首禁则「按码位分」语义（QA 收口复验 FAIL 修复）', () => {
  // QA 用逐行内容测量（非行数差）证 Chrome 行首禁则逐码位异质：
  // @40px（unit 14，单字 14px）形态 `中文中文中文X`：
  //   拉回组 = 4 行（`中文`/`中文`/`中`/`文X`）——X 放不下时前一个
  //     CJK 字带它下行；
  //   悬挂组 = 3 行（`中文`/`中文`/`中文X`）——X 挂在本行行尾。
  // R9 按前驱类型分粒度不对：悬挂组在前驱是 CJK 字时同样拉回，与
  // Chrome 不符。R10 按码位分 + 次级条件（前驱禁则标点也挂行尾）。
  // 真机口径（本文件同目录 e2e / harness 探针复核）：
  //   拉回组码位：，。、：；？！﹖﹗％（FF0C 3002 3001 FF1A FF1B FF1F
  //     FF01 FE56 FE57 FF05）；
  //   悬挂组码位：｡､･〉】〕）］｝》」』〞〟（FF61 FF64 FF65 3009 3011
  //     3015 FF09 FF3D FF5D 300B 300D 300F 301E 301F）；
  //   连续禁则标点：后一个挂行尾（不链式拉回），整个 run 只随 head 下行一次；
  //   悬挂组在 ink（半宽）放不下的形态里同样把行尾单元整体带下行；
  //   0.5px 装入容差已删：Chrome 装入边界是行宽本身，恰好等于行宽算放下。

  const PULL = ['，', '。', '、', '：', '；', '？', '！', '﹖', '﹗', '％']
  const HANG = ['｡', '､', '･', '〉', '】', '〕', '）', '］', '｝', '》', '」', '』', '〞', '〟']

  it('拉回组逐码位钉行：`中文中文中文X`@40px = 4 行（前一 CJK 字随标点下行）', () => {
    for (const ch of PULL) {
      assert.equal(rivalWrapLines(`中文中文中文${ch}`, 14, 40), 4,
        `U+${ch.codePointAt(0).toString(16).toUpperCase()} 属拉回组：Chrome 逐行内容 中文/中文/中/文${ch}`)
    }
  })

  it('悬挂组逐码位钉行：`中文中文中文X`@40px = 3 行（标点挂行尾）', () => {
    for (const ch of HANG) {
      assert.equal(rivalWrapLines(`中文中文中文${ch}`, 14, 40), 3,
        `U+${ch.codePointAt(0).toString(16).toUpperCase()} 属悬挂组：Chrome 逐行内容 中文/中文/中文${ch}`)
    }
  })

  it('粒度鉴别：前驱同为 CJK 字时，拉回组与悬挂组行为不同（拦「按前驱类型分」回退）', () => {
    // 同一句、同前驱（文），仅码位不同。R9 的「前驱 CJK → 全拉回」实现
    // 对悬挂组也给 4 行——本断言会立刻变红；只有把禁则集按码位拆成
    // 拉回/悬挂两个语义才能同时满足两条。
    assert.equal(rivalWrapLines('中文中文中文，', 14, 40), 4, '拉回组 ，')
    assert.equal(rivalWrapLines('中文中文中文）', 14, 40), 3, '悬挂组 ）')
    assert.equal(rivalWrapLines('中文中文中文｡', 14, 40), 3, '悬挂组 ｡（半角）')
    assert.equal(rivalWrapLines('中文中文中文％', 14, 40), 4, '拉回组 ％')
  })

  it('连续禁则标点整体随 head 下行一次，不链式拉回（`中文中文中文X` 尾部 run 形态）', () => {
    assert.equal(rivalWrapLines('中文中文中文。、', 14, 40), 4,
      'Chrome 逐行 中文/中文/中/文。、：第二个标点挂在被拉回的 。之后，不再单独开一行')
    assert.equal(rivalWrapLines('中文中文中文？﹖！﹗', 14, 40), 4,
      '4 个拉回组标点连排仍只把「文」拉回一次')
    assert.equal(rivalWrapLines('中文中文中文）｡､･〉】〕', 14, 40), 4,
      'Chrome 逐行 中文/中文/中/文X：悬挂组 run 放不下时整个 run 随 head 下行')
  })

  it('悬挂组 ink 放不下的形态同样拉行尾单元（`中中中中））`@63 Chrome 3 行）', () => {
    // 单个 ）ink 7 ≤ 63-56=7 恰好挂下；两个 ）连排时第二个挂不下，
    // Chrome 把整个行尾单元（中）+run）拉到下一行。
    assert.equal(rivalWrapLines('中中中中）文文文文', 14, 63), 2, '单挂：中中中中）/文文文文')
    assert.equal(rivalWrapLines('中中中中））文文文文', 14, 63), 3,
      'Chrome 3 行 中中中/中））文文/文文：ink 挂不下时行尾单元整体下行')
  })

  it('拉回组前驱为不可断词原子/行内唯一原子时留在行尾（前驱类型次级条件保留）', () => {
    assert.equal(rivalWrapLines('aa bb cc，word', 14, 60), 3,
      'Chrome 3 行 aa bb/cc，/word：拉回组把词原子 head 一并带下行')
    assert.equal(rivalWrapLines('中，ab', 14, 26), 2,
      '拉回会把行拉空（中 是行内唯一原子）→ 标点挂行尾：中，/ab')
  })

  it('半角悬挂组行中即半宽（`中･ab`@40 单行、行尾 `中…･` 恰宽不折）', () => {
    assert.equal(rivalWrapLines('中･ab', 14, 40), 1,
      'Chrome 单行 中･ab：半角悬挂标点在行中只占半 advance')
    assert.equal(rivalWrapLines('中中中中中･', 14, 28), 3,
      'Chrome 3 行：中中/中中/中･——28 恰容两字，-0.5 容差曾假折出第 4 行')
  })
})
