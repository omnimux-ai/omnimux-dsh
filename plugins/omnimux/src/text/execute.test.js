import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { apply } from '../index.js'
import { OmnimuxError } from '../media/errors.js'
import { decodeDataUri, mediaFromMagic } from './image.js'
import { executeOmnimuxText } from './execute.js'
import { completeTextViaChat } from './chat.js'
import { loadTextVideo, toVideoImageUrlPart } from './video.js'

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
])
const MP4 = Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3])

function pngFile() {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-text-'))
  const dest = join(dir, 'shot.png')
  writeFileSync(dest, PNG)
  return { dir, dest }
}

function collectStream(seen) {
  return {
    async * stream(options) {
      seen.push(options)
      yield { type: 'text-delta', index: 0, text: 'a cat' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
}

describe('textComplete execute', () => {
  it('refuses an empty prompt', async () => {
    await assert.rejects(
      () => executeOmnimuxText({ prompt: '  ', llm: collectStream([]) }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
  })

  it('throws needs-provider without llm', async () => {
    await assert.rejects(
      () => executeOmnimuxText({ prompt: 'hello', model: 'gemini-3.8-flash' }),
      (error) => error instanceof OmnimuxError && error.code === 'needs-provider',
    )
  })

  it('streams a named model without tools or parent messages', async () => {
    const seen = []
    const result = await executeOmnimuxText({
      prompt: 'summarize this contract',
      model: 'gemini-3.8-flash',
      system: 'return one sentence',
      llm: collectStream(seen),
    })
    assert.deepEqual(result, { mode: 'live', model: 'gemini-3.8-flash', text: 'a cat' })
    assert.equal(seen.length, 1)
    assert.equal(seen[0].provider, 'omnimux')
    assert.equal(seen[0].model, 'gemini-3.8-flash')
    assert.equal(seen[0].system, 'return one sentence')
    assert.equal(seen[0].maxTokens, 4096)
    assert.equal('tools' in seen[0], false)
    assert.equal(seen[0].messages.length, 1)
    assert.equal(seen[0].messages[0].role, 'user')
    assert.deepEqual(seen[0].messages[0].content, [{ type: 'text', text: 'summarize this contract' }])
  })

  it('attaches a local image only on the one-shot request', async () => {
    const { dir, dest } = pngFile()
    const seen = []
    const saved = []
    try {
      const result = await executeOmnimuxText({
        prompt: 'what is in this frame',
        image: dest,
        llm: collectStream(seen),
        attachments: {
          async saveImage(input) {
            saved.push(input)
            await Promise.resolve()
            return { attachmentId: 'att-1', mediaType: input.mediaType, bytes: input.data.byteLength, width: 1, height: 1 }
          },
        },
      })
      assert.equal(result.model, 'gemini-3.8-flash')
      assert.equal(saved.length, 1)
      assert.equal(saved[0].mediaType, 'image/png')
      assert.equal(seen[0].messages[0].content[1].type, 'image')
      assert.equal(seen[0].messages[0].content[1].attachment.attachmentId, 'att-1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws needs-provider when an image is set without attachments', async () => {
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'describe',
        image: 'data:image/png;base64,iVBORw0KGgo=',
        llm: collectStream([]),
      }),
      (error) => error instanceof OmnimuxError && error.code === 'needs-provider',
    )
  })

  it('maps a stream error finish to omnimux-failed', async () => {
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'hello',
        model: 'gemini-3.8-flash',
        llm: {
          async * stream() {
            yield { type: 'finish', reason: { kind: 'error', failure: { message: 'gateway 500' } } }
          },
        },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-failed' && /gateway 500/.test(error.message),
    )
  })

  it('ignores caller bypassSubmitGuard and rejects an incompatible operation before llm.stream', async () => {
    let streamCalls = 0
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'describe',
        model: 'gemini-3.8-flash',
        operation: 'digital_human',
        bypassSubmitGuard: true,
        llm: {
          async * stream() {
            streamCalls += 1
            yield { type: 'text-delta', text: 'must not run' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    assert.equal(streamCalls, 0)
  })

  it('uses probed image metadata and rejects an oversized image before saving or streaming', async () => {
    const bytes = Buffer.alloc(20 * 1024 * 1024 + 1)
    bytes.set(PNG)
    let saved = 0
    let streamCalls = 0
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'describe',
        image: 'https://example.com/oversized.png',
        assetMeta: { 'https://example.com/oversized.png': { mime: 'image/png', sizeBytes: 1 } },
        attachments: {
          imageLimits: { maxImageBytes: 25 * 1024 * 1024 },
          async saveImage() { saved += 1 },
        },
        fetcher: async () => ({
          ok: true,
          headers: { get: () => 'image/png' },
          body: new Response(bytes).body,
        }),
        llm: {
          async * stream() {
            streamCalls += 1
            yield { type: 'text-delta', text: 'must not run' }
          },
        },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    assert.equal(saved, 0)
    assert.equal(streamCalls, 0)
  })

  it('decodes a data URI and reads PNG magic', () => {
    const decoded = decodeDataUri(`data:image/png;base64,${Buffer.from(PNG).toString('base64')}`)
    assert.equal(decoded.mediaType, 'image/png')
    assert.equal(mediaFromMagic(decoded.data), 'image/png')
  })

  it('rejects image and video together', async () => {
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'describe',
        image: 'data:image/png;base64,iVBORw0KGgo=',
        video: `data:video/mp4;base64,${MP4.toString('base64')}`,
        llm: collectStream([]),
      }),
      (error) => error instanceof OmnimuxError
        && error.code === 'omnimux-invalid-request'
        && /image or video/.test(error.message),
    )
  })

  it('rejects video on an unlisted text model before any provider call', async () => {
    // 2026-10-21 #3527：grok-4.6 等仅存于契约、不在路由声明里；
    // 视频请求对它们必须在模态校验之前就以 unknown-model 拒绝。
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'describe',
        model: 'grok-4.6',
        video: `data:video/mp4;base64,${MP4.toString('base64')}`,
        env: { OMNIMUX_API_KEY: 'sk-test' },
        fetcher: async () => ({ ok: true, json: async () => ({}) }),
      }),
      (error) => error instanceof OmnimuxError
        && error.code === 'unknown-model'
        && /not on the enabled text whitelist/.test(error.message),
    )
  })

  it('bypasses llm.stream for video and packs image_url(data:video)', async () => {
    const seen = []
    const tiny = Buffer.from('ftypisomfake', 'utf8')
    const dataUri = `data:video/mp4;base64,${tiny.toString('base64')}`
    const result = await executeOmnimuxText({
      prompt: 'what motion is in this clip',
      video: dataUri,
      env: { OMNIMUX_API_KEY: 'sk-test', OMNIMUX_BASE_URL: 'https://api.example/v1' },
      fetcher: async (url, init) => {
        seen.push({ url, body: JSON.parse(String(init.body)) })
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'BG=red; SQUARE=YES_WHITE_SQUARE' } }],
          }),
        }
      },
    })
    assert.deepEqual(result, {
      mode: 'live',
      model: 'gemini-3.8-flash',
      text: 'BG=red; SQUARE=YES_WHITE_SQUARE',
    })
    assert.equal(seen.length, 1)
    assert.equal(seen[0].url, 'https://api.example/v1/chat/completions')
    assert.equal(seen[0].body.model, 'gemini-3.8-flash')
    const parts = seen[0].body.messages[0].content
    assert.equal(parts[0].type, 'text')
    assert.equal(parts[1].type, 'image_url')
    assert.match(parts[1].image_url.url, /^data:video\/mp4;base64,/)
    assert.equal(parts[1].type === 'video_url', false)
  })

  it('guards video MIME from loaded bytes before the chat HTTP request', async () => {
    let vendorCalls = 0
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'describe',
        video: `data:video/webm;base64,${WEBM.toString('base64')}`,
        assetMeta: Object.fromEntries([[`data:video/webm;base64,${WEBM.toString('base64')}`, { mime: 'video/mp4', sizeBytes: 1 }]]),
        env: { OMNIMUX_API_KEY: 'sk-test' },
        fetcher: async () => {
          vendorCalls += 1
          return { ok: true, status: 200, json: async () => ({}) }
        },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    assert.equal(vendorCalls, 0)
  })

  it('throws official-credential-required when video lacks an execution key', async () => {
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'describe',
        video: `data:video/mp4;base64,${MP4.toString('base64')}`,
        env: {},
        fetcher: async () => ({ ok: true, json: async () => ({}) }),
      }),
      (error) => error instanceof OmnimuxError && error.code === 'official-credential-required',
    )
  })

  it('packs loadTextVideo into image_url only', async () => {
    const packed = await loadTextVideo(`data:video/webm;base64,${WEBM.toString('base64')}`)
    const part = toVideoImageUrlPart(packed)
    assert.equal(part.type, 'image_url')
    assert.match(part.image_url.url, /^data:video\/webm;base64,/)
  })

  it('rejects video completion when hub credentials are absent even if CPA is configured', async () => {
    let called = 0
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'describe video',
        video: `data:video/mp4;base64,${MP4.toString('base64')}`,
        model: 'gemini-3.8-flash',
        env: {},
        settings: {
          get(key) {
            if (key === 'llm-pi-ai') {
              return {
                providers: {
                  cpa: {
                    api: 'openai-completions',
                    baseURL: 'http://127.0.0.1:8317/v1',
                    apiKeyEnv: 'CPA_API_KEY',
                    models: [{ id: 'gemini-3.8-flash-high' }],
                  },
                },
              }
            }
            return undefined
          },
        },
        credentials: {
          async resolve(ref) {
            if (ref === 'CPA_API_KEY') return { value: 'cpa-secret-token' }
            return undefined
          },
        },
        fetcher: async () => {
          called += 1
          return { ok: true, status: 200, json: async () => ({}) }
        },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'official-credential-required',
    )
    assert.equal(called, 0, 'must not call any provider without hub credentials')
  })

  it('uses hub key and default hub base when OMNIMUX_API_KEY is present', async () => {
    let capturedAuth = ''
    let capturedUrl = ''
    let capturedBody = null
    const fetcher = async (url, init) => {
      capturedUrl = String(url)
      capturedAuth = init?.headers?.authorization || init?.headers?.Authorization || ''
      capturedBody = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'hub completion' } }] }),
      }
    }
    const result = await executeOmnimuxText({
      prompt: 'describe video',
      video: `data:video/mp4;base64,${MP4.toString('base64')}`,
      model: 'gemini-3.8-flash',
      env: {},
      settings: {
        get(key) {
          if (key === 'llm-pi-ai') {
            return {
              providers: {
                cpa: {
                  api: 'openai-completions',
                  baseURL: 'http://127.0.0.1:8317/v1',
                  apiKeyEnv: 'CPA_API_KEY',
                  models: [{ id: 'gemini-3.8-flash-high' }],
                },
                omnimux: {
                  api: 'openai-completions',
                  baseURL: 'https://api.omnimux.ai/v1',
                  apiKeyEnv: 'OMNIMUX_API_KEY',
                  models: [{ id: 'gemini-3.8-flash' }],
                },
              },
            }
          }
          return undefined
        },
      },
      credentials: {
        async resolve(ref) {
          if (ref === 'OMNIMUX_API_KEY') return { value: 'sk-external-omnimux-key' }
          if (ref === 'CPA_API_KEY') return { value: 'sk-cpa-local-secret' }
          return undefined
        },
      },
      fetcher,
    })
    assert.equal(capturedUrl, 'https://api.omnimux.ai/v1/chat/completions')
    assert.equal(capturedAuth, 'Bearer sk-external-omnimux-key')
    assert.equal(capturedBody.model, 'gemini-3.8-flash')
    assert.equal(result.text, 'hub completion')
  })
})

