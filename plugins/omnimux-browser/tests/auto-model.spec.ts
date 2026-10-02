import { describe, expect, it, vi } from 'vitest'
import {
  extractPromptText,
  flattenModelCandidates,
  normalizeMode,
  withAutoModelRouting,
  type AutoModelRoutingDeps,
} from '../src/auto-model.ts'
import { withSessionDeferral } from '../src/session-deferral.ts'
import type { BrowserHostApi, HostRpcCall, HostRpcResult } from '../src/host-api.ts'

function call(method: string, payload: unknown, rpcId = 'rpc-1'): HostRpcCall {
  return { rpcId, method, payload, signal: new AbortController().signal }
}

const PROMPT = {
  sessionId: 'session-1',
  mode: 'queue',
  content: [{ type: 'text', text: 'write a haiku about browsers' }],
}

function hostApi(overrides: Partial<BrowserHostApi> = {}): BrowserHostApi {
  return {
    call: async () => ({ ok: true, value: { accepted: true } }),
    async *events() {},
    respond: async () => ({ accepted: true }),
    ...overrides,
  }
}

function routerDeps(overrides: Partial<AutoModelRoutingDeps> = {}): {
  deps: AutoModelRoutingDeps
  evaluate: ReturnType<typeof vi.fn>
  selectModel: ReturnType<typeof vi.fn>
  onRouted: ReturnType<typeof vi.fn>
  mode: { auto: boolean }
} {
  const mode = { auto: true }
  const evaluate = vi.fn(async () => ({ decision: 'gpt-5.5' }))
  const selectModel = vi.fn(async () => {})
  const onRouted = vi.fn()
  const deps: AutoModelRoutingDeps = {
    evaluate,
    selectModel,
    candidates: () => [
      { id: 'gpt-5.5', provider: 'chatgpt' },
      { id: 'grok-4', provider: 'grok' },
    ],
    getMode: () => ({ auto: mode.auto }),
    onRouted,
    ...overrides,
  }
  return { deps, evaluate, selectModel, onRouted, mode }
}

describe('extractPromptText', () => {
  it('joins text blocks and ignores non-text parts', () => {
    expect(extractPromptText({
      sessionId: 's',
      content: [
        { type: 'text', text: 'first' },
        { type: 'image', mediaType: 'image/png', data: 'AAAA' },
        { type: 'text', text: 'second' },
      ],
    })).toBe('first\nsecond')
  })

  it('returns an empty string for missing or malformed payloads', () => {
    expect(extractPromptText(undefined)).toBe('')
    expect(extractPromptText(null)).toBe('')
    expect(extractPromptText('text')).toBe('')
    expect(extractPromptText({ sessionId: 's' })).toBe('')
    expect(extractPromptText({ content: 'not-an-array' })).toBe('')
    expect(extractPromptText({ content: [{ type: 'image' }, { text: 'no type' }, { type: 'text', text: 1 }] })).toBe('')
  })
})

describe('normalizeMode', () => {
  it('keeps valid payloads and defaults illegal input to auto', () => {
    expect(normalizeMode({ auto: true })).toEqual({ auto: true })
    expect(normalizeMode({ auto: false })).toEqual({ auto: false })
    expect(normalizeMode('manual')).toEqual({ auto: false })
    expect(normalizeMode('auto')).toEqual({ auto: true })
    expect(normalizeMode(undefined)).toEqual({ auto: true })
    expect(normalizeMode(null)).toEqual({ auto: true })
    expect(normalizeMode({ auto: 'yes' })).toEqual({ auto: true })
    expect(normalizeMode({})).toEqual({ auto: true })
    expect(normalizeMode(42)).toEqual({ auto: true })
  })
})

describe('flattenModelCandidates', () => {
  it('flattens subscription groups and maps known group names to providers', () => {
    expect(flattenModelCandidates([
      { group: 'ChatGPT (Codex)', models: [{ id: 'gpt-5.5', name: 'GPT-5.5' }, { id: 'gpt-5.5-codex', name: 'GPT-5.5 Codex' }] },
      { group: 'Grok (Subscription)', models: [{ id: 'grok-4', name: 'Grok 4' }] },
      { group: 'OpenRouter', models: [{ id: 'or-x' }] },
    ])).toEqual([
      { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'chatgpt' },
      { id: 'gpt-5.5-codex', name: 'GPT-5.5 Codex', provider: 'chatgpt' },
      { id: 'grok-4', name: 'Grok 4', provider: 'grok' },
      { id: 'or-x', provider: 'OpenRouter' },
    ])
    expect(flattenModelCandidates([])).toEqual([])
    expect(flattenModelCandidates([
      { group: 'G', models: 'bad' as unknown as { id: string }[] },
    ])).toEqual([])
  })
})

