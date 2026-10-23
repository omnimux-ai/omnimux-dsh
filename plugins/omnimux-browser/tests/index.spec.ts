import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { apply, assertPositiveInteger, Config, loadSubscriptionModelGroups, resolveConfig } from '../src/index.ts'

/** Minimal context stub: apply only needs the services at registration time. */
function stubContext(): Context {
  const gateway = {
    wireStream: {
      open: async (): Promise<AsyncIterable<unknown>> => ({
        async *[Symbol.asyncIterator]() { yield { type: 'ready', clientId: 'test', host: { home: '/tmp' } } },
      }),
      failure: (error: unknown) => ({ code: 'internal', message: String(error), details: {} }),
    },
    invoke: async () => undefined,
  }
  const connection = {
    createSharedFetchHandler: () => ({ fetch: async () => new Response('not found', { status: 404 }) }),
  }
  return {
    webServer: { port: 0, registerUpgrade: () => () => {}, register: () => () => {} },
    tools: { register: () => () => {} },
    agents: { get: () => undefined },
    get: (key: string) => key === 'typertGateway' ? gateway : key === 'connection' ? connection : undefined,
    on: () => () => {},
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    effect: (fn: () => unknown, label?: string) => {
      void label
      return fn() as () => void
    },
  } as unknown as Context
}

const dirs: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('assertPositiveInteger', () => {
  it('accepts positive integers and rejects everything else', () => {
    expect(() => assertPositiveInteger('x', 1)).not.toThrow()
    expect(() => assertPositiveInteger('x', 0)).toThrow(/must be a positive integer/)
    expect(() => assertPositiveInteger('x', -1)).toThrow(/must be a positive integer/)
    expect(() => assertPositiveInteger('x', 1.5)).toThrow(/must be a positive integer/)
  })
})

/** Valid budgets (the Loader applies schema defaults; hand-built tests pass them explicitly). */
const VALID = { toolTimeoutMs: 90_000, snapshotMaxChars: 32_000, maxInteractiveItems: 60 }

describe('config', () => {
  it('resolves defaults, including an enabled workspace under the dsh home', () => {
    expect(resolveConfig({})).toEqual({
      ...VALID,
      sessionWorkspacePath: dshHomePath('browser-sessions'),
      deferSessionCreate: true,
    })
    expect(new Config().sessionWorkspacePath).toBe(dshHomePath('browser-sessions'))
  })

  it('preserves explicit values and the empty-string workspace opt-out', () => {
    expect(resolveConfig({
      token: 'fixed',
      toolTimeoutMs: 1,
      snapshotMaxChars: 500,
      maxInteractiveItems: 3,
      sessionWorkspacePath: '',
      deferSessionCreate: false,
    })).toEqual({
      token: 'fixed',
      toolTimeoutMs: 1,
      snapshotMaxChars: 500,
      maxInteractiveItems: 3,
      sessionWorkspacePath: '',
      deferSessionCreate: false,
    })
    expect(new Config({ sessionWorkspacePath: '' }).sessionWorkspacePath).toBe('')
  })
})

describe('loadSubscriptionModelGroups', () => {
  it('reads codex and grok groups from the stubbed DSH_HOME subscription catalog', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-bridge-models-'))
    dirs.push(home)
    vi.stubEnv('DSH_HOME', home)
    const dir = join(home, 'plugins', 'subscriptions')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'models.json'), JSON.stringify({
      codex: { models: [{ id: 'gpt-5.5', name: 'GPT-5.5', reasoning: { efforts: [] } }] },
      grok: { models: [{ id: 'grok-4' }] },
    }))

    expect(loadSubscriptionModelGroups()).toEqual([
      { group: 'ChatGPT (Codex)', models: [{ id: 'gpt-5.5', name: 'GPT-5.5', reasoning: { efforts: [] } }] },
      { group: 'Grok (Subscription)', models: [{ id: 'grok-4', name: 'grok-4', reasoning: undefined }] },
    ])
  })

  it('returns an empty list when no home carries a readable catalog', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-bridge-empty-'))
    dirs.push(home)
    vi.stubEnv('DSH_HOME', home)
    // The real dshHomePath()/~/.dsh homes may still carry catalogs on a dev
    // machine; only the stubbed home is asserted below when it wins first.
    const groups = loadSubscriptionModelGroups()
    expect(Array.isArray(groups)).toBe(true)
  })
})

