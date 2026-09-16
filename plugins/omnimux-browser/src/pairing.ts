/**
 * One-click pairing: the host's own page approves a pending request, and the
 * extension picks the token up from a loopback poll.
 *
 * The bridge token stays the only admission credential (BROWSER-01). What this
 * module replaces is the *delivery*: instead of a code the user retypes, the
 * host serves a page with a single 「确认授权」 button. Only that page's own
 * origin may approve — a different site cannot forge an Origin — so a hostile
 * page can neither approve a request nor read the token.
 *
 * @module
 */

import { randomUUID, timingSafeEqual } from 'node:crypto'

/** How long one pending request stays approvable. */
export const PAIRING_TTL_MS = 120_000

/** One pending authorization. */
export interface PairingRequest {
  readonly id: string
  readonly expiresAt: number
  approved: boolean
  cancelled: boolean
  consumed: boolean
}

/** Poll answer for the extension. */
export type PairingPoll = 'pending' | 'approved' | 'cancelled' | 'expired' | 'unknown'

/** Injectable clock and id source, so tests never depend on wall time. */
export interface PairingDeps {
  now?: () => number
  mintId?: () => string
}

/** Constant-time id comparison; ids are equal-length UUIDs. */
function sameId(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'utf8')
  const right = Buffer.from(actual, 'utf8')
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(left, right)
}

/**
 * The host's pending pairing requests.
 *
 * One live request at a time is enough — a new request supersedes the previous
 * one — and each is single-use: an approval without a poll, or a poll without
 * an approval, simply reads as `unknown`.
 */
export class PairingRequests {
  private current: PairingRequest | null = null
  private readonly now: () => number
  private readonly mintId: () => string

  constructor(deps: PairingDeps = {}) {
    this.now = deps.now ?? (() => Date.now())
    this.mintId = deps.mintId ?? (() => randomUUID())
  }

  /** Open a fresh request, invalidating any previous one. */
  create(): PairingRequest {
    this.current = {
      id: this.mintId(),
      expiresAt: this.now() + PAIRING_TTL_MS,
      approved: false,
      cancelled: false,
      consumed: false,
    }
    return this.current
  }

  /** The live request with this id, or null when unknown, expired or consumed. */
  private live(id: string): PairingRequest | null {
    const request = this.current
    if (request === null || request.consumed) return null
    if (!sameId(request.id, id)) return null
    if (this.now() >= request.expiresAt) return null
    return request
  }

  /**
   * Approve one request, as the host's own page does.
   *
   * @param id - the request id the page was opened with.
   * @returns true when a live request was approved.
   */
  approve(id: string): boolean {
    const request = this.live(id)
    if (request === null) return false
    request.approved = true
    return true
  }

  /**
   * Cancel one request, as the host's own page does.
   *
   * @param id - the request id the page was opened with.
   * @returns true when a live request was cancelled.
   */
  cancel(id: string): boolean {
    const request = this.live(id)
    if (request === null) return false
    request.cancelled = true
    return true
  }

  /** Read the state the extension polls for. */
  poll(id: string): PairingPoll {
    const request = this.current
    if (request !== null && !request.consumed && sameId(request.id, id) && this.now() >= request.expiresAt) {
      return 'expired'
    }
    const live = this.live(id)
    if (live === null) return 'unknown'
    if (live.cancelled) return 'cancelled'
    return live.approved ? 'approved' : 'pending'
  }

  /** Mark the token as delivered, so the id cannot be polled twice. */
  consume(id: string): void {
    const live = this.live(id)
    if (live !== null) live.consumed = true
  }

  /** Forget the current request. */
  reset(): void {
    this.current = null
  }
}

/**
 * The code both sides show so the user can match them: the tail of the request
 * id, upper-cased. Deterministic, so no extra state has to travel.
 *
 * @param requestId - the opaque request id.
 * @returns six upper-case characters, or the id when it is short.
 */
export function shortCode(requestId: string): string {
  return requestId.slice(-6).toUpperCase()
}

