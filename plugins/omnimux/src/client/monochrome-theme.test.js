import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { HUB_CSS } from './styles.js'

describe('Monochrome Black & White Theme System', () => {
  it('HUB_CSS contains pure neutral-bluish overrides for root/body and dark mode', () => {
    assert.match(HUB_CSS, /--dsw-static-neutral-bluish-950:\s*#09090b/, 'dark base should be #09090b')
    assert.match(HUB_CSS, /--dsw-static-neutral-bluish-00:\s*#ffffff/, 'pure white should be #ffffff')
    assert.match(HUB_CSS, /--dsw-static-neutral-bluish-1000:\s*#000000/, 'pure black should be #000000')
  })

  it('HUB_CSS overrides deepseek blue tokens in both light and dark themes', () => {
    assert.match(HUB_CSS, /--dsw-static-deepseek-500:\s*#18181b/, 'light deepseek-500 should be dark zinc')
    assert.match(HUB_CSS, /--dsw-static-deepseek-500:\s*#ffffff/, 'dark deepseek-500 should be pure white')
    assert.match(HUB_CSS, /--dsw-static-deepseek-450:\s*#d4d4d8/, 'dark deepseek-450 should be silver')
    assert.match(HUB_CSS, /--wb-accent:\s*var\(--dsw-alias-label-primary/, 'wb-accent should reference label-primary token')
    assert.match(HUB_CSS, /--dsw-alias-state-publishing:\s*#ffffff/, 'dark state-publishing should be pure white')
  })

  it('HUB_CSS overrides turnStatus shimmer to silver/monochrome gradient', () => {
    assert.match(HUB_CSS, /\.turnStatus[\s\S]*?background:\s*linear-gradient/, 'turnStatus should have linear gradient')
    assert.match(HUB_CSS, /-webkit-background-clip:\s*text/, 'should have webkit background clip text')
  })

  it('HUB_CSS overrides StateDot and ContextMeter blue tints', () => {
    assert.match(HUB_CSS, /--dsh-state-ongoing:\s*var\(--dsw-alias-label-primary\)/, 'StateDot should use primary label')
    assert.match(HUB_CSS, /--meter-tint:\s*var\(--dsw-alias-label-secondary\)/, 'ContextMeter should use secondary label')
  })

  it('HUB_CSS overrides ::selection and :focus-visible', () => {
    assert.match(HUB_CSS, /::selection\s*\{[\s\S]*?var\(--dsw-alias-label-primary\)/, 'selection should use primary label')
    assert.match(HUB_CSS, /:focus-visible\s*\{[\s\S]*?var\(--dsw-alias-border-l3\)/, 'focus-visible should use neutral border')
  })

  it('HUB_CSS parses cleanly into real CSS rules without syntax errors', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>')
    const { document } = dom.window
    const style = document.createElement('style')
    style.textContent = HUB_CSS
    document.head.appendChild(style)
    const sheet = style.sheet
    assert.ok(sheet, 'style element must have a CSSStyleSheet')
    assert.ok(sheet.cssRules.length > 5, 'HUB_CSS must parse into multiple valid CSS rules')
  })
})
