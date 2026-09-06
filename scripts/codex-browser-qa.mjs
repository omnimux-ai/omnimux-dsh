import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { runStageProbe } from './live-stage-probe.mjs'
import { captureRuntimeProof, assertRuntimeProofStable } from './live-runtime-proof.mjs'
import { resolveTarget, verifyL2Runtime } from './live-qa.mjs'
import { validateLiveQaReport } from './live-qa-validation.mjs'

const AUTH_TEXT = 'dsh web authentication required; reopen the url printed by dsh web.'
const moduleRoot = fileURLToPath(new URL('..', import.meta.url))
const isInside = (parent, candidate) => { const rel = relative(parent, candidate); return rel && !rel.startsWith('..') && !rel.includes('/../') }
const iso = value => new Date(typeof value === 'function' ? value() : value).toISOString()

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

function allowedAddress(url, target) {
  let address
  try { address = new URL(url) } catch { return null }
  const port = Number(address.port)
  const local = address.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(address.hostname)
  const targetPort = target === 'dev' ? port === 45120 : target === 'l2' && port >= 44201 && port <= 44299
  if (!local || !targetPort || address.pathname !== '/' || address.username || address.password || address.search || address.hash) return null
  return address
}

function validateRequest(requestPath, request, now) {
  assert.equal(request.version, 1, 'Unsupported QA request version')
  assert.ok(!request.consumedAt, 'Prepared QA request was already consumed')
  assert.ok(Date.parse(request.expiresAt) > now, 'Prepared QA request expired; run verify:live again')
  const root = request.root || moduleRoot
  assert.equal(realpathSync(root), realpathSync(moduleRoot), 'Prepared QA request belongs to another worktree')
  assert.ok(isInside(join(root, '.workbuddy', 'evidence', 'live-qa'), resolve(request.evidenceDir)), 'Prepared QA evidence directory is outside this worktree')
  assert.equal(resolve(request.reportPath), resolve(root, 'docs/evidence/live-qa-report.json'), 'Prepared QA report path is outside this worktree')
  assert.ok(allowedAddress(request.url, request.target), 'Prepared QA target is not an allowed local Dev/L2 origin')
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), request.commitSha, 'Prepared QA request SHA is stale')
  assert.ok(existsSync(requestPath), 'Prepared QA request does not exist')
  return root
}

function consumeRequest(requestPath, expected, now = Date.now()) {
  const lockPath = `${requestPath}.consumed`
  let fd
  let committed = false
  try {
    try { fd = openSync(lockPath, 'wx', 0o600) } catch { throw new Error('Prepared QA request was already consumed') }
    const current = JSON.parse(readFileSync(requestPath, 'utf8'))
    if (!isDeepStrictEqual(current, expected)) throw new Error('Prepared QA request changed during browser preparation')
    assert.equal(current.version, 1, 'Unsupported QA request version')
    assert.ok(!current.consumedAt, 'Prepared QA request was already consumed')
    assert.ok(Date.parse(current.expiresAt) > now, 'Prepared QA request expired; run verify:live again')
    current.consumedAt = new Date(now).toISOString()
    writeJson(requestPath, current)
    committed = true
    return current
  } finally {
    if (fd !== undefined) closeSync(fd)
    if (fd !== undefined && !committed) {
      try { unlinkSync(lockPath) } catch {}
    }
  }
}

function sameOrigin(actual, expected) {
  const got = new URL(actual); const wanted = new URL(expected)
  return got.origin === wanted.origin && !got.username && !got.password && !got.search && !got.hash
}

function sameUrl(actual, expected) {
  const got = new URL(actual); const wanted = new URL(expected)
  return sameOrigin(actual, expected) && got.pathname === wanted.pathname
}

function timeoutError() {
  const error = new Error('browser operation timed out')
  error.code = 'OMNIMUX_BROWSER_TIMEOUT'
  return error
}

async function boundedRead(operation, timeoutMs) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(timeoutError()), timeoutMs) }),
    ])
  } finally { clearTimeout(timer) }
}

