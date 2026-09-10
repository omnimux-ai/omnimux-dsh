import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  authGuard,
  extractTikTokVideoId,
  hostMediaSrc,
  listInspirations,
  listLocalInspirations,
  quotaGuard,
  resolveCreatorProfileUrl,
  resolveTikTokEmbedUrl,
  whenAuthReady,
} from './api.js'

function fakeGate() {
  let ensureArgs = null
  return {
    api: {
      ensureLogin(opts) {
        ensureArgs = opts
        if (typeof opts.onSuccess === 'function') opts.onSuccess({ logged_in: true })
        return { ok: true }
      },
    },
    args: () => ensureArgs,
  }
}

function withWindow(win, run) {
  const saved = globalThis.window
  globalThis.window = win
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    globalThis.window = saved
  }
  const out = run(restore)
  if (out && typeof out.then === 'function') return out.finally(restore)
  restore()
  return out
}

function captureTimer() {
  const savedSet = globalThis.setInterval
  const savedClear = globalThis.clearInterval
  let cb = null
  let id = 0
  globalThis.setInterval = (fn) => { cb = fn; id += 1; return id }
  globalThis.clearInterval = () => { cb = null }
  return {
    restore() {
      globalThis.setInterval = savedSet
      globalThis.clearInterval = savedClear
    },
    tick() {
      if (cb) cb()
    },
  }
}

describe('inspiration api authGuard', () => {
  it('passes through a non-401 result untouched', async () => {
    const fn = async () => ({ ok: true, status: 200, body: { success: true } })
    assert.deepEqual(await authGuard(fn)(), { ok: true, status: 200, body: { success: true } })
  })

  it('401 → ensureLogin → replays the original call once', async () => {
    const gate = fakeGate()
    await withWindow({ __omnimuxAuth: gate.api }, async () => {
      let calls = 0
      const fn = async () => {
        calls += 1
        return calls === 1
          ? { ok: false, status: 401, body: { error: 'needs-omnimux' } }
          : { ok: true, status: 200, body: { success: true } }
      }
      const result = await authGuard(fn)()
      assert.equal(calls, 2)
      assert.equal(result.status, 200)
      assert.equal(gate.args() !== null, true)
      assert.equal(gate.args()?.kind, 'write')
    })
  })

  it('does not throw when the gate global is absent', async () => {
    await withWindow({}, async () => {
      const fn = async () => ({ ok: false, status: 401, body: { error: 'needs-omnimux' } })
      const result = await authGuard(fn)()
      assert.equal(result.status, 401)
    })
  })
})

describe('inspiration api quotaGuard', () => {
  it('402 → notify once, no retry', async () => {
    let calls = 0
    const notified = []
    await withWindow({ __omnimuxQuota: { notify(f, c) { notified.push([f, c]) } } }, async () => {
      const fn = async () => { calls += 1; return { ok: false, status: 402, body: { error: 'quota-exceeded' } } }
      const result = await quotaGuard(fn, { capability: 'inspiration' })()
      assert.equal(calls, 1)
      assert.equal(result.status, 402)
      assert.equal(notified.length, 1)
    })
  })
})

describe('inspiration api whenAuthReady', () => {
  it('calls cb immediately when the hub global is already ready', () => {
    const win = { __omnimuxAuth: { ensureLogin: () => {}, marker: 'ready' } }
    const saved = globalThis.window
    globalThis.window = win
    try {
      let called = 0
      const dispose = whenAuthReady((api) => {
        called += 1
        assert.equal(api.marker, 'ready')
      })
      assert.equal(called, 1)
      dispose()
    } finally {
      globalThis.window = saved
    }
  })

  it('disposer stops further polling', () => {
    const timer = captureTimer()
    const win = {}
    const saved = globalThis.window
    globalThis.window = win
    try {
      let called = 0
      const dispose = whenAuthReady(() => { called += 1 })
      dispose()
      win.__omnimuxAuth = { ensureLogin: () => {} }
      timer.tick()
      assert.equal(called, 0)
    } finally {
      globalThis.window = saved
      timer.restore()
    }
  })
})

describe('hostMediaSrc', () => {
  it('rewrites gateway media paths onto Host', () => {
    assert.equal(hostMediaSrc('/api/inspiration/v1/media/covers/a.jpg'), '/omnimux/inspiration/media/covers/a.jpg')
    assert.equal(hostMediaSrc('/omnimux/inspiration/media/covers/a.jpg'), '/omnimux/inspiration/media/covers/a.jpg')
    assert.equal(hostMediaSrc('https://cdn.example/a.jpg'), 'https://cdn.example/a.jpg')
    assert.equal(hostMediaSrc(''), '')
  })
})

describe('resolveCreatorProfileUrl', () => {
  it('resolves explicit profile_url or url on creator object', () => {
    assert.equal(resolveCreatorProfileUrl({ profile_url: 'https://tiktok.com/@alex' }), 'https://tiktok.com/@alex')
    assert.equal(resolveCreatorProfileUrl({ url: 'https://instagram.com/alex' }), 'https://instagram.com/alex')
  })

  it('builds profile URL for TikTok by default or from sourceUrl', () => {
    assert.equal(resolveCreatorProfileUrl({ handle: 'luckylynndee' }), 'https://www.tiktok.com/@luckylynndee')
    assert.equal(resolveCreatorProfileUrl({ handle: '@shi.learn' }), 'https://www.tiktok.com/@shi.learn')
  })

  it('builds platform-specific profile URL for Instagram and YouTube', () => {
    assert.equal(resolveCreatorProfileUrl({ handle: 'designer' }, 'https://instagram.com/reel/123'), 'https://www.instagram.com/designer')
    assert.equal(resolveCreatorProfileUrl({ handle: 'tech_channel' }, 'https://youtube.com/watch?v=123'), 'https://www.youtube.com/@tech_channel')
  })

  it('falls back to source URL @handle when creator handle is generic', () => {
    assert.equal(resolveCreatorProfileUrl({ handle: 'creator' }, 'https://www.tiktok.com/@mariaqvcpb9/video/123'), 'https://www.tiktok.com/@mariaqvcpb9')
  })
})