describe('omnimux_text_complete tool', () => {
  it('registers and forwards onto textComplete', async () => {
    const tools = {}
    const provided = {}
    const seen = []
    const requests = []
    apply({
      tools: { register(tool) { Object.assign(tools, Object.fromEntries([[tool.name, tool]])) } },
      provide(name, value) { Object.assign(provided, Object.fromEntries([[name, value]])) },
      get(name) {
        if (name === 'llm') return collectStream(seen)
        if (name === 'credentials') return { resolve: async (ref) => ref === 'OMNIMUX_API_KEY' ? { value: 'sk-tool-fixture' } : undefined }
        return undefined
      },
    })
    assert.equal(typeof provided.textComplete.execute, 'function')
    assert.ok(tools.omnimux_text_complete)
    // 2026-10-21 #3527：tool enum 只暴露路由声明里的现役文本型号。
    assert.deepEqual(tools.omnimux_text_complete.parameters.properties.model.enum, ['gemini-3.8-flash'])
    assert.equal(tools.omnimux_text_complete.parameters.properties.model.enum.includes('claude-haiku-4-5'), false)
    assert.match(tools.omnimux_text_complete.description, /whitelist/)
    assert.ok(tools.omnimux_text_complete.parameters.properties.video)
    assert.match(tools.omnimux_text_complete.description, /image_url\(data:video\)/)
    const previousFetch = globalThis.fetch
    globalThis.fetch = async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) })
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'fixture completion' } }] }) }
    }
    try {
      const result = await tools.omnimux_text_complete.execute({
        model: 'gemini-3.8-flash',
        prompt: 'one line',
        reason: 'user asked for Gemini wording',
      }, { signal: undefined })
      assert.equal(result.model, 'gemini-3.8-flash')
      assert.equal(requests.length, 1)
      assert.equal(requests[0].url, 'https://api.omnimux.ai/v1/chat/completions')
      assert.equal(requests[0].body.model, 'gemini-3.8-flash')
      assert.match(JSON.stringify(requests[0].body.messages), /one line/)
      assert.equal(seen.length, 0)
    } finally { globalThis.fetch = previousFetch }
  })

  it('hides a disabled whitelist model from the tool enum', () => {
    const tools = {}
    apply({
      tools: { register(tool) { Object.assign(tools, Object.fromEntries([[tool.name, tool]])) } },
      provide() {},
      get() { return undefined },
    }, { text: { models: [{ id: 'gemini-3.8-flash', enabled: false }] } })
    // 2026-10-21 #3527：唯一现役文本型号被禁用后，tool schema 不再提供 enum
    // （空枚举会被省略，而不是把禁用型号暴露给模型）。
    assert.equal(tools.omnimux_text_complete.parameters.properties.model.enum, undefined)
  })

  it('rejects a missing reason at the tool', async () => {
    const tools = {}
    apply({
      tools: { register(tool) { Object.assign(tools, Object.fromEntries([[tool.name, tool]])) } },
      provide() {},
      get() { return { stream: async function* () {} } },
    })
    await assert.rejects(
      () => tools.omnimux_text_complete.execute({ model: 'gemini-3.8-flash', prompt: 'hi' }, {}),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
  })

  it('completeTextViaChat uses hub only and ignores CPA settings when hub key exists', async () => {
    let capturedRequest = null
    const fakeFetcher = async (url, opts) => {
      capturedRequest = { url, opts, body: JSON.parse(opts.body) }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'hub completion result' } }]
        })
      }
    }
    const res = await completeTextViaChat({
      prompt: 'test prompt',
      model: 'gemini-3.8-flash',
      maxTokens: 128,
      env: {},
      mediaParts: [{ type: 'image_url', image_url: { url: 'data:video/mp4;base64,AAAAHGZ0eXBpc29t' } }],
      settings: {
        get: (section) => {
          if (section === 'llm-pi-ai') {
            return {
              providers: {
                omnimux: {
                  baseURL: 'https://api.omnimux.ai/v1',
                  apiKeyEnv: 'OMNIMUX_API_KEY',
                  models: [{ id: 'gemini-3.8-flash' }],
                },
                cpa: {
                  baseURL: 'http://127.0.0.1:8317/v1',
                  apiKeyEnv: 'CPA_API_KEY',
                  models: [{ id: 'gemini-3.8-flash-high' }],
                },
              },
            }
          }
          return undefined
        },
      },
      credentials: {
        resolve: async (ref) => {
          if (ref === 'OMNIMUX_API_KEY') return { value: 'sk-hub-test' }
          if (ref === 'CPA_API_KEY') return { value: 'sk-cpa-test' }
          return undefined
        },
      },
      fetcher: fakeFetcher,
    })
    assert.equal(res.text, 'hub completion result')
    assert.ok(String(capturedRequest.url).startsWith('https://api.omnimux.ai/v1'))
    assert.equal(capturedRequest.opts.headers.authorization, 'Bearer sk-hub-test')
    assert.equal(capturedRequest.body.model, 'gemini-3.8-flash')
  })

  it('completeTextViaChat does not fall back to CPA when hub credentials are absent', async () => {
    let called = 0
    await assert.rejects(
      () => completeTextViaChat({
        prompt: 'test prompt',
        model: 'gemini-3.8-flash',
        maxTokens: 128,
        mediaParts: [{ type: 'image_url', image_url: { url: 'data:video/mp4;base64,AAAAHGZ0eXBpc29t' } }],
        env: {},
        settings: {
          get: (section) => {
            if (section === 'llm-pi-ai') {
              return {
                providers: {
                  cpa: {
                    baseURL: 'http://127.0.0.1:8317/v1',
                    apiKeyEnv: 'CPA_API_KEY',
                    models: [{ id: 'gemini-3.8-flash-high' }],
                  },
                },
              }
            }
            return undefined
          },
        },
        credentials: {
          resolve: async (ref) => ref === 'CPA_API_KEY' ? { value: 'sk-cpa-test' } : undefined,
        },
        fetcher: async () => {
          called += 1
          return { ok: true, status: 200, json: async () => ({}) }
        },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'official-credential-required',
    )
    assert.equal(called, 0)
  })

  it('sends a routed text request through the direct chat path with the group attached', async () => {
    let streamCalls = 0
    const requests = []
    const result = await executeOmnimuxText({
      prompt: 'hello',
      model: 'gemini-3.8-flash',
      // #3516：`cheap` 分组已退场；用现役 standard 分组验证 routed 路径。
      allowedGroups: ['standard'],
      strategy: 'cost_first',
      env: { OMNIMUX_API_KEY: 'sk-test', OMNIMUX_BASE_URL: 'https://gateway.test/v1' },
      fetcher: async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) })
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'routed reply' } }] }) }
      },
      // ctx.llm.stream resolves a declared model id, so it must not be used.
      llm: {
        async * stream() {
          streamCalls += 1
          yield { type: 'text-delta', text: 'must not run' }
        },
      },
    })

    assert.equal(streamCalls, 0)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].body.model, 'gemini-3.8-flash@default')
    assert.equal(result.text, 'routed reply')
    assert.equal(result.model, 'gemini-3.8-flash')
  })

  it('keeps an unrouted text request on llm.stream with the bare model id', async () => {
    let fetcherCalls = 0
    const seen = []
    const result = await executeOmnimuxText({
      prompt: 'hello',
      model: 'gemini-3.8-flash',
      env: { OMNIMUX_API_KEY: 'sk-test', OMNIMUX_BASE_URL: 'https://gateway.test/v1' },
      fetcher: async () => {
        fetcherCalls += 1
        return { ok: true, status: 200, json: async () => ({ choices: [] }) }
      },
      llm: collectStream(seen),
    })

    assert.equal(fetcherCalls, 0)
    assert.equal(seen.length, 1)
    assert.equal(seen[0].model, 'gemini-3.8-flash')
    assert.equal(seen[0].provider, 'omnimux')
    assert.equal(result.text, 'a cat')
  })

  it('carries routed image input as a data URL part instead of falling back to the stream', async () => {
    let streamCalls = 0
    const requests = []
    const result = await executeOmnimuxText({
      prompt: 'describe',
      model: 'gemini-3.8-flash',
      allowedGroups: ['standard'],
      image: `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`,
      attachments: { saveImage: async () => ({ id: 'unused' }) },
      env: { OMNIMUX_API_KEY: 'sk-test', OMNIMUX_BASE_URL: 'https://gateway.test/v1' },
      fetcher: async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) })
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'a small png' } }] }) }
      },
      llm: {
        async * stream() {
          streamCalls += 1
          yield { type: 'text-delta', text: 'must not run' }
        },
      },
    })

    assert.equal(streamCalls, 0)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].body.model, 'gemini-3.8-flash@default')
    const parts = requests[0].body.messages.at(-1).content
    assert.equal(parts[0].type, 'text')
    const imagePart = parts.find((part) => part.type === 'image_url')
    assert.ok(imagePart, 'routed image input must travel as an image_url part')
    assert.ok(imagePart.image_url.url.startsWith('data:image/png;base64,'))
    assert.equal(result.text, 'a small png')
  })

  it('BYOK mode sends text to the user endpoint with the tested model, not the official directory name', async () => {
    const requests = []
    const credentialRefs = []
    let streamCalls = 0
    const byokSettings = {
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://my-provider.test/v1',
      runtimeKeyModel: 'my-model',
      runtimeKeyVerified: true,
      scenarioBindings: { text: { channel: 'byok', provider: 'custom' } },
      byokProviders: [{ provider: 'custom', endpoint: 'https://my-provider.test/v1', models: { text: 'my-model' }, capabilities: ['text'] }],
      toolModel: 'cpa:must-not-override',
    }
    const result = await executeOmnimuxText({
      prompt: 'hello',
      model: 'gemini-3.8-flash',
      group: 'byok-custom',
      env: {},
      settings: { get: (key) => key === 'omnimux' ? byokSettings : undefined },
      credentials: {
        async resolve(ref) {
          credentialRefs.push(ref)
          if (ref === 'OMNIMUX_MEDIA_KEY_CUSTOM') return { value: 'sk-byok-secret' }
          return undefined
        },
      },
      fetcher: async (url, options) => {
        requests.push({ url, auth: options.headers.authorization, body: JSON.parse(options.body) })
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'byok reply' } }] }) }
      },
      llm: {
        async * stream() {
          streamCalls += 1
          yield { type: 'text-delta', text: 'must not run' }
        },
      },
    })

    assert.equal(streamCalls, 0, 'BYOK must not use the official stream')
    assert.equal(requests.length, 1)
    assert.ok(requests[0].url.startsWith('https://my-provider.test/v1'))
    assert.equal(requests[0].auth, 'Bearer sk-byok-secret')
    assert.equal(requests[0].body.model, 'gemini-3.8-flash', 'an explicit caller model still wins')
    assert.equal(result.text, 'byok reply')
    assert.equal(result.model, 'gemini-3.8-flash')
    assert.deepEqual(credentialRefs, ['OMNIMUX_MEDIA_KEY_CUSTOM'])
  })

  it('BYOK mode defaults the wire model to the tested runtimeKeyModel', async () => {
    const requests = []
    const byokSettings = {
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://my-provider.test/v1',
      runtimeKeyModel: 'my-model',
      runtimeKeyVerified: true,
      scenarioBindings: { text: { channel: 'byok', provider: 'custom' } },
      byokProviders: [{ provider: 'custom', endpoint: 'https://my-provider.test/v1', models: { text: 'my-model' }, capabilities: ['text'] }],
    }
    const result = await executeOmnimuxText({
      prompt: 'hello',
      env: {},
      settings: { get: (key) => key === 'omnimux' ? byokSettings : undefined },
      credentials: {
        async resolve(ref) {
          if (ref === 'OMNIMUX_MEDIA_KEY_CUSTOM') return { value: 'sk-byok-secret' }
          return undefined
        },
      },
      fetcher: async (url, options) => {
        requests.push({ body: JSON.parse(options.body) })
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }
      },
    })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].body.model, 'my-model')
    assert.equal(result.text, 'ok')
  })

  it('BYOK mode accepts a custom model the official whitelist does not know', async () => {
    const requests = []
    const byokSettings = {
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://my-provider.test/v1',
      runtimeKeyModel: 'my-model',
      runtimeKeyVerified: true,
      scenarioBindings: { text: { channel: 'byok', provider: 'custom' } },
      byokProviders: [{ provider: 'custom', endpoint: 'https://my-provider.test/v1', models: { text: 'my-model' }, capabilities: ['text'] }],
    }
    const result = await executeOmnimuxText({
      prompt: 'hello',
      model: 'totally-custom-model-id',
      env: {},
      settings: { get: (key) => key === 'omnimux' ? byokSettings : undefined },
      credentials: {
        async resolve(ref) {
          if (ref === 'OMNIMUX_MEDIA_KEY_CUSTOM') return { value: 'sk-byok-secret' }
          return undefined
        },
      },
      fetcher: async (url, options) => {
        requests.push({ body: JSON.parse(options.body) })
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }
      },
    })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].body.model, 'totally-custom-model-id')
    assert.equal(result.text, 'ok')
  })

  it('BYOK mode without a stored key throws unconfigured', async () => {
    const credentialRefs = []
    let httpCalls = 0
    let streamCalls = 0
    const byokSettings = {
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://my-provider.test/v1',
      runtimeKeyModel: 'my-model',
      runtimeKeyVerified: true,
      scenarioBindings: { text: { channel: 'byok', provider: 'custom' } },
      byokProviders: [{ provider: 'custom', endpoint: 'https://my-provider.test/v1', models: { text: 'my-model' }, capabilities: ['text'] }],
    }
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'hello',
        model: 'gemini-3.8-flash',
        group: 'byok-custom',
        env: {},
        settings: { get: (key) => key === 'omnimux' ? byokSettings : undefined },
        credentials: { async resolve(ref) {
          credentialRefs.push(ref)
          if (ref === 'OMNIMUX_BYOK_API_KEY') return { value: 'synthetic-unrelated-legacy-key' }
          return undefined
        } },
        fetcher: async () => { httpCalls += 1; return { ok: true, json: async () => ({}) } },
        llm: { async * stream() { streamCalls += 1; yield {} } },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured',
    )
    assert.deepEqual(credentialRefs, ['OMNIMUX_MEDIA_KEY_CUSTOM'])
    assert.equal(httpCalls, 0)
    assert.equal(streamCalls, 0)
  })

  it('BYOK mode without an endpoint throws unconfigured', async () => {
    const credentialRefs = []
    let httpCalls = 0
    let streamCalls = 0
    const byokSettings = {
      runtimeMode: 'key',
      runtimeKeyEndpoint: '',
      runtimeKeyModel: 'my-model',
      runtimeKeyVerified: true,
      scenarioBindings: { text: { channel: 'byok', provider: 'custom' } },
      byokProviders: [{ provider: 'custom', endpoint: '', models: { text: 'my-model' }, capabilities: ['text'] }],
    }
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'hello',
        model: 'gemini-3.8-flash',
        group: 'byok-custom',
        env: {},
        settings: { get: (key) => key === 'omnimux' ? byokSettings : undefined },
        credentials: { async resolve(ref) {
          credentialRefs.push(ref)
          return ref === 'OMNIMUX_MEDIA_KEY_CUSTOM' ? { value: 'sk-x' } : undefined
        } },
        fetcher: async () => { httpCalls += 1; return { ok: true, json: async () => ({}) } },
        llm: { async * stream() { streamCalls += 1; yield {} } },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured',
    )
    assert.deepEqual(credentialRefs, [])
    assert.equal(httpCalls, 0)
    assert.equal(streamCalls, 0)
  })

  it('agent mode runs text through the CLI, not the official stream', async () => {
    let streamCalls = 0
    const calls = []
    const agentSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
    }
    const result = await executeOmnimuxText({
      prompt: 'hello',
      env: {},
      settings: { get: (key) => key === 'omnimux' ? agentSettings : undefined },
      agentRun: async ({ id, prompt }) => {
        calls.push({ id, prompt })
        return 'agent reply'
      },
      llm: {
        async * stream() {
          streamCalls += 1
          yield { type: 'text-delta', text: 'must not run' }
        },
      },
    })
    assert.equal(streamCalls, 0, 'agent mode must not use the official stream')
    assert.deepEqual(calls, [{ id: 'claude', prompt: 'hello' }])
    assert.deepEqual(result, { mode: 'live', model: 'claude', text: 'agent reply' })
  })

  it('agent mode preserves raw model name and attaches agentModel when specified', async () => {
    const calls = []
    const agentSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'codex',
      runtimeAgentVerified: true,
      runtimeAgentModel: 'gpt-4o',
    }
    const result = await executeOmnimuxText({
      prompt: 'hello',
      env: {},
      settings: { get: (key) => key === 'omnimux' ? agentSettings : undefined },
      agentRun: async ({ id, prompt, model }) => {
        calls.push({ id, prompt, model })
        return 'agent reply with model'
      },
    })
    assert.deepEqual(calls, [{ id: 'codex', prompt: 'hello', model: 'gpt-4o' }])
    assert.equal(result.model, 'codex', 'main model field must retain raw agentId')
    assert.equal(result.agentModel, 'gpt-4o', 'agentModel must be returned as optional attachment')
    assert.deepEqual(result, {
      mode: 'live',
      model: 'codex',
      agentModel: 'gpt-4o',
      text: 'agent reply with model',
    })
  })

  it('agent mode rejects media references in this version', async () => {
    let saved = 0
    let credentialCalls = 0
    let httpCalls = 0
    let streamCalls = 0
    let agentCalls = 0
    const agentSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: 'claude',
      runtimeAgentVerified: true,
    }
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'describe',
        image: `data:image/png;base64,${MP4.toString('base64')}`,
        attachments: { saveImage: async () => { saved += 1; return { id: 'x' } } },
        env: {},
        settings: { get: (key) => key === 'omnimux' ? agentSettings : undefined },
        credentials: { async resolve() { credentialCalls += 1; return undefined } },
        fetcher: async () => { httpCalls += 1; return { ok: true, json: async () => ({}) } },
        llm: { async * stream() { streamCalls += 1; yield {} } },
        agentRun: async () => { agentCalls += 1; return 'must not run' },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'analysis-service-unconfigured',
    )
    assert.equal(saved, 0)
    assert.equal(credentialCalls, 0)
    assert.equal(httpCalls, 0)
    assert.equal(streamCalls, 0)
    assert.equal(agentCalls, 0)
  })

  it('agent mode unverified throws unconfigured before any call', async () => {
    const agentSettings = {
      runtimeMode: 'agent',
      runtimeAgentId: '',
      runtimeAgentVerified: false,
    }
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'hello',
        env: {},
        settings: { get: (key) => key === 'omnimux' ? agentSettings : undefined },
        llm: { async * stream() { yield {} } },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured',
    )
  })
})

