import { getStatus } from './api-auth.js'
import { classifyQuotaFailure } from '../errors/quota-classifier.js'

export const VERIFY_TTL_MS = 30_000

const defaultNotify = (failure, context) => {
  const global = typeof window !== 'undefined' ? window.__omnimuxQuota : null
  if (global && typeof global.notify === 'function' && global.notify !== ensureQuota) global.notify(failure, context)
}

const defaultEnsureLogin = (options) => {
  const global = typeof window !== 'undefined' ? window.__omnimuxAuth : null
  if (global && typeof global.ensureLogin === 'function') return global.ensureLogin(options)
  options?.onCancel?.()
  return undefined
}

let impl = { getStatus, ensureLogin: defaultEnsureLogin, notify: defaultNotify }
let cached = null
let inflight = null

export function setQuotaPrecheckImpl(next = {}) {
  impl = { ...impl, ...next }
}

export function invalidateQuotaVerify() {
  cached = null
}

export function resetQuotaPrecheck() {
  cached = null
  inflight = null
  impl = { getStatus, ensureLogin: defaultEnsureLogin, notify: defaultNotify }
}

function authFailure(result) {
  return result?.status === 401 || result?.body?.logged_in === false || result?.body?.error === 'needs-omnimux'
}

function login() {
  if (typeof impl.ensureLogin !== 'function') return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    const finish = () => { if (!settled) { settled = true; resolve() } }
    try {
      const result = impl.ensureLogin({ onSuccess: finish, onCancel: finish, kind: 'write', action: 'quota' })
      if (result && typeof result.then === 'function') result.then(finish, finish)
    } catch { finish() }
  })
}

export function ensureQuota(context = {}) {
  const now = Date.now()
  if (cached && now - cached.at < VERIFY_TTL_MS) {
    if (cached.quota_usd <= 0) {
      impl.notify({ status: 402, code: 'quota-exceeded', body: { error: 'quota-exceeded' } }, context)
      return Promise.resolve({ ok: false, reason: 'quota' })
    }
    return Promise.resolve({ ok: true })
  }
  if (inflight) return inflight
  inflight = Promise.resolve().then(() => impl.getStatus(true)).then(async (result) => {
    if (authFailure(result)) {
      await login()
      return { ok: false, reason: 'auth' }
    }
    const classified = classifyQuotaFailure(result || {})
    if (classified.kind === 'quota-exceeded') {
      invalidateQuotaVerify()
      impl.notify({ status: 402, code: 'quota-exceeded', body: { error: 'quota-exceeded' } }, context)
      return { ok: false, reason: 'quota' }
    }
    if (result?.ok && result.body?.logged_in === true && typeof result.body.quota_usd === 'number') {
      if (result.body.quota_usd <= 0) {
        cached = { at: Date.now(), quota_usd: result.body.quota_usd }
        impl.notify({ status: 402, code: 'quota-exceeded', body: { error: 'quota-exceeded' } }, context)
        return { ok: false, reason: 'quota' }
      }
      cached = { at: Date.now(), quota_usd: result.body.quota_usd }
    }
    return { ok: true }
  }).catch((error) => {
    if (classifyQuotaFailure({ error }).kind === 'needs-omnimux') {
      return login().then(() => ({ ok: false, reason: 'auth' }))
    }
    return { ok: true }
  }).finally(() => { inflight = null })
  return inflight
}
