import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CREATE_SKILL,
  PLAZA_DEFAULT_CHANNELS,
  PLAZA_HIDDEN_TABS,
  PLAZA_INTENT_KEY,
  PLAZA_QUERY_CHANNELS,
  PLAZA_TABS,
  SKILL_SHELF_TAGS,
  SKILL_SHELF_TAXONOMY,
  appendSkillGesture,
  buildPlazaSearchPayload,
  buildSearchPayload,
  consumePlazaIntent,
  filterPickerItems,
  filterPlazaShelf,
  inSkillShelf,
  installPayload,
  keywordsForTag,
  matchesDomainTag,
  skillGesture,
  writePlazaIntent,
  loadPickerSearch,
  peekPickerCache,
  pickerCacheKey,
  writePickerCache,
  PICKER_CACHE_TTL_MS,
} from './skill-picker-logic.js'

describe('skill shelf taxonomy', () => {
  it('locks the shelf order: 电商 first, 平台工具 last', () => {
    assert.deepEqual([...SKILL_SHELF_TAGS], [
      '电商', '商业广告', '短剧漫剧', '专业影视', '动画', '教育', '创意实验', '音频音乐', '平台工具',
    ])
  })

  it('taxonomy rows carry unique ids, label keys and keyword lists', () => {
    assert.equal(SKILL_SHELF_TAXONOMY.length, SKILL_SHELF_TAGS.length)
    const ids = new Set()
    const labelKeys = new Set()
    for (const row of SKILL_SHELF_TAXONOMY) {
      assert.ok(row.id && typeof row.id === 'string')
      assert.ok(/^picker\.tab\./.test(row.labelKey), `labelKey for ${row.id}`)
      assert.ok(Array.isArray(row.keywords) && row.keywords.includes(row.id))
      assert.ok(!ids.has(row.id), `duplicate id ${row.id}`)
      assert.ok(!labelKeys.has(row.labelKey), `duplicate labelKey ${row.labelKey}`)
      ids.add(row.id)
      labelKeys.add(row.labelKey)
    }
    assert.ok(Object.isFrozen(SKILL_SHELF_TAXONOMY))
    assert.ok(Object.isFrozen(SKILL_SHELF_TAGS))
  })
})

