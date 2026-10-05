import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  RIVAL_TOKENS_CSS,
  RIVAL_TOKENS_ID,
  injectRivalTokens,
} from './rival-tokens.js'

/**
 * The two token families the prototype's cards depend on.
 *
 * The spec's media/velocity styles (`--dsw-specific-media-*` and
 * `--dsw-specific-velocity-*`) exist only inside the prototype HTML today:
 * without an injector every cover-bound pill and overlay silently falls back.
 * These assertions pin the token names, their dark-room semantics (media tokens
 * stay dark in the light theme), and idempotent injection.
 */

const EXPECTED_MEDIA_TOKENS = [
  '--dsw-specific-media-fg',
  '--dsw-specific-media-fg-strong',
  '--dsw-specific-media-fg-secondary',
  '--dsw-specific-media-fg-dimmed',
  '--dsw-specific-media-ink',
  '--dsw-specific-media-badge-bg',
  '--dsw-specific-media-badge-bg-strong',
  '--dsw-specific-media-pill-bg',
  '--dsw-specific-media-pill-bg-dim',
  '--dsw-specific-media-chip-bg',
  '--dsw-specific-media-btn-bg',
  '--dsw-specific-media-btn-hover',
  '--dsw-specific-media-border',
  '--dsw-specific-media-border-strong',
  '--dsw-specific-media-border-dim',
  '--dsw-specific-media-border-faint',
  '--dsw-specific-media-scrim',
  '--dsw-specific-media-overlay',
  '--dsw-specific-media-glow-hot',
]

const EXPECTED_VELOCITY_TOKENS = [
  '--dsw-specific-velocity-hot-bg',
  '--dsw-specific-velocity-hot-fg',
  '--dsw-specific-velocity-hot-ring',
  '--dsw-specific-velocity-rising-fg',
  '--dsw-specific-velocity-rising-bg',
  '--dsw-specific-velocity-rising-ring',
  // #3166 决策二追加的暗房 on-media rising 三 token（两主题同值）：
  // R8 引入时两个护栏都漏了——不在本清单、也不含 -media- 中缀，
  // 本行把它们钉回来（R9-⑤）。
  '--dsw-specific-velocity-rising-fg-media',
  '--dsw-specific-velocity-rising-bg-media',
  '--dsw-specific-velocity-rising-ring-media',
]

