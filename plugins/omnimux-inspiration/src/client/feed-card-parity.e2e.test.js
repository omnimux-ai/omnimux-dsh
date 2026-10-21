import assert from 'node:assert/strict'
import test from 'node:test'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { INSPIRATION_CSS } from './styles.js'
import { RIVAL_CSS } from './rival-styles.js'
import { COLLECTION_CSS } from './collection-styles.js'

/**
 * Geometry gate for the root library card (Issue 3477).
 *
 * jsdom cannot measure layout, so the shared card shell is asserted in a real
 * Chrome: the cover keeps the row's data ratio, the body starts under it at a
 * fixed height, media corner chips stay in the cover, the always-visible ⋯ menu
 * never covers the meta row or the status chip, and the text-only post card
 * keeps its own fixed body — including when its inline failure reason is long
 * (an 8-line clamp would make the card taller than the estimator and overlap the
 * next card in the column).
 *
 * The fixture uses the production class contract; CSS comes from the real style
 * modules. React is not involved: this is the same markup the components emit.
 */

const CARD_WIDTH = 240
const SHORT_VIDEO_RATIO = 9 / 16
const LONG_REASON = '导入中断或超时，请重试。'.repeat(20)

const BASE_CSS = `
  .probe-stage { width: 1600px; padding: 20px; display: flex; gap: 24px; align-items: flex-start; }
  .probe-card { position: relative !important; left: auto !important; top: auto !important; }
  .probe-menu button { width: 32px; height: 32px; }
`

