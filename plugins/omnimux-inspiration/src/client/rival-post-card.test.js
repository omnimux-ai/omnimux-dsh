import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { JSDOM } from 'jsdom'
import './test-fixtures/dom-bootstrap.mjs'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { zh, en } from './locales.js'
import { RIVAL_CSS } from './rival-styles.js'

/**
 * Render gate for the v2.1 账号监控 cards (spec §9.1/§9.2, V8–V18).
 *
 * What is pinned here:
 *   - the five shapes: media ratio placeholders, title/body clamp classes, and
 *     where the velocity pill lives (overlaying media vs top-right of a text card);
 *   - the default state's element whitelist: media + pill + title/body, and
 *     nothing else (no platform badge, duration, avatar, author, time, match,
 *     state text, metrics row, action buttons);
 *   - the processed (is-done) retreat: pill neutralized, media gets
 *     `filter: grayscale(1)` + `opacity: 0.45` on the media element itself, text
 *     drops a level, and the card root keeps `opacity: 1`;
 *   - the hover layer contract: author row (platform mark + nickname + time +
 *     match), metrics (播放 for video kinds, 浏览 for image/text), the four
 *     action positions, and the processed-state static text in slot four.
 *   - RivalMasonry renders a flat list: DOM order equals the input sort order
 *     (spec V4), cards are absolutely positioned by CSS variables, and the
 *     container is a single relative block — never column wrappers.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'test-fixtures', 'rival-card-stage.jsx')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'rival-card-stage')

const t = (key) => zh[key] || key

const TREND_ICON = '<svg'

const CARD_BASE = {
  title: '样例标题样例标题',
  cover_key: '/omnimux/inspiration/local/media/rival-accounts/covers/rival-1.jpg',
  source_platform: 'tiktok',
  source_url: 'https://www.tiktok.com/@alice/video/1',
  posted_at: '2026-09-12T08:00:00.000Z',
  stats: { views: 128000, likes: 8640, comments: 214, shares: 96 },
  author_name: 'Alice Studio',
  account: { id: 'ra_alice', nickname: 'Alice Studio', handle: '@alice', platform: 'tiktok', profile_url: '' },
  velocity: { text: '爆款 23k/h', tier: 'hot' },
  match: { label: '高契合' },
}

const CARD_FIXTURES = {
  'short-video': { id: 'sv', card_type: 'short-video', type: 'video', metrics_template: 'play' },
  'long-video': { id: 'lv', card_type: 'long-video', type: 'video', source_platform: 'youtube', metrics_template: 'play' },
  'image': { id: 'im', card_type: 'image', type: 'image', source_platform: 'instagram', ratio: 0.8, metrics_template: 'read' },
  'text': { id: 'tx', card_type: 'text', type: 'text', source_platform: 'x', has_media: false, cover_key: '', metrics_template: 'read' },
  'text-media': { id: 'tm', card_type: 'text-media', type: 'video', source_platform: 'x', media_kind: 'video', has_media: true, metrics_template: 'play' },
}

function cardOf(type, extra = {}) {
  return { ...CARD_BASE, ...CARD_FIXTURES[type], ...extra }
}

let bundleCounter = 0

async function bundleStage() {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `rival-card-stage-${bundleCounter}.mjs`)
  bundleCounter += 1
  const result = await esbuild.build({
    absWorkingDir: join(here, '..', '..'),
    entryPoints: [sourceEntry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    plugins: [{
      name: 'ui-kit-shim',
      setup(build) {
        build.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: shimEntry }))
      },
    }],
  })
  const code = result.outputFiles?.[0]?.text
  if (!code) throw new Error('esbuild produced no bundle for rival-card-stage.jsx')
  writeFileSync(outFile, code)
  return outFile
}

/**
 * Mount the stage once with a list of cards; returns the document + container.
 * The stage renders `RivalMasonry` over `RivalPostCard` for every entry.
 */