function browserFailure(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (error?.code === 'OMNIMUX_BROWSER_TIMEOUT' || error?.name === 'TimeoutError' || /timed?\s*out|timeout/i.test(message)) return ['browser-timeout', 'browser tool timed out']
  if (/policy|not allowed|disallow|refused by|blocked.*url/i.test(message)) return ['browser-policy', 'browser policy rejected the operation']
  return ['browser-transport', 'browser transport failed']
}

function safeErrorMessage(error, hasValidatedRequest) {
  if (!hasValidatedRequest) return 'Prepared QA request is invalid or stale'
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/(^|\n)(\s*(?:authorization|proxy-authorization|cookie|set-cookie)\s*:)[^\r\n]*/gi, '$1$2 [redacted]')
    .replace(/"(access_token|refresh_token|id_token|token|api_key|secret|signature|cookie|authorization)"\s*:\s*"(?:[^"\\]|\\.)*"/gi, '"$1":"[redacted]"')
    .replace(/\bbearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:token|key|secret|signature|authorization)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\b(cookie|authorization|token|secret|signature)(\s*[:=]\s*)[^\s;,]+/gi, '$1$2[redacted]')
    .replace(/https?:\/\/[^\s]+/gi, (value) => {
      try { const parsed = new URL(value); return `${parsed.origin}${parsed.pathname}` } catch { return '[redacted-url]' }
    })
}

function inspectExpression(origin) {
  return `(() => {
    const authText = ${JSON.stringify(AUTH_TEXT)};
    const bodyText = (document.body?.innerText || '').trim().toLowerCase();
    const root = document.getElementById('root');
    const authPage = bodyText === authText && !root?.childElementCount;
    const rootMounted = Boolean(root && root.childElementCount > 0 && !authPage);
    const workbench = globalThis.__omnimuxWorkbench;
    const workbenchReady = Boolean(workbench && typeof workbench.getSnapshot === 'function' && typeof workbench.getUiContext === 'function' && typeof workbench.open === 'function');
    const visible = node => Boolean(node && node.getClientRects().length && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden');
    const connectionWarning = [...document.querySelectorAll('[data-phase="disconnected"], [data-phase="connecting"]')].some(visible);
    const networkErrorPage = location.protocol === 'chrome-error:';
    return { origin: location.origin, authPage, rootMounted, workbenchReady, connectionWarning, networkErrorPage,
      ready: location.origin === ${JSON.stringify(origin)} && rootMounted && workbenchReady && !connectionWarning };
  })()`
}

function fetchExpression(origin, timeoutMs) {
  return `(async () => {
    if (location.origin !== ${JSON.stringify(origin)}) return { kind: 'origin-mismatch' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ${String(timeoutMs)});
    try {
      const response = await fetch(${JSON.stringify(`${origin}/`)}, { credentials: 'include', cache: 'no-store', redirect: 'manual', signal: controller.signal });
      const sameOrigin = new URL(response.url || ${JSON.stringify(`${origin}/`)}).origin === ${JSON.stringify(origin)};
      return { kind: response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400) ? 'redirect' : 'response', status: response.status, sameOrigin };
    } catch (error) { return { kind: controller.signal.aborted ? 'timeout' : 'network' }; }
    finally { clearTimeout(timer); }
  })()`
}

function navigateExpression(origin, expiresAt) {
  return `(() => {
    if (Date.now() > ${String(expiresAt)}) return { action: 'expired' };
    if (location.origin !== ${JSON.stringify(origin)}) return { action: 'origin-mismatch' };
    const root = document.getElementById('root');
    const authPage = (document.body?.innerText || '').trim().toLowerCase() === ${JSON.stringify(AUTH_TEXT)} && !root?.childElementCount;
    if (!authPage) return { action: 'page-changed' };
    location.assign(${JSON.stringify(`${origin}/`)});
    return { action: 'navigated' };
  })()`
}

async function evaluateCdp(cdp, expression, timeoutMs) {
  const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, { timeoutMs })
  if (response?.exceptionDetails) throw new Error('page evaluation failed')
  return response?.result?.value
}

const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms))

