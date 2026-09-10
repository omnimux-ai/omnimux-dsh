import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { invalidateInspirationCache } from './api.js'
import {
  applyCachedPage,
  cacheKeyOf,
  checkCacheEarlyReturn,
  createReplicateStatusHandler,
  extractLocalItemIds,
  filterOutItemsByIds,
  mergeFetchResult,
  removeIdsFromSet,
  resetReplicateBusy,
  toggleIdInSet,
  updateItemInList,
} from './feed-helpers.js'
import {
  resolveDateRange,
  resolveDurationRange,
  resolveViewsRange,
  useInspirationFeed,
} from './use-inspiration-feed.js'

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function inspirationRows(prefix, start, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${start + index}`,
    title: `${prefix} ${start + index}`,
  }))
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  assert.fail(message)
}

class TestIntersectionObserver {
  static instances = []

  constructor(callback) {
    this.callback = callback
    this.disconnected = false
    TestIntersectionObserver.instances.push(this)
  }

  observe(target) {
    this.target = target
  }

  disconnect() {
    this.disconnected = true
  }

  intersect() {
    if (!this.disconnected) {
      this.callback([{ isIntersecting: true, target: this.target }])
    }
  }
}

describe('use-inspiration-feed pure helpers', () => {
  describe('cacheKeyOf', () => {
    it('constructs standard cache key from positional arguments', () => {
      const key = cacheKeyOf('all', 'dance', 'video', 'hot', '0')
      assert.equal(key, 'insp:all:dance:video:hot:0')
    })

    it('applies defaults for missing arguments', () => {
      const key = cacheKeyOf()
      assert.equal(key, 'insp:all:::hot:0')
    })

    it('accepts options object parameter', () => {
      const key = cacheKeyOf({
        tab: 'local',
        q: 'fashion',
        type: 'image',
        sort: 'new',
        favorite: '1',
      })
      assert.equal(key, 'insp:local:fashion:image:new:1')
    })

    it('appends multidimensional filter parameters when present', () => {
      const key = cacheKeyOf({
        tab: 'all',
        country: 'US',
        category: 'beauty',
        duration_min: 15,
        duration_max: 30,
        views_min: 100000,
        traffic_type: 'ad',
        posted_after: '2026-09-01',
      })
      assert.equal(key, 'insp:all:::hot:0:c=US&cat=beauty&dmin=15&dmax=30&vmin=100000&tt=ad&pafter=2026-09-01')
    })
  })

  describe('range resolution helpers', () => {
    it('resolves duration ranges accurately', () => {
      assert.deepEqual(resolveDurationRange('0-15'), { duration_min: undefined, duration_max: 15 })
      assert.deepEqual(resolveDurationRange('15-30'), { duration_min: 15, duration_max: 30 })
      assert.deepEqual(resolveDurationRange('30-60'), { duration_min: 30, duration_max: 60 })
      assert.deepEqual(resolveDurationRange('60+'), { duration_min: 60, duration_max: undefined })
      assert.deepEqual(resolveDurationRange(''), { duration_min: undefined, duration_max: undefined })
    })

    it('resolves views ranges accurately', () => {
      assert.deepEqual(resolveViewsRange('10k+'), { views_min: 10000, views_max: undefined })
      assert.deepEqual(resolveViewsRange('1m+'), { views_min: 1000000, views_max: undefined })
      assert.deepEqual(resolveViewsRange(''), { views_min: undefined, views_max: undefined })
    })

    it('resolves date ranges accurately', () => {
      const fixedNow = Date.parse('2026-09-10T12:00:00.000Z')
      const r7 = resolveDateRange('last7', fixedNow)
      assert.equal(r7.posted_after, '2026-09-03')
      assert.equal(r7.posted_before, undefined)

      const rCustom = resolveDateRange('2026-09-03:2026-09-09')
      assert.equal(rCustom.posted_after, '2026-09-03')
      assert.equal(rCustom.posted_before, '2026-09-09')
    })
  })

  describe('applyCachedPage', () => {
    it('returns false when cached is null or undefined', () => {
      assert.equal(applyCachedPage(null, {}), false)
      assert.equal(applyCachedPage(undefined, {}), false)
      assert.equal(applyCachedPage({}, {}), false)
    })

    it('applies cached data to setters and returns true for fresh cache', () => {
      let itemsVal = null
      let hasMoreVal = null
      let phaseVal = null
      let loadingVal = null

      const cached = {
        isStale: false,
        data: {
          items: [{ id: '1', title: 'test' }],
          hasMore: true,
          phase: 'ready',
        },
      }

      const isFresh = applyCachedPage(cached, {
        setItems: (val) => { itemsVal = val },
        setHasMore: (val) => { hasMoreVal = val },
        setPhase: (val) => { phaseVal = val },
        setLoading: (val) => { loadingVal = val },
      })

      assert.equal(isFresh, true)
      assert.deepEqual(itemsVal, [{ id: '1', title: 'test' }])
      assert.equal(hasMoreVal, true)
      assert.equal(phaseVal, 'ready')
      assert.equal(loadingVal, false)
    })

    it('returns false for stale cache but still applies cached data', () => {
      let itemsVal = null
      const cached = {
        isStale: true,
        data: {
          items: [{ id: '2' }],
          hasMore: false,
          phase: 'ready',
        },
      }

      const isFresh = applyCachedPage(cached, {
        setItems: (val) => { itemsVal = val },
      })

      assert.equal(isFresh, false)
      assert.deepEqual(itemsVal, [{ id: '2' }])
    })
  })

  describe('mergeFetchResult', () => {
    it('handles first page result and resets error', () => {
      let itemsVal = null
      let pageVal = null
      let hasMoreVal = null
      let phaseVal = null
      let errorVal = 'prior-error'

      const result = {
        items: [{ id: 'a' }, { id: 'b' }],
        hasMore: true,
        phase: 'ready',
      }

      mergeFetchResult({
        isNextPage: false,
        result,
        setters: {
          setItems: (val) => { itemsVal = val },
          setPage: (val) => { pageVal = val },
          setHasMore: (val) => { hasMoreVal = val },
          setPhase: (val) => { phaseVal = val },
          setError: (val) => { errorVal = val },
        },
      })

      assert.deepEqual(itemsVal, [{ id: 'a' }, { id: 'b' }])
      assert.equal(pageVal, 1)
      assert.equal(hasMoreVal, true)
      assert.equal(phaseVal, 'ready')
      assert.equal(errorVal, null)
    })

    it('handles next page result by appending items', () => {
      let itemsUpdater = null
      let pageVal = null
      let hasMoreVal = null
      let errorVal = 'prior-error'

      const result = {
        items: [{ id: 'c' }],
        hasMore: false,
      }

      mergeFetchResult({
        isNextPage: true,
        result,
        targetPage: 3,
        setters: {
          setItems: (fn) => { itemsUpdater = fn },
          setPage: (val) => { pageVal = val },
          setHasMore: (val) => { hasMoreVal = val },
          setError: (val) => { errorVal = val },
        },
      })

      assert.equal(typeof itemsUpdater, 'function')
      assert.deepEqual(itemsUpdater([{ id: 'a' }, { id: 'b' }]), [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ])
      assert.equal(pageVal, 3)
      assert.equal(hasMoreVal, false)
      assert.equal(errorVal, null)
    })
  })

  describe('selection and list helpers', () => {
    it('toggleIdInSet adds and removes ids immutably', () => {
      const s1 = new Set(['1', '2'])
      const s2 = toggleIdInSet(s1, '3')
      assert.deepEqual(Array.from(s2), ['1', '2', '3'])
      assert.deepEqual(Array.from(s1), ['1', '2'])

      const s3 = toggleIdInSet(s2, '2')
      assert.deepEqual(Array.from(s3), ['1', '3'])
    })

    it('removeIdsFromSet removes multiple ids', () => {
      const initial = new Set(['1', '2', '3', '4'])
      const next = removeIdsFromSet(initial, ['2', '4'])
      assert.deepEqual(Array.from(next), ['1', '3'])
      assert.equal(initial.size, 4)
    })

    it('filterOutItemsByIds filters items by id list', () => {
      const items = [{ id: '1' }, { id: '2' }, { id: '3' }]
      const filtered = filterOutItemsByIds(items, ['2', '3'])
      assert.deepEqual(filtered, [{ id: '1' }])
    })

    it('extractLocalItemIds returns only ids of local items', () => {
      const items = [
        { id: '1', is_local: true },
        { id: '2', is_local: false },
        { id: '3', is_local: true },
      ]
      assert.deepEqual(extractLocalItemIds(items), ['1', '3'])
    })

    it('updateItemInList replaces matched item and leaves others intact', () => {
      const items = [{ id: '1', title: 'old' }, { id: '2', title: 'keep' }]
      const updated = updateItemInList(items, { id: '1', title: 'new' })
      assert.deepEqual(updated, [{ id: '1', title: 'new' }, { id: '2', title: 'keep' }])
    })
  })

  describe('createReplicateStatusHandler', () => {
    it('sets status directly for replicating card action', () => {
      let ctaVal = null
      let flashVal = null
      const handler = createReplicateStatusHandler(
        (key) => { flashVal = key },
        (key) => { ctaVal = key },
      )

      handler('card.cta.replicating')
      assert.equal(ctaVal, 'card.cta.replicating')
      assert.equal(flashVal, null)
    })

    it('resets ctaStatus for null', () => {
      let ctaVal = 'active'
      const handler = createReplicateStatusHandler(
        () => {},
        (key) => { ctaVal = key },
      )

      handler(null)
      assert.equal(ctaVal, null)
    })

    it('flashes status for other keys', () => {
      let flashVal = null
      const handler = createReplicateStatusHandler(
        (key) => { flashVal = key },
        () => {},
      )

      handler('card.cta.copied')
      assert.equal(flashVal, 'card.cta.copied')
    })
  })

  describe('resetReplicateBusy', () => {
    it('resets busy state only when ticket matches current ref', () => {
      const ref = { current: 'ticket-1' }
      let busy = 'ticket-1'
      resetReplicateBusy(ref, (val) => { busy = val }, 'ticket-2')
      assert.equal(ref.current, 'ticket-1')
      assert.equal(busy, 'ticket-1')

      resetReplicateBusy(ref, (val) => { busy = val }, 'ticket-1')
      assert.equal(ref.current, null)
      assert.equal(busy, null)
    })
  })

  describe('checkCacheEarlyReturn', () => {
    it('sets loading true when cache is completely missing', () => {
      let loadingVal = null
      const hit = checkCacheEarlyReturn('insp:test', {
        setLoading: (v) => { loadingVal = v },
      })
      assert.equal(hit, false)
      assert.equal(loadingVal, true)
    })
  })
})

describe('useInspirationFeed lifecycle', () => {
  it('keeps appended pages, stops at the end, and resets filters to page one', async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' })
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalFetch = globalThis.fetch
    const originalIntersectionObserver = globalThis.IntersectionObserver
    const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
    const requests = []
    let feed

    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.IntersectionObserver = TestIntersectionObserver
    TestIntersectionObserver.instances = []
    invalidateInspirationCache()

    globalThis.fetch = async (input) => {
      const url = new URL(String(input), dom.window.location.href)
      const page = Number(url.searchParams.get('page'))
      const type = url.searchParams.get('type') || ''
      requests.push({ path: url.pathname, page, type })
      if (url.pathname === '/omnimux/inspiration/local') {
        return jsonResponse(200, { data: { items: [], total: 0 } })
      }
      if (url.pathname !== '/omnimux/inspiration') {
        return jsonResponse(404, { error: 'not-found' })
      }
      if (type === 'video') {
        return jsonResponse(200, {
          data: { items: inspirationRows('video', 1, 20), total: 25 },
        })
      }
      const items = page === 1
        ? inspirationRows('all', 1, 20)
        : inspirationRows('all', 21, 10)
      return jsonResponse(200, { data: { items, total: 30 } })
    }

    function Harness() {
      feed = useInspirationFeed({ active: true })
      return React.createElement('div', { ref: feed.sentinelRef })
    }

    const root = createRoot(dom.window.document.getElementById('root'))
    try {
      await act(async () => {
        root.render(React.createElement(Harness))
      })
      await waitFor(() => feed?.items.length === 20 && feed?.hasMore, 'first page did not load')

      const pageOneObserver = TestIntersectionObserver.instances.find((observer) => !observer.disconnected)
      assert.ok(pageOneObserver, 'pagination sentinel should be observed after page one')
      await act(async () => {
        pageOneObserver.intersect()
      })
      await waitFor(() => feed?.items.length === 30 && !feed?.hasMore, 'second page did not append')
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      assert.equal(feed.page, 2)
      assert.deepEqual(feed.items.map((item) => item.id), inspirationRows('all', 1, 30).map((item) => item.id))
      assert.deepEqual(
        requests.filter((request) => request.path === '/omnimux/inspiration').map(({ page, type }) => ({ page, type })),
        [{ page: 1, type: '' }, { page: 2, type: '' }],
      )

      for (const observer of TestIntersectionObserver.instances) observer.intersect()
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      assert.equal(requests.filter((request) => request.path === '/omnimux/inspiration').length, 2)

      await act(async () => {
        feed.setType('video')
      })
      await waitFor(
        () => feed?.page === 1 && feed?.items[0]?.id === 'video-1',
        'filter change did not load page one',
      )
      assert.equal(feed.items.length, 20)
      assert.deepEqual(
        requests.filter((request) => request.path === '/omnimux/inspiration').at(-1),
        { path: '/omnimux/inspiration', page: 1, type: 'video' },
      )
    } finally {
      await act(async () => root.unmount())
      invalidateInspirationCache()
      dom.window.close()
      globalThis.window = originalWindow
      globalThis.document = originalDocument
      globalThis.fetch = originalFetch
      globalThis.IntersectionObserver = originalIntersectionObserver
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
    }
  })
})