describe('withAutoModelRouting', () => {
  it('passes non-prompt methods straight through', async () => {
    const { deps, evaluate, selectModel } = routerDeps()
    const api = hostApi()
    const wrapped = withAutoModelRouting(api, deps)
    const result = await wrapped.call(call('session.list', {}))
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(evaluate).not.toHaveBeenCalled()
    expect(selectModel).not.toHaveBeenCalled()
  })

  it('passes prompts straight through when auto mode is off', async () => {
    const { deps, evaluate, selectModel, mode } = routerDeps()
    mode.auto = false
    const api = hostApi()
    const wrapped = withAutoModelRouting(api, deps)
    const result = await wrapped.call(call('session.prompt', PROMPT))
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(evaluate).not.toHaveBeenCalled()
    expect(selectModel).not.toHaveBeenCalled()
  })

  it('selects the decided model before forwarding the prompt', async () => {
    const { deps, evaluate, selectModel, onRouted } = routerDeps()
    const order: string[] = []
    const api = hostApi({
      call: async (request) => {
        order.push(`api:${request.method}`)
        return { ok: true, value: { accepted: true } }
      },
    })
    selectModel.mockImplementation(async () => { order.push('selectModel') })
    const wrapped = withAutoModelRouting(api, deps)

    const result = await wrapped.call(call('session.prompt', PROMPT))
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({
      state: 'write a haiku about browsers',
      choices: { 'gpt-5.5': 'gpt-5.5', 'grok-4': 'grok-4' },
    }), expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(selectModel).toHaveBeenCalledWith({ sessionId: 'session-1', model: 'gpt-5.5', provider: 'chatgpt' })
    expect(order).toEqual(['selectModel', 'api:session.prompt'])
    expect(onRouted).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1', model: 'gpt-5.5', outcome: 'routed',
    }))
  })

  it('passes through when the decision is not in the candidate set', async () => {
    const { deps, selectModel, onRouted } = routerDeps({
      evaluate: async () => ({ decision: 'not-a-candidate' }),
    })
    const api = hostApi()
    const wrapped = withAutoModelRouting(api, deps)
    const result = await wrapped.call(call('session.prompt', PROMPT))
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(selectModel).not.toHaveBeenCalled()
    expect(onRouted).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1', outcome: 'fallback',
    }))
  })

  it('passes through when evaluate throws or returns no decision', async () => {
    const { deps, selectModel } = routerDeps({
      evaluate: async () => { throw new Error('jev unavailable') },
    })
    const api = hostApi()
    const wrapped = withAutoModelRouting(api, deps)
    const result = await wrapped.call(call('session.prompt', PROMPT))
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(selectModel).not.toHaveBeenCalled()

    const noDecision = routerDeps({ evaluate: async () => ({}) })
    const wrappedNoDecision = withAutoModelRouting(hostApi(), noDecision.deps)
    const result2 = await wrappedNoDecision.call(call('session.prompt', PROMPT))
    expect(result2).toEqual({ ok: true, value: { accepted: true } })
    expect(noDecision.selectModel).not.toHaveBeenCalled()
  })

  it('passes through when evaluate exceeds the timeout budget', async () => {
    const { deps, selectModel } = routerDeps({
      timeoutMs: 30,
      evaluate: (_args, options) => new Promise((_resolve, reject) => {
        const signal = options?.signal
        if (signal?.aborted) reject(new Error('aborted'))
        signal?.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
      }),
    })
    const api = hostApi()
    const wrapped = withAutoModelRouting(api, deps)
    const result = await wrapped.call(call('session.prompt', PROMPT))
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(selectModel).not.toHaveBeenCalled()
  })

  it('still forwards the prompt when evaluate never resolves and ignores the signal', async () => {
    const { deps, selectModel } = routerDeps({
      timeoutMs: 30,
      // A seam that never settles and never consumes the abort: the wrapper's
      // own Promise.race deadline must still release the prompt.
      evaluate: () => new Promise(() => {}),
    })
    const api = hostApi()
    const wrapped = withAutoModelRouting(api, deps)
    const result = await wrapped.call(call('session.prompt', PROMPT))
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(selectModel).not.toHaveBeenCalled()
  })

  it('passes through when the decisions seam is unavailable', async () => {
    const { deps, selectModel } = routerDeps({ evaluate: undefined })
    const api = hostApi()
    const wrapped = withAutoModelRouting(api, deps)
    const result = await wrapped.call(call('session.prompt', PROMPT))
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(selectModel).not.toHaveBeenCalled()
  })

  it('passes through when the prompt lacks a sessionId', async () => {
    const { deps, evaluate, selectModel } = routerDeps()
    const api = hostApi()
    const wrapped = withAutoModelRouting(api, deps)
    const result = await wrapped.call(call('session.prompt', { mode: 'queue', content: [] }))
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(evaluate).not.toHaveBeenCalled()
    expect(selectModel).not.toHaveBeenCalled()
  })

  it('still forwards the prompt when selectModel itself fails', async () => {
    const { deps, selectModel, onRouted } = routerDeps()
    selectModel.mockImplementation(async () => { throw new Error('selectModel rejected') })
    const api = hostApi()
    const wrapped = withAutoModelRouting(api, deps)
    const result = await wrapped.call(call('session.prompt', PROMPT))
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(selectModel).toHaveBeenCalled()
    expect(onRouted).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1', outcome: 'fallback',
    }))
  })

  it('materializes a deferred session before selectModel runs', async () => {
    const order: string[] = []
    const gateway = hostApi({
      call: async (request) => {
        order.push(`api:${request.method}`)
        if (request.method === 'session.create') return { ok: true, value: { sessionId: 'provisional-1' } }
        return { ok: true, value: { accepted: true } }
      },
    })
    const { deps, selectModel } = routerDeps()
    selectModel.mockImplementation(async () => { order.push('selectModel') })
    const wrapped = withSessionDeferral(withAutoModelRouting(gateway, deps), true)

    await wrapped.call(call('session.create', { sessionId: 'provisional-1' }))
    const result = await wrapped.call(call('session.prompt', { ...PROMPT, sessionId: 'provisional-1' }))
    expect(result).toEqual({ ok: true, value: { accepted: true } })
    expect(order).toEqual(['api:session.create', 'selectModel', 'api:session.prompt'])
  })
})
