import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CREATE_SKILL,
  PLAZA_HIDDEN_TABS,
  PLAZA_INTENT_KEY,
  PLAZA_TABS,
  SKILL_SHELF_TAGS,
  SKILL_SHELF_TAXONOMY,
  appendSkillGesture,
  buildSearchPayload,
  consumePlazaIntent,
  filterPickerItems,
  inSkillShelf,
  installPayload,
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

  it('ecom taxonomy row includes expanded fallback keywords', () => {
    const ecom = SKILL_SHELF_TAXONOMY.find((row) => row.id === '电商')
    assert.ok(ecom, '电商 row exists')
    assert.deepEqual([...ecom.keywords], ['电商', '独立站', '跨境', 'shopify', '选品'])
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

  it('matches expanded ecom keywords like 独立站 / shopify across fields and case', () => {
    const standSiteItem = { slug: 'standalone-shop', name: '独立站搭建助手', tags: [] }
    const shopifyItem = { slug: 'shopify-helper', description: 'Shopify 订单同步工具', tags: [] }
    const crossBorderItem = { slug: 'cross-border', summary: '跨境出海选品专家', tags: [] }
    const unrelatedItem = { slug: 'gmail-tool', name: '邮件小助手', description: '收发邮件', tags: [] }

    assert.equal(matchesDomainTag(standSiteItem, '电商'), true)
    assert.equal(matchesDomainTag(shopifyItem, '电商'), true)
    assert.equal(matchesDomainTag(crossBorderItem, '电商'), true)
    assert.equal(matchesDomainTag(unrelatedItem, '电商'), false)

    assert.equal(inSkillShelf(standSiteItem), true)
    assert.equal(inSkillShelf(shopifyItem), true)
    assert.equal(inSkillShelf(crossBorderItem), true)
    assert.equal(inSkillShelf(unrelatedItem), false)

    const list = [standSiteItem, shopifyItem, crossBorderItem, unrelatedItem]
    const filteredEcom = filterPickerItems(list, '电商')
    assert.deepEqual(filteredEcom.map((it) => it.slug), ['standalone-shop', 'shopify-helper', 'cross-border'])
    const filteredAll = filterPickerItems(list, 'all')
    assert.deepEqual(filteredAll.map((it) => it.slug), ['standalone-shop', 'shopify-helper', 'cross-border'])
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

  it('picker cache returns hits within TTL and misses after expiry', () => {
    const cache = new Map()
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
})
