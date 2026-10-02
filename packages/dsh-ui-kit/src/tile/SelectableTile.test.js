import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const tsx = readFileSync(join(here, 'SelectableTile.tsx'), 'utf8')
const css = readFileSync(join(here, 'SelectableTile.module.css'), 'utf8')

describe('SelectableTile component contract', () => {
  it('supports keyboard navigation on Enter and Space keys with preventDefault', () => {
    assert.match(tsx, /e\.key === " " \|\| e\.key === "Enter"/)
    assert.match(tsx, /e\.preventDefault\(\)/)
    assert.match(tsx, /onChange\?\.\(!selected, id\)/)
  })

  it('assigns correct accessibility roles and attributes', () => {
    assert.match(tsx, /role=\{selectionType === "radio" \? "radio" : "checkbox"\}/)
    assert.match(tsx, /aria-checked=\{selected\}/)
    assert.match(tsx, /aria-disabled=\{!isInteractive \|\| undefined\}/)
    assert.match(tsx, /tabIndex=\{isInteractive \? 0 : -1\}/)
  })

  it('renders custom accessible indicator instead of native HTML input', () => {
    assert.doesNotMatch(tsx, /<input/i)
    assert.match(tsx, /radioIndicator/)
    assert.match(tsx, /checkboxIndicator/)
    assert.match(tsx, /CHECKMARK_PATH/)
  })

  it('uses only official --dsw-alias-* tokens for background, border, and states', () => {
    assert.match(css, /var\(--dsw-alias-border-l2\)/)
    assert.match(css, /var\(--dsw-alias-bg-layer-1\)/)
    assert.match(css, /var\(--dsw-alias-interactive-bg-hover\)/)
    assert.match(css, /var\(--dsw-alias-interactive-bg-selected\)/)
    assert.match(css, /var\(--dsw-alias-brand-primary\)/)

    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/)
    assert.doesNotMatch(css, /rgba?\(/)
  })
})
