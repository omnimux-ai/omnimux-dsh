#!/usr/bin/env node
/**
 * scripts/verify-site-screenshots.mjs
 *
 * Real-host probe for the website first-screen screenshot chain. This is the
 * one place the chain touches a real browser and a real page: every unit test
 * runs on doubles, and this script exists to prove the doubles still describe
 * the machine.
 *
 * It drives the plugin's own modules end to end — locate → launch → capture →
 * persist — then decodes the two PNGs it wrote and asserts the geometry the
 * spec pins (desktop 1440×900, mobile 780×1688 at 2×). Evidence lands under
 * `tmp/site-screenshots-evidence/`.
 *
 * Usage:  node scripts/verify-site-screenshots.mjs [url]
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { captureSiteScreenshots } from '../plugins/omnimux-products/src/site-shots.js'
import { persistSiteScreenshots } from '../plugins/omnimux-products/src/site-shots-store.js'
import { locateBrowser } from '../plugins/omnimux-products/src/chrome-locator.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE_DIR = join(ROOT, 'tmp', 'site-screenshots-evidence')
const DEFAULT_URL = 'https://example.com/'

/** @param {string} message */
function say(message) {
  process.stdout.write(`${message}\n`)
}

/**
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number }}
 */
function readGeometry(buffer) {
  const png = PNG.sync.read(buffer)
  return { width: png.width, height: png.height }
}

async function main() {
  const url = process.argv[2] ?? process.env.SITE_SHOTS_URL ?? DEFAULT_URL
  const failures = []

  const browser = locateBrowser()
  say(`[verify] browser: ${browser ?? 'NOT FOUND'}`)
  if (!browser) {
    say('[verify] no Chromium-family browser on this host — the chain can only answer no-browser here.')
    failures.push('no-browser')
  }

  say(`[verify] capturing ${url}`)
  const startedAt = Date.now()
  const { outcomes, report } = await captureSiteScreenshots({ url, kind: 'digital' })
  const elapsedMs = Date.now() - startedAt
  say(`[verify] status=${report.status} reason=${String(report.reason)} elapsed=${elapsedMs}ms`)
  for (const row of report.viewports) {
    say(`[verify]   ${row.kind}: ok=${row.ok} ${row.width}x${row.height} bytes=${row.bytes} reason=${String(row.reason)}`)
  }
  if (report.status !== 'captured') failures.push(`status=${report.status}`)

  mkdirSync(EVIDENCE_DIR, { recursive: true })
  const media = await persistSiteScreenshots({ url, mediaDir: EVIDENCE_DIR, outcomes })

  /** @type {object[]} */
  const files = []
  for (const row of media) {
    const exists = existsSync(row.real_path)
    const info = exists ? statSync(row.real_path) : null
    const bytes = exists ? readFileSync(row.real_path) : Buffer.alloc(0)
    const geometry = bytes.length > 0 ? readGeometry(bytes) : { width: 0, height: 0 }
    const mode = info ? (info.mode & 0o777).toString(8) : '-'
    say(`[verify]   wrote ${row.original_name} ${geometry.width}x${geometry.height} mode=${mode} id=${row.id}`)
    files.push({
      id: row.id,
      real_path: row.real_path,
      original_name: row.original_name,
      bytes: bytes.length,
      mode,
      ...geometry,
    })
    if (!exists) failures.push(`missing-file:${row.original_name}`)
  }

  const desktop = files.find((row) => row.original_name.includes('-desktop-'))
  const mobile = files.find((row) => row.original_name.includes('-mobile-'))
  if (!desktop) failures.push('desktop-shot-missing')
  else if (desktop.width !== 1440 || desktop.height !== 900) {
    failures.push(`desktop-geometry:${desktop.width}x${desktop.height}`)
  }
  if (!mobile) failures.push('mobile-shot-missing')
  else if (mobile.width !== 780 || mobile.height !== 1688) {
    failures.push(`mobile-geometry:${mobile.width}x${mobile.height}`)
  }
  if (desktop && files[0] !== desktop) failures.push('media-order-not-desktop-first')
  if (media.length > 0 && media[0].id !== (files[0]?.id ?? null)) failures.push('cover-would-not-hit-media-0')
  if (statSync(EVIDENCE_DIR).mode & 0o777 !== 0o700) failures.push('media-dir-mode')

  const evidence = {
    generated_at: new Date().toISOString(),
    url,
    browser,
    node: process.version,
    elapsed_ms: elapsedMs,
    screenshots: report,
    media: files,
    permissions: {
      dir: (statSync(EVIDENCE_DIR).mode & 0o777).toString(8),
      expect_dir: '700',
      expect_file: '600',
    },
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
  }
  const reportPath = join(EVIDENCE_DIR, 'report.json')
  writeFileSync(reportPath, `${JSON.stringify(evidence, null, 2)}\n`)
  say(`[verify] evidence: ${reportPath}`)
  say(`[verify] verdict: ${evidence.verdict}`)
  if (failures.length > 0) {
    say(`[verify] failures: ${failures.join(', ')}`)
    process.exitCode = 1
  }
}

await main()