/**
 * Whether an extension-side pairing call may proceed.
 *
 * @param remoteAddress - socket peer address.
 * @param origin - the request's Origin header, when present.
 * @param isLoopback - loopback predicate (injected for tests).
 * @returns true for loopback callers that are not web pages.
 */
export function pairingRequestAllowed(
  remoteAddress: string | undefined,
  origin: string | undefined,
  isLoopback: (address: string | undefined) => boolean,
): boolean {
  if (!isLoopback(remoteAddress)) return false
  if (typeof origin === 'string' && /^https?:\/\//iu.test(origin)) return false
  return true
}

/**
 * Whether an approval may proceed: only the host's own page may approve.
 *
 * That page is served from the host's loopback origin, so its `Origin` is
 * exactly `http://127.0.0.1:<port>` or `http://localhost:<port>`. Any other
 * site carries its own origin and is refused, and a page cannot forge this
 * header; DNS-rebinding is covered for the same reason.
 *
 * @param remoteAddress - socket peer address.
 * @param origin - the request's Origin header.
 * @param port - the host's own port.
 * @param isLoopback - loopback predicate (injected for tests).
 * @returns true when this is the host's own approval page.
 */
export function pairingApprovalAllowed(
  remoteAddress: string | undefined,
  origin: string | undefined,
  port: number,
  isLoopback: (address: string | undefined) => boolean,
): boolean {
  if (!isLoopback(remoteAddress)) return false
  if (typeof origin !== 'string') return false
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`
}

/**
 * The pairing page: the code to cross-check, then approve or cancel.
 *
 * The code is shown, never typed — the extension displays the same one, and a
 * match is what tells the user this is the request they just started.
 *
 * @param requestId - the request this page acts on.
 * @param code - the short code the extension is showing.
 * @returns a complete HTML document.
 */
export function pairingPageHtml(requestId: string, code: string): string {
  const id = JSON.stringify(requestId)
  const shown = JSON.stringify(code)
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>配对浏览器插件</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
   background:#0b0b0d;color:#f2f2f4;font:15px/1.6 -apple-system,"PingFang SC",Arial,sans-serif}
 .card{width:min(420px,92vw);text-align:center}
 .label{color:#8b8b93;font-size:12.5px;margin-bottom:8px}
 .code{font-size:30px;font-weight:700;letter-spacing:0.22em;margin:0 0 6px}
 .hint{color:#8b8b93;font-size:12.5px;margin:0 0 22px}
 .row{display:flex;gap:10px}
 button{flex:1;font:inherit;font-weight:600;font-size:15px;border-radius:11px;padding:13px 0;cursor:pointer}
 #approve{color:#000;background:#f2f2f4;border:0}
 #cancel{color:#f2f2f4;background:transparent;border:1px solid #3a3a41}
 button:hover{transform:translateY(-1px)}
 button:disabled{opacity:.4;cursor:default;transform:none}
 #done{margin-top:20px;color:#8b8b93;font-size:13px}
</style></head><body>
<div class="card">
  <div id="action">
    <div class="label">请在浏览器插件里核对授权码</div>
    <div class="code" id="code"></div>
    <p class="hint">两边一致即是在授权这一次请求</p>
    <div class="row">
      <button id="approve">确认授权</button>
      <button id="cancel">取消授权</button>
    </div>
  </div>
  <div id="done" hidden></div>
</div>
<script>
  const requestId = ${id};
  document.getElementById('code').textContent = ${shown};
  async function send(action, done) {
    try {
      await fetch('/ext/pair/' + action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: requestId })
      });
    } catch (error) { /* the extension still learns the outcome from its poll */ }
    document.getElementById('action').hidden = true;
    const node = document.getElementById('done');
    node.hidden = false;
    node.textContent = done;
    setTimeout(function () { window.close() }, 400);
  }
  document.getElementById('approve').addEventListener('click', function (event) {
    event.currentTarget.disabled = true;
    void send('approve', '\u2713 已授权');
  });
  document.getElementById('cancel').addEventListener('click', function (event) {
    event.currentTarget.disabled = true;
    void send('cancel', '已取消授权');
  });
</script>
</body></html>`
}
