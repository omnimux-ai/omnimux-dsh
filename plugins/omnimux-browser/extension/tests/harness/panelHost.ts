/**
 * A scripted dsh host for the attach-flow harness.
 *
 * The real `<App />` is mounted untouched: it opens its own `chrome.runtime.connect`
 * port, sends `{ type: 'rpc', id, method, payload }` frames and renders whatever
 * comes back. This module answers those frames in the shape `src/panel/api.ts`
 * parses, so the panel's genuine relay → intake → `session.prompt` path runs in
 * a browser instead of a jsdom stub. No extension, no dsh instance, no network
 * beyond the harness origin.
 *
 * `bridge.fetchMedia` is answered here because that is now the ONLY way the panel
 * can obtain image bytes: the production host performs the request in Node, and
 * this stand-in performs it in the page using the pristine `fetch`, which keeps
 * the panel's own outbound traffic separately observable.
 */

import { BRIDGE_FETCH_MEDIA_METHOD } from 'omnimux-browser/src/protocol.ts'

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
  /** Media URLs the panel tried to reach on its own — must stay empty (AC-9). */
  readonly fetches: string[]
  /** Media URLs the panel asked the host to relay through `bridge.fetchMedia`. */
  readonly relays: string[]
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
  const state: HarnessHostState = { prompts: [], creates: 0, fetches: [], relays: [] }
  const replies = new Set<(message: unknown) => void>()
  // Captured before the recording wrapper goes in: the stand-in host downloads
  // through THIS handle, so anything the wrapper sees came from the product code.
  const hostFetch = globalThis.fetch.bind(globalThis)

  /**
   * The host half of `bridge.fetchMedia`.
   *
   * Real hosts run it in Node; here it runs in the page, which is what makes the
   * harness useful — the relay uses the pristine `fetch`, so the panel's own
   * outbound calls stay separable from the host's.
   */
  const relayMedia = async (url: unknown): Promise<unknown> => {
    if (typeof url !== 'string' || !/^https?:/.test(url)) {
      return { status: 'bad-request', message: 'only http(s) media addresses are fetched' }
    }
    state.relays.push(url)
    try {
      const response = await hostFetch(url)
      if (!response.ok) return { status: 'http-error', statusCode: response.status }
      const buffer = new Uint8Array(await response.arrayBuffer())
      let binary = ''
      for (let at = 0; at < buffer.length; at += 0x8000) {
        binary += String.fromCharCode(...buffer.subarray(at, at + 0x8000))
      }
      return {
        status: 'ok',
        contentType: response.headers.get('content-type') ?? '',
        byteLength: buffer.byteLength,
        data: btoa(binary),
      }
    } catch (cause) {
      return { status: 'failed', message: cause instanceof Error ? cause.message : String(cause) }
    }
  }

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
      case BRIDGE_FETCH_MEDIA_METHOD:
        return relayMedia(isRecord(payload) ? payload.url : undefined)
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
    const deliver = (frame: unknown): void => {
      for (const listener of replies) listener(frame)
    }
    // Awaited: `bridge.fetchMedia` is asynchronous, and a frame carrying a pending
    // Promise as its value would reach the panel as an unreadable payload.
    void Promise.resolve()
      .then(() => rpcValue(method, message.payload))
      .then(
        (value) => deliver({ type: 'rpc.result', id, ok: true, result: method === BRIDGE_FETCH_MEDIA_METHOD ? value : { type: 'server-response', rpcId: id, result: { ok: true, value } } }),
        (cause: unknown) => deliver({
          type: 'rpc.result',
          id,
          ok: true,
          result: { type: 'server-response', rpcId: id, result: { ok: false, error: { code: 'synthetic-error', message: cause instanceof Error ? cause.message : String(cause), details: {} } } },
        }),
      )
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
