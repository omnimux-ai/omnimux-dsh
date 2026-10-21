import assert from 'node:assert/strict'
import { after, it } from 'node:test'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { COLLECTION_DETAIL_CACHE_URL, mountCoverCard } from '../../tests/fixtures/collection-detail-render.mjs'
import { toInspirationCardRow } from './inspiration-card.js'
import { FEED_LAYOUT, rivalCardHeightPx } from './rival-masonry.js'
import { zh } from './locales.js'

/**
 * Render gates for the root library card (Issue 3477 / 3502).
 *
 * The default face is content-only: a media card renders the cover alone and
 * keeps title/meta/CTA in a hover layer; a post card keeps its 3-line excerpt.
 * The hover layer is CSS, so these gates pin the DOM contract that the styles
 * rely on, while the e2e probe pins the geometry in a real browser.
 */

const zhTable = new Map(Object.entries(zh))
const t = (key) => zhTable.get(key) || key
const CREATED = '2026-10-17T08:00:00.000Z'
const DETAIL = '导入中断或超时，请重试'

const TIKTOK_ROW = {
  id: 'feed_v1',
  title: '竖屏口播：三秒钩子怎么写',
  is_local: true,
  source_platform: 'tiktok',
  type: 'video',
  content_shape: 'video',
  media_urls: ['/omnimux/inspiration/local/media/videos/v1.mp4'],
  duration: 32,
  created_at: CREATED,
}

const GALLERY_ROW = {
  id: 'feed_g1',
  title: '桌面收纳的三种构图',
  is_local: true,
  source_platform: 'instagram',
  type: 'image',
  content_shape: 'gallery',
  cover_url: '/omnimux/inspiration/local/media/covers/g0.png',
  media_urls: [
    '/omnimux/inspiration/local/media/covers/g0.png',
    '/omnimux/inspiration/local/media/covers/g1.png',
    '/omnimux/inspiration/local/media/covers/g2.png',
  ],
  created_at: CREATED,
}

const VIEWED_ROW = {
  id: 'feed_p1',
  title: '云端爆款：开场三秒的结构',
  source_platform: 'tiktok',
  type: 'video',
  content_shape: 'video',
  media_urls: ['/omnimux/inspiration/local/media/videos/p1.mp4'],
  duration: 21,
  stats: { views: 128000, likes: 8600 },
  posted_at: CREATED,
}

const FAILED_MEDIA_ROW = {
  id: 'feed_f1',
  title: '失败的行',
  is_local: true,
  source_platform: 'tiktok',
  type: 'video',
  content_shape: 'video',
  media_urls: ['/omnimux/inspiration/local/media/videos/f1.mp4'],
  duration: 18,
  created_at: CREATED,
  import_status: 'failed',
  import_error: DETAIL,
}

const POST_ROW = {
  id: 'feed_t1',
  title: '一条纯文字帖子',
  content: '一条纯文字帖子',
  is_local: true,
  source_platform: 'x',
  type: 'link',
  created_at: CREATED,
}

function cardProps(row) {
  return {
    row,
    t,
    onSelect() {},
    onReplicate() {},
    selected: false,
    onToggleSelect() {},
    selecting: false,
    replicateBusy: null,
    revealed: true,
  }
}

function metaRow(container) {
  return container.querySelector('.omnimux-inspiration-card-meta')
}

after(() => {
  rmSync(fileURLToPath(COLLECTION_DETAIL_CACHE_URL), { recursive: true, force: true })
})

it('root media card renders the cover and keeps the rest in the hover layer', async () => {
  const descriptor = toInspirationCardRow(TIKTOK_ROW, t)
  assert.equal(descriptor.layout, FEED_LAYOUT)
  const mounted = await mountCoverCard({ card: cardProps(TIKTOK_ROW), descriptor })
  try {
    const article = mounted.container.querySelector('article')
    assert.ok(article.classList.contains('is-library'))
    assert.ok(article.classList.contains('t-short-video'))
    assert.ok(mounted.container.querySelector('.omnimux-inspiration-cover-wrap'), 'the cover is the default face')
    const body = mounted.container.querySelector('.omnimux-rival-card-body')
    assert.ok(body, 'the title/meta hover layer exists in the DOM')
    assert.ok(body.querySelector('.omnimux-rival-card-title').className.includes('clamp-2'))
    assert.ok(metaRow(mounted.container), 'the meta row rides in the hover layer')
    assert.ok(mounted.container.querySelector('.omnimux-inspiration-card-overlay.is-cover'), 'the CTA hover layer')
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-overlay-cta').querySelectorAll('button').length, 2)
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-type'), null, 'no corner chips on the card face')
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-duration'), null)
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-platform'), null)
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-card-status'), null)
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-overlay-play'), null)
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-overlay-footer'), null)
  } finally {
    await mounted.unmount()
    mounted.close()
  }
})

