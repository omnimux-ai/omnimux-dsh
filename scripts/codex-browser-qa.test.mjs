import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { afterEach, test } from 'node:test'
import { captureIabPng, prepareIabPage } from './codex-browser-qa.mjs'
import { assertStageState, saveProbeScreenshot } from './live-stage-probe.mjs'

const repo = process.cwd()
const roots = []
const children = []
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const origin = 'http://127.0.0.1:45120'
const ready = { origin, authPage: false, rootMounted: true, workbenchReady: true, connectionWarning: false, ready: true }
const auth = { origin, authPage: true, rootMounted: false, workbenchReady: false, connectionWarning: false, ready: false }
const loading = { origin, authPage: false, rootMounted: true, workbenchReady: false, connectionWarning: false, ready: false }

afterEach(() => {
  children.splice(0).forEach((child) => child.kill())
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function fakeTab(values = [ready], { url = `${origin}/`, error, onSend, goto } = {}) {
  const calls = []
  const navigations = []
  let currentUrl = url
  const cdp = { send: async (method, params, options) => {
    calls.push({ method, params, options })
    onSend?.(calls.length)
    if (error) throw error
    const value = values.shift() ?? { kind: 'response', status: 200, sameOrigin: true }
    if (value instanceof Error) throw value
    return { result: { value } }
  } }
  return {
    id: 'iab-test', calls, navigations, url: async () => currentUrl,
    goto: async (value) => { navigations.push(value); currentUrl = await (goto ? goto(value) : `${origin}/`) },
    playwright: { locator: () => ({}) }, capabilities: { get: async () => cdp }, screenshot: async () => png,
  }
}

function vmTab({ body, mounted, workbench, fetch: fetchImpl, delayNavigationMs = 0, pageOrigin = origin, protocol = 'http:' }) {
  const calls = []
  const assignments = []
  const root = { childElementCount: mounted ? 1 : 0 }
  const context = {
    AbortController, URL, setTimeout, clearTimeout,
    location: { origin: pageOrigin, protocol, assign(value) {
      assignments.push(value)
      context.document.body.innerText = 'OmniMux'
      root.childElementCount = 1
      context.__omnimuxWorkbench = { getSnapshot() {}, getUiContext() {}, open() {} }
    } },
    document: {
      body: { innerText: body },
      getElementById: id => id === 'root' ? root : null,
      querySelectorAll: () => [],
    },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    fetch: fetchImpl,
    __omnimuxWorkbench: workbench ? { getSnapshot() {}, getUiContext() {}, open() {} } : undefined,
  }
  const cdp = { send: async (method, params, options) => {
    calls.push({ method, params, options })
    if (delayNavigationMs && params.expression.includes('location.assign')) await new Promise(resolveDelay => setTimeout(resolveDelay, delayNavigationMs))
    return { result: { value: await vm.runInNewContext(params.expression, context) } }
  } }
  return {
    id: 'iab-vm', calls, assignments, context, url: async () => `${origin}/`,
    playwright: { locator: () => ({}) }, capabilities: { get: async () => cdp }, screenshot: async () => png,
  }
}

async function fixtureRunner(root) {
  const scripts = join(root, 'scripts')
  mkdirSync(scripts, { recursive: true })
  for (const file of ['codex-browser-qa.mjs', 'live-qa.mjs', 'live-qa-validation.mjs', 'live-stage-probe.mjs', 'live-runtime-proof.mjs', 'live-stage-contracts.mjs']) copyFileSync(join(repo, 'scripts', file), join(scripts, file))
  symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  writeFileSync(join(root, 'README'), 'fixture\n')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=QA', '-c', 'user.email=qa@localhost', 'commit', '-qm', 'fixture'], { cwd: root })
  return import(`${pathToFileURL(join(scripts, 'codex-browser-qa.mjs')).href}?fixture=${Date.now()}-${Math.random()}`)
}

async function request(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-codex-qa-'))
  roots.push(root)
  const runner = await fixtureRunner(root)
  const evidenceDir = join(root, '.workbuddy', 'evidence', 'live-qa', 'run-581')
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const value = {
    version: 1, root, runId: 'run-581', commitSha: sha, target: 'dev', profile: 'omnimux-dev',
    url: `${origin}/`, allocation: null, runtime: null, stage: 'assets', targets: [],
    sidebarSelectors: [], evidenceDir, reportPath: join(root, 'docs/evidence/live-qa-report.json'),
    createdAt: new Date(1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), consumedAt: null,
    ...overrides,
  }
  const path = join(root, 'request.json')
  writeFileSync(path, `${JSON.stringify(value)}\n`)
  return { root, path, value, runner }
}

function availableL2Port() {
  for (let port = 44299; port >= 44201; port--) {
    try {
      execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { stdio: 'ignore' })
    } catch { return port }
  }
  throw new Error('no free L2 port available for test')
}

async function l2Runtime(root, { loginLine = null, logLines } = {}) {
  const port = availableL2Port()
  const profile = 'omnimux-dev-qa'
  const profileDir = join(root, profile)
  const plugins = join(root, 'plugins')
  const plugin = join(plugins, 'omnimux')
  mkdirSync(plugin, { recursive: true })
  mkdirSync(join(profileDir, 'node_modules'), { recursive: true })
  symlinkSync(plugin, join(profileDir, 'node_modules', 'omnimux'))
  writeFileSync(join(profileDir, 'port.txt'), `${port}\n`)
  const server = spawn(process.execPath, ['-e', "process.title = process.env.QA_L2_PROFILE; require('node:http').createServer((_, response) => response.end('ok')).listen(process.env.QA_L2_PORT, '127.0.0.1', () => process.stdout.write('ready\\n'))"], { env: { ...process.env, QA_L2_PORT: String(port), QA_L2_PROFILE: profile }, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(server)
  await new Promise((resolveReady, rejectReady) => {
    server.once('error', rejectReady)
    server.stdout.once('data', resolveReady)
    server.once('exit', code => rejectReady(new Error(`test L2 Host exited before listening (${code})`)))
  })
  writeFileSync(join(profileDir, 'host.pid'), `${server.pid}\n`)
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  writeFileSync(join(root, '.l2-dev.env'), [
    `URL=http://127.0.0.1:${port}/`, `PORT=${port}`, `SOURCE=${plugins}`, 'TOPIC=qa', `COMMIT=${sha}`, `PROFILE_DIR=${profileDir}`, 'PLUGIN=omnimux',
  ].join('\n'))
  const log = join(profileDir, 'host.log')
  writeFileSync(log, `${(logLines || [loginLine ?? `dsh web: http://127.0.0.1:${port}/?token=l2-test-token`]).join('\n')}\n`)
  utimesSync(log, new Date(), new Date())
  return { url: `http://127.0.0.1:${port}/`, log }
}

test('authenticated product page is reused without navigation, including an empty QA session', async () => {
  const tab = fakeTab([ready])
  const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev' })
  assert.deepEqual([result.status, result.ready, result.attempts, result.recoveryAction], ['ready', true, 0, 'none'])
  assert.equal(tab.calls.length, 2)
  assert.equal(tab.calls[0].options.timeoutMs, 5_000)
  assert.deepEqual(tab.navigations, [])
})

test('normal product content mentioning the auth error is not mistaken for the exact auth page', async () => {
  const tab = vmTab({ body: `Chat says: ${'dsh web authentication required; reopen the URL printed by dsh web.'}`, mounted: true, workbench: true, fetch: async (_url, init) => {
    assert.equal(init.credentials, 'include')
    return { status: 200, type: 'basic', url: `${origin}/` }
  } })
  const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev' })
  assert.equal(result.status, 'ready')
  assert.equal(result.attempts, 0)
  assert.deepEqual(tab.assignments, [])
})

test('a stale-looking ready page with a 401 cookie check is auth-required without navigation', async () => {
  const tab = fakeTab([ready, { kind: 'response', status: 401, ok: false, sameOrigin: true }])
  const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev' })
  assert.equal(result.status, 'auth-required')
  assert.equal(result.ready, false)
  assert.deepEqual(tab.navigations, [])
})

test('a loading page checks its existing cookie before and after it becomes ready', async () => {
  const tab = fakeTab([loading, { kind: 'response', status: 200, sameOrigin: true }, ready, { kind: 'response', status: 403, ok: false, sameOrigin: true }])
  const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev', readyTimeoutMs: 50, pollIntervalMs: 10 })
  assert.equal(result.status, 'auth-required')
  assert.equal(result.ready, false)
  assert.equal(tab.calls.length, 4)
  assert.deepEqual(tab.navigations, [])
})

test('explicit L2 entry consumes only the current Host login line, then prepares the clean page', async () => {
  const item = await request()
  const l2 = await l2Runtime(item.root)
  const l2Origin = new URL(l2.url).origin
  const l2Ready = { ...ready, origin: l2Origin }
  let tab
  tab = fakeTab([l2Ready, { kind: 'response', status: 200, sameOrigin: true }], {
    url: 'about:blank',
    goto: async (value) => {
      assert.equal(tab.calls.length, 0, 'no CDP evaluation before normal HTTP navigation')
      assert.match(value, /^http:\/\/127\.0\.0\.1:\d+\/\?token=/)
      return l2.url
    },
  })
  const result = await item.runner.openL2IabPage(tab, { url: l2.url })
  assert.equal(result.status, 'ready')
  assert.equal(result.ready, true)
  assert.equal(result.loginAction, 'official-login-navigation')
  assert.equal(tab.navigations.length, 1)
  assert.doesNotMatch(JSON.stringify(result), /l2-test-token/)
})

test('L2 entry fails closed when the current Host has no official login line', async () => {
  const item = await request()
  const l2 = await l2Runtime(item.root, { loginLine: 'Host started' })
  const tab = fakeTab([], { url: 'about:blank' })
  const result = await item.runner.openL2IabPage(tab, { url: l2.url })
  assert.equal(result.status, 'l2-login-missing')
  assert.equal(result.ready, false)
  assert.equal(tab.navigations.length, 0)
  assert.equal(tab.calls.length, 0)
})

test('L2 entry ignores a pre-restart login link and accepts only a link after the latest restart marker', async () => {
  const stale = await request()
  const staleL2 = await l2Runtime(stale.root)
  writeFileSync(staleL2.log, [
    `dsh web: ${staleL2.url}?token=old-login-token`,
    '--- [2026-09-06 12:00:00] dev restart-host triggered ---',
    'Host started',
  ].join('\n'))
  utimesSync(staleL2.log, new Date(), new Date())
  const staleTab = fakeTab([], { url: 'about:blank' })
  const staleResult = await stale.runner.openL2IabPage(staleTab, { url: staleL2.url })
  assert.equal(staleResult.status, 'l2-login-missing')
  assert.equal(staleTab.navigations.length, 0)
  assert.equal(staleTab.calls.length, 0)
  assert.doesNotMatch(JSON.stringify(staleResult), /old-login-token/)

  const current = await request()
  const currentL2 = await l2Runtime(current.root)
  writeFileSync(currentL2.log, [
    `dsh web: ${currentL2.url}?token=old-login-token`,
    '--- [2026-09-06 12:00:00] dev restart-host triggered ---',
    `dsh web: ${currentL2.url}?token=l2-test-token`,
  ].join('\n'))
  utimesSync(currentL2.log, new Date(), new Date())
  const currentOrigin = new URL(currentL2.url).origin
  const currentTab = fakeTab([{ ...ready, origin: currentOrigin }, { kind: 'response', status: 200, sameOrigin: true }], { url: 'about:blank', goto: async () => currentL2.url })
  const currentResult = await current.runner.openL2IabPage(currentTab, { url: currentL2.url })
  assert.equal(currentResult.status, 'ready')
  assert.equal(currentTab.navigations.length, 1)
  assert.doesNotMatch(JSON.stringify(currentResult), /old-login-token|l2-test-token/)
})

test('L2 entry rejects a foreign selected tab, malformed login line, and stale allocation before navigation', async () => {
  const foreign = await request()
  const foreignL2 = await l2Runtime(foreign.root)
  const foreignTab = fakeTab([], { url: `${origin}/` })
  const foreignResult = await foreign.runner.openL2IabPage(foreignTab, { url: foreignL2.url })
  assert.equal(foreignResult.status, 'browser-policy')
  assert.equal(foreignTab.navigations.length, 0)
  assert.equal(foreignTab.calls.length, 0)

  const malformed = await request()
  const malformedL2 = await l2Runtime(malformed.root)
  writeFileSync(malformedL2.log, `dsh web: ${malformedL2.url}?token=valid&next=forbidden\n`)
  utimesSync(malformedL2.log, new Date(), new Date())
  const malformedTab = fakeTab([], { url: 'about:blank' })
  const malformedResult = await malformed.runner.openL2IabPage(malformedTab, { url: malformedL2.url })
  assert.equal(malformedResult.status, 'l2-login-missing')
  assert.equal(malformedTab.navigations.length, 0)
  assert.equal(malformedTab.calls.length, 0)

  const stale = await request()
  const staleL2 = await l2Runtime(stale.root)
  const staleEnv = readFileSync(join(stale.root, '.l2-dev.env'), 'utf8').replace(/COMMIT=.*/, 'COMMIT=0000000')
  writeFileSync(join(stale.root, '.l2-dev.env'), staleEnv)
  const staleTab = fakeTab([], { url: 'about:blank' })
  const staleResult = await stale.runner.openL2IabPage(staleTab, { url: staleL2.url })
  assert.equal(staleResult.status, 'l2-identity-mismatch')
  assert.equal(staleTab.navigations.length, 0)
  assert.equal(staleTab.calls.length, 0)
})

test('L2 navigation failure is bounded and does not expose the login URL', async () => {
  const item = await request()
  const l2 = await l2Runtime(item.root)
  const tab = fakeTab([], { url: 'about:blank', goto: async (value) => { throw new Error(`navigation failed: ${value}`) } })
  const result = await item.runner.openL2IabPage(tab, { url: l2.url })
  assert.equal(result.status, 'browser-transport')
  assert.equal(result.loginAction, 'official-login-navigation-attempted')
  assert.equal(tab.navigations.length, 1)
  assert.equal(tab.calls.length, 0)
  assert.doesNotMatch(JSON.stringify(result), /l2-test-token/)
})

test('a timed-out L2 navigation is attempted once and does not retry after a late completion', async () => {
  const item = await request()
  const l2 = await l2Runtime(item.root)
  let completeNavigation
  const tab = fakeTab([], { url: 'about:blank', goto: () => new Promise(resolveLate => { completeNavigation = resolveLate }) })
  const result = await item.runner.openL2IabPage(tab, { url: l2.url, toolTimeoutMs: 1 })
  assert.equal(result.status, 'browser-timeout')
  assert.equal(result.loginAction, 'official-login-navigation-attempted')
  assert.equal(tab.navigations.length, 1)
  assert.equal(tab.calls.length, 0)
  completeNavigation(l2.url)
  await new Promise(resolveLate => setTimeout(resolveLate, 0))
  assert.equal(tab.navigations.length, 1)
})

test('same-origin auth page executes two checks and one navigation before reporting recovered', async () => {
  const tab = vmTab({ body: 'dsh web authentication required; reopen the URL printed by dsh web.', mounted: false, workbench: false, fetch: async (_url, init) => {
    assert.equal(init.credentials, 'include')
    assert.equal(init.redirect, 'manual')
    return { status: 200, type: 'basic', url: `${origin}/` }
  } })
  const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev', readyTimeoutMs: 0 })
  assert.deepEqual([result.status, result.ready, result.attempts, result.recoveryAction], ['recovered', true, 1, 'same-origin-navigation'])
  assert.equal(tab.calls.length, 5)
  assert.deepEqual(tab.assignments, [`${origin}/`])
  assert.equal(tab.calls[1].options.timeoutMs, 6_000)
})

test('fetch timeout aborts in the page and redirects or non-200 responses never recover', async () => {
  const timed = vmTab({ body: 'dsh web authentication required; reopen the URL printed by dsh web.', mounted: false, workbench: false, fetch: (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  }) })
  const timeoutResult = await prepareIabPage(timed, { url: `${origin}/`, target: 'dev', fetchTimeoutMs: 10 })
  assert.equal(timeoutResult.status, 'service-unreachable')
  assert.equal(timed.context.fetch instanceof Function, true)

  for (const response of [{ status: 302, type: 'opaqueredirect', url: '' }, { status: 201, type: 'basic', url: `${origin}/` }]) {
    const tab = vmTab({ body: 'dsh web authentication required; reopen the URL printed by dsh web.', mounted: false, workbench: false, fetch: async (_url, init) => {
      assert.equal(init.redirect, 'manual')
      return response
    } })
    const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev' })
    assert.equal(result.status, response.status === 302 ? 'browser-policy' : 'not-ready')
    assert.deepEqual(tab.assignments, [])
  }
})

test('expired navigation lease prevents a delayed browser command from mutating the page', async () => {
  const tab = vmTab({ body: 'dsh web authentication required; reopen the URL printed by dsh web.', mounted: false, workbench: false, delayNavigationMs: 10, fetch: async () => ({ status: 200, type: 'basic', url: `${origin}/` }) })
  const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev', toolTimeoutMs: 1 })
  assert.equal(result.status, 'browser-timeout')
  assert.equal(result.recoveryAction, 'same-origin-navigation-attempted')
  assert.deepEqual(tab.assignments, [])
})

test('navigation transport timeout records an attempted action without claiming recovery', async () => {
  const timeout = new Error('Runtime.evaluate timed out')
  timeout.name = 'TimeoutError'
  const tab = fakeTab([auth, { kind: 'response', status: 200, sameOrigin: true }, timeout])
  const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev' })
  assert.equal(result.status, 'browser-timeout')
  assert.equal(result.recoveryAction, 'same-origin-navigation-attempted')
})

test('Chrome network error document is service-unreachable rather than an origin policy violation', async () => {
  const tab = vmTab({ body: 'This site cannot be reached', mounted: false, workbench: false, pageOrigin: 'null', protocol: 'chrome-error:', fetch: async () => { throw new Error('fetch must not run') } })
  const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev' })
  assert.equal(result.status, 'service-unreachable')
  assert.match(result.detail, /network error page/)
  assert.equal(tab.calls.length, 1)
})

test('missing authentication, unreachable Host, and page readiness stay distinct', async () => {
  const required = await prepareIabPage(fakeTab([auth, { kind: 'response', status: 401, ok: false, sameOrigin: true }]), { url: `${origin}/`, target: 'dev' })
  const unreachable = await prepareIabPage(fakeTab([auth, { kind: 'network' }]), { url: `${origin}/`, target: 'dev' })
  const notReady = await prepareIabPage(fakeTab([loading, { kind: 'response', status: 200, sameOrigin: true }, loading]), { url: `${origin}/`, target: 'dev', readyTimeoutMs: 0 })
  assert.equal(required.status, 'auth-required')
  assert.equal(unreachable.status, 'service-unreachable')
  assert.equal(notReady.status, 'not-ready')
})

test('wrong origin, production, and secret-bearing target URLs are rejected without page evaluation', async () => {
  const cases = [
    { tab: fakeTab([], { url: 'http://127.0.0.1:45121/' }), url: `${origin}/`, target: 'dev' },
    { tab: fakeTab([]), url: 'http://127.0.0.1:44200/', target: 'l2' },
    { tab: fakeTab([]), url: `${origin}/?token=do-not-record`, target: 'dev' },
  ]
  for (const item of cases) {
    const result = await prepareIabPage(item.tab, item)
    assert.equal(result.status, 'browser-policy')
    assert.equal(item.tab.calls.length, 0)
    assert.doesNotMatch(JSON.stringify(result), /do-not-record/)
  }
})

test('tool failures are bounded, categorized, and do not expose sensitive error text', async () => {
  const error = new Error('navigation timeout: Cookie=signed-secret&token=hidden')
  error.name = 'TimeoutError'
  const result = await prepareIabPage(fakeTab([], { error }), { url: `${origin}/`, target: 'dev' })
  assert.equal(result.status, 'browser-timeout')
  assert.match(result.detail, /timed out/)
  assert.doesNotMatch(JSON.stringify(result), /signed-secret|token=hidden/)
})

test('policy rejection while waiting stops immediately without retry', async () => {
  const policy = new Error('URL blocked by browser policy')
  const tab = fakeTab([loading, policy, ready])
  const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev', readyTimeoutMs: 5_000 })
  assert.equal(result.status, 'browser-policy')
  assert.equal(tab.calls.length, 2)
})

test('expired and stale-SHA requests fail before consumption', async () => {
  for (const overrides of [{ expiresAt: new Date(0).toISOString() }, { commitSha: '0'.repeat(40) }]) {
    const item = await request(overrides)
    const result = await item.runner.runPreparedQa(item.path, { tab: fakeTab() })
    assert.equal(result.pass, false)
    assert.equal(result.failureKind, 'request-invalid')
    assert.equal(existsSync(`${item.path}.consumed`), false)
    assert.equal(JSON.parse(readFileSync(item.path, 'utf8')).consumedAt, null)
    assert.equal(existsSync(item.value.reportPath), false)
  }
})

test('failed browser preflight preserves the reusable request and pending canonical report', async () => {
  const item = await request()
  mkdirSync(join(item.root, 'docs', 'evidence'), { recursive: true })
  writeFileSync(item.value.reportPath, '{"status":"pending"}\n', { flag: 'wx' })
  const result = await item.runner.runPreparedQa(item.path, { tab: fakeTab([auth, { kind: 'response', status: 401, ok: false, sameOrigin: true }]) })
  assert.equal(result.failureKind, 'auth-required')
  assert.equal(existsSync(`${item.path}.consumed`), false)
  assert.equal(JSON.parse(readFileSync(item.path, 'utf8')).consumedAt, null)
  assert.deepEqual(JSON.parse(readFileSync(item.value.reportPath, 'utf8')), { status: 'pending' })
})

test('authentication that expires while waiting preserves the reusable QA request', async () => {
  const item = await request()
  const tab = fakeTab([loading, { kind: 'response', status: 200, sameOrigin: true }, ready, { kind: 'response', status: 401, ok: false, sameOrigin: true }])
  const result = await item.runner.runPreparedQa(item.path, { tab, prepareOptions: { readyTimeoutMs: 50, pollIntervalMs: 10 } })
  assert.equal(result.failureKind, 'auth-required')
  assert.equal(existsSync(`${item.path}.consumed`), false)
  assert.equal(JSON.parse(readFileSync(item.path, 'utf8')).consumedAt, null)
})

test('wrong page path and incomplete IAB capabilities fail before request consumption', async () => {
  const wrongPath = await request()
  const pathResult = await wrongPath.runner.runPreparedQa(wrongPath.path, { tab: fakeTab([ready], { url: `${origin}/other` }) })
  assert.match(pathResult.errors.join(';'), /URL does not match/i)
  assert.equal(existsSync(`${wrongPath.path}.consumed`), false)

  const incomplete = await request()
  const incompleteTab = fakeTab([ready])
  delete incompleteTab.playwright
  const incompleteResult = await incomplete.runner.runPreparedQa(incomplete.path, { tab: incompleteTab })
  assert.match(incompleteResult.errors.join(';'), /complete Codex IAB Tab/i)
  assert.equal(existsSync(`${incomplete.path}.consumed`), false)
})

test('request replacement and HEAD change during preparation are rejected before consumption', async () => {
  const replaced = await request()
  const replacementTab = fakeTab([ready], { onSend: () => {
    const changed = { ...replaced.value, stage: 'publish' }
    writeFileSync(replaced.path, `${JSON.stringify(changed)}\n`)
  } })
  const replacementResult = await replaced.runner.runPreparedQa(replaced.path, { tab: replacementTab })
  assert.match(replacementResult.errors.join(';'), /changed during browser preparation/i)
  assert.equal(existsSync(`${replaced.path}.consumed`), false)

  const changedHead = await request()
  let committed = false
  const headTab = fakeTab([ready], { onSend: () => {
    if (committed) return
    committed = true
    writeFileSync(join(changedHead.root, 'README'), 'changed\n')
    execFileSync('git', ['add', 'README'], { cwd: changedHead.root })
    execFileSync('git', ['-c', 'user.name=QA', '-c', 'user.email=qa@localhost', 'commit', '-qm', 'changed'], { cwd: changedHead.root })
  } })
  const headResult = await changedHead.runner.runPreparedQa(changedHead.path, { tab: headTab })
  assert.match(headResult.errors.join(';'), /SHA is stale/i)
  assert.equal(existsSync(`${changedHead.path}.consumed`), false)
})

test('request expiry during browser preparation is rechecked before consumption', async () => {
  const item = await request({ expiresAt: new Date(5_000).toISOString() })
  const ticks = [2_000, 2_000, 2_000, 2_000, 6_000]
  const result = await item.runner.runPreparedQa(item.path, { tab: fakeTab([ready]), now: () => ticks.shift() ?? 6_000 })
  assert.match(result.errors.join(';'), /expired/i)
  assert.equal(existsSync(`${item.path}.consumed`), false)
  assert.equal(JSON.parse(readFileSync(item.path, 'utf8')).consumedAt, null)
})

test('concurrent prepared runs grant probe ownership once and a loser cannot overwrite its report', async () => {
  const item = await request()
  const [a, b] = await Promise.all([
    item.runner.runPreparedQa(item.path, { tab: fakeTab([ready]) }),
    item.runner.runPreparedQa(item.path, { tab: fakeTab([ready]) }),
  ])
  assert.equal([a, b].filter(result => result.failureKind === 'qa-failed').length, 1)
  assert.equal([a, b].filter(result => result.failureKind === 'request-invalid').length, 1)
  assert.ok(JSON.parse(readFileSync(item.path, 'utf8')).consumedAt)
  const saved = JSON.parse(readFileSync(item.value.reportPath, 'utf8'))
  assert.equal(saved.failureKind, 'qa-failed')
  assert.equal(saved.phase, 'probe')
})

test('invalid secret-bearing request is rejected without recording the secret', async () => {
  const item = await request({ url: `${origin}/?token=super-secret` })
  const result = await item.runner.runPreparedQa(item.path, { tab: fakeTab() })
  assert.equal(result.failureKind, 'request-invalid')
  assert.doesNotMatch(JSON.stringify(result), /super-secret/)
  assert.equal(existsSync(item.value.reportPath), false)
})

test('post-consumption browser errors redact complete headers, Bearer credentials, and JSON secrets', async () => {
  const item = await request()
  const tab = fakeTab([ready])
  let urlReads = 0
  tab.url = async () => {
    urlReads++
    if (urlReads < 3) return `${origin}/`
    throw new Error([
      'browser transport failed',
      'Authorization: Bearer raw-bearer-secret',
      'Cookie: session=raw-cookie-secret; preference=also-secret',
      'payload={"access_token":"raw-json-secret","message":"keep this assertion"}',
    ].join('\n'))
  }
  const result = await item.runner.runPreparedQa(item.path, { tab })
  assert.equal(result.failureKind, 'qa-failed')
  const returned = JSON.stringify(result)
  assert.doesNotMatch(returned, /raw-bearer-secret|raw-cookie-secret|also-secret|raw-json-secret/)
  assert.match(returned, /Authorization: \[redacted\]/)
  assert.match(returned, /Cookie: \[redacted\]/)
  assert.match(returned, /access_token.*redacted/)
  assert.match(returned, /keep this assertion/)

  const saved = readFileSync(item.value.reportPath, 'utf8')
  assert.doesNotMatch(saved, /raw-bearer-secret|raw-cookie-secret|also-secret|raw-json-secret/)
  assert.match(saved, /keep this assertion/)
})

test('empty screenshots fail while typed array screenshots are validated and written as PNG', () => {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-png-'))
  roots.push(root)
  assert.throws(() => saveProbeScreenshot(new Uint8Array(), join(root, 'empty.png')), /PNG/i)
  const destination = join(root, 'typed.png')
  saveProbeScreenshot(new Uint8Array(png), destination)
  assert.deepEqual(readFileSync(destination), png)
})

test('IAB adapter requests a PNG through the selected tab CDP when tab.screenshot returns JPEG', async () => {
  const calls = []
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x4a, 0x46, 0x49, 0x46])
  const result = await captureIabPng({
    screenshot: async () => jpeg,
    capabilities: { get: async () => ({ send: async (method, options) => {
      calls.push([method, options])
      return { data: png.toString('base64') }
    } }) },
  })
  assert.deepEqual(result, png)
  assert.deepEqual(calls, [['Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }]])
})

test('Stage selection accepts a serialized cross-realm array with exactly the expected selector', () => {
  const target = { stage: 'assets', selector: '[data-omnimux-assets-entry]', tabId: 'omnimux-assets:library' }
  const selected = vm.runInNewContext(`['${target.selector}']`)
  assert.notEqual(Object.getPrototypeOf(selected), Array.prototype)
  assertStageState({ hasState: true, sessionId: 's1', contextSessionId: 's1', entryCount: 1, panelOpen: true, active: true, activeTab: target.tabId, selected, contentCount: 1, contentLength: 1, loadingOnly: false, visibleErrors: 0 }, target, 's1')
})
