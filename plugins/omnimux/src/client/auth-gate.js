/**
 * OmniMux unified login gate — client seam owned by the hub.
 *
 * This is NOT a second login system. It is a single entry point that wraps the
 * existing `identity` (Host) + `/omnimux/auth/*` + `verification_url` device
 * flow and adds two things the profile page never had:
 *
 *   1. ONE gate (single modal) instead of per-feature bespoke login UIs.
 *   2. An intent queue so that a login can resume up to N interrupted actions
 *      (each vertical registers `{ reason, onSuccess, onCancel }`).
 *
 * It is installed on `window.__omnimuxAuth` at module top-level (same
 * global-singleton pattern as `__omnimuxStage` / `__omnimuxSidebar`), so a
 * separate host client bundle (the hub) is the single owner and vertical
 * plugins consume it lazily. Vertical bundles never import this module.
 *
 * State machine phase: `closed | checking | prompt | starting | waiting |
 * denied | expired | error`.
 *
 *  - `closed`: no gate. `ensureLogin` may open one.
 *  - `checking`: a status (non-verify) read is in flight. Internal lock only;
 *    `describeLoginGate` maps it to `visible: false`.
 *  - `prompt`: marketing modal is open; device flow waits for the CTA.
 *  - `starting`: user clicked Sign in, device login is requesting a code.
 *  - `waiting`: device code shown, polling for completion.
 *  - `denied` / `expired` / `error`: the flow ended in a terminal failure.
 *
 * The design (docs/designs/omnimux-login-gate.md) asks that
 * `denied/expired/error` be treated like the `resolveAll` failure path — i.e.
 * every queued intent is rejected (`onCancel`) and the gate offers Retry. A
 * Retry re-runs the handshake; to resume a specific interrupted action the
 * caller re-invokes `ensureLogin` (the design's documented tradeoff in risk
 * item D.3).
 */
import {
  getStatus,
  getStatusCached,
  peekStatusCache,
  rememberLoggedInStatus,
  resetStatusCache,
} from './api.js'
import { runLogin } from './use-omnimux-auth.js'

/** Global key the hub installs and vertical plugins read. */
export const AUTH_GLOBAL_KEY = '__omnimuxAuth'

/** Hard cap so a runaway caller cannot grow the intent queue unboundedly. */
export const MAX_INTENTS = 100

/**
 * C/D seams:
 *   gateNavigation: true  → C closed: every nav goes through the gate.
 *   suppressNavigationAfterCancel: true → D active: cancel mutes later nav in the current session.
 */
export const AUTH_GATE_POLICY = Object.freeze({
  gateNavigation: true,
  suppressNavigationAfterCancel: true,
})

/**
 * Runtime implementation hooks, so L1 tests can inject a fake `getStatus` /
 * `runLogin` / cache peek without a host or fetch. Production uses the real
 * imports above. Tests that do not inject peek/cache still go through HTTP
 * (view layer already hides `checking`).
 * @type {{
 *   getStatus: (verify?: boolean) => Promise<{ ok: boolean, status: number, body: any }>,
 *   getStatusCached: () => Promise<{ ok: boolean, status: number, body: any }>,
 *   peekCache: () => { ok: boolean, status: number, body: any } | null,
 *   runLogin: (opts: { onSuccess: (profile: any) => void, onState: (phase: string, detail?: any) => void }) => { start: () => void, stop: () => void, cancel: () => void },
 * }}
 */
let impl = {
  getStatus,
  getStatusCached,
  peekCache: peekStatusCache,
  runLogin,
}

/** Current gate snapshot (never exposed mutated; replaced on every change). */
let state = Object.freeze({ phase: 'closed' })

/** Session suppression for Policy D (cancel mutes subsequent nav prompts). */
let navSuppressed = false

/** @type {Array<{ id: number, reason?: string, kind?: string, onSuccess?: (p: any) => void, onCancel?: (r?: any) => void }>} */
let intents = []
/** @type {ReturnType<typeof impl.runLogin> | null} */
let currentLogin = null
/** @type {string | undefined} */
let latestReason = undefined
let intentSeq = 0

/** @type {Set<() => void>} */
const listeners = new Set()

function emit() {
  for (const listener of [...listeners]) listener()
}

/** Replace the snapshot and notify subscribers. */
function setState(next) {
  state = Object.freeze({ ...next })
  emit()
}

/**
 * @returns {ReturnType<typeof getSnapshot>}
 */
export function getSnapshot() {
  return state
}

/**
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribe(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * @param {{ reason?: string, kind?: string, onSuccess?: (p: any) => void, onCancel?: (r?: any) => void }} opts
 */
