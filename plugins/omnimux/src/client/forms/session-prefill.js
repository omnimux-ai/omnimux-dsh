/**
 * Session-scoped, one-shot composer prefill intent.
 *
 * The intent is consumed only by the official conversation slot rendered for
 * its target session. This deliberately avoids DOM editor discovery, which
 * cannot distinguish a visible target editor from a retained editor.
 */
let pendingIntent = null
const listeners = new Set()

const DEFAULT_TIMEOUT_MS = 6000

/**
 * @param {{ targetSessionId: string, prompt: string, attach: () => unknown, timeoutMs?: number }} request
 * @returns {Promise<{ ok: true, via: 'input-actions', duplicate?: boolean } | { ok: false, error: 'draft-protected' | 'composer-missing' | 'composer-rejected' | 'attach-full' | 'attach-failed' }>}
 */
export function queueSessionPrefill(request) {
  const targetSessionId = String(request?.targetSessionId ?? '')
  const prompt = String(request?.prompt ?? '')
  const attach = typeof request?.attach === 'function' ? request.attach : null
  const timeoutMs = Number.isFinite(request?.timeoutMs) ? Math.max(0, request.timeoutMs) : DEFAULT_TIMEOUT_MS
  if (!targetSessionId || targetSessionId === 'default' || !prompt || !attach) {
    return Promise.resolve({ ok: false, error: 'composer-missing' })
  }

  if (pendingIntent) return Promise.resolve({ ok: false, error: 'composer-busy' })
  return new Promise((resolve) => {
    const intent = {
      targetSessionId,
      prompt,
      attach,
      requireReadback: request.requireReadback === true,
      resolve,
      timer: setTimeout(() => finishIntent(intent, { ok: false, error: 'composer-missing' }), timeoutMs),
    }
    pendingIntent = intent
    emitSessionPrefill()
  })
}

/**
 * Subscribe the session-scoped composer consumer to queued intent changes.
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeSessionPrefill(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Testable official-slot decision. `inputActions` belongs to the slot's
 * rendered session, so a match proves the target and current session agree.
 * @param {{ targetSessionId: string, prompt: string, attach: () => unknown, resolve: Function, timer: ReturnType<typeof setTimeout> } | null} intent
 * @param {{ sessionId?: string, draft?: string, inputActions?: { setDraft?: (draft: string) => void } }} slot
 * @returns {'waiting' | 'consumed' | 'protected' | 'rejected' | 'attach-full' | 'attach-failed'}
 */
export function consumeSessionPrefill(intent, slot) {
  if (!intent || pendingIntent !== intent) return 'waiting'
  if (String(slot?.sessionId ?? '') !== intent.targetSessionId) return 'waiting'
  if (intent.written) {
    if (String(slot?.draft ?? '') !== intent.prompt) return 'waiting'
    finishIntent(intent, { ok: true, via: 'input-actions' })
    return 'consumed'
  }
  if (slot?.protected || String(slot?.draft ?? '') !== '') {
    finishIntent(intent, { ok: false, error: 'draft-protected' })
    return 'protected'
  }
  if (typeof slot?.inputActions?.setDraft !== 'function') {
    finishIntent(intent, { ok: false, error: 'composer-rejected' })
    return 'rejected'
  }
  let attachment
  try {
    attachment = intent.attach()
  } catch {
    finishIntent(intent, { ok: false, error: 'attach-failed' })
    return 'attach-failed'
  }
  if (attachment && typeof attachment.then === 'function') {
    finishIntent(intent, { ok: false, error: 'attach-failed' })
    return 'attach-failed'
  }
  const reason = String(attachment?.reason ?? '')
  if (attachment?.ok !== true && reason !== 'duplicate') {
    const error = reason === 'quota-exceeded' ? 'attach-full' : 'attach-failed'
    finishIntent(intent, { ok: false, error })
    return error
  }
  try {
    if (intent.requireReadback) { intent.written = true; intent.rollback = attachment?.rollback }
    const result = slot.inputActions.setDraft(intent.prompt)
    if (result && typeof result.then === 'function') throw new Error('async setDraft unsupported')
    if (intent.requireReadback) return 'waiting'
    finishIntent(intent, {
      ok: true,
      via: 'input-actions',
      ...(reason === 'duplicate' ? { duplicate: true } : {}),
    })
    return 'consumed'
  } catch {
    attachment?.rollback?.()
    finishIntent(intent, { ok: false, error: 'composer-rejected' })
    return 'rejected'
  }
}

/** @returns {object | null} */
export function getPendingSessionPrefill() {
  return pendingIntent
}

/** Test-only cleanup. */
export function resetSessionPrefill() {
  if (pendingIntent) finishIntent(pendingIntent, { ok: false, error: 'composer-rejected' })
}

function finishIntent(intent, result) {
  if (pendingIntent !== intent) return
  pendingIntent = null
  if (!result.ok) intent.rollback?.()
  clearTimeout(intent.timer)
  intent.resolve(result)
  emitSessionPrefill()
}

function emitSessionPrefill() {
  for (const listener of listeners) {
    try { listener() } catch { /* isolate subscriber failures */ }
  }
}
