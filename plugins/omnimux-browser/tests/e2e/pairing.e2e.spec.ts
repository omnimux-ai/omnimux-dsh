/**
 * Pairing end-to-end (Issue #2095): a real Chromium loads the built extension,
 * the real bridge and pairing routes run on a real port, and the assertion is
 * the extension's own connection state after the code is typed.
 *
 * Playwright is imported dynamically so an environment without it skips this
 * file instead of failing collection, and the flow is skipped when the
 * extension bundle has not been built.
 */

import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BridgeServer, isLoopbackAddress } from '../../src/server.ts'
import { PairingSessions, pairingPageHtml, pairingRequestAllowed } from '../../src/pairing.ts'
import type { BrowserHostApi } from '../../src/host-api.ts'

const TOKEN = 'e2e-pairing-token-0123456789abcdef'
const DIST = resolve(import.meta.dirname, '../../extension/dist')

interface ChromiumLike {
  launchPersistentContext: (profile: string, options: Record<string, unknown>) => Promise<{
    serviceWorkers: () => Array<{ url: () => string }>
    waitForEvent: (event: string, options: { timeout: number }) => Promise<{ url: () => string }>
    pages: () => unknown[]
    newPage: () => Promise<unknown>
    close: () => Promise<void>
  }>
}

function chromiumExecutable(): string | undefined {
  const cacheRoot = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (!existsSync(cacheRoot)) return undefined
  for (const dir of ['chromium-1217', 'chromium-1226', 'chromium-1181']) {
    const candidate = join(cacheRoot, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

async function loadChromium(): Promise<ChromiumLike | undefined> {
  try {
    const module = await import('playwright-core') as unknown as { chromium: ChromiumLike }
    return module.chromium
  } catch {
    return undefined
  }
}

/** Playwright is a dev-only driver here: without it this file skips, never fails. */
const hasPlaywright = (() => {
  try { createRequire(import.meta.url).resolve('playwright-core'); return true } catch { return false }
})()

const executable = chromiumExecutable()
const runnable = hasPlaywright && executable !== undefined && existsSync(join(DIST, 'manifest.json'))

describe.skipIf(!runnable)('pairing end to end (#2095)', () => {
  let server: Server | undefined
  let port = 0
  let chromium: ChromiumLike | undefined
  let context: Awaited<ReturnType<ChromiumLike['launchPersistentContext']>> | undefined

  beforeAll(async () => {
    chromium = await loadChromium()
    if (chromium === undefined) return
    const bridge = new BridgeServer({
      token: TOKEN,
      api: {
        call: async () => ({ ok: true, value: null }),
        async *events() {},
        respond: async () => ({ accepted: true }),
      } satisfies BrowserHostApi,
      toolTimeoutMs: 1_000,
      caps: { textOnly: true, snapshotMaxChars: 12_000, maxInteractiveItems: 60 },
      injectBrowserSnapshot: () => {},
      purgeSession: async () => {},
    })
    const pairing = new PairingSessions()
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const allowed = pairingRequestAllowed(req.socket.remoteAddress, req.headers.origin, isLoopbackAddress)
      if (url.pathname !== '/ext/pair' || !allowed) {
        res.writeHead(403, { 'cache-control': 'no-store' }).end('forbidden')
        return
      }
      if (req.method === 'GET') {
        const session = pairing.current() ?? pairing.start()
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(pairingPageHtml(session, port))
        return
      }
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      req.on('end', () => {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { code?: string }
        const outcome = pairing.redeem(parsed.code ?? '')
        const status = outcome === 'ok' ? 200 : outcome === 'mismatch' ? 401 : outcome === 'exhausted' ? 429 : 409
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify(outcome === 'ok' ? { token: TOKEN } : { error: outcome }))
      })
    })
    server.on('upgrade', (req, socket, head) => { bridge.handleUpgrade(req, socket, head) })
    await new Promise<void>((ready) => { server!.listen(0, '127.0.0.1', ready) })
    port = (server.address() as AddressInfo).port
  }, 60_000)

  afterAll(async () => {
    await context?.close().catch(() => {})
    await new Promise<void>((done) => { server?.close(() => { done() }) })
  })

  it('pairs with the host code, persists the token, and connects', { timeout: 120_000 }, async () => {
    if (chromium === undefined) return
    const profile = join(process.env.TMPDIR ?? '/tmp', `omnimux-pair-e2e-${String(Date.now())}`)
    context = await chromium.launchPersistentContext(profile, {
      executablePath: executable,
      headless: true,
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--no-first-run'],
    })
    let worker = context.serviceWorkers()[0]
    if (worker === undefined) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 })
    const panelUrl = `chrome-extension://${new URL(worker.url()).host}/panel/index.html`

    // The code comes from the host's own page, exactly as a user would read it.
    const html = await (await fetch(`http://127.0.0.1:${port}/ext/pair`)).text()
    const code = [...html.matchAll(/<b>(\d)<\/b>/gu)].map((match) => match[1]).join('')
    expect(code).toMatch(/^\d{6}$/u)

    const page = (context.pages()[0] ?? await context.newPage()) as {
      goto: (url: string) => Promise<unknown>
      waitForSelector: (selector: string, options: { timeout: number }) => Promise<unknown>
      evaluate: (fn: unknown, arg?: unknown) => Promise<unknown>
      reload: (options: { waitUntil: string }) => Promise<unknown>
      locator: (selector: string) => {
        fill: (value: string) => Promise<void>
        click: () => Promise<void>
        isVisible: () => Promise<boolean>
      }
      waitForTimeout: (ms: number) => Promise<void>
    }
    await page.goto(panelUrl)
    await page.waitForSelector('footer.composer', { timeout: 15_000 })
    await page.evaluate(async ([url]: [string]) => {
      const runtime = (globalThis as unknown as { chrome: { runtime: { sendMessage: (message: unknown) => Promise<unknown> } } }).chrome.runtime
      await runtime.sendMessage({ type: 'SETTINGS_UPDATED', payload: { bridgeUrl: url, token: '' } })
    }, [`ws://127.0.0.1:${port}/ext/bridge`])
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('footer.composer', { timeout: 15_000 })
    await page.waitForTimeout(800)
    expect(await page.locator('.pair-card').first().isVisible()).toBe(true)

    await page.locator('.pair-row input').fill(code)
    await page.locator('.pair-row button').click()
    await page.waitForTimeout(3_000)

    const snapshot = await page.evaluate(() => new Promise((resolve) => {
      const chrome = (globalThis as unknown as {
        chrome: {
          runtime: { connect: (info: { name: string }) => { postMessage: (message: unknown) => void; disconnect: () => void; onMessage: { addListener: (fn: (message: { type?: string; state?: string }) => void) => void } } }
          storage: { local: { get: (key: string) => Promise<Record<string, { token?: string }>> } }
        }
      }).chrome
      const port = chrome.runtime.connect({ name: 'dsh-panel' })
      const timer = setTimeout(() => { resolve({ state: 'timeout', token: '' }) }, 6_000)
      port.onMessage.addListener((message) => {
        if (message?.type !== 'status') return
        clearTimeout(timer)
        void chrome.storage.local.get('dshSettings').then((stored) => {
          port.disconnect()
          resolve({ state: message.state ?? '', token: stored.dshSettings?.token ?? '' })
        })
      })
      port.postMessage({ type: 'request-status' })
    })) as { state: string; token: string }

    expect(snapshot.state).toBe('connected')
    expect(snapshot.token).toBe(TOKEN)
    expect(await page.locator('.pair-card').first().isVisible()).toBe(false)
  })

  it('refuses a web page origin', { timeout: 30_000 }, async () => {
    const response = await fetch(`http://127.0.0.1:${port}/ext/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ code: '123456' }),
    })
    expect(response.status).toBe(403)
  })
})
