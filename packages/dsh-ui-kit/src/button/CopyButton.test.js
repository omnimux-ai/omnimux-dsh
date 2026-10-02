import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const tsx = readFileSync(join(here, 'CopyButton.tsx'), 'utf8')
const css = readFileSync(join(here, 'CopyButton.module.css'), 'utf8')

describe('CopyButton component contract', () => {
  it('implements 3-state state machine: idle | copied | error with timeout reset', () => {
    assert.match(tsx, /type CopyState = "idle" \| "copied" \| "error"/)
    assert.match(tsx, /timeout = 2000/)
    assert.match(tsx, /timerRef\.current = setTimeout\(\(\) => \{/)
    assert.match(tsx, /setState\("idle"\)/)
  })

  it('re-uses kit Button primitive satisfying UI01 gate', () => {
    assert.match(tsx, /import \{ Button \} from "\.\/Button\.tsx"/)
    assert.match(tsx, /<Button/)
    // Must not use raw lowercase <button> jsx tag
    assert.doesNotMatch(tsx, /<button(?:\s|>)/)
  })

  it('declares aria-live="polite" for screen reader announcements', () => {
    assert.match(tsx, /aria-live="polite"/)
  })

  it('integrates copyToClipboard fallback utility', () => {
    assert.match(tsx, /import \{ copyToClipboard \} from "\.\.\/internal\/clipboard\.ts"/)
    assert.match(tsx, /await copyToClipboard\(resolvedText\)/)
  })

  it('uses only official --dsw-alias-* tokens in CopyButton.module.css', () => {
    assert.match(css, /var\(--dsw-alias-state-success-primary\)/)
    assert.match(css, /var\(--dsw-alias-state-error-primary\)/)
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/)
    assert.doesNotMatch(css, /rgba?\(/)
  })
})
