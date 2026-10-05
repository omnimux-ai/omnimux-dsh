/**
 * Bridge WebSocket carrier: token-authenticated connection registry, gateway
 * RPC dispatch, per-connection event pump, and tool-call dispatch to the
 * connected browser extension.
 *
 * The route this server mounts (`/ext/bridge`) lives OUTSIDE the /api trust
 * fence (which only guards the client-connection routes), so the bridge brings
 * its own authentication: a bearer token presented in the `hello` frame within
 * HELLO_TIMEOUT_MS. Host calls terminate at the bridge-owned Host adapter.
 * Methods the /api carrier pins to loopback (`PRIVILEGED_METHODS`)
 * stay loopback-only here regardless of the token, defense in depth for
 * `--host 0.0.0.0` deployments.
 *
 * One active connection at a time: a new authenticated socket replaces the
 * previous one (the old socket is closed and its in-flight tool calls settle
 * as `bridge-closed`).
 *
 * @module
 */

import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import type { BrowserHostApi } from './host-api.ts'
import {
  BRIDGE_FETCH_MEDIA_METHOD,
  BRIDGE_COMPLETE_TEXT_METHOD,
  BRIDGE_EVALUATE_DECISION_METHOD,
  BRIDGE_APPEND_COPILOT_LOG_METHOD,
  BRIDGE_INJECT_BROWSER_SNAPSHOT_METHOD,
  BRIDGE_MODEL_MODE_METHOD,
  BRIDGE_PRODUCED_MEDIA_METHOD,
  BRIDGE_SAVE_IMAGE_ASSET_METHOD,
  BRIDGE_SESSION_PURGE_METHOD,
  HELLO_TIMEOUT_MS,
  PING_INTERVAL_MS,
  parseBridgeFrame,
  type BridgeFrame,
  type BridgeCaps,
  type ClientFrame,
  type ImageAssetSaveOutcome,
  type ImageAssetSaveRequest,
  type MediaFetchOutcome,
  type ProducedMediaOutcome,
  type ProducedMediaRequest,
  type ToolErrorCode,
} from './protocol.ts'
import { fetchMediaBytes } from './media-fetch.ts'
import { parseImageAssetPayload } from './image-assets.ts'
import { NULL_PRODUCED_REGISTRY, readProducedMedia, type ProducedRegistry } from './produced-registry.ts'
import { SessionPurgeError } from './session-purge.ts'
import { verifyToken } from './token.ts'

/**
 * Gateway methods the /api carrier pins to loopback (mirror of
 * client-connection's PRIVILEGED_METHODS; kept verbatim so the two fences
 * cannot drift). The bridge rejects these for non-loopback remotes even with
 * a valid token.
 */
const PRIVILEGED_METHODS = new Set([
  'host.pickDirectory',
  'host.openPath',
  'settings.describe',
  'settings.openDocument',
  'settings.update',
  'settings.replace',
  'settings.mutate',
  'credentials.describe',
  'credentials.set',
  'credentials.unset',
])

/** Session mutations whose WebSocket arrival order is behaviorally significant. */
const ORDERED_SESSION_METHODS = new Set([
  BRIDGE_INJECT_BROWSER_SNAPSHOT_METHOD,
  'session.prompt',
  'session.cancel',
  'session.updateQueue',
])

/** Loopback IPv4/IPv6 literals (IPv4-mapped included). Exported for tests and reuse. */
export function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/** Error thrown by requestTool; the tool registry turns it into an isError result. */
export class BridgeToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'BridgeToolError'
  }
}

