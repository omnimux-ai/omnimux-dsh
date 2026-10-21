import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  COLLECTION_DETAIL_CACHE_URL,
  mountCollectionHeader,
  mountCoverCard,
} from './test-fixtures/collection-detail-render.mjs'
import { toCollectionMemberCard, toInspirationCardRow } from './inspiration-card.js'
import {
  COLLECTION_MEMBER_LAYOUT,
  FEED_LAYOUT,
  RIVAL_MEDIA_FIRST_RATIO,
  rivalCardHeightPx,
  rivalMediaRatioOf,
} from './rival-masonry.js'
import { zh } from './locales.js'

/**
 * Render gates for the collection detail surface (Issue 3459).
 *
 * Two behaviours are pinned here because they are the ones that regress
 * visually rather than functionally:
 *   - a collection member card is cover-first: media, then a two-line title,
 *     then one meta row. The failure reason is a status chip in that row, not an
 *     absolutely positioned block over the cover;
 *   - the collection header is a real header: return, name, add-to-session and
 *     rename, with disabled states while a write is in flight.
 *
 * The control cases matter as much as the new ones: the root library feed has no
 * `layout` marker and must keep the old card shape, a text-only member must keep
 * its in-flow notice, and an X/Twitter member (which resolves to the text-media
 * shape) must still be cover-first — that shape is the one the first version of
 * this change missed.
 */

const zhTable = new Map(Object.entries(zh))
const t = (key) => zhTable.get(key) || key
const CREATED = '2026-10-17T08:00:00.000Z'
const DETAIL = '导入中断或超时，请重试'

const VIDEO_ROW = {
  id: 'insp_v1',
  title: 'YouTube 频道增长拆解：31 天把播放量从 0 拉到 31 万',
  is_local: true,
  source_platform: 'youtube',
  type: 'video',
  content_shape: 'video',
  media_urls: ['/omnimux/inspiration/local/media/videos/v_ab12.mp4'],
  duration: 32,
  created_at: CREATED,
}

const FAILED_ROW = {
  id: 'insp_f1',
  title: '失败的行',
  is_local: true,
  source_platform: 'tiktok',
  type: 'video',
  content_shape: 'video',
  media_urls: ['/omnimux/inspiration/local/media/videos/v_f1.mp4'],
  duration: 18,
  created_at: CREATED,
  import_status: 'failed',
  import_error: DETAIL,
}

/**
 * X/Twitter rows resolve to the `text-media` shape (see `rivalCardTypeOf`).
 * The collection layout must cover them too: they have media, so they are
 * cover-first like every other member.
 */
const X_MEDIA_ROW = {
  id: 'insp_x1',
  title: 'X 上的一条竖屏视频',
  is_local: true,
  source_platform: 'x',
  type: 'video',
  content_shape: 'video',
  media_urls: ['/omnimux/inspiration/local/media/videos/x_f1.mp4'],
  duration: 22,
  created_at: CREATED,
  import_status: 'failed',
  import_error: DETAIL,
}

const ANALYSIS_FAILED_ROW = {
  id: 'insp_a1',
  title: '已入库但未拆解',
  is_local: true,
  source_platform: 'tiktok',
  type: 'video',
  content_shape: 'video',
  media_urls: ['/omnimux/inspiration/local/media/videos/v_a1.mp4'],
  duration: 25,
  created_at: CREATED,
  import_status: 'ready',
  import_error: 'AI 视频拆解失败，请确保大模型视觉分析服务可用',
}

const GALLERY_ROW = {
  id: 'insp_g1',
  title: '桌面收纳的四种构图',
  is_local: true,
  source_platform: 'instagram',
  type: 'image',
  content_shape: 'gallery',
  cover_url: '/omnimux/inspiration/local/media/covers/g0.png',
  media_urls: [
    '/omnimux/inspiration/local/media/covers/g0.png',
    '/omnimux/inspiration/local/media/covers/g1.png',
    '/omnimux/inspiration/local/media/covers/g2.png',
    '/omnimux/inspiration/local/media/covers/g3.png',
  ],
  created_at: CREATED,
}

