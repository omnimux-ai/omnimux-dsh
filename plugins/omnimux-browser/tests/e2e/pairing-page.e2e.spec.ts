/**
 * Pairing page revision, end to end (Issue #2116).
 *
 * Real routes on a real port, opened in a real browser: the page shows the same
 * short code the request returned, offers approve and cancel, and carries no
 * input field — the code is for cross-checking only. Approving and cancelling
 * are both single-use, and a foreign origin can do neither.
 *
 * Skipped (never failed) when playwright-core or a Chromium build is absent.
 */

import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPairingRoutes } from '../../src/pairing-routes.ts'
import { isLoopbackAddress } from '../../src/server.ts'

const TOKEN = 'e2e-ui-token-0123456789abcdef'

function chromiumExecutable(): string | undefined {
  const cacheRoot = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (!existsSync(cacheRoot)) return undefined
  for (const dir of ['chromium-1217', 'chromium-1226', 'chromium-1181']) {
    const candidate = join(cacheRoot, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

const hasPlaywright = (() => {
  try { createRequire(import.meta.url).resolve('playwright-core'); return true } catch { return false }
})()
const executable = chromiumExecutable()
const runnable = hasPlaywright && executable !== undefined

describe.skipIf(!runnable)('pairing page revision (#2116)', () => {
  let server: Server | undefined
  let port = 0
  let base = ''
  let browser: { close: () => Promise<void> } | undefined
  let newPage: (() => Promise<unknown>) | undefined

  beforeAll(async () => {
    const playwright = await import('playwright-core') as unknown as {
      chromium: { launch: (options: Record<string, unknown>) => Promise<{ newContext: (o?: Record<string, unknown>) => Promise<{ newPage: () => Promise<unknown> }>; close: () => Promise<void> }> }
    }
    const instance = await playwright.chromium.launch({ executablePath: executable, headless: true })
    browser = instance
    const context = await instance.newContext({ viewport: { width: 520, height: 420 } })
    newPage = () => context.newPage()

    const routes = createPairingRoutes({ port: () => port, token: () => TOKEN, isLoopback: isLoopbackAddress })
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const route = routes.find((candidate) => candidate.kind === 'exact' && candidate.path === url.pathname)
      if (route === undefined) {
        res.writeHead(404).end('not found')
        return
      }
      void route.handler(req, res)
    })
    await new Promise<void>((ready) => { server!.listen(0, '127.0.0.1', ready) })
    port = (server.address() as AddressInfo).port
    base = `http://127.0.0.1:${port}`
  }, 60_000)

  afterAll(async () => {
    await browser?.close().catch(() => {})
    await new Promise<void>((done) => { server?.close(() => { done() }) })
  })

  it('shows the request code with approve and cancel, and no input field', { timeout: 60_000 }, async () => {
    if (newPage === undefined) return
    const created = await (await fetch(`${base}/ext/pair/request`, { method: 'POST' })).json() as {
      requestId: string; approveUrl: string; code: string
    }
    expect(created.code).toMatch(/^[0-9A-F]{6}$/u)

    const page = await newPage() as {
      goto: (url: string) => Promise<unknown>
      locator: (selector: string) => { textContent: () => Promise<string | null> }
      evaluate: (fn: unknown) => Promise<unknown>
    }
    await page.goto(created.approveUrl)
    expect(((await page.locator('#code').textContent()) ?? '').trim()).toBe(created.code)
    const shape = await page.evaluate(() => ({
      approve: Boolean(document.querySelector('#approve')),
      cancel: Boolean(document.querySelector('#cancel')),
      inputs: document.querySelectorAll('input, textarea').length,
    })) as { approve: boolean; cancel: boolean; inputs: number }
    expect(shape).toEqual({ approve: true, cancel: true, inputs: 0 })
  })

  it('approving hands out the token once; cancelling never does', { timeout: 60_000 }, async () => {
    const first = await (await fetch(`${base}/ext/pair/request`, { method: 'POST' })).json() as { requestId: string }
    const foreign = await fetch(`${base}/ext/pair/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ requestId: first.requestId }),
    })
    expect(foreign.status).toBe(403)

    const approvedFromOwnPage = await fetch(`${base}/ext/pair/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ requestId: first.requestId }),
    })
    expect(approvedFromOwnPage.status).toBe(200)
    const status = await (await fetch(`${base}/ext/pair/status?request=${encodeURIComponent(first.requestId)}`)).json() as { state: string; token?: string }
    expect(status.state).toBe('approved')
    expect(status.token).toBe(TOKEN)
    const repeat = await (await fetch(`${base}/ext/pair/status?request=${encodeURIComponent(first.requestId)}`)).json() as { state: string }
    expect(repeat.state).toBe('unknown')

    const second = await (await fetch(`${base}/ext/pair/request`, { method: 'POST' })).json() as { requestId: string }
    const cancelled = await fetch(`${base}/ext/pair/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ requestId: second.requestId }),
    })
    expect(cancelled.status).toBe(200)
    const after = await (await fetch(`${base}/ext/pair/status?request=${encodeURIComponent(second.requestId)}`)).json() as { state: string; token?: string }
    expect(after.state).toBe('cancelled')
    expect(after.token).toBeUndefined()
    const foreignCancel = await fetch(`${base}/ext/pair/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ requestId: second.requestId }),
    })
    expect(foreignCancel.status).toBe(403)
  })
})