/** Dependencies the bridge needs from the host. */
export interface BridgeServerDeps {
  /** Bearer token the extension must present in `hello`. */
  token: string
  /** Active dsh Host adapter used for unary calls, events, and waterfalls. */
  api: BrowserHostApi
  /** Default per-tool-call timeout in ms. */
  toolTimeoutMs: number
  /** Capabilities to echo in `hello.ok` (negotiated snapshot budgets). */
  caps: BridgeCaps
  /** Seed a followed-page snapshot into a live or deferred Agent session. */
  injectBrowserSnapshot: (sessionId: string, snapshot: string) => void | Promise<void>
  /**
   * Permanently delete one session's durable storage. Callers archive the
   * session through the gateway first; this only removes files.
   */
  purgeSession: (sessionId: string) => Promise<void>
  /**
   * Download one page media the user explicitly lit, for
   * {@link BRIDGE_FETCH_MEDIA_METHOD}. Defaults to {@link fetchMediaBytes};
   * the seam exists so the routing can be exercised without a live network.
   */
  fetchMedia?: (url: unknown) => Promise<MediaFetchOutcome>
  /**
   * Save one confirmed page image into the host asset library, for
   * {@link BRIDGE_SAVE_IMAGE_ASSET_METHOD} (Issue #3052). Loopback-only in
   * addition to the token handshake. Absent, the RPC answers `unavailable`.
   */
  saveImageAsset?: (request: ImageAssetSaveRequest, ctx: { signal: AbortSignal }) => Promise<ImageAssetSaveOutcome>
  /**
   * The produced-media allowlist shared with the Host adapter's event feed,
   * backing {@link BRIDGE_PRODUCED_MEDIA_METHOD}. Also consulted after a
   * successful session purge: the deleted session's grants die with it.
   * Absent, every produced-media read answers `not-produced` (closed by
   * default).
   */
  produced?: ProducedRegistry
  /**
   * Read one produced file's bytes for {@link BRIDGE_PRODUCED_MEDIA_METHOD}.
   * Defaults to {@link readProducedMedia}; the seam exists so the routing can
   * be exercised without a live filesystem.
   */
  readProduced?: (request: ProducedMediaRequest) => Promise<ProducedMediaOutcome>
  /** Unary Hub text completion; never a session submission receipt. */
  completeText?: (request: { prompt: string; system: string; maxTokens: number; signal: AbortSignal }) => Promise<unknown>
  /** One Jev choice decision for {@link BRIDGE_EVALUATE_DECISION_METHOD}. */
  evaluateDecision?: (
    args: { state: string; choices: Record<string, string>; instructions: string },
    ctx: { signal: AbortSignal },
  ) => Promise<{ decision?: unknown; confidence?: unknown } | undefined>
  /** Append one sanitized copilot log entry for {@link BRIDGE_APPEND_COPILOT_LOG_METHOD}. */
  appendCopilotLog?: (entry: Record<string, unknown>) => Promise<void>
  /**
   * Record the composer's model mode for {@link BRIDGE_MODEL_MODE_METHOD}.
   * Process-level state held by the mount; the host never persists it.
   */
  setModelMode: (mode: { auto: boolean }) => void
  /**
   * Test seam: force the remote address seen by the privilege gate. The
   * sandbox cannot bind arbitrary loopback literals, so the non-loopback
   * branch is exercised through this override; production never sets it.
   */
  remoteAddressOverride?: string
  /** Seconds a fresh socket may present `hello`; defaults to HELLO_TIMEOUT_MS. */
  helloTimeoutMs?: number
  /** Server ping cadence; defaults to PING_INTERVAL_MS. */
  pingIntervalMs?: number
}

/** One in-flight tool call awaiting the extension's `tool.result`. */
interface PendingTool {
  resolve: (result: unknown) => void
  reject: (error: BridgeToolError) => void
  timer: NodeJS.Timeout
}

/** A socket that passed authentication and owns the single active slot. */
interface ReadyConnection {
  ws: WebSocket
  /** Remote address captured at upgrade time (loopback gate for privileged methods). */
  remoteAddress: string | undefined
  abort: AbortController
  pump: Promise<void>
  ping: NodeJS.Timeout
}

function sendFrame(ws: WebSocket, frame: BridgeFrame): void {
  /* v8 ignore next -- teardown race: the socket can die between a pump's
  readiness check and this write; the guard refuses writes on dead sockets */
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(frame))
}

/**
 * Decode one ws message payload to text. Exported so all three delivery
 * shapes (fragmented buffer list, Buffer, ArrayBuffer) are unit-testable
 * directly — node ws only ever delivers Buffers in practice.
 * @param data - ws message payload.
 * @returns the decoded UTF-8 text.
 */
export function messageToText(data: Buffer | ArrayBuffer | Buffer[]): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  return Buffer.from(data).toString('utf8')
}

/**
 * Token-authenticated bridge server. Construct once per plugin instance;
 * dispose with {@link close}.
 */
export class BridgeServer {
  private readonly wss = new WebSocketServer({ noServer: true })
  private current: ReadyConnection | null = null
  private readonly pendingTools = new Map<string, PendingTool>()
  private readonly orderedSessionRpcs = new Map<string, Promise<void>>()
  private readonly produced: ProducedRegistry
  private closed = false

  constructor(private readonly deps: BridgeServerDeps) {
    this.produced = deps.produced ?? NULL_PRODUCED_REGISTRY
  }

