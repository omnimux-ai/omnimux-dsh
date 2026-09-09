import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aggregateSkillSearch } from '../../lib/skill-aggregate.js'
import { searchSkills } from '../../lib/api.js'
import { withDefaults } from '../../lib/config-store.js'

const cfg = withDefaults({})
const card = (slug) => ({ slug, name: slug, description: 'spreadsheet' })
const local = (slug, custom = false) => ({
  id: `${custom ? 'sk-omx-' : 'sk-'}${slug}`, skill: slug, kind: 'skill', tab: 'skills',
  title: slug, summary: 'spreadsheet', source: { type: 'bundled', path: 'skill/SKILL.md' },
})

function fixture(cards, catalog = [], extra = {}) {
  const calls = []
  return {
    calls,
    options: {
      cfg, catalog: { items: catalog }, limit: 80,
      searchSkills: async (query, request) => {
        calls.push({ offset: request.offset, limit: request.limit })
        return { query, items: cards.slice(request.offset, request.offset + request.limit),
          total: cards.length, hasMore: request.offset + request.limit < cards.length, ...extra }
      },
    },
  }
}

for (const count of [0, 1, 79, 80, 81, 159, 160, 161]) {
  test(`pagination boundary: ${count} remote cards, exact termination and beyond end`, async () => {
    const cards = Array.from({ length: count }, (_, i) => card(`remote-${i}`))
    const { options, calls } = fixture(cards)
    const all = []
    for (let offset = 0; offset <= count + 80; offset += 80) {
      const result = await aggregateSkillSearch('spreadsheet', { ...options, offset })
      assert.deepEqual(result.items.map((it) => it.slug), cards.slice(offset, offset + 80).map((it) => it.slug))
      assert.equal(result.hasMore, offset + 80 < count)
      if (offset < count) all.push(...result.items)
      if (!result.hasMore) assert.equal(result.total, count)
    }
    assert.equal(new Set(all.map((it) => it.slug)).size, count)
    assert.ok(calls.every((call) => call.limit <= 80 && call.offset % 80 === 0))
  })
}

test('mixed channels dedupe across remote pages, preserving local priority and full pages', async () => {
  const catalog = [local('shared', true), local('shared'), local('local-only')]
  const cards = [card(' SHARED '), ...Array.from({ length: 79 }, (_, i) => card(`r-${i}`)),
    ...Array.from({ length: 90 }, (_, i) => card(`r-${i}`)), card('last')]
  const { options } = fixture(cards, catalog)
  const expected = ['shared', 'local-only', ...Array.from({ length: 90 }, (_, i) => `r-${i}`), 'last']
  const first = await aggregateSkillSearch('spreadsheet', options)
  const second = await aggregateSkillSearch('spreadsheet', { ...options, offset: 80 })
  assert.equal(first.items.length, 80)
  assert.equal(first.items[0].channel, 'custom')
  assert.equal(first.hasMore, true)
  assert.equal(second.hasMore, false)
  assert.equal(second.total, expected.length)
  assert.equal(second.totalApprox, false)
  assert.deepEqual([...first.items, ...second.items].map((it) => it.slug), expected)
})

test('duplicate-only remote tail does not keep hasMore alive', async () => {
  const { options, calls } = fixture(Array.from({ length: 240 }, () => card('same')))
  const result = await aggregateSkillSearch('spreadsheet', options)
  assert.equal(result.items.length, 1)
  assert.equal(result.total, 1)
  assert.equal(result.hasMore, false)
  assert.deepEqual(calls.map((call) => call.offset), [0, 80, 160])
})

test('empty page with stale total and hasMore terminates without an infinite loop', async () => {
  const { options, calls } = fixture([card('only')], [], { total: 1000, hasMore: true })
  const result = await aggregateSkillSearch('spreadsheet', options)
  assert.equal(calls.length, 2)
  assert.equal(result.total, 1)
  assert.equal(result.hasMore, false)
})