async function waitUntilReady(cdp, origin, { deadline, toolTimeoutMs, pollIntervalMs, allowNavigationReset = false }) {
  let state
  let transportError
  do {
    try {
      state = await evaluateCdp(cdp, inspectExpression(origin), toolTimeoutMs)
      transportError = null
      if (state?.networkErrorPage) return { kind: 'network-error', state }
      if (state?.origin !== origin) return { kind: 'origin-mismatch', state }
      if (state?.ready) return { kind: 'ready', state }
    } catch (error) {
      const [kind] = browserFailure(error)
      const navigationReset = kind === 'browser-transport' && /execution context.*destroyed|context.*invalidated/i.test(error instanceof Error ? error.message : String(error))
      if (!allowNavigationReset || !navigationReset) throw error
      transportError = error
    }
    if (Date.now() >= deadline) break
    await delay(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())))
  } while (Date.now() <= deadline)
  if (transportError) throw transportError
  return { kind: 'not-ready', state }
}

async function checkExistingCookie(cdp, origin, fetchTimeoutMs) {
  return evaluateCdp(cdp, fetchExpression(origin, fetchTimeoutMs), fetchTimeoutMs + 1_000)
}

function cookieCheckFailure(fetched, finish) {
  if (fetched?.kind === 'origin-mismatch' || fetched?.sameOrigin === false) return finish('browser-policy', false, 'same-origin authentication check left the approved origin')
  if (fetched?.kind === 'timeout') return finish('service-unreachable', false, 'same-origin authentication check timed out')
  if (fetched?.kind === 'network') return finish('service-unreachable', false, 'local Host was unreachable from the page')
  if (fetched?.kind === 'redirect') return finish('browser-policy', false, 'authentication check redirected; recovery stopped')
  if (fetched?.kind !== 'response') return finish('browser-transport', false, 'browser returned an invalid authentication check result')
  if (fetched.status === 401 || fetched.status === 403) return finish('auth-required', false, 'valid browser authentication is required')
  if (fetched.status !== 200) return finish('not-ready', false, 'local Host returned an unexpected response')
  return null
}

