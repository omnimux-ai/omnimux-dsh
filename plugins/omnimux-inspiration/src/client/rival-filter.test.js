import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { zh } from './locales.js'
import {
  ALL_ACCOUNTS,
  accountIds,
  invertAccountSelection,
  resetAccountSelection,
  rivalSelectionSummary,
  selectionQuery,
  selectedAccountIds,
  toAccountFilterRow,
  toRivalCardRow,
  toRivalPost,
  toggleAccountSelection,
} from './rival-filter.js'

/**
 * The multi-select rules behind the 账号监控 filter, and the adapter that turns
 * a feed row into a card.
 *
 * The selection is「mode + set」rather than a bare set, and this file is where
 * that decision earns its keep: 反选 from 全部 and 重置 to 全部 are different
 * states with the same empty set, and only an explicit mode can tell them apart.
 */

const t = (key) => zh[key] || key
const ALL_IDS = ['ra_a', 'ra_b', 'ra_c']

describe('rival-filter — 勾选', () => {
  it('unchecking from 全部 materializes the rest', () => {
    const next = toggleAccountSelection(ALL_ACCOUNTS, 'ra_a', ALL_IDS)
    assert.deepEqual(next, { mode: 'subset', ids: ['ra_b', 'ra_c'] })
  })

  it('checking one back in returns to 全部 instead of a subset that covers everything', () => {
    const without = toggleAccountSelection(ALL_ACCOUNTS, 'ra_a', ALL_IDS)
    const back = toggleAccountSelection(without, 'ra_a', ALL_IDS)
    assert.deepEqual(back, { mode: 'all', ids: [] })
    assert.equal(rivalSelectionSummary(back, t), '账号')
  })

  it('grows a subset without losing what was already excluded', () => {
    const withoutA = toggleAccountSelection(ALL_ACCOUNTS, 'ra_a', ALL_IDS)
    const withoutAB = toggleAccountSelection(withoutA, 'ra_b', ALL_IDS)
    assert.deepEqual(withoutAB, { mode: 'subset', ids: ['ra_c'] })
  })

  it('ignores an id that is not monitored', () => {
    assert.deepEqual(toggleAccountSelection(ALL_ACCOUNTS, 'ra_ghost', ALL_IDS), { mode: 'all', ids: [] })
  })
})

describe('rival-filter — 反选与重置', () => {
  it('inverting 全部 leaves nothing selected', () => {
    const inverted = invertAccountSelection(ALL_ACCOUNTS, ALL_IDS)
    assert.deepEqual(inverted, { mode: 'subset', ids: [] })
    assert.equal(rivalSelectionSummary(inverted, t), '未选择账号 (0)')
  })

  it('inverting a subset selects its complement, in list order', () => {
    const subset = { mode: 'subset', ids: ['ra_b'] }
    assert.deepEqual(invertAccountSelection(subset, ALL_IDS).ids, ['ra_a', 'ra_c'])
  })

  it('inverting twice returns to where it started', () => {
    const once = invertAccountSelection(ALL_ACCOUNTS, ALL_IDS)
    const twice = invertAccountSelection(once, ALL_IDS)
    // The empty complement's complement is everything, which normalizes back to
    // `all` — the state that also accepts accounts added later.
    assert.deepEqual(twice, { mode: 'all', ids: [] })
  })

  it('重置 returns to the default, not to an empty selection', () => {
    assert.deepEqual(resetAccountSelection(), { mode: 'all', ids: [] })
  })
})

describe('rival-filter — 触发按钮文案与请求参数', () => {
  it('reads the three wordings the prototype defines', () => {
    // 全量态是维度名，不是一句统计：design.md §5.1 要求全选态读作维度名或
    // 「名: 值」，监控账号的数量不属于用户此刻在选择的东西。
    assert.equal(rivalSelectionSummary(ALL_ACCOUNTS, t), '账号')
    assert.doesNotMatch(rivalSelectionSummary(ALL_ACCOUNTS, t), /\d/, '全量态不得带计数')
    assert.equal(rivalSelectionSummary({ mode: 'subset', ids: ['ra_a', 'ra_b', 'ra_c'] }, t), '已选 3 个账号')
    assert.equal(rivalSelectionSummary({ mode: 'subset', ids: [] }, t), '未选择账号 (0)')
  })

  it('serializes 全部 as an omitted parameter and a subset in list order', () => {
    assert.equal(selectionQuery(ALL_ACCOUNTS, ALL_IDS), '')
    assert.equal(selectionQuery({ mode: 'subset', ids: ['ra_c', 'ra_a'] }, ALL_IDS), 'ra_a,ra_c')
    assert.equal(selectionQuery({ mode: 'subset', ids: [] }, ALL_IDS), '')
  })

  it('reads the ids a selection covers, in the account list order', () => {
    assert.deepEqual(selectedAccountIds(ALL_IDS, ALL_ACCOUNTS), ALL_IDS)
    assert.deepEqual(selectedAccountIds(ALL_IDS, { mode: 'subset', ids: ['ra_c'] }), ['ra_c'])
    assert.deepEqual(selectedAccountIds(ALL_IDS, { mode: 'subset', ids: new Set(['ra_b', 'ra_a']) }), ['ra_a', 'ra_b'])
  })

  it('survives a value that is not a list', () => {
    assert.deepEqual(accountIds(null), [])
    assert.deepEqual(accountIds([{ id: 'ra_a' }, {}, null]), ['ra_a'])
  })
})

