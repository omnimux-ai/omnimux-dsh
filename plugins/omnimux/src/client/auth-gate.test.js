import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  AUTH_GATE_POLICY,
  AUTH_GLOBAL_KEY,
  MAX_INTENTS,
  cancel,
  ensureLogin,
  getSnapshot,
  installAuthGlobal,
  resetAuthGate,
  retry,
  setRuntimeChoiceReader,
  subscribe,
} from './auth-gate.js'
import { describeLoginGate } from './login-gate-view.js'
import { logout, peekStatusCache, rememberLoggedInStatus, resetStatusCache } from './api-auth.js'

/**
 * A controllable fake device flow. `start()` drives the gate into `waiting`
 * synchronously; the test then drives the outcome by calling the captured
 * `onSuccess` / `onState`. No timers, no fetch, no `window`.
 */
function makeRunLogin() {
  let captured = null
  let count = 0
  const fn = (opts) => {
    count += 1
    captured = opts
    return {
      start() {
        captured.onState('starting')
        captured.onState('waiting', {
          flow_id: 'flow-1',
          user_code: 'ABCD',
          verification_url: 'https://verify.example/dev',
          interval: 5,
        })
      },
      stop() {},
      cancel() {},
    }
  }
  return { fn, captured: () => captured, count: () => count }
}

/**
 * @param {{
 *   loggedIn?: boolean
 *   peek?: { ok: boolean, status: number, body: any } | null
 *   getStatus?: (verify?: boolean) => Promise<{ ok: boolean, status: number, body: any }>
 *   delayMs?: number
 * }} [opts]
 * @returns {{
 *   win: {},
 *   gate: any,
 *   run: ReturnType<typeof makeRunLogin>,
 *   getStatusCallCount: () => number,
 * }}
 */
function install({ loggedIn = false, peek, getStatus } = {}) {
  const win = {}
  const run = makeRunLogin()
  let getStatusCallCount = 0
  const countedStatus = async (verify) => {
    getStatusCallCount += 1
    if (getStatus) return getStatus(verify)
    return { ok: true, status: 200, body: { logged_in: loggedIn, username: 'ada' } }
  }
  const overrides = {
    getStatus: countedStatus,
    runLogin: run.fn,
  }
  if (peek !== undefined) overrides.peekCache = () => peek
  installAuthGlobal(win, overrides)
  resetAuthGate()
  return {
    win,
    gate: win[AUTH_GLOBAL_KEY],
    run,
    getStatusCallCount: () => getStatusCallCount,
  }
}

function recordGateFrames() {
  const phases = []
  const unsub = subscribe(() => {
    const snap = getSnapshot()
    phases.push({
      phase: snap.phase,
      visible: describeLoginGate(snap).visible,
    })
  })
  return {
    phases,
    stop() { unsub() },
  }
}

