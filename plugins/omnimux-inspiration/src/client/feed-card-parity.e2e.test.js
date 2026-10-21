import assert from 'node:assert/strict'
import test from 'node:test'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { INSPIRATION_CSS } from './styles.js'
import { RIVAL_CSS } from './rival-styles.js'
import { COLLECTION_CSS } from './collection-styles.js'

/**
 * Geometry gate for the root library card (Issue 3502).
 *
 * jsdom cannot measure layout, so the content-first card is asserted in a real
 * Chrome: a media card is exactly the cover (+ border), the title/meta layer is
 * absolutely positioned over it and hidden by default, the CTA row is centred,
 * the failure icon and ⋯ menu stay inside the card, and the post card keeps its
 * compact three-line body with meta + CTA in the hover layer.
 *
 * The fixture uses the production class contract; CSS comes from the real style
 * modules. React is not involved: this is the same markup the components emit.
 */

const CARD_WIDTH = 240
const SHORT_VIDEO_RATIO = 9 / 16
const LONG_REASON = '导入中断或超时，请重试'

const BASE_CSS = `
  .probe-stage { width: 1600px; padding: 20px; display: flex; gap: 24px; align-items: flex-start; }
  .probe-card { position: relative !important; left: auto !important; top: auto !important; }
  .probe-menu button { width: 28px; height: 28px; }
`