function makeIntent(opts) {
  intentSeq += 1
  return {
    id: intentSeq,
    reason: typeof opts.reason === 'string' ? opts.reason : undefined,
    kind: opts.kind === 'write' || opts.kind === 'explicit' ? opts.kind : 'nav',
    onSuccess: typeof opts.onSuccess === 'function' ? opts.onSuccess : undefined,
    onCancel: typeof opts.onCancel === 'function' ? opts.onCancel : undefined,
  }
}

/**
 * Failure path (resolveAll's counterpart): every queued intent is rejected.
 * @param {any} reason
 */
function rejectAll(reason) {
  const pending = intents
  intents = []
  for (const intent of pending) {
    try {
      if (intent.onCancel) intent.onCancel(reason)
    } catch {
      // a caller's onCancel must never wedge the gate
    }
  }
}

/**
 * Success path: every queued intent is resumed with the logged-in profile,
 * then the gate closes. Also remembers a positive session cache so the next
 * `ensureLogin` can take the synchronous short path.
 * @param {any} profile
 */
function resolveAll(profile) {
  navSuppressed = false
  rememberLoggedInStatus(profile)
  const pending = intents
  intents = []
  setState({ phase: 'closed' })
  for (const intent of pending) {
    try {
      if (intent.onSuccess) intent.onSuccess(profile)
    } catch {
      // a caller's onSuccess must never wedge the gate
    }
  }
}

/**
 * Drive context for the device flow. Phases are reported back into the gate
 * store so `LoginGate` can render reason / device code / buttons.
 * @param {string | undefined} reason
 */
function beginLogin(reason) {
  if (currentLogin) {
    currentLogin.cancel()
    currentLogin = null
  }
  currentLogin = impl.runLogin({
    onSuccess: (profile) => {
      resolveAll(profile)
    },
    onState: (phase, detail = {}) => {
      if (phase === 'starting' || phase === 'waiting') {
        if (currentLogin === null) return
        setState({ phase, ...detail, reason })
        return
      }
      if (phase === 'denied' || phase === 'expired' || phase === 'error') {
        if (currentLogin === null) return
        rejectAll(phase)
        setState({ phase, ...detail, reason })
        currentLogin = null
      }
    },
  })
  currentLogin.start()
}

/**
 * Peek hit with `logged_in:true` → synchronous resolveAll, never emit checking,
 * 0 HTTP. Miss → internal `checking` lock then `getStatusCached()`.
 * @param {string | undefined} reason
 */
async function checkAndStart(reason) {
  const peeked = impl.peekCache()
  if (peeked && peeked.body?.logged_in === true) {
    resolveAll(peeked.body)
    return
  }
  setState({ phase: 'checking' })
  /** @type {{ ok: boolean, status: number, body: { logged_in?: boolean } }} */
  let status
  try {
    status = await impl.getStatusCached()
  } catch {
    status = { ok: false, status: 0, body: { logged_in: false } }
  }
  // Short path: already signed in, do not open the gate.
  // ok:false / throw / logged_in:false → prompt (宁可误弹，不可误放行).
  if (status.ok && status.body?.logged_in) {
    resolveAll(status.body)
    return
  }
  setState({ phase: 'prompt', reason })
}

/**
 * Open / reuse the unified login gate for one intent.
 *
 * `kind` is a C/D seam (`'nav'` default, `'write'` from authGuard, `'explicit'` from manual user action).
 *
 * @param {{ reason?: string, kind?: 'nav' | 'write' | 'explicit', onSuccess?: (profile: any) => void, onCancel?: (reason?: any) => void }} [opts]
 * @returns {Promise<void>}
 */
export async function ensureLogin(opts = {}) {
  // Overflow guard runs in EVERY phase (closed / prompt / waiting / error)
  // BEFORE the new intent is pushed. Overflow rejects only this caller;
  // never rejectAll, which would kill the already-queued intents.
  if (intents.length >= MAX_INTENTS) {
    try {
      opts.onCancel?.('overflow')
    } catch {
      // a caller's onCancel must never wedge the gate
    }
    return
  }
  const intent = makeIntent(opts)
  if (
    AUTH_GATE_POLICY.suppressNavigationAfterCancel &&
    intent.kind === 'nav' &&
    navSuppressed
  ) {
    try {
      if (intent.onSuccess) intent.onSuccess({ logged_in: false, suppressed: true })
    } catch {
      // caller error must not break gate
    }
    return
  }
  if (state.phase !== 'closed') {
    // Single-gate guarantee: an already-open/terminal/checking gate is reused.
    // checking = in-flight lock; a second ensureLogin only enqueues.
    // Only if it is a terminal failure do we restart the handshake so the
    // gate reacts (e.g. a caller retrying after a denied/expired/error).
    intents.push(intent)
    if (state.phase === 'denied' || state.phase === 'expired' || state.phase === 'error') {
      latestReason = intent.reason ?? latestReason
      beginLogin(intent.reason ?? latestReason)
    }
    return
  }
  intents.push(intent)
  latestReason = intent.reason ?? latestReason
  await checkAndStart(intent.reason ?? latestReason)
}