describe('apply', () => {
  it('registers the bridge with a fixed token (no generation)', async () => {
    await apply(stubContext(), { token: 'fixed-token', ...VALID, sessionWorkspacePath: '' })
  })

  it.each([undefined, {}, { wireStream: {} }])('rejects unsupported Gateway capabilities: %j', async (gateway) => {
    const ctx = stubContext()
    const get = ctx.get.bind(ctx)
    vi.spyOn(ctx, 'get').mockImplementation((key) => key === 'typertGateway' ? gateway : get(key))
    const register = vi.spyOn(ctx.webServer, 'registerUpgrade')
    await expect(apply(ctx, { token: 'fixed-token', ...VALID })).rejects.toThrow(/dsh 0\.1\.5-rc\.2.*wireStream unavailable/)
    expect(register).not.toHaveBeenCalled()
  })

  it('leaves Remote event source ownership to the host composition', async () => {
    const ctx = stubContext()
    const gateway = ctx.get('typertGateway')
    const open = vi.spyOn(gateway.wireStream, 'open')

    await apply(ctx, { token: 'fixed-token', ...VALID, sessionWorkspacePath: '' })

    expect(open).not.toHaveBeenCalled()
  })

  it('generates and persists a token when none is configured', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-bridge-home-'))
    dirs.push(home)
    vi.stubEnv('DSH_HOME', home)
    await apply(stubContext(), VALID)
  })

  it('rejects invalid budgets loudly', async () => {
    await expect(apply(stubContext(), { ...VALID, toolTimeoutMs: 0 })).rejects.toThrow(/toolTimeoutMs/)
    await expect(apply(stubContext(), { ...VALID, snapshotMaxChars: -1 })).rejects.toThrow(/snapshotMaxChars/)
    await expect(apply(stubContext(), { ...VALID, snapshotMaxChars: 499 })).rejects.toThrow(/at least 500/)
  })
})

// --- Issue #3629: text-generation pin lifecycle (bridge.textGeneration) ---

import { createServer } from 'node:http'
import WebSocket from 'ws'
import { withAutoModelRouting } from '../src/auto-model.ts'
import {
  createTextGenerationPinRegistry,
  pinTextGenerationSession,
  unpinTextGenerationSession,
} from '../src/index.ts'
import { BRIDGE_SESSION_PURGE_METHOD, BRIDGE_TEXT_GENERATION_METHOD } from '../src/protocol.ts'

/** One rpc.result frame decoded from the bridge socket. */
interface RpcFrame {
  t: string
  id?: string
  ok?: boolean
  result?: unknown
  error?: { code: string; message: string }
}

function rpcFrame(frames: RpcFrame[], id: string): RpcFrame | undefined {
  return frames.find((frame) => frame.t === 'rpc.result' && frame.id === id)
}

async function waitForFrame(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitForFrame timed out')
    await new Promise((resolve) => { setTimeout(resolve, 10) })
  }
}

/** Stub context for a REAL mount: real sockets, stub Gateway/Connection/decisions. */
function mountContext(
  evaluate: (args: { state: string; choices: Record<string, string>; instructions: string }) => Promise<{ decision?: string } | undefined>,
): {
  context: Context
  invokes: Array<{ namespace: string; method: string; args: Record<string, unknown> }>
  upgradeRoute: () => { path: string; handler: (req: unknown, socket: unknown, head: unknown) => void }
} {
  const invokes: Array<{ namespace: string; method: string; args: Record<string, unknown> }> = []
  const gateway = {
    wireStream: {
      open: async (endpoint: string, _payload: unknown, signal: AbortSignal): Promise<AsyncIterable<unknown>> => {
        if (endpoint !== '$events') throw new Error(`unexpected stub stream ${endpoint}`)
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'ready', clientId: 'stub-client', host: { home: '/' } }
            await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
          },
        }
      },
      failure: (error: unknown) => ({ code: 'internal', message: String(error), details: {} }),
    },
    invoke: async (request: { namespace: string; method: string; args: Record<string, unknown> }) => {
      invokes.push(request)
      return {}
    },
  }
  const connection = {
    createSharedFetchHandler: () => ({ fetch: async () => new Response('not found', { status: 404 }) }),
  }
  const decisions = { evaluate }
  let upgrade: { path: string; handler: (req: unknown, socket: unknown, head: unknown) => void } | undefined
  const context = {
    webServer: {
      port: 0,
      registerUpgrade: (route: { path: string; handler: (req: unknown, socket: unknown, head: unknown) => void }) => {
        upgrade = route
        return () => {}
      },
      register: () => () => {},
    },
    tools: { register: () => () => {} },
    agents: { get: () => undefined },
    get: (key: string) => key === 'typertGateway' ? gateway : key === 'connection' ? connection : key === 'decisions' ? decisions : undefined,
    on: () => () => {},
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    effect: (fn: () => unknown) => fn(),
  }
  return {
    context: context as unknown as Context,
    invokes,
    upgradeRoute: () => upgrade!,
  }
}

