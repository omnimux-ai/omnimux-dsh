import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aggregateSkillSearch } from '../../lib/skill-aggregate.js'
import { searchSkills } from '../../lib/api.js'
import { withDefaults } from '../../lib/config-store.js'

const cfg = withDefaults({})
const card = (slug) => ({ slug, name: slug, description: 'spreadsheet' })
const local = (slug, custom) => ({
  id: `${custom ? 'sk-omx-' : 'sk-'}${slug}`, skill: slug,
  kind: 'skill', tab: 'skills', title: slug, summary: 'spreadsheet',
})

test('QA round2: mixed-channel pages equal an independent stable-union oracle', async () => {
  const catalog = [local('shared', true), local('custom-only', true),
    local('shared', false), local('work-only', false)]
  const remote = Array.from({ length: 317 }, (_, i) => card(
    i % 11 === 0 ? ' SHARED ' : i % 13 === 0 ? 'work-only' : `r-${i % 137}`,
  ))
  const expected = ['shared', 'custom-only', 'work-only']
  const seen = new Set(expected)
  for (const item of remote) {
    const key = item.slug.trim().toLowerCase()
    if (!seen.has(key)) { seen.add(key); expected.push(item.slug) }
  }
  for (const limit of [1, 7, 13, 79, 80]) {
    const collected = []
    for (let offset = 0; offset < expected.length + limit; offset += limit) {
      let requests = 0
      const batch = Math.max(12, limit)
      const result = await aggregateSkillSearch('spreadsheet', {
        cfg, catalog: { items: catalog }, limit, offset,
        searchSkills: async (_, options) => {
          assert.ok(++requests <= Math.ceil(remote.length / batch), 'request count exceeds first-total bound')
          assert.equal(options.offset, (requests - 1) * batch)
          return { items: remote.slice(options.offset, options.offset + options.limit),
            total: remote.length, hasMore: options.offset + options.limit < remote.length }
        },
      })
      assert.deepEqual(result.items.map((item) => item.slug), expected.slice(offset, offset + limit))
      assert.equal(result.hasMore, offset + limit < expected.length)
      if (!result.hasMore) { assert.equal(result.total, expected.length); assert.equal(result.totalApprox, false) }
      collected.push(...result.items)
    }
    assert.deepEqual(collected.map((item) => item.slug), expected)
    assert.equal(collected[0].channel, 'custom')
    assert.equal(collected[2].channel, 'workbuddy')
  }
})

test('QA round2: actual API adapter keeps mixed duplicate windows stable', async () => {
  const remote = Array.from({ length: 241 }, (_, i) => card(i % 5 === 0 ? 'shared' : `r-${i}`))
  const expected = ['shared', ...remote.filter((item) => item.slug !== 'shared').map((item) => item.slug)]
  const collected = []
  for (let offset = 0; offset <= expected.length; offset += 80) {
    let requests = 0
    const result = await aggregateSkillSearch('spreadsheet', {
      cfg, catalog: { items: [local('shared', true)] }, limit: 80, offset,
      searchSkills: (query, options) => searchSkills(query, { ...options,
        fetchJsonImpl: async (url) => {
          assert.ok(++requests <= 4, 'unexpected HTTP request amplification')
          const params = new URL(url).searchParams
          const page = Number(params.get('page'))
          const size = Number(params.get('pageSize'))
          assert.equal(size, 80)
          return { code: 0, data: { skills: remote.slice((page - 1) * size, page * size), total: remote.length } }
        },
      }),
    })
    assert.deepEqual(result.items.map((item) => item.slug), expected.slice(offset, offset + 80))
    assert.equal(result.hasMore, offset + 80 < expected.length)
    collected.push(...result.items)
  }
  assert.deepEqual(collected.map((item) => item.slug), expected)
})

test('QA round2: malformed totals and repeated short responses remain bounded', async () => {
  for (const total of [0, -1, NaN, Infinity, 2.5, 17]) {
    let requests = 0
    const bound = Number.isFinite(total) ? Math.ceil(Math.max(1, total)) : 1
    const result = await aggregateSkillSearch('spreadsheet', {
      cfg, catalog: { items: [] }, limit: 80, offset: 1000,
      searchSkills: async () => {
        assert.ok(++requests <= bound, 'first-total termination bound exceeded')
        return { items: [card('same')], total: requests === 1 ? total : 1e9, hasMore: true }
      },
    })
    assert.equal(requests, bound)
    assert.deepEqual(result.items, [])
    assert.equal(result.hasMore, false)
    assert.equal(result.total, 1)
  }
})

test('QA round2: hard failure on later page rejects rather than returning a partial prefix', async () => {
  let requests = 0
  await assert.rejects(aggregateSkillSearch('spreadsheet', {
    cfg: withDefaults({ aggregateRemoteSoftFail: false }), catalog: { items: [] }, limit: 80,
    searchSkills: async () => {
      if (++requests === 2) throw new Error('network late failure')
      return { items: [card('same')], total: 160, hasMore: true }
    },
  }), /network late failure/)
  assert.equal(requests, 2)
})
