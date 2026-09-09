import assert from 'node:assert/strict'
import { readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { prepareEgoPage } from './live-page-preparation.mjs'
import { auth, cleanup, fakeTab, l2Runtime, loading, origin, ready, request, vmTab } from './ego-qa-test-helpers.mjs'

afterEach(cleanup)
const authText = 'dsh web authentication required; reopen the URL printed by dsh web.'
const response = status => ({ status, type: 'basic', url: `${origin}/` })

test('ready product is reused without navigation, with a fresh same-origin cookie check', async () => {
  const tab = fakeTab([ready])
  const result = await prepareEgoPage(tab, { url: `${origin}/`, target: 'dev' })
  assert.deepEqual([result.status, result.ready, result.attempts, result.recoveryAction], ['ready', true, 0, 'none'])
  assert.equal(tab.calls.length, 2); assert.equal(tab.calls[0].options.timeoutMs, 5000); assert.deepEqual(tab.navigations, [])
})

test('product content mentioning the auth error is not mistaken for the exact auth page', async () => {
  const tab = vmTab({ body: `Chat says: ${authText}`, mounted: true, workbench: true, fetch: async (_, init) => {
    assert.equal(init.credentials, 'include'); return response(200)
  } })
  assert.equal((await prepareEgoPage(tab, { url: `${origin}/`, target: 'dev' })).status, 'ready')
  assert.deepEqual(tab.assignments, [])
})

test('ready and loading pages stop on expired authentication without navigation', async () => {
  for (const values of [[ready, { kind: 'response', status: 401 }], [loading, { kind: 'response', status: 200 }, ready, { kind: 'response', status: 403 }]]) {
    const tab = fakeTab(values)
    assert.equal((await prepareEgoPage(tab, { url: `${origin}/`, target: 'dev', readyTimeoutMs: 50, pollIntervalMs: 10 })).status, 'auth-required')
    assert.deepEqual(tab.navigations, [])
  }
})

test('concurrent synthetic L2 fixtures bind distinct ports without lsof', async () => {
  const items = await Promise.all([request(), request(), request()])
  const originalPath = process.env.PATH
  let runtimes
  try {
    process.env.PATH = '/nonexistent-fixture-tools'
    const pending = items.map(item => l2Runtime(item.root))
    process.env.PATH = originalPath
    runtimes = await Promise.all(pending)
  } finally {
    process.env.PATH = originalPath
  }
  assert.equal(new Set(runtimes.map(runtime => runtime.url)).size, items.length)
  for (const runtime of runtimes) {
    const response = await fetch(runtime.url)
    assert.equal(await response.text(), 'ok')
  }
})

test('official L2 entry uses only the current login line once and returns no token', async () => {
  const item = await request(); const l2 = await l2Runtime(item.root)
  const tab = fakeTab([{ ...ready, origin: new URL(l2.url).origin }], { url: 'about:blank', goto: async value => {
    assert.match(value, /^http:\/\/127\.0\.0\.1:\d+\/\?token=/); return l2.url
  } })
  const result = await item.runner.openL2EgoPage(tab, { url: l2.url })
  assert.equal(result.ready, true); assert.equal(result.loginAction, 'official-login-navigation'); assert.equal(tab.navigations.length, 1)
  assert.doesNotMatch(JSON.stringify(result), /l2-test-token/)
})

test('missing, pre-restart, malformed, and stale L2 login entries never navigate', async () => {
  for (const kind of ['missing', 'restart', 'malformed', 'stale', 'mtime']) {
    const item = await request(); const l2 = await l2Runtime(item.root)
    if (kind === 'missing') writeFileSync(l2.log, 'Host started\n')
    if (kind === 'restart') writeFileSync(l2.log, `dsh web: ${l2.url}?token=old-login-token\n--- [2026-09-06 12:00:00] dev restart-host triggered ---\nHost started\n`)
    if (kind === 'malformed') writeFileSync(l2.log, `dsh web: ${l2.url}?token=valid&next=forbidden\n`)
    if (kind === 'stale') { const file = join(item.root, '.l2-dev.env'); writeFileSync(file, readFileSync(file, 'utf8').replace(/COMMIT=.*/, 'COMMIT=0000000')) }
    if (kind === 'mtime') utimesSync(l2.log, new Date(0), new Date(0))
    const tab = fakeTab([], { url: 'about:blank' })
    const result = await item.runner.openL2EgoPage(tab, { url: l2.url })
    assert.equal(result.status, kind === 'stale' ? 'l2-identity-mismatch' : 'l2-login-missing')
    assert.equal(tab.navigations.length, 0); assert.equal(tab.calls.length, 0)
    assert.doesNotMatch(JSON.stringify(result), /old-login-token|l2-test-token/)
    cleanup()
  }
})

test('L2 selects the post-restart link and rejects foreign selected tabs', async () => {
  const item = await request(); const l2 = await l2Runtime(item.root)
  const foreign = fakeTab([], { url: `${origin}/` })
  assert.equal((await item.runner.openL2EgoPage(foreign, { url: l2.url })).status, 'browser-policy')
  assert.equal(foreign.navigations.length, 0)
  writeFileSync(l2.log, `dsh web: ${l2.url}?token=old-login-token\n--- [2026-09-06 12:00:00] dev restart-host triggered ---\ndsh web: ${l2.url}?token=current-login-token\n`)
  const tab = fakeTab([{ ...ready, origin: new URL(l2.url).origin }], { url: l2.url, goto: async value => {
    assert.ok(value.endsWith('token=current-login-token')); return l2.url
  } })
  const result = await item.runner.openL2EgoPage(tab, { url: l2.url })
  assert.equal(result.ready, true); assert.equal(tab.navigations.length, 1)
  assert.doesNotMatch(JSON.stringify(result), /old-login-token|current-login-token/)
})

test('failed and timed-out login attempts are not retried or exposed', async () => {
  for (const timeout of [false, true]) {
    const item = await request(); const l2 = await l2Runtime(item.root)
    let complete
    const tab = fakeTab([], { url: l2.url, goto: value => {
      if (timeout) return new Promise(done => { complete = done })
      throw new Error(`navigation failed: ${value}`)
    } })
    const result = await item.runner.openL2EgoPage(tab, { url: l2.url, toolTimeoutMs: timeout ? 1 : 5000 })
    assert.equal(result.status, timeout ? 'browser-timeout' : 'browser-transport')
    assert.equal(result.loginAction, 'official-login-navigation-attempted'); assert.equal(tab.navigations.length, 1)
    assert.doesNotMatch(JSON.stringify(result), /l2-test-token/)
    complete?.(l2.url)
    await new Promise(done => setTimeout(done, 0)); assert.equal(tab.navigations.length, 1)
  }
})

test('exact same-origin auth page performs two read checks and one internal recovery navigation', async () => {
  const tab = vmTab({ body: authText, fetch: async (_, init) => {
    assert.equal(init.credentials, 'include'); assert.equal(init.redirect, 'manual'); return response(200)
  } })
  const result = await prepareEgoPage(tab, { url: `${origin}/`, target: 'dev', readyTimeoutMs: 0 })
  assert.deepEqual([result.status, result.ready, result.attempts, result.recoveryAction], ['recovered', true, 1, 'same-origin-navigation'])
  assert.equal(tab.calls.length, 5); assert.deepEqual(tab.assignments, [`${origin}/`]); assert.equal(tab.calls[1].options.timeoutMs, 6000)
})

test('fetch timeout, redirects, and non-200 responses do not recover', async () => {
  const cases = [
    { fetch: (_, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))), status: 'service-unreachable' },
    { fetch: async () => ({ ...response(302), type: 'opaqueredirect' }), status: 'browser-policy' },
    { fetch: async () => response(201), status: 'not-ready' },
  ]
  for (const item of cases) {
    const tab = vmTab({ body: authText, fetch: item.fetch })
    assert.equal((await prepareEgoPage(tab, { url: `${origin}/`, target: 'dev', fetchTimeoutMs: 10 })).status, item.status)
    assert.deepEqual(tab.assignments, [])
  }
})

