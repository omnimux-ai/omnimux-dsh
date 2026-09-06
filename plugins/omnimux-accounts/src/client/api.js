/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [opts]
 */
export async function accountsRequest(path, opts = {}) {
  const response = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  let json = {}
  try {
    json = await response.json()
  } catch {
    json = { error: `HTTP ${String(response.status)}` }
  }
  return { ok: response.ok && json?.success !== false, status: response.ok && json?.success === false ? 502 : response.status, body: json }
}

/**
 * Wrap any `/omnimux/accounts` write so a 401 pops the hub's unified login
 * gate, then replays the original call once the user signs in. If the gate is
 * unavailable (or the user cancels) the original result is returned as-is.
 * The replay bypasses the guard so a still-401 response cannot re-open the
 * gate recursively.
 * @param {(...args: any[]) => Promise<{ ok: boolean, status: number, body: any }>} fn
 * @returns {(...args: any[]) => Promise<{ ok: boolean, status: number, body: any }>}
 */
export function isQuotaHttpResult(result) {
  if (!result || result.ok) return false
  if (result.status === 402) return true
  const err = result.body && typeof result.body === 'object' ? result.body.error : null
  return err === 'quota-exceeded'
}

export function notifyQuota(result, context) {
  const quota = typeof window !== 'undefined' ? window.__omnimuxQuota : undefined
  if (!quota || typeof quota.notify !== 'function' || !isQuotaHttpResult(result)) return result
  quota.notify({ status: result.status, body: result.body, code: result.body?.error }, context)
  return result
}

export function quotaGuard(fn, context) {
  return (...args) => {
    const quota = typeof window !== 'undefined' ? window.__omnimuxQuota : undefined
    const run = () => Promise.resolve(fn(...args)).then((result) => notifyQuota(result, context))
    if (!quota || typeof quota.ensureQuota !== 'function') return run()
    return Promise.resolve(quota.ensureQuota(context)).then((gate) => {
      if (gate?.ok === false && gate.reason === 'quota') return { ok: false, status: 402, body: { error: 'quota-exceeded' } }
      if (gate?.ok === false) return { ok: false, status: 401, body: { error: 'needs-omnimux' } }
      return run()
    })
  }
}

export function authGuard(fn) {
  return (...args) => {
    const run = async () => {
      const result = await fn(...args)
      if (result.status !== 401) return result
      const gate = typeof window !== 'undefined' ? /** @type {any} */ (window).__omnimuxAuth : undefined
      if (!gate || typeof gate.ensureLogin !== 'function') return result
      return new Promise((resolve, reject) => {
        gate.ensureLogin({
          kind: 'write',
          onSuccess: () => {
            fn(...args).then(resolve, reject)
          },
          onCancel: () => resolve(result),
        })
      })
    }
    return run()
  }
}

/**
 * Poll for the hub's `window.__omnimuxAuth` global, then invoke `cb(api)` once.
 * Mirrors the `registerWhenReady` pattern in sidebar-entry.js: the hub client
 * is evaluated on its own schedule, so this never assumes load order.
 * @param {(api: any) => void} cb
 * @returns {() => void} disposer
 */
export function whenAuthReady(cb) {
  if (typeof window === 'undefined') return () => {}
  let done = false
  const attempt = () => {
    if (done) return
    const api = window.__omnimuxAuth
    if (!api || typeof api.ensureLogin !== 'function') return
    done = true
    clearInterval(timer)
    cb(api)
  }
  const timer = setInterval(attempt, 500)
  attempt()
  return () => {
    done = true
    clearInterval(timer)
  }
}

/**
 * @param {{ platform?: string, group?: string }} [filters]
 */
export async function listAccounts(filters = {}) {
  const query = new URLSearchParams({ provider: 'zernio' })
  if (filters.platform) query.set('platform', filters.platform)
  if (filters.group) query.set('group', filters.group)
  const suffix = query.toString() ? `?${query}` : ''
  const result = await quotaGuard(() => accountsRequest(`/omnimux/accounts${suffix}`), { capability: 'accounts' })()
  if (result.ok && Array.isArray(result.body?.accounts)) {
    return { ...result, body: { ...result.body, accounts: result.body.accounts.filter((row) => row?.provider === 'zernio') } }
  }
  if (result.ok) return { ok: false, status: 502, body: { error: 'invalid account list response' } }
  return result
}

/**
 * @param {string} platform
 */
export const connectAccount = quotaGuard(authGuard((platform) =>
  accountsRequest('/omnimux/accounts', { method: 'POST', body: { platform, provider: 'zernio' } })), { capability: 'accounts' })

/**
 * @param {string} id
 */
export const disconnectAccount = quotaGuard(authGuard((id) =>
  accountsRequest(`/omnimux/accounts/${encodeURIComponent(id)}?provider=zernio`, { method: 'DELETE' })), { capability: 'accounts' })

/**
 * Updates Host-local account metadata (group / agent_usable).
 * @param {string} id
 * @param {{ group?: string | null, agent_usable?: boolean }} body
 */
export const patchAccount = quotaGuard(authGuard((id, body) =>
  accountsRequest(`/omnimux/accounts/${encodeURIComponent(id)}?provider=zernio`, { method: 'PATCH', body })), { capability: 'accounts' })
