import assert from 'node:assert/strict'
import { after, it } from 'node:test'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { COLLECTION_DETAIL_CACHE_URL, mountCoverCard } from './test-fixtures/collection-detail-render.mjs'
import { toInspirationCardRow } from './inspiration-card.js'
import { FEED_LAYOUT, rivalCardHeightPx } from './rival-masonry.js'
import { formatDuration } from './rival-format.js'
import { zh } from './locales.js'

/**
 * Render gates for the root library card (Issue 3477).
 *
 * The root feed now shares the collection card shell: cover → two-line title →
 * meta row, with corner chips, a status chip for failures, and a hover toolbar
 * on the cover. Only the media ratio differs (data ratio here, 4:5 in a
 * collection). These gates pin the structure that the two surfaces now share,
 * so a change to one cannot silently drop back to the old title-above-cover card.
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

it('root media card uses the shared cover-first shell', async () => {
  const descriptor = toInspirationCardRow(TIKTOK_ROW, t)
  assert.equal(descriptor.layout, FEED_LAYOUT, 'the root mapping carries the shared layout marker')
  const mounted = await mountCoverCard({ card: cardProps(TIKTOK_ROW), descriptor })
  try {
    const article = mounted.container.querySelector('article')
    assert.ok(article.classList.contains('is-library'))
    assert.ok(article.classList.contains('t-short-video'))
    const wrap = mounted.container.querySelector('.omnimux-inspiration-cover-wrap')
    const body = mounted.container.querySelector('.omnimux-rival-card-body')
    assert.ok(wrap, 'the cover is wrapped so the corner chips and hover toolbar can live on it')
    assert.ok(body, 'the shared body carries the title and the meta row')
    assert.ok(!mounted.container.querySelector('.omnimux-rival-card-title-zone'), 'no title above the cover')
    const title = body.querySelector('.omnimux-rival-card-title')
    assert.ok(title.className.includes('clamp-2'), 'the title is clamped to two lines')
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-type').textContent, zhTable.get('type.video'))
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-duration').textContent, formatDuration(32))
    assert.ok(metaRow(mounted.container), 'the meta row is present')
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-platform'), null, 'the platform moved into the meta row')
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-overlay-play'), null, 'no centred play button')
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-overlay-footer'), null, 'no duplicated footer title')
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-card-error'), null)
  } finally {
    await mounted.unmount()
    mounted.close()
  }
})

it('root media card keeps the data ratio and the shared body height', () => {
  const descriptor = toInspirationCardRow(TIKTOK_ROW, t)
  const width = 240
  const inner = width - 2
  assert.equal(rivalCardHeightPx(descriptor, width), inner / (9 / 16) + 82 + 2)
})

it('shows view counts in the meta row when the row carries them', async () => {
  const mounted = await mountCoverCard({ card: cardProps(VIEWED_ROW), descriptor: toInspirationCardRow(VIEWED_ROW, t) })
  try {
    const meta = metaRow(mounted.container).textContent.replace(/\s+/g, ' ')
    assert.match(meta, /播放/, 'the view segment renders when the row has stats')
  } finally {
    await mounted.unmount()
    mounted.close()
  }
})

it('puts the image count on the duration corner', async () => {
  const mounted = await mountCoverCard({ card: cardProps(GALLERY_ROW), descriptor: toInspirationCardRow(GALLERY_ROW, t) })
  try {
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-type').textContent, zhTable.get('type.image'))
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-duration').textContent, `3 ${zhTable.get('type.image')}`)
  } finally {
    await mounted.unmount()
    mounted.close()
  }
})

it('root media failures use the status chip instead of an overlay block', async () => {
  const mounted = await mountCoverCard({ card: cardProps(FAILED_MEDIA_ROW), descriptor: toInspirationCardRow(FAILED_MEDIA_ROW, t) })
  try {
    const chip = mounted.container.querySelector('.omnimux-inspiration-card-status')
    assert.ok(chip)
    assert.equal(chip.textContent, zhTable.get('add.status.failed'))
    assert.ok(chip.getAttribute('title').includes(DETAIL))
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-card-error'), null)
    assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-status'), null)
  } finally {
    await mounted.unmount()
    mounted.close()
  }
})

it('root posts use the shared body with a three-line excerpt and the meta row', async () => {
  const descriptor = toInspirationCardRow(POST_ROW, t)
  assert.equal(descriptor.card_type, 'text')
  const mounted = await mountCoverCard({ card: cardProps(POST_ROW), descriptor })
  try {
    const body = mounted.container.querySelector('.omnimux-rival-card-body')
    assert.ok(body.classList.contains('is-post'))
    const text = body.querySelector('.omnimux-rival-card-text')
    assert.ok(text.className.includes('clamp-3'), 'the excerpt is clamped to three lines')
    assert.ok(metaRow(mounted.container), 'posts share the same meta row')
    assert.ok(!mounted.container.querySelector('.omnimux-inspiration-cover-wrap'), 'posts have no cover')
  } finally {
    await mounted.unmount()
    mounted.close()
  }
})

it('account monitor cards keep their old geometry (no layout marker)', () => {
  const monitorCard = { card_type: 'short-video', type: 'video', title: '监控卡' }
  assert.equal(rivalCardHeightPx(monitorCard, 240), 238 / (9 / 16) + 22 + 18 + 2)
})