test('expired navigation lease and tool timeout record attempted but unconfirmed recovery', async () => {
  const late = vmTab({ body: authText, delayNavigationMs: 10, fetch: async () => response(200) })
  const result = await prepareEgoPage(late, { url: `${origin}/`, target: 'dev', toolTimeoutMs: 1 })
  assert.equal(result.status, 'browser-timeout'); assert.deepEqual(late.assignments, [])
  const tab = fakeTab([auth, { kind: 'response', status: 200 }, new Error('Runtime.evaluate timed out')])
  const failed = await prepareEgoPage(tab, { url: `${origin}/`, target: 'dev' })
  assert.equal(failed.status, 'browser-timeout'); assert.equal(failed.recoveryAction, 'same-origin-navigation-attempted')
})

test('network error page, auth-required, and not-ready classifications remain distinct', async () => {
  const network = vmTab({ body: 'This site cannot be reached', pageOrigin: 'null', protocol: 'chrome-error:', fetch: async () => { throw new Error('must not fetch') } })
  assert.equal((await prepareEgoPage(network, { url: `${origin}/`, target: 'dev' })).status, 'service-unreachable')
  assert.equal(network.calls.length, 1)
  for (const [values, expected] of [
    [[auth, { kind: 'response', status: 401 }], 'auth-required'], [[auth, { kind: 'network' }], 'service-unreachable'],
    [[loading, { kind: 'response', status: 200 }, loading], 'not-ready'],
  ]) assert.equal((await prepareEgoPage(fakeTab(values), { url: `${origin}/`, target: 'dev', readyTimeoutMs: 0 })).status, expected)
})

test('wrong origin, production and secret targets fail without evaluation', async () => {
  for (const options of [
    { tab: fakeTab([], { url: 'http://127.0.0.1:45121/' }), url: `${origin}/`, target: 'dev' },
    { tab: fakeTab([]), url: 'http://127.0.0.1:44200/', target: 'l2' },
    { tab: fakeTab([]), url: `${origin}/?token=secret`, target: 'dev' },
  ]) {
    const result = await prepareEgoPage(options.tab, options)
    assert.equal(result.status, 'browser-policy'); assert.equal(options.tab.calls.length, 0); assert.doesNotMatch(JSON.stringify(result), /token=secret/)
  }
})

test('policy rejection and control loss stop immediately with sanitized diagnostics', async () => {
  for (const [message, expected] of [['URL blocked by browser policy', 'browser-policy'], ['user is controlling', 'browser-control-lost'], ['navigation timeout Cookie=signed-secret&token=hidden', 'browser-timeout']]) {
    const tab = fakeTab([loading, new Error(message), ready])
    const result = await prepareEgoPage(tab, { url: `${origin}/`, target: 'dev' })
    assert.equal(result.status, expected); assert.equal(tab.calls.length, 2)
    assert.doesNotMatch(JSON.stringify(result), /signed-secret|token=hidden/)
  }
})