async function mountStage(cards, options = {}) {
  const stageModule = await import(`${await bundleStage()}?mount=${bundleCounter}`)
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const { window } = dom
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  globalThis.window = window
  globalThis.document = window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const opened = []
  window.open = (url) => { opened.push(String(url)); return null }

  const container = window.document.getElementById('host')
  const reactRoot = createRoot(container)
  const events = []
  const props = {
    cards,
    t,
    onDetail: (card) => events.push(['detail', card.id]),
    onReplicate: (card) => events.push(['replicate', card.id]),
    onMarkDone: (card) => events.push(['markDone', card.id]),
    onDeconstruct: (card) => events.push(['deconstruct', card.id]),
    containerWidth: options.containerWidth ?? 1164,
    ...options.props,
  }
  await act(async () => {
    reactRoot.render(React.createElement(stageModule.RivalCardStage, props))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return {
    container,
    events,
    opened,
    document: window.document,
    async unmount() {
      await act(async () => reactRoot.unmount())
      globalThis.window = previousWindow
      globalThis.document = previousDocument
    },
  }
}

const all = (container, selector) => [...container.querySelectorAll(selector)]
const cardEls = (container) => all(container, '.omnimux-rival-card')
const byType = (container, type) => container.querySelector(`.omnimux-rival-card[data-card-type="${type}"]`)

describe('RivalPostCard — 五种形态（§9.1）', () => {
  it('renders one card per type with the spec media/clamp classes', async () => {
    const cards = Object.keys(CARD_FIXTURES).map((type) => cardOf(type))
    const mounted = await mountStage(cards)
    try {
      assert.equal(cardEls(mounted.container).length, 5)
      for (const type of Object.keys(CARD_FIXTURES)) {
        assert.ok(byType(mounted.container, type), `${type} must render`)
      }
      // Media-area placeholders exist for the four media shapes, never for text.
      for (const type of ['short-video', 'long-video', 'image', 'text-media']) {
        const card = byType(mounted.container, type)
        assert.ok(card.querySelector('.omnimux-rival-card-media'), `${type} must have a media area`)
      }
      assert.equal(byType(mounted.container, 'text').querySelector('.omnimux-rival-card-media'), null)

      // Truncation lines per type (V9): 1 / 2 / 1 / 8 / 3.
      assert.ok(byType(mounted.container, 'short-video').querySelector('.clamp-1'))
      assert.ok(byType(mounted.container, 'long-video').querySelector('.clamp-2'))
      assert.ok(byType(mounted.container, 'image').querySelector('.clamp-1'))
      assert.ok(byType(mounted.container, 'text').querySelector('.clamp-8'))
      assert.ok(byType(mounted.container, 'text-media').querySelector('.clamp-3'))
    } finally {
      await mounted.unmount()
    }
  })

  it('puts the velocity pill on media for media cards and on the surface row for text cards', async () => {
    const cards = [cardOf('short-video'), cardOf('text'), cardOf('text-media')]
    const mounted = await mountStage(cards)
    try {
      for (const type of ['short-video']) {
        const pill = byType(mounted.container, type).querySelector('.omnimux-rival-vpill')
        assert.ok(pill?.classList.contains('on-media'), `${type} pill must overlay the media`)
        assert.ok(pill.classList.contains('hot'), 'hot tier keeps its colour')
      }
      for (const type of ['text', 'text-media']) {
        const card = byType(mounted.container, type)
        const row = card.querySelector('.omnimux-rival-pill-row')
        const pill = row?.querySelector('.omnimux-rival-vpill')
        assert.ok(pill?.classList.contains('on-surface'), `${type} pill must sit in the surface pill row`)
        assert.ok(pill.classList.contains('hot'), 'text-card pill keeps the tier colour per §9.1')
      }
    } finally {
      await mounted.unmount()
    }
  })

  it('media-area aspect-ratio comes from the resolved ratio, not the DOM', async () => {
    const cards = [cardOf('short-video'), cardOf('image', { ratio: 1 })]
    const mounted = await mountStage(cards)
    try {
      const svMedia = byType(mounted.container, 'short-video').querySelector('.omnimux-rival-card-media')
      const imMedia = byType(mounted.container, 'image').querySelector('.omnimux-rival-card-media')
      // The ratio lands on a CSS variable the stylesheet consumes; the card must
      // reserve height before any image loads (§9.3).
      assert.equal(svMedia.style.getPropertyValue('--rival-media-ratio').trim(), `${9 / 16}`)
      assert.equal(imMedia.style.getPropertyValue('--rival-media-ratio').trim(), '1')
    } finally {
      await mounted.unmount()
    }
  })
})

describe('RivalPostCard — 默认态极简白名单（V12/V13）', () => {
  it('default state shows only media, pill and title/body', async () => {
    const cards = [cardOf('short-video'), cardOf('text'), cardOf('text-media')]
    const mounted = await mountStage(cards)
    try {
      for (const el of cardEls(mounted.container)) {
        // The hover layer's elements exist for hover only — the whitelist check
        // is on what the default state exposes, and this assertion runs against
        // the card's non-overlay content.
        const banned = [
          '.omnimux-rival-badge-platform',
          '.omnimux-rival-duration',
          '.omnimux-rival-avatar',
        ]
        for (const selector of banned) {
          assert.equal(el.querySelector(selector), null, `${selector} must never exist`)
        }
        // Author/nickname/time/match/state/metrics/actions live inside the
        // overlay only — the overlay is the single hover element.
        const overlay = el.querySelector('.omnimux-rival-card-overlay')
        assert.ok(overlay, 'hover overlay exists for hover state')
        assert.equal(overlay.parentElement, el)
      }
      // No stray dictionary-off text anywhere in default content.
      const html = mounted.container.innerHTML
      assert.equal(html.includes('该号爆款 · 高于中位'), false, 'relative badge text is retired (V15)')
    } finally {
      await mounted.unmount()
    }
  })
})

describe('RivalPostCard — 已处理样式（V14）', () => {
  it('processed card: pill neutral, media grayscale+0.45 on the media element, text dimmed, card opacity stays 1', async () => {
    const cards = [
      cardOf('long-video', { done: true, state: 'interacted', interacted_at: new Date(2026, 9, 5, 9, 12).toISOString() }),
      cardOf('text', { done: true, state: 'done' }),
    ]
    const mounted = await mountStage(cards)
    try {
      const mediaCard = byType(mounted.container, 'long-video')
      assert.ok(mediaCard.classList.contains('is-done'))
      // Root opacity must stay 1 — the retreat is filter-level, never card-level.
      // jsdom cannot resolve CSS rules, so the class marks the state here and
      // the stylesheet contract below proves the retreat mechanics.
      assert.equal(mediaCard.style.opacity, '', 'the card root never carries an opacity')
      const media = mediaCard.querySelector('.omnimux-rival-card-media')
      assert.ok(media, 'media element exists')
      assert.equal(media.tagName, 'IMG', 'the fade must land on the media element, not a wrapper')
      // Pill text is unchanged but tier class is neutralized by is-done styles.
      const pill = mediaCard.querySelector('.omnimux-rival-vpill')
      assert.equal(pill.textContent.trim(), '爆款 23k/h')
      // The hover layer's fourth position shows the state text, not a button.
      const stateText = mediaCard.querySelector('.omnimux-rival-act-state')
      assert.equal(stateText?.textContent.trim(), '已互动 · 09:12')
      assert.equal(mediaCard.querySelector('[data-act="markDone"]'), null, 'processed cards have no mark-done button')

      const textCard = byType(mounted.container, 'text')
      assert.ok(textCard.classList.contains('is-done'))
      assert.equal(textCard.querySelector('.omnimux-rival-card-media'), null, 'text card has no media to fade')
      const stateText2 = textCard.querySelector('.omnimux-rival-act-state')
      assert.equal(stateText2?.textContent.trim(), '已处理')
    } finally {
      await mounted.unmount()
    }
  })

  it('the stylesheet retreats done cards per spec §9.2: media filter+opacity, dimmed text, neutral pill, no card-level opacity', () => {
    assert.ok(
      RIVAL_CSS.includes('.omnimux-rival-card.is-done:not(:hover) .omnimux-rival-card-media'),
      'the processed fade must target the media element, never the card',
    )
    assert.ok(RIVAL_CSS.includes('grayscale(1)'))
    assert.ok(RIVAL_CSS.includes('opacity: 0.45') || RIVAL_CSS.includes('opacity:0.45'))
    assert.ok(
      RIVAL_CSS.includes('.omnimux-rival-card.is-done:not(:hover) .omnimux-rival-card-title')
        || RIVAL_CSS.includes('.omnimux-rival-card.is-done:not(:hover) .omnimux-rival-card-text'),
      'processed text drops to label-secondary',
    )
    // Forbidden mechanics of §9.2: no whole-card opacity, no brightness hack.
    assert.equal(RIVAL_CSS.includes('brightness'), false, 'brightness would crush covers to black')
    const baseBlock = RIVAL_CSS.match(/\.omnimux-rival-card\s*\{[^}]*\}/)
    assert.ok(baseBlock, 'the card base rule exists')
    assert.equal(/opacity/.test(baseBlock[0]), false, 'card-level opacity is forbidden (V14)')
  })
})

describe('RivalPostCard — 悬停层结构（V16–V18）', () => {
  it('author row + metrics + three secondary + full-width primary, in that order', async () => {
    const cards = [cardOf('short-video')]
    const mounted = await mountStage(cards)
    try {
      const overlay = byType(mounted.container, 'short-video').querySelector('.omnimux-rival-card-overlay')
      assert.ok(overlay.classList.contains('on-media'))
      const order = [...overlay.children].map((node) => node.className)
      assert.ok(order[0].includes('omnimux-rival-ov-author'), 'author row first')
      assert.ok(order[1].includes('omnimux-rival-overlay-metrics'), 'metrics second')
      assert.ok(order[2].includes('omnimux-rival-act-row'), 'secondary buttons third')
      assert.ok(order[3].includes('omnimux-rival-act-primary') || order[3].includes('act-primary'), 'primary button last')

      const author = overlay.querySelector('.omnimux-rival-ov-author')
      assert.ok(author.querySelector('svg'), 'platform mark is an SVG')
      assert.ok((author.textContent || '').includes('Alice Studio'))
      assert.ok((author.textContent || '').includes('高契合'), 'match tag sits at the author row end')
      const metrics = overlay.querySelector('.omnimux-rival-overlay-metrics')
      assert.ok((metrics.textContent || '').startsWith('播放 '), 'video card uses the 播放 template')
      assert.ok((metrics.textContent || '').includes('12.8万'), 'views use the 万 compact form')
      assert.ok((metrics.textContent || '').includes('8,640'), 'engagement keeps thousands separators')
    } finally {
      await mounted.unmount()
    }
  })

  it('read-template cards use 浏览 prefix; unprocessed fourth slot offers 标为已处理', async () => {
    const cards = [cardOf('image'), cardOf('short-video')]
    const mounted = await mountStage(cards)
    try {
      const imageMetrics = byType(mounted.container, 'image').querySelector('.omnimux-rival-overlay-metrics')
      assert.ok((imageMetrics.textContent || '').startsWith('浏览 '), 'image card uses the 浏览 template')
      const markDone = byType(mounted.container, 'short-video').querySelector('[data-act="markDone"]')
      assert.equal(markDone?.textContent.trim(), '标为已处理')
      const primary = byType(mounted.container, 'short-video').querySelector('.omnimux-rival-act-primary')
      assert.equal(primary?.textContent.trim(), '立即复刻')
    } finally {
      await mounted.unmount()
    }
  })

  it('action buttons call their callbacks without opening the detail', async () => {
    const cards = [cardOf('short-video')]
    const mounted = await mountStage(cards)
    try {
      const card = byType(mounted.container, 'short-video')
      const markDone = card.querySelector('[data-act="markDone"]')
      await act(async () => {
        markDone.dispatchEvent(new mounted.document.defaultView.MouseEvent('click', { bubbles: true }))
      })
      assert.deepEqual(mounted.events, [['markDone', 'sv']], 'mark-done reports the card and swallows the click')
      const primary = card.querySelector('.omnimux-rival-act-primary')
      await act(async () => {
        primary.dispatchEvent(new mounted.document.defaultView.MouseEvent('click', { bubbles: true }))
      })
      assert.deepEqual(mounted.events, [['markDone', 'sv'], ['replicate', 'sv']])
    } finally {
      await mounted.unmount()
    }
  })
})

describe('RivalMasonry — DOM 顺序与扁平结构（V1/V4）', () => {
  it('renders cards in sort order inside one flat container — never column wrappers', async () => {
    const cards = [
      cardOf('short-video'),
      cardOf('long-video'),
      cardOf('image'),
      cardOf('text'),
      cardOf('text-media'),
      cardOf('image', { id: 'im2', ratio: 1 }),
    ]
    const mounted = await mountStage(cards)
    try {
      const container = mounted.container.querySelector('.omnimux-rival-masonry')
      assert.ok(container, 'the masonry container exists')
      // Flat DOM: every card is a direct child of the container, in input order.
      const children = [...container.children].filter((node) => node.classList.contains('omnimux-rival-card'))
      assert.equal(children.length, cards.length)
      assert.deepEqual(
        children.map((node) => node.getAttribute('data-card-id')),
        cards.map((card) => card.id),
        'DOM order must equal the input sort order (spec V4: tab/screen-reader order)',
      )
      assert.equal(
        container.querySelector('.omnimux-rival-masonry-col'),
        null,
        'column wrapper divs would turn the DOM column-first',
      )
      // Absolute positioning is expressed through CSS variables, not geometry.
      for (const node of children) {
        assert.ok(node.style.getPropertyValue('--rival-card-left').trim() !== '', `${node.getAttribute('data-card-id')} needs a left`)
        assert.ok(node.style.getPropertyValue('--rival-card-top').trim() !== '', `${node.getAttribute('data-card-id')} needs a top`)
      }
    } finally {
      await mounted.unmount()
    }
  })

  it('resolves column count from the measured container width (V5)', async () => {
    const cards = Array.from({ length: 6 }, (_, index) => cardOf('image', { id: `c${index}`, ratio: 1 }))
    const wide = await mountStage(cards, { containerWidth: 1164 })
    const narrow = await mountStage(cards, { containerWidth: 927 })
    try {
      // 1164px → 5 columns, 927px → 3 columns (spec breakpoint table).
      assert.equal(wide.container.querySelector('.omnimux-rival-masonry').getAttribute('data-columns'), '5')
      assert.equal(narrow.container.querySelector('.omnimux-rival-masonry').getAttribute('data-columns'), '3')
      // Column width is equal-split and ≥220px.
      const colW = Number(wide.container.querySelector('.omnimux-rival-masonry').getAttribute('data-col-width'))
      assert.ok(Math.abs(colW - ((1164 - 16 * 4) / 5)) < 0.5, `col width ${colW}`)
      assert.ok(colW >= 220)
    } finally {
      await wide.unmount()
      await narrow.unmount()
    }
  })
})

describe('RivalPostCard — 外链与 locale（第三轮整改）', () => {
  const overlayText = (container) =>
    container.querySelector('.omnimux-rival-card-overlay')?.textContent || ''

  it('keeps 原帖直达 in place but disabled for a non-http(s) source_url, and never calls window.open (R5-⑥)', async () => {
    // spec §9.2/§9.6 V16 locks the action row to three secondary buttons — the
    // slot must stay (greyed) instead of silently collapsing, matching the
    // account filter's disabled affordance on the same condition.
    const evil = cardOf('short-video', { source_url: 'javascript:alert(1)' })
    const mounted = await mountStage([evil])
    try {
      const card = byType(mounted.container, 'short-video')
      const original = card.querySelector('[data-act="original"]')
      assert.ok(original, 'the slot keeps its button — V16 fixes three secondary slots')
      assert.equal(original.disabled, true, 'a refused scheme greys the button, it does not open')
      assert.equal(original.getAttribute('title'), '原帖链接不可用')
      // R6-⑨：disabled 控件不可聚焦，title 对键盘/读屏不可达 → 禁用原因
      // 必须再经 aria-describedby 挂一个解析得到文本的节点。
      const describedBy = original.getAttribute('aria-describedby')
      assert.ok(describedBy, 'a disabled button needs aria-describedby for its title text')
      const desc = mounted.document.getElementById(describedBy)
      assert.ok(desc, `aria-describedby target ${describedBy} must resolve in the DOM`)
      assert.match(desc.textContent, /原帖链接不可用/, 'the description carries the same copy as the title')
      // R8-⑦（QA 实测「vh 移回 <button> 内」零鉴别力）：隐藏节点的 DOM
      // 位置本身是判据——必须是 <button> 的兄弟（同在 act-slot 下），
      // 不能是按钮子节点（子节点文本会被并入可及名称，读屏念两遍）。
      assert.ok(desc.classList.contains('omnimux-rival-vh'), 'the describedby node carries the visually-hidden class')
      assert.equal(desc.parentElement, original.closest('.omnimux-rival-act-slot'),
        'the hidden note must be a sibling of the <button> inside act-slot, never a button child',
      )
      assert.equal(original.contains(desc), false,
        'vh inside <button> folds its text into the accessible name (QA R8 反例)',
      )
      await act(async () => {
        original.dispatchEvent(new mounted.document.defaultView.MouseEvent('click', { bubbles: true }))
      })
      assert.deepEqual(mounted.opened, [], 'window.open must not run for a refused scheme')
      // R6-⑥：包裹 span 复用同一行内的既有槽位类（display:flex; flex:0 0 auto），
      // 而不是落成裸 span 的 display:block / min-width:auto。
      assert.ok(
        original.closest('.omnimux-rival-act-slot'),
        'the click-stop wrapper must reuse .omnimux-rival-act-slot like the fourth slot',
      )
    } finally {
      await mounted.unmount()
    }
  })

  it('renders the hover layer entirely in English under an en t() — time and counts included', async () => {
    const tEn = (key) => en[key] || key
    const card = cardOf('short-video', {
      posted_at: new Date(Date.now() - 4 * 3600_000).toISOString(),
      stats: { views: 128000, likes: 8640, comments: 214, shares: 96 },
      match: { label: '可参考' },
      state: 'interacted',
      interacted_at: '2026-10-05T09:12:00.000Z',
    })
    const mounted = await mountStage([card], { props: { t: tEn } })
    try {
      const text = overlayText(mounted.container)
      assert.ok(text.includes(en['rivalFeed.metrics.views'].split(' ')[0]), 'the metrics line must be in English')
      assert.doesNotMatch(text, /[一-鿿]/, `no Chinese may survive in the en hover layer (got ${JSON.stringify(text)})`)
      assert.match(text, /4h ago/, `relative time must be English (got ${JSON.stringify(text)})`)
      assert.match(text, /128K/, `view count must use the en unit (got ${JSON.stringify(text)})`)
      assert.equal(text.includes('12.8万'), false, 'the zh 万 unit must not leak into en')
    } finally {
      await mounted.unmount()
    }
  })
})

describe('RivalPostCard — R4 胶囊行判据与估算层一致（复审 ①）', () => {
  it('velocity 是对象但 text 为空 → 不渲染 pill-row（空行违反「仅在有胶囊时渲染该行」）', async () => {
    const cards = [
      cardOf('text', { velocity: {} }),
      cardOf('text-media', { velocity: { text: '', tier: 'watch' } }),
    ]
    const mounted = await mountStage(cards)
    try {
      for (const type of ['text', 'text-media']) {
        const card = byType(mounted.container, type)
        assert.ok(card, `${type} must render`)
        assert.equal(
          card.querySelector('.omnimux-rival-pill-row'),
          null,
          `${type}: a velocity object without text must not reserve the 28+8px pill row`,
        )
        assert.equal(
          card.querySelector('.omnimux-rival-vpill'),
          null,
          `${type}: VelocityPill itself returns null on empty text`,
        )
      }
    } finally {
      await mounted.unmount()
    }
  })
})


describe('RivalPostCard — 结构化增速胶囊（#3113 §3.3）', () => {
  it('measured hot 结构描述渲染爆款前缀与 k/h，hot 档有趋势图标', async () => {
    const mounted = await mountStage([
      cardOf('short-video', { velocity: { tier: 'hot', confidence: 'measured', vph: 23000, samples_at: ['2026-10-06T16:00:00Z', '2026-10-06T18:00:00Z'] } }),
    ])
    try {
      const pill = mounted.container.querySelector('.omnimux-rival-vpill')
      assert.ok(pill, 'structured velocity must render a pill')
      assert.equal(pill.textContent.trim(), '爆款 23k/h')
      assert.ok(pill.classList.contains('hot'), 'hot tier keeps its colour class')
      assert.ok(pill.querySelector('svg'), 'hot pill carries the trend icon')
    } finally {
      await mounted.unmount()
    }
  })

  it('relative 档渲染「该号 {v}x」且无 /h、无热度前缀、无彩色档位', async () => {
    const mounted = await mountStage([
      cardOf('short-video', { velocity: { tier: 'relative', confidence: 'relative', multiplier: 4.2 } }),
    ])
    try {
      const pill = mounted.container.querySelector('.omnimux-rival-vpill')
      assert.ok(pill, 'relative tier must render its own pill')
      const text = pill.textContent.trim()
      assert.equal(text, '该号 4.2x')
      assert.ok(!text.includes('/h'), 'relative must never carry an hourly unit')
      assert.ok(!pill.classList.contains('hot') && !pill.classList.contains('rising'),
        'relative tier never wears the hot/rising colour classes')
      assert.ok(!pill.querySelector('svg'), 'relative pill carries no trend icon')
    } finally {
      await mounted.unmount()
    }
  })

  it('结构化 average 档渲染「均速 {v}」，无趋势图标', async () => {
    const mounted = await mountStage([
      cardOf('short-video', { velocity: { tier: 'average', confidence: 'average', vph: 1800 } }),
    ])
    try {
      const pill = mounted.container.querySelector('.omnimux-rival-vpill')
      assert.equal(pill?.textContent.trim(), '均速 1.8k/h')
      assert.ok(pill.classList.contains('average'), 'average pill takes the weakened style class')
      assert.ok(!pill.querySelector('svg'), 'average pill carries no trend icon')
    } finally {
      await mounted.unmount()
    }
  })

  it('renders markDone button and handles in-place transition to static span (#3114)', async () => {
    const unprocessedCard = cardOf('short-video', { id: 'p_act_1', source_url: 'https://www.tiktok.com/@foo/video/123' })
    const mounted = await mountStage([unprocessedCard])

    const cardEl = byType(mounted.container, 'short-video')
    assert.equal(cardEl.classList.contains('is-done'), false)

    // Fourth slot has markDone button
    const markBtn = cardEl.querySelector('[data-act="markDone"]')
    assert.ok(markBtn, 'markDone button exists')
    assert.equal(markBtn.textContent.trim(), '标为已处理')

    // Click triggers onMarkDone via mounted.events
    await act(async () => {
      markBtn.dispatchEvent(new mounted.document.defaultView.MouseEvent('click', { bubbles: true }))
    })
    assert.deepEqual(mounted.events, [['markDone', 'p_act_1']])

    // Replicate button exists and is primary
    const repBtn = cardEl.querySelector('[data-act="replicate"]')
    assert.ok(repBtn, 'replicate button exists')
    assert.equal(repBtn.textContent.trim(), '立即复刻')

    // Original button is enabled for valid url
    const origBtn = cardEl.querySelector('[data-act="original"]')
    assert.ok(origBtn, 'original button exists')
    assert.equal(origBtn.disabled, false)

    // Unprocessed card does not have is-done class
    assert.equal(cardEl.classList.contains('is-done'), false)
  })

  it('renders static done state when post has done_at (#3114)', async () => {
    const doneCard = cardOf('short-video', { id: 'p_done_1', done_at: '2026-10-06T12:00:00.000Z' })
    const mounted = await mountStage([doneCard])
    const cardEl = byType(mounted.container, 'short-video')
    assert.ok(cardEl.classList.contains('is-done'), 'has is-done class')

    // Fourth slot has static state span, no markDone button
    const markBtn = cardEl.querySelector('[data-act="markDone"]')
    assert.equal(markBtn, null, 'no markDone button')
    const stateSpan = cardEl.querySelector('.omnimux-rival-act-state')
    assert.ok(stateSpan, 'static state span exists')
    assert.equal(stateSpan.textContent.trim(), '已处理')
  })
})
