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

  it('cover_key / cover_src / cover_http_url 三字段同源同值（R8-⑦：只吃 cover_src 的回归不可达）', () => {
    // QA 实测「coverSrc 只吃 cover_src」注入后 534 条 client 测试 0 fail——
    // 该行为对纯 JS 单测不可达，因为三字段各自由不同消费者读：cover_key
    // 给卡片媒体占位、cover_src 给详情弹窗、cover_http_url 给复刻链。
    // 三字段必须同源同值（cover_src 优先，cover_url 兜底），否则某一消费
    // 侧悄悄拿不到封面。
    const direct = toRivalCardRow(feedRow)
    assert.equal(direct.cover_key, feedRow.cover_src)
    assert.equal(direct.cover_src, feedRow.cover_src)
    assert.equal(direct.cover_http_url, feedRow.cover_src)
    // cover_url 兜底同样归一到三个字段（R7-⑨：仅带 cover_url 的行曾被判
    // 媒体卡但封面为空——has_media 认 cover_url、导出却只认 cover_src）。
    const viaUrl = toRivalCardRow({ ...feedRow, cover_src: '', cover_url: 'https://cdn.example/c2.jpg' })
    assert.equal(viaUrl.cover_key, 'https://cdn.example/c2.jpg')
    assert.equal(viaUrl.cover_src, 'https://cdn.example/c2.jpg')
    assert.equal(viaUrl.cover_http_url, 'https://cdn.example/c2.jpg')
    assert.equal(viaUrl.has_media, true)
  })
})

describe('rival-filter — v2.1 卡片描述符扩字段', () => {
  const base = {
    id: 'post_9',
    row_id: 'ra_a:post_9',
    account_id: 'ra_a',
    title: '某条内容',
    url: 'https://x.com/a/status/9',
    stats: { views: 1, likes: 0, comments: 0, shares: 0 },
    account: { id: 'ra_a', nickname: 'Alice Studio', handle: '@alice', platform: 'x' },
  }

  it('normalizes host type + platform into the five spec §9.1 card types', () => {
    const of = (row) => toRivalCardRow(row).card_type
    assert.equal(of({ ...base, type: 'video', source_platform: 'tiktok' }), 'short-video')
    assert.equal(of({ ...base, type: 'video', source_platform: 'youtube' }), 'long-video')
    assert.equal(of({ ...base, type: 'image', source_platform: 'instagram' }), 'image')
    assert.equal(of({ ...base, type: 'text', source_platform: 'x' }), 'text')
    assert.equal(of({ ...base, type: 'video', source_platform: 'x' }), 'text-media')
  })

  it('passes ratio through and derives has_media from the cover address', () => {
    const withMedia = toRivalCardRow({ ...base, type: 'image', source_platform: 'instagram', ratio: 1.5, cover_src: '/m/1.jpg' })
    assert.equal(withMedia.ratio, 1.5)
    assert.equal(withMedia.has_media, true)

    const withoutMedia = toRivalCardRow({ ...base, type: 'text', source_platform: 'x' })
    assert.equal(withoutMedia.ratio, null)
    assert.equal(withoutMedia.has_media, false)
  })

  it('keeps the cover readable under the field name the detail dialog consumes (R5-②)', () => {
    // The whitelist renames cover_src to cover_key for the grid card — but the
    // detail dialog is handed the same descriptor and reads cover_src. It must
    // survive the mapping, or the dialog's cover is always empty.
    const card = toRivalCardRow({ ...base, cover_src: '/omnimux/inspiration/media/x.jpg' })
    assert.equal(card.cover_src, '/omnimux/inspiration/media/x.jpg')
    assert.equal(card.cover_key, '/omnimux/inspiration/media/x.jpg')
  })

  it('carries velocity and state through verbatim for the card to render', () => {
    const velocity = { text: '爆款 23k/h', tier: 'hot' }
    const card = toRivalCardRow({ ...base, type: 'video', source_platform: 'tiktok', velocity, state_label: '已处理', done: true })
    assert.deepEqual(card.velocity, velocity)
    assert.equal(card.state_label, '已处理')
    assert.equal(card.done, true)
  })

  it('marks metric template per spec §9.5: video plays, image/text read', () => {
    const of = (row) => toRivalCardRow(row).metrics_template
    assert.equal(of({ ...base, type: 'video', source_platform: 'tiktok' }), 'play')
    assert.equal(of({ ...base, type: 'video', source_platform: 'x' }), 'play')
    assert.equal(of({ ...base, type: 'image', source_platform: 'instagram' }), 'read')
    assert.equal(of({ ...base, type: 'text', source_platform: 'x' }), 'read')
  })

  it('derives the done flag from spec §9.2 state sources, done_at wins', () => {
    const done = toRivalCardRow({ ...base, done_at: '2026-10-05T09:12:00Z', in_library: true })
    assert.equal(done.done, true)
    assert.equal(done.state, 'done')

    const replicated = toRivalCardRow({ ...base, in_library: true, inspiration_id: 'insp_1' })
    assert.equal(replicated.done, true)
    assert.equal(replicated.state, 'replicated')

    const interacted = toRivalCardRow({ ...base, interacted_at: new Date(2026, 9, 5, 9, 12).toISOString() })
    assert.equal(interacted.done, true)
    assert.equal(interacted.state, 'interacted')

    const fresh = toRivalCardRow({ ...base })
    assert.equal(fresh.done, false)
    assert.equal(fresh.state, null)
    assert.equal(fresh.state_label, '')
  })
})
