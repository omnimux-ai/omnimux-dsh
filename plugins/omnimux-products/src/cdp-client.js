/**
 * A minimal Chrome DevTools Protocol client — four domains, zero dependencies.
 *
 * Playwright and puppeteer would each pull a second browser and hundreds of
 * megabytes of native code into a plugin whose host already ships Chromium.
 * This module speaks CDP over Node's built-in global `WebSocket` instead:
 * `Target.createTarget` → `Target.attachToTarget` → `Emulation.setDeviceMetricsOverride`
 * → `Page.navigate` → `Page.captureScreenshot`.
 *
 * Every failure is raised as a `CdpError` carrying one of the contract reason
 * codes, so the caller never has to classify a raw protocol error.
 *
 * Spec: `specs/digital-product-website-screenshots.spec.md` §2.1, §4.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CAPTURE_BEYOND_VIEWPORT,
  NAV_TIMEOUT_MS,
  PORT_DISCOVERY_MS,
  SCREENSHOT_REASON,
} from './screenshot-contract.js'

/** One connection per socket, keyed weakly so nothing leaks between runs. */
const CONNECTIONS = new WeakMap()

/**
 * A CDP or browser-level failure tagged with a contract reason code.
 */
export class CdpError extends Error {
  /**
   * @param {string} reason one of `SCREENSHOT_REASON`
   * @param {string} message
   */
  constructor(reason, message) {
    super(message)
    this.name = 'CdpError'
    this.reason = reason
  }
}

/**
 * @param {string} userDataDir
 * @returns {string[]} the switches for a throwaway, headless, network-quiet run
 */
export function browserArgs(userDataDir) {
  return [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-client-side-phishing-detection',
    '--disable-default-apps',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--window-size=1440,900',
    'about:blank',
  ]
}

/**
 * Read `DevToolsActivePort` until the browser writes the port it chose.
 *
 * The file holds two lines: the port, then the WebSocket path.
 *
 * @param {string} portFile
 * @param {{ budgetMs?: number, sleep?: (ms: number) => Promise<void>, now?: () => number, read?: (file: string) => string }} [deps]
 * @returns {Promise<{ port: number, wsPath: string }>}
 * @throws {CdpError} `launch-failed`
 */
export async function discoverEndpoint(portFile, deps = {}) {
  const budgetMs = Number.isFinite(deps.budgetMs) ? Number(deps.budgetMs) : PORT_DISCOVERY_MS
  const sleep = deps.sleep ?? defaultSleep
  const now = deps.now ?? Date.now
  const read = deps.read ?? ((file) => readFileSync(file, 'utf8'))
  const deadline = now() + budgetMs

  for (;;) {
    try {
      const lines = String(read(portFile)).split('\n').map((line) => line.trim()).filter(Boolean)
      const port = Number(lines[0])
      if (Number.isInteger(port) && port > 0) {
        return { port, wsPath: lines[1] ?? '/devtools/browser' }
      }
    } catch {
      // Not written yet — keep waiting inside the budget.
    }
    if (now() >= deadline) {
      throw new CdpError(SCREENSHOT_REASON.LAUNCH_FAILED, 'the browser never reported a debugging port')
    }
    await sleep(50)
  }
}

/**
 * Start one headless browser with its own throwaway profile.
 *
 * The profile directory is created here and destroyed by `dispose`, so the
 * user's own Chrome profile, cookies and sign-ins are never touched.
 *
 * @param {string} binPath
 * @param {{ userDataDir?: string, budgetMs?: number, spawnImpl?: typeof spawn, sleep?: Function, now?: Function, read?: Function, fetchVersion?: Function }} [opts]
 * @returns {Promise<{ child: import('node:child_process').ChildProcess, port: number, webSocketDebuggerUrl: string, userDataDir: string, dispose: () => Promise<void> }>}
 * @throws {CdpError} `launch-failed`
 */
export async function launchBrowser(binPath, opts = {}) {
  const spawnImpl = opts.spawnImpl ?? spawn
  const userDataDir = opts.userDataDir ?? mkdtempSync(join(tmpdir(), 'omnimux-shots-'))
  let child = null
  try {
    child = spawnImpl(binPath, browserArgs(userDataDir), { stdio: 'ignore', windowsHide: true })
    if (child && typeof child.on === 'function') child.on('error', () => {})
    const { port } = await discoverEndpoint(join(userDataDir, 'DevToolsActivePort'), {
      budgetMs: opts.budgetMs ?? PORT_DISCOVERY_MS,
      sleep: opts.sleep,
      now: opts.now,
      read: opts.read,
    })
    const version = await (opts.fetchVersion ?? fetchVersionAt)(port)
    return {
      child,
      port,
      webSocketDebuggerUrl: version.webSocketDebuggerUrl,
      userDataDir,
      dispose: () => dispose({ child, userDataDir }),
    }
  } catch (error) {
    await dispose({ child, userDataDir })
    if (error instanceof CdpError) throw error
    throw new CdpError(SCREENSHOT_REASON.LAUNCH_FAILED, messageOf(error))
  }
}

