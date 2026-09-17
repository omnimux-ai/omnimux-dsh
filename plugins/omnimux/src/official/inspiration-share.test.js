import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OmnimuxError } from '../media/errors.js'
import { createInspirationShareApi, clampShareColumn, probeMediaReadable, readableShareError, resolveCloudMediaUrl, SHARE_COLUMN_LIMITS, shareMediaType } from './inspiration-share.js'

const PUBLISH_OK = {
  success: true,
  message: '灵感发布成功',
  data: {
    share_id: 'insp_17d391a7eb0b4a82',
    share_url: 'https://omnimux.ai/s/insp_17d391a7eb0b4a82',
    storage_bucket: 'omnimux-files',
    is_admin: false,
    expires_at: '2026-09-18T23:00:00+08:00',
    expires_in: '72h',
  },
}

/** Stub of the official client's gateway-key site lane (publish only). */
function stubClient(opts = {}) {
  /** @type {Array<{ path: string, opts: any }>} */
  const calls = []
  return {
    calls,
    async withSkSite(path, options) {
      calls.push({ path, opts: options })
      if (opts.publishError) throw opts.publishError
      return opts.publish ?? PUBLISH_OK
    },
  }
}

/** Stub of the gateway uploader: records the sources it was handed. */
function stubUploader(opts = {}) {
  /** @type {Array<{ source: string, options: any }>} */
  const uploads = []
  const upload = async (source, options) => {
    uploads.push({ source, options })
    if (opts.error) throw opts.error
    return opts.url ?? `https://files.omnimux.ai/${String(source).split('/').pop()}`
  }
  return { uploads, upload }
}

function api(overrides = {}) {
  const client = overrides.client ?? stubClient()
  const uploader = overrides.uploader ?? stubUploader()
  const share = createInspirationShareApi({
    client,
    siteBaseUrl: 'https://omnimux.ai',
    resolveApiKey: () => 'sk-gateway',
    uploadMedia: uploader.upload,
    statFile: async () => ({ size: 1024 }),
    ...overrides.createOptions,
  })
  return { share, client, uploader }
}

const META = { category: '美妆护肤', title: '测试灵感', prompt: '把产品放在晨光里拍' }