function fixtureHtml() {
  return `
<div class="probe-stage"><div class="omnimux-inspiration-stage" style="width:1600px">
  <article class="probe-card probe-media omnimux-rival-card t-short-video omnimux-inspiration-card-pure is-library" style="--rival-card-w:${CARD_WIDTH}px">
    <div class="omnimux-inspiration-cover-wrap">
      <div class="omnimux-rival-card-media" style="--rival-media-ratio:${SHORT_VIDEO_RATIO}"></div>
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
      <div class="omnimux-rival-card-title clamp-2" title="标题">根层媒体卡标题，最多两行</div>
      <div class="omnimux-inspiration-card-meta">
        <span class="omnimux-inspiration-card-meta-source">TikTok</span>
        <span class="omnimux-inspiration-card-meta-sep" aria-hidden="true">·</span>
        <span class="omnimux-inspiration-card-meta-time">3 天前</span>
        <span class="omnimux-inspiration-card-status is-failed" role="status" title="导入失败">导入失败</span>
      </div>
    </div>
    <div class="probe-menu omnimux-inspiration-collection-menu"><button aria-label="更多">…</button></div>
    <button class="omnimux-inspiration-card-check" aria-label="选择"></button>
  </article>

  <article class="probe-card probe-post omnimux-rival-card t-text omnimux-inspiration-card-pure is-library" style="--rival-card-w:${CARD_WIDTH}px">
    <div class="omnimux-rival-card-body is-post">
      <div class="omnimux-rival-card-text clamp-3">一条纯文字帖子：这里放足够长的正文，用来确认它确实按三行截断，而不是把整段文本铺满卡片。</div>
      <div class="omnimux-inspiration-card-meta">
        <span class="omnimux-inspiration-card-meta-source">推特 (X)</span>
        <span class="omnimux-inspiration-card-meta-sep" aria-hidden="true">·</span>
        <span class="omnimux-inspiration-card-meta-time">3 天前</span>
      </div>
    </div>
    <div class="omnimux-inspiration-card-overlay">
      <div class="omnimux-inspiration-overlay-cta">
        <button class="omnimux-inspiration-overlay-cta-btn secondary"><span class="omnimux-inspiration-overlay-cta-label">详情</span></button>
        <button class="omnimux-inspiration-overlay-cta-btn primary"><span class="omnimux-inspiration-overlay-cta-label">立即复刻</span></button>
      </div>
    </div>
    <div class="probe-menu omnimux-inspiration-collection-menu"><button aria-label="更多">…</button></div>
    <button class="omnimux-inspiration-card-check" aria-label="选择"></button>
  </article>

  <article class="probe-card probe-post-failed omnimux-rival-card t-text omnimux-inspiration-card-pure is-library" style="--rival-card-w:${CARD_WIDTH}px">
    <div class="omnimux-rival-card-body is-post">
      <div class="omnimux-rival-card-text clamp-3 omnimux-inspiration-card-error is-inline is-failed" role="status">${LONG_REASON}</div>
      <div class="omnimux-inspiration-card-meta">
        <span class="omnimux-inspiration-card-meta-source">推特 (X)</span>
        <span class="omnimux-inspiration-card-meta-time">3 天前</span>
      </div>
    </div>
    <button class="omnimux-inspiration-card-check" aria-label="选择"></button>
  </article>

  <article class="probe-card probe-textmedia omnimux-rival-card t-text-media omnimux-inspiration-card-pure is-library" style="--rival-card-w:${CARD_WIDTH}px">
    <div class="omnimux-inspiration-cover-wrap">
      <div class="omnimux-rival-card-media" style="--rival-media-ratio:${16 / 9}"></div>
      <span class="omnimux-inspiration-badge-type">视频</span>
      <span class="omnimux-inspiration-badge-duration">0:22</span>
    </div>
    <div class="omnimux-rival-card-body">
      <div class="omnimux-rival-card-title clamp-2">X 上的竖屏视频：封面优先</div>
      <div class="omnimux-inspiration-card-meta">
        <span class="omnimux-inspiration-card-meta-source">推特 (X)</span>
      </div>
    </div>
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
  const overlap = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.x, b.x)
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y)
    return w > 2 && h > 2
  }
  const mediaCard = document.querySelector('.probe-media')
  const postCard = document.querySelector('.probe-post')
  const failedPost = document.querySelector('.probe-post-failed')
  const textMediaCard = document.querySelector('.probe-textmedia')
  const cover = mediaCard.querySelector('.omnimux-inspiration-cover-wrap')
  const media = mediaCard.querySelector('.omnimux-rival-card-media')
  const mediaBody = mediaCard.querySelector('.omnimux-rival-card-body')
  const mediaTitle = mediaCard.querySelector('.omnimux-rival-card-title')
  const mediaCheck = mediaCard.querySelector('.omnimux-inspiration-card-check')
  const typeChip = mediaCard.querySelector('.omnimux-inspiration-badge-type')
  const durationChip = mediaCard.querySelector('.omnimux-inspiration-badge-duration')
  const statusChip = mediaCard.querySelector('.omnimux-inspiration-card-status')
  const mediaMenu = mediaCard.querySelector('.omnimux-inspiration-collection-menu')
  const postText = postCard.querySelector('.omnimux-rival-card-text')
  const postOverlayPrimary = postCard.querySelector('.omnimux-inspiration-overlay-cta-btn.primary')
  const postMenu = postCard.querySelector('.omnimux-inspiration-collection-menu')
  const postCheck = postCard.querySelector('.omnimux-inspiration-card-check')
  const failedText = failedPost.querySelector('.omnimux-rival-card-text')
  const textMediaCover = textMediaCard.querySelector('.omnimux-inspiration-cover-wrap')
  const mediaBox = media.getBoundingClientRect()
  const mediaRect = rect(media)
  const statusRect = rect(statusChip)
  const mediaMenuRect = rect(mediaMenu)
  const postMenuRect = rect(postMenu)
  const postOverlayRect = rect(postOverlayPrimary)
  return {
    mediaCard: rect(mediaCard),
    cover: rect(cover),
    media: mediaRect,
    mediaBody: rect(mediaBody),
    mediaTitle: rect(mediaTitle),
    mediaCheck: rect(mediaCheck),
    typeChip: rect(typeChip),
    durationChip: rect(durationChip),
    statusChip: statusRect,
    mediaMenu: mediaMenuRect,
    ratio: mediaBox.width / mediaBox.height,
    mediaTitleClamp: getComputedStyle(mediaTitle).webkitLineClamp,
    postCard: rect(postCard),
    postText: rect(postText),
    postCheck: rect(postCheck),
    postTextClamp: getComputedStyle(postText).webkitLineClamp,
    postTextPaddingRight: getComputedStyle(postText).paddingRight,
    postOverlayOverlapsMenu: overlap(postOverlayRect, postMenuRect),
    failedPost: rect(failedPost),
    failedText: rect(failedText),
    failedClamp: getComputedStyle(failedText).webkitLineClamp,
    textMediaCard: rect(textMediaCard),
    textMediaCover: rect(textMediaCover),
    objectFit: getComputedStyle(media).objectFit,
    mediaMenuOverlapsChip: overlap(mediaMenuRect, statusRect),
  }
}

function probe() {
  return runStyleDomProbe({
    name: 'feed-card-parity',
    styles: `${INSPIRATION_CSS}\n${RIVAL_CSS}\n${COLLECTION_CSS}\n${BASE_CSS}`,
    html: fixtureHtml(),
    measure,
    viewportHeight: 900,
  })
}

test('根层媒体卡：数据比例封面 + 固定正文区 + 工具菜单不压胶囊', () => {
  const geometry = probe()
  assert.ok(Math.abs(geometry.ratio - SHORT_VIDEO_RATIO) <= 0.01, `the root card keeps the row ratio, got ${geometry.ratio.toFixed(3)}`)
  assert.equal(geometry.objectFit, 'cover')
  assert.equal(geometry.mediaTitleClamp, '2')
  assert.ok(geometry.mediaBody.y >= geometry.media.bottom, 'the body starts below the cover')
  assert.ok(
    Math.abs(geometry.mediaCard.h - (geometry.cover.h + 82 + 2)) <= 2,
    `card height must match the estimate (card ${geometry.mediaCard.h}, cover ${geometry.cover.h})`,
  )
  assert.ok(geometry.mediaCheck.bottom <= geometry.mediaTitle.y, 'the checkbox must not cover the title')
  assert.equal(geometry.typeChip.y, geometry.durationChip.y, 'corner chips share one baseline')
  assert.ok(geometry.typeChip.x < geometry.durationChip.x, 'type is left, duration is right')
  assert.ok(geometry.durationChip.bottom <= geometry.cover.bottom, 'chips stay inside the cover')
  assert.ok(geometry.mediaMenu.y <= geometry.cover.y + 12, 'the ⋯ menu sits in the cover top-right corner')
  assert.equal(geometry.mediaMenuOverlapsChip, false, 'the ⋯ menu must not cover the status chip')
})

test('根层帖子卡：三行正文 + 元信息，菜单不压内容', () => {
  const geometry = probe()
  assert.equal(geometry.postTextClamp, '3')
  assert.ok(geometry.postCard.h >= 144, 'the post card keeps the shared minimum height')
  assert.ok(geometry.postCheck.y <= geometry.postText.y, 'the checkbox sits above the excerpt')
  assert.ok(geometry.postCheck.x > geometry.postCard.x + geometry.postCard.w / 2, 'the post checkbox moved to the right corner')
  assert.equal(geometry.postTextPaddingRight, '28px', 'the first line clears the right-hand checkbox')
  assert.equal(geometry.postOverlayOverlapsMenu, false, 'the ⋯ menu must not cover the hover CTA')
})

test('根层帖子卡：长失败原因仍按三行截断，高度与估算一致', () => {
  const geometry = probe()
  assert.equal(geometry.failedClamp, '3', 'the inline reason obeys the post clamp')
  assert.ok(
    Math.abs(geometry.failedPost.h - Math.max(144, 24 + 3 * 20 + 24 + 2)) <= 2,
    `a long reason must not grow the card (got ${geometry.failedPost.h})`,
  )
  assert.ok(geometry.failedText.h <= 3 * 20 + 1, 'the reason renders at most three lines')
})

test('根层 text-media 卡：去掉卡片内边距后高度与估算一致', () => {
  const geometry = probe()
  assert.ok(
    Math.abs(geometry.textMediaCard.h - (geometry.textMediaCover.h + 82 + 2)) <= 2,
    `text-media must drop its card padding (card ${geometry.textMediaCard.h}, cover ${geometry.textMediaCover.h})`,
  )
})
