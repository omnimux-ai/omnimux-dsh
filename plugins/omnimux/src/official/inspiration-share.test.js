import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OmnimuxError } from '../media/errors.js'
import { createInspirationShareApi, readableShareError, shareMediaType } from './inspiration-share.js'

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
