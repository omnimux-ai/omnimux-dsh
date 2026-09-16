/**
 * Pairing channel contract (Issue #2095).
 *
 * The code is a delivery channel for the bridge token, not a replacement for
 * it: these tests pin the properties that make that delivery safe — bounded
 * lifetime, bounded guessing, and a gate that a web page cannot pass.
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  PAIRING_MAX_ATTEMPTS,
  PAIRING_TTL_MS,
  PairingSessions,
  pairingPageHtml,
  pairingRequestAllowed,
} from '../src/pairing.ts'
import { isLoopbackAddress } from '../src/server.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Deterministic clock and code source; real crypto is covered by the probe. */
function harness(codes: string[] = ['123456', '654321', '111111']): { sessions: PairingSessions; advance: (ms: number) => void } {
  let clock = 1_000_000
  let index = 0
  const sessions = new PairingSessions({
    now: () => clock,
    mint: () => codes[Math.min(index++, codes.length - 1)],
  })
  return { sessions, advance: (ms) => { clock += ms } }
}

describe('pairing session (#2095)', () => {
  it('mints one live code at a time and consumes it on redemption', () => {
    const { sessions } = harness()
    expect(sessions.current()).toBeNull()
    const session = sessions.start()
    expect(session.code).toBe('123456')
    expect(session.attemptsLeft).toBe(PAIRING_MAX_ATTEMPTS)
    expect(sessions.current()?.code).toBe('123456')

    expect(sessions.redeem('123456')).toBe('ok')
    // A redeemed code cannot be replayed by a second client.
    expect(sessions.redeem('123456')).toBe('no-session')
    expect(sessions.current()).toBeNull()
  })

  it('burns the code after the attempt budget so guessing has five tries', () => {
    const { sessions } = harness()
    sessions.start()
    const wrong = '000000'
    for (let attempt = 1; attempt < PAIRING_MAX_ATTEMPTS; attempt += 1) {
      expect(sessions.redeem(wrong)).toBe('mismatch')
    }
    expect(sessions.redeem(wrong)).toBe('exhausted')
    // The correct code no longer helps once the session is burned.
    expect(sessions.redeem('123456')).toBe('no-session')
  })

  it('refuses a code past its lifetime and reports why', () => {
    const { sessions, advance } = harness()
    sessions.start()
    advance(PAIRING_TTL_MS - 1)
    expect(sessions.redeem('123456')).toBe('ok')

    const second = harness()
    second.sessions.start()
    second.advance(PAIRING_TTL_MS)
    expect(second.sessions.redeem('123456')).toBe('expired')
    expect(second.sessions.current()).toBeNull()
  })

  it('invalidates the previous code when a new one is generated', () => {
    const { sessions } = harness()
    const first = sessions.start()
    const second = sessions.start()
    expect(first.code).not.toBe(second.code)
    expect(sessions.redeem(first.code)).toBe('mismatch')
    expect(sessions.redeem(second.code)).toBe('ok')
  })

  it('rejects an empty or malformed code without spending the whole budget blindly', () => {
    const { sessions } = harness()
    sessions.start()
    expect(sessions.redeem('')).toBe('mismatch')
    expect(sessions.redeem('12345')).toBe('mismatch')
    expect(sessions.redeem('123456')).toBe('ok')
  })
})

describe('pairing request gate (#2095)', () => {
  it('admits loopback clients that are not web pages', () => {
    expect(pairingRequestAllowed('127.0.0.1', 'chrome-extension://abcdef', isLoopbackAddress)).toBe(true)
    expect(pairingRequestAllowed('::1', undefined, isLoopbackAddress)).toBe(true)
    expect(pairingRequestAllowed('::ffff:127.0.0.1', 'moz-extension://uuid', isLoopbackAddress)).toBe(true)
  })

  it('refuses any page origin, so a site can never read the token', () => {
    expect(pairingRequestAllowed('127.0.0.1', 'https://evil.example', isLoopbackAddress)).toBe(false)
    expect(pairingRequestAllowed('127.0.0.1', 'http://127.0.0.1:45120', isLoopbackAddress)).toBe(false)
  })

  it('refuses non-loopback peers even with a page-free Origin', () => {
    expect(pairingRequestAllowed('192.168.1.5', undefined, isLoopbackAddress)).toBe(false)
    expect(pairingRequestAllowed(undefined, undefined, isLoopbackAddress)).toBe(false)
  })
})

describe('pairing page (#2095)', () => {
  const originalNow = Date.now
  afterEach(() => { Date.now = originalNow })

  it('shows the digits and carries no secret', () => {
    const session = { code: '654321', expiresAt: Date.now() + PAIRING_TTL_MS, attemptsLeft: PAIRING_MAX_ATTEMPTS }
    const html = pairingPageHtml(session, 45120)
    const shown = [...html.matchAll(/<b>(\d)<\/b>/gu)].map((match) => match[1]).join('')
    expect(shown).toBe('654321')
    expect(html).not.toContain('ext-bridge-token')
    expect(html).toContain('45120')
    expect(html).toContain('输错 5 次即作废')
  })
})

describe('settings persistence call sites (#2095)', () => {
  it('never calls the undefined saveSettings helper', () => {
    const background = readFileSync(resolve(import.meta.dirname, '../extension/src/background/index.ts'), 'utf8')
    // `saveSettings` was never defined in this module; the instance switch threw
    // ReferenceError on it, so the switch neither persisted nor reconnected.
    expect(background).not.toMatch(/\bsaveSettings\s*\(/u)
    expect(background).toMatch(/persistSettings\(/u)
  })
})