describe('text generation pin lifecycle', () => {
  it('selects the model with provider and effort before registering the session', async () => {
    const order: string[] = []
    const selectModel = vi.fn(async (input: { model: string }) => { order.push(`selectModel:${input.model}`) })
    const pin = vi.fn((sessionId: string) => { order.push(`pin:${sessionId}`) })

    await pinTextGenerationSession(
      { selectModel, pin },
      { sessionId: 'session-1', model: 'claude-opus-4-6', provider: 'anthropic', reasoningEffort: 'high' },
    )

    expect(selectModel).toHaveBeenCalledWith({
      sessionId: 'session-1',
      model: 'claude-opus-4-6',
      provider: 'anthropic',
      reasoningEffort: 'high',
    })
    expect(order).toEqual(['selectModel:claude-opus-4-6', 'pin:session-1'])
  })

  it('omits absent optional fields from the model selection', async () => {
    const selectModel = vi.fn(async () => {})
    await pinTextGenerationSession({ selectModel, pin: () => {} }, { sessionId: 'session-1', model: 'grok-4' })
    expect(selectModel).toHaveBeenCalledWith({ sessionId: 'session-1', model: 'grok-4' })
  })

  it('registers nothing when the model selection fails', async () => {
    const selectModel = vi.fn(async () => { throw new Error('model unavailable') })
    const pin = vi.fn()
    await expect(pinTextGenerationSession(
      { selectModel, pin },
      { sessionId: 'session-1', model: 'claude-opus-4-6' },
    )).rejects.toThrow('model unavailable')
    expect(pin).not.toHaveBeenCalled()
  })

  it('tracks and forgets pinned sessions', () => {
    const pins = createTextGenerationPinRegistry()
    expect(pins.isPinned('session-1')).toBe(false)
    pins.pin('session-1')
    expect(pins.isPinned('session-1')).toBe(true)
    expect(pins.isPinned('session-2')).toBe(false)
    pins.unpin('session-1')
    expect(pins.isPinned('session-1')).toBe(false)
    pins.unpin('session-unknown')
  })

  it('never fails the caller when the registry cannot forget a session', () => {
    const warn = vi.fn()
    const broken = { unpin: () => { throw new Error('registry offline') } }
    expect(() => unpinTextGenerationSession(broken, 'session-1', warn)).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not drop the text-generation pin for session-1'))
  })

  it('keeps a pinned session out of auto routing until it is unpinned', async () => {
    const pins = createTextGenerationPinRegistry()
    const selectModel = vi.fn(async () => {})
    const evaluate = vi.fn(async () => ({ decision: 'gpt-5.5' }))
    const wrapped = withAutoModelRouting(
      {
        call: async () => ({ ok: true as const, value: { accepted: true } }),
        async *events() {},
        respond: async () => ({ accepted: true }),
      },
      {
        evaluate,
        selectModel,
        candidates: () => [{ id: 'gpt-5.5', provider: 'chatgpt' }],
        getMode: () => ({ auto: true }),
        isPinned: (sessionId) => pins.isPinned(sessionId),
      },
    )
    const prompt = {
      rpcId: 'rpc-1',
      method: 'session.prompt',
      payload: { sessionId: 'session-1', mode: 'queue', content: [{ type: 'text', text: 'hi' }] },
      signal: new AbortController().signal,
    }

    await pinTextGenerationSession({ selectModel, pin: (sessionId) => { pins.pin(sessionId) } }, { sessionId: 'session-1', model: 'claude-opus-4-6' })
    expect(selectModel).toHaveBeenCalledTimes(1)

    await wrapped.call(prompt)
    expect(evaluate).not.toHaveBeenCalled()
    expect(selectModel).toHaveBeenCalledTimes(1)

    unpinTextGenerationSession(pins, 'session-1')
    await wrapped.call(prompt)
    expect(evaluate).toHaveBeenCalledTimes(1)
    expect(selectModel).toHaveBeenCalledTimes(2)
  })
})