describe('extractTikTokVideoId', () => {
  it('extracts id from standard video URLs with and without @, with query params', () => {
    assert.equal(extractTikTokVideoId('https://www.tiktok.com/@user/video/7555186216296008990'), '7555186216296008990')
    assert.equal(extractTikTokVideoId('https://www.tiktok.com/user/video/7555186216296008990'), '7555186216296008990')
    assert.equal(extractTikTokVideoId('https://tiktok.com/@creator/video/7555186216296008990?is_from_webapp=1&sender_device=pc'), '7555186216296008990')
  })

  it('extracts id from /v/:id format URLs', () => {
    assert.equal(extractTikTokVideoId('https://www.tiktok.com/v/7555186216296008990'), '7555186216296008990')
    assert.equal(extractTikTokVideoId('http://tiktok.com/v/7555186216296008990.html'), '7555186216296008990')
  })

  it('extracts id from player/v1/:id format URLs', () => {
    assert.equal(extractTikTokVideoId('https://www.tiktok.com/player/v1/7555186216296008990'), '7555186216296008990')
    assert.equal(extractTikTokVideoId('https://tiktok.com/player/v1/7555186216296008990?autoplay=1'), '7555186216296008990')
  })

  it('returns null for invalid or empty URLs', () => {
    assert.equal(extractTikTokVideoId(''), null)
    assert.equal(extractTikTokVideoId(null), null)
    assert.equal(extractTikTokVideoId(undefined), null)
    assert.equal(extractTikTokVideoId(12345), null)
    assert.equal(extractTikTokVideoId('https://instagram.com/reel/1234567890'), null)
    assert.equal(extractTikTokVideoId('https://youtube.com/watch?v=abc'), null)
    assert.equal(extractTikTokVideoId('https://tiktok.com/about'), null)
  })
})

describe('resolveTikTokEmbedUrl', () => {
  it('handles pure numeric video ID', () => {
    assert.equal(resolveTikTokEmbedUrl('7555186216296008990'), 'https://www.tiktok.com/player/v1/7555186216296008990')
    assert.equal(resolveTikTokEmbedUrl(7555186216296008990n), 'https://www.tiktok.com/player/v1/7555186216296008990')
  })

  it('handles standard TikTok video URLs with or without @ and query params', () => {
    assert.equal(resolveTikTokEmbedUrl('https://www.tiktok.com/@user/video/7555186216296008990'), 'https://www.tiktok.com/player/v1/7555186216296008990')
    assert.equal(resolveTikTokEmbedUrl('https://tiktok.com/@user/video/7555186216296008990?lang=en'), 'https://www.tiktok.com/player/v1/7555186216296008990')
  })

  it('handles /v/:id format URLs', () => {
    assert.equal(resolveTikTokEmbedUrl('https://www.tiktok.com/v/7555186216296008990'), 'https://www.tiktok.com/player/v1/7555186216296008990')
  })

  it('handles already formed /player/v1/:id format URLs and formats them properly', () => {
    assert.equal(resolveTikTokEmbedUrl('https://www.tiktok.com/player/v1/7555186216296008990'), 'https://www.tiktok.com/player/v1/7555186216296008990')
    assert.equal(resolveTikTokEmbedUrl('http://tiktok.com/player/v1/7555186216296008990?autoplay=1'), 'https://www.tiktok.com/player/v1/7555186216296008990')
  })

  it('returns null for invalid or empty inputs', () => {
    assert.equal(resolveTikTokEmbedUrl(''), null)
    assert.equal(resolveTikTokEmbedUrl(null), null)
    assert.equal(resolveTikTokEmbedUrl(undefined), null)
    assert.equal(resolveTikTokEmbedUrl('not-a-valid-url'), null)
    assert.equal(resolveTikTokEmbedUrl('https://example.com/video/123'), null)
    assert.equal(resolveTikTokEmbedUrl('123'), null)
  })
})

describe('listInspirations query params', () => {
  it('encodes multidimensional filters for cloud and local requests', async () => {
    const originalFetch = globalThis.fetch
    const calls = []
    globalThis.fetch = async (url) => {
      calls.push(url.toString())
      return { ok: true, status: 200, json: async () => ({ success: true, data: { items: [], total: 0 } }) }
    }
    try {
      await listInspirations({
        country: 'US',
        category: 'beauty',
        duration_min: 15,
        duration_max: 30,
        views_min: 100000,
        traffic_type: 'ad',
        sort: 'views',
        posted_after: '2026-09-01',
      })
      assert.equal(
        calls[0],
        '/omnimux/inspiration?sort=views&country=US&category=beauty&duration_min=15&duration_max=30&views_min=100000&traffic_type=ad&posted_after=2026-09-01',
      )

      await listLocalInspirations({
        country: 'GB',
        category: 'home',
        traffic_type: 'organic',
        sort: 'views',
      })
      assert.equal(
        calls[1],
        '/omnimux/inspiration/local?sort=views&country=GB&category=home&traffic_type=organic',
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