function fixtureHtml() {
  return `
<div class="probe-stage"><div class="omnimux-inspiration-stage" style="width:1600px">
  <article class="probe-card probe-media omnimux-rival-card t-short-video omnimux-inspiration-card-pure is-library" style="--rival-card-w:${CARD_WIDTH}px">
    <div class="omnimux-inspiration-cover-wrap">
      <div class="omnimux-rival-card-media" style="--rival-media-ratio:${SHORT_VIDEO_RATIO}"></div>
    </div>
    <div class="omnimux-rival-card-body">
      <div class="omnimux-rival-card-title clamp-2" title="标题">根层媒体卡标题，最多两行</div>
      <div class="omnimux-inspiration-card-meta">
        <span class="omnimux-inspiration-card-meta-source">TikTok</span>
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

  <article class="probe-card probe-textmedia omnimux-rival-card t-text-media omnimux-inspiration-card-pure is-library" style="--rival-card-w:${CARD_WIDTH}px">
    <div class="omnimux-inspiration-cover-wrap">
      <div class="omnimux-rival-card-media" style="--rival-media-ratio:${16 / 9}"></div>
    </div>
    <div class="omnimux-rival-card-body">
      <div class="omnimux-rival-card-title clamp-2">X 上的视频：封面优先</div>
      <div class="omnimux-inspiration-card-meta">
        <span class="omnimux-inspiration-card-meta-source">推特 (X)</span>
      </div>
    </div>
    <div class="omnimux-inspiration-card-overlay is-cover">
      <div class="omnimux-inspiration-overlay-cta">
        <button class="omnimux-inspiration-overlay-cta-btn secondary"><span class="omnimux-inspiration-overlay-cta-label">详情</span></button>
        <button class="omnimux-inspiration-overlay-cta-btn primary"><span class="omnimux-inspiration-overlay-cta-label">立即复刻</span></button>
      </div>
    </div>
  </article>

  <article class="probe-card probe-post-failed omnimux-rival-card t-text omnimux-inspiration-card-pure is-library" style="--rival-card-w:${CARD_WIDTH}px">
    <div class="omnimux-rival-card-body is-post">
      <div class="omnimux-rival-card-text clamp-3 omnimux-inspiration-card-error is-inline is-failed" role="status">导入失败</div>
    </div>
    <span class="omnimux-inspiration-card-failure is-failed" role="img" title="${LONG_REASON}" aria-label="${LONG_REASON}"><svg width="14" height="14"></svg></span>
    <div class="omnimux-inspiration-card-menu probe-menu"><button aria-label="更多操作">…</button></div>
    <button class="omnimux-inspiration-card-check" aria-label="选择"></button>
  </article>

  <article class="probe-card probe-post omnimux-rival-card t-text omnimux-inspiration-card-pure is-library" style="--rival-card-w:${CARD_WIDTH}px">
    <div class="omnimux-rival-card-body is-post">
      <div class="omnimux-rival-card-text clamp-3">一条纯文字帖子：这里放足够长的正文，用来确认它确实按三行截断，而不是把整段文本铺满卡片。</div>
    </div>
    <div class="omnimux-inspiration-card-menu probe-menu"><button aria-label="更多操作">…</button></div>
    <div class="omnimux-inspiration-card-overlay is-post">
      <div class="omnimux-inspiration-card-meta">
        <span class="omnimux-inspiration-card-meta-source">推特 (X)</span>
        <span class="omnimux-inspiration-card-meta-sep" aria-hidden="true">·</span>
        <span class="omnimux-inspiration-card-meta-time">3 天前</span>
      </div>
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
 * Runs inside the probe page (serialized by the probe helper): no imports and no
 * closures over Node-side values.
 */
function measure() {
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
  const centerOffset = (node, card) => {
    const box = node.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    return Math.round((box.left + box.width / 2) - (cardBox.left + cardBox.width / 2))
  }
  const mediaCard = document.querySelector('.probe-media')
  const textMediaCard = document.querySelector('.probe-textmedia')
  const postCard = document.querySelector('.probe-post')
  const media = mediaCard.querySelector('.omnimux-rival-card-media')
  const body = mediaCard.querySelector('.omnimux-rival-card-body')
  const mediaMenu = mediaCard.querySelector('.omnimux-inspiration-card-menu')
  const failure = mediaCard.querySelector('.omnimux-inspiration-card-failure')
  const coverCta = mediaCard.querySelector('.omnimux-inspiration-overlay-cta')
  const postText = postCard.querySelector('.omnimux-rival-card-text')
  const postBody = postCard.querySelector('.omnimux-rival-card-body')
  const postOverlay = postCard.querySelector('.omnimux-inspiration-card-overlay.is-post')
  const postCta = postCard.querySelector('.omnimux-inspiration-overlay-cta')
  const postMenu = postCard.querySelector('.omnimux-inspiration-card-menu')
  const failedPost = document.querySelector('.probe-post-failed')
  const failedIcon = failedPost.querySelector('.omnimux-inspiration-card-failure')
  const failedCheck = failedPost.querySelector('.omnimux-inspiration-card-check')
  const failedMenu = failedPost.querySelector('.omnimux-inspiration-card-menu')
  const mediaBox = media.getBoundingClientRect()
  return {
    mediaCard: rect(mediaCard),
    media: rect(media),
    ratio: mediaBox.width / mediaBox.height,
    objectFit: getComputedStyle(media).objectFit,
    body: rect(body),
    bodyPosition: getComputedStyle(body).position,
    mediaMenu: rect(mediaMenu),
    failure: rect(failure),
    coverCta: rect(coverCta),
    coverCtaCenterOffset: centerOffset(coverCta, mediaCard),
    textMediaCard: rect(textMediaCard),
    textMediaCover: rect(textMediaCard.querySelector('.omnimux-inspiration-cover-wrap')),
    postCard: rect(postCard),
    postText: rect(postText),
    postBody: rect(postBody),
    postClamp: getComputedStyle(postText).webkitLineClamp,
    postOverlayMeta: Boolean(postOverlay.querySelector('.omnimux-inspiration-card-meta')),
    postMetaInBody: Boolean(postBody.querySelector('.omnimux-inspiration-card-meta')),
    postCtaCenterOffset: centerOffset(postCta, postCard),
    postMenu: rect(postMenu),
    failedIcon: rect(failedIcon),
    failedCheck: rect(failedCheck),
    failedMenu: rect(failedMenu),
  }
}

function probe() {
  return runStyleDomProbe({
    name: 'feed-hover-chrome',
    styles: `${INSPIRATION_CSS}\n${RIVAL_CSS}\n${COLLECTION_CSS}\n${BASE_CSS}`,
    html: fixtureHtml(),
    measure,
    viewportHeight: 900,
  })
}

test('根层媒体卡：封面就是默认卡面，高度 = 封面 + 描边', () => {
  const geometry = probe()
  assert.ok(Math.abs(geometry.ratio - SHORT_VIDEO_RATIO) <= 0.01, `root card keeps the row ratio, got ${geometry.ratio.toFixed(3)}`)
  assert.equal(geometry.objectFit, 'cover')
  assert.equal(geometry.bodyPosition, 'absolute', 'the title/meta layer overlays the cover')
  assert.ok(geometry.body.y >= geometry.media.y, 'the overlay starts inside the cover')
  assert.ok(
    Math.abs(geometry.mediaCard.h - (geometry.media.h + 2)) <= 2,
    `card height must be cover + 2 (card ${geometry.mediaCard.h}, cover ${geometry.media.h})`,
  )
  assert.ok(Math.abs(geometry.coverCtaCenterOffset) <= 2, `CTA must be centred, offset ${geometry.coverCtaCenterOffset}px`)
  assert.ok(geometry.failure.y <= geometry.media.y + 12, 'the failure icon sits in the cover top-right corner')
  assert.ok(geometry.failure.right <= geometry.mediaCard.right, 'the failure icon stays inside the card')
  assert.ok(geometry.mediaMenu.right <= geometry.mediaCard.right, 'the ⋯ menu stays inside the card')
  assert.ok(geometry.mediaMenu.y >= geometry.failure.bottom, 'the ⋯ menu sits below the failure icon')
})

test('根层 text-media 卡：去掉卡片内边距后高度仍是封面 + 描边', () => {
  const geometry = probe()
  assert.ok(
    Math.abs(geometry.textMediaCard.h - (geometry.textMediaCover.h + 2)) <= 2,
    `text-media must drop its card padding (card ${geometry.textMediaCard.h}, cover ${geometry.textMediaCover.h})`,
  )
})

test('根层失败帖子卡：失败图标不压复选框和菜单', () => {
  const geometry = probe()
  const icon = geometry.failedIcon
  const check = geometry.failedCheck
  const menu = geometry.failedMenu
  const intersects = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.x, b.x)
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y)
    return w > 2 && h > 2
  }
  assert.equal(intersects(icon, check), false, 'the failure icon must not cover the checkbox')
  assert.equal(intersects(icon, menu), false, 'the failure icon must not cover the ⋯ menu')
  assert.ok(icon.x >= 0 && icon.right <= geometry.postCard.right, 'the icon stays inside the card')
})

test('根层帖子卡：三行正文常显，元信息与 CTA 在悬停层且居中', () => {
  const geometry = probe()
  assert.equal(geometry.postClamp, '3')
  assert.equal(geometry.postMetaInBody, false, 'meta is not part of the default post body')
  assert.equal(geometry.postOverlayMeta, true, 'the meta row rides in the hover layer')
  assert.ok(Math.abs(geometry.postCtaCenterOffset) <= 2, `post CTA must be centred, offset ${geometry.postCtaCenterOffset}px`)
  assert.ok(geometry.postCard.h >= 144, 'the post card keeps its minimum height')
  assert.ok(geometry.postCard.h <= Math.round(geometry.postCard.w * (16 / 9)) + 2, 'the post card stays under the portrait cap')
  assert.ok(geometry.postMenu.right <= geometry.postCard.right, 'the post ⋯ menu stays inside the card')
})