/** Prepare one approved local Dev/L2 page without consuming a QA request. */
export async function prepareIabPage(tab, {
  url, target, toolTimeoutMs = 5_000, fetchTimeoutMs = 5_000,
  readyTimeoutMs = 12_000, pollIntervalMs = 200, now = () => Date.now(),
} = {}) {
  const duration = (value, fallback, maximum, minimum = 1) => Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback
  toolTimeoutMs = duration(toolTimeoutMs, 5_000, 10_000)
  fetchTimeoutMs = duration(fetchTimeoutMs, 5_000, 5_000)
  readyTimeoutMs = duration(readyTimeoutMs, 12_000, 15_000, 0)
  pollIntervalMs = duration(pollIntervalMs, 200, 1_000, 10)
  const startedAt = iso(now())
  let origin = null
  let attempts = 0
  let recoveryAction = 'none'
  const finish = (status, ready, detail) => ({ status, ready, origin, attempts, recoveryAction, detail, startedAt, completedAt: iso(now()) })
  try {
    const expected = allowedAddress(url, target)
    if (!expected) return finish('browser-policy', false, 'target URL is outside the approved local Dev/L2 origins')
    origin = expected.origin
    if (!tab?.capabilities?.get || typeof tab?.url !== 'function') return finish('browser-transport', false, 'a real Codex IAB tab is required')
    const actualUrl = await boundedRead(() => tab.url(), toolTimeoutMs)
    if (!sameOrigin(actualUrl, expected.href)) return finish('browser-policy', false, 'selected tab does not match the approved target origin')
    const cdp = await boundedRead(() => tab.capabilities.get('cdp'), toolTimeoutMs)
    if (!cdp?.send) return finish('browser-transport', false, 'selected tab does not expose CDP evaluation')

    const first = await evaluateCdp(cdp, inspectExpression(origin), toolTimeoutMs)
    if (first?.networkErrorPage) return finish('service-unreachable', false, 'browser displayed a network error page; Host listening state was not confirmed')
    if (first?.origin !== origin) return finish('browser-policy', false, 'page origin changed during preparation')
    const failed = cookieCheckFailure(await checkExistingCookie(cdp, origin, fetchTimeoutMs), finish)
    if (failed) return failed
    if (first?.ready) return finish('ready', true, 'product page is ready and browser authentication is valid')
    if (!first?.authPage) {
      const waited = await waitUntilReady(cdp, origin, { deadline: Date.now() + readyTimeoutMs, toolTimeoutMs, pollIntervalMs })
      if (waited.kind === 'network-error') return finish('service-unreachable', false, 'browser displayed a network error page; Host listening state was not confirmed')
      if (waited.kind === 'origin-mismatch') return finish('browser-policy', false, 'page origin changed during preparation')
      if (waited.kind !== 'ready') return finish('not-ready', false, 'product page did not become ready')
      const finalCheck = cookieCheckFailure(await checkExistingCookie(cdp, origin, fetchTimeoutMs), finish)
      if (finalCheck) return finalCheck
      return finish('ready', true, 'product page became ready and browser authentication is valid')
    }

    attempts = 1
    recoveryAction = 'same-origin-navigation-attempted'
    const navigation = await evaluateCdp(cdp, navigateExpression(origin, Date.now() + toolTimeoutMs), toolTimeoutMs)
    if (navigation?.action === 'expired') return finish('browser-timeout', false, 'same-origin navigation lease expired')
    if (navigation?.action === 'origin-mismatch') return finish('browser-policy', false, 'page origin changed before recovery')
    if (navigation?.action === 'navigated') recoveryAction = 'same-origin-navigation'
    else recoveryAction = 'none'
    const recovered = await waitUntilReady(cdp, origin, { deadline: Date.now() + readyTimeoutMs, toolTimeoutMs, pollIntervalMs, allowNavigationReset: true })
    if (recovered.kind === 'network-error') return finish('service-unreachable', false, 'browser displayed a network error page; Host listening state was not confirmed')
    if (recovered.kind === 'origin-mismatch') return finish('browser-policy', false, 'page origin changed during recovery')
    if (recovered.kind === 'ready') {
      const finalCheck = cookieCheckFailure(await checkExistingCookie(cdp, origin, fetchTimeoutMs), finish)
      if (finalCheck) return finalCheck
      return finish(recoveryAction === 'same-origin-navigation' ? 'recovered' : 'ready', true, 'product page is ready')
    }
    return finish('not-ready', false, 'product page did not become ready after authentication recovery')
  } catch (error) {
    const [status, detail] = browserFailure(error)
    return finish(status, false, detail)
  }
}

