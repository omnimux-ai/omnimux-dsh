/**
 * HTTP Routes for Agent-Workbench sync:
 * - POST /omnimux/workbench/viewport (client heartbeat)
 * - POST /omnimux/workbench/rpc/ack (RPC acknowledgement)
 */

import { assertLocalWrite } from '../apps/origin.js'
import { readJsonBody, sendJson } from '../auth/http-routes.js'

export function isLocalRequest(req) {
  const origin = req.headers?.origin || ''
  const referer = req.headers?.referer || ''
  const secFetchSite = req.headers?.['sec-fetch-site'] || ''

  if (secFetchSite === 'cross-site') return false

  const hostCandidate = origin || referer
  if (!hostCandidate) return true // local non-browser tool/curl

  try {
    const parsed = new URL(hostCandidate)
    const hostname = parsed.hostname.toLowerCase()
    return (
      hostname === '127.0.0.1' ||
      hostname === 'localhost' ||
      hostname === '::1' ||
      hostname === '[::1]'
    )
  } catch {
    return false
  }
}

export function registerWorkbenchHttpRoutes(webServer, deps) {
  if (!webServer || typeof webServer.register !== 'function') return () => {}
  const mailbox = deps.mailbox
  const disposers = []

  // Viewport Post: POST /omnimux/workbench/viewport
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/omnimux/workbench/viewport',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }

      try {
        assertLocalWrite(req)
      } catch {
        sendJson(res, 403, { ok: false, error: 'not-local' })
        return
      }

      const body = await readJsonBody(req)
      if (!body) {
        sendJson(res, 400, { ok: false, error: 'invalid-json' })
        return
      }

      const result = mailbox.updateViewport(body)
      sendJson(res, result.ok ? 200 : 400, result)
    },
  }))

  // RPC Ack: POST /omnimux/workbench/rpc/ack
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/omnimux/workbench/rpc/ack',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }

      try {
        assertLocalWrite(req)
      } catch {
        sendJson(res, 403, { ok: false, error: 'not-local' })
        return
      }

      const body = await readJsonBody(req)
      if (!body) {
        sendJson(res, 400, { ok: false, error: 'invalid-json' })
        return
      }

      const result = mailbox.handleRpcAck(body)
      sendJson(res, result.ok ? 200 : 400, result)
    },
  }))

  return () => {
    for (const d of disposers) {
      if (typeof d === 'function') d()
    }
  }
}
