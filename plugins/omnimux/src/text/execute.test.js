import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { apply } from '../index.js'
import { OmnimuxError } from '../media/errors.js'
import { decodeDataUri, mediaFromMagic } from './image.js'
import { executeOmnimuxText } from './execute.js'
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
      () => executeOmnimuxText({ prompt: 'hello', model: 'claude-opus-5' }),
      (error) => error instanceof OmnimuxError && error.code === 'needs-provider',
    )
  })

  it('streams a named model without tools or parent messages', async () => {
    const seen = []
    const result = await executeOmnimuxText({
      prompt: 'summarize this contract',
      model: 'claude-opus-5',
      system: 'return one sentence',
      llm: collectStream(seen),
    })
    assert.deepEqual(result, { mode: 'live', model: 'claude-opus-5', text: 'a cat' })
    assert.equal(seen.length, 1)
    assert.equal(seen[0].provider, 'omnimux')
    assert.equal(seen[0].model, 'claude-opus-5')
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
        model: 'kimi-k3',
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
        model: 'gemini-3.7-flash',
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
    PNG.forEach((value, index) => { bytes[index] = value })
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
          arrayBuffer: async () => bytes,
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

  it('rejects video on a model without video input', async () => {
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'describe',
        model: 'grok-4.6',
        video: `data:video/mp4;base64,${MP4.toString('base64')}`,
        env: { OMNIMUX_API_KEY: 'sk-test' },
        fetcher: async () => ({ ok: true, json: async () => ({}) }),
      }),
      (error) => error instanceof OmnimuxError
        && error.code === 'omnimux-invalid-request'
        && /does not accept video input/.test(error.message),
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
        assetMeta: { [`data:video/webm;base64,${WEBM.toString('base64')}`]: { mime: 'video/mp4', sizeBytes: 1 } },
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

  it('throws omnimux-unconfigured when video lacks an API key', async () => {
    await assert.rejects(
      () => executeOmnimuxText({
        prompt: 'describe',
        video: `data:video/mp4;base64,${MP4.toString('base64')}`,
        env: {},
        fetcher: async () => ({ ok: true, json: async () => ({}) }),
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-unconfigured',
    )
  })

  it('packs loadTextVideo into image_url only', async () => {
    const packed = await loadTextVideo(`data:video/webm;base64,${WEBM.toString('base64')}`)
    const part = toVideoImageUrlPart(packed)
    assert.equal(part.type, 'image_url')
    assert.match(part.image_url.url, /^data:video\/webm;base64,/)
  })

  it('discovers local provider endpoint and adapts model when OMNIMUX_API_KEY is absent', async () => {
    let capturedUrl = ''
    let capturedBody = null
    const fetcher = async (url, init) => {
      capturedUrl = url
      capturedBody = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'video analyzed successfully' } }] }),
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
      fetcher,
    })
    assert.equal(capturedUrl, 'http://127.0.0.1:8317/v1/chat/completions')
    assert.equal(capturedBody.model, 'gemini-3.8-flash-high')
    assert.equal(result.text, 'video analyzed successfully')
  })

  it('pairs local provider apiKey when credentials also contain an external OMNIMUX_API_KEY', async () => {
    let capturedAuth = ''
    let capturedUrl = ''
    const fetcher = async (url, init) => {
      capturedUrl = String(url)
      capturedAuth = init?.headers?.authorization || init?.headers?.Authorization || ''
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'local key paired' } }] }),
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
    assert.equal(capturedUrl, 'http://127.0.0.1:8317/v1/chat/completions')
    assert.equal(capturedAuth, 'Bearer sk-cpa-local-secret', 'must pair CPA_API_KEY when baseUrl defaults to CPA')
    assert.equal(result.text, 'local key paired')
  })
})