describe('rival-tokens — 两族 token 覆盖', () => {
  it('declares every media token the spec §9.1/§9.2 styles consume', () => {
    for (const name of EXPECTED_MEDIA_TOKENS) {
      assert.ok(
        RIVAL_TOKENS_CSS.includes(`${name}:`),
        `missing media token ${name} — its consumers would silently fall back`,
      )
    }
  })

  it('declares every velocity token the §3.3 hot/rising pills consume', () => {
    for (const name of EXPECTED_VELOCITY_TOKENS) {
      assert.ok(
        RIVAL_TOKENS_CSS.includes(`${name}:`),
        `missing velocity token ${name}`,
      )
    }
  })

  it('关键胶囊组合的声明值 WCAG 对比度 ≥4.5:1（O4 可执行断言，防跌破）', () => {
    // PM O4：`爆款` 实底红是全表最小值（ratio_far 4.79，余量仅 ~6%）——
    // 纯观察项防不住悄悄跌破，写成可执行断言。解析 token 声明值后按
    // WCAG 相对亮度公式计算；rgba 前景按 alpha 合成到胶囊底上再比。
    const num = (name) => RIVAL_TOKENS_CSS.match(new RegExp(`${name}:\\s*([^;]+);`))[1].trim()
    const lum = (hex) => {
      const c = hex.replace('#', '')
      const f = (i) => {
        const v = parseInt(c.slice(i, i + 2), 16) / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4)
    }
    const rgbaOver = (rgba, bgHex) => {
      const m = rgba.match(/rgba?\(([^)]+)\)/)
      const [r, g, b, a = '1'] = m[1].split(',').map((x) => parseFloat(x))
      const c = bgHex.replace('#', '')
      const mix = (v, i) => Math.round(v * a + parseInt(c.slice(i, i + 2), 16) * (1 - a))
      const hx = (x) => x.toString(16).padStart(2, '0')
      return `#${hx(mix(r, 0))}${hx(mix(g, 2))}${hx(mix(b, 4))}`
    }
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((u, v) => v - u)
      return (x + 0.05) / (y + 0.05)
    }
    const cases = [
      // [前景, 背景, 名称] —— 全表最小值是 hot 实底红（~4.8，余量 ~6%）
      ['#ffffff', num('--dsw-specific-velocity-hot-bg'), '爆款 dark #d92d20'],
      ['#fbbf24', num('--dsw-specific-velocity-rising-bg-media'), '飙升 on-media #78350f'],
      [rgbaOver(num('--dsw-specific-media-fg-secondary'), num('--dsw-specific-media-pill-bg')),
        num('--dsw-specific-media-pill-bg'), '观察 on-media #111113'],
      [rgbaOver(num('--dsw-specific-media-fg-dimmed'), num('--dsw-specific-media-pill-bg-dim')),
        num('--dsw-specific-media-pill-bg-dim'), '均速/该号 on-media #111113'],
    ]
    for (const [fg, bg, name] of cases) {
      assert.ok(ratio(fg, bg) >= 4.5,
        `${name} 对比度 ${ratio(fg, bg).toFixed(2)} < 4.5:1 —— WCAG AA 底线被跌破`)
    }
    // 亮色 surface 上的 飙升：#92400e 字 vs rgba(217,119,6,0.16) 琥珀底
    // 叠在 surface（近似 #fafafa 层）上的合成色。
    const lightSection0 = RIVAL_TOKENS_CSS.split('data-theme="light"')[1] || ''
    const risingFgL = lightSection0.match(/--dsw-specific-velocity-rising-fg:\s*([^;]+);/)[1].trim()
    const risingBgL = lightSection0.match(/--dsw-specific-velocity-rising-bg:\s*([^;]+);/)[1].trim()
    const composed = rgbaOver(risingBgL, '#fafafa')
    assert.ok(ratio(risingFgL, composed) >= 4.5,
      `飙升 light surface ${risingFgL} on ${composed} 对比度 ${ratio(risingFgL, composed).toFixed(2)} < 4.5:1`)
    // light 主题的 hot-bg 在 html[data-theme="light"] 段单独断言（最劣点）。
    const lightSection = RIVAL_TOKENS_CSS.split('data-theme="light"')[1] || ''
    const lightHot = lightSection.match(/--dsw-specific-velocity-hot-bg:\s*([^;]+);/)[1].trim()
    assert.ok(ratio('#ffffff', lightHot) >= 4.5,
      `爆款 light ${lightHot} 对比度 ${ratio('#ffffff', lightHot).toFixed(2)} < 4.5:1`)
  })
  it('keeps the media family theme-agnostic: the light theme does not redefine it', () => {
    const lightSection = RIVAL_TOKENS_CSS.split('data-theme="light"')[1] || ''
    assert.equal(
      lightSection.includes('--dsw-specific-media-'),
      false,
      'media tokens must stay dark in the light theme (design.md 暗房原则)',
    )
    // The velocity family IS redefined for light (spec §3.3 pill colours change
    // per theme: #f0453a → #dc2626, amber ring adjusts) — that is the prototype's
    // own split and is pinned here so nobody "simplifies" it away.
    assert.ok(
      lightSection.includes('--dsw-specific-velocity-hot-bg'),
      'light theme must carry the hot pill colour of the prototype',
    )
    // …except the on-media rising triplet: dark-room tokens are
    // theme-agnostic by design and must NOT be redefined in light (R9-⑤).
    for (const name of [
      '--dsw-specific-velocity-rising-fg-media',
      '--dsw-specific-velocity-rising-bg-media',
      '--dsw-specific-velocity-rising-ring-media',
    ]) {
      assert.equal(
        lightSection.includes(`${name}:`),
        false,
        `${name} is a dark-room token and must stay out of the light theme`,
      )
    }
  })

  it('injects exactly once under its own style id', () => {
    const fakeDocument = {
      nodes: new Map(),
      head: {
        children: [],
        appendChild(node) { this.children.push(node) },
      },
      getElementById(id) { return this.nodes.get(id) || null },
      createElement() {
        return { id: '', textContent: '' }
      },
    }
    const previous = globalThis.document
    globalThis.document = fakeDocument
    try {
      injectRivalTokens()
      assert.equal(fakeDocument.head.children.length, 1, 'the first call must inject')
      const node = fakeDocument.head.children[0]
      assert.equal(node.id, RIVAL_TOKENS_ID)
      fakeDocument.nodes.set(RIVAL_TOKENS_ID, node)
      injectRivalTokens()
      assert.equal(
        fakeDocument.head.children.length,
        1,
        'a second call must not duplicate the style node',
      )
    } finally {
      globalThis.document = previous
    }
  })

  it('is a no-op without a document (SSR / Node)', () => {
    const previous = globalThis.document
    globalThis.document = undefined
    try {
      injectRivalTokens()
    } finally {
      globalThis.document = previous
    }
  })
})
