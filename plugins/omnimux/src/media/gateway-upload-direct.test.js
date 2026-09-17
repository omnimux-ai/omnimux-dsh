import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  resolvePresignEndpoint,
  resolveConfirmEndpoint,
  uploadMediaToGateway,
  resolveMediaDescriptor,
  clearGatewayUploadCache,
} from './gateway-upload.js'

const PNG = Buffer.from('iVBORw0KGgoAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

function directTicket(overrides = {}) {
  return jsonResponse({
    success: true,
    code: 200,
    data: {
      file_id: 'file_direct',
      upload_url: 'https://bucket.r2.example/photos/file_direct_clip.png',
      upload_method: 'PUT',
      upload_headers: { 'Content-Type': 'image/png' },
      resource_url: 'https://cdn.example/photos/file_direct_clip.png',
      expires_at: new Date(Date.now() + 900_000).toISOString(),
      ...overrides,
    },
  })
}

function confirmedFile(fileUrl = 'https://cdn.example/photos/file_direct_clip.png') {
  return jsonResponse({
    success: true,
    code: 200,
    data: {
      file_id: 'file_direct',
      file_url: fileUrl,
      expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
    },
  })
}

describe('gateway-upload: direct upload route resolution', () => {
  it('derives the ticket routes from the same base as the relay route', () => {
    assert.equal(resolvePresignEndpoint('https://api.omnimux.ai/v1'), 'https://api.omnimux.ai/v1/files/upload/presign')
    assert.equal(resolvePresignEndpoint('https://api.omnimux.ai'), 'https://api.omnimux.ai/v1/files/upload/presign')
    assert.equal(resolveConfirmEndpoint('https://api.omnimux.ai/v1/'), 'https://api.omnimux.ai/v1/files/upload/confirm')
    assert.equal(resolveConfirmEndpoint(''), '/v1/files/upload/confirm')
  })
})

describe('gateway-upload: direct upload with relay fallback', () => {
  let tmpFile
  let fileSeq = 0

  beforeEach(async () => {
    clearGatewayUploadCache()
    fileSeq += 1
    tmpFile = join(tmpdir(), `test-direct-${Date.now()}-${fileSeq}.png`)
    await writeFile(tmpFile, PNG)
  })

  it('sends the bytes straight to storage and never touches the relay route', async () => {
    const calls = []
    const fetcher = async (url, init) => {
      calls.push({ url, method: init?.method })
      if (url.endsWith('/files/upload/presign')) return directTicket()
      if (url === 'https://bucket.r2.example/photos/file_direct_clip.png') return new Response('', { status: 200 })
      if (url.endsWith('/files/upload/confirm')) return confirmedFile()
      throw new Error(`unexpected call: ${url}`)
    }

    const fileUrl = await uploadMediaToGateway(tmpFile, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test',
      fetcher,
    })

    assert.equal(fileUrl, 'https://cdn.example/photos/file_direct_clip.png')
    assert.deepEqual(calls.map((call) => call.method), ['POST', 'PUT', 'POST'])
    assert.ok(calls[1].url.startsWith('https://bucket.r2.example/'), 'the PUT must go to storage, not the gateway')
    assert.equal(
      calls.some((call) => call.url.endsWith('/upload/stream')),
      false,
      'the relay route must not carry the bytes',
    )
    await unlink(tmpFile).catch(() => {})
  })

  it('falls back to the relay route when the deployment cannot issue tickets, and stops probing', async () => {
    const calls = []
    const fetcher = async (url) => {
      calls.push(url)
      if (url.endsWith('/files/upload/presign')) {
        return jsonResponse({ success: false, code: 501, msg: '当前存储后端不支持直传' }, 501)
      }
      if (url.endsWith('/files/upload/stream')) {
        return jsonResponse({ success: true, code: 200, data: { file_url: 'https://cdn.example/relayed.png' } })
      }
      throw new Error(`unexpected call: ${url}`)
    }

    const first = await uploadMediaToGateway(tmpFile, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test',
      fetcher,
    })
    assert.equal(first, 'https://cdn.example/relayed.png')
    assert.equal(calls.filter((url) => url.endsWith('/files/upload/presign')).length, 1)

    fileSeq += 1
    const secondFile = join(tmpdir(), `test-direct-${Date.now()}-${fileSeq}.png`)
    await writeFile(secondFile, PNG)
    const second = await uploadMediaToGateway(secondFile, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test',
      fetcher,
    })
    assert.equal(second, 'https://cdn.example/relayed.png')
    assert.equal(
      calls.filter((url) => url.endsWith('/files/upload/presign')).length,
      1,
      'a deployment without tickets is remembered instead of probed again',
    )
    await unlink(tmpFile).catch(() => {})
    await unlink(secondFile).catch(() => {})
  })

  it('falls back to the relay route when the storage PUT is rejected', async () => {
    const fetcher = async (url) => {
      if (url.endsWith('/files/upload/presign')) return directTicket({ upload_url: 'https://bucket.r2.example/rejected' })
      if (url === 'https://bucket.r2.example/rejected') return new Response('', { status: 403 })
      if (url.endsWith('/files/upload/stream')) {
        return jsonResponse({ success: true, code: 200, data: { file_url: 'https://cdn.example/relayed.png' } })
      }
      throw new Error(`unexpected call: ${url}`)
    }

    const fileUrl = await uploadMediaToGateway(tmpFile, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test',
      fetcher,
    })
    assert.equal(fileUrl, 'https://cdn.example/relayed.png')
    await unlink(tmpFile).catch(() => {})
  })

  it('falls back to the relay route when the gateway rejects the confirmation', async () => {
    const fetcher = async (url) => {
      if (url.endsWith('/files/upload/presign')) return directTicket({ upload_url: 'https://bucket.r2.example/unconfirmed' })
      if (url === 'https://bucket.r2.example/unconfirmed') return new Response('', { status: 200 })
      if (url.endsWith('/files/upload/confirm')) {
        return jsonResponse({ success: false, code: 409, msg: '未检测到已上传的文件' }, 409)
      }
      if (url.endsWith('/files/upload/stream')) {
        return jsonResponse({ success: true, code: 200, data: { file_url: 'https://cdn.example/relayed.png' } })
      }
      throw new Error(`unexpected call: ${url}`)
    }

    const fileUrl = await uploadMediaToGateway(tmpFile, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test',
      fetcher,
    })
    assert.equal(fileUrl, 'https://cdn.example/relayed.png')
    await unlink(tmpFile).catch(() => {})
  })

  it('temporary PUT failure falls back to relay without permanently blacklisting direct upload', async () => {
    let presignCalls = 0
    const fetcher = async (url) => {
      if (url.endsWith('/files/upload/presign')) {
        presignCalls++
        return directTicket({ upload_url: 'https://bucket.r2.example/temp-put-fail' })
      }
      if (url === 'https://bucket.r2.example/temp-put-fail') return new Response('', { status: 500 })
      if (url.endsWith('/files/upload/stream')) {
        return jsonResponse({ success: true, code: 200, data: { file_url: 'https://cdn.example/relayed-put-fail.png' } })
      }
      throw new Error(`unexpected call: ${url}`)
    }

    const first = await uploadMediaToGateway(tmpFile, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test',
      fetcher,
    })
    assert.equal(first, 'https://cdn.example/relayed-put-fail.png')
    assert.equal(presignCalls, 1)

    // Next file upload to the same baseUrl must still attempt direct upload
    fileSeq += 1
    const nextFile = join(tmpdir(), `test-direct-next-${Date.now()}-${fileSeq}.png`)
    await writeFile(nextFile, PNG)
    const second = await uploadMediaToGateway(nextFile, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test',
      fetcher,
    })
    assert.equal(second, 'https://cdn.example/relayed-put-fail.png')
    assert.equal(presignCalls, 2, 'direct upload should still be probed after transient PUT error')
    await unlink(tmpFile).catch(() => {})
    await unlink(nextFile).catch(() => {})
  })

  it('temporary confirm failure falls back to relay without permanently blacklisting direct upload', async () => {
    let presignCalls = 0
    const fetcher = async (url) => {
      if (url.endsWith('/files/upload/presign')) {
        presignCalls++
        return directTicket({ upload_url: 'https://bucket.r2.example/temp-confirm-fail' })
      }
      if (url === 'https://bucket.r2.example/temp-confirm-fail') return new Response('', { status: 200 })
      if (url.endsWith('/files/upload/confirm')) {
        return jsonResponse({ success: false, code: 500, msg: '临时内部错误' }, 500)
      }
      if (url.endsWith('/files/upload/stream')) {
        return jsonResponse({ success: true, code: 200, data: { file_url: 'https://cdn.example/relayed-confirm-fail.png' } })
      }
      throw new Error(`unexpected call: ${url}`)
    }

    const first = await uploadMediaToGateway(tmpFile, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test',
      fetcher,
    })
    assert.equal(first, 'https://cdn.example/relayed-confirm-fail.png')
    assert.equal(presignCalls, 1)

    // Next file upload to the same baseUrl must still attempt direct upload
    fileSeq += 1
    const nextFile = join(tmpdir(), `test-direct-next-conf-${Date.now()}-${fileSeq}.png`)
    await writeFile(nextFile, PNG)
    const second = await uploadMediaToGateway(nextFile, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test',
      fetcher,
    })
    assert.equal(second, 'https://cdn.example/relayed-confirm-fail.png')
    assert.equal(presignCalls, 2, 'direct upload should still be probed after transient confirm error')
    await unlink(tmpFile).catch(() => {})
    await unlink(nextFile).catch(() => {})
  })

  it('streams physical file body with duplex: half without pre-buffering', async () => {
    let streamPutVerified = false
    const fetcher = async (url, init) => {
      if (url.endsWith('/files/upload/presign')) return directTicket()
      if (url === 'https://bucket.r2.example/photos/file_direct_clip.png') {
        assert.equal(init?.method, 'PUT')
        assert.equal(init?.duplex, 'half', 'streaming uploads must declare duplex: half')
        assert.ok(init?.body, 'PUT request must contain a body')
        assert.equal(typeof init.body.getReader, 'function', 'body must be a readable stream')
        assert.equal(init.headers['Content-Length'], String(PNG.length))
        streamPutVerified = true
        return new Response('', { status: 200 })
      }
      if (url.endsWith('/files/upload/confirm')) return confirmedFile()
      throw new Error(`unexpected call: ${url}`)
    }

    const fileUrl = await uploadMediaToGateway(tmpFile, {
      baseUrl: 'https://api.omnimux.ai/v1',
      apiKey: 'sk-test',
      fetcher,
    })

    assert.equal(fileUrl, 'https://cdn.example/photos/file_direct_clip.png')
    assert.equal(streamPutVerified, true, 'the PUT request was streamed directly to storage')
    await unlink(tmpFile).catch(() => {})
  })
})

describe('gateway-upload: lazy media descriptor', () => {
  it('extracts metadata and creates stream without reading full file body', async () => {
    const file = join(tmpdir(), `test-desc-${Date.now()}.png`)
    await writeFile(file, PNG)
    const desc = await resolveMediaDescriptor(file)
    assert.equal(desc.kind, 'file')
    assert.equal(desc.size, PNG.length)
    assert.equal(desc.mimeType, 'image/png')
    assert.equal(typeof desc.createStream, 'function')
    const reader = desc.createStream().getReader()
    const { value } = await reader.read()
    assert.ok(value && value.length > 0)
    await unlink(file).catch(() => {})
  })
})
