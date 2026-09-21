import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertCategoryApplied,
  classifyItem,
  countMappings,
  hasUsableTags,
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

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ omitListTags?: boolean, failAfterPatch?: number, dropTitleOnPatch?: boolean, stopAfterPages?: number }} [opts]
 */
function createHarness(rows, opts = {}) {
  const store = new Map(rows.map((row) => [String(row.id), { ...row }]))
  /** @type {Array<{ method: string, path: string, body?: unknown }>} */
  const calls = []
  let patches = 0
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
      assert.equal(parsed.searchParams.get('sort'), 'new', 'list must pin sort=new')
      const page = Number(parsed.searchParams.get('page') || 1)
      const pageSize = Number(parsed.searchParams.get('page_size') || 100)
      if (opts.stopAfterPages && page > opts.stopAfterPages) {
        return json({ success: true, data: { total: store.size, page, size: pageSize, items: [] } })
      }
      const all = [...store.values()].map((row) => {
        if (!opts.omitListTags) return { ...row }
        const copy = { ...row }
        delete copy.tags
        return copy
      })
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
    if (match && method === 'GET') {
      const id = decodeURIComponent(match[1])
      const current = store.get(id)
      if (!current) return json({ success: false, error: 'missing' }, 404)
      return json({ success: true, data: current })
    }
    if (match && method === 'PATCH') {
      const id = decodeURIComponent(match[1])
      const current = store.get(id)
      if (!current) return json({ success: false, error: 'missing' }, 404)
      patches += 1
      if (opts.failAfterPatch != null && patches > opts.failAfterPatch) {
        return json({ success: false, error: 'boom' }, 500)
      }
      const payload = init.body ? JSON.parse(init.body) : {}
      const next = { ...current, ...payload }
      if (opts.dropTitleOnPatch) delete next.title
      store.set(id, next)
      return json({ success: true, data: next })
    }
    throw new Error(`unexpected ${method} ${url}`)
  }
  return { fetch, calls, store }
}

describe('plannedCategory / classifyItem', () => {
  it('maps leftovers onto official ids and skips only exact official strings', () => {
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
    assert.equal(classifyItem({ id: 'padded', category: 'beauty_skincare ' }).skip, false)
    assert.equal(classifyItem({ id: 'padded', category: 'beauty_skincare ' }).next, 'beauty_skincare')
    assert.equal(classifyItem({ id: '2', category: 'digital', tags: ['fitness'] }).skip, false)
    assert.equal(classifyItem({ id: '2', category: 'digital', tags: ['fitness'] }).next, 'fitness_sports')
  })

  it('does not default missing tags to other; marks needsTags instead', () => {
    const listed = classifyItem({ id: '3', category: 'digital' })
    assert.equal(listed.needsTags, true)
    assert.equal(listed.skip, true)
    assert.equal(listed.next, '')
    const stillMissing = classifyItem({ id: '3', category: 'digital' }, { fetchedTags: true })
    assert.equal(stillMissing.skip, true)
    assert.equal(stillMissing.next, '')
    assert.equal(stillMissing.needsTags, undefined)
  })
})

describe('hasUsableTags', () => {
  it('rejects non-arrays and empty / non-string entries', () => {
    assert.equal(hasUsableTags(undefined), false)
    assert.equal(hasUsableTags([]), false)
    assert.equal(hasUsableTags([1, { name: 'x' }]), false)
    assert.equal(hasUsableTags(['  ']), false)
    assert.equal(hasUsableTags(['fitness']), true)
  })
})

describe('assertCategoryApplied', () => {
  it('requires returned category and preserves other fields', () => {
    const original = { id: '1', category: 'digital', title: 'keep', tags: ['fitness'] }
    assert.doesNotThrow(() => assertCategoryApplied(
      { id: '1', category: 'fitness_sports', title: 'keep', tags: ['fitness'], updated_at: 'later' },
      original,
      '1',
      'fitness_sports',
    ))
    assert.throws(
      () => assertCategoryApplied({ id: '1', category: 'other', title: 'keep' }, original, '1', 'fitness_sports'),
      /returned category/,
    )
    assert.throws(
      () => assertCategoryApplied({ id: '1', category: 'fitness_sports' }, original, '1', 'fitness_sports'),
      /field title missing/,
    )
  })
})