function officialL2LoginUrl(target, runtime) {
  try {
    const logPath = join(runtime.profileDir, 'host.log')
    const startedAt = Date.parse(runtime.startedAt)
    if (!Number.isFinite(startedAt) || statSync(logPath).mtimeMs < startedAt) return null
    const lines = readFileSync(logPath, 'utf8').split(/\r?\n/)
    const restart = lines.findLastIndex(value => /^--- \[[^\]]+\] dev restart-host triggered ---$/.test(value))
    const line = lines.slice(restart + 1).reverse().find(value => value.startsWith('dsh web: '))
    if (!line) return null
    const link = line.slice('dsh web: '.length)
    if (!/^http:\/\/127\.0\.0\.1:\d+\/\?token=[^&?#\s]+$/.test(link)) return null
    const parsed = new URL(link)
    const expected = new URL(target.url)
    if (parsed.origin !== expected.origin || parsed.pathname !== '/' || parsed.username || parsed.password || parsed.hash || parsed.searchParams.size !== 1 || !parsed.searchParams.get('token')) return null
    return link
  } catch { return null }
}

/** Open one L2 tab through the current Host's official browser URL. */
export async function openL2IabPage(tab, { url, toolTimeoutMs = 5_000 } = {}) {
  const duration = Number.isFinite(toolTimeoutMs) ? Math.min(10_000, Math.max(1, toolTimeoutMs)) : 5_000
  let origin = null
  let loginAction = 'none'
  const startedAt = iso(Date.now())
  const finish = (status, ready, detail, preparation) => ({ status, ready, origin, loginAction, detail, startedAt, completedAt: iso(Date.now()), ...(preparation ? { preparation } : {}) })
  try {
    let target
    let before
    try {
      target = resolveTarget({ target: 'l2', url }, moduleRoot)
      origin = new URL(target.url).origin
      before = verifyL2Runtime(target)
    } catch { return finish('l2-identity-mismatch', false, 'L2 allocation or Host identity is not current') }
    if (!tab || typeof tab.url !== 'function' || typeof tab.goto !== 'function') return finish('browser-transport', false, 'a navigable Codex IAB tab is required')
    const actualUrl = await boundedRead(() => tab.url(), duration)
    if (actualUrl !== 'about:blank' && !sameUrl(actualUrl, target.url)) return finish('browser-policy', false, 'selected tab is not blank or the approved clean L2 URL')

    const loginUrl = officialL2LoginUrl(target, before)
    if (!loginUrl) return finish('l2-login-missing', false, 'current L2 Host did not provide a valid browser login entry')
    let afterRead
    try { afterRead = verifyL2Runtime(target) } catch { return finish('l2-identity-mismatch', false, 'L2 Host identity changed before browser login') }
    if (!isDeepStrictEqual(before, afterRead)) return finish('l2-identity-mismatch', false, 'L2 Host identity changed before browser login')

    loginAction = 'official-login-navigation-attempted'
    await boundedRead(() => tab.goto(loginUrl), duration)
    loginAction = 'official-login-navigation'
    let afterNavigation
    try { afterNavigation = verifyL2Runtime(target) } catch { return finish('l2-identity-mismatch', false, 'L2 Host identity changed during browser login') }
    if (!isDeepStrictEqual(before, afterNavigation)) return finish('l2-identity-mismatch', false, 'L2 Host identity changed during browser login')
    const cleanUrl = await boundedRead(() => tab.url(), duration)
    if (!sameUrl(cleanUrl, target.url)) return finish('browser-policy', false, 'browser login did not finish at the approved clean L2 URL')
    const preparation = await prepareIabPage(tab, { url: target.url, target: 'l2', toolTimeoutMs: duration })
    return finish(preparation.status, preparation.ready, preparation.detail, preparation)
  } catch (error) {
    const [status, detail] = browserFailure(error)
    return finish(status, false, detail)
  }
}

async function evaluate(tab, expression) {
  const cdp = await tab.capabilities.get('cdp')
  return evaluateCdp(cdp, expression, 12_000)
}

export async function captureIabPng(tab) {
  const cdp = await tab.capabilities.get('cdp')
  let response
  try { response = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }) } catch (error) { throw new Error(`browser-transport: CDP PNG screenshot failed: ${error.message}`) }
  assert.match(response?.data || '', /^[A-Za-z0-9+/]+={0,2}$/, 'browser-transport: CDP PNG screenshot payload is missing')
  const bytes = Buffer.from(response.data, 'base64')
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'browser-transport: CDP screenshot was not PNG')
  return bytes
}

function browserFor(tab) {
  return {
    js: expression => evaluate(tab, expression),
    click: async selector => tab.playwright.locator(selector).click(),
    waitForElement: async (selector, { timeout = 12 } = {}) => tab.playwright.locator(selector).waitFor({ state: 'visible', timeoutMs: timeout * 1000 }),
    captureScreenshot: () => captureIabPng(tab),
  }
}

function reportBase(request, startedAt) {
  const { runId, commitSha, target, profile, url, allocation, runtime, stage, targets, sidebarSelectors, evidenceDir, reportPath, createdAt, expiresAt } = request
  return { runId, commitSha, target, profile, url, allocation, runtime, stage, targets, sidebarSelectors, evidenceDir, reportPath, createdAt, expiresAt, status: 'running', pass: false, errors: [], assertions: [], screenshots: [], tool: 'codex-iab', startedAt }
}