describe('inspiration share api (hub capability)', () => {
  it('uploads cover, then media, then publishes, and reports real stages', async () => {
    const { share, client, uploader } = api()
    const stages = []

    const result = await share.publishLocal({
      cover: { path: '/tmp/covers/c.png', fileName: 'c.png' },
      media: { path: '/tmp/videos/v.mp4', fileName: 'v.mp4' },
      meta: META,
      onStage: (stage) => stages.push(stage),
    })

    assert.deepEqual(stages, ['uploading', 'publishing'])
    assert.deepEqual(uploader.uploads.map((row) => row.source), ['/tmp/covers/c.png', '/tmp/videos/v.mp4'])
    // Both uploads go to the site upload route with the gateway key.
    assert.equal(uploader.uploads[0].options.baseUrl, 'https://omnimux.ai/api')
    assert.equal(uploader.uploads[0].options.apiKey, 'sk-gateway')
    assert.deepEqual(result, {
      shareId: 'insp_17d391a7eb0b4a82',
      shareUrl: 'https://omnimux.ai/s/insp_17d391a7eb0b4a82',
      storageBucket: 'omnimux-files',
      isAdmin: false,
      expiresAt: '2026-09-18T23:00:00+08:00',
      expiresIn: '72h',
    })

    assert.equal(client.calls[0].path, '/api/inspiration/v1/publish')
    assert.equal(client.calls[0].opts.method, 'POST')
    assert.deepEqual(client.calls[0].opts.body, {
      category: '美妆护肤',
      title: '测试灵感',
      prompt: '把产品放在晨光里拍',
      media_type: 'video',
      media_url: 'https://files.omnimux.ai/v.mp4',
      cover_url: 'https://files.omnimux.ai/c.png',
    })
  })

  it('uploads cover and media concurrently in parallel', async () => {
    let activeUploads = 0
    let maxConcurrent = 0
    const uploadMedia = async (source) => {
      activeUploads++
      if (activeUploads > maxConcurrent) maxConcurrent = activeUploads
      await new Promise((r) => setTimeout(r, 20))
      activeUploads--
      return `https://files.omnimux.ai/${String(source).split('/').pop()}`
    }

    const { share } = api({
      createOptions: { uploadMedia },
    })

    const result = await share.publishLocal({
      cover: { path: '/tmp/covers/c.png', fileName: 'c.png' },
      media: { path: '/tmp/videos/v.mp4', fileName: 'v.mp4' },
      meta: META,
    })

    assert.equal(maxConcurrent, 2, 'cover and media uploads must run concurrently')
    assert.equal(result.shareId, 'insp_17d391a7eb0b4a82')
  })

  it('publishes a cover-only item as an image instead of inventing a media url', async () => {
    const { share, client, uploader } = api()

    await share.publishLocal({ cover: { path: '/tmp/covers/c.png' }, meta: META })

    assert.equal(uploader.uploads.length, 1)
    const body = client.calls[0].opts.body
    assert.equal('media_url' in body, false)
    assert.equal(body.cover_url, 'https://files.omnimux.ai/c.png')
    assert.equal(body.media_type, 'image')
    assert.equal(body.title, '测试灵感')
  })

  it('publishes a media-only item without inventing a cover', async () => {
    const { share, client, uploader } = api()

    await share.publishLocal({ media: { path: '/tmp/videos/v.mp4' }, meta: META })

    assert.equal(uploader.uploads.length, 1)
    const body = client.calls[0].opts.body
    assert.equal('cover_url' in body, false)
    assert.equal(body.media_url, 'https://files.omnimux.ai/v.mp4')
    assert.equal(body.media_type, 'video')
  })

  it('keeps media_type inside the two-value upstream contract', () => {
    assert.equal(shareMediaType('image', { path: '/tmp/a.mp4' }), 'image')
    assert.equal(shareMediaType('VIDEO', null), 'video')
    assert.equal(shareMediaType('video/mp4', { path: '/tmp/a.mp4' }), 'video')
    assert.equal(shareMediaType('', { path: '/tmp/a.png' }), 'image')
    assert.equal(shareMediaType(undefined, { path: '/tmp/clip.mov' }), 'video')
  })

  it('refuses to publish without any asset', async () => {
    const { share } = api()
    await assert.rejects(
      () => share.publishLocal({ meta: META }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-share-no-asset',
    )
  })

  it('refuses an empty title or prompt before uploading anything', async () => {
    const { share, uploader } = api()
    await assert.rejects(
      () => share.publishLocal({ media: { path: '/tmp/v.mp4' }, meta: { ...META, title: '  ' } }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-share-no-title',
    )
    await assert.rejects(
      () => share.publishLocal({ media: { path: '/tmp/v.mp4' }, meta: { ...META, prompt: '' } }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-share-no-prompt',
    )
    assert.equal(uploader.uploads.length, 0)
  })

  it('refuses an asset over the 100MB upload limit with the measured size', async () => {
    const { share, uploader } = api({ createOptions: { statFile: async () => ({ size: 120 * 1024 * 1024 }) } })

    await assert.rejects(
      () => share.publishLocal({ media: { path: '/tmp/big.mp4', fileName: 'big.mp4' }, meta: META }),
      (error) => error instanceof OmnimuxError
        && error.code === 'omnimux-share-asset-too-large'
        && /100MB/.test(error.message)
        && /120\.0MB/.test(error.message),
    )
    assert.equal(uploader.uploads.length, 0)
  })

  it('reports a missing local file as a readable reason', async () => {
    const { share } = api({ createOptions: { statFile: async () => { throw new Error('ENOENT') } } })
    await assert.rejects(
      () => share.publishLocal({ media: { path: '/tmp/gone.mp4' }, meta: META }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-share-asset-missing',
    )
  })

  it('names the credential fix when no gateway key is configured', async () => {
    const { share, uploader } = api({ createOptions: { resolveApiKey: () => undefined } })

    await assert.rejects(
      () => share.publishLocal({ media: { path: '/tmp/v.mp4' }, meta: META }),
      (error) => error instanceof OmnimuxError
        && error.code === 'omnimux-unconfigured'
        && /网关密钥/.test(error.message)
        && /OMNIMUX_API_KEY/.test(error.message),
    )
    assert.equal(uploader.uploads.length, 0)
  })

  it('turns the uploader credential error into the same readable reason', async () => {
    const uploader = stubUploader({ error: new OmnimuxError('needs-omnimux', '缺少网关 API 密钥，无法上传素材') })
    const { share } = api({ uploader })

    await assert.rejects(
      () => share.publishLocal({ media: { path: '/tmp/v.mp4' }, meta: META }),
      (error) => error instanceof OmnimuxError
        && error.code === 'omnimux-unconfigured'
        && /网关密钥/.test(error.message),
    )
  })

  it('surfaces an upstream publish failure with its own message', async () => {
    const client = stubClient({ publishError: new OmnimuxError('omnimux-request-failed', '必须包含灵感分类才能发布') })
    const { share } = api({ client })
    await assert.rejects(
      () => share.publishLocal({ media: { path: '/tmp/v.mp4' }, meta: META }),
      (error) => error instanceof OmnimuxError && error.message === '必须包含灵感分类才能发布',
    )
  })

  it('rejects an upload answer that is not a public url and a publish without a link', async () => {
    const { share: noUrlShare } = api({ uploader: stubUploader({ url: '' }) })
    await assert.rejects(
      () => noUrlShare.publishLocal({ media: { path: '/tmp/v.mp4' }, meta: META }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-share-upload-failed',
    )

    const { share: noLinkShare } = api({ client: stubClient({ publish: { data: { is_admin: false } } }) })
    await assert.rejects(
      () => noLinkShare.publishLocal({ media: { path: '/tmp/v.mp4' }, meta: META }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-share-publish-failed',
    )
  })

  it('passes a non-credential error through unchanged', () => {
    const original = new OmnimuxError('omnimux-request-failed', 'boom')
    assert.equal(readableShareError(original), original)
  })
})

describe('inspiration share api — cloud entries (no upload)', () => {
  const COVER = '/api/inspiration/v1/public/media/inspiration-covers/2789'
  const CLIP = '/api/inspiration/v1/public/media/r2/publications/genviral/videos/2789/video.mp4'

  /** Probe stub: answers readable for every address except the ones named dead. */
  function stubProbe(unreadable = []) {
    const probed = []
    return {
      probed,
      probe: async (url) => {
        probed.push(url)
        return !unreadable.includes(url)
      },
    }
  }

  function remoteApi(overrides = {}) {
    const built = api(overrides)
    const probe = overrides.probe ?? stubProbe(overrides.unreadable)
    const share = createInspirationShareApi({
      client: overrides.client ?? built.client,
      siteBaseUrl: 'https://omnimux.ai',
      resolveApiKey: overrides.resolveApiKey ?? (() => 'sk-gateway'),
      uploadMedia: (overrides.uploader ?? built.uploader).upload,
      statFile: async () => ({ size: 1024 }),
      probeMedia: probe.probe,
      ...overrides.createOptions,
    })
    return { ...built, share, probe }
  }

  it('publishes the addresses the cloud already serves, uploading nothing', async () => {
    const { share, client, uploader, probe } = remoteApi()
    const stages = []

    const result = await share.publishRemote({
      coverUrl: COVER,
      mediaUrl: CLIP,
      meta: META,
      onStage: (stage) => stages.push(stage),
    })

    // The whole point of this path: no upload leg, and no `uploading` stage.
    assert.equal(uploader.uploads.length, 0)
    assert.deepEqual(stages, ['publishing'])
    assert.deepEqual(probe.probed, [`https://omnimux.ai${COVER}`, `https://omnimux.ai${CLIP}`])
    assert.deepEqual(client.calls[0].opts.body, {
      category: '美妆护肤',
      title: '测试灵感',
      prompt: '把产品放在晨光里拍',
      media_type: 'video',
      media_url: `https://omnimux.ai${CLIP}`,
      cover_url: `https://omnimux.ai${COVER}`,
    })
    assert.equal(result.shareUrl, 'https://omnimux.ai/s/insp_17d391a7eb0b4a82')
    assert.equal(result.mediaSkipped, '')
  })

  it('keeps the share when only the cover is readable, and says which asset was dropped', async () => {
    const { share, client, uploader } = remoteApi({ unreadable: [`https://omnimux.ai${CLIP}`] })

    const result = await share.publishRemote({ coverUrl: COVER, mediaUrl: CLIP, meta: META })

    assert.equal(uploader.uploads.length, 0)
    assert.equal(result.mediaSkipped, 'video')
    const body = client.calls[0].opts.body
    assert.equal('media_url' in body, false, 'an unreadable address must not reach the publish payload')
    assert.equal(body.cover_url, `https://omnimux.ai${COVER}`)
    assert.equal(body.media_type, 'video', 'the declared type survives even when the asset is dropped')
  })

  it('reports an image entry that could not be served as an image, not a video', async () => {
    const slides = '/api/inspiration/v1/public/media/r2/publications/genviral/slideshows/2789/slide-1.jpg'
    const { share, client } = remoteApi({ unreadable: [`https://omnimux.ai${slides}`] })

    const result = await share.publishRemote({
      coverUrl: COVER,
      mediaUrl: slides,
      meta: { ...META, mediaType: 'image' },
    })

    assert.equal(result.mediaSkipped, 'image')
    assert.equal(client.calls[0].opts.body.media_type, 'image')
    assert.equal('media_url' in client.calls[0].opts.body, false)
  })

  it('refuses to publish when neither asset can be served, and never calls publish', async () => {
    const { share, client } = remoteApi({
      unreadable: [`https://omnimux.ai${COVER}`, `https://omnimux.ai${CLIP}`],
    })

    await assert.rejects(
      () => share.publishRemote({ coverUrl: COVER, mediaUrl: CLIP, meta: META }),
      (error) => error instanceof OmnimuxError
        && error.code === 'omnimux-share-cloud-media-unreachable'
        && /不可访问/.test(error.message),
    )
    assert.equal(client.calls.length, 0)
  })

  it('refuses a page-supplied address that is not an OmniMux cloud media path', async () => {
    const { share, client, uploader } = remoteApi()

    await assert.rejects(
      () => share.publishRemote({ mediaUrl: 'https://attacker.example/x.mp4', meta: META }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-share-no-cloud-asset',
    )
    assert.equal(client.calls.length, 0)
    assert.equal(uploader.uploads.length, 0)
  })

  it('refuses to publish without a gateway key before probing anything', async () => {
    const probe = stubProbe()
    const { share } = remoteApi({ resolveApiKey: () => '', probe })

    await assert.rejects(
      () => share.publishRemote({ coverUrl: COVER, meta: META }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured',
    )
    assert.equal(probe.probed.length, 0)
  })

  it('refuses an empty title or prompt, and a request with no address at all', async () => {
    const { share } = remoteApi()

    await assert.rejects(
      () => share.publishRemote({ coverUrl: COVER, meta: { ...META, title: '' } }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-share-no-title',
    )
    await assert.rejects(
      () => share.publishRemote({ coverUrl: COVER, meta: { ...META, prompt: '' } }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-share-no-prompt',
    )
    await assert.rejects(
      () => share.publishRemote({ meta: META }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-share-no-cloud-asset',
    )
  })

  it('accepts only this site and this media path', () => {
    const base = 'https://omnimux.ai'
    assert.equal(resolveCloudMediaUrl(COVER, base), `https://omnimux.ai${COVER}`)
    assert.equal(resolveCloudMediaUrl(`https://www.omnimux.ai${COVER}`, base), `https://www.omnimux.ai${COVER}`)
    // A look-alike path on someone else's host is not the cloud's own media.
    assert.equal(resolveCloudMediaUrl(`https://attacker.example${COVER}`, base), '')
    // Nor is a different path on the right host.
    assert.equal(resolveCloudMediaUrl('/api/inspiration/v1/media/covers/a.jpg', base), '')
    assert.equal(resolveCloudMediaUrl('https://omnimux.ai/api/inspiration/v1/media/covers/a.jpg', base), '')
    assert.equal(resolveCloudMediaUrl('javascript:alert(1)', base), '')
    assert.equal(resolveCloudMediaUrl('', base), '')
    assert.equal(resolveCloudMediaUrl(COVER, ''), '')
  })

  it('probes with a ranged GET, because the endpoint answers 404 to HEAD', async () => {
    const calls = []
    const fetcher = async (url, options) => {
      calls.push({ url, options })
      return { status: 206, body: { cancel: async () => {} } }
    }

    assert.equal(await probeMediaReadable('https://omnimux.ai/x', { fetcher }), true)
    assert.equal(calls[0].options.method, 'GET')
    assert.equal(calls[0].options.headers.Range, 'bytes=0-0')

    for (const status of [200, 206]) {
      assert.equal(await probeMediaReadable('https://omnimux.ai/x', { fetcher: async () => ({ status }) }), true)
    }
    for (const status of [403, 404, 410, 500]) {
      assert.equal(await probeMediaReadable('https://omnimux.ai/x', { fetcher: async () => ({ status }) }), false)
    }
    assert.equal(await probeMediaReadable('https://omnimux.ai/x', {
      fetcher: async () => { throw new Error('ENOTFOUND') },
    }), false)
    assert.equal(await probeMediaReadable('', { fetcher }), false)
  })

  it('cancels the probe body so an ignored range cannot stream a whole video', async () => {
    let cancelled = false
    const fetcher = async () => ({ status: 200, body: { cancel: async () => { cancelled = true } } })

    assert.equal(await probeMediaReadable('https://omnimux.ai/x', { fetcher }), true)
    assert.equal(cancelled, true)
  })

  it('publishCloud posts to unified share endpoint with source=cloud without uploading', async () => {
    const { share, client, uploader } = remoteApi()
    const stages = []

    const result = await share.publishCloud({
      id: '2789',
      expire: 'forever',
      onStage: (stage) => stages.push(stage),
    })

    assert.equal(uploader.uploads.length, 0)
    assert.deepEqual(stages, ['publishing'])
    assert.equal(client.calls[0].path, '/api/inspiration/v1/share')
    assert.deepEqual(client.calls[0].opts.body, {
      source: 'cloud',
      id: '2789',
      expire: 'forever',
    })
    assert.equal(result.shareId, 'insp_17d391a7eb0b4a82')
  })
})

/*
 * Issue #2121. The cloud stores a share in `inspiration_shares`, where `title` is
 * `varchar(255)` and `category` / `model` are `varchar(128)`. An inspiration
 * imported from a social post often carries the whole post as its title — the
 * library holds titles of 1933 and 709 characters — and sending one unshortened
 * made the gateway refuse the publish with `Data too long for column 'title'`.
 */
describe('share columns stay inside the cloud’s declared widths', () => {
  const LONG_TITLE = `She really woke up and chose GTA-style ${'x'.repeat(2000)}`
  const CLOUD_COVER = '/api/inspiration/v1/public/media/inspiration-covers/2789'

  /** The cloud path, with the readability probe stubbed readable. */
  function cloudApi() {
    return api({ createOptions: { probeMedia: async () => true } })
  }

  it('returns a value that already fits exactly as it is', () => {
    assert.equal(clampShareColumn('测试灵感', SHARE_COLUMN_LIMITS.title), '测试灵感')
    assert.equal(clampShareColumn('', SHARE_COLUMN_LIMITS.title), '')
    assert.equal(clampShareColumn(null, SHARE_COLUMN_LIMITS.title), '')
    assert.equal(clampShareColumn(undefined, SHARE_COLUMN_LIMITS.model), '')
  })

  it('keeps the limit itself, and cuts only what is past it', () => {
    const exact = 'x'.repeat(SHARE_COLUMN_LIMITS.title)
    assert.equal(clampShareColumn(exact, SHARE_COLUMN_LIMITS.title), exact)

    const clamped = clampShareColumn(LONG_TITLE, SHARE_COLUMN_LIMITS.title)
    assert.equal(clamped.length, SHARE_COLUMN_LIMITS.title)
    assert.ok(LONG_TITLE.startsWith(clamped), '截断后必须是原值的逐字前缀')
  })

  it('never leaves half of a surrogate pair at the cut', () => {
    // An emoji straddling the limit: cutting one unit later would emit a lone
    // surrogate, which is not valid text at all.
    const withEmoji = `${'x'.repeat(SHARE_COLUMN_LIMITS.title - 1)}😀tail`
    const clamped = clampShareColumn(withEmoji, SHARE_COLUMN_LIMITS.title)
    const lastCode = clamped.charCodeAt(clamped.length - 1)
    assert.equal(lastCode >= 0xd800 && lastCode <= 0xdbff, false, '不得以半个代理对结尾')
    assert.equal(clamped, 'x'.repeat(SHARE_COLUMN_LIMITS.title - 1))
  })

  it('sends a long local title shortened, so the publish is not lost', async () => {
    const { share, client } = api()

    await share.publishLocal({
      cover: { path: '/tmp/covers/c.png' },
      meta: { ...META, title: LONG_TITLE, category: 'c'.repeat(300), model: 'm'.repeat(300) },
    })

    const body = client.calls[0].opts.body
    assert.equal(body.title.length, SHARE_COLUMN_LIMITS.title)
    assert.ok(LONG_TITLE.startsWith(body.title))
    assert.equal(body.category.length, SHARE_COLUMN_LIMITS.category)
    assert.equal(body.model.length, SHARE_COLUMN_LIMITS.model)
  })

  it('sends a long cloud title shortened too', async () => {
    const { share, client } = cloudApi()

    await share.publishRemote({
      coverUrl: CLOUD_COVER,
      meta: { ...META, title: LONG_TITLE, mediaType: 'video' },
    })

    const body = client.calls[0].opts.body
    assert.equal(body.title.length, SHARE_COLUMN_LIMITS.title)
    assert.ok(LONG_TITLE.startsWith(body.title))
  })

  it('leaves a normal title untouched on both paths', async () => {
    const local = api()
    await local.share.publishLocal({ cover: { path: '/tmp/covers/c.png' }, meta: META })
    assert.equal(local.client.calls[0].opts.body.title, META.title)
    assert.equal(local.client.calls[0].opts.body.category, META.category)

    const cloud = cloudApi()
    await cloud.share.publishRemote({ coverUrl: CLOUD_COVER, meta: { ...META, mediaType: 'video' } })
    assert.equal(cloud.client.calls[0].opts.body.title, META.title)
  })
})