test('repeated upstream pages are bounded by the first total, not changing totals', async () => {
  let calls = 0
  const result = await aggregateSkillSearch('spreadsheet', {
    cfg, catalog: { items: [] }, limit: 80,
    searchSkills: async () => ({ items: [card('same')], total: ++calls + 2, hasMore: true }),
  })
  assert.equal(calls, 3)
  assert.equal(result.hasMore, false)
})

test('small page and nonaligned aggregate offsets are stable through the actual remote API adapter', async () => {
  const cards = Array.from({ length: 29 }, (_, i) => card(`api-${i}`))
  const calls = []
  const options = {
    cfg, catalog: { items: [local('local-only')] }, limit: 7,
    searchSkills: (query, request) => searchSkills(query, { ...request,
      fetchJsonImpl: async (url) => {
        const params = new URL(url).searchParams
        const page = Number(params.get('page'))
        const size = Number(params.get('pageSize'))
        calls.push({ page, size })
        return { code: 0, data: { skills: cards.slice((page - 1) * size, page * size), total: cards.length } }
      },
    }),
  }
  const all = []
  for (let offset = 0; offset < 35; offset += 7) {
    const result = await aggregateSkillSearch('spreadsheet', { ...options, offset })
    all.push(...result.items)
    assert.equal(result.hasMore, offset + 7 < 30)
  }
  assert.deepEqual(all.map((it) => it.slug), ['local-only', ...cards.map((it) => it.slug)])
  assert.ok(calls.every((call) => call.size === 12))
  assert.ok(calls.some((call) => call.page === 3))
})

test('only fetch the prefix needed for the requested window, not the entire remote library', async () => {
  const { options, calls } = fixture(Array.from({ length: 10000 }, (_, i) => card(`r-${i}`)))
  const result = await aggregateSkillSearch('spreadsheet', { ...options, offset: 80 })
  assert.equal(result.items.length, 80)
  assert.equal(result.hasMore, true)
  assert.equal(result.totalApprox, true)
  assert.equal(calls.length, 3)
})

test('page-size bounds and negative or fractional offsets preserve the existing contract', async () => {
  const { options } = fixture(Array.from({ length: 100 }, (_, i) => card(`r-${i}`)))
  const minimum = await aggregateSkillSearch('spreadsheet', { ...options, limit: 0, offset: -5 })
  assert.equal(minimum.items.length, 1)
  assert.equal(minimum.offset, 0)
  const maximum = await aggregateSkillSearch('spreadsheet', { ...options, limit: 999, offset: 1.9 })
  assert.equal(maximum.items.length, 80)
  assert.equal(maximum.items[0].slug, 'r-1')
  assert.equal(maximum.offset, 1)
})

test('popular fallback returned on a later remote page is not appended to the search', async () => {
  let calls = 0
  const result = await aggregateSkillSearch('spreadsheet', {
    cfg, catalog: { items: [] }, limit: 80,
    searchSkills: async () => ++calls === 1
      ? { items: [card('match')], total: 90, hasMore: true }
      : { items: [card('popular')], total: 90, hasMore: true, fallback: true },
  })
  assert.deepEqual(result.items.map((it) => it.slug), ['match'])
  assert.equal(result.total, 1)
  assert.equal(result.hasMore, false)
  assert.equal(result.fallback, undefined)
})

test('later upstream failure does not leak a partial remote prefix as complete results', async () => {
  let calls = 0
  const result = await aggregateSkillSearch('spreadsheet', {
    cfg, catalog: { items: [local('local-only')] }, limit: 80,
    searchSkills: async () => {
      if (++calls === 2) throw new Error('network failure')
      return { items: Array.from({ length: 80 }, () => card('same')), total: 160, hasMore: true }
    },
  })
  assert.deepEqual(result.items.map((it) => it.slug), ['local-only'])
  assert.equal(result.channelErrors.skillhub, 'network')
  assert.equal(result.hasMore, false)
})