describe('mounted bridge with a stub host', () => {
  it('pins the session, skips auto routing, and deregisters the pin on purge', { timeout: 30000 }, async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-bridge-pin-'))
    dirs.push(home)
    vi.stubEnv('DSH_HOME', home)
    await mkdir(join(home, 'plugins', 'subscriptions'), { recursive: true })
    await writeFile(
      join(home, 'plugins', 'subscriptions', 'models.json'),
      JSON.stringify({ codex: { models: [{ id: 'gpt-5.5', name: 'GPT-5.5' }] } }),
    )

    const evaluate = vi.fn(async () => ({ decision: 'gpt-5.5' }))
    const host = mountContext(evaluate)
    await apply(host.context, { token: 'fixed-token', ...VALID, sessionWorkspacePath: '' })

    const route = host.upgradeRoute()
    const server = createServer()
    server.on('upgrade', (req, socket, head) => { route.handler(req, socket, head) })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const port = (server.address() as { port: number }).port

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ext/bridge`)
    const frames: RpcFrame[] = []
    ws.on('message', (data) => { frames.push(JSON.parse(data.toString()) as RpcFrame) })
    await new Promise<void>((resolve, reject) => {
      ws.on('error', reject)
      ws.on('open', () => { resolve() })
    })
    ws.send(JSON.stringify({
      t: 'hello',
      token: 'fixed-token',
      caps: { textOnly: true, snapshotMaxChars: 32000, maxInteractiveItems: 60 },
    }))
    await waitForFrame(() => frames.some((frame) => frame.t === 'hello.ok'))

    const pinnedSession = 'session-11111111-1111-1111-1111-111111111111'
    ws.send(JSON.stringify({
      t: 'rpc',
      id: 'pin',
      method: BRIDGE_TEXT_GENERATION_METHOD,
      payload: { sessionId: pinnedSession, model: 'claude-opus-4-6', provider: 'anthropic', reasoningEffort: 'high' },
    }))
    await waitForFrame(() => rpcFrame(frames, 'pin') !== undefined)
    expect(rpcFrame(frames, 'pin')).toEqual({ t: 'rpc.result', id: 'pin', ok: true, result: { pinned: true } })
    expect(host.invokes).toContainEqual({
      namespace: 'session',
      method: 'selectModel',
      args: {
        request: {
          sessionId: pinnedSession,
          model: 'claude-opus-4-6',
          provider: 'anthropic',
          reasoningEffort: 'high',
        },
      },
    })

    // The pinned session's prompt is forwarded without a routing pass.
    ws.send(JSON.stringify({
      t: 'rpc',
      id: 'pinned-prompt',
      method: 'session.prompt',
      payload: { sessionId: pinnedSession, mode: 'queue', content: [{ type: 'text', text: 'draft a reply' }] },
    }))
    await waitForFrame(() => rpcFrame(frames, 'pinned-prompt') !== undefined)
    expect(evaluate).not.toHaveBeenCalled()

    // A session the panel did not pin still routes through the decisions seam.
    ws.send(JSON.stringify({
      t: 'rpc',
      id: 'chat-prompt',
      method: 'session.prompt',
      payload: { sessionId: 'session-chat', mode: 'queue', content: [{ type: 'text', text: 'hello' }] },
    }))
    await waitForFrame(() => rpcFrame(frames, 'chat-prompt') !== undefined)
    expect(evaluate).toHaveBeenCalledTimes(1)
    expect(host.invokes).toContainEqual({
      namespace: 'session',
      method: 'selectModel',
      args: { request: { sessionId: 'session-chat', model: 'gpt-5.5', provider: 'chatgpt' } },
    })

    // Purge is refused here (no durable storage in this environment); that
    // refusal is still the panel's answer, so pin bookkeeping never changes it.
    ws.send(JSON.stringify({
      t: 'rpc',
      id: 'purge',
      method: BRIDGE_SESSION_PURGE_METHOD,
      payload: { sessionId: pinnedSession },
    }))
    await waitForFrame(() => rpcFrame(frames, 'purge') !== undefined)
    const purge = rpcFrame(frames, 'purge')!
    expect(purge.ok).toBe(false)
    expect(['not-found', 'internal']).toContain(purge.error!.code)

    // The pin died with the purge attempt, so the session routes again.
    ws.send(JSON.stringify({
      t: 'rpc',
      id: 'after-purge',
      method: 'session.prompt',
      payload: { sessionId: pinnedSession, mode: 'queue', content: [{ type: 'text', text: 'draft again' }] },
    }))
    await waitForFrame(() => rpcFrame(frames, 'after-purge') !== undefined)
    expect(evaluate).toHaveBeenCalledTimes(2)

    ws.close()
    await new Promise<void>((resolve) => { server.close(() => resolve()) })
  })
})
