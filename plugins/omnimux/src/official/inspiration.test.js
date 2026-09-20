import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectCategoryCounts,
  createCategoryCache,
  createInspirationShare,
  listQueryString,
  listInspirations,
  mediaKeyFromHostPath,
  publishBody,
  publishInspirationShare,
  rewriteMediaUrlsForHost,
  toShareResult,
} from './inspiration.js'

describe('inspiration query + rewrite', () => {
  it('encodes list filters and skips empties', () => {
    assert.equal(listQueryString({}), '')
    assert.equal(listQueryString({ type: 'video', q: '猫', page: 2, tag: '' }), '?type=video&q=%E7%8C%AB&page=2')
    assert.equal(
      listQueryString({
        country: 'US',
        category: '美妆护肤',
        duration_min: 15,
        duration_max: 30,
        views_min: 100000,
        traffic_type: 'ad',
        sort: 'views',
        posted_after: '2026-09-01',
      }),
      '?sort=views&country=US&category=%E7%BE%8E%E5%A6%86%E6%8A%A4%E8%82%A4&duration_min=15&duration_max=30&views_min=100000&traffic_type=ad&posted_after=2026-09-01',
    )
  })

  it('rewrites gateway media URLs onto the Host prefix', () => {
    const payload = {
      success: true,
      data: {
        items: [{
          cover_url: '/api/inspiration/v1/media/covers/a.jpg',
          media_urls: ['https://omnimux.ai/api/inspiration/v1/media/clips/a.mp4'],
        }],
      },
    }
    const rewritten = rewriteMediaUrlsForHost(payload)
    assert.equal(rewritten.data.items[0].cover_url, '/omnimux/inspiration/media/covers/a.jpg')
    assert.equal(rewritten.data.items[0].media_urls[0], '/omnimux/inspiration/media/clips/a.mp4')
  })

  it('leaves a payload without media URLs alone', () => {
    const payload = { success: true, data: { total: 0, items: [] } }
    assert.deepEqual(rewriteMediaUrlsForHost(payload), payload)
  })

  it('pulls the media key from the Host path', () => {
    assert.equal(mediaKeyFromHostPath('/omnimux/inspiration/media/covers/a.jpg'), 'covers/a.jpg')
    assert.equal(mediaKeyFromHostPath('/omnimux/inspiration/status'), '')
  })

  it('lists through the official client', async () => {
    /** @type {string[]} */
    const seen = []
    const json = await listInspirations({
      withPat: async (path) => {
        seen.push(path)
        return { success: true, data: { total: 0, items: [] } }
      },
    }, { type: 'image', sort: 'hot' })
    assert.deepEqual(seen, ['/api/inspiration/v1/inspirations?type=image&sort=hot'])
    assert.equal(json.success, true)
  })

  it('creates share link through client.withPat', async () => {
    /** @type {{ path: string, opts?: any }[]} */
    const calls = []
    const client = {
      withPat: async (path, opts) => {
        calls.push({ path, opts })
        return { ok: true, data: { share_url: 'https://omnimux.ai/s/test', expire: opts.body.expire } }
      },
    }

    const res3Days = await createInspirationShare(client, { id: 'insp-123' })
    assert.equal(res3Days.data.expire, '3days')
    assert.equal(calls[0].path, '/api/inspiration/v1/inspirations/insp-123/share')
    assert.equal(calls[0].opts.method, 'POST')
    assert.deepEqual(calls[0].opts.body, { expire: '3days' })

    const resForever = await createInspirationShare(client, { id: 'insp-123', expire: 'forever' })
    assert.equal(resForever.data.expire, 'forever')
    assert.deepEqual(calls[1].opts.body, { expire: 'forever' })
  })

  it('publishes through the gateway-key site lane with a snake_case body', async () => {
    /** @type {{ path: string, opts: any }[]} */
    const calls = []
    const client = {
      withSkSite: async (path, opts) => {
        calls.push({ path, opts })
        return { success: true, data: { share_id: 'insp_1', share_url: 'https://omnimux.ai/s/insp_1' } }
      },
    }

    const result = toShareResult(await publishInspirationShare(client, {
      category: 'other',
      title: 't',
      prompt: 'p',
      mediaType: 'video/mp4',
      mediaUrl: 'https://cdn.omnimux.ai/f/v.mp4',
    }))

    assert.equal(calls[0].path, '/api/inspiration/v1/publish')
    assert.deepEqual(calls[0].opts.body, {
      category: 'other',
      title: 't',
      prompt: 'p',
      media_type: 'video/mp4',
      media_url: 'https://cdn.omnimux.ai/f/v.mp4',
    })
    assert.equal(result.shareId, 'insp_1')
    assert.equal(result.shareUrl, 'https://omnimux.ai/s/insp_1')
  })

  it('drops empty optional publish fields instead of sending blanks', () => {
    assert.deepEqual(publishBody({ category: 'a', title: 'b', prompt: 'c', description: '', model: null }), {
      category: 'a',
      title: 'b',
      prompt: 'c',
    })
  })
})