describe('auth-gate store', () => {
  it('installs window.__omnimuxAuth idempotently', () => {
    const win = {}
    const a = installAuthGlobal(win, { getStatus: async () => ({ status: 200, body: {} }), runLogin: makeRunLogin().fn })
    const b = installAuthGlobal(win)
    assert.equal(a, b)
    assert.equal(win[AUTH_GLOBAL_KEY], a)
    assert.equal(typeof a.ensureLogin, 'function')
    assert.equal(typeof a.cancel, 'function')
    assert.equal(typeof a.subscribe, 'function')
    assert.equal(typeof a.getSnapshot, 'function')
  })

  it('short path: already logged in → onSuccess immediately, gate stays closed', async () => {
    const { gate, run } = install({ loggedIn: true })
    let resolved = null
    await gate.ensureLogin({ reason: 'x', onSuccess: (p) => { resolved = p } })
    assert.equal(resolved?.username, 'ada')
    assert.equal(getSnapshot().phase, 'closed')
    assert.equal(run.captured(), null, 'no device flow was started')
  })

  it('not logged in → opens the marketing prompt (device flow waits for CTA)', async () => {
    const { gate, run } = install({ loggedIn: false })
    await gate.ensureLogin({ reason: 'x', onSuccess: () => {} })
    const state = getSnapshot()
    assert.equal(state.phase, 'prompt')
    assert.equal(state.reason, 'x')
    assert.equal(run.count(), 0, 'device flow must not start until the CTA')
  })

  it('CTA begin() starts the device handshake and reaches waiting', async () => {
    const { gate, run } = install({ loggedIn: false })
    await gate.ensureLogin({ reason: 'x', onSuccess: () => {} })
    assert.equal(getSnapshot().phase, 'prompt')
    gate.begin()
    const state = getSnapshot()
    assert.equal(state.phase, 'waiting')
    assert.equal(state.user_code, 'ABCD')
    assert.equal(state.verification_url, 'https://verify.example/dev')
    assert.equal(run.count(), 1)
  })

  it('single-gate: a second intent enqueues without re-opening the flow', async () => {
    const { gate, run } = install({ loggedIn: false })
    await gate.ensureLogin({ reason: 'a', onSuccess: () => {} })
    assert.equal(getSnapshot().phase, 'prompt')
    assert.equal(run.count(), 0)
    // Second call while the gate is open: only enqueue, no second start.
    await gate.ensureLogin({ reason: 'b', onSuccess: () => {} })
    assert.equal(getSnapshot().phase, 'prompt')
    assert.equal(run.count(), 0, 'the device flow must not start for a queued intent')
    gate.begin()
    assert.equal(getSnapshot().phase, 'waiting')
    assert.equal(run.count(), 1, 'the device flow must not restart for a queued intent')
  })

  it('poll success → resolveAll(profile) resumes every queued intent', async () => {
    const { gate, run } = install({ loggedIn: false })
    const seen = []
    await gate.ensureLogin({ reason: 'a', onSuccess: (p) => { seen.push({ kind: 'a', p }) } })
    await gate.ensureLogin({ reason: 'b', onSuccess: (p) => { seen.push({ kind: 'b', p }) } })
    gate.begin()
    run.captured().onSuccess({ logged_in: true, username: 'ada' })
    assert.deepEqual(seen, [
      { kind: 'a', p: { logged_in: true, username: 'ada' } },
      { kind: 'b', p: { logged_in: true, username: 'ada' } },
    ])
    assert.equal(getSnapshot().phase, 'closed')
  })

  it('cancel → every intent onCancel, gate closes', async () => {
    const { gate } = install({ loggedIn: false })
    const cancelled = []
    await gate.ensureLogin({ reason: 'a', onCancel: (r) => { cancelled.push(['a', r]) } })
    await gate.ensureLogin({ reason: 'b', onCancel: (r) => { cancelled.push(['b', r]) } })
    cancel('cancelled')
    assert.deepEqual(cancelled, [['a', 'cancelled'], ['b', 'cancelled']])
    assert.equal(getSnapshot().phase, 'closed')
  })

  it('denied → intents rejected, gate shows denied; retry re-opens the handshake', async () => {
    const { gate, run } = install({ loggedIn: false })
    const cancelled = []
    await gate.ensureLogin({ reason: 'a', onCancel: (r) => { cancelled.push(r) } })
    gate.begin()
    run.captured().onState('denied', { detail: 'nope' })
    assert.deepEqual(cancelled, ['denied'])
    assert.equal(getSnapshot().phase, 'denied')
    retry()
    assert.equal(getSnapshot().phase, 'waiting')
  })

  it('expired → intents rejected, gate shows expired', async () => {
    const { gate, run } = install({ loggedIn: false })
    const cancelled = []
    await gate.ensureLogin({ onCancel: (r) => { cancelled.push(r) } })
    gate.begin()
    run.captured().onState('expired', { detail: 'late' })
    assert.deepEqual(cancelled, ['expired'])
    assert.equal(getSnapshot().phase, 'expired')
  })

  it('status read failure is treated as needs-login (opens the gate)', async () => {
    const win = {}
    const run = makeRunLogin()
    installAuthGlobal(win, {
      getStatus: async () => { throw new Error('boom') },
      runLogin: run.fn,
    })
    resetAuthGate()
    await win[AUTH_GLOBAL_KEY].ensureLogin({ onSuccess: () => {} })
    assert.equal(getSnapshot().phase, 'prompt')
  })

  it('MAX_INTENTS overflow rejects only the 101st intent and keeps the queued 100', async () => {
    assert.equal(MAX_INTENTS, 100)
    const { gate, run } = install({ loggedIn: false })
    const resolved = []
    const cancelled = []
    for (let i = 0; i < MAX_INTENTS; i += 1) {
      await gate.ensureLogin({
        reason: `keep-${i}`,
        onSuccess: (profile) => { resolved.push(i) },
        onCancel: (reason) => { cancelled.push({ i, reason }) },
      })
    }
    assert.equal(getSnapshot().phase, 'prompt')

    let overflowCancel = 0
    await gate.ensureLogin({
      reason: 'overflow-101',
      onSuccess: () => { throw new Error('overflow intent must not resolve') },
      onCancel: (reason) => {
        overflowCancel += 1
        assert.equal(reason, 'overflow')
      },
    })
    assert.equal(overflowCancel, 1)
    assert.deepEqual(cancelled, [], 'queued intents must not be rejectAll-killed on overflow')
    assert.equal(getSnapshot().phase, 'prompt', 'gate stays on the marketing prompt')

    gate.begin()
    assert.equal(getSnapshot().phase, 'waiting')
    run.captured().onSuccess({ logged_in: true, username: 'ada' })
    assert.equal(resolved.length, MAX_INTENTS)
    assert.deepEqual(resolved, Array.from({ length: MAX_INTENTS }, (_, i) => i))
    assert.equal(getSnapshot().phase, 'closed')
    assert.equal(overflowCancel, 1)
  })

  it('MAX_INTENTS overflow still only rejects the new intent while waiting or error', async () => {
    const { gate, run } = install({ loggedIn: false })
    const resolved = []
    const cancelled = []
    for (let i = 0; i < MAX_INTENTS; i += 1) {
      await gate.ensureLogin({
        onSuccess: () => { resolved.push(i) },
        onCancel: (reason) => { cancelled.push(reason) },
      })
    }
    gate.begin()
    assert.equal(getSnapshot().phase, 'waiting')

    const waitingOverflow = []
    await gate.ensureLogin({
      onSuccess: () => { throw new Error('waiting overflow must not resolve') },
      onCancel: (reason) => { waitingOverflow.push(reason) },
    })
    assert.deepEqual(waitingOverflow, ['overflow'])
    assert.equal(getSnapshot().phase, 'waiting')
    assert.deepEqual(cancelled, [])

    run.captured().onState('error', { detail: 'net' })
    assert.equal(getSnapshot().phase, 'error')
    assert.equal(cancelled.length, MAX_INTENTS)
    assert.ok(cancelled.every((reason) => reason === 'error'))

    // After a terminal failure the queue is empty, so a new intent may enqueue
    // (and restart the handshake). Fill back to the cap, then overflow again.
    cancelled.length = 0
    const refill = []
    for (let i = 0; i < MAX_INTENTS; i += 1) {
      await gate.ensureLogin({
        onSuccess: () => { refill.push(i) },
        onCancel: (reason) => { cancelled.push(reason) },
      })
    }
    assert.equal(getSnapshot().phase, 'waiting')
    const errorOverflow = []
    await gate.ensureLogin({
      onSuccess: () => { throw new Error('error-phase overflow must not resolve') },
      onCancel: (reason) => { errorOverflow.push(reason) },
    })
    assert.deepEqual(errorOverflow, ['overflow'])
    assert.equal(getSnapshot().phase, 'waiting')
    run.captured().onSuccess({ logged_in: true, username: 'ada' })
    assert.equal(refill.length, MAX_INTENTS)
    assert.deepEqual(cancelled, [])
  })

  it('resetting clears queued intents and returns to closed', async () => {
    const { gate, run } = install({ loggedIn: false })
    await gate.ensureLogin({ onSuccess: () => {} })
    assert.equal(getSnapshot().phase, 'prompt')
    resetAuthGate()
    assert.equal(getSnapshot().phase, 'closed')
    assert.equal(run.captured(), null)
    // A reset gate should be able to reopen without stale intents.
    await gate.ensureLogin({ onSuccess: () => {} })
    assert.equal(getSnapshot().phase, 'prompt')
  })

  it('T5 peek hit: onSuccess is sync, never emits checking, never HTTP, visible always false', () => {
    const peek = { ok: true, status: 200, body: { logged_in: true, username: 'ada' } }
    const { gate, getStatusCallCount } = install({ peek })
    const frames = recordGateFrames()
    let onSuccessCalled = false
    let onSuccessBeforeAwait = false
    const pending = gate.ensureLogin({
      onSuccess: () => { onSuccessCalled = true },
    })
    onSuccessBeforeAwait = onSuccessCalled
    frames.stop()
    assert.equal(onSuccessCalled, true)
    assert.equal(onSuccessBeforeAwait, true, 'onSuccess must fire before the first await')
    assert.ok(frames.phases.every((p) => p.visible === false))
    assert.ok(frames.phases.every((p) => p.phase !== 'checking'), 'cached hit must never emit checking')
    assert.equal(getStatusCallCount(), 0)
    assert.equal(getSnapshot().phase, 'closed')
    return pending
  })

  it('T5 cold path: logged-in HTTP may emit checking but visible stays false', async () => {
    const { gate, getStatusCallCount } = install({ loggedIn: true })
    const frames = recordGateFrames()
    let onSuccessCalled = false
    await gate.ensureLogin({ onSuccess: () => { onSuccessCalled = true } })
    frames.stop()
    assert.equal(onSuccessCalled, true)
    assert.ok(frames.phases.every((p) => p.visible === false), 'checking must never become a visible modal')
    assert.ok(frames.phases.some((p) => p.phase === 'checking'), 'cold path is allowed to emit checking')
    assert.equal(getSnapshot().phase, 'closed')
    assert.equal(getStatusCallCount(), 1)
  })

  it('T6 second ensureLogin during checking only enqueues; one HTTP; both onSuccess', async () => {
    let release
    const pendingStatus = new Promise((resolve) => { release = resolve })
    let getStatusCallCount = 0
    const { gate } = install({
      getStatus: async () => {
        getStatusCallCount += 1
        await pendingStatus
        return { ok: true, status: 200, body: { logged_in: true, username: 'ada' } }
      },
    })
    const seen = []
    const first = gate.ensureLogin({ onSuccess: (p) => { seen.push(['a', p.username]) } })
    assert.equal(getSnapshot().phase, 'checking')
    const second = gate.ensureLogin({ onSuccess: (p) => { seen.push(['b', p.username]) } })
    assert.equal(getSnapshot().phase, 'checking', 'second call must not reopen the gate')
    release()
    await Promise.all([first, second])
    assert.deepEqual(seen, [['a', 'ada'], ['b', 'ada']])
    assert.equal(getStatusCallCount, 1)
    assert.equal(getSnapshot().phase, 'closed')
  })

  it('T7 logout invalidates; the next ensureLogin opens the prompt', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (path) => {
      assert.equal(path, '/omnimux/auth/logout')
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ ok: true }),
      }
    }
    try {
      const win = {}
      const run = makeRunLogin()
      installAuthGlobal(win, {
        peekCache: () => peekStatusCache(),
        getStatus: async () => ({ ok: true, status: 200, body: { logged_in: false } }),
        runLogin: run.fn,
      })
      resetAuthGate()
      rememberLoggedInStatus({ logged_in: true, username: 'ada' })
      const gate = win[AUTH_GLOBAL_KEY]
      let firstResolved = false
      await gate.ensureLogin({ onSuccess: () => { firstResolved = true } })
      assert.equal(firstResolved, true)
      assert.equal(getSnapshot().phase, 'closed')

      await logout()
      assert.equal(peekStatusCache(), null)
      await gate.ensureLogin({ onSuccess: () => { throw new Error('must not short-path after logout') } })
      assert.equal(getSnapshot().phase, 'prompt')
    } finally {
      globalThis.fetch = originalFetch
      resetStatusCache()
    }
  })

  it('status ok:false is treated as needs-login even if body claims logged_in', async () => {
    const win = {}
    const run = makeRunLogin()
    installAuthGlobal(win, {
      getStatus: async () => ({ ok: false, status: 500, body: { logged_in: true, username: 'spoof' } }),
      runLogin: run.fn,
    })
    resetAuthGate()
    await win[AUTH_GLOBAL_KEY].ensureLogin({
      onSuccess: () => { throw new Error('must not admit on ok:false') },
    })
    assert.equal(getSnapshot().phase, 'prompt')
  })

  it('T8 AUTH_GATE_POLICY activates Policy D; cancel suppresses subsequent nav prompts while explicit and write are not suppressed', async () => {
    assert.equal(AUTH_GATE_POLICY.gateNavigation, true)
    assert.equal(AUTH_GATE_POLICY.suppressNavigationAfterCancel, true)
    assert.ok(Object.isFrozen(AUTH_GATE_POLICY))
    const { gate } = install({ loggedIn: false })

    // 1st nav prompt
    await gate.ensureLogin({ kind: 'nav', onCancel: () => {} })
    assert.equal(getSnapshot().phase, 'prompt')

    // User cancels
    cancel('cancelled')
    assert.equal(getSnapshot().phase, 'closed')

    // 2nd nav prompt is suppressed (resolves without opening modal)
    let navResolved = false
    await gate.ensureLogin({
      kind: 'nav',
      onSuccess: (p) => {
        navResolved = true
        assert.equal(p.suppressed, true)
      },
    })
    assert.equal(navResolved, true, 'subsequent nav after cancel is suppressed and resolved')
    assert.equal(getSnapshot().phase, 'closed', 'gate stays closed during suppressed nav')

    // Profile-style call without explicit kind defaults to nav (which is suppressed)
    let defaultKindResolved = false
    await gate.ensureLogin({
      onSuccess: (p) => {
        defaultKindResolved = true
        assert.equal(p.suppressed, true)
      },
    })
    assert.equal(defaultKindResolved, true, 'omitted kind defaults to nav and is suppressed after cancel')
    assert.equal(getSnapshot().phase, 'closed')

    // Explicit call (kind: 'explicit') is NOT suppressed and MUST reopen prompt
    await gate.ensureLogin({
      kind: 'explicit',
      reason: 'explicit-login',
      onSuccess: () => { throw new Error('explicit must not be suppressed') },
    })
    assert.equal(getSnapshot().phase, 'prompt', 'explicit operation opens the prompt even after cancel')
    assert.equal(getSnapshot().reason, 'explicit-login')

    // Cancel again
    cancel('cancelled-again')
    assert.equal(getSnapshot().phase, 'closed')

    // Write operation is NOT suppressed and still prompts
    await gate.ensureLogin({
      kind: 'write',
      reason: 'write-op',
      onSuccess: () => { throw new Error('write must not be suppressed') },
    })
    assert.equal(getSnapshot().phase, 'prompt', 'write operation still opens the prompt')
    assert.equal(getSnapshot().reason, 'write-op')
  })

  it('resetAuthGate also drops the session status cache', () => {
    rememberLoggedInStatus({ logged_in: true, username: 'ada' })
    assert.equal(peekStatusCache()?.body.logged_in, true)
    resetAuthGate()
    assert.equal(peekStatusCache(), null)
  })

  it('installAuthGlobal hydrates session cache and notifies subscribers when already logged in', async () => {
    resetAuthGate()
    const win = {}
    let ticks = 0
    const pending = new Promise((resolve) => {
      const unsub = subscribe(() => {
        ticks += 1
        unsub()
        resolve()
      })
    })
    const status = { ok: true, status: 200, body: { logged_in: true, username: 'admin' } }
    installAuthGlobal(win, {
      getStatusCached: async () => {
        rememberLoggedInStatus(status.body)
        return status
      },
      peekCache: () => peekStatusCache(),
      runLogin: makeRunLogin().fn,
    })
    await pending
    assert.equal(win[AUTH_GLOBAL_KEY].isLoggedIn(), true)
    assert.ok(ticks >= 1)
  })

  it('keeps prompting while the runtime choice is unknown or official', async () => {
    const { gate } = install({ loggedIn: false })
    setRuntimeChoiceReader(null)
    await gate.ensureLogin({ kind: 'explicit', action: 'generate', onSuccess: () => { throw new Error('no reader must still prompt') } })
    assert.equal(getSnapshot().phase, 'prompt')
    cancel('done')
    resetAuthGate()

    install({ loggedIn: false })
    setRuntimeChoiceReader(() => ({ runtimeMode: 'official' }))
    await ensureLogin({ kind: 'explicit', action: 'generate', onSuccess: () => { throw new Error('official must still prompt') } })
    assert.equal(getSnapshot().phase, 'prompt')
    setRuntimeChoiceReader(null)
  })

  it('lets a custom key generate without the official window but still gates accounts', async () => {
    install({ loggedIn: false })
    setRuntimeChoiceReader(() => ({
      runtimeMode: 'key',
      runtimeKeyEndpoint: 'https://example.test/v1',
      runtimeKeyModel: 'demo',
      runtimeKeyVerified: true,
    }))

    let bypassed = null
    await ensureLogin({
      kind: 'explicit',
      action: 'generate',
      onSuccess: (profile) => { bypassed = profile },
    })
    assert.equal(bypassed?.runtimeBypass, true)
    assert.equal(getSnapshot().phase, 'closed', 'generation does not open the window')

    await ensureLogin({ kind: 'explicit', action: 'accounts', onSuccess: () => { throw new Error('accounts must still prompt') } })
    assert.equal(getSnapshot().phase, 'prompt', 'account-bound action keeps the window')
    setRuntimeChoiceReader(null)
  })

  it('T9 hub apply warms the status cache without awaiting or setState', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(here, 'index.js'), 'utf8')
    assert.match(source, /void getStatusCached\(\)\.catch\(\(\) => \{\}\)/)
    assert.match(source, /import \{ getStatusCached \} from '\.\/api\.js'/)
    assert.doesNotMatch(source, /await getStatusCached\(/)
  })
})
