/**
 * Viewport and RPC mailbox on Host side.
 * Stores last-known viewport from client and coordinates workbench_open_tab RPC waiter.
 *
 * Viewports are keyed by sessionId so concurrent browser tabs / headless probes
 * cannot overwrite each other's active workbench state.
 */

import { isViewportStale, validateEnvelope, validateRpcAck } from './contract.js'

export const RPC_TIMEOUT_MS = 2000

export function createWorkbenchMailbox(options = {}) {
  const hubEvents = options.hubEvents
  const rpcTimeoutMs = options.rpcTimeoutMs || RPC_TIMEOUT_MS

  /** @type {Map<string, object>} sessionId -> viewport envelope */
  const viewportsBySession = new Map()
  /** Most recently updated session (fallback when caller omits sessionId). */
  let lastSessionId = null
  const pendingRpcs = new Map() // requestId -> { resolve, timer }

  function resolveSessionId(envelopeOrId) {
    if (typeof envelopeOrId === 'string' && envelopeOrId) return envelopeOrId
    if (envelopeOrId && typeof envelopeOrId === 'object') {
      const sid = envelopeOrId.sessionId
      if (typeof sid === 'string' && sid) return sid
    }
    return lastSessionId || 'default'
  }

  function updateViewport(envelope) {
    const val = validateEnvelope(envelope)
    if (!val.valid) return { ok: false, error: val.error }
    const sessionId = resolveSessionId(envelope)
    const stored = Object.freeze({
      ...envelope,
      sessionId,
      receivedAt: Date.now(),
    })
    viewportsBySession.set(sessionId, stored)
    lastSessionId = sessionId
    return { ok: true, sessionId }
  }

  /**
   * Pick the freshest non-stale viewport, else the freshest any viewport.
   * Used when the caller does not know the session id (tool plane).
   */
  function pickFreshestViewport() {
    let best = null
    for (const vp of viewportsBySession.values()) {
      if (!best || (vp.capturedAt || 0) > (best.capturedAt || 0)) best = vp
    }
    if (!best) return null
    // Prefer a non-stale freshest if available
    let bestFresh = null
    for (const vp of viewportsBySession.values()) {
      if (isViewportStale(vp)) continue
      if (!bestFresh || (vp.capturedAt || 0) > (bestFresh.capturedAt || 0)) bestFresh = vp
    }
    return bestFresh || best
  }

  /**
   * @param {string} [sessionId] optional; when omitted returns the freshest session viewport
   */
  function getActiveView(sessionId) {
    const lastViewport = sessionId
      ? viewportsBySession.get(sessionId)
      : pickFreshestViewport()
    if (!lastViewport) {
      return {
        ok: true,
        stale: true,
        sessionId: sessionId || lastSessionId || null,
        uiContext: null,
      }
    }
    const stale = isViewportStale(lastViewport)
    return {
      ok: true,
      stale,
      sessionId: lastViewport.sessionId || sessionId || null,
      uiContext: lastViewport,
    }
  }

  function handleRpcAck(ackBody) {
    const val = validateRpcAck(ackBody)
    if (!val.valid) return { ok: false, error: val.error }
    const pending = pendingRpcs.get(ackBody.requestId)
    if (!pending) {
      return { ok: false, error: 'unknown-request-id' }
    }
    clearTimeout(pending.timer)
    pendingRpcs.delete(ackBody.requestId)
    pending.resolve(ackBody)
    return { ok: true }
  }

  function sendRpc(rpcPayload) {
    if (!hubEvents) {
      return Promise.resolve({ ok: true, applied: false, code: 'no-client' })
    }
    const requestId = rpcPayload.requestId
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingRpcs.delete(requestId)
        resolve({
          ok: true,
          applied: false,
          code: 'rpc-timeout',
        })
      }, rpcTimeoutMs)

      pendingRpcs.set(requestId, { resolve, timer })

      hubEvents.emit({
        type: 'omnimux:workbench:rpc',
        payload: rpcPayload,
      })
    })
  }

  function clearPending() {
    for (const [, item] of pendingRpcs.entries()) {
      clearTimeout(item.timer)
    }
    pendingRpcs.clear()
  }

  return {
    updateViewport,
    getActiveView,
    handleRpcAck,
    sendRpc,
    clearPending,
  }
}
