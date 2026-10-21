import assert from 'node:assert/strict'
import test from 'node:test'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { INSPIRATION_CSS } from './styles.js'
import { RIVAL_CSS } from './rival-styles.js'
import { COLLECTION_CSS } from './collection-styles.js'

/**
 * Geometry gate for the collection member card (Issue 3459 / 3502).
 *
 * jsdom cannot measure layout, so the card contract is asserted in a real
 * Chrome: the cover is 4:5 and is the whole default face, the card height is
 * cover + border, the title/meta hover layer is absolutely positioned over the
 * cover, the CTA row is horizontally centred, and the failure icon / ⋯ menu stay
 * inside the card without covering the default face.
 *
 * The fixture uses the production class contract; CSS comes from the real style
 * modules. React is not involved: this is the same markup the components emit.
 */

const CARD_WIDTH = 240
const LONG_REASON = '导入中断或超时，请重试'

const BASE_CSS = `
  .probe-stage { width: 1600px; padding: 20px; }
  .probe-card { position: relative !important; left: auto !important; top: auto !important; }
  .probe-menu button { width: 28px; height: 28px; }
`

function fixtureHtml(cardTypeClass) {
  return `
<div class="probe-stage"><div class="omnimux-inspiration-stage">
  <article class="probe-card omnimux-rival-card ${cardTypeClass} omnimux-inspiration-card-pure is-library is-media-first" style="--rival-card-w:${CARD_WIDTH}px">
    <div class="omnimux-inspiration-cover-wrap">
      <div class="omnimux-rival-card-media" style="--rival-media-ratio:0.8"></div>
    </div>
    <div class="omnimux-rival-card-body">
      <div class="omnimux-rival-card-title clamp-2" title="标题">封面优先的合集成员卡标题，最多两行</div>
      <div class="omnimux-inspiration-card-meta">
        <span class="omnimux-inspiration-card-meta-source">YouTube</span>
        <span class="omnimux-inspiration-card-meta-sep" aria-hidden="true">·</span>
        <span class="omnimux-inspiration-card-meta-time">3 天前</span>
      </div>
    </div>
    <span class="omnimux-inspiration-card-failure is-failed" role="img" title="${LONG_REASON}" aria-label="${LONG_REASON}"><svg width="14" height="14"></svg></span>
    <div class="omnimux-inspiration-card-menu probe-menu"><button aria-label="更多操作">…</button></div>
    <div class="omnimux-inspiration-card-overlay is-cover">
      <div class="omnimux-inspiration-overlay-cta">
        <button class="omnimux-inspiration-overlay-cta-btn secondary"><span class="omnimux-inspiration-overlay-cta-label">详情</span></button>
        <button class="omnimux-inspiration-overlay-cta-btn primary"><span class="omnimux-inspiration-overlay-cta-label">立即复刻</span></button>
      </div>
    </div>
    <button class="omnimux-inspiration-card-check" aria-label="选择"></button>
  </article>
</div></div>`
}

/**
 * Runs inside the probe page (serialized by the probe helper), so it must stay
 * self-contained: no imports, no closures over Node-side values.
 */
