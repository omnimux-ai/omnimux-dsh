import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStore } from './local-store.js'
import { createLocalInspirationDispatcher, detectPlatformFromUrl } from './http-routes.js'
import { createSocialFetcher, platformDisplayName } from './index.js'
import { fallbackResolveSocial } from './scraper-fallback.js'
import { zh } from './client/locales.js'

const X_VIDEO_ENVELOPE = {
  platform: 'x',
  capability: 'tweet',
  data: {
    text: '开场三秒反杀，这就是钩子',
    author: { name: '老王', screen_name: 'laowangbabababa', image: 'https://pbs.twimg.com/profile_images/a.jpg' },
    engagement: { likes: 1200, views: 98000, retweets: 34, replies: 12 },
    media: {
      video: [
        {
          media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/1/img/cover.jpg',
          variants: [
            { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/amplify_video/1/pl/playlist.m3u8' },
            { content_type: 'video/mp4', bitrate: 256000, url: 'https://video.twimg.com/amplify_video/1/vid/320x180/low.mp4' },
            { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/amplify_video/1/vid/1280x720/high.mp4' },
          ],
        },
      ],
    },
  },
}

const X_PHOTO_ENVELOPE = {
  platform: 'x',
  capability: 'tweet',
  data: {
    text: '',
    entities: { media: [{ media_url_https: 'https://pbs.twimg.com/media/only-photo.jpg', type: 'photo' }] },
  },
}

const mockFetcher = async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('fake-media-content') })

function makePaths(tmp) {
  return {
    dir: tmp,
    libraryFile: join(tmp, 'library.json'),
    mediaDir: join(tmp, 'media'),
    coversDir: join(tmp, 'media', 'covers'),
    videosDir: join(tmp, 'media', 'videos'),
    imagesDir: join(tmp, 'media', 'images'),
  }
}

async function importUrl({ socialFetcher, paths, url, body = {} }) {
  const store = createLocalStore({ paths })
  const dispatcher = createLocalInspirationDispatcher({
    localStore: store,
    socialFetcher,
    fetcher: mockFetcher,
  })
  const res = await dispatcher.dispatch({
    method: 'POST',
    url: '/omnimux/inspiration/local/import-url',
    body: { url, auto_analyze: false, ...body },
  })
  return { res, store }
}

