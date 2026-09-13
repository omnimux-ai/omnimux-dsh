import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FEED_PAGE_SIZE,
  FEED_PAGE_SIZE_MAX,
  feedCoverSrc,
  feedTitle,
  matchesFeedQuery,
  mergeAccountPosts,
  paginateFeed,
  sortFeedRows,
  toFeedRow,
} from './rival-feed.js'

/**
 * Rules of the aggregated 账号监控 feed.
 *
 * These are the functions that decide what the grid shows, in what order, and
 * with which cover address, so each of them is pinned here rather than through a
 * rendered page: an ordering bug that only appears with three accounts and a tie
 * is not something a render gate finds.
 */

const alice = {
  id: 'ra_alice',
  nickname: 'Alice',
  handle: '@alice',
  platform: 'tiktok',
  profile_url: 'https://www.tiktok.com/@alice',
  avatar_url: 'https://cdn.example/alice.jpg',
}

const bob = { id: 'ra_bob', nickname: 'Bob', handle: '@bob', platform: 'x' }

const post = (id, extra = {}) => ({
  id,
  title: `work ${id}`,
  url: `https://example.com/${id}`,
  posted_at: '2026-09-12T08:00:00.000Z',
  stats: { views: 100, likes: 1, comments: 0, shares: 0 },
  ...extra,
})

describe('rival-feed — cover address', () => {
  it('prefers what the Host already downloaded', () => {
    assert.equal(
      feedCoverSrc(post('p1', {
        cover_http_url: '/omnimux/inspiration/local/media/rival-accounts/covers/a.jpg',
        cover_local_path: '/tmp/b.jpg',
        cover_url: 'https://cdn.example/c.jpg',
      })),
      '/omnimux/inspiration/local/media/rival-accounts/covers/a.jpg',
    )
  })

  it('maps a local file onto the media route when it was not downloaded yet', () => {
    assert.equal(
      feedCoverSrc(post('p1', {
        cover_local_path: '/Users/x/media/rival-accounts/covers/rival-deadbeef.jpg',
        cover_url: 'https://cdn.example/c.jpg',
      })),
      '/omnimux/inspiration/local/media/rival-accounts/covers/rival-deadbeef.jpg',
    )
  })

  it('falls back to the remote original, and answers nothing when there is none', () => {
    assert.equal(feedCoverSrc(post('p1', { cover_url: 'https://cdn.example/c.jpg' })), 'https://cdn.example/c.jpg')
    // A post with no cover anywhere answers '' — an address that 404s is worse
    // than none, because the card's placeholder branch is the honest rendering.
    assert.equal(feedCoverSrc(post('p1')), '')
    assert.equal(feedCoverSrc({}), '')
  })

  it('refuses a basename that could climb out of the media root', () => {
    const src = feedCoverSrc(post('p1', {
      cover_local_path: '/tmp/../../etc/passwd',
      cover_url: 'https://cdn.example/c.jpg',
    }))
    assert.equal(src, 'https://cdn.example/c.jpg', 'a traversing path must fall through to the next source')
  })
})

describe('rival-feed — titles and rows', () => {
  it('falls back through text, url and id', () => {
    assert.equal(feedTitle({ id: 'p1', title: 'T' }), 'T')
    assert.equal(feedTitle({ id: 'p1', text: 'body' }), 'body')
    assert.equal(feedTitle({ id: 'p1', url: 'https://x/1' }), 'https://x/1')
    assert.equal(feedTitle({ id: 'p1' }), 'p1')
  })

  it('builds a composite row id so the same post on two accounts stays distinct', () => {
    const first = toFeedRow(post('p1'), alice)
    const second = toFeedRow(post('p1'), bob)
    assert.equal(first.row_id, 'ra_alice:p1')
    assert.equal(second.row_id, 'ra_bob:p1')
    assert.notEqual(first.row_id, second.row_id)
    assert.equal(first.account_id, 'ra_alice')
    assert.equal(first.source_platform, 'tiktok')
    assert.equal(first.cover_key, first.cover_src, 'the card reads cover_key')
    assert.equal(first.in_library, false)
  })
})

