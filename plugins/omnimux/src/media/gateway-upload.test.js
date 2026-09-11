import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  isLocalMediaSource,
  isRemoteGateway,
  resolveUploadEndpoint,
  determineUploadCategory,
  uploadMediaToGateway,
  hostLocalAssetsIfNeeded,
  clearGatewayUploadCache,
} from './gateway-upload.js'
import { executeOmnimuxVideo } from './video.js'

describe('gateway-upload: detection and configuration', () => {
  it('identifies local media sources correctly', () => {
    assert.equal(isLocalMediaSource('/Users/test/photo.png'), true)
    assert.equal(isLocalMediaSource('C:\\Users\\test\\photo.png'), true)
    assert.equal(isLocalMediaSource('C:/Users/test/photo.png'), true)
    assert.equal(isLocalMediaSource('file:///tmp/sample.mp4'), true)
    assert.equal(isLocalMediaSource('asset://character/hero.png'), true)
    assert.equal(isLocalMediaSource('asset://artifact/123.mp4'), true)
    assert.equal(isLocalMediaSource('data:image/png;base64,iVBORw0KGgo='), true)
    assert.equal(isLocalMediaSource('/api/local-file?path=%2FUsers%2Fx.png'), true)
    assert.equal(isLocalMediaSource('/omnimux-workflow/api/local-file?path=%2FUsers%2Fx.png'), true)
    assert.equal(isLocalMediaSource('http://127.0.0.1:45120/omnimux-workflow/api/local-file?path=%2FUsers%2Fx.png'), true)
    assert.equal(isLocalMediaSource('http://localhost:45120/media/sample.mp4'), true)

    // Public remote URLs are not local
    assert.equal(isLocalMediaSource('https://cdn.example.com/photo.jpg'), false)
    assert.equal(isLocalMediaSource('http://assets.mycompany.org/video.mp4'), false)
    assert.equal(isLocalMediaSource('https://api.omnimux.ai/api/v1/files/download/file_abc123'), false)

    // Empty or non-strings
    assert.equal(isLocalMediaSource(''), false)
    assert.equal(isLocalMediaSource(null), false)
    assert.equal(isLocalMediaSource(undefined), false)
  })

  it('identifies remote gateway vs local development addresses', () => {
    assert.equal(isRemoteGateway('https://api.omnimux.ai/v1'), true)
    assert.equal(isRemoteGateway('https://my-gateway.io/v1'), true)
    assert.equal(isRemoteGateway('http://api.external-cloud.com/v1'), true)

    // Local loopback addresses
    assert.equal(isRemoteGateway('http://127.0.0.1:8000/v1'), false)
    assert.equal(isRemoteGateway('http://localhost:8317/v1'), false)
    assert.equal(isRemoteGateway('http://[::1]:8080/v1'), false)
    assert.equal(isRemoteGateway(''), false)
    assert.equal(isRemoteGateway(undefined), false)
  })

  it('resolves upload endpoint URL correctly', () => {
    assert.equal(resolveUploadEndpoint('https://api.omnimux.ai/v1'), 'https://api.omnimux.ai/v1/files/upload/stream')
    assert.equal(resolveUploadEndpoint('https://api.omnimux.ai/v1/'), 'https://api.omnimux.ai/v1/files/upload/stream')
    assert.equal(resolveUploadEndpoint('https://api.omnimux.ai'), 'https://api.omnimux.ai/v1/files/upload/stream')
  })

  it('determines upload category from MIME type', () => {
    assert.equal(determineUploadCategory('image/png'), 'photos')
    assert.equal(determineUploadCategory('image/jpeg'), 'photos')
    assert.equal(determineUploadCategory('video/mp4'), 'videos')
    assert.equal(determineUploadCategory('video/quicktime'), 'videos')
    assert.equal(determineUploadCategory('audio/mpeg'), 'audios')
    assert.equal(determineUploadCategory('audio/wav'), 'audios')
    assert.equal(determineUploadCategory('application/pdf'), 'files')
  })
})