describe('skill picker logic', () => {
  it('builds /slug gestures with a trailing space', () => {
    assert.equal(skillGesture({ skill: 'audiobook' }), '/audiobook ')
    assert.equal(skillGesture({ slug: 'storyboard' }), '/storyboard ')
    assert.equal(skillGesture({ skill: '/clip-export' }), '/clip-export ')
    assert.equal(skillGesture({}), '')
  })

  it('appends the gesture after existing draft text', () => {
    assert.equal(appendSkillGesture('', '/audiobook '), '/audiobook ')
    assert.equal(appendSkillGesture('hello', '/audiobook '), 'hello /audiobook ')
    assert.equal(appendSkillGesture('hello ', '/audiobook '), 'hello /audiobook ')
  })

  it('uses custom channel for featured and tag query for domain tabs', () => {
    assert.deepEqual(buildSearchPayload('all', ''), { query: '', limit: 20, offset: 0 })
    assert.deepEqual(buildSearchPayload('featured', '分镜'), {
      query: '分镜',
      limit: 20,
      offset: 0,
      channels: ['custom'],
    })
    assert.deepEqual(buildSearchPayload('短剧漫剧', ''), {
      query: '短剧漫剧',
      limit: 20,
      offset: 0,
    })
    assert.deepEqual(buildSearchPayload('短剧漫剧', '分镜'), {
      query: '分镜 短剧漫剧',
      limit: 20,
      offset: 0,
    })
  })

  it('filters mine / domain tabs without dropping all/featured lists', () => {
    const items = [
      { slug: 'a', installed: true, tags: ['短剧漫剧'] },
      { slug: 'b', installed: false, name: '专业影视配乐', tags: [] },
      { slug: 'c', installed: false, tags: ['动画'] },
      { slug: 'gmail', installed: false, tags: [] },
      { slug: 'ad', installed: false, tags: ['商业广告'] },
    ]
    assert.deepEqual(filterPickerItems(items, 'mine').map((it) => it.slug), ['a'])
    assert.deepEqual(filterPickerItems(items, '短剧漫剧').map((it) => it.slug), ['a'])
    assert.deepEqual(filterPickerItems(items, '专业影视').map((it) => it.slug), ['b'])
    assert.deepEqual(filterPickerItems(items, '商业广告').map((it) => it.slug), ['ad'])
    assert.deepEqual(filterPickerItems(items, 'all').map((it) => it.slug), ['a', 'b', 'c', 'ad'])
  })

  it('installs only when the card is not already installed', () => {
    assert.equal(installPayload({ slug: 'audiobook', installed: true }), null)
    assert.deepEqual(
      installPayload({ slug: 'audiobook', id: 'sk-omx-audiobook', installed: false }),
      { slug: 'audiobook', catalogId: 'sk-omx-audiobook' },
    )
    assert.deepEqual(installPayload({ slug: 'drama-soundtrack' }), { slug: 'drama-soundtrack' })
  })

  it('create-skill identity is sk-omx-skill-creator / skill-creator', () => {
    assert.equal(CREATE_SKILL.id, 'sk-omx-skill-creator')
    assert.equal(skillGesture(CREATE_SKILL), '/skill-creator ')
    assert.notEqual(CREATE_SKILL.id, 'sk-skill-creator')
  })

  it('writes and consumes plaza skills intent once', () => {
    const store = new Map()
    const storage = {
      setItem(k, v) { store.set(k, v) },
      getItem(k) { return store.has(k) ? store.get(k) : null },
      removeItem(k) { store.delete(k) },
    }
    assert.equal(writePlazaIntent('skills', storage), 'skills')
    assert.equal(store.get(PLAZA_INTENT_KEY), JSON.stringify({ tab: 'skills' }))
    assert.equal(consumePlazaIntent(storage), 'skills')
    assert.equal(consumePlazaIntent(storage), null)
  })

  it('hidden plaza tabs are not valid intents (Issue #502)', () => {
    const store = new Map()
    const storage = {
      setItem(k, v) { store.set(k, v) },
      getItem(k) { return store.has(k) ? store.get(k) : null },
      removeItem(k) { store.delete(k) },
    }
    assert.ok(PLAZA_HIDDEN_TABS.includes('connectors'))
    assert.ok(!PLAZA_TABS.includes('connectors'))
    assert.equal(writePlazaIntent('connectors', storage), 'skills')
    storage.setItem(PLAZA_INTENT_KEY, JSON.stringify({ tab: 'connectors' }))
    assert.equal(consumePlazaIntent(storage), null)
  })

  it('picker cache returns hits within TTL and misses after expiry', () => {    const cache = new Map()
    const key = pickerCacheKey({ query: '', limit: 20 })
    const body = { items: [{ slug: 'audiobook' }] }
    writePickerCache(cache, key, body, 1_000)
    assert.deepEqual(peekPickerCache(cache, key, 1_000 + 1_000), body)
    assert.equal(peekPickerCache(cache, key, 1_000 + PICKER_CACHE_TTL_MS), null)
  })

  it('loadPickerSearch skips fetch on cache hit and dedupes inflight', async () => {
    const cache = new Map()
    const inflight = new Map()
    let calls = 0
    const fetchSearch = async () => {
      calls += 1
      return { items: [{ slug: 'a' }], ok: true }
    }
    const first = loadPickerSearch({ query: '' }, { cache, inflight, fetchSearch, now: 10 })
    const second = loadPickerSearch({ query: '' }, { cache, inflight, fetchSearch, now: 10 })
    const [a, b] = await Promise.all([first, second])
    assert.equal(calls, 1)
    assert.equal(a.fromCache, false)
    assert.equal(b.fromCache, false)
    const cached = await loadPickerSearch({ query: '' }, { cache, inflight, fetchSearch, now: 20 })
    assert.equal(calls, 1)
    assert.equal(cached.fromCache, true)
    assert.equal(cached.body.items[0].slug, 'a')
  })

  it('loadPickerSearch starts the TTL at completion time, not request start', async () => {
    const cache = new Map()
    const inflight = new Map()
    let release
    const fetchSearch = () => new Promise((resolve) => { release = resolve })
    const completedAt = () => 5000
    const pending = loadPickerSearch(
      { query: '' },
      { cache, inflight, fetchSearch, now: 100, completedAt },
    )
    release({ items: [{ slug: 'a' }] })
    await pending
    const key = pickerCacheKey({ query: '' })
    // at 必须等于完成时刻 5000，而非发起时刻 100
    assert.equal(cache.get(key).at, 5000)
    // 以完成时刻起算：4900 后仍未过期
    assert.ok(peekPickerCache(cache, key, 5000 + PICKER_CACHE_TTL_MS - 1))
    assert.equal(peekPickerCache(cache, key, 5000 + PICKER_CACHE_TTL_MS), null)
    // 若以发起时刻（100）起算，100 + TTL 时必然已过期；实测仍命中，证明起算点是完成时刻
    assert.ok(peekPickerCache(cache, key, 100 + PICKER_CACHE_TTL_MS))
  })
})