it('media card height is the cover plus the 2px border', () => {
  const descriptor = toInspirationCardRow(TIKTOK_ROW, t)
  assert.equal(rivalCardHeightPx(descriptor, 240), 238 / (9 / 16) + 2)
})

it('keeps view counts in the hover meta row when the row carries them', async () => {
  const mounted = await mountCoverCard({ card: cardProps(VIEWED_ROW), descriptor: toInspirationCardRow(VIEWED_ROW, t) })
  try {
    const meta = metaRow(mounted.container).textContent.replace(/\s+/g, ' ')
    assert.match(meta, /播放/)
  } finally {
    await mounted.unmount()
    mounted.close()
  }
})

it('drops the gallery count chip and keeps the cover-first shell', async () => {
  const mounted = await mountCoverCard({ card: cardProps(GALLERY_ROW), descriptor: toInspirationCardRow(GALLERY_ROW, t) })
  try {
    assert.equal(mounted.container.querySelector('[data-card-type]').getAttribute('data-card-type'), 'image')
    assert.ok(mounted.container.querySelector('.omnimux-inspiration-cover-img'))
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-duration'), null)
  } finally {
    await mounted.unmount()
    mounted.close()
  }
})

it('collapses a media failure into one always-visible icon that carries the reason', async () => {
  const mounted = await mountCoverCard({ card: cardProps(FAILED_MEDIA_ROW), descriptor: toInspirationCardRow(FAILED_MEDIA_ROW, t) })
  try {
    const icon = mounted.container.querySelector('.omnimux-inspiration-card-failure')
    assert.ok(icon)
    assert.equal(icon.getAttribute('role'), 'img')
    assert.equal(icon.className.includes('is-failed'), true)
    assert.ok(icon.getAttribute('title').includes(DETAIL))
    assert.ok(icon.getAttribute('aria-label').includes(DETAIL))
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-card-status'), null)
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-card-error'), null)
  } finally {
    await mounted.unmount()
    mounted.close()
  }
})

it('root posts show a three-line excerpt and keep meta + CTA in the hover layer', async () => {
  const descriptor = toInspirationCardRow(POST_ROW, t)
  assert.equal(descriptor.card_type, 'text')
  const mounted = await mountCoverCard({ card: cardProps(POST_ROW), descriptor })
  try {
    const body = mounted.container.querySelector('.omnimux-rival-card-body')
    assert.ok(body.classList.contains('is-post'))
    assert.ok(body.querySelector('.omnimux-rival-card-text').className.includes('clamp-3'))
    const overlay = mounted.container.querySelector('.omnimux-inspiration-card-overlay.is-post')
    assert.ok(overlay, 'the post hover layer')
    assert.ok(overlay.querySelector('.omnimux-inspiration-card-meta'))
    assert.equal(overlay.querySelectorAll('button').length, 2)
    assert.ok(!mounted.container.querySelector('.omnimux-inspiration-cover-wrap'))
  } finally {
    await mounted.unmount()
    mounted.close()
  }
})

it('post height stays inside the portrait cap', () => {
  const descriptor = toInspirationCardRow(POST_ROW, t)
  assert.equal(rivalCardHeightPx(descriptor, 240), 144)
  // A very narrow column would otherwise exceed the 9:16 portrait height.
  assert.equal(rivalCardHeightPx(descriptor, 60), Math.min(144, 58 * (16 / 9)))
})

it('account monitor cards keep their old geometry (no layout marker)', () => {
  const monitorCard = { card_type: 'short-video', type: 'video', title: '监控卡' }
  assert.equal(rivalCardHeightPx(monitorCard, 240), 238 / (9 / 16) + 22 + 18 + 2)
})