describe('gateway-upload: upload execution and caching', () => {
  let tmpFile
  const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

  beforeEach(async () => {
    clearGatewayUploadCache()
    tmpFile = join(tmpdir(), `test-asset-${Date.now()}-${Math.random().toString(36).slice(2)}.png`)
    await writeFile(tmpFile, PNG_BYTES)
  })

  it('uploads a local file, sends Authorization and multipart FormData, and caches the result', async () => {
    let fetchCalls = 0
    let lastUrl = ''
    let lastHeaders = {}
    let lastFormData

    const mockFetcher = async (url, init) => {
      fetchCalls += 1
      lastUrl = url
      lastHeaders = init.headers
      lastFormData = init.body
      return new Response(JSON.stringify({
        success: true,
        code: 200,
        msg: '文件上传成功',
        data: {
          file_id: 'file_mock_123',
          file_url: 'https://api.omnimux.ai/api/v1/files/download/file_mock_123',
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    const fileUrl = await uploadMediaToGateway(tmpFile, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test-key-123',
      fetcher: mockFetcher,
    })

    assert.equal(fileUrl, 'https://api.omnimux.ai/api/v1/files/download/file_mock_123')
    assert.equal(fetchCalls, 1)
    assert.equal(lastUrl, 'https://api.omnimux.ai/v1/files/upload/stream')
    assert.equal(lastHeaders.Authorization, 'Bearer sk-test-key-123')
    assert.ok(lastFormData instanceof FormData)
    assert.equal(lastFormData.get('upload_path'), 'photos')

    // Second call should hit cache without network
    const cachedUrl = await uploadMediaToGateway(tmpFile, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test-key-123',
      fetcher: mockFetcher,
    })
    assert.equal(cachedUrl, 'https://api.omnimux.ai/api/v1/files/download/file_mock_123')
    assert.equal(fetchCalls, 1, 'Cache hit must not invoke fetcher a second time')

    await unlink(tmpFile).catch(() => {})
  })

  it('uploads a data URI successfully', async () => {
    let fetchCalls = 0
    const dataUri = `data:image/png;base64,${PNG_BYTES.toString('base64')}`

    const mockFetcher = async () => {
      fetchCalls += 1
      return new Response(JSON.stringify({
        success: true,
        code: 200,
        data: {
          file_id: 'file_data_uri_456',
          file_url: 'https://api.omnimux.ai/api/v1/files/download/file_data_uri_456',
        },
      }), { status: 200 })
    }

    const fileUrl = await uploadMediaToGateway(dataUri, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test-key',
      fetcher: mockFetcher,
    })

    assert.equal(fileUrl, 'https://api.omnimux.ai/api/v1/files/download/file_data_uri_456')
    assert.equal(fetchCalls, 1)
  })

  it('throws typed asset-not-found when local file does not exist', async () => {
    await assert.rejects(
      () => uploadMediaToGateway('/non/existent/path/never_exists.png', {
        baseUrl: 'https://api.omnimux.ai/v1',
        apiKey: 'sk-test',
      }),
      (err) => err?.code === 'asset-not-found',
    )
  })

  it('throws typed upload-failed when gateway returns error status', async () => {
    const mockFetcher = async () => new Response(JSON.stringify({
      code: 400,
      msg: 'Invalid format',
    }), { status: 400 })

    await assert.rejects(
      () => uploadMediaToGateway(tmpFile, {
        baseUrl: 'https://api.omnimux.ai/v1',
        apiKey: 'sk-test',
        fetcher: mockFetcher,
      }),
      (err) => err?.code === 'upload-failed',
    )

    await unlink(tmpFile).catch(() => {})
  })
})

describe('gateway-upload: payload interception (hostLocalAssetsIfNeeded)', () => {
  let tmpImg
  let tmpVid
  const PNG = Buffer.from('iVBORw0KGgoAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

  beforeEach(async () => {
    clearGatewayUploadCache()
    tmpImg = join(tmpdir(), `test-img-${Date.now()}.png`)
    tmpVid = join(tmpdir(), `test-vid-${Date.now()}.mp4`)
    await writeFile(tmpImg, PNG)
    await writeFile(tmpVid, Buffer.from('mock video bytes'))
  })

  it('replaces all local media paths in vendor payload with gateway URLs while preserving remote URLs', async () => {
    const uploadedMap = new Map()

    const mockFetcher = async (url, init) => {
      const fd = init.body
      const path = fd.get('upload_path')
      const id = `file_${path}_${Math.random().toString(36).slice(2, 8)}`
      const resultUrl = `https://api.omnimux.ai/api/v1/files/download/${id}`
      return new Response(JSON.stringify({
        success: true,
        code: 200,
        data: { file_url: resultUrl },
      }), { status: 200 })
    }

    const payload = {
      prompt: 'a cinematic test scene',
      duration: 5,
      aspect_ratio: '16:9',
      image_urls: [
        tmpImg,
        'https://cdn.remote.com/existing_image.jpg',
      ],
      video_urls: [
        tmpVid,
        'https://cdn.remote.com/existing_video.mp4',
      ],
      image_with_roles: [
        { url: tmpImg, role: 'first_frame' },
        { url: 'https://cdn.remote.com/last.png', role: 'last_frame' },
      ],
      image: tmpImg,
      image_tail: 'https://cdn.remote.com/tail.png',
    }

    const hosted = await hostLocalAssetsIfNeeded(payload, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test',
      fetcher: mockFetcher,
    })

    // Assert local image_urls[0] was uploaded
    assert.match(hosted.image_urls[0], /^https:\/\/api\.omnimux\.ai\/api\/v1\/files\/download\/file_photos_/)
    // Assert remote image_urls[1] remained untouched
    assert.equal(hosted.image_urls[1], 'https://cdn.remote.com/existing_image.jpg')

    // Assert local video_urls[0] was uploaded
    assert.match(hosted.video_urls[0], /^https:\/\/api\.omnimux\.ai\/api\/v1\/files\/download\/file_videos_/)
    assert.equal(hosted.video_urls[1], 'https://cdn.remote.com/existing_video.mp4')

    // Assert image_with_roles
    assert.match(hosted.image_with_roles[0].url, /^https:\/\/api\.omnimux\.ai\/api\/v1\/files\/download\/file_photos_/)
    assert.equal(hosted.image_with_roles[0].role, 'first_frame')
    assert.equal(hosted.image_with_roles[1].url, 'https://cdn.remote.com/last.png')

    // Assert single image fields
    assert.match(hosted.image, /^https:\/\/api\.omnimux\.ai\/api\/v1\/files\/download\/file_photos_/)
    assert.equal(hosted.image_tail, 'https://cdn.remote.com/tail.png')

    // Assert prompt & parameters remained untouched
    assert.equal(hosted.prompt, 'a cinematic test scene')
    assert.equal(hosted.duration, 5)
    assert.equal(hosted.aspect_ratio, '16:9')

    await unlink(tmpImg).catch(() => {})
    await unlink(tmpVid).catch(() => {})
  })
})

describe('gateway-upload: end-to-end media integration', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

  it('executeOmnimuxVideo automatically hosts local image when uploadLocalAssets is enabled', async () => {
    clearGatewayUploadCache()
    const tmpImg = join(tmpdir(), `test-e2e-${Date.now()}.png`)
    await writeFile(tmpImg, PNG)

    let uploadedCount = 0
    let runtimeCalledInput = null

    const mockFetcher = async (url, init) => {
      if (url.includes('/files/upload/stream')) {
        uploadedCount += 1
        return new Response(JSON.stringify({
          success: true,
          code: 200,
          data: { file_url: 'https://api.omnimux.ai/api/v1/files/download/file_e2e_photo' },
        }), { status: 200 })
      }
      throw new Error(`Unexpected URL in mockFetcher: ${url}`)
    }

    const mockRuntime = {
      execute: async (call) => {
        runtimeCalledInput = call.input
        return {
          status: 'submitted',
          taskId: 'task-e2e-123',
          outputs: [],
        }
      },
    }

    const result = await executeOmnimuxVideo({
      prompt: 'a running cat',
      dest: join(tmpdir(), `out-${Date.now()}.mp4`),
      model: 'minimax-h3',
      operation: 'first_frame',
      image: tmpImg,
      env: { OMNIMUX_API_KEY: 'sk-test-e2e' },
      fetcher: mockFetcher,
      runtime: mockRuntime,
      uploadLocalAssets: true,
      wait: false,
    })

    assert.equal(result.mode, 'submitted')
    assert.equal(result.taskId, 'task-e2e-123')
    assert.equal(uploadedCount, 1, 'Local image must trigger exactly 1 upload')
    assert.ok(runtimeCalledInput, 'Runtime execute must have been called')
    assert.equal(runtimeCalledInput.image_with_roles[0].url, 'https://api.omnimux.ai/api/v1/files/download/file_e2e_photo')

    await unlink(tmpImg).catch(() => {})
  })
})
