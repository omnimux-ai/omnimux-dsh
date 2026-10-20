import assert from 'node:assert/strict'
import test from 'node:test'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { INSPIRATION_CSS } from './styles.js'
import { RIVAL_CSS } from './rival-styles.js'

/**
 * Geometry gate for the collection member card (Issue 3459).
 *
 * jsdom cannot measure layout, so the card contract is asserted in a real
 * Chrome: the cover is 4:5, the body starts exactly under it, the card height
 * matches the masonry estimate, the checkbox never covers the title, and the
 * type/duration chips keep their two corners.
 *
 * The fixture uses the production class contract; CSS comes from the real style
 * modules. React is not involved: this is the same markup the components emit.
 * `t-text-media` is covered explicitly: X/Twitter members land in that shape and
 * it used to carry its own card padding, which the collection layout must drop.
 */

const CARD_WIDTH = 240

const BASE_CSS = `
  .probe-stage { width: 1600px; padding: 20px; }
  .probe-card { position: relative !important; left: auto !important; top: auto !important; }
`

function fixtureHtml(cardTypeClass) {
  return `
<div class="probe-stage"><div class="omnimux-inspiration-stage">
  <article class="probe-card omnimux-rival-card ${cardTypeClass} omnimux-inspiration-card-pure is-media-first" style="--rival-card-w:${CARD_WIDTH}px">
    <div class="omnimux-inspiration-cover-wrap">
      <div class="omnimux-rival-card-media" style="--rival-media-ratio:0.8"></div>
      <span class="omnimux-inspiration-badge-type">视频</span>
      <span class="omnimux-inspiration-badge-duration">0:32</span>
      <div class="omnimux-inspiration-cover-tools">
        <div class="omnimux-inspiration-overlay-cta">
          <button class="omnimux-inspiration-overlay-cta-btn secondary"><span class="omnimux-inspiration-overlay-cta-label">详情</span></button>
          <button class="omnimux-inspiration-overlay-cta-btn primary"><span class="omnimux-inspiration-overlay-cta-label">立即复刻</span></button>
        </div>
      </div>
    </div>
    <div class="omnimux-rival-card-body">
      <div class="omnimux-rival-card-title clamp-2" title="标题">封面优先的合集成员卡标题，最多两行</div>
      <div class="omnimux-inspiration-card-meta">
        <span class="omnimux-inspiration-card-meta-source">YouTube</span>
        <span class="omnimux-inspiration-card-meta-sep" aria-hidden="true">·</span>
        <span class="omnimux-inspiration-card-meta-duration">0:32</span>
        <span class="omnimux-inspiration-card-meta-sep" aria-hidden="true">·</span>
        <span class="omnimux-inspiration-card-meta-time">3 天前</span>
        <span class="omnimux-inspiration-card-status is-failed" role="status" title="导入失败：导入中断或超时">导入失败</span>
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
  const typeChip = card.querySelector('.omnimux-inspiration-badge-type')
  const durationChip = card.querySelector('.omnimux-inspiration-badge-duration')
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
  return {
    card: rect(card),
    media: rect(media),
    body: rect(body),
    title: rect(title),
    check: rect(check),
    typeChip: rect(typeChip),
    durationChip: rect(durationChip),
    ratio: mediaBox.width / mediaBox.height,
    titleClamp: getComputedStyle(title).webkitLineClamp,
    objectFit: getComputedStyle(media).objectFit,
  }
}

function probe(cardTypeClass) {
  return runStyleDomProbe({
    name: 'collection-member-card',
    styles: `${INSPIRATION_CSS}\n${RIVAL_CSS}\n${BASE_CSS}`,
    html: fixtureHtml(cardTypeClass),
    measure,
    viewportHeight: 900,
  })
}

test('合集成员卡：4:5 封面、正文紧随、固定高度', () => {
  const geometry = probe('t-short-video')
  assert.ok(Math.abs(geometry.ratio - 0.8) <= 0.02, `cover must be 4:5, got ${geometry.ratio.toFixed(3)}`)
  assert.equal(geometry.objectFit, 'cover', 'the collection cover crops to fill')
  assert.equal(geometry.titleClamp, '2', 'the title is clamped to two lines')
  assert.ok(geometry.body.y >= geometry.media.bottom, 'the body starts below the cover')
  assert.ok(
    Math.abs(geometry.card.h - (geometry.media.h + 82 + 2)) <= 2,
    `card height must match the masonry estimate (card ${geometry.card.h}, cover ${geometry.media.h})`,
  )
})

test('合集成员卡：text-media 成员同样按封面优先几何', () => {
  const geometry = probe('t-text-media')
  assert.ok(Math.abs(geometry.ratio - 0.8) <= 0.02, `text-media cover must be 4:5, got ${geometry.ratio.toFixed(3)}`)
  assert.ok(geometry.body.y >= geometry.media.bottom, 'the body starts below the cover')
  assert.ok(
    Math.abs(geometry.card.h - (geometry.media.h + 82 + 2)) <= 2,
    `text-media member must drop its card padding (card ${geometry.card.h}, cover ${geometry.media.h})`,
  )
})

test('合集成员卡：复选框与角标互不越界', () => {
  const geometry = probe('t-short-video')
  assert.ok(geometry.check.bottom <= geometry.title.y, 'the checkbox must not cover the title')
  assert.ok(geometry.check.right <= geometry.card.right, 'the checkbox stays inside the card')
  assert.equal(geometry.typeChip.y, geometry.durationChip.y, 'type and duration chips share one baseline')
  assert.ok(geometry.typeChip.x < geometry.durationChip.x, 'type is on the left, duration on the right')
  assert.ok(geometry.typeChip.x >= geometry.card.x, 'the type chip stays inside the cover')
  assert.ok(geometry.durationChip.right <= geometry.card.right, 'the duration chip stays inside the cover')
  assert.ok(geometry.durationChip.bottom <= geometry.media.bottom, 'chips stay inside the cover, not the body')
})
