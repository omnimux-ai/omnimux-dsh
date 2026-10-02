import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const tsx = readFileSync(join(here, 'GenWaveCard.tsx'), 'utf8')
const css = readFileSync(join(here, 'GenWaveCard.module.css'), 'utf8')
const palette = readFileSync(join(here, 'genWavePalette.ts'), 'utf8')

describe('GenWaveCard component contract', () => {
  it('declares the minimal props surface (statusText / progress / autoProgress)', () => {
    assert.match(tsx, /statusText: string/)
    assert.match(tsx, /progress\?: number/)
    assert.match(tsx, /autoProgress\?: boolean/)
    assert.match(tsx, /autoProgress \?\? progress === undefined/)
  })

  it('ports the measured dot-field model 1:1 (28x29 grid, |cos|^0.5 size wave, sigmoid reveal front)', () => {
    assert.match(palette, /COLS: 28/)
    assert.match(palette, /ROWS: 29/)
    assert.match(palette, /SPACING: 13\.3333/)
    assert.match(palette, /SIZE_TILT: 0\.8/)
    assert.match(palette, /SIZE_POW: 0\.5/)
    assert.match(palette, /SIZE_LAMBDA: 28/)
    assert.match(palette, /REVEAL_TILT: 0\.35/)
    assert.match(palette, /REVEAL_SIGMA: 0\.5/)
    assert.match(palette, /REVEAL_PERIOD_MS: 8600/)
    assert.match(palette, /SIZE_PERIOD_MS: 5200/)
    assert.match(palette, /DEMO_TARGET: 96/)
    // 3 masked corner cells: r0c0 / r0c27 / r28c0
    assert.match(palette, /\[0,\s*0\]/)
    assert.match(palette, /\[27,\s*0\]/)
    assert.match(palette, /\[0,\s*28\]/)
  })

  it('keeps measured colors as encapsulated constants (fixed dark visual, no dynamic tokens)', () => {
    assert.match(palette, /cardBg: "#0e0e0e"/)
    assert.match(palette, /status: "#b6b6b8"/)
    assert.match(palette, /icon: "#cdcdcd"/)
    assert.match(palette, /badgeBg: "rgb\(33,33,33\)"/)
    assert.match(palette, /badgeFg: "rgb\(226,226,226\)"/)
    assert.match(palette, /dimRgb: \[62, 62, 62\]/)
    assert.match(palette, /litRgb: \[224, 224, 224\]/)
  })

  it('draws the progress badge on the same canvas layer (ellipse + centered text)', () => {
    assert.match(tsx, /ctx\.ellipse\(/)
    assert.match(tsx, /BADGE_W/)
    assert.match(tsx, /BADGE_H/)
    assert.match(tsx, /fillText\(badgeEl\.textContent/)
  })

  it('supports reduced motion freeze frame and cleans up rAF / ResizeObserver on unmount', () => {
    assert.match(tsx, /prefers-reduced-motion: reduce/)
    assert.match(tsx, /cancelAnimationFrame\(rafId\)/)
    assert.match(tsx, /observer\?\.disconnect\(\)/)
    assert.match(tsx, /ResizeObserver/)
    assert.match(tsx, /GEN_WAVE_FREEZE\.PHI/)
    assert.match(tsx, /GEN_WAVE_FREEZE\.T/)
  })

  it('keeps ARIA contract: role=status, aria-live, aria-hidden canvas', () => {
    assert.match(tsx, /role="status"/)
    assert.match(tsx, /aria-live="polite"/)
    assert.match(tsx, /aria-hidden="true"/)
  })

  it('contains no raw hex or rgb literals in scanned sources', () => {
    assert.doesNotMatch(tsx, /#[0-9a-fA-F]{3,8}/)
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/)
    assert.doesNotMatch(css, /rgba?\(/)
  })

  it('applies measured geometry in the module css', () => {
    assert.match(css, /width:\s*413px/)
    assert.match(css, /padding:\s*10px 10px 23px/)
    assert.match(css, /gap:\s*11px/)
    assert.match(css, /width:\s*13\.5px/)
    assert.match(css, /margin-top:\s*26px/)
    assert.match(css, /opacity:\s*0/)
  })
})
