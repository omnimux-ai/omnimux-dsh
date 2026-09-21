import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyItem,
  countMappings,
  plannedCategory,
  rewriteInspirationCategories,
  runCli,
} from './rewrite-inspiration-categories.mjs'

const HOST = 'http://127.0.0.1:45120'

function json(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return JSON.parse(JSON.stringify(body))
    },
  }
}

function createHarness(rows) {
  const store = new Map(rows.map((row) => [String(row.id), { ...row }]))
  /** @type {Array<{ method: string, path: string, body?: unknown }>} */
  const calls = []
  async function fetch(url, init = {}) {
    const method = init.method || 'GET'
    const parsed = new URL(url)
    calls.push({
      method,
      path: parsed.pathname + parsed.search,
      body: init.body ? JSON.parse(init.body) : undefined,
    })
    if (parsed.origin !== HOST) throw new Error(`unexpected origin ${parsed.origin}`)
    if (method === 'GET' && parsed.pathname === '/omnimux/inspiration') {
      const page = Number(parsed.searchParams.get('page') || 1)
      const pageSize = Number(parsed.searchParams.get('page_size') || 100)
      const all = [...store.values()]
      const start = (page - 1) * pageSize
      return json({
        success: true,
        data: {
          total: all.length,
          page,
          size: pageSize,
          items: all.slice(start, start + pageSize),
        },
      })
    }
    const match = parsed.pathname.match(/^\/omnimux\/inspiration\/([^/]+)$/)
    if (match && method === 'PATCH') {
      const id = decodeURIComponent(match[1])
      const current = store.get(id)
      if (!current) return json({ success: false, error: 'missing' }, 404)
      const payload = init.body ? JSON.parse(init.body) : {}
      const next = { ...current, ...payload }
      store.set(id, next)
      return json({ success: true, data: next })
    }
    throw new Error(`unexpected ${method} ${url}`)
  }
  return { fetch, calls, store }
}

describe('plannedCategory / classifyItem', () => {
  it('maps leftovers onto official ids and skips rows already official', () => {
    assert.equal(plannedCategory('美妆护肤'), 'beauty_skincare')
    assert.equal(plannedCategory('Health & Wellness'), 'health_wellness')
    assert.equal(plannedCategory('digital', ['fitness']), 'fitness_sports')
    assert.equal(plannedCategory('digital', ['ai_tool']), 'other')
    assert.deepEqual(classifyItem({ id: '1', category: 'beauty_skincare' }), {
      id: '1',
      raw: 'beauty_skincare',
      next: 'beauty_skincare',
      skip: true,
    })
    assert.equal(classifyItem({ id: '2', category: 'digital', tags: ['fitness'] }).skip, false)
    assert.equal(classifyItem({ id: '2', category: 'digital', tags: ['fitness'] }).next, 'fitness_sports')
  })
})

describe('rewriteInspirationCategories', () => {
  it('dry-run lists mappings and never PATCHes', async () => {
    const harness = createHarness([
      { id: '1', category: 'digital', tags: ['fitness'] },
      { id: '2', category: 'beauty_skincare' },
      { id: '3', category: '厨房用品' },
    ])
    const result = await rewriteInspirationCategories({ base: HOST, pageSize: 2 }, harness)
    assert.equal(result.mode, 'dry-run')
    assert.equal(result.total, 3)
    assert.equal(result.skipped, 1)
    assert.equal(result.pending, 2)
    assert.equal(result.patched, 0)
    assert.deepEqual(result.mappings, {
      'digital → fitness_sports': 1,
      'beauty_skincare → beauty_skincare': 1,
      '厨房用品 → home_living': 1,
    })
    assert.equal(harness.calls.some((call) => call.method === 'PATCH'), false)
    assert.equal(harness.store.get('1').category, 'digital')
  })

  it('apply PATCHes only changed rows with { category } and is idempotent', async () => {
    const harness = createHarness([
      { id: '1', category: 'digital', tags: ['fitness'] },
      { id: '2', category: 'beauty_skincare' },
      { id: '3', category: '厨房用品' },
    ])
    const first = await rewriteInspirationCategories({ base: HOST, apply: true, pageSize: 100 }, harness)
    assert.equal(first.mode, 'apply')
    assert.equal(first.patched, 2)
    const patches = harness.calls.filter((call) => call.method === 'PATCH')
    assert.deepEqual(
      patches.map((call) => ({ path: call.path, body: call.body })),
      [
        { path: '/omnimux/inspiration/1', body: { category: 'fitness_sports' } },
        { path: '/omnimux/inspiration/3', body: { category: 'home_living' } },
      ],
    )
    assert.equal(harness.store.get('1').category, 'fitness_sports')
    assert.equal(harness.store.get('2').category, 'beauty_skincare')
    assert.equal(harness.store.get('3').category, 'home_living')

    harness.calls.length = 0
    const second = await rewriteInspirationCategories({ base: HOST, apply: true }, harness)
    assert.equal(second.pending, 0)
    assert.equal(second.patched, 0)
    assert.equal(harness.calls.some((call) => call.method === 'PATCH'), false)
  })

  it('defaults to dry-run via CLI and refuses a non-loopback base', async () => {
    const harness = createHarness([{ id: '1', category: 'digital' }])
    const result = await runCli([], harness)
    assert.equal(result.mode, 'dry-run')
    assert.equal(result.patched, 0)
    await assert.rejects(
      () => rewriteInspirationCategories({ base: 'https://api.omnimux.ai' }, harness),
      /loopback HTTP|127\.0\.0\.1/,
    )
  })
})

describe('countMappings', () => {
  it('groups raw → id', () => {
    assert.deepEqual(
      countMappings([
        { raw: 'digital', next: 'other', skip: false },
        { raw: 'digital', next: 'other', skip: false },
        { raw: 'Fitness', next: 'fitness_sports', skip: false },
      ]),
      { 'digital → other': 2, 'Fitness → fitness_sports': 1 },
    )
  })
})