describe('rival-filter — 账号行', () => {
  const account = {
    id: 'ra_a',
    nickname: 'Alice Studio',
    handle: '@alice',
    platform: 'tiktok',
    avatar_url: '',
    profile_url: 'https://www.tiktok.com/@alice',
    post_count: 7,
  }

  it('carries what the row renders, checked or not', () => {
    const checked = toAccountFilterRow(account, ALL_ACCOUNTS)
    assert.equal(checked.checked, true)
    assert.equal(checked.nickname, 'Alice Studio')
    assert.equal(checked.handle, '@alice')
    assert.equal(checked.postCount, 7)
    assert.equal(checked.initial, 'A', 'a missing avatar falls back to a drawn initial')

    const unchecked = toAccountFilterRow(account, { mode: 'subset', ids: [] })
    assert.equal(unchecked.checked, false)
  })

  it('falls back to the handle when an account has no nickname', () => {
    const row = toAccountFilterRow({ id: 'ra_b', handle: '@bob' }, ALL_ACCOUNTS)
    assert.equal(row.nickname, '@bob')
    assert.equal(row.initial, 'B')
  })
})

describe('rival-filter — 作品行到卡片', () => {
  const feedRow = {
    id: 'post_1',
    row_id: 'ra_a:post_1',
    account_id: 'ra_a',
    title: '第一条作品',
    url: 'https://www.tiktok.com/@alice/video/1',
    posted_at: '2026-09-12T08:00:00.000Z',
    duration: 31,
    stats: { views: 1200, likes: 30, comments: 4, shares: 1 },
    cover_src: '/omnimux/inspiration/local/media/rival-accounts/covers/rival-1.jpg',
    source_platform: 'tiktok',
    in_library: true,
    inspiration_id: 'insp_9',
    account: { id: 'ra_a', nickname: 'Alice Studio', handle: '@alice', platform: 'tiktok', profile_url: 'https://www.tiktok.com/@alice' },
  }

  it('uses the composite row id, so two accounts cannot collide on a key', () => {
    assert.equal(toRivalCardRow(feedRow).id, 'ra_a:post_1')
  })

  it('is a monitored work, not a library row', () => {
    const card = toRivalCardRow(feedRow)
    assert.equal(card.is_local, false, 'the card must show a platform badge, not 本地')
    assert.equal(card.source_platform, 'tiktok')
    assert.equal(card.cover_key, feedRow.cover_src)
    assert.equal(card.cover_http_url, feedRow.cover_src, 'the replication chain reads the original address from here')
    assert.equal(card.in_library, true)
    assert.equal(card.inspiration_id, 'insp_9')
    assert.equal(card.author_name, 'Alice Studio')
    // No import-status field: a monitored work has no import to announce, and a
    // stray status would put a pill on every card.
    assert.equal('import_status' in card, false)
  })

  it('carries the author block the detail dialog names the creator from', () => {
    const card = toRivalCardRow(feedRow)
    assert.equal(card.account.handle, '@alice')
    assert.equal(card.account.platform, 'tiktok')
    assert.equal(card.account.profile_url, 'https://www.tiktok.com/@alice')
  })

  it('falls back through text, url and id for a title', () => {
    assert.equal(toRivalCardRow({ row_id: 'r:1', id: '1', text: 'body' }).title, 'body')
    assert.equal(toRivalCardRow({ row_id: 'r:1', id: '1', url: 'https://x/1' }).title, 'https://x/1')
    assert.equal(toRivalCardRow({ row_id: 'r:1', id: '1' }).title, '1')
  })

  it('keeps the ids the replication chain needs when mapping back to a post', () => {
    const post = toRivalPost(toRivalCardRow(feedRow))
    assert.equal(post.id, 'post_1', 'the chain posts media for the original post id')
    assert.equal(post.account_id, 'ra_a', 'and for the account that owns it')
    assert.equal(post.url, feedRow.url)
    assert.equal(post.cover_http_url, feedRow.cover_src)
  })
})