/**
 * @param {number} port
 * @returns {Promise<{ webSocketDebuggerUrl: string }>}
 */
async function fetchVersionAt(port) {
  const response = await fetch(`http://127.0.0.1:${String(port)}/json/version`)
  if (!response.ok) {
    throw new CdpError(SCREENSHOT_REASON.LAUNCH_FAILED, `the browser answered HTTP ${String(response.status)}`)
  }
  const body = await response.json()
  const url = typeof body?.webSocketDebuggerUrl === 'string' ? body.webSocketDebuggerUrl : ''
  if (!url) throw new CdpError(SCREENSHOT_REASON.LAUNCH_FAILED, 'the browser reported no debugger url')
  return { webSocketDebuggerUrl: url }
}

/**
 * Kill the process and remove the throwaway profile. Best effort by contract:
 * a cleanup failure must never mask the result the caller already has.
 *
 * @param {{ child?: import('node:child_process').ChildProcess | null, userDataDir?: string }} handle
 * @returns {Promise<void>}
 */
export async function dispose(handle = {}) {
  const child = handle.child
  if (child) {
    try {
      child.kill('SIGKILL')
    } catch {
      // Already gone.
    }
  }
  if (handle.userDataDir) {
    try {
      rmSync(handle.userDataDir, { recursive: true, force: true, maxRetries: 3 })
    } catch {
      // A locked profile directory is not worth failing an import over.
    }
  }
}

/**
 * Wrap one socket in a request/response + event connection.
 *
 * @param {WebSocket} ws
 * @returns {{ send: (method: string, params?: object, sessionId?: string) => Promise<any>, on: (method: string, handler: Function) => () => void, close: () => void }}
 */
export function createConnection(ws) {
  let nextId = 1
  /** @type {Map<number, { resolve: Function, reject: Function }>} */
  const pending = new Map()
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map()

  const onMessage = (event) => {
    const raw = typeof event === 'string' ? event : event?.data
    let payload = null
    try {
      payload = JSON.parse(String(raw))
    } catch {
      return
    }
    if (payload?.id != null && pending.has(payload.id)) {
      const waiter = pending.get(payload.id)
      pending.delete(payload.id)
      if (payload.error) {
        waiter.reject(new CdpError(SCREENSHOT_REASON.CAPTURE_FAILED, String(payload.error.message ?? 'CDP error')))
      } else {
        waiter.resolve(payload.result)
      }
      return
    }
    if (payload?.method) {
      const set = listeners.get(payload.method)
      if (!set) return
      for (const handler of [...set]) {
        try {
          handler(payload)
        } catch {
          // A listener must never break the transport.
        }
      }
    }
  }

  ws.addEventListener('message', onMessage)

  return {
    send(method, params = {}, sessionId) {
      const id = nextId
      nextId += 1
      const message = { id, method, params }
      if (sessionId) message.sessionId = sessionId
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        try {
          ws.send(JSON.stringify(message))
        } catch (error) {
          pending.delete(id)
          reject(error instanceof Error ? error : new CdpError(SCREENSHOT_REASON.CAPTURE_FAILED, String(error)))
        }
      })
    },
    on(method, handler) {
      if (!listeners.has(method)) listeners.set(method, new Set())
      listeners.get(method).add(handler)
      return () => listeners.get(method)?.delete(handler)
    },
    close() {
      try {
        ws.removeEventListener('message', onMessage)
      } catch {
        // Transport already torn down.
      }
      try {
        ws.close()
      } catch {
        // Nothing left to close.
      }
    },
  }
}

/**
 * Send one command over an existing socket, reusing its connection.
 *
 * @param {WebSocket} ws
 * @param {string | undefined} sessionId
 * @param {string} method
 * @param {object} [params]
 * @returns {Promise<any>}
 */
export function sendCommand(ws, sessionId, method, params = {}) {
  let connection = CONNECTIONS.get(ws)
  if (!connection) {
    connection = createConnection(ws)
    CONNECTIONS.set(ws, connection)
  }
  return connection.send(method, params, sessionId)
}

/**
 * Open one page target, size it to the viewport, and hand back the three verbs
 * the capture layer needs.
 *
 * @param {{ webSocketDebuggerUrl: string }} endpoint
 * @param {{ kind: string, width: number, height: number, deviceScaleFactor: number, isMobile: boolean, hasTouch: boolean }} viewport
 * @param {{ timeoutMs?: number, socketFactory?: (url: string) => WebSocket, send?: typeof sendCommand }} [opts]
 * @returns {Promise<{ sessionId: string, targetId: string, navigate: (url: string, ms?: number) => Promise<void>, capture: () => Promise<Buffer>, close: () => Promise<void> }>}
 */