describe('textComplete toolModel bypass', () => {
  it('routes a configured tool model straight to ctx.llm.stream with its provider', async () => {
    const seen = []
    const result = await executeOmnimuxText({
      prompt: 'write a reply',
      system: 'be brief',
      env: {},
      settings: {
        get(key) {
          if (key === 'omnimux') return { runtimeMode: 'agent', toolModel: 'cpa:gpt-6.1-sol' }
          return undefined
        },
      },
      llm: collectStream(seen),
    })
    assert.deepEqual(result, { mode: 'live', model: 'cpa:gpt-6.1-sol', text: 'a cat' })
    assert.equal(seen.length, 1)
    assert.equal(seen[0].provider, 'cpa')
    assert.equal(seen[0].model, 'gpt-6.1-sol')
    assert.equal(seen[0].system, 'be brief')
  })

  it('keeps the legacy route when toolModel is unset', async () => {
    const seen = []
    const result = await executeOmnimuxText({
      prompt: 'hello',
      model: 'gemini-3.8-flash',
      settings: { get(key) { return key === 'omnimux' ? { toolModel: '' } : undefined } },
      llm: collectStream(seen),
    })
    assert.equal(result.model, 'gemini-3.8-flash')
    assert.equal(seen[0].provider, 'omnimux')
  })

  it('a malformed toolModel (not a provider:model pair) fails loudly instead of falling back', async () => {
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'hello',
        settings: { get(key) { return key === 'omnimux' ? { toolModel: 'not-a-pair' } : undefined } },
        llm: collectStream([]),
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured',
    )
  })

  it('a stale toolModel fails loudly instead of silently falling back', async () => {
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'hi',
        env: {},
        settings: { get(key) { return key === 'omnimux' ? { toolModel: 'cpa:' } : undefined } },
        llm: collectStream([]),
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured',
    )
  })

  it('a video reference skips the tool model lane instead of throwing invalid-request', async () => {
    const videoDir = mkdtempSync(join(tmpdir(), 'omnimux-video-'))
    const videoPath = join(videoDir, 'clip.mp4')
    const seen = []
    const requests = []
    const credentialRefs = []
    const byokSettings = {
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://my-provider.test/v1',
      runtimeKeyModel: 'my-model',
      runtimeKeyVerified: true,
      scenarioBindings: { analysis: { channel: 'byok', provider: 'custom' } },
      byokProviders: [{ provider: 'custom', endpoint: 'https://my-provider.test/v1', models: { analysis: 'my-model' }, capabilities: ['analysis'] }],
      toolModel: 'cpa:gpt-6.1-sol',
    }
    try {
      writeFileSync(videoPath, Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]),
        Buffer.alloc(32, 0),
      ]))
      const result = await executeOmnimuxText({
        prompt: 'analyze this video',
        video: videoPath,
        env: {},
        settings: { get(key) { return key === 'omnimux' ? byokSettings : undefined } },
        credentials: {
          async resolve(ref) {
            credentialRefs.push(ref)
            if (ref === 'OMNIMUX_MEDIA_KEY_CUSTOM') return { value: 'sk-byok-secret' }
            return undefined
          },
        },
        fetcher: async (url, options) => {
          requests.push({ url, auth: options.headers.authorization, body: JSON.parse(options.body) })
          return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'video read' } }] }) }
        },
        llm: collectStream(seen),
      })
      assert.equal(seen.length, 0, 'video must not ride ctx.llm.stream')
      assert.equal(requests.length, 1)
      const videoPart = requests[0].body.messages.at(-1).content.find((part) => part.type === 'image_url')
      assert.ok(videoPart?.image_url?.url?.startsWith('data:video/mp4;base64,'))
      assert.equal(result.text, 'video read')
      assert.equal(requests[0].url, 'https://my-provider.test/v1/chat/completions')
      assert.equal(requests[0].auth, 'Bearer sk-byok-secret')
      assert.equal(requests[0].body.model, 'my-model')
      assert.equal(result.model, 'my-model')
      assert.deepEqual(credentialRefs, ['OMNIMUX_MEDIA_KEY_CUSTOM'])
    } finally {
      rmSync(videoDir, { recursive: true, force: true })
    }
  })
})
