import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { afterEach, test } from 'node:test'
import { captureIabPng, prepareIabPage } from './codex-browser-qa.mjs'
import { assertStageState, saveProbeScreenshot } from './live-stage-probe.mjs'

const repo = process.cwd()
const roots = []
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const origin = 'http://127.0.0.1:45120'
const ready = { origin, authPage: false, rootMounted: true, workbenchReady: true, connectionWarning: false, ready: true }
const auth = { origin, authPage: true, rootMounted: false, workbenchReady: false, connectionWarning: false, ready: false }
const loading = { origin, authPage: false, rootMounted: true, workbenchReady: false, connectionWarning: false, ready: false }

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function fakeTab(values = [ready], { url = `${origin}/`, error, onSend } = {}) {
  const calls = []
  const cdp = { send: async (method, params, options) => {
    calls.push({ method, params, options })
    onSend?.(calls.length)
    if (error) throw error
    const value = values.shift()
    if (value instanceof Error) throw value
    return { result: { value } }
  } }
  return {
    id: 'iab-test', calls, url: async () => url,
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

test('ready product page is reused without fetch or navigation, including an empty QA session', async () => {
  const tab = fakeTab([ready])
  const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev' })
  assert.deepEqual([result.status, result.ready, result.attempts, result.recoveryAction], ['ready', true, 0, 'none'])
  assert.equal(tab.calls.length, 1)
  assert.equal(tab.calls[0].options.timeoutMs, 5_000)
})

test('normal product content mentioning the auth error is not mistaken for the exact auth page', async () => {
  const tab = vmTab({ body: `Chat says: ${'dsh web authentication required; reopen the URL printed by dsh web.'}`, mounted: true, workbench: true, fetch: async () => { throw new Error('fetch must not run') } })
  const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev' })
  assert.equal(result.status, 'ready')
  assert.equal(result.attempts, 0)
  assert.deepEqual(tab.assignments, [])
})

test('same-origin auth page executes one fetch and one navigation before reporting recovered', async () => {
  const tab = vmTab({ body: 'dsh web authentication required; reopen the URL printed by dsh web.', mounted: false, workbench: false, fetch: async (_url, init) => {
    assert.equal(init.credentials, 'include')
    assert.equal(init.redirect, 'manual')
    return { status: 200, type: 'basic', url: `${origin}/` }
  } })
  const result = await prepareIabPage(tab, { url: `${origin}/`, target: 'dev', readyTimeoutMs: 0 })
  assert.deepEqual([result.status, result.ready, result.attempts, result.recoveryAction], ['recovered', true, 1, 'same-origin-navigation'])
  assert.equal(tab.calls.length, 4)
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
  const notReady = await prepareIabPage(fakeTab([loading, loading]), { url: `${origin}/`, target: 'dev', readyTimeoutMs: 0 })
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
  const headTab = fakeTab([ready], { onSend: () => {
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