describe('social import — media and degraded persistence', () => {
  let tmp
  let paths

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omnimux-social-import-'))
    paths = makePaths(tmp)
  })

  after(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('imports an X tweet video from the structured envelope', async () => {
    const { res } = await importUrl({
      socialFetcher: async () => X_VIDEO_ENVELOPE,
      paths,
      url: 'https://x.com/laowangbabababa/status/2098246364895547904',
    })

    assert.equal(res.status, 200)
    const item = res.body.data
    assert.equal(item.type, 'video')
    assert.equal(item.source_platform, 'x')
    assert.ok(item.local_paths.video)
    assert.equal(item.media_urls.length, 1)
    assert.ok(item.cover_url)
    assert.equal(res.body.media_degraded, undefined)
  })

  it('stores a text-only tweet as a link without failing', async () => {
    const { res } = await importUrl({
      socialFetcher: async () => ({ platform: 'x', capability: 'tweet', data: { text: '纯文字推文，没有视频' } }),
      paths,
      url: 'https://x.com/creator/status/111',
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.media_degraded, true)
    assert.ok(res.body.degrade_reason.includes('已按链接类型入库'))
    assert.equal(res.body.data.type, 'link')
    assert.equal(res.body.data.local_paths.video, undefined)
    assert.equal(res.body.data.deconstruction, null)
    assert.equal(res.body.data.content, '纯文字推文，没有视频')
  })

  it('stores a photo-only tweet as an image without failing', async () => {
    const { res } = await importUrl({
      socialFetcher: async () => X_PHOTO_ENVELOPE,
      paths,
      url: 'https://x.com/creator/status/222',
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.media_degraded, true)
    assert.equal(res.body.data.type, 'image')
    assert.ok(res.body.data.cover_url)
  })

  it('downloads the chosen YouTube mp4 when one is usable', async () => {
    const { res } = await importUrl({
      socialFetcher: async () => ({
        platform: 'youtube',
        capability: 'video',
        data: {
          title: 'Hook in 3 seconds',
          thumbnail_url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
          formats: [{ mimeType: 'video/mp4; codecs="avc1"', url: 'https://rr1---sn-x.googlevideo.com/videoplayback?itag=18', height: 360 }],
        },
      }),
      paths,
      url: 'https://www.youtube.com/watch?v=abc12345678',
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.data.type, 'video')
    assert.ok(res.body.data.local_paths.video)
  })

  it('degrades a YouTube signatureCipher-only stream to a link', async () => {
    const { res } = await importUrl({
      socialFetcher: async () => ({
        platform: 'youtube',
        capability: 'video',
        data: {
          title: 'Protected stream',
          thumbnail_url: 'https://i.ytimg.com/vi/prot/hqdefault.jpg',
          formats: [{ mimeType: 'video/mp4', signatureCipher: 's=abc&url=https%3A%2F%2Frr1.googlevideo.com%2Fvideoplayback' }],
        },
      }),
      paths,
      url: 'https://www.youtube.com/watch?v=protected01',
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.media_degraded, true)
    assert.equal(res.body.data.type, 'link')
    assert.equal(res.body.data.title, 'Protected stream')
    assert.equal(res.body.data.local_paths.video, undefined)
  })

  it('degrades an Instagram photo post to a link', async () => {
    const { res } = await importUrl({
      socialFetcher: async () => ({
        platform: 'instagram',
        capability: 'post',
        data: {
          display_url: 'https://scontent.cdninstagram.com/v/t51/photo.jpg',
          caption: { text: '图文帖说明' },
          owner: { username: 'creator', full_name: '创作人' },
        },
      }),
      paths,
      url: 'https://www.instagram.com/p/C1234567890/',
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.media_degraded, true)
    assert.equal(res.body.data.type, 'link')
    assert.equal(res.body.data.author.handle, 'creator')
  })

  it('fails clearly when the platform returned no usable metadata at all', async () => {
    const { res } = await importUrl({
      socialFetcher: async () => ({ platform: 'x', capability: 'tweet', data: {} }),
      paths,
      url: 'https://x.com/creator/status/333',
    })

    assert.equal(res.status, 422)
    assert.ok(res.body.error.includes('未从该链接解析到可入库的内容'))
  })
})

describe('createSocialFetcher — cloud contract and differentiated failures', () => {
  it('accepts a structured envelope without flat video fields (regression)', async () => {
    let calls = 0
    const socialFetcher = createSocialFetcher({
      getTool: () => ({
        async execute(args) {
          calls += 1
          assert.equal(args.capability, 'tweet')
          return X_VIDEO_ENVELOPE
        },
      }),
    })

    const res = await socialFetcher({ platform: 'x', capability: 'tweet', url: 'https://x.com/a/status/1' })

    assert.equal(calls, 1)
    assert.equal(res.data.media.video.length, 1)
  })

  it('skips the cloud call for Facebook and reports an actionable reason', async () => {
    let calls = 0
    const socialFetcher = createSocialFetcher({
      getTool: () => ({ async execute() { calls += 1; return { data: {} } } }),
    })

    await assert.rejects(
      () => socialFetcher({ platform: 'facebook', capability: 'video', url: 'https://www.facebook.com/watch/?v=123456789' }),
      (err) => {
        assert.match(err.message, /Facebook 暂不支持云端解析/)
        assert.match(err.message, /请改用受支持平台（TikTok \/ Instagram \/ YouTube \/ X）的链接导入/)
        // No import path accepts a bare media URL, so the message must not offer one.
        assert.doesNotMatch(err.message, /公开直链/)
        return true
      },
    )
    assert.equal(calls, 0)
  })

  it('skips the cloud call for Threads as well', async () => {
    let calls = 0
    const socialFetcher = createSocialFetcher({
      getTool: () => ({ async execute() { calls += 1; return { data: {} } } }),
    })

    await assert.rejects(
      () => socialFetcher({ platform: 'threads', capability: 'video', url: 'https://www.threads.net/@a/post/xyz' }),
      (err) => {
        assert.match(err.message, /Threads 暂不支持云端解析/)
        assert.match(err.message, /请改用受支持平台（TikTok \/ Instagram \/ YouTube \/ X）的链接导入/)
        assert.doesNotMatch(err.message, /公开直链/)
        return true
      },
    )
    assert.equal(calls, 0)
  })

  it('keeps the backend Chinese platform label aligned with the client locale', () => {
    for (const platform of ['x', 'tiktok', 'instagram', 'youtube', 'facebook', 'threads']) {
      assert.equal(platformDisplayName(platform), zh[`platform.${platform}`])
    }
    assert.equal(platformDisplayName('X'), '推特 (X)')
    assert.equal(platformDisplayName('  threads  '), 'Threads')
    assert.equal(platformDisplayName('somecdn.example'), 'somecdn.example')
    assert.equal(platformDisplayName(''), '')
  })

  it('surfaces the cloud error detail unchanged', async () => {
    const socialFetcher = createSocialFetcher({
      getTool: () => ({
        async execute() {
          const failure = new Error('unsupported social data pair: facebook/video')
          failure.code = 'unsupported-social-data-pair'
          throw failure
        },
      }),
    })

    await assert.rejects(
      () => socialFetcher({ platform: 'x', capability: 'tweet', url: 'https://x.com/a/status/2' }),
      /unsupported social data pair: facebook\/video/,
    )
  })

  it('reports an empty cloud payload as no content', async () => {
    const socialFetcher = createSocialFetcher({
      getTool: () => ({ async execute() { return { platform: 'x', capability: 'tweet', data: {} } } }),
      fallback: async () => null,
    })

    await assert.rejects(
      () => socialFetcher({ platform: 'x', capability: 'tweet', url: 'https://x.com/a/status/3' }),
      /未从该链接解析到内容，请确认链接是公开可访问的帖子\/视频/,
    )
  })

  it('uses the fallback resolver when the cloud payload is empty', async () => {
    const socialFetcher = createSocialFetcher({
      getTool: () => ({ async execute() { return { data: {} } } }),
      fallback: async () => ({ platform: 'youtube', capability: 'video', data: { title: 'oEmbed title' } }),
    })

    const res = await socialFetcher({ platform: 'youtube', capability: 'video', url: 'https://youtu.be/abc' })

    assert.equal(res.data.title, 'oEmbed title')
  })

  it('reports an unrecognized platform and a missing tool distinctly', async () => {
    const unknown = createSocialFetcher({ getTool: () => undefined, fallback: async () => null })
    await assert.rejects(
      () => unknown({ platform: 'unknown', capability: 'video', url: 'https://example.com/post/1' }),
      /未能识别该链接所属平台/,
    )

    const missingTool = createSocialFetcher({ getTool: () => undefined, fallback: async () => null })
    await assert.rejects(
      () => missingTool({ platform: 'tiktok', capability: 'video', url: 'https://www.tiktok.com/@a/video/1' }),
      /未就绪/,
    )
  })
})

describe('social import — Facebook / Threads without a cloud capability', () => {
  let tmp
  let paths

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'omnimux-social-import-fb-'))
    paths = makePaths(tmp)
  })

  after(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('detects Facebook and Threads urls', () => {
    assert.equal(detectPlatformFromUrl('https://www.facebook.com/watch/?v=123456789'), 'facebook')
    assert.equal(detectPlatformFromUrl('https://m.facebook.com/reel/987654321'), 'facebook')
    assert.equal(detectPlatformFromUrl('https://fb.watch/abc123/'), 'facebook')
    assert.equal(detectPlatformFromUrl('https://www.threads.net/@creator/post/xyz'), 'threads')
    assert.equal(detectPlatformFromUrl('https://threads.com/t/xyz'), 'threads')
  })

  it('returns an actionable 502 for a Facebook link without touching the cloud', async () => {
    let calls = 0
    const socialFetcher = createSocialFetcher({
      getTool: () => ({ async execute() { calls += 1; return { data: {} } } }),
    })

    const { res } = await importUrl({
      socialFetcher,
      paths,
      url: 'https://www.facebook.com/watch/?v=123456789',
    })

    assert.equal(res.status, 502)
    assert.match(res.body.error, /Facebook 暂不支持云端解析/)
    assert.match(res.body.error, /TikTok \/ Instagram \/ YouTube \/ X/)
    assert.equal(calls, 0)
  })

  it('returns an actionable 502 for a Threads link without crashing', async () => {
    const socialFetcher = createSocialFetcher({ getTool: () => undefined })

    const { res } = await importUrl({
      socialFetcher,
      paths,
      url: 'https://www.threads.net/@creator/post/xyz',
    })

    assert.equal(res.status, 502)
    assert.match(res.body.error, /Threads 暂不支持云端解析/)
  })
})

describe('fallbackResolveSocial — platforms without a public endpoint', () => {
  it('returns null for Instagram, Facebook and Threads without any network call', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      throw new Error('network access is not allowed in this test')
    }
    try {
      assert.equal(await fallbackResolveSocial({ platform: 'instagram', capability: 'post', url: 'https://www.instagram.com/p/C1/' }), null)
      assert.equal(await fallbackResolveSocial({ platform: 'facebook', capability: 'video', url: 'https://fb.watch/abc123/' }), null)
      assert.equal(await fallbackResolveSocial({ platform: 'threads', capability: 'video', url: 'https://www.threads.net/t/xyz' }), null)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns null for unusable input instead of throwing', async () => {
    assert.equal(await fallbackResolveSocial({ platform: 'tiktok', url: '' }), null)
    assert.equal(await fallbackResolveSocial({ platform: 'tiktok', url: undefined }), null)
  })
})
