/**
 * A scripted dsh host for the attach-flow harness.
 *
 * The real `<App />` is mounted untouched: it opens its own `chrome.runtime.connect`
 * port, sends `{ type: 'rpc', id, method, payload }` frames and renders whatever
 * comes back. This module answers those frames in the shape `src/panel/api.ts`
 * parses, so the panel's genuine download → intake → `session.prompt` path runs in
 * a browser instead of a jsdom stub. No extension, no dsh instance, no network
 * beyond the harness origin.
 */

/** The host's image projection, as `session.history` carries it. */
export const HARNESS_IMAGE_LIMITS = {
  maxImageBytes: 5 * 1024 * 1024,
  maxImagesPerMessage: 4,
  maxMessageImageBytes: 12 * 1024 * 1024,
  maxImagePixels: 16_000_000,
  maxImageDimension: 4096,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

/** One captured `session.prompt` request body. */
interface CapturedPrompt {
  readonly sessionId: unknown
  readonly content: Array<{ type?: string; text?: string; mediaType?: string; name?: string; data?: string }>
}

export interface HarnessHostState {
  /** Every `session.prompt` the panel posted, in order. */
  readonly prompts: CapturedPrompt[]
  /** Every `session.create` call, so a test can prove the session came up. */
  creates: number
  /** Media URLs the panel actually fetched. Anything not in here was never requested. */
  readonly fetches: string[]
}

interface PortLike {
  postMessage: (message: unknown) => void
  onMessage: { addListener: (listener: (message: unknown) => void) => void }
  onDisconnect: { addListener: (listener: () => void) => void }
  disconnect: () => void
  name: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Install the fake browser + host on `window`; returns the observable state. */
export function installHarnessHost(): HarnessHostState {
  const state: HarnessHostState = { prompts: [], creates: 0, fetches: [] }
  const replies = new Set<(message: unknown) => void>()

  const rpcValue = (method: string, payload: unknown): unknown => {
    switch (method) {
      case 'session.create':
        state.creates += 1
        return { sessionId: 'harness-session' }
      case 'session.history':
        return {
          events: [],
          projections: { asOfSeq: -1, values: { imageLimits: HARNESS_IMAGE_LIMITS } },
        }
      case 'session.prompt':
        state.prompts.push(payload as CapturedPrompt)
        return {}
      case 'session.selectModel':
      case 'session.cancel':
        return {}
      default:
        throw new Error(`harness host: unexpected rpc ${method}`)
    }
  }

  const handle = (message: unknown): void => {
    if (!isRecord(message) || message.type !== 'rpc') return
    const id = message.id
    const method = String(message.method ?? '')
    let frame: unknown
    try {
      frame = { type: 'rpc.result', id, ok: true, result: { result: { ok: true, value: rpcValue(method, message.payload) } } }
    } catch (cause) {
      frame = {
        type: 'rpc.result',
        id,
        ok: true,
        result: { result: { ok: false, error: { message: cause instanceof Error ? cause.message : String(cause) } } },
      }
    }
    for (const listener of replies) listener(frame)
  }

  /** Push a host-initiated frame (status, resume hint, media.attach) at the panel. */
  const push = (frame: unknown): void => {
    for (const listener of replies) listener(frame)
  }

  const port: PortLike = {
    name: 'dsh-panel',
    postMessage: handle,
    onMessage: { addListener: (listener) => { replies.add(listener) } },
    onDisconnect: { addListener: () => {} },
    disconnect: () => {},
  }

  const noop = (): void => {}
  const chromeStub = {
    runtime: {
      connect: () => port,
      sendMessage: async () => null,
      onMessage: { addListener: noop, removeListener: noop },
      getURL: (path: string) => path,
    },
    storage: {
      local: {
        get: async () => ({ dshSettings: { autoResumeSession: false } }),
        set: async () => {},
        remove: async () => {},
      },
    },
    windows: { getCurrent: async () => ({ id: 1 }) },
    tabs: {
      query: async () => [] as unknown[],
      sendMessage: async () => null,
      onActivated: { addListener: noop, removeListener: noop },
      onUpdated: { addListener: noop, removeListener: noop },
    },
  }
  Object.assign(globalThis, { chrome: chromeStub })

  // Record every outbound media request so the panel's "only on attach" promise
  // is checked against real traffic rather than a spy on the product's own code.
  const realFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    state.fetches.push(url)
    return realFetch(input, init)
  }) as typeof fetch

  Object.assign(globalThis, { __harnessHost: { state, push } })
  return state
}

/** The handle the acceptance script drives the panel through. */
export interface HarnessHostHandle {
  state: HarnessHostState
  push: (frame: unknown) => void
}

export function harnessHost(): HarnessHostHandle {
  const handle = (globalThis as unknown as { __harnessHost?: HarnessHostHandle }).__harnessHost
  if (handle === undefined) throw new Error('harness host: installHarnessHost() has not run')
  return handle
}
