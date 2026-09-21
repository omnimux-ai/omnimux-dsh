import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  authGuard,
  createShareLink,
  extractTikTokVideoId,
  hostMediaSrc,
  listInspirations,
  listLocalInspirations,
  loadInspirationsAtomic,
  quotaGuard,
  publishableMediaAddress,
  shareDeconstructionOf,
  resolveCreatorProfileUrl,
  resolveTikTokEmbedUrl,
  shareRequestPayload,
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

      await listInspirations({ platform: 'x' })
      assert.equal(calls.at(-1), '/omnimux/inspiration?platform=x')

      await listLocalInspirations({ platform: 'tiktok' })
      assert.equal(calls.at(-1), '/omnimux/inspiration/local?platform=tiktok')

      calls.length = 0
      await loadInspirationsAtomic({ tab: 'local', category: 'digital', sort: 'new' })
      assert.ok(calls.length > 0, 'the local tab must still query the local library')
      assert.equal(
        calls.some((url) => /[?&]category=/.test(url)),
        false,
        `the local tab must not forward a leftover cloud category: ${JSON.stringify(calls)}`,
      )

      calls.length = 0
      await loadInspirationsAtomic({ tab: 'public', category: 'digital', sort: 'hot' })
      assert.ok(
        calls.some((url) => url.includes('category=digital')),
        `the 云端 tab must still forward category: ${JSON.stringify(calls)}`,
      )

      calls.length = 0
      const mixed = await loadInspirationsAtomic({ tab: 'all', category: '', sort: 'hot' })
      const mixedLocal = calls.filter((url) => url.includes('/omnimux/inspiration/local'))
      const mixedCloud = calls.filter((url) => url.startsWith('/omnimux/inspiration?') || url === '/omnimux/inspiration')
      assert.ok(mixedLocal.length > 0, `tab=all with no industry must still query the local library: ${JSON.stringify(calls)}`)
      assert.ok(mixedCloud.length > 0, `tab=all with no industry must still query the cloud library: ${JSON.stringify(calls)}`)
      assert.equal(mixedLocal.some((url) => /[?&]category=/.test(url)), false)
      assert.ok(Array.isArray(mixed.items))

      calls.length = 0
      const filtered = await loadInspirationsAtomic({ tab: 'all', category: 'beauty_skincare', sort: 'hot' })
      const filteredLocal = calls.filter((url) => url.includes('/omnimux/inspiration/local'))
      const filteredCloud = calls.filter((url) => url.startsWith('/omnimux/inspiration?') || url === '/omnimux/inspiration')
      assert.equal(
        filteredLocal.length,
        0,
        `tab=all with an industry must not query the local library: ${JSON.stringify(calls)}`,
      )
      assert.ok(
        filteredCloud.some((url) => url.includes('category=beauty_skincare')),
        `tab=all with an industry must still query the cloud library: ${JSON.stringify(filteredCloud)}`,
      )
      assert.equal(
        filtered.items.some((item) => item.is_local),
        false,
        'tab=all with an industry must not surface unfiltered local cards',
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('posts createShareLink to Host and never invents a link', async () => {
    const originalFetch = globalThis.fetch
    /** @type {{ url: string, opts?: any }[]} */
    const calls = []
    try {
      globalThis.fetch = async (url, opts) => {
        calls.push({ url, opts })
        return {
          ok: true,
          status: 202,
          json: async () => ({
            ok: true,
            data: {
              id: 'insp-42',
              share_status: 'running',
              share_stage: 'preparing',
            },
          }),
        }
      }

      const started = await createShareLink('insp-42')
      assert.equal(started.ok, true)
      assert.equal(started.status, 202)
      assert.equal(calls[0].url, '/omnimux/inspiration/local/insp-42/share')
      assert.equal(calls[0].opts.method, 'POST')
      assert.equal(calls[0].opts.body, undefined, 'the job takes no client-chosen expiry')
      assert.equal(started.body.data.share_status, 'running')
      assert.equal(started.body.data.share_url, undefined, 'a running job carries no link')

      // A Host refusal is reported as-is, with its reason.
      globalThis.fetch = async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: '本地没有可上传的素材（视频或封面），请先补全素材后再分享' }),
      })
      const refused = await createShareLink('insp-42')
      assert.equal(refused.ok, false)
      assert.equal(refused.status, 400)
      assert.match(refused.body.error, /没有可上传的素材/)
      assert.equal(refused.body.data, undefined)

      // A dead network is a failure, never a locally assembled link.
      globalThis.fetch = async () => { throw new Error('network down') }
      await assert.rejects(() => createShareLink('insp-offline'), /network down/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('share request payload — what a cloud row hands to the Host', () => {
  const CLOUD_ROW = {
    id: 2789,
    is_local: false,
    type: 'video',
    title: '情绪共鸣型助眠歌单推广',
    caption: 'Give it a try 🥺',
    category: 'Health & Wellness',
    coverUrl: '/api/inspiration/v1/public/media/inspiration-covers/2789',
    mediaUrls: [
      '/api/inspiration/v1/public/media/r2/publications/genviral/videos/2789/video.mp4',
      '/api/inspiration/v1/public/media/r2/publications/genviral/videos/2789/video-2.mp4',
    ],
  }

  it('carries the cloud entry the Host has never seen', () => {
    assert.deepEqual(shareRequestPayload(CLOUD_ROW), {
      source: 'cloud',
      type: 'video',
      title: '情绪共鸣型助眠歌单推广',
      caption: 'Give it a try 🥺',
      category: 'Health & Wellness',
      coverUrl: '/api/inspiration/v1/public/media/inspiration-covers/2789',
      mediaUrls: [
        '/api/inspiration/v1/public/media/r2/publications/genviral/videos/2789/video.mp4',
        '/api/inspiration/v1/public/media/r2/publications/genviral/videos/2789/video-2.mp4',
      ],
      embedUrl: '',
      sourceUrl: '',
    })
  })

  it('reads the snake_case spelling too, for a row that came through another seam', () => {
    const payload = shareRequestPayload({
      is_local: false,
      type: 'image',
      title: 't',
      content: 'c',
      cover_url: '/api/inspiration/v1/public/media/inspiration-covers/1',
      media_urls: ['/api/inspiration/v1/public/media/r2/publications/x/slide-1.jpg'],
    })
    assert.equal(payload.caption, 'c')
    assert.equal(payload.coverUrl, '/api/inspiration/v1/public/media/inspiration-covers/1')
    assert.deepEqual(payload.mediaUrls, ['/api/inspiration/v1/public/media/r2/publications/x/slide-1.jpg'])
  })

  it('drops blank media entries instead of posting empty strings', () => {
    const payload = shareRequestPayload({ is_local: false, title: 't', mediaUrls: ['', '  ', 'a.jpg'] })
    assert.deepEqual(payload.mediaUrls, ['a.jpg'])
  })

  // Issue #2075: the catalogue answers `cover_key` / `media_keys` and hands over
  // the Host's own media paths. Reading only the camelCase spellings left both
  // addresses empty, so every cloud share was refused as having no media at all.
  it("reads the catalogue's own key spelling and hands the cloud its publishable form", () => {
    const payload = shareRequestPayload({
      id: 2789,
      is_local: false,
      type: 'image',
      title: '情绪共鸣型助眠歌单推广',
      content: 'Give it a try 🥺',
      category: 'Health & Wellness',
      cover_key: '/omnimux/inspiration/media/inspiration-covers/2789',
      media_keys: [
        '/omnimux/inspiration/media/r2/publications/genviral/slideshows/s1/slide-1.jpg',
        '/omnimux/inspiration/media/r2/publications/genviral/slideshows/s1/slide-2.jpg',
      ],
    })
    assert.equal(payload.caption, 'Give it a try 🥺', 'the copy still comes off `content`')
    assert.equal(payload.coverUrl, '/api/inspiration/v1/public/media/inspiration-covers/2789')
    assert.deepEqual(payload.mediaUrls, [
      '/api/inspiration/v1/public/media/r2/publications/genviral/slideshows/s1/slide-1.jpg',
      '/api/inspiration/v1/public/media/r2/publications/genviral/slideshows/s1/slide-2.jpg',
    ])
  })

  it('leaves an address that is already publishable, or absolute, exactly as it is', () => {
    assert.equal(
      publishableMediaAddress('/api/inspiration/v1/public/media/r2/publications/x/slide-1.jpg'),
      '/api/inspiration/v1/public/media/r2/publications/x/slide-1.jpg',
    )
    assert.equal(
      publishableMediaAddress('https://omnimux.ai/api/inspiration/v1/public/media/a.jpg'),
      'https://omnimux.ai/api/inspiration/v1/public/media/a.jpg',
    )
  })

  it('refuses a traversal segment rather than publishing a mangled address', () => {
    assert.equal(publishableMediaAddress('/omnimux/inspiration/media/../../etc/passwd'), '')
    assert.deepEqual(
      shareRequestPayload({ is_local: false, title: 't', media_keys: ['/omnimux/inspiration/media/../secret'] }).mediaUrls,
      [],
    )
  })

  it('reads the mediaKeys camelCase spelling too', () => {
    const payload = shareRequestPayload({
      is_local: false,
      title: 't',
      coverKey: '/omnimux/inspiration/media/inspiration-covers/9',
      mediaKeys: ['/omnimux/inspiration/media/r2/publications/x/slide-1.jpg'],
    })
    assert.equal(payload.coverUrl, '/api/inspiration/v1/public/media/inspiration-covers/9')
    assert.deepEqual(payload.mediaUrls, ['/api/inspiration/v1/public/media/r2/publications/x/slide-1.jpg'])
  })

  it('sends nothing for a local row: the Host already holds the files', () => {
    assert.equal(shareRequestPayload({ id: 'insp_1', is_local: true }), undefined)
    assert.equal(shareRequestPayload({ id: 'insp_1' }), undefined)
    assert.equal(shareRequestPayload({ id: 'insp_1', share_source: 'local', is_local: false }), undefined)
    assert.equal(shareRequestPayload(null), undefined)
  })

  it('sends nothing for a row that has no id-shaped object at all', () => {
    assert.equal(shareRequestPayload('cloud'), undefined)
    assert.equal(shareRequestPayload(42), undefined)
  })

  /*
   * Issue #2088. The catalogue keeps the entry's account of the footage under
   * `analysis`, and nothing used to carry it across: the publish side then had no
   * breakdown and synthesized the share prompt out of the post copy, so every
   * cloud share carried the original caption instead of a same-footage prompt.
   */
  it("hands the catalogue's own breakdown over with the publish request", () => {
    const payload = shareRequestPayload({
      id: 2789,
      is_local: false,
      type: 'image',
      title: '情绪共鸣型助眠歌单推广',
      content: 'Give it a try 🥺',
      analysis: {
        visual_breakdown: '低饱和高感光夜景，深夜建筑剪影与窗内暖黄灯光的远景构图',
        hook_highlight: '手持啤酒罐的银发老人与年轻女孩侧脸献吻的强反差特写',
        target_goal: '引导用户点击个人主页链接',
        narrative_strategy: '共鸣钩子 → 亲测背书 → 资源展示',
        replication_action: '可替换变量清单',
      },
    })

    assert.deepEqual(payload.deconstruction, {
      visual_breakdown: '低饱和高感光夜景，深夜建筑剪影与窗内暖黄灯光的远景构图',
      hook: '手持啤酒罐的银发老人与年轻女孩侧脸献吻的强反差特写',
    })
    // The campaign fields describe the post, not the picture: forwarding them
    // would put marketing copy into a visual prompt.
    assert.equal('target_goal' in payload.deconstruction, false)
    assert.equal('narrative_strategy' in payload.deconstruction, false)
  })

  it('omits the breakdown entirely when the row carries none', () => {
    const payload = shareRequestPayload({ is_local: false, title: 't', media_keys: ['/omnimux/inspiration/media/x.jpg'] })
    assert.equal('deconstruction' in payload, false)
    assert.equal(shareDeconstructionOf({}), undefined)
    assert.equal(shareDeconstructionOf({ analysis: {} }), undefined)
  })
})
