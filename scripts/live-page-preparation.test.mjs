import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { prepareEgoPage } from './live-page-preparation.mjs'
import { auth, cleanup, fakeTab, loading, origin, ready, vmTab } from './ego-qa-test-helpers.mjs'

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

test('blank and credential-bearing tabs never trigger automatic login', async () => {
  for (const url of ['about:blank', `${origin}/?token=dev-test-secret`, 'http://localhost:45120/']) {
    const tab = fakeTab([], { url })
    const result = await prepareEgoPage(tab, { url: `${origin}/`, target: 'dev' })
    assert.equal(result.ready, false); assert.equal(result.status, 'browser-policy')
    assert.equal(tab.calls.length, 0); assert.deepEqual(tab.navigations, [])
    assert.doesNotMatch(JSON.stringify(result), /dev-test-secret/)
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

test('wrong origin, non-Dev targets, production and secret targets fail without evaluation', async () => {
  for (const options of [
    { tab: fakeTab([], { url: 'http://127.0.0.1:45121/' }), url: `${origin}/`, target: 'dev' },
    { tab: fakeTab([]), url: 'http://127.0.0.1:44200/', target: 'dev' },
    { tab: fakeTab([]), url: `${origin}/`, target: 'l2' },
    { tab: fakeTab([]), url: 'http://127.0.0.1:44201/', target: 'dev' },
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
