/**
 * Lit-media transition, end to end (Issue #2114).
 *
 * Two promises are checked against the shipped artifacts: the composer chip is
 * the smaller one and its remove control only appears on hover (measured in a
 * real browser with the panel's own stylesheet), and the shelf renders only the
 * media that is not already in the composer.
 *
 * Playwright is imported dynamically and the browser half is skipped when it or
 * the built extension is missing, so unit runs stay green.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PANEL = resolve(import.meta.dirname, '../..')
const DIST = join(PANEL, 'extension/dist')

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

describe('the shelf shows only what is not already in the composer (#2114)', () => {
  it('filters the detected media by the attached ids', () => {
    const source = readFileSync(resolve(PANEL, 'extension/src/panel/App.tsx'), 'utf8')
    // One derived truth: an attached media simply drops out of the shelf list,
    // and putting it back is the same derivation — no second state to keep in
    // sync, which is what makes the round trip work at all.
    expect(source).toContain('detectedMedia.filter((item) => !attachedMediaIds.has(item.id))')
    expect(source).toContain('detectedMedia.some((item) => !attachedMediaIds.has(item.id))')
  })

  it('keeps the smaller chip and the hover-only remove control in the stylesheet', () => {
    const styles = readFileSync(resolve(PANEL, 'extension/src/panel/styles.css'), 'utf8')
    expect(styles).toMatch(/\.draft-image\s*\{[^}]*width:\s*44px/u)
    expect(styles).toMatch(/\.draft-image > button\s*\{[^}]*opacity:\s*0/u)
    expect(styles).toContain('.draft-image:hover > button')
    expect(styles).toContain('.draft-image > button:focus-visible')
  })
})

describe.skipIf(!runnable)('the chip measures 44px and reveals its remove control on hover (#2114)', () => {
  it('matches the shipped stylesheet in a real browser', { timeout: 120_000 }, async () => {
    const playwright = await import('playwright-core') as unknown as {
      chromium: { launchPersistentContext: (profile: string, options: Record<string, unknown>) => Promise<{
        serviceWorkers: () => Array<{ url: () => string }>
        waitForEvent: (event: string, options: { timeout: number }) => Promise<{ url: () => string }>
        pages: () => Array<unknown>
        newPage: () => Promise<unknown>
        close: () => Promise<void>
      }> }
    }
    const profile = join(process.env.TMPDIR ?? '/tmp', `omnimux-lit-e2e-${String(Date.now())}`)
    const context = await playwright.chromium.launchPersistentContext(profile, {
      executablePath: executable,
      headless: true,
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--no-first-run'],
    })
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20_000 })
      const page = (context.pages()[0] ?? await context.newPage()) as {
        goto: (url: string) => Promise<unknown>
        waitForSelector: (selector: string, options?: { timeout?: number }) => Promise<unknown>
        evaluate: (fn: unknown) => Promise<unknown>
        locator: (selector: string) => { hover: () => Promise<void> }
      }
      await page.goto(`chrome-extension://${new URL(worker.url()).host}/panel/index.html`)
      await page.waitForSelector('footer.composer', { timeout: 15_000 })
      await page.evaluate(() => {
        const composer = document.querySelector('div.composer-box')
        const row = document.createElement('div')
        row.className = 'draft-images'
        row.setAttribute('data-probe', 'lit')
        const chip = document.createElement('span')
        chip.className = 'draft-image lit'
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = '×'
        chip.append(document.createElement('img'), button)
        row.append(chip)
        if (composer) composer.prepend(row)
      })
      const idle = await page.evaluate(() => {
        const chip = document.querySelector('[data-probe="lit"] .draft-image')
        if (chip === null) return null
        const button = chip.querySelector('button')
        return {
          width: Math.round(chip.getBoundingClientRect().width),
          opacity: button === null ? null : getComputedStyle(button).opacity,
        }
      })
      expect(idle).toEqual({ width: 44, opacity: '0' })

      await page.locator('[data-probe="lit"] .draft-image').hover()
      await page.waitForTimeout(300)
      const hovered = await page.evaluate(() => {
        const button = document.querySelector('[data-probe="lit"] .draft-image button')
        return button === null ? null : getComputedStyle(button).opacity
      })
      expect(hovered).toBe('1')
    } finally {
      await context.close().catch(() => {})
    }
  })
})