describe('collectCategoryCounts', () => {
  /**
   * Fake catalogue client: serves `total` split across page_size'd pages,
   * drawing categories round-robin from `names` ('' = row without category).
   */
  function catalogueClient({ total, names, onRequest }) {
    return {
      async withPat(path) {
        const url = new URL(path, 'http://127.0.0.1')
        const page = Number(url.searchParams.get('page')) || 1
        const pageSize = Number(url.searchParams.get('page_size')) || 100
        onRequest?.(path)
        const start = (page - 1) * pageSize
        const items = []
        for (let index = start; index < Math.min(start + pageSize, total); index += 1) {
          items.push({ id: String(index + 1), category: names[index % names.length] })
        }
        return { success: true, data: { total, page, size: pageSize, items } }
      },
    }
  }

  it('walks every page and aggregates deduped counts, sorted by count desc', async () => {
    /** @type {string[]} */
    const requested = []
    const client = catalogueClient({
      total: 250,
      names: ['digital', 'digital', ' 健康 ', 'digital', '', '  ', 'Health & Wellness', '健康'],
      onRequest: (path) => requested.push(path),
    })
    const data = await collectCategoryCounts(client, { pageSize: 100 })
    assert.deepEqual(requested, [
      '/api/inspiration/v1/inspirations?page=1&page_size=100',
      '/api/inspiration/v1/inspirations?page=2&page_size=100',
      '/api/inspiration/v1/inspirations?page=3&page_size=100',
    ])
    assert.deepEqual(data, [
      { name: 'digital', count: 95 },
      { name: '健康', count: 62 },
      { name: 'Health & Wellness', count: 31 },
    ])
  })

  it('never exceeds the concurrency limit while paging', async () => {
    let active = 0
    let maxActive = 0
    const client = {
      async withPat(path) {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        const url = new URL(path, 'http://127.0.0.1')
        const page = Number(url.searchParams.get('page')) || 1
        const pageSize = Number(url.searchParams.get('page_size')) || 2
        const total = 10
        const start = (page - 1) * pageSize
        const items = []
        for (let index = start; index < Math.min(start + pageSize, total); index += 1) {
          items.push({ id: String(index + 1), category: 'digital' })
        }
        return { success: true, data: { total, items } }
      },
    }
    const data = await collectCategoryCounts(client, { pageSize: 2, concurrency: 2 })
    assert.equal(maxActive <= 2, true, `expected at most 2 in-flight page requests, saw ${maxActive}`)
    assert.deepEqual(data, [{ name: 'digital', count: 10 }])
  })

  it('drops empty and missing categories entirely', async () => {
    const client = {
      async withPat() {
        return {
          success: true,
          data: {
            total: 4,
            items: [
              { id: '1' },
              { id: '2', category: '' },
              { id: '3', category: '   ' },
              { id: '4', category: 'digital' },
            ],
          },
        }
      },
    }
    assert.deepEqual(await collectCategoryCounts(client), [{ name: 'digital', count: 1 }])
  })

  it('breaks count ties by name for a stable order', async () => {
    const client = {
      async withPat() {
        return {
          success: true,
          data: {
            total: 3,
            items: [
              { id: '1', category: 'b' },
              { id: '2', category: 'a' },
              { id: '3', category: 'b' },
            ],
          },
        }
      },
    }
    assert.deepEqual(await collectCategoryCounts(client), [
      { name: 'b', count: 2 },
      { name: 'a', count: 1 },
    ])
  })

  it('caps the walk at maxPages even when total is poisoned', async () => {
    /** @type {string[]} */
    const requested = []
    const client = catalogueClient({
      total: 1e12,
      names: ['digital'],
      onRequest: (path) => requested.push(path),
    })
    await collectCategoryCounts(client, { pageSize: 2, maxPages: 3, concurrency: 2 })
    const pages = requested.map((path) => new URL(path, 'http://127.0.0.1').searchParams.get('page')).sort()
    assert.deepEqual(pages, ['1', '2', '3'], `poisoned total must still stop at maxPages, saw ${JSON.stringify(requested)}`)
  })

  it('stops after a short page even when total claims more', async () => {
    /** @type {number[]} */
    const pages = []
    const client = {
      async withPat(path) {
        const url = new URL(path, 'http://127.0.0.1')
        const page = Number(url.searchParams.get('page')) || 1
        pages.push(page)
        if (page === 1) {
          return { success: true, data: { total: 500, items: [{ id: '1', category: 'digital' }, { id: '2', category: 'digital' }] } }
        }
        return { success: true, data: { total: 500, items: [{ id: '3', category: 'digital' }] } }
      },
    }
    const data = await collectCategoryCounts(client, { pageSize: 2, maxPages: 20, concurrency: 1 })
    assert.deepEqual(pages, [1, 2])
    assert.deepEqual(data, [{ name: 'digital', count: 3 }])
  })

  it('keeps paging to the cap when total is missing and the first page is full', async () => {
    /** @type {number[]} */
    const pages = []
    const client = {
      async withPat(path) {
        const url = new URL(path, 'http://127.0.0.1')
        const page = Number(url.searchParams.get('page')) || 1
        pages.push(page)
        return {
          success: true,
          data: {
            items: [
              { id: `${page}-a`, category: 'digital' },
              { id: `${page}-b`, category: 'digital' },
            ],
          },
        }
      },
    }
    const data = await collectCategoryCounts(client, { pageSize: 2, maxPages: 3, concurrency: 1 })
    assert.deepEqual(pages, [1, 2, 3])
    assert.deepEqual(data, [{ name: 'digital', count: 6 }])
  })

  it('treats a finite total of 0 as empty instead of collapsing it', async () => {
    /** @type {string[]} */
    const requested = []
    const client = {
      async withPat(path) {
        requested.push(path)
        return { success: true, data: { total: 0, items: [] } }
      },
    }
    assert.deepEqual(await collectCategoryCounts(client, { pageSize: 100 }), [])
    assert.equal(requested.length, 1)
  })

  it('keeps page-1 rows when a later page throws', async () => {
    const client = {
      async withPat(path) {
        const url = new URL(path, 'http://127.0.0.1')
        const page = Number(url.searchParams.get('page')) || 1
        if (page === 1) {
          return {
            success: true,
            data: {
              total: 4,
              items: [
                { id: '1', category: 'digital' },
                { id: '2', category: 'digital' },
              ],
            },
          }
        }
        throw new Error(`page ${page} down`)
      },
    }
    assert.deepEqual(
      await collectCategoryCounts(client, { pageSize: 2, maxPages: 5, concurrency: 2 }),
      [{ name: 'digital', count: 2 }],
    )
  })

  it('stops paging after a later page fails instead of walking to maxPages', async () => {
    /** @type {number[]} */
    const pages = []
    const client = {
      async withPat(path) {
        const url = new URL(path, 'http://127.0.0.1')
        const page = Number(url.searchParams.get('page')) || 1
        pages.push(page)
        if (page === 1) {
          return {
            success: true,
            data: {
              total: 20,
              items: [
                { id: '1', category: 'digital' },
                { id: '2', category: 'digital' },
              ],
            },
          }
        }
        throw new Error(`page ${page} down`)
      },
    }
    assert.deepEqual(
      await collectCategoryCounts(client, { pageSize: 2, maxPages: 8, concurrency: 1 }),
      [{ name: 'digital', count: 2 }],
    )
    assert.deepEqual(pages, [1, 2], `later-page failure must end the walk, saw ${JSON.stringify(pages)}`)
  })

  it('fails the walk when page 1 throws', async () => {
    const client = {
      async withPat() {
        throw new Error('cloud unreachable')
      },
    }
    await assert.rejects(
      () => collectCategoryCounts(client, { timeoutMs: 1000 }),
      /cloud unreachable/,
    )
  })

  it('times out a hung walk so callers can SWR-degrade', async () => {
    const client = {
      async withPat() {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return { success: true, data: { total: 1, items: [{ id: '1', category: 'digital' }] } }
      },
    }
    await assert.rejects(
      () => collectCategoryCounts(client, { timeoutMs: 20 }),
      /category aggregation timed out/,
    )
  })

  it('stops scheduling further batches after the deadline', async () => {
    /** @type {number[]} */
    const pages = []
    /** @type {() => void} */
    let releaseHang = () => {}
    const hang = new Promise((resolve) => {
      releaseHang = resolve
    })
    const client = {
      async withPat(path) {
        const url = new URL(path, 'http://127.0.0.1')
        const page = Number(url.searchParams.get('page')) || 1
        pages.push(page)
        if (page === 1) {
          return {
            success: true,
            data: {
              total: 40,
              items: [
                { id: '1', category: 'digital' },
                { id: '2', category: 'digital' },
              ],
            },
          }
        }
        await hang
        return {
          success: true,
          data: {
            total: 40,
            items: [
              { id: String(page), category: 'digital' },
              { id: `${page}-b`, category: 'digital' },
            ],
          },
        }
      },
    }
    try {
      await assert.rejects(
        () => collectCategoryCounts(client, { pageSize: 2, maxPages: 10, concurrency: 1, timeoutMs: 30 }),
        /category aggregation timed out/,
      )
      await new Promise((resolve) => setTimeout(resolve, 40))
      assert.deepEqual(pages, [1, 2], `deadline must not open another batch, saw ${JSON.stringify(pages)}`)
    } finally {
      releaseHang()
    }
  })

  it('absorbs the rest of the current batch after a short page, then stops', async () => {
    /** @type {number[]} */
    const pages = []
    const client = {
      async withPat(path) {
        const url = new URL(path, 'http://127.0.0.1')
        const page = Number(url.searchParams.get('page')) || 1
        pages.push(page)
        if (page === 1) {
          return {
            success: true,
            data: {
              total: 20,
              items: [
                { id: '1', category: 'digital' },
                { id: '2', category: 'digital' },
              ],
            },
          }
        }
        if (page === 2) {
          return { success: true, data: { total: 20, items: [{ id: '3', category: 'digital' }] } }
        }
        return {
          success: true,
          data: {
            total: 20,
            items: [
              { id: `${page}-a`, category: 'digital' },
              { id: `${page}-b`, category: 'digital' },
            ],
          },
        }
      },
    }
    const data = await collectCategoryCounts(client, { pageSize: 2, maxPages: 10, concurrency: 2 })
    assert.deepEqual(pages.slice().sort((a, b) => a - b), [1, 2, 3])
    assert.deepEqual(data, [{ name: 'digital', count: 5 }])
  })
})

