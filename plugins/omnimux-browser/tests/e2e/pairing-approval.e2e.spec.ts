/**
 * One-click pairing end to end (Issue #2110).
 *
 * Real Chromium + the built extension + the real pairing routes and bridge on a
 * real port. The assertions are the user-visible promises: one button in the
 * panel, one button on the approval page, and after that single click the
 * extension is connected, the token is stored, and the approval tab is gone.
 *
 * Playwright is imported dynamically and the file skips when it or the built
 * extension is missing, so unit-test runs stay green without them.
 */

import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BridgeServer, isLoopbackAddress } from '../../src/server.ts'
import { createPairingRoutes } from '../../src/pairing-routes.ts'
import type { BrowserHostApi } from '../../src/host-api.ts'

const TOKEN = 'e2e-approval-token-0123456789abcdef'
const DIST = resolve(import.meta.dirname, '../../extension/dist')

/** Minimal shapes for the driver; playwright-core is typed separately. */
interface E2EPage {
  goto: (url: string) => Promise<unknown>
  waitForSelector: (selector: string, options?: { timeout?: number }) => Promise<unknown>
  evaluate: (fn: unknown, arg?: unknown) => Promise<unknown>
  reload: (options?: { waitUntil?: string }) => Promise<unknown>
  waitForTimeout: (ms: number) => Promise<void>
  locator: (selector: string) => { click: () => Promise<void>; isVisible: () => Promise<boolean>; count: () => Promise<number> }
  waitForEvent: (event: string, options?: { timeout?: number }) => Promise<unknown>
  isClosed: () => boolean
}

interface E2EContext {
  serviceWorkers: () => Array<{ url: () => string }>
  waitForEvent: (event: string, options: { timeout: number }) => Promise<E2EPage>
  pages: () => E2EPage[]
  newPage: () => Promise<E2EPage>
  close: () => Promise<void>
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

const hasPlaywright = (() => {
  try { createRequire(import.meta.url).resolve('playwright-core'); return true } catch { return false }
})()
const executable = chromiumExecutable()
const runnable = hasPlaywright && executable !== undefined && existsSync(join(DIST, 'manifest.json'))

describe.skipIf(!runnable)('one-click pairing (#2110)', () => {
  let server: Server | undefined
  let port = 0
  let context: E2EContext | undefined
  let launch: ((profile: string, options: Record<string, unknown>) => Promise<E2EContext>) | undefined

  beforeAll(async () => {
    const playwright = await import('playwright-core') as unknown as {
      chromium: { launchPersistentContext: (profile: string, options: Record<string, unknown>) => Promise<E2EContext> }
    }
    launch = playwright.chromium.launchPersistentContext.bind(playwright.chromium)

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
    server.on('upgrade', (req, socket, head) => { bridge.handleUpgrade(req, socket, head) })
    await new Promise<void>((ready) => { server!.listen(0, '127.0.0.1', ready) })
    port = (server.address() as AddressInfo).port
  }, 60_000)

  afterAll(async () => {
    await context?.close().catch(() => {})
    await new Promise<void>((done) => { server?.close(() => { done() }) })
  })

  it('pairs on one click, stores the token, and closes the approval tab', { timeout: 180_000 }, async () => {
    if (launch === undefined) return
    const profile = join(process.env.TMPDIR ?? '/tmp', `omnimux-approve-e2e-${String(Date.now())}`)
    context = await launch(profile, {
      executablePath: executable,
      headless: true,
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--no-first-run'],
    })
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20_000 })
    const panelUrl = `chrome-extension://${new URL(worker.url()).host}/panel/index.html`

    const panel = context.pages()[0] ?? await context.newPage()
    await panel.goto(panelUrl)
    await panel.waitForSelector('footer.composer', { timeout: 15_000 })
    await panel.evaluate(async ([url]: [string]) => {
      const runtime = (globalThis as unknown as {
        chrome: { runtime: { sendMessage: (message: unknown) => Promise<unknown> } }
      }).chrome.runtime
      await runtime.sendMessage({ type: 'SETTINGS_UPDATED', payload: { bridgeUrl: url, token: '' } })
    }, [`ws://127.0.0.1:${port}/ext/bridge`])
    await panel.reload({ waitUntil: 'domcontentloaded' })
    await panel.waitForSelector('footer.composer', { timeout: 15_000 })
    await panel.waitForTimeout(600)

    // One control, and no code field anywhere in the panel.
    expect(await panel.locator('.pair-button').isVisible()).toBe(true)
    expect(await panel.locator('.pair-row input').count()).toBe(0)

    const approvalPromise = context.waitForEvent('page', { timeout: 20_000 })
    await panel.locator('.pair-button').click()
    const approval = await approvalPromise
    await approval.waitForSelector('#approve', { timeout: 15_000 })

    let closed = false
    const closedPromise = approval.waitForEvent('close', { timeout: 25_000 }).then(() => { closed = true }, () => {})
    await approval.locator('#approve').click()

    const state = await panel.evaluate(() => new Promise((resolve) => {
      const chrome = (globalThis as unknown as {
        chrome: {
          runtime: {
            connect: (info: { name: string }) => {
              postMessage: (message: unknown) => void
              disconnect: () => void
              onMessage: { addListener: (fn: (message: { type?: string; state?: string }) => void) => void }
            }
          }
          storage: { local: { get: (key: string) => Promise<Record<string, { token?: string }>> } }
        }
      }).chrome
      const connection = chrome.runtime.connect({ name: 'dsh-panel' })
      const timer = setTimeout(() => { try { connection.disconnect() } catch {} resolve({ state: 'timeout', token: '' }) }, 20_000)
      connection.onMessage.addListener((message) => {
        if (message?.type !== 'status' || message.state !== 'connected') return
        clearTimeout(timer)
        void chrome.storage.local.get('dshSettings').then((stored) => {
          try { connection.disconnect() } catch {}
          resolve({ state: message.state ?? '', token: stored.dshSettings?.token ?? '' })
        })
      })
      connection.postMessage({ type: 'request-status' })
    })) as { state: string; token: string }
    await closedPromise

    expect(state.state).toBe('connected')
    expect(state.token).toBe(TOKEN)
    expect(closed).toBe(true)
    expect(approval.isClosed()).toBe(true)
    expect(await panel.locator('.pair-card').isVisible().catch(() => false)).toBe(false)
  })
})