function measure() {
  const card = document.querySelector('.probe-card')
  const media = card.querySelector('.omnimux-rival-card-media')
  const body = card.querySelector('.omnimux-rival-card-body')
  const title = card.querySelector('.omnimux-rival-card-title')
  const check = card.querySelector('.omnimux-inspiration-card-check')
  const failure = card.querySelector('.omnimux-inspiration-card-failure')
  const menu = card.querySelector('.omnimux-inspiration-card-menu')
  const cta = card.querySelector('.omnimux-inspiration-overlay-cta')
  const overlay = card.querySelector('.omnimux-inspiration-card-overlay.is-cover')
  const rect = (node) => {
    const box = node.getBoundingClientRect()
    return {
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.round(box.width),
      h: Math.round(box.height),
      bottom: Math.round(box.bottom),
      right: Math.round(box.right),
    }
  }
  const mediaBox = media.getBoundingClientRect()
  const cardBox = card.getBoundingClientRect()
  const ctaBox = cta.getBoundingClientRect()
  return {
    card: rect(card),
    media: rect(media),
    body: rect(body),
    title: rect(title),
    check: rect(check),
    failure: rect(failure),
    menu: rect(menu),
    cta: rect(cta),
    ratio: mediaBox.width / mediaBox.height,
    titleClamp: getComputedStyle(title).webkitLineClamp,
    objectFit: getComputedStyle(media).objectFit,
    bodyOpacity: getComputedStyle(body).opacity,
    menuOpacity: getComputedStyle(menu).opacity,
    bodyPosition: getComputedStyle(body).position,
    overlayOpacity: getComputedStyle(overlay).opacity,
    ctaCenterOffset: Math.round((ctaBox.left + ctaBox.width / 2) - (cardBox.left + cardBox.width / 2)),
  }
}

function probe(cardTypeClass) {
  return runStyleDomProbe({
    name: 'collection-member-card',
    styles: `${INSPIRATION_CSS}\n${RIVAL_CSS}\n${COLLECTION_CSS}\n${BASE_CSS}`,
    html: fixtureHtml(cardTypeClass),
    measure,
    viewportHeight: 900,
  })
}

test('合集成员卡：4:5 封面就是默认卡面，高度为封面 + 描边', () => {
  const geometry = probe('t-short-video')
  assert.ok(Math.abs(geometry.ratio - 0.8) <= 0.02, `cover must be 4:5, got ${geometry.ratio.toFixed(3)}`)
  assert.equal(geometry.objectFit, 'cover', 'the collection cover crops to fill')
  assert.equal(geometry.titleClamp, '2', 'the title is clamped to two lines')
  assert.equal(geometry.bodyPosition, 'absolute', 'the title/meta layer overlays the cover instead of adding height')
  assert.equal(geometry.bodyOpacity, '0', 'the hover layer is hidden by default')
  assert.equal(geometry.overlayOpacity, '0', 'the CTA layer is hidden by default')
  assert.ok(
    Math.abs(geometry.card.h - (geometry.media.h + 2)) <= 2,
    `card height must match the masonry estimate (card ${geometry.card.h}, cover ${geometry.media.h})`,
  )
})

test('合集成员卡：text-media 成员同样按封面优先几何', () => {
  const geometry = probe('t-text-media')
  assert.ok(Math.abs(geometry.ratio - 0.8) <= 0.02, `text-media cover must be 4:5, got ${geometry.ratio.toFixed(3)}`)
  assert.ok(
    Math.abs(geometry.card.h - (geometry.media.h + 2)) <= 2,
    `text-media member must drop its card padding (card ${geometry.card.h}, cover ${geometry.media.h})`,
  )
})

test('合集成员卡：CTA 居中，失败图标与菜单不越界', () => {
  const geometry = probe('t-short-video')
  assert.ok(Math.abs(geometry.ctaCenterOffset) <= 2, `CTA must be horizontally centred, offset ${geometry.ctaCenterOffset}px`)
  assert.ok(geometry.cta.bottom <= geometry.card.bottom, 'the CTA stays inside the card')
  assert.ok(geometry.failure.y <= geometry.media.y + 12, 'the failure icon sits in the cover top-right corner')
  assert.ok(geometry.failure.right <= geometry.card.right, 'the failure icon stays inside the card')
  assert.ok(geometry.menu.right <= geometry.card.right, 'the ⋯ menu stays inside the card')
  assert.ok(geometry.menu.y >= geometry.failure.bottom, 'the ⋯ menu sits below the failure icon')
  assert.equal(geometry.menuOpacity, '0', 'the ⋯ menu is hidden by default')
  assert.ok(geometry.check.right <= geometry.card.right, 'the checkbox stays inside the card')
})
