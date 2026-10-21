#!/usr/bin/env node
/**
 * Media preview zoom evidence (hover popover + full-view lightbox).
 *
 * Drives the static demo page inside one ego lite TaskSpace, so no Chrome
 * process and no temporary Chrome profile are created.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runEgoSteps } from './lib/ego-browser-steps.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const DEMO_HTML = join(ROOT, 'docs', 'demos', 'product-media-preview-zoom-demo.html')
const EVIDENCE_DIR = join(ROOT, 'docs', 'evidence', 'product-media-preview-zoom')
const HOVER_SHOT = join(EVIDENCE_DIR, 'hover-zoom-preview.png')
const LIGHTBOX_SHOT = join(EVIDENCE_DIR, 'lightbox-full-view.png')

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true })

  const run = await runEgoSteps({
    spaceName: `media-preview-evidence-${Date.now()}`,
    width: 1200,
    height: 850,
    deviceScaleFactor: 2,
    steps: [
      { type: 'goto', url: `file://${DEMO_HTML}`, settleMs: 800 },
      {
        type: 'evaluate',
        name: 'hover-popover-shown',
        expression: `(() => {
          const wrap = document.querySelector('.omnimux-products-thumb-wrap');
          const popover = wrap ? wrap.querySelector('.omnimux-products-thumb-popover') : null;
          if (!popover) return false;
          popover.style.opacity = '1';
          popover.style.visibility = 'visible';
          popover.style.transform = 'translateY(-50%) scale(1)';
          return true;
        })()`,
      },
      { type: 'wait', ms: 200 },
      { type: 'screenshot', path: HOVER_SHOT },
      {
        type: 'evaluate',
        name: 'lightbox-opened',
        expression: `(() => {
          const button = document.querySelector('.omnimux-products-thumb-button');
          if (!button) return false;
          button.click();
          return true;
        })()`,
      },
      { type: 'wait', ms: 400 },
      { type: 'screenshot', path: LIGHTBOX_SHOT },
    ],
  })

  const values = Object.fromEntries(run.values.map((entry) => [entry.name, entry.value]))
  if (!values['hover-popover-shown']) throw new Error('hover popover target missing in demo page')
  if (!values['lightbox-opened']) throw new Error('lightbox thumbnail target missing in demo page')

  for (const shot of run.shots) {
    if (shot.bytes < 20_000) throw new Error(`screenshot looks empty: ${shot.path} (${shot.bytes} bytes)`)
    console.log('✔ Captured:', shot.path)
  }
  console.log(`✅ ego TaskSpace ${run.spaceId} · ${run.userAgent}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
