import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { DEFAULT_LOGO_SVG } from '../brand/defaults.js'
import { heroMarkPresentation, parseLogoSvg } from './hero-brand.js'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'HeroBrandMark.jsx'), 'utf8')

describe('HeroBrandMark', () => {
  it('eats official owner props size and className', () => {
    assert.match(source, /export function HeroBrandMark\(\{\s*size,\s*className\s*\}\)/)
    assert.match(source, /heroMarkPresentation\(size,\s*className\)/)
    assert.match(source, /width=\{width\}/)
    assert.match(source, /height=\{height\}/)
    assert.match(source, /className=\{cls\}/)
  })

  it('renders the OmniMux logo as an inline SVG occupant', () => {
    assert.match(source, /data-omnimux-hero-mark/)
    assert.match(source, /parseLogoSvg\(resolveHeroLogoSvg\(\)\)/)
    assert.match(source, /dangerouslySetInnerHTML/)
    assert.match(source, /aria-hidden="true"/)
  })

  it('presentation helper maps a 34px hero edge onto the bundled mark', () => {
    const { width, height, className } = heroMarkPresentation(34, 'fish')
    const { viewBox, inner } = parseLogoSvg(DEFAULT_LOGO_SVG)
    assert.equal(width, 34)
    assert.equal(height, 34)
    assert.equal(className, 'fish')
    assert.equal(viewBox, '0 0 1254 1254')
    assert.match(inner, /#b8b7ff/)
    assert.match(inner, /#121213/)
    assert.doesNotMatch(inner, /#C6F14F/)
    assert.doesNotMatch(inner, /#C8F135/)
  })
})
