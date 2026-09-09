import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aggregateSkillSearch } from '../../lib/skill-aggregate.js'
import { withDefaults } from '../../lib/config-store.js'

test('QA: full-library remote search reaches results after the first 80 cards', async () => {
  const cards = Array.from({ length: 160 }, (_, index) => ({
    slug: `remote-${index}`, name: `Remote ${index}`, description: 'spreadsheet',
  }))
  const calls = []
  const options = {
    cfg: withDefaults({}), catalog: { items: [] },
    channels: ['custom', 'workbuddy', 'skillhub'], limit: 80,
    searchSkills: async (query, request) => {
      calls.push({ offset: request.offset, limit: request.limit })
      return { query, items: cards.slice(request.offset, request.offset + request.limit),
        total: cards.length, hasMore: request.offset + request.limit < cards.length }
    },
  }
  const first = await aggregateSkillSearch('spreadsheet', { ...options, offset: 0 })
  assert.equal(first.items.length, 80)
  assert.equal(first.hasMore, true)
  const second = await aggregateSkillSearch('spreadsheet', { ...options, offset: 80 })
  assert.equal(second.items.length, 80, `second page lost; upstream requests=${JSON.stringify(calls)}`)
  assert.equal(second.items[0].slug, 'remote-80')
  assert.equal(second.hasMore, false)
})