  /**
   * Handle one HTTP upgrade for the bridge path.
   * @param req - upgrade request (carries the client's remote address).
   * @param socket - raw socket transferred by the HTTP server.
   * @param head - bytes already read after the upgrade headers.
   */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const remote = this.deps.remoteAddressOverride ?? req.socket.remoteAddress
    this.wss.handleUpgrade(req, socket, head, (ws) => { this.attach(ws, remote) })
  }

  /**
   * Request one browser action from the connected extension.
   * @param name - tool name (also the wire action name).
   * @param args - validated tool arguments.
   * @param signal - caller cancellation (abort settles the call as cancelled).
   * @param timeoutMs - per-call budget; defaults to the plugin config value.
   * @param sessionId - optional owning Agent session for approval continuity.
   * @returns the extension's action result.
   * @throws BridgeToolError when no extension is connected, the call times
   *   out, is cancelled, or the extension reports a failure.
   */
  requestTool(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    timeoutMs: number = this.deps.toolTimeoutMs,
    sessionId?: string,
  ): Promise<unknown> {
    const conn = this.current
    if (conn === null) {
      throw new BridgeToolError('bridge-closed', 'no browser extension is connected to the bridge')
    }
    // A caller that already aborted must not dispatch: the abort listener
    // below does not replay for pre-aborted signals, so the call would be
    // sent to the extension and executed despite the cancellation.
    if (signal.aborted) {
      throw new BridgeToolError('bridge-closed', 'tool call cancelled before dispatch')
    }
    const id = randomUUID()
    const expiresAt = Date.now() + timeoutMs
    return new Promise<unknown>((resolve, reject) => {
      let timer: NodeJS.Timeout
      const settle = (error: BridgeToolError): void => {
        clearTimeout(timer)
        this.pendingTools.delete(id)
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
      const cancel = (error: BridgeToolError): void => {
        // The extension may be paused on a user approval after the caller has
        // stopped waiting. Withdraw that approval before settling locally so
        // a late click cannot execute an expired action.
        sendFrame(conn.ws, { t: 'tool.cancel', id })
        settle(error)
      }
      const onAbort = (): void => {
        cancel(new BridgeToolError('bridge-closed', 'tool call cancelled before the extension answered'))
      }
      timer = setTimeout(() => {
        cancel(new BridgeToolError('timeout', `browser action "${name}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      signal.addEventListener('abort', onAbort, { once: true })
      this.pendingTools.set(id, { resolve, reject, timer })
      conn.ws.send(JSON.stringify({
        t: 'tool.call',
        id,
        name,
        args,
        expiresAt,
        ...(sessionId === undefined ? {} : { sessionId }),
      } satisfies BridgeFrame), (error) => {
        /* v8 ignore next -- teardown race: when the write fails, the socket's
        close handler settles the same call with the same code; the callback
        path is a defensive second settle, covered via the close path */
        if (error != null) {
          settle(new BridgeToolError('bridge-closed', `bridge socket failed before delivery: ${error.message}`))
        }
      })
    })
  }

  /**
   * Terminate the server: close the acceptor, drop all sockets, reject all
   * in-flight tool calls.
   * @returns a promise resolving after the acceptor and all pumps stop.
   */
  async close(): Promise<void> {
    // Idempotent: a second close must not touch the acceptor (ws throws
    // "The server is not running" when closing an already-closed server).
    if (this.closed) return
    this.closed = true
    // Capture the live pump BEFORE replaceConnection nulls the connection.
    const pumps = this.current === null ? [] : [this.current.pump]
    this.replaceConnection()
    for (const socket of this.wss.clients) socket.terminate()
    this.current = null
    await new Promise<void>((resolve, reject) => {
      this.wss.close((error) => {
        /* v8 ignore next -- acceptor close cannot fail: close() is idempotent
        and the noServer acceptor only reports teardown of already-terminated clients */
        if (error === undefined) resolve()
        /* v8 ignore next -- same unreachable arm */
        else reject(error)
      })
    })
    await Promise.all(pumps)
  }

  /** @returns whether an authenticated extension is currently connected. */
  hasConnection(): boolean {
    return this.current !== null
  }

  private attach(ws: WebSocket, remoteAddress: string | undefined): void {
    let helloTimer: NodeJS.Timeout | undefined = setTimeout(() => {
      ws.close(4001, 'hello timeout')
    }, this.deps.helloTimeoutMs ?? HELLO_TIMEOUT_MS)

    const onMessage = (data: Buffer | ArrayBuffer | Buffer[]): void => {
      const text = messageToText(data)
      const frame = parseBridgeFrame(text)
      if (frame === undefined) {
        ws.close(1008, 'unparseable frame')
        return
      }
      if (helloTimer !== undefined) {
        // Pending state: only `hello` is legal.
        if (frame.t !== 'hello') {
          ws.close(1008, 'hello first')
          return
        }
        // Origin identifies a browser context, not a paired installation.
        if (!verifyToken(this.deps.token, frame.token)) {
          ws.close(4002, 'bad token')
          return
        }
        clearTimeout(helloTimer)
        helloTimer = undefined
        this.promote(ws, remoteAddress)
        return
      }
      this.handleReadyFrame(frame)
    }
    const onClose = (): void => {
      if (helloTimer !== undefined) clearTimeout(helloTimer)
      if (this.current !== null && this.current.ws === ws) this.replaceConnection()
    }
    ws.on('message', onMessage)
    ws.once('close', onClose)
    ws.once('error', onClose)
  }

  /** Promote an authenticated socket to the single active slot. */
  private promote(ws: WebSocket, remoteAddress: string | undefined): void {
    this.replaceConnection()
    const abort = new AbortController()
    const ping = setInterval(() => { sendFrame(ws, { t: 'ping' }) }, this.deps.pingIntervalMs ?? PING_INTERVAL_MS)
    const pump = (async () => {
      try {
        for await (const frame of this.deps.api.events(abort.signal)) {
          if (ws.readyState !== WebSocket.OPEN) break
          sendFrame(ws, {
            t: 'event',
            frame,
          })
        }
      } catch (error: unknown) {
        if (!abort.signal.aborted && ws.readyState === WebSocket.OPEN) {
          sendFrame(ws, { t: 'error', code: 'stream-failed', message: String(error) })
          // An authenticated socket without its Remote streams is unusable but
          // otherwise appears healthy to the extension. Closing the generation
          // activates its bounded reconnect loop and rebuilds every follower.
          ws.close(1011, 'event stream failed')
        }
      }
    })()
    this.current = { ws, remoteAddress, abort, pump, ping }
    sendFrame(ws, { t: 'hello.ok', caps: this.deps.caps })
    ws.once('close', () => {
      clearInterval(ping)
      abort.abort()
    })
  }

  private handleReadyFrame(frame: BridgeFrame): void {
    switch (frame.t) {
      case 'rpc':
        this.routeRpc(frame)
        break
      case 'respond':
        void this.handleRespond(frame)
        break
      case 'tool.result':
        this.settleTool(frame.id, frame.ok, frame.ok ? frame.result : frame.error)
        break
      case 'pong':
      case 'hello':
      case 'hello.ok':
      case 'rpc.result':
      case 'respond.result':
      case 'event':
      case 'tool.call':
      case 'tool.cancel':
      case 'ping':
      case 'error':
        // Protocol violations and unsolicited server-side shapes are ignored;
        // the extension is the only sender on this channel.
        break
    }
  }

  /**
   * Preserve prompt/cancel arrival order per session. In particular, the
   * first prompt may still be materializing a provisional session; its cancel
   * must not reach the gateway until that admission has completed.
   */
  private routeRpc(frame: Extract<ClientFrame, { t: 'rpc' }>): void {
    const sessionId = orderedSessionId(frame)
    if (sessionId === undefined) {
      void this.handleRpc(frame)
      return
    }
    const previous = this.orderedSessionRpcs.get(sessionId) ?? Promise.resolve()
    const task = previous.then(
      () => this.handleRpc(frame),
      () => this.handleRpc(frame),
    )
    this.orderedSessionRpcs.set(sessionId, task)
    const clear = (): void => {
      if (this.orderedSessionRpcs.get(sessionId) === task) this.orderedSessionRpcs.delete(sessionId)
    }
    void task.then(clear, clear)
  }

  private async handleRpc(frame: Extract<ClientFrame, { t: 'rpc' }>): Promise<void> {
    const conn = this.current
    /* v8 ignore next -- replacement race: a frame can land between a socket
    replacement and the next promotion; the re-check keeps the handler total */
    if (conn === null) return
    const forbidden = PRIVILEGED_METHODS.has(frame.method) && !isLoopbackAddress(conn.remoteAddress)
    if (forbidden) {
      sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code: 'forbidden', message: 'method is loopback-only' } })
      return
    }
    if (frame.method === BRIDGE_INJECT_BROWSER_SNAPSHOT_METHOD) {
      const payload = browserSnapshotPayload(frame.payload)
      if (payload === undefined) {
        sendFrame(conn.ws, {
          t: 'rpc.result',
          id: frame.id,
          ok: false,
          error: { code: 'bad-request', message: 'sessionId and snapshot must be non-empty strings' },
        })
        return
      }
      try {
        await this.deps.injectBrowserSnapshot(payload.sessionId, payload.snapshot)
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: true, result: { accepted: true } })
      } catch (error: unknown) {
        sendFrame(conn.ws, {
          t: 'rpc.result',
          id: frame.id,
          ok: false,
          error: { code: 'internal', message: String(error) },
        })
      }
      return
    }
    if (frame.method === BRIDGE_SESSION_PURGE_METHOD) {
      const sessionId = purgeSessionPayload(frame.payload)
      if (sessionId === undefined) {
        sendFrame(conn.ws, {
          t: 'rpc.result',
          id: frame.id,
          ok: false,
          error: { code: 'bad-request', message: 'sessionId must be a non-empty string' },
        })
        return
      }
      try {
        await this.deps.purgeSession(sessionId)
        // Durable storage is gone, so every produced-media grant the session
        // accumulated must die with it — a leftover path could otherwise serve
        // a recycled file under a stale session id.
        this.produced.drop(sessionId)
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: true, result: { purged: true } })
      } catch (error: unknown) {
        const code = error instanceof SessionPurgeError ? error.code : 'internal'
        const message = error instanceof Error ? error.message : String(error)
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code, message } })
      }
      return
    }
    if (frame.method === BRIDGE_COMPLETE_TEXT_METHOD) {
      const payload = frame.payload as { prompt?: unknown; system?: unknown } | null
      if (!payload || typeof payload.prompt !== 'string' || !payload.prompt.trim()
        || payload.prompt.length > 32_768 || (payload.system !== undefined && (typeof payload.system !== 'string' || payload.system.length > 32_768))) {
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code: 'bad-request', message: 'prompt and optional system must be bounded strings' } })
        return
      }
      const deadline = new AbortController()
      const signal = AbortSignal.any([conn.abort.signal, deadline.signal])
      const timer = setTimeout(() => deadline.abort(new Error('Text completion timed out')), 25_000)
      let onAbort: (() => void) | undefined
      try {
        if (!this.deps.completeText) throw new Error('Text completion service unavailable')
        const aborted = new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(signal.reason)
          signal.addEventListener('abort', onAbort, { once: true })
          if (signal.aborted) onAbort()
        })
        signal.throwIfAborted()
        const value = await Promise.race([this.deps.completeText({ prompt: payload.prompt, system: typeof payload.system === 'string' ? payload.system : '', maxTokens: 1000, signal }), aborted])
        const text = typeof value === 'string' ? value : (value as { text?: unknown })?.text
        if (typeof text !== 'string' || !text.trim()) throw new Error('Text completion returned no text')
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: true, result: { text: text.trim() } })
      } catch (error: unknown) {
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code: 'completion-failed', message: error instanceof Error ? error.message : String(error) } })
      } finally {
        clearTimeout(timer)
        if (onAbort) signal.removeEventListener('abort', onAbort)
      }
      return
    }
    if (frame.method === BRIDGE_EVALUATE_DECISION_METHOD) {
      const args = parseDecisionArgs(frame.payload)
      if (args === undefined) {
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code: 'bad-request', message: 'state (≤4000 chars), 1–10 choices and instructions are required' } })
        return
      }
      if (!this.deps.evaluateDecision) {
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code: 'decision-unavailable', message: 'Decision service unavailable' } })
        return
      }
      const signal = AbortSignal.any([conn.abort.signal, AbortSignal.timeout(DECISION_TIMEOUT_MS)])
      try {
        const verdict = await Promise.race([
          this.deps.evaluateDecision(args, { signal }),
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('Decision timed out')), { once: true })
          }),
        ])
        const decision = typeof verdict?.decision === 'string' ? verdict.decision : undefined
        sendFrame(conn.ws, {
          t: 'rpc.result',
          id: frame.id,
          ok: true,
          result: {
            ...(decision === undefined ? {} : { decision }),
            ...(typeof verdict?.confidence === 'number' ? { confidence: verdict.confidence } : {}),
          },
        })
      } catch (error: unknown) {
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code: 'decision-failed', message: error instanceof Error ? error.message : String(error) } })
      }
      return
    }
    if (frame.method === BRIDGE_APPEND_COPILOT_LOG_METHOD) {
      const entry = sanitizeCopilotLogEntry(frame.payload)
      if (entry === undefined) {
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code: 'bad-request', message: 'entry must be an object with traceId and outcome, ≤16KB' } })
        return
      }
      try {
        if (!this.deps.appendCopilotLog) throw new Error('Copilot log unavailable')
        await this.deps.appendCopilotLog(entry)
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: true, result: { persisted: true } })
      } catch (error: unknown) {
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code: 'log-failed', message: error instanceof Error ? error.message : String(error) } })
      }
      return
    }
    if (frame.method === BRIDGE_MODEL_MODE_METHOD) {
      // Set-only: `auto` decides routing; `modelId` is reserved for the manual
      // selection and intentionally not consumed by this method version.
      const mode = modelModePayload(frame.payload)
      if (mode === undefined) {
        sendFrame(conn.ws, {
          t: 'rpc.result',
          id: frame.id,
          ok: false,
          error: { code: 'bad-request', message: 'auto must be a boolean' },
        })
        return
      }
      try {
        this.deps.setModelMode(mode)
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: true, result: { applied: true } })
      } catch (error: unknown) {
        sendFrame(conn.ws, {
          t: 'rpc.result',
          id: frame.id,
          ok: false,
          error: { code: 'internal', message: String(error) },
        })
      }
      return
    }
    if (frame.method === BRIDGE_PRODUCED_MEDIA_METHOD) {
      // Local plugin method (like fetchMedia): it never reaches the gateway,
      // and it is not a privileged method — the produced registry is the gate.
      const request = producedMediaPayload(frame.payload)
      if (request === undefined) {
        sendFrame(conn.ws, {
          t: 'rpc.result',
          id: frame.id,
          ok: false,
          error: { code: 'bad-request', message: 'sessionId and path must be non-empty strings' },
        })
        return
      }
      const readProduced = this.deps.readProduced
        ?? ((payload: ProducedMediaRequest) => readProducedMedia(this.produced, payload))
      try {
        const outcome = await readProduced(request)
        // Outcomes ride a SUCCESSFUL frame for the same reason fetchMedia's do:
        // the extension port flattens carrier errors into one code, and the
        // panel must still tell not-produced apart from too-large.
        sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: true, result: outcome })
      } catch (error: unknown) {
        sendFrame(conn.ws, {
          t: 'rpc.result',
          id: frame.id,
          ok: false,
          error: { code: 'internal', message: String(error) },
        })
      }
      return
    }
    if (frame.method === BRIDGE_SAVE_IMAGE_ASSET_METHOD) {
      // A disk write is strictly loopback beyond the token handshake: the
      // media read may tolerate remote clients, this method never may.
      if (!isLoopbackAddress(conn.remoteAddress)) {
        sendFrame(conn.ws, {
          t: 'rpc.result',
          id: frame.id,
          ok: false,
          error: { code: 'forbidden', message: 'method is loopback-only' },
        })
        return
      }
      const request = parseImageAssetPayload(frame.payload)
      if (request === undefined) {
        sendFrame(conn.ws, {
          t: 'rpc.result',
          id: frame.id,
          ok: false,
          error: { code: 'bad-request', message: 'requestId, url, pageUrl and optional title must be bounded strings; no extra fields' },
        })
        return
      }
      const save = this.deps.saveImageAsset
      let outcome: ImageAssetSaveOutcome
      if (save === undefined) {
        outcome = { status: 'unavailable' }
      } else {
        try {
          outcome = await save(request, { signal: conn.abort.signal })
        } catch (error: unknown) {
          // The adapter returns its outcome for every expected refusal; a throw
          // means the save itself broke, which is a storage failure to the
          // caller — never an internal detail.
          console.error('[omnimux-browser] saveImageAsset threw', error)
          outcome = { status: 'storage-failed' }
        }
      }
      sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: true, result: outcome })
      return
    }
    if (frame.method === BRIDGE_FETCH_MEDIA_METHOD) {
      // The outcome travels as a SUCCESSFUL frame on purpose: a 404 or a timeout
      // on a third-party server is an expected answer to "fetch this", and the
      // extension port rewrites carrier-level errors into a single code, which
      // would erase the distinction the panel's message depends on.
      const fetchMedia = this.deps.fetchMedia ?? fetchMediaBytes
      const outcome = await fetchMedia(mediaFetchUrl(frame.payload))
      sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: true, result: outcome })
      return
    }
    try {
      const result = await this.deps.api.call({
        rpcId: frame.id,
        method: frame.method,
        payload: frame.payload,
        signal: conn.abort.signal,
      })
      sendFrame(conn.ws, {
        t: 'rpc.result',
        id: frame.id,
        ok: true,
        result: { type: 'server-response', rpcId: frame.id, result },
      })
    } catch (error: unknown) {
      sendFrame(conn.ws, { t: 'rpc.result', id: frame.id, ok: false, error: { code: 'internal', message: String(error) } })
    }
  }

  /** Relay a pending Host waterfall response through the active adapter. */
  private async handleRespond(frame: Extract<ClientFrame, { t: 'respond' }>): Promise<void> {
    const conn = this.current
    /* v8 ignore next -- replacement race; a closed socket simply drops the receipt */
    if (conn === null) return
    try {
      const result = await this.deps.api.respond(frame.rpcId, frame.result, conn.abort.signal)
      sendFrame(conn.ws, { t: 'respond.result', id: frame.id, ok: true, result })
    } catch (error: unknown) {
      sendFrame(conn.ws, { t: 'respond.result', id: frame.id, ok: false, error: { code: 'internal', message: String(error) } })
    }
  }

  private settleTool(id: string, ok: boolean, payload: unknown): void {
    const pending = this.pendingTools.get(id)
    if (pending === undefined) return
    clearTimeout(pending.timer)
    this.pendingTools.delete(id)
    if (ok) pending.resolve(payload)
    else pending.reject(new BridgeToolError(payloadCode(payload), payloadMessage(payload)))
  }

  /** Close the current connection (if any) and settle its in-flight calls. */
  private replaceConnection(): void {
    const conn = this.current
    if (conn === null) return
    this.current = null
    clearInterval(conn.ping)
    conn.abort.abort()
    if (conn.ws.readyState === WebSocket.OPEN || conn.ws.readyState === WebSocket.CONNECTING) {
      conn.ws.close(4000, 'replaced')
    }
    for (const [id, pending] of this.pendingTools) {
      clearTimeout(pending.timer)
      this.pendingTools.delete(id)
      pending.reject(new BridgeToolError('bridge-closed', 'the extension connection was replaced'))
    }
  }
}

function browserSnapshotPayload(payload: unknown): { sessionId: string; snapshot: string } | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const { sessionId, snapshot } = payload as Record<string, unknown>
  if (typeof sessionId !== 'string' || sessionId.trim() === '') return undefined
  if (typeof snapshot !== 'string' || snapshot.trim() === '') return undefined
  return { sessionId, snapshot }
}

function modelModePayload(payload: unknown): { auto: boolean } | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const { auto } = payload as Record<string, unknown>
  if (typeof auto !== 'boolean') return undefined
  return { auto }
}

/** Decision budget for {@link BRIDGE_EVALUATE_DECISION_METHOD}; callers fall back to rules past it. */
export const DECISION_TIMEOUT_MS = 3_000

/** Bounded `{state, choices, instructions}` for one Jev choice decision. */
export function parseDecisionArgs(payload: unknown):
  | { state: string; choices: Record<string, string>; instructions: string }
  | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const { state, choices, instructions } = payload as Record<string, unknown>
  if (typeof state !== 'string' || !state.trim() || state.length > 4000) return undefined
  if (typeof instructions !== 'string' || !instructions.trim() || instructions.length > 2000) return undefined
  if (typeof choices !== 'object' || choices === null || Array.isArray(choices)) return undefined
  const entries = Object.entries(choices as Record<string, unknown>)
  if (entries.length < 1 || entries.length > 10) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of entries) {
    if (typeof v !== 'string' || !k || k.length > 64 || v.length > 500) return undefined
    out[k] = v
  }
  return { state, choices: out, instructions }
}

const COPILOT_LOG_MAX_BYTES = 16 * 1024
const COPILOT_LOG_STRING_FIELDS = ['traceId', 'ts', 'scene', 'itemId', 'locale', 'inputMode'] as const
const COPILOT_LOG_OBJECT_FIELDS = ['perspective', 'seedPick', 'generation', 'outcome'] as const
const COPILOT_FEED_SOURCES = ['for_you', 'following', 'page'] as const

/**
 * Keep only whitelisted copilot log fields and cap free text, so a buggy or
 * hostile page can never turn the log into a dump of full tweets or secrets.
 */
export function sanitizeCopilotLogEntry(payload: unknown): Record<string, unknown> | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const raw = payload as Record<string, unknown>
  if (typeof raw.traceId !== 'string' || !/^tw_[\w-]{1,64}$/.test(raw.traceId)) return undefined
  if (typeof raw.outcome !== 'object' || raw.outcome === null) return undefined
  const out: Record<string, unknown> = {}
  for (const key of COPILOT_LOG_STRING_FIELDS) {
    if (typeof raw[key] === 'string') out[key] = (raw[key] as string).slice(0, 64)
  }
  for (const key of ['candidatesScanned', 'qualifiedCount'] as const) {
    if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) out[key] = raw[key]
  }
  if (Array.isArray(raw.keywords)) {
    out.keywords = raw.keywords.filter((k): k is string => typeof k === 'string').slice(0, 12).map((k) => k.slice(0, 24))
  }
  if (typeof raw.sourcesScanned === 'object' && raw.sourcesScanned !== null && !Array.isArray(raw.sourcesScanned)) {
    const scanned: Record<string, number> = {}
    for (const key of COPILOT_FEED_SOURCES) {
      const n = (raw.sourcesScanned as Record<string, unknown>)[key]
      if (typeof n === 'number' && Number.isFinite(n)) scanned[key] = n
    }
    out.sourcesScanned = scanned
  }
  if (Array.isArray(raw.seeds)) {
    out.seeds = raw.seeds.slice(0, 3).flatMap((s) => {
      if (typeof s !== 'object' || s === null) return []
      const seed = s as Record<string, unknown>
      return [{
        author: typeof seed.author === 'string' ? seed.author.slice(0, 64) : '',
        textSnippet: typeof seed.textSnippet === 'string' ? seed.textSnippet.slice(0, 200) : '',
        total: typeof seed.total === 'number' ? seed.total : 0,
        ...(typeof seed.scores === 'object' && seed.scores !== null ? { scores: seed.scores } : {}),
        ...(typeof seed.source === 'string' && (COPILOT_FEED_SOURCES as readonly string[]).includes(seed.source) ? { source: seed.source } : {}),
        ...(seed.isQuote === true ? { isQuote: true } : {}),
      }]
    })
  }
  for (const key of COPILOT_LOG_OBJECT_FIELDS) {
    if (typeof raw[key] === 'object' && raw[key] !== null && !Array.isArray(raw[key])) out[key] = raw[key]
  }
  if (Buffer.byteLength(JSON.stringify(out), 'utf8') > COPILOT_LOG_MAX_BYTES) return undefined
  return out
}

function purgeSessionPayload(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const { sessionId } = payload as Record<string, unknown>
  if (typeof sessionId !== 'string' || sessionId.trim() === '') return undefined
  return sessionId
}

/**
 * The media address out of a {@link BRIDGE_FETCH_MEDIA_METHOD} payload.
 *
 * Absent or unreadable input is passed through as `undefined`, which
 * {@link fetchMediaBytes} answers with `bad-request` — the host refuses to dial
 * anything it was not handed as a plain string, so the decision to fetch and the
 * decision to trust the address can never disagree.
 */
function mediaFetchUrl(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  return (payload as Record<string, unknown>).url
}

/**
 * The `{sessionId, path}` pair out of a {@link BRIDGE_PRODUCED_MEDIA_METHOD}
 * payload. Both fields must be non-empty strings; anything else is
 * `bad-request`, before the registry is ever consulted.
 */
function producedMediaPayload(payload: unknown): ProducedMediaRequest | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const { sessionId, path } = payload as Record<string, unknown>
  if (typeof sessionId !== 'string' || sessionId.trim() === '') return undefined
  if (typeof path !== 'string' || path.trim() === '') return undefined
  return { sessionId, path }
}

function orderedSessionId(frame: Extract<ClientFrame, { t: 'rpc' }>): string | undefined {
  if (!ORDERED_SESSION_METHODS.has(frame.method)) return undefined
  if (typeof frame.payload !== 'object' || frame.payload === null || Array.isArray(frame.payload)) return undefined
  const sessionId = (frame.payload as Record<string, unknown>).sessionId
  return typeof sessionId === 'string' ? sessionId : undefined
}

/**
 * Tool error payload → stable code. The wire parser enforces string fields,
 * so the fallback branches are parser-gated; exported so the fallback
 * contract is unit-testable directly.
 * @param payload - extension-reported error payload.
 * @returns the stable error code.
 */
export function payloadCode(payload: unknown): ToolErrorCode {
  if (typeof payload === 'object' && payload !== null) {
    const code = (payload as { code?: unknown }).code
    if (typeof code === 'string') return code as ToolErrorCode
    return 'internal'
  }
  return 'internal'
}

/**
 * Tool error payload → message. The wire parser enforces string fields, so
 * the fallback branches are parser-gated; exported so the fallback contract
 * is unit-testable directly.
 * @param payload - extension-reported error payload.
 * @returns the human-readable message.
 */
export function payloadMessage(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    const message = (payload as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
    return 'browser action failed'
  }
  return 'browser action failed'
}