/** Execute a one-shot prepared request in a real Codex IAB Tab. */
export async function runPreparedQa(requestPath, { tab, now = () => Date.now(), prepareOptions = {} } = {}) {
  let request
  let report
  let ownsRequest = false
  try {
    assert.ok(existsSync(requestPath), 'Prepared QA request does not exist')
    request = JSON.parse(readFileSync(requestPath, 'utf8'))
    const root = validateRequest(requestPath, request, now())
    report = reportBase(request, iso(now()))
    const { toolTimeoutMs, fetchTimeoutMs, readyTimeoutMs, pollIntervalMs } = prepareOptions
    const preflight = await prepareIabPage(tab, { toolTimeoutMs, fetchTimeoutMs, readyTimeoutMs, pollIntervalMs, url: request.url, target: request.target, now })
    report.preflight = preflight
    if (!preflight.ready) {
      report.phase = 'preflight'; report.failureKind = preflight.status
      throw new Error(`browser-preflight: ${preflight.status}: ${preflight.detail}`)
    }

    assert.ok(tab?.playwright?.locator && tab?.capabilities?.get && typeof tab?.screenshot === 'function' && typeof tab?.url === 'function', 'A complete Codex IAB Tab is required for QA')
    assert.ok(typeof tab.id === 'string' && tab.id.length > 0, 'Selected IAB tab has no stable identity')
    const preparedUrl = await boundedRead(() => tab.url(), Number.isFinite(prepareOptions.toolTimeoutMs) ? Math.min(10_000, Math.max(1, prepareOptions.toolTimeoutMs)) : 5_000)
    assert.ok(sameUrl(preparedUrl, request.url), 'browser-transport: selected IAB tab URL does not match prepared request')

    const afterPreparation = JSON.parse(readFileSync(requestPath, 'utf8'))
    if (!isDeepStrictEqual(afterPreparation, request)) throw new Error('Prepared QA request changed during browser preparation')
    validateRequest(requestPath, afterPreparation, now())
    request = consumeRequest(requestPath, afterPreparation, now())
    ownsRequest = true
    report.consumedAt = request.consumedAt
    report.phase = 'probe'
    const actualUrl = await tab.url()
    assert.ok(sameUrl(actualUrl, request.url), 'browser-transport: selected IAB tab URL does not match prepared request')
    report.tabId = tab.id
    const parsedActual = new URL(actualUrl)
    report.actualUrl = `${parsedActual.origin}${parsedActual.pathname}`
    const l2Before = request.target === 'l2' ? verifyL2Runtime(request) : null
    const before = await captureRuntimeProof(tab, { root, targets: request.targets, url: request.url, target: request.target, allocation: request.allocation })
    const probe = await runStageProbe(browserFor(tab), { targets: request.targets, sidebarSelectors: request.sidebarSelectors, evidenceDir: request.evidenceDir, onProgress: value => { report.probe = value } })
    const after = await captureRuntimeProof(tab, { root, targets: request.targets, url: request.url, target: request.target, allocation: request.allocation })
    assertRuntimeProofStable(before, after)
    if (request.target === 'l2') assert.deepEqual(verifyL2Runtime(request), l2Before, 'L2 Host changed during verification')
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), request.commitSha, 'Code SHA changed during verification')
    report.probe = probe; report.runtimeProof = { before, after }; report.assertions = probe.assertions; report.screenshots = probe.screenshots
    report.cleanup = { kind: 'workbench-restored', success: probe.assertions.some(item => item.name === 'initial-session-restored' && item.pass) && probe.assertions.some(item => item.name === 'initial-workbench-restored' && item.pass), tabRetained: true }
    report.completedAt = iso(now())
    report.status = 'completed'; report.pass = true
    validateLiveQaReport(report, request, { root, runId: request.runId, commitSha: request.commitSha, stage: request.stage, target: request.target })
  } catch (error) {
    report ||= { runId: request?.runId || 'rejected-request', status: 'failed', pass: false, errors: [], tool: 'codex-iab', startedAt: iso(now()) }
    report.status = 'failed'; report.pass = false
    if (!report.failureKind) report.failureKind = ownsRequest ? 'qa-failed' : 'request-invalid'
    report.errors.push(safeErrorMessage(error, Boolean(report && request && report.url)))
  } finally {
    if (report) report.completedAt ||= iso(now())
    if (report && ownsRequest) {
      writeJson(join(request.evidenceDir, 'live-qa-report.json'), report)
      writeJson(request.reportPath, report)
    }
  }
  return report
}
