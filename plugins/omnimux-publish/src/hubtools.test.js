import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHubChannel, extractPostId, extractRawStatus } from './hubtools.js'
import { PublishError } from './store.js'

/**
 * Mock ctx.tools: get(name) 返回注册表行；execute 走官方 result 形状
 * { content, isError, value }。行为可编程。
 * @param {Record<string, (args: object, exec: object) => unknown | Promise<unknown>>} handlers
 * @param {{ getNames?: string[] }} [opts]
 */
function mockTools(handlers, opts = {}) {
  const registered = new Set(opts.getNames ?? Object.keys(handlers))
  const calls = []
  return {
    calls,
    get: (name) => (registered.has(name) ? { name } : undefined),
    async execute(exec) {
      calls.push(exec)
      const handler = handlers[exec.name]
      if (!handler) {
        return { content: [{ type: 'text', text: `UNKNOWN_TOOL ${exec.name}` }], isError: true, value: undefined }
      }
      try {
        const value = await handler(exec.arguments, exec)
        return { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false, value }
      } catch (error) {
        const text = `${error instanceof Error ? error.name + ': ' + error.message : String(error)}`
        return { content: [{ type: 'text', text }], isError: true, value: undefined }
      }
    },
  }
}

const okEnvelope = (data) => ({ success: true, data })

describe('HubPublishChannel lazy resolution', () => {
  it('throws needs-hub when ctx.tools is unavailable', async () => {
    const channel = createHubChannel({ tools: undefined })
    await assert.rejects(() => channel.getPost('p1'), (e) => e instanceof PublishError && e.code === 'needs-hub')
  })

  it('throws needs-hub when the tool is not registered (hub 未装载)', async () => {
    const tools = mockTools({}, { getNames: [] })
    const channel = createHubChannel({ tools })
    await assert.rejects(
      () => channel.presign({ filename: 'a.png' }),
      (e) => e instanceof PublishError && e.code === 'needs-hub' && /omnimux hub/.test(e.message),
    )
  })

  it('resolves tools lazily at call time (not construction time)', async () => {
    const tools = mockTools({})
    const channel = createHubChannel({ tools })
    // 构造时 omnimux_publish_presign 还不存在 → 调用时也不存在 → needs-hub
    await assert.rejects(() => channel.presign({ filename: 'a.png' }), (e) => e.code === 'needs-hub')
  })
})

describe('HubPublishChannel error mapping', () => {
  it('maps needs-omnimux from an error result', async () => {
    const tools = mockTools({
      omnimux_accounts_list: () => {
        throw new Error('OmnimuxError: needs-omnimux sign in to OmniMux or set OMNIMUX_ACCESS_TOKEN')
      },
    })
    const channel = createHubChannel({ tools })
    await assert.rejects(
      () => channel.listAccounts(),
      (e) => e instanceof PublishError && e.code === 'needs-omnimux',
    )
  })

  it('maps structured quota-exceeded tool errors without any UI global', async () => {
    const tools = {
      get: () => ({ name: 'omnimux_publish_get' }),
      async execute() {
        return {
          content: [{ type: 'text', text: 'quota failure' }],
          isError: true,
          error: { message: '当前操作需要更多额度', info: { code: 'quota-exceeded' } },
        }
      },
    }
    const channel = createHubChannel({ tools })
    await assert.rejects(
      () => channel.getPost('p1'),
      (e) => e instanceof PublishError && e.code === 'quota-exceeded' && /更多额度/.test(e.message),
    )
    assert.equal(typeof globalThis.window, 'undefined')
  })

  it('maps UNKNOWN_TOOL to needs-hub', async () => {
    const tools = mockTools({ omnimux_publish_get: () => ({}) }, { getNames: ['omnimux_publish_get'] })
    // get 允许（lazy 存在），execute 走 UNKNOWN_TOOL 分支：用 getNames 排除法模拟
    const missing = mockTools({}, { getNames: ['omnimux_publish_get'] })
    const channel = createHubChannel({ tools: missing })
    await assert.rejects(() => channel.getPost('p1'), (e) => e.code === 'needs-hub')
  })

  it('surfaces generic tool errors as hub-tool-error with text', async () => {
    const tools = mockTools({
      omnimux_publish_create: () => {
        throw new Error('omnimux-request-failed: HTTP 500 Internal server error')
      },
    })
    const channel = createHubChannel({ tools })
    await assert.rejects(
      () => channel.createPost({ account_ids: ['1'], content: 'x', media_items: [] }),
      (e) => e instanceof PublishError && e.code === 'hub-tool-error' && /HTTP 500/.test(e.message),
    )
  })

  it('unwraps success:false envelopes into a deterministic error', async () => {
    const tools = mockTools({
      omnimux_publish_get: () => ({ success: false, message: 'Insufficient quota. Please top up your account.' }),
    })
    const channel = createHubChannel({ tools })
    await assert.rejects(
      () => channel.getPost('p1'),
      (e) => e instanceof PublishError && e.code === 'hub-tool-error' && /Insufficient quota/.test(e.message),
    )
  })
})

