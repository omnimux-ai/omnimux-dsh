import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const portalTs = readFileSync(join(here, 'portal.ts'), 'utf8')
const a11yTs = readFileSync(join(here, 'a11y.ts'), 'utf8')
const clipTs = readFileSync(join(here, 'clipboard.ts'), 'utf8')

describe('internal utility primitives', () => {
  it('portal.ts provides SSR guard and container resolution', () => {
    assert.match(portalTs, /typeof document === "undefined"/)
    assert.match(portalTs, /export function resolvePortalContainer/)
    assert.match(portalTs, /export function createPortalSafe/)
  })

  it('a11y.ts provides focus trap, first descendant focus and interactive filters', () => {
    assert.match(a11yTs, /FOCUSABLE_SELECTOR/)
    assert.match(a11yTs, /export function getFocusableElements/)
    assert.match(a11yTs, /export function trapFocus/)
    assert.match(a11yTs, /export function focusFirstDescendant/)
    assert.match(a11yTs, /event\.shiftKey/)
  })

  it('clipboard.ts supports navigator.clipboard with legacy execCommand fallback', () => {
    assert.match(clipTs, /navigator\.clipboard && window\.isSecureContext/)
    assert.match(clipTs, /document\.createElement\("textarea"\)/)
    assert.match(clipTs, /document\.execCommand\("copy"\)/)
  })
})
