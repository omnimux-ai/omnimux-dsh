import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { resolveTarget, verifyL2Runtime } from './live-qa.mjs'
import { moduleRoot } from './live-qa-request.mjs'
import { AUTH_TEXT, allowedAddress, boundedRead, browserFailure, evaluateCdp, iso, sameOrigin, sameUrl } from './live-browser-utils.mjs'

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
    } catch { return { kind: controller.signal.aborted ? 'timeout' : 'network' }; }
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

function checkExistingCookie(cdp, origin, fetchTimeoutMs) {
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

/** Prepare one approved local page without consuming a QA request. */
export async function prepareEgoPage(tab, {
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
    if (!tab?.cdp?.send || typeof tab?.url !== 'function') return finish('browser-transport', false, 'a real ego browser page is required')
    const actualUrl = await boundedRead(() => tab.url(), toolTimeoutMs)
    if (!sameOrigin(actualUrl, expected.href)) return finish('browser-policy', false, 'selected tab does not match the approved target origin')
    const cdp = tab.cdp
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
    if (parsed.origin !== new URL(target.url).origin || parsed.pathname !== '/' || parsed.username || parsed.password || parsed.hash || parsed.searchParams.size !== 1 || !parsed.searchParams.get('token')) return null
    return link
  } catch { return null }
}

/** Use the current L2 Host's official login URL once, without persisting credentials. */
export async function openL2EgoPage(tab, { url, toolTimeoutMs = 5_000 } = {}) {
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
    if (!tab || typeof tab.url !== 'function' || typeof tab.goto !== 'function') return finish('browser-transport', false, 'a navigable ego browser page is required')
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
    const preparation = await prepareEgoPage(tab, { url: target.url, target: 'l2', toolTimeoutMs: duration })
    return finish(preparation.status, preparation.ready, preparation.detail, preparation)
  } catch (error) {
    const [status, detail] = browserFailure(error)
    return finish(status, false, detail)
  }
}