export async function attachPage(endpoint, viewport, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? Number(opts.timeoutMs) : NAV_TIMEOUT_MS
  const socketFactory = opts.socketFactory ?? ((url) => new WebSocket(url))
  const send = opts.send ?? sendCommand
  const ws = socketFactory(endpoint.webSocketDebuggerUrl)
  await waitForOpen(ws, timeoutMs)

  const connection = CONNECTIONS.get(ws) ?? createConnection(ws)
  CONNECTIONS.set(ws, connection)

  try {
    const created = await send(ws, undefined, 'Target.createTarget', { url: 'about:blank' })
    const targetId = String(created?.targetId ?? '')
    if (!targetId) throw new CdpError(SCREENSHOT_REASON.CAPTURE_FAILED, 'the browser created no page target')
    const attached = await send(ws, undefined, 'Target.attachToTarget', { targetId, flatten: true })
    const sessionId = String(attached?.sessionId ?? '')
    if (!sessionId) throw new CdpError(SCREENSHOT_REASON.CAPTURE_FAILED, 'the page target refused a session')

    await send(ws, sessionId, 'Page.enable')
    await send(ws, sessionId, 'Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      mobile: viewport.isMobile,
    })
    await send(ws, sessionId, 'Emulation.setTouchEmulationEnabled', {
      enabled: viewport.hasTouch === true,
      maxTouchPoints: viewport.hasTouch === true ? 5 : 1,
    })

    return {
      sessionId,
      targetId,
      async navigate(url, navTimeoutMs = timeoutMs) {
        const loaded = waitForEvent(connection, 'Page.loadEventFired', sessionId, navTimeoutMs)
        let outcome = null
        try {
          outcome = await send(ws, sessionId, 'Page.navigate', { url })
        } catch (error) {
          loaded.cancel()
          throw error
        }
        if (outcome?.errorText) {
          loaded.cancel()
          throw new CdpError(SCREENSHOT_REASON.NAV_FAILED, String(outcome.errorText))
        }
        await loaded.promise
      },
      async capture() {
        const shot = await send(ws, sessionId, 'Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          captureBeyondViewport: CAPTURE_BEYOND_VIEWPORT,
        })
        const data = typeof shot?.data === 'string' ? shot.data : ''
        if (!data) throw new CdpError(SCREENSHOT_REASON.CAPTURE_FAILED, 'the browser returned an empty frame')
        return Buffer.from(data, 'base64')
      },
      async close() {
        try {
          await send(ws, undefined, 'Target.closeTarget', { targetId })
        } catch {
          // The target may already be gone; the socket close below settles it.
        }
        connection.close()
      },
    }
  } catch (error) {
    connection.close()
    throw error
  }
}

/**
 * @param {WebSocket} ws
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function waitForOpen(ws, timeoutMs) {
  if (ws.readyState === 1) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new CdpError(SCREENSHOT_REASON.CAPTURE_FAILED, 'the debugger socket could not be opened'))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new CdpError(SCREENSHOT_REASON.CAPTURE_FAILED, 'the debugger socket did not open in time'))
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    const cleanup = () => {
      clearTimeout(timer)
      try {
        ws.removeEventListener('open', onOpen)
        ws.removeEventListener('error', onError)
      } catch {
        // Detached transport.
      }
    }
    ws.addEventListener('open', onOpen)
    ws.addEventListener('error', onError)
  })
}

/**
 * Wait for one event on one session, or fail with `nav-timeout`.
 *
 * The returned handle exposes `cancel()` so a navigation that fails on its own
 * does not leave a timer behind.
 *
 * @param {{ on: (method: string, handler: Function) => () => void }} connection
 * @param {string} method
 * @param {string} sessionId
 * @param {number} timeoutMs
 * @returns {{ promise: Promise<void>, cancel: () => void }}
 */
function waitForEvent(connection, method, sessionId, timeoutMs) {
  let settle = null
  const promise = new Promise((resolve, reject) => {
    let off = () => {}
    let timer = null
    off = connection.on(method, (payload) => {
      if (payload?.sessionId && sessionId && payload.sessionId !== sessionId) return
      settle = null
      clearTimeout(timer)
      off()
      resolve()
    })
    timer = setTimeout(() => {
      settle = null
      off()
      reject(new CdpError(SCREENSHOT_REASON.NAV_TIMEOUT, `no ${method} within ${String(timeoutMs)}ms`))
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    settle = () => {
      clearTimeout(timer)
      off()
    }
  })
  return {
    promise,
    cancel: () => {
      if (typeof settle === 'function') settle()
    },
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function defaultSleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    if (typeof timer.unref === 'function') timer.unref()
  })
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error ?? 'unknown error')
}
