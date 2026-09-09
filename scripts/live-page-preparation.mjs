import { AUTH_TEXT, allowedAddress, boundedRead, browserFailure, evaluateCdp, iso, sameOrigin } from './live-browser-utils.mjs'

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
    if (!expected) return finish('browser-policy', false, 'target URL is outside the approved local Dev origin')
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