describe('ecommerce keyword expansion (Issue #504)', () => {
  const ecom = SKILL_SHELF_TAXONOMY.find((row) => row.id === '电商')

  it('电商 row carries the five frozen keywords', () => {
    assert.deepEqual([...ecom.keywords], ['电商', '独立站', '跨境', 'shopify', '选品'])
    assert.ok(Object.isFrozen(ecom.keywords))
  })

  it('matches Shopify / SHOPIFY case-insensitively across fields', () => {
    assert.ok(matchesDomainTag({ name: 'Shopify 店铺装修' }, '电商'))
    assert.ok(matchesDomainTag({ description: 'SHOPIFY app connector' }, '电商'))
    assert.ok(matchesDomainTag({ summary: 'shopify theme publisher' }, '电商'))
  })

  it('matches 独立站 / 选品 / 跨境 in untagged descriptions', () => {
    const untagged = [
      { slug: 'dp1', name: '独立站落地页生成', tags: [] },
      { slug: 'dp2', description: '跨境选品调研助手', tags: [] },
      { slug: 'dp3', summary: '为跨境电商写详情页', tags: [] },
    ]
    for (const item of untagged) {
      assert.ok(matchesDomainTag(item, '电商'), `${item.slug} should match 电商`)
      assert.ok(inSkillShelf(item), `${item.slug} should enter the shelf`)
    }
    assert.deepEqual(filterPickerItems(untagged, '电商').map((it) => it.slug), ['dp1', 'dp2', 'dp3'])
    assert.deepEqual(filterPickerItems(untagged, 'all').map((it) => it.slug), ['dp1', 'dp2', 'dp3'])
    assert.deepEqual(filterPlazaShelf(untagged, '电商').map((it) => it.slug), ['dp1', 'dp2', 'dp3'])
    assert.deepEqual(filterPlazaShelf(untagged, '').map((it) => it.slug), ['dp1', 'dp2', 'dp3'])
  })

  it('unknown tags keep literal matching without crashing', () => {
    assert.deepEqual(keywordsForTag('不存在分类'), ['不存在分类'])
    assert.ok(matchesDomainTag({ description: '这个 item 属于 不存在分类 吗' }, '不存在分类'))
    assert.ok(!matchesDomainTag({ description: 'unrelated' }, '不存在分类'))
    const items = [
      { slug: 'x', tags: ['电商'] },
      { slug: 'y', name: '不存在分类 专用', tags: [] },
      { slug: 'z', name: 'plain', tags: [] },
    ]
    // 未知分类：货架全集按字面过滤，y 的 name 含该词但不在货架内 → 空
    assert.deepEqual(filterPlazaShelf(items, '不存在分类'), [])
  })

  it('filterPlazaShelf never falls back to all for unknown categories', () => {
    const items = [{ slug: 'a', tags: ['电商'] }, { slug: 'b', tags: ['动画'] }]
    assert.deepEqual(filterPlazaShelf(items, '  '), items)
    assert.deepEqual(filterPlazaShelf(items, '未知').map((it) => it.slug), [])
  })
})

describe('plaza search payload channels (Issue #504)', () => {
  it('submitted query adds skillhub; browsing stays on the default two channels', () => {
    assert.deepEqual(buildPlazaSearchPayload('', '', 1), {
      query: '',
      limit: 48,
      offset: 0,
      channels: ['custom', 'workbuddy'],
    })
    assert.deepEqual(buildPlazaSearchPayload('键盘', '', 1).channels, [...PLAZA_QUERY_CHANNELS])
    assert.ok(buildPlazaSearchPayload('键盘', '', 1).channels.includes('skillhub'))
    // 分类浏览（q 空、cat 有值）保持默认双渠道
    assert.deepEqual(buildPlazaSearchPayload('', '电商', 2), {
      query: '电商',
      limit: 48,
      offset: 48,
      channels: [...PLAZA_DEFAULT_CHANNELS],
    })
    // 同时有提交词与分类：query 拼接且打三渠道
    assert.deepEqual(buildPlazaSearchPayload('键盘', '电商', 3), {
      query: '键盘 电商',
      limit: 48,
      offset: 96,
      channels: ['custom', 'workbuddy', 'skillhub'],
    })
    assert.deepEqual(buildPlazaSearchPayload('  ', '  ', 1).channels, ['custom', 'workbuddy'])
  })
})
