/**
 * The pairing HTTP surface: request → approve → status, plus the bare approval
 * page. Split out of `index.ts` so the routing stays readable and testable on
 * its own.
 *
 * Admission rules live in `pairing.ts`; this file only wires them to routes.
 *
 * @module
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import {
  BRIDGE_PAIR_PATH,
  BRIDGE_PAIR_APPROVE_PATH,
  BRIDGE_PAIR_REQUEST_PATH,
  BRIDGE_PAIR_STATUS_PATH,
} from './protocol.ts'
import { PairingRequests, pairingApprovalAllowed, pairingPageHtml, pairingRequestAllowed } from './pairing.ts'

/** What the routes need from the host. */
export interface PairingRouteDeps {
  /** The host's own port, used for the approval-origin check and the page URL. */
  port: () => number
  /** The bridge token handed out once a request is approved. */
  token: () => string
  /** Loopback predicate (injected so tests can drive both sides). */
  isLoopback: (address: string | undefined) => boolean
}

const NO_STORE = { 'cache-control': 'no-store' } as const

/** Read one small JSON body; pairing payloads are ids and nothing else. */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk as Buffer)
      size += buffer.length
      if (size > 1024) return null
      chunks.push(buffer)
    }
  } catch {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', ...NO_STORE })
  res.end(JSON.stringify(body))
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...NO_STORE })
  res.end(body)
}

/**
 * Build the pairing routes.
 *
 * @param deps - host port, token source, and the loopback predicate.
 * @returns the routes to register on the host web server.
 */
export function createPairingRoutes(deps: PairingRouteDeps): WebRoute[] {
  const requests = new PairingRequests()

  /** The page the user approves from, and the extension-side request handshake. */
  const pageRoute: WebRoute = {
    kind: 'exact',
    path: BRIDGE_PAIR_PATH,
    handler: (req, res) => {
      if (!pairingRequestAllowed(req.socket.remoteAddress, req.headers.origin, deps.isLoopback)) {
        sendText(res, 403, 'forbidden')
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendText(res, 405, 'method not allowed')
        return
      }
      const id = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('request') ?? ''
      // A stale or unknown id still renders the page: the click then fails
      // closed, and the extension's next poll reports `unknown`.
      const live = requests.poll(id) === 'pending' || requests.poll(id) === 'approved'
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...NO_STORE })
      res.end(pairingPageHtml(live ? id : ''))
    },
  }

  const requestRoute: WebRoute = {
    kind: 'exact',
    path: BRIDGE_PAIR_REQUEST_PATH,
    handler: (req, res) => {
      if (!pairingRequestAllowed(req.socket.remoteAddress, req.headers.origin, deps.isLoopback)) {
        sendText(res, 403, 'forbidden')
        return
      }
      if (req.method !== 'POST') {
        sendText(res, 405, 'method not allowed')
        return
      }
      const request = requests.create()
      sendJson(res, 200, {
        requestId: request.id,
        approveUrl: `http://127.0.0.1:${deps.port()}${BRIDGE_PAIR_PATH}?request=${encodeURIComponent(request.id)}`,
      })
    },
  }

  const approveRoute: WebRoute = {
    kind: 'exact',
    path: BRIDGE_PAIR_APPROVE_PATH,
    handler: (req, res) => {
      // Only the host's own page may approve: its Origin is the host's loopback
      // origin, which no other site can claim.
      if (!pairingApprovalAllowed(req.socket.remoteAddress, req.headers.origin, deps.port(), deps.isLoopback)) {
        sendText(res, 403, 'forbidden')
        return
      }
      if (req.method !== 'POST') {
        sendText(res, 405, 'method not allowed')
        return
      }
      void readJson(req).then((body) => {
        const id = typeof body?.requestId === 'string' ? body.requestId : ''
        if (id === '' || !requests.approve(id)) {
          sendJson(res, 404, { error: 'unknown-request' })
          return
        }
        sendJson(res, 200, { approved: true })
      })
    },
  }

  const statusRoute: WebRoute = {
    kind: 'exact',
    path: BRIDGE_PAIR_STATUS_PATH,
    handler: (req, res) => {
      if (!pairingRequestAllowed(req.socket.remoteAddress, req.headers.origin, deps.isLoopback)) {
        sendText(res, 403, 'forbidden')
        return
      }
      const id = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('request') ?? ''
      const state = requests.poll(id)
      if (state === 'approved') {
        // Single delivery: the id is spent the moment the token leaves the host.
        requests.consume(id)
        sendJson(res, 200, { state, token: deps.token() })
        return
      }
      sendJson(res, 200, { state })
    },
  }

  return [pageRoute, requestRoute, approveRoute, statusRoute]
}