describe('omnimux_text_complete tool', () => {
  it('registers and forwards onto textComplete', async () => {
    const tools = {}
    const provided = {}
    const seen = []
    apply({
      tools: { register(tool) { tools[tool.name] = tool } },
      provide(name, value) { provided[name] = value },
      get(name) {
        if (name === 'llm') return collectStream(seen)
        return undefined
      },
    })
    assert.equal(typeof provided.textComplete.execute, 'function')
    assert.ok(tools.omnimux_text_complete)
    assert.ok(tools.omnimux_text_complete.parameters.properties.model.enum.includes('grok-4.6'))
    assert.ok(tools.omnimux_text_complete.parameters.properties.model.enum.includes('gemini-3.7-flash'))
    assert.equal(tools.omnimux_text_complete.parameters.properties.model.enum.includes('claude-haiku-4-5'), false)
    assert.match(tools.omnimux_text_complete.description, /whitelist/)
    assert.ok(tools.omnimux_text_complete.parameters.properties.video)
    assert.match(tools.omnimux_text_complete.description, /image_url\(data:video\)/)
    const result = await tools.omnimux_text_complete.execute({
      model: 'glm-5.3',
      prompt: 'one line',
      reason: 'user asked for GLM wording',
    }, { signal: undefined })
    assert.equal(result.model, 'glm-5.3')
    assert.equal(seen[0].model, 'glm-5.3')
  })

  it('hides a disabled whitelist model from the tool enum', () => {
    const tools = {}
    apply({
      tools: { register(tool) { tools[tool.name] = tool } },
      provide() {},
      get() { return undefined },
    }, { text: { models: [{ id: 'grok-4.6', enabled: false }, { id: 'glm-5.3' }] } })
    assert.deepEqual(tools.omnimux_text_complete.parameters.properties.model.enum, ['glm-5.3'])
  })

  it('rejects a missing reason at the tool', async () => {
    const tools = {}
    apply({
      tools: { register(tool) { tools[tool.name] = tool } },
      provide() {},
      get() { return { stream: async function* () {} } },
    })
    await assert.rejects(
      () => tools.omnimux_text_complete.execute({ model: 'glm-5.3', prompt: 'hi' }, {}),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
  })

  it('completeTextViaChat prioritizes local provider over remote cloud provider for direct video completion', async () => {
    const { completeTextViaChat } = await import('./chat.js')
    let capturedRequest = null
    const fakeFetcher = async (url, opts) => {
      capturedRequest = { url, opts }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'local cpa completion result' } }]
        })
      }
    }
    const res = await completeTextViaChat({
      prompt: 'test prompt',
      model: 'gemini-3.8-flash',
      mediaParts: [{ type: 'image_url', image_url: { url: 'data:video/mp4;base64,AAAAHGZ0eXBpc29t' } }],
      settings: {
        get: (section) => {
          if (section === 'llm-pi-ai') {
            return {
              providers: {
                omnimux: {
                  baseURL: 'https://api.omnimux.ai/v1',
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
        resolve: async (ref) => ref === 'CPA_API_KEY' ? { value: 'sk-cpa-test' } : undefined,
      },
      fetcher: fakeFetcher,
    })
    assert.equal(res.text, 'local cpa completion result')
    assert.ok(capturedRequest.url.startsWith('http://127.0.0.1:8317/v1'))
    assert.equal(capturedRequest.opts.headers.authorization, 'Bearer sk-cpa-test')
  })

  it('sends a routed text request through the direct chat path with the group attached', async () => {
    let streamCalls = 0
    const requests = []
    const result = await executeOmnimuxText({
      prompt: 'hello',
      model: 'claude-opus-4-6',
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
    assert.equal(requests[0].body.model, 'claude-opus-4-6@standard')
    assert.equal(result.text, 'routed reply')
    assert.equal(result.model, 'claude-opus-4-6')
  })

  it('keeps an unrouted text request on llm.stream with the bare model id', async () => {
    let fetcherCalls = 0
    const seen = []
    const result = await executeOmnimuxText({
      prompt: 'hello',
      model: 'claude-opus-4-6',
      env: { OMNIMUX_API_KEY: 'sk-test', OMNIMUX_BASE_URL: 'https://gateway.test/v1' },
      fetcher: async () => {
        fetcherCalls += 1
        return { ok: true, status: 200, json: async () => ({ choices: [] }) }
      },
      llm: collectStream(seen),
    })

    assert.equal(fetcherCalls, 0)
    assert.equal(seen.length, 1)
    assert.equal(seen[0].model, 'claude-opus-4-6')
    assert.equal(seen[0].provider, 'omnimux')
    assert.equal(result.text, 'a cat')
  })

  it('carries routed image input as a data URL part instead of falling back to the stream', async () => {
    let streamCalls = 0
    const requests = []
    const result = await executeOmnimuxText({
      prompt: 'describe',
      model: 'deepseek-v4-flash-vision-exp',
      allowedGroups: ['deepseek-official'],
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
    assert.equal(requests[0].body.model, 'deepseek-v4-flash-vision-exp@deepseek-official')
    const parts = requests[0].body.messages.at(-1).content
    assert.equal(parts[0].type, 'text')
    const imagePart = parts.find((part) => part.type === 'image_url')
    assert.ok(imagePart, 'routed image input must travel as an image_url part')
    assert.ok(imagePart.image_url.url.startsWith('data:image/png;base64,'))
    assert.equal(result.text, 'a small png')
  })
})
