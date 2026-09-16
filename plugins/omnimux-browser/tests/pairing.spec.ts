/**
 * Pairing contract (Issue #2110): one approval button, no codes, and an
 * admission rule only the host's own page can satisfy.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PAIRING_TTL_MS, PairingRequests, pairingApprovalAllowed, pairingPageHtml, pairingRequestAllowed } from '../src/pairing.ts'
import { isLoopbackAddress } from '../src/server.ts'

/** Deterministic clock and ids, so nothing depends on wall time. */
function harness(): { requests: PairingRequests; advance: (ms: number) => void } {
  let clock = 1_000_000
  let index = 0
  const requests = new PairingRequests({ now: () => clock, mintId: () => `req-${String(index += 1)}` })
  return { requests, advance: (ms) => { clock += ms } }
}

describe('pairing requests (#2110)', () => {
  it('starts pending and reports approved only after the approval', () => {
    const { requests } = harness()
    const created = requests.create()
    expect(requests.poll(created.id)).toBe('pending')
    expect(requests.approve(created.id)).toBe(true)
    expect(requests.poll(created.id)).toBe('approved')
  })

  it('hands the token out exactly once', () => {
    const { requests } = harness()
    const created = requests.create()
    requests.approve(created.id)
    requests.consume(created.id)
    expect(requests.poll(created.id)).toBe('unknown')
    expect(requests.approve(created.id)).toBe(false)
  })

  it('expires a request that is never approved', () => {
    const { requests, advance } = harness()
    const created = requests.create()
    advance(PAIRING_TTL_MS - 1)
    expect(requests.poll(created.id)).toBe('pending')
    advance(1)
    expect(requests.poll(created.id)).toBe('expired')
    expect(requests.approve(created.id)).toBe(false)
  })

  it('supersedes the previous request and ignores unknown ids', () => {
    const { requests } = harness()
    const first = requests.create()
    const second = requests.create()
    expect(requests.approve(first.id)).toBe(false)
    expect(requests.approve(second.id)).toBe(true)
    expect(requests.poll('nope')).toBe('unknown')
  })
})

describe('pairing admission (#2110)', () => {
  it('lets a loopback client that is not a web page open and poll a request', () => {
    expect(pairingRequestAllowed('127.0.0.1', 'chrome-extension://abcdef', isLoopbackAddress)).toBe(true)
    expect(pairingRequestAllowed('::1', undefined, isLoopbackAddress)).toBe(true)
    expect(pairingRequestAllowed('127.0.0.1', 'https://evil.example', isLoopbackAddress)).toBe(false)
    expect(pairingRequestAllowed('192.168.1.5', undefined, isLoopbackAddress)).toBe(false)
  })

  it('accepts an approval only from the host own page origin', () => {
    expect(pairingApprovalAllowed('127.0.0.1', 'http://127.0.0.1:45120', 45120, isLoopbackAddress)).toBe(true)
    expect(pairingApprovalAllowed('127.0.0.1', 'http://localhost:45120', 45120, isLoopbackAddress)).toBe(true)
    expect(pairingApprovalAllowed('127.0.0.1', 'https://evil.example', 45120, isLoopbackAddress)).toBe(false)
    expect(pairingApprovalAllowed('127.0.0.1', 'http://127.0.0.1:45121', 45120, isLoopbackAddress)).toBe(false)
    expect(pairingApprovalAllowed('127.0.0.1', undefined, 45120, isLoopbackAddress)).toBe(false)
    expect(pairingApprovalAllowed('192.168.1.5', 'http://127.0.0.1:45120', 45120, isLoopbackAddress)).toBe(false)
  })

  it('renders one button and no digits', () => {
    const html = pairingPageHtml('req-1')
    expect(html).toContain('确认授权')
    expect(html).toContain('window.close')
    expect(/<b>\d<\/b>/u.test(html)).toBe(false)
  })
})

describe('no pairing code left behind (#2110)', () => {
  it('removed the code flow from both sides', () => {
    const read = (rel: string): string => readFileSync(resolve(import.meta.dirname, '..', rel), 'utf8')
    const background = read('extension/src/background/index.ts')
    const panel = read('extension/src/panel/App.tsx')
    expect(background).not.toContain('PAIR_WITH_CODE')
    expect(background).toContain('PAIR_START')
    expect(background).toContain('chrome.tabs.remove')
    expect(panel).not.toContain('pair-row')
    expect(panel).toContain('pair-button')
  })
})