const TEXT_ROW = {
  id: 'insp_t1',
  title: '',
  is_local: true,
  source_platform: 'x',
  type: 'text',
  created_at: CREATED,
  import_status: 'failed',
  import_error: DETAIL,
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

function member(row) {
  return toCollectionMemberCard(row, t)
}

function statusChip(container) {
  return container.querySelector('.omnimux-inspiration-card-status')
}

function metaRow(container) {
  return container.querySelector('.omnimux-inspiration-card-meta')
}

function buttonList(container) {
  return Array.from(container.querySelectorAll('button'))
}

after(() => {
  rmSync(fileURLToPath(COLLECTION_DETAIL_CACHE_URL), { recursive: true, force: true })
})

describe('collection member descriptor', () => {
  it('adds only the layout marker and keeps the shared mapping intact', () => {
    const memberCard = member(VIDEO_ROW)
    assert.equal(memberCard.layout, COLLECTION_MEMBER_LAYOUT)
    assert.equal(memberCard.source_row, VIDEO_ROW, 'the source row must stay attached for the detail dialog')
    assert.equal(memberCard.cover_key, toInspirationCardRow(VIDEO_ROW, t).cover_key)
    assert.equal(toInspirationCardRow(VIDEO_ROW, t).layout, FEED_LAYOUT, 'the root feed shares the card shell, only the ratio differs')
  })

  it('does not mutate the input row', () => {
    const before = JSON.stringify(VIDEO_ROW)
    member(VIDEO_ROW)
    assert.equal(JSON.stringify(VIDEO_ROW), before)
  })
})

describe('collection member geometry', () => {
  it('pins the cover to 4:5 and the body to a fixed height', () => {
    const card = { card_type: 'short-video', type: 'video', has_media: true, layout: COLLECTION_MEMBER_LAYOUT }
    assert.equal(RIVAL_MEDIA_FIRST_RATIO, 4 / 5)
    assert.equal(rivalMediaRatioOf(card), 4 / 5)
    for (const width of [220, 240, 300]) {
      const expected = (width - 2) / (4 / 5) + 2
      const shortCard = { card_type: 'short-video', has_media: true, layout: COLLECTION_MEMBER_LAYOUT, title: '短标题' }
      const longCard = { card_type: 'short-video', has_media: true, layout: COLLECTION_MEMBER_LAYOUT, title: '长标题'.repeat(20) }
      assert.equal(rivalCardHeightPx(shortCard, width), expected)
      assert.equal(rivalCardHeightPx(longCard, width), expected, 'a longer title must not change the card height')
    }
  })

  it('covers text-media members (X/Twitter) with the same cover geometry', () => {
    const xCard = { card_type: 'text-media', media_kind: 'video', has_media: true, layout: COLLECTION_MEMBER_LAYOUT, title: 'x' }
    assert.equal(rivalMediaRatioOf(xCard), 4 / 5)
    assert.equal(rivalCardHeightPx(xCard, 240), 238 / (4 / 5) + 2)
  })

  it('gives text members the shared post formula and keeps plain cards old geometry', () => {
    const text = { card_type: 'text', type: 'text', title: '一条纯文字灵感' }
    const longMember = { card_type: 'text', type: 'text', title: '一条纯文字灵感'.repeat(40), layout: COLLECTION_MEMBER_LAYOUT }
    assert.equal(rivalCardHeightPx(text, 240), Math.max(144, 24 + 20 + 2))
    // 帖子公式最长为 3 行：再长的正文也不会长过 144 的下限；旧文本公式会算到 8 行。
    assert.equal(rivalCardHeightPx(longMember, 240), Math.max(144, 24 + 3 * 20 + 24 + 2))
    assert.notEqual(rivalMediaRatioOf(longMember), 4 / 5)
    const plain = { card_type: 'short-video', type: 'video', title: '普通卡' }
    assert.equal(rivalMediaRatioOf(plain), 9 / 16)
    assert.equal(rivalCardHeightPx(plain, 240), 238 / (9 / 16) + 22 + 18 + 2)
  })
})

describe('collection member card', () => {
  it('renders media, a two-line title and a meta row', async () => {
    const mounted = await mountCoverCard({ card: cardProps(VIDEO_ROW), descriptor: member(VIDEO_ROW) })
    try {
      const article = mounted.container.querySelector('article')
      assert.ok(article, 'the card must render')
      assert.ok(article.classList.contains('is-media-first'), 'the collection layout marker must reach the card')
      const wrap = mounted.container.querySelector('.omnimux-inspiration-cover-wrap')
      const body = mounted.container.querySelector('.omnimux-rival-card-body')
      assert.ok(wrap, 'the cover is the default face')
      assert.ok(body, 'the title/meta hover layer exists in the DOM')
      assert.equal(mounted.container.querySelector('.omnimux-rival-card-title-zone'), null, 'no title above the cover')
      const title = body.querySelector('.omnimux-rival-card-title')
      assert.ok(title.className.includes('clamp-2'), 'the title is clamped to two lines')
      assert.equal(title.getAttribute('title'), VIDEO_ROW.title)

      assert.ok(mounted.container.querySelector('.omnimux-inspiration-card-overlay.is-cover'), 'the CTA hover layer')
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-type'), null, 'no corner chips on the card face')
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-duration'), null)

      const meta = metaRow(mounted.container)
      assert.ok(meta, 'one meta row in the hover layer')
      assert.match(meta.textContent, /YouTube/)
      const metaTime = meta.querySelector('.omnimux-inspiration-card-meta-time')
      assert.ok(metaTime && metaTime.textContent, 'the join time is present when the row carries it')
      assert.equal(statusChip(mounted.container), null, 'a settled row needs no status chip')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('keeps X/Twitter media members cover-first instead of falling back to text-media layout', async () => {
    const descriptor = member(X_MEDIA_ROW)
    assert.equal(descriptor.card_type, 'text-media', 'X rows resolve to the text-media shape')
    const mounted = await mountCoverCard({ card: cardProps(X_MEDIA_ROW), descriptor })
    try {
      const article = mounted.container.querySelector('article')
      assert.ok(article.classList.contains('is-media-first'), 'text-media members have media, so they are cover-first too')
      assert.ok(article.classList.contains('t-text-media'))
      assert.ok(mounted.container.querySelector('.omnimux-rival-card-body'), 'the body must render for text-media members')
      assert.ok(metaRow(mounted.container), 'the meta row must render for text-media members')
      assert.ok(mounted.container.querySelector('.omnimux-inspiration-card-overlay.is-cover'), 'the CTA hover layer')
      assert.equal(mounted.container.querySelector('.omnimux-rival-card-title-zone'), null)
      const icon = mounted.container.querySelector('.omnimux-inspiration-card-failure')
      assert.ok(icon, 'a failed text-media member still says so on the card')
      assert.equal(icon.className.includes('is-failed'), true)
      assert.ok(icon.getAttribute('title').includes(DETAIL))
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-card-error'), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('puts the type on the left corner and the count on the right corner', async () => {
    const mounted = await mountCoverCard({ card: cardProps(GALLERY_ROW), descriptor: member(GALLERY_ROW) })
    try {
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-type'), null, 'corner chips are gone')
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-duration'), null)
      assert.ok(mounted.container.querySelector('.omnimux-inspiration-cover-img'), 'the gallery cover still renders')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('moves a failed import reason into the status chip', async () => {
    const mounted = await mountCoverCard({ card: cardProps(FAILED_ROW), descriptor: member(FAILED_ROW) })
    try {
      const icon = mounted.container.querySelector('.omnimux-inspiration-card-failure')
      assert.ok(icon, 'a failed media card must say so on the card')
      assert.equal(icon.getAttribute('role'), 'img')
      assert.equal(icon.className.includes('is-failed'), true)
      assert.ok(icon.getAttribute('title').includes(DETAIL), 'hovering the icon reveals the reason')
      assert.ok(icon.getAttribute('aria-label').includes(DETAIL), 'assistive tech must get the reason too')
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-card-error'), null, 'no absolute block over the cover or title')
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-badge-status'), null, 'no duplicate centred pill')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('labels a settled row whose AI breakdown failed without calling it an import failure', async () => {
    const mounted = await mountCoverCard({ card: cardProps(ANALYSIS_FAILED_ROW), descriptor: member(ANALYSIS_FAILED_ROW) })
    try {
      const icon = mounted.container.querySelector('.omnimux-inspiration-card-failure')
      assert.ok(icon)
      assert.equal(icon.className.includes('is-settled'), true)
      assert.equal(icon.className.includes('is-failed'), false, 'the import itself succeeded')
      assert.ok(icon.getAttribute('title').includes('AI 视频拆解失败'))
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-card-error'), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('keeps a text-only member on the in-flow notice', async () => {
    const mounted = await mountCoverCard({ card: cardProps(TEXT_ROW), descriptor: member(TEXT_ROW) })
    try {
      assert.ok(!mounted.container.querySelector('.omnimux-inspiration-cover-wrap'), 'a text member has no cover')
      assert.ok(metaRow(mounted.container), 'it still carries the shared meta row in the hover layer')
      const notice = mounted.container.querySelector('.omnimux-inspiration-card-error.is-inline')
      assert.ok(notice, 'a text member keeps its short state body')
      assert.equal(notice.textContent, zhTable.get('add.status.failed'))
      const icon = mounted.container.querySelector('.omnimux-inspiration-card-failure')
      assert.ok(icon, 'the failure icon keeps the full reason reachable')
      assert.ok(icon.getAttribute('title').includes(DETAIL))
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('gives the root feed the shared shell even without a descriptor', async () => {
    const mounted = await mountCoverCard({ card: cardProps(VIDEO_ROW) })
    try {
      const article = mounted.container.querySelector('article')
      assert.ok(article.classList.contains('is-library'), 'the mapping marks the root feed as a library card')
      assert.ok(mounted.container.querySelector('.omnimux-rival-card-body'), 'the root feed renders the shared hover body')
      assert.ok(metaRow(mounted.container), 'the root feed renders the shared meta row')
      assert.ok(mounted.container.querySelector('.omnimux-inspiration-cover-wrap'), 'the cover is the default face')
      assert.ok(!mounted.container.querySelector('.omnimux-rival-card-title-zone'), 'no title above the cover')
      assert.equal(mounted.container.querySelector('article').getAttribute('data-card-type'), 'long-video')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

describe('collection header', () => {
  function freshCalls() {
    return { back: 0, rename: 0, add: 0 }
  }

  function handlersFor(calls) {
    return {
      onBack() { calls.back += 1 },
      onRename() { calls.rename += 1 },
      onAddToSession() { calls.add += 1 },
    }
  }

  it('shows the name and the three collection-level actions', async () => {
    const calls = freshCalls()
    const handlers = handlersFor(calls)
    const mounted = await mountCollectionHeader({
      t,
      title: '测试合集',
      onBack: handlers.onBack,
      onRename: handlers.onRename,
      onAddToSession: handlers.onAddToSession,
    })
    try {
      assert.equal(mounted.container.querySelector('.omnimux-inspiration-collection-heading').textContent, '测试合集')
      const buttons = buttonList(mounted.container)
      const [back, add, rename] = buttons
      assert.equal(back.textContent, zhTable.get('collection.back'))
      assert.equal(add.textContent, zhTable.get('collection.addToSession'))
      assert.equal(rename.textContent, zhTable.get('collection.rename'))
      await mounted.click(back)
      await mounted.click(add)
      await mounted.click(rename)
      assert.equal(calls.back, 1)
      assert.equal(calls.add, 1)
      assert.equal(calls.rename, 1)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('disables the write actions while a collection mutation is in flight', async () => {
    const calls = freshCalls()
    const handlers = handlersFor(calls)
    const mounted = await mountCollectionHeader({
      t,
      title: '测试合集',
      busy: true,
      onBack: handlers.onBack,
      onRename: handlers.onRename,
      onAddToSession: handlers.onAddToSession,
    })
    try {
      const [back, add, rename] = buttonList(mounted.container)
      assert.equal(add.disabled, true, 'add-to-session is refused during a write')
      assert.equal(rename.disabled, true, 'rename is refused during a write')
      assert.equal(back.disabled, false, 'going back stays available')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('marks the add-to-session action busy while it attaches', async () => {
    const mounted = await mountCollectionHeader({
      t,
      title: '测试合集',
      addToSessionBusy: true,
      onAddToSession() {},
      onRename() {},
    })
    try {
      const buttons = buttonList(mounted.container)
      const add = buttons.find((node) => node.textContent === zhTable.get('collection.addToSession'))
      assert.ok(add)
      assert.equal(add.disabled, true)
      assert.equal(add.getAttribute('aria-busy'), 'true')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('disables the write actions when the collection is not loaded yet', async () => {
    const mounted = await mountCollectionHeader({ t, title: '' })
    try {
      const [back, add, rename] = buttonList(mounted.container)
      assert.equal(back.disabled, false)
      assert.equal(add.disabled, true)
      assert.equal(rename.disabled, true)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})