describe('rival-feed — filtering and merge', () => {
  const accounts = [alice, bob]
  const postsByAccount = {
    ra_alice: [
      post('p1', { title: 'Kitchen hack' }),
      post('p2', { title: 'Garden tour' }),
    ],
    ra_bob: [post('p3', { title: 'Studio build' })],
  }

  it('merges every account and counts each author within the filter', () => {
    const rows = mergeAccountPosts({ accounts, postsByAccount })
    assert.equal(rows.length, 3)
    const aliceRow = rows.find((row) => row.row_id === 'ra_alice:p1')
    assert.equal(aliceRow.account.post_count, 2, 'the author count must count only the rows that survived')
    assert.equal(rows.find((row) => row.row_id === 'ra_bob:p3').account.post_count, 1)
  })

  it('matches the keyword against the work and its author', () => {
    const byTitle = mergeAccountPosts({ accounts, postsByAccount, q: 'garden' })
    assert.deepEqual(byTitle.map((row) => row.id), ['p2'])
    //「搜索监控账号的作品」means an account name finds that account's works.
    const byAuthor = mergeAccountPosts({ accounts, postsByAccount, q: 'bob' })
    assert.deepEqual(byAuthor.map((row) => row.id), ['p3'])
    assert.equal(matchesFeedQuery({ id: 'p1' }, alice, '  '), true, 'a blank query matches everything')
  })

  it('keeps only the works of the requested platform', () => {
    const rows = mergeAccountPosts({ accounts, postsByAccount, platform: 'x' })
    assert.deepEqual(rows.map((row) => row.id), ['p3'])
    assert.equal(mergeAccountPosts({ accounts, postsByAccount, platform: 'instagram' }).length, 0)
  })
})

describe('rival-feed — ordering', () => {
  const rows = [
    { id: 'a', posted_at: '2026-09-10T00:00:00.000Z', stats: { views: 10 } },
    { id: 'b', posted_at: '2026-09-12T00:00:00.000Z', stats: { views: 5 } },
    { id: 'c', posted_at: 'not-a-date', stats: { views: 900 } },
    { id: 'd', posted_at: '2026-09-11T00:00:00.000Z' },
    { id: 'e', posted_at: '2026-09-11T00:00:00.000Z' },
  ]

  it('sorts by posted_at descending with unreadable dates last', () => {
    assert.deepEqual(sortFeedRows(rows, 'posted_at').map((row) => row.id), ['b', 'e', 'd', 'a', 'c'])
  })

  it('sorts by views descending, keeping a stable tie order', () => {
    assert.deepEqual(sortFeedRows(rows, 'views').map((row) => row.id), ['c', 'a', 'b', 'e', 'd'])
  })

  it('is stable across identical input, so pagination cannot repeat a row', () => {
    const once = sortFeedRows(rows, 'posted_at').map((row) => row.id)
    const twice = sortFeedRows(sortFeedRows(rows, 'posted_at'), 'posted_at').map((row) => row.id)
    assert.deepEqual(twice, once)
  })
})

describe('rival-feed — pagination', () => {
  const rows = Array.from({ length: 45 }, (_, index) => ({ id: `p${index}` }))

  it('slices the page and reports whether more is left', () => {
    const first = paginateFeed(rows, 1, 20)
    assert.equal(first.items.length, 20)
    assert.equal(first.total, 45)
    assert.equal(first.has_more, true)
    const last = paginateFeed(rows, 3, 20)
    assert.equal(last.items.length, 5)
    assert.equal(last.has_more, false)
  })

  it('defaults the page size and refuses to be talked into a huge one', () => {
    assert.equal(paginateFeed(rows).page_size, FEED_PAGE_SIZE)
    assert.equal(paginateFeed(rows, 1, 9999).page_size, FEED_PAGE_SIZE_MAX)
    assert.equal(paginateFeed(rows, 0, 0).page, 1, 'a nonsense page starts at the first one')
  })

  it('answers an empty page beyond the end without pretending it has more', () => {
    const beyond = paginateFeed(rows, 9, 20)
    assert.deepEqual(beyond.items, [])
    assert.equal(beyond.has_more, false)
    assert.equal(beyond.total, 45)
  })
})
