import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  rivalWrapLines,
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
    // 77 个 ASCII 字符（无连字符）≈ 590px ≫ 194px 行宽：CSS 不折词，一行截断。
    assert.equal(rivalWrapLines(url, 14, 194), 1)
    const h = rivalCardHeightPx({ card_type: 'text-media', media_kind: 'video', title: url }, 220)
    assert.ok(Math.abs(h - (24 + 1 * 20 + 10 + (220 - 26) / (16 / 9) + 2)) < 1e-9,
      `one-line clamp, got ${h}`)
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
    // （QA 41 卡夹具 w1 实测：连字符模型 5 行、Chrome 4 行；按整词不可断的
    // 旧模型估算 1 行会被 144px 下限吞掉 —— R6 注释修正，数字可复现）。
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