/**
 * Close the gate and reject every queued intent.
 * @param {any} [reason]
 */
export function cancel(reason = 'cancelled') {
  if (currentLogin) {
    currentLogin.cancel()
    currentLogin = null
  }
  if (AUTH_GATE_POLICY.suppressNavigationAfterCancel) {
    navSuppressed = true
  }
  rejectAll(reason)
  setState({ phase: 'closed' })
}

/**
 * Start the device handshake from the marketing prompt (CTA "立即登录").
 * `runLogin` opens `verification_url` in the system browser and the gate
 * moves `starting` → `waiting` (polling).
 */
export function begin() {
  if (state.phase !== 'prompt') return
  beginLogin(latestReason)
}

/**
 * Retry the handshake after a terminal failure. The queued intents were
 * already rejected when the flow went `denied/expired/error`; Retry re-runs
 * the device flow so the user can approve from the auth page again.
 */
export function retry() {
  if (state.phase !== 'denied' && state.phase !== 'expired' && state.phase !== 'error') return
  beginLogin(latestReason)
}

/**
 * Install the gate API on the target (default `window`). Idempotent. In the
 * browser this runs at module top-level (mirrors `stage.js`), so it exists as
 * soon as the hub client bundle is evaluated. `overrides` lets L1 tests inject
 * a fake `getStatus` / `runLogin` / cache peek without a host or `fetch`.
 * @param {any} [target]
 * @param {{
 *   getStatus?: typeof getStatus,
 *   getStatusCached?: typeof getStatusCached,
 *   peekCache?: typeof peekStatusCache,
 *   runLogin?: typeof runLogin,
 * }} [overrides]
 * @returns {any} the installed singleton.
 */
export function installAuthGlobal(target, overrides = {}) {
  const injected = Boolean(
    overrides && (overrides.getStatus || overrides.getStatusCached || overrides.peekCache || overrides.runLogin),
  )
  if (injected) {
    const injectedStatus = Boolean(overrides.getStatus || overrides.getStatusCached)
    impl = {
      getStatus: overrides.getStatus ?? impl.getStatus,
      getStatusCached: overrides.getStatusCached
        ?? (overrides.getStatus ? () => overrides.getStatus(false) : impl.getStatusCached),
      // Tests that fake getStatus and omit peekCache stay on the cold HTTP
      // path (peek = null). A previous case's positive peek must not leak.
      peekCache: Object.prototype.hasOwnProperty.call(overrides, 'peekCache')
        ? overrides.peekCache
        : (injectedStatus ? () => null : impl.peekCache),
      runLogin: overrides.runLogin ?? impl.runLogin,
    }
  }
  if (target === undefined || target === null) return undefined
  const existing = target[AUTH_GLOBAL_KEY]
  if (existing !== undefined) return existing
  const api = {
    getStatus: (verify) => impl.getStatus(verify),
    isLoggedIn: () => {
      const peeked = impl.peekCache()
      return Boolean(peeked && peeked.body && peeked.body.logged_in === true)
    },
    peekCache: () => impl.peekCache(),
    ensureLogin,
    cancel,
    begin,
    retry,
    subscribe,
    getSnapshot,
  }
  Object.defineProperty(target, AUTH_GLOBAL_KEY, { value: api, configurable: true })
  // Cloud sidebar rows subscribe to gate phases only. Warm the session
  // cache and emit so they re-check isLoggedIn after CLI/App shared auth.
  // Skip when tests inject getStatus without getStatusCached (cold HTTP path).
  if (!injected || overrides.getStatusCached) {
    void impl.getStatusCached().then((status) => {
      if (status && status.ok && status.body?.logged_in === true) emit()
    }).catch(() => {})
  }
  return api
}

/**
 * Test-only: reset the singleton so each L1 case starts from `closed`.
 * Not exposed on the window global. Also drops the session status cache so
 * a later case cannot inherit a positive peek from a previous one.
 */
export function resetAuthGate() {
  if (currentLogin) {
    currentLogin.cancel()
    currentLogin = null
  }
  intents = []
  latestReason = undefined
  navSuppressed = false
  resetStatusCache()
  setState({ phase: 'closed' })
}

installAuthGlobal(
  typeof window !== 'undefined' ? window : undefined,
)
