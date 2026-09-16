/**
 * Pairing sessions: a short-lived, human-typed code that hands the bridge token
 * to a loopback browser extension.
 *
 * The bridge token itself stays the only admission credential (BROWSER-01:
 * every client, loopback included, must present it). What made that credential
 * unusable for a fresh install was delivery, not strength — the user had to
 * copy 64 hex characters out of a dot-file. A pairing code moves the delivery
 * into a channel a web page cannot read: the code is shown in the host's own
 * surface, and redemption is accepted only from loopback without a page Origin.
 *
 * @module
 */

import { randomInt, timingSafeEqual } from 'node:crypto'

/** Digits a user has to type. */
export const PAIRING_CODE_DIGITS = 6

/** How long one code stays redeemable. */
export const PAIRING_TTL_MS = 120_000

/** Wrong-code attempts a single code survives before it is burned. */
export const PAIRING_MAX_ATTEMPTS = 5

/** Result of one redemption attempt. */
export type RedeemOutcome = 'ok' | 'no-session' | 'expired' | 'mismatch' | 'exhausted'

/** One live pairing code. */
export interface PairingSession {
  /** The digits the user types into the extension. */
  readonly code: string
  /** Epoch milliseconds after which the code is dead. */
  readonly expiresAt: number
  /** Wrong-code attempts still available. */
  attemptsLeft: number
}

/** Injectable clock and code source, so tests never depend on wall time. */
export interface PairingDeps {
  now?: () => number
  mint?: () => string
}

/** Six cryptographically random digits, uniformly distributed. */
function mintCode(): string {
  let out = ''
  for (let index = 0; index < PAIRING_CODE_DIGITS; index += 1) out += String(randomInt(0, 10))
  return out
}

/** Constant-time equality for two equal-length digit strings. */
function sameCode(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'utf8')
  const right = Buffer.from(actual, 'utf8')
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(left, right)
}

/**
 * The host's single live pairing session.
 *
 * One session per host process: a fresh code supersedes the previous one, so a
 * user who regenerates cannot be paired by a stale glance at the screen.
 */
export class PairingSessions {
  private session: PairingSession | null = null
  private readonly now: () => number
  private readonly mint: () => string

  constructor(deps: PairingDeps = {}) {
    this.now = deps.now ?? (() => Date.now())
    this.mint = deps.mint ?? mintCode
  }

  /** Mint a fresh code, invalidating any previous one. */
  start(): PairingSession {
    this.session = {
      code: this.mint(),
      expiresAt: this.now() + PAIRING_TTL_MS,
      attemptsLeft: PAIRING_MAX_ATTEMPTS,
    }
    return this.session
  }

  /** The live session, or null when none was started or the last one expired. */
  current(): PairingSession | null {
    const session = this.session
    if (session === null) return null
    if (this.now() >= session.expiresAt) {
      this.session = null
      return null
    }
    return session
  }

  /** Forget the current code (used by tests and by an explicit reset). */
  reset(): void {
    this.session = null
  }

  /**
   * Redeem one typed code.
   *
   * @param code - what the user typed, already trimmed.
   * @returns the outcome; `'ok'` means the caller may hand over the token.
   */
  redeem(code: string): RedeemOutcome {
    const session = this.session
    if (session === null) return 'no-session'
    if (this.now() >= session.expiresAt) {
      this.session = null
      return 'expired'
    }
    if (session.attemptsLeft <= 0) {
      this.session = null
      return 'exhausted'
    }
    if (sameCode(session.code, code)) {
      this.session = null
      return 'ok'
    }
    session.attemptsLeft -= 1
    if (session.attemptsLeft <= 0) {
      this.session = null
      return 'exhausted'
    }
    return 'mismatch'
  }
}

/**
 * Whether a request may even attempt redemption.
 *
 * A web page must never be able to read the token: WebSockets and fetches to
 * loopback are reachable from any site, and `Origin` is the one header a page
 * cannot forge. Loopback plus a non-page Origin (an extension context or a
 * non-browser local client) is the whole gate; the code itself is the secret.
 *
 * @param remoteAddress - socket peer address of the request.
 * @param origin - the request's `Origin` header, when present.
 * @param isLoopback - loopback predicate (injected for tests).
 * @returns true when redemption is allowed to proceed.
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
 * The host-side pairing page.
 *
 * Deliberately a plain document with no scripts beyond the countdown: the code
 * is the whole payload, and the page must never carry the token it unlocks.
 *
 * @param session - the live session to display.
 * @param port - host port, used only for the "open the extension" hint.
 * @returns a complete HTML document.
 */
export function pairingPageHtml(session: PairingSession, port: number): string {
  const digits = [...session.code].map((digit) => `<b>${digit}</b>`).join('')
  const seconds = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000))
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>配对浏览器插件</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
   background:#0b0b0d;color:#f2f2f4;font:15px/1.7 -apple-system,"PingFang SC",Arial,sans-serif}
 .card{width:min(520px,92vw);background:#141417;border:1px solid #26262b;border-radius:18px;padding:30px}
 h1{margin:0 0 6px;font-size:17px;font-weight:600}
 p{margin:0;color:#8b8b93;font-size:13px}
 .code{display:flex;gap:10px;justify-content:center;margin:22px 0 10px}
 .code b{width:52px;height:64px;display:flex;align-items:center;justify-content:center;
   background:#1c1c20;border:1px solid #26262b;border-radius:12px;font-size:30px;font-weight:700}
 .meta{text-align:center;color:#8b8b93;font-size:12.5px;min-height:20px}
 .steps{margin-top:20px;padding-top:18px;border-top:1px solid #26262b}
 .steps li{margin:4px 0;color:#8b8b93;font-size:13px}
 a{color:#f2f2f4}
</style></head><body>
<div class="card">
  <h1>配对浏览器插件</h1>
  <p>在浏览器插件面板里点「配对」，然后输入下面这 6 位数字。</p>
  <div class="code">${digits}</div>
  <div class="meta" id="m">剩余 <span id="s">${seconds}</span> 秒 · 输错 5 次即作废</div>
  <div class="steps"><ol>
    <li>保持这个页面打开（它只在本机可见，网页与其它扩展读不到）。</li>
    <li>插件面板 → 配对 → 输入这 6 位数字。</li>
    <li>配对成功后，以后每次打开都会自动连接，无需再输。</li>
  </ol>
  <p style="margin-top:14px"><a href="?new=1">重新生成配对码</a> · 本机端口 ${port}</p></div>
</div>
<script>
  let left = ${seconds};
  const s = document.getElementById('s');
  const timer = setInterval(() => {
    left -= 1; s.textContent = String(Math.max(0, left));
    if (left <= 0) { clearInterval(timer); document.getElementById('m').textContent = '已过期，请重新生成配对码'; }
  }, 1000);
</script>
</body></html>`
}