describe('presign / create / get payload handling', () => {
  it('presign returns upload_url + public_url from the data envelope', async () => {
    const tools = mockTools({
      omnimux_publish_presign: (args) => okEnvelope({ upload_url: 'https://up', public_url: 'https://pub' }),
    })
    const channel = createHubChannel({ tools })
    const result = await channel.presign({ filename: 'a.png', content_type: 'image/png' })
    assert.deepEqual(result, { upload_url: 'https://up', public_url: 'https://pub' })
    // 工具入参按 hub schema：filename + content_type
    assert.deepEqual(tools.calls[0].arguments, { filename: 'a.png', content_type: 'image/png' })
  })

  it('presign omits content_type when absent', async () => {
    const tools = mockTools({ omnimux_publish_presign: () => okEnvelope({ upload_url: 'u', public_url: 'p' }) })
    const channel = createHubChannel({ tools })
    await channel.presign({ filename: 'a.mp4' })
    assert.deepEqual(tools.calls[0].arguments, { filename: 'a.mp4' })
  })

  it('presign fails deterministically on missing url fields (防御性解析)', async () => {
    const tools = mockTools({ omnimux_publish_presign: () => okEnvelope({ foo: 'bar' }) })
    const channel = createHubChannel({ tools })
    await assert.rejects(() => channel.presign({ filename: 'a.png' }), (e) => e.code === 'hub-tool-error')
  })

  it('create/get pass agent through to ctx.tools.execute (exec.agent 透传)', async () => {
    const tools = mockTools({
      omnimux_publish_create: () => okEnvelope({ id: 42, status: 'scheduled' }),
    })
    const channel = createHubChannel({ tools })
    await channel.createPost({ account_ids: ['7'], content: 'hi', media_items: [] }, { agent: 'agent-1' })
    assert.equal(tools.calls[0].agent, 'agent-1')
    assert.ok(tools.calls[0].callId)
    assert.equal(tools.calls[0].name, 'omnimux_publish_create')
  })

  it('signal passes through to ctx.tools.execute', async () => {
    const controller = new AbortController()
    const tools = mockTools({ omnimux_publish_get: () => okEnvelope({ id: 1, status: 'published' }) })
    const channel = createHubChannel({ tools })
    await channel.getPost('1', { signal: controller.signal })
    assert.equal(tools.calls[0].signal, controller.signal)
  })

  it('fills in a live AbortSignal when execute is called without one (UI/HTTP 路径)', async () => {
    const tools = mockTools({ omnimux_accounts_list: () => ({ accounts: [{ id: '1' }] }) })
    const channel = createHubChannel({ tools })
    await channel.listAccounts()
    const signal = tools.calls[0].signal
    assert.ok(signal instanceof AbortSignal)
    assert.equal(signal.aborted, false)
  })

  it('fills in a live AbortSignal on create/presign when opts omit signal', async () => {
    const tools = mockTools({
      omnimux_publish_presign: () => okEnvelope({ upload_url: 'https://up', public_url: 'https://pub' }),
    })
    const channel = createHubChannel({ tools })
    await channel.presign({ filename: 'a.png' })
    assert.ok(tools.calls[0].signal instanceof AbortSignal)
    assert.equal(tools.calls[0].signal.aborted, false)
  })
})

describe('putBytes (预签名自授权 PUT)', () => {
  it('PUTs bytes with content-type and no auth header', async () => {
    const seen = []
    const fetcher = async (url, init) => {
      seen.push({ url, init })
      return { ok: true, status: 200 }
    }
    const channel = createHubChannel({ tools: mockTools({}), fetcher })
    await channel.putBytes('https://signed/upload', Buffer.from('bytes'), 'video/mp4')
    assert.equal(seen[0].url, 'https://signed/upload')
    assert.equal(seen[0].init.method, 'PUT')
    assert.equal(seen[0].init.headers['content-type'], 'video/mp4')
    assert.equal(seen[0].init.headers.authorization, undefined) // 预签名自授权，无 secret
  })

  it('maps non-2xx to upload-failed', async () => {
    const channel = createHubChannel({ tools: mockTools({}), fetcher: async () => ({ ok: false, status: 403 }) })
    await assert.rejects(() => channel.putBytes('https://u', Buffer.from('b'), 'image/png'), (e) => e.code === 'upload-failed')
  })

  it('network failure maps to upload-failed with the cause', async () => {
    const channel = createHubChannel({
      tools: mockTools({}),
      fetcher: async () => {
        throw new Error('ECONNREFUSED')
      },
    })
    await assert.rejects(() => channel.putBytes('https://u', Buffer.from('b'), 'image/png'), (e) => e.code === 'upload-failed' && /ECONNREFUSED/.test(e.message))
  })
})

describe('extract helpers', () => {
  it('extractPostId normalizes numbers and accepts post_id fallbacks', () => {
    assert.equal(extractPostId({ id: 7 }, 't'), '7')
    assert.equal(extractPostId({ post_id: 'abc' }, 't'), 'abc')
    assert.equal(extractPostId({ taskId: 'x' }, 't'), 'x')
    assert.throws(() => extractPostId({ status: 'published' }, 't'), (e) => e.code === 'hub-tool-error')
  })

  it('extractRawStatus returns null when status is missing', () => {
    assert.equal(extractRawStatus({ id: 1 }), null)
    assert.equal(extractRawStatus({ status: 'review' }), 'review')
  })
})
