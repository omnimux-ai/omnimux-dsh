import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en, zh } from './locales.js'
import { INSPIRATION_CSS } from './styles.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sectionSrc = readFileSync(join(__dirname, 'InspirationSection.jsx'), 'utf8')
const iconsSrc = readFileSync(join(__dirname, 'icons.jsx'), 'utf8')

describe('Inspiration Import CTA button contract', () => {
  it('add.btn copy does not prefix "+" (leadingIcon supplies the glyph)', () => {
    for (const [locale, bag] of [['zh', zh], ['en', en]]) {
      assert.equal(bag['add.btn'].startsWith('+'), false, `${locale} add.btn must not start with +`)
      assert.doesNotMatch(bag['add.btn'], /^\s*\+/)
    }
    assert.equal(zh['add.btn'], '导入灵感')
    assert.equal(en['add.btn'], 'Import Inspiration')
  })

  it('InspirationSection pairs add.btn with standard Button variant="primary" and PlusIcon', () => {
    assert.match(sectionSrc, /import\s*\{[^}]*PlusIcon[^}]*\}\s*from\s*['"]\.\/icons\.jsx['"]/)
    assert.match(sectionSrc, /<Button\s+variant="primary"\s+leadingIcon=\{<PlusIcon\s*\/>\}\s+onClick=\{[^}]+\}\s*>\s*\{t\('add\.btn'\)\}\s*<\/Button>/)
  })

  it('forbids custom capsule classes and 9999px overrides on the primary action button', () => {
    assert.doesNotMatch(sectionSrc, /omnimux-inspiration-btn-add/)
    assert.doesNotMatch(INSPIRATION_CSS, /\.omnimux-inspiration-btn-add/)
    assert.doesNotMatch(INSPIRATION_CSS, /border-radius:\s*9999px;\s*border:[^;]*background:\s*var\(--dsw-alias-button-primary-fill/)
  })

  it('PlusIcon follows the 14px 1.8-stroke standard geometry aligned with assets and products', () => {
    assert.match(iconsSrc, /width=\{size\}/)
    assert.match(iconsSrc, /height=\{size\}/)
    assert.match(iconsSrc, /strokeWidth="1\.8"/)
    assert.match(iconsSrc, /strokeLinecap="round"/)
    assert.match(iconsSrc, /strokeLinejoin="round"/)
    assert.match(iconsSrc, /aria-hidden="true"/)
    assert.match(iconsSrc, /export function PlusIcon/)
  })
})
