import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const tsx = readFileSync(join(here, 'Drawer.tsx'), 'utf8')
const css = readFileSync(join(here, 'Drawer.module.css'), 'utf8')

describe('Drawer component contract', () => {
  it('supports 4-way slide-in placements: right, left, top, bottom', () => {
    assert.match(tsx, /type DrawerPlacement = "right" \| "left" \| "top" \| "bottom"/)
    assert.match(css, /\.placementRight/)
    assert.match(css, /\.placementLeft/)
    assert.match(css, /\.placementTop/)
    assert.match(css, /\.placementBottom/)
  })

  it('declares WAI-ARIA dialog attributes and handles Escape key', () => {
    assert.match(tsx, /role="dialog"/)
    assert.match(tsx, /aria-modal="true"/)
    assert.match(tsx, /e\.key === "Escape" && closeOnEsc/)
    assert.match(tsx, /onClose\(\)/)
  })

  it('integrates focus trap and previous focus restoration', () => {
    assert.match(tsx, /import \{ focusFirstDescendant, trapFocus \} from "\.\.\/internal\/a11y\.ts"/)
    assert.match(tsx, /trapFocus\(drawerRef\.current, e\.nativeEvent\)/)
    assert.match(tsx, /previousActiveElementRef\.current\.focus\(\)/)
  })

  it('implements scroll lock and cleanup restoration on portal container', () => {
    assert.match(tsx, /target\.style\.overflow = "hidden"/)
    assert.match(tsx, /target\.style\.overflow = previousOverflow/)
  })

  it('uses IconButton with IconCloseOutline16 conforming to UI01 gate', () => {
    assert.match(tsx, /<IconButton/)
    assert.match(tsx, /aria-label="关闭抽屉"/)
    assert.match(tsx, /IconCloseOutline16/)
    assert.doesNotMatch(tsx, /<button(?:\s|>)/)
  })

  it('consumes official --dsw-alias-* tokens without raw hex or rgb', () => {
    assert.match(css, /var\(--dsw-alias-bg-mask-1\)/)
    assert.match(css, /var\(--dsw-alias-bg-layer-2\)/)
    assert.match(css, /var\(--dsw-alias-border-l1\)/)
    assert.match(css, /var\(--dsw-alias-border-l2\)/)
    assert.match(css, /var\(--dsw-alias-label-primary\)/)

    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/)
    assert.doesNotMatch(css, /rgba?\(/)
  })
})
