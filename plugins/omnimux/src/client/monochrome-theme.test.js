import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { HUB_CSS } from './styles.js'

describe('Monochrome Theme Refinement (Blue Only)', () => {
  it('HUB_CSS does NOT override neutral-bluish base colors to keep native DSH background', () => {
    assert.doesNotMatch(HUB_CSS, /--dsw-static-neutral-bluish-950:\s*#/, 'must not force neutral-bluish-950 to raw hex')
    assert.doesNotMatch(HUB_CSS, /--dsw-static-neutral-bluish-00:\s*#/, 'must not force neutral-bluish-00 to raw hex')
  })

  it('HUB_CSS neutralizes deepseek blue tokens by mapping to native neutral-bluish tokens', () => {
    assert.match(HUB_CSS, /--dsw-static-deepseek-500:\s*var\(--dsw-static-neutral-bluish-1000\)/, 'light deepseek-500 should be dark neutral')
    assert.match(HUB_CSS, /--dsw-static-deepseek-500:\s*var\(--dsw-static-neutral-bluish-00\)/, 'dark deepseek-500 should be light neutral')
    assert.match(HUB_CSS, /--dsw-alias-brand-primary:\s*var\(--dsw-alias-label-primary\)/, 'brand primary should be label primary')
    assert.match(HUB_CSS, /--wb-accent:\s*var\(--dsw-alias-label-primary\)/, 'wb-accent should be label primary')
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

  it('HUB_CSS overrides send button contrast and ensures visible arrows in both themes', () => {
    assert.match(HUB_CSS, /\[class\*="InputBar"\][\s\S]*?button\[class\*="primary"\]/, 'must style primary send button')
    assert.match(HUB_CSS, /body\[data-ds-dark-theme\][\s\S]*?button\[class\*="primary"\]:not\(:disabled\)[\s\S]*?var\(--dsw-alias-bg-base,\s*#000000\)/, 'active send button in dark mode must have high contrast dark arrow')
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