describe('rewriteInspirationCategories', () => {
  it('dry-run lists mappings, pins sort=new, and never PATCHes', async () => {
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
    const listCalls = harness.calls.filter((call) => call.method === 'GET' && call.path.startsWith('/omnimux/inspiration?'))
    assert.ok(listCalls.length >= 2)
    for (const call of listCalls) {
      assert.match(call.path, /[?&]sort=new(?:&|$)/)
    }
  })

  it('GET details when the list omits tags, then maps; still-missing tags skip without writing other', async () => {
    const mapped = createHarness(
      [{ id: '1', category: 'digital', tags: ['fitness'], title: 'keep' }],
      { omitListTags: true },
    )
    const dry = await rewriteInspirationCategories({ base: HOST }, mapped)
    assert.equal(dry.pending, 1)
    assert.equal(dry.changes[0].next, 'fitness_sports')
    assert.equal(
      mapped.calls.some((call) => call.method === 'GET' && call.path === '/omnimux/inspiration/1'),
      true,
    )

    const skipped = createHarness(
      [{ id: '2', category: 'digital', title: 'keep' }],
      { omitListTags: true },
    )
    const skipResult = await rewriteInspirationCategories({ base: HOST, apply: true }, skipped)
    assert.equal(skipResult.pending, 0)
    assert.equal(skipResult.skipped, 1)
    assert.equal(skipResult.patched, 0)
    assert.equal(skipped.store.get('2').category, 'digital')
    assert.equal(skipped.calls.some((call) => call.method === 'PATCH'), false)
    assert.equal(skipResult.mappings['digital → (skip)'], 1)
  })

  it('rewrites padded official ids so exact category= filters match', async () => {
    const harness = createHarness([{ id: '1', category: 'beauty_skincare ', title: 'keep' }])
    const result = await rewriteInspirationCategories({ base: HOST, apply: true }, harness)
    assert.equal(result.patched, 1)
    assert.equal(harness.store.get('1').category, 'beauty_skincare')
  })

  it('apply PATCHes only changed rows with { category }, checks the returned record, and is idempotent', async () => {
    const harness = createHarness([
      { id: '1', category: 'digital', tags: ['fitness'], title: 'one' },
      { id: '2', category: 'beauty_skincare', title: 'two' },
      { id: '3', category: '厨房用品', title: 'three' },
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
    assert.equal(harness.store.get('1').title, 'one')
    assert.equal(harness.store.get('2').category, 'beauty_skincare')
    assert.equal(harness.store.get('3').category, 'home_living')

    harness.calls.length = 0
    const second = await rewriteInspirationCategories({ base: HOST, apply: true }, harness)
    assert.equal(second.pending, 0)
    assert.equal(second.patched, 0)
    assert.equal(harness.calls.some((call) => call.method === 'PATCH'), false)
  })

  it('mid-apply failure does not claim ok and later apply resumes remaining rows', async () => {
    const harness = createHarness(
      [
        { id: '1', category: '厨房用品', title: 'one' },
        { id: '2', category: 'digital', tags: ['fitness'], title: 'two' },
      ],
      { failAfterPatch: 1 },
    )
    await assert.rejects(
      () => rewriteInspirationCategories({ base: HOST, apply: true }, harness),
      /HTTP 500/,
    )
    assert.equal(harness.store.get('1').category, 'home_living')
    assert.equal(harness.store.get('2').category, 'digital')

    const resume = createHarness([
      { id: '1', category: 'home_living', title: 'one' },
      { id: '2', category: 'digital', tags: ['fitness'], title: 'two' },
    ])
    const second = await rewriteInspirationCategories({ base: HOST, apply: true }, resume)
    assert.equal(second.ok, true)
    assert.equal(second.patched, 1)
    assert.equal(resume.store.get('2').category, 'fitness_sports')
    const resumePatches = resume.calls.filter((call) => call.method === 'PATCH')
    assert.deepEqual(resumePatches.map((call) => call.path), ['/omnimux/inspiration/2'])
  })

  it('fails when pagination stops before total', async () => {
    const harness = createHarness(
      [
        { id: '1', category: 'beauty_skincare' },
        { id: '2', category: 'home_living' },
        { id: '3', category: 'pets' },
      ],
      { stopAfterPages: 1 },
    )
    await assert.rejects(
      () => rewriteInspirationCategories({ base: HOST, pageSize: 1 }, harness),
      /stopped before total/,
    )
  })

  it('defaults to dry-run via CLI and refuses a non-loopback base', async () => {
    const harness = createHarness([{ id: '1', category: 'digital', tags: ['fitness'] }])
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