describe('createCategoryCache', () => {
  it('reads null before the first load and fresh data within the TTL', async () => {
    let now = 1_000_000
    const cache = createCategoryCache({ ttlMs: 600_000, now: () => now })
    assert.equal(cache.read(), null)
    await cache.refresh(async () => [{ name: 'digital', count: 3 }])
    const fresh = cache.read()
    assert.equal(fresh.stale, false)
    assert.deepEqual(fresh.data, [{ name: 'digital', count: 3 }])
    now += 600_001
    assert.equal(cache.read().stale, true)
  })

  it('dedupes concurrent refreshes onto one loader call', async () => {
    const cache = createCategoryCache()
    let loads = 0
    const [a, b] = await Promise.all([
      cache.refresh(async () => {
        loads += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return [{ name: 'digital', count: 1 }]
      }),
      cache.refresh(async () => {
        loads += 1
        return [{ name: 'other', count: 1 }]
      }),
    ])
    assert.equal(loads, 1)
    assert.deepEqual(a, b)
  })

  it('holds inflight until a timed-out walk settles so a retry cannot overlap', async () => {
    let walks = 0
    /** @type {number[]} */
    const pages = []
    /** @type {() => void} */
    let releaseHang = () => {}
    const hang = new Promise((resolve) => {
      releaseHang = resolve
    })
    const cache = createCategoryCache()
    const loader = () => {
      walks += 1
      return collectCategoryCounts({
        async withPat(path) {
          const url = new URL(path, 'http://127.0.0.1')
          const page = Number(url.searchParams.get('page')) || 1
          pages.push(page)
          if (page === 1) {
            return {
              success: true,
              data: {
                total: 40,
                items: [
                  { id: '1', category: 'digital' },
                  { id: '2', category: 'digital' },
                ],
              },
            }
          }
          await hang
          return {
            success: true,
            data: {
              total: 40,
              items: [
                { id: String(page), category: 'digital' },
                { id: `${page}-b`, category: 'digital' },
              ],
            },
          }
        },
      }, { pageSize: 2, maxPages: 10, concurrency: 1, timeoutMs: 30 })
    }
    await assert.rejects(() => cache.refresh(loader), /category aggregation timed out/)
    const walksAtTimeout = walks
    await assert.rejects(() => cache.refresh(loader), /category aggregation timed out/)
    assert.equal(walks, walksAtTimeout, 'retry must share inflight until the walk settles')
    assert.deepEqual(pages, [1, 2], `timed-out walk must not keep paging, saw ${JSON.stringify(pages)}`)
    releaseHang()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const recovered = await cache.refresh(async () => [{ name: 'digital', count: 1 }])
    assert.deepEqual(recovered, [{ name: 'digital', count: 1 }])
  })

  it('keeps the stale value after a failed refresh and retries next time', async () => {
    let now = 0
    const cache = createCategoryCache({ ttlMs: 10, now: () => now })
    await cache.refresh(async () => [{ name: 'digital', count: 1 }])
    now += 100
    await assert.rejects(cache.refresh(async () => {
      throw new Error('upstream down')
    }))
    const held = cache.read()
    assert.equal(held.stale, true)
    assert.deepEqual(held.data, [{ name: 'digital', count: 1 }])
    const retried = await cache.refresh(async () => [{ name: 'digital', count: 2 }])
    assert.deepEqual(retried, [{ name: 'digital', count: 2 }])
  })
})
