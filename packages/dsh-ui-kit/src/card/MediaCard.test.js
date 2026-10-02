import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cardTsx = readFileSync(join(here, 'MediaCard.tsx'), 'utf8')
const cardCss = readFileSync(join(here, 'MediaCard.module.css'), 'utf8')
const gridTsx = readFileSync(join(here, 'CardGrid.tsx'), 'utf8')
const gridCss = readFileSync(join(here, 'CardGrid.module.css'), 'utf8')

describe('MediaCard and CardGrid contract', () => {
  it('supports 4 standard aspect ratios: 16:9, 4:3, 1:1, 9:16', () => {
    assert.match(cardTsx, /type MediaAspectRatio = "16:9" \| "4:3" \| "1:1" \| "9:16"/)
    assert.match(cardCss, /aspect-ratio:\s*16\s*\/\s*9/)
    assert.match(cardCss, /aspect-ratio:\s*4\s*\/\s*3/)
    assert.match(cardCss, /aspect-ratio:\s*1\s*\/\s*1/)
    assert.match(cardCss, /aspect-ratio:\s*9\s*\/\s*16/)
  })

  it('renders top-right badge and hover action overlay slot', () => {
    assert.match(cardTsx, /badgeSlot/)
    assert.match(cardTsx, /actionsOverlay/)
    assert.match(cardCss, /\.card:hover:not\(\.disabled\):not\(\.loading\) \.actionsOverlay/)
  })

  it('provides fluid responsive grid in CardGrid with custom CSS variables', () => {
    assert.match(gridTsx, /--card-grid-min-width/)
    assert.match(gridTsx, /--card-grid-gap/)
    assert.match(gridCss, /display:\s*grid/)
    assert.match(gridCss, /grid-template-columns:\s*repeat\(/)
  })

  it('consumes official --dsw-alias-* tokens in MediaCard and CardGrid CSS without raw hex/rgb', () => {
    assert.match(cardCss, /var\(--dsw-alias-bg-layer-1\)/)
    assert.match(cardCss, /var\(--dsw-alias-bg-layer-2\)/)
    assert.match(cardCss, /var\(--dsw-alias-border-l1\)/)
    assert.match(cardCss, /var\(--dsw-alias-border-l2\)/)
    assert.match(cardCss, /var\(--dsw-alias-border-l3\)/)
    assert.match(cardCss, /var\(--dsw-alias-brand-primary\)/)

    assert.doesNotMatch(cardCss, /#[0-9a-fA-F]{3,8}/)
    assert.doesNotMatch(cardCss, /rgba?\(/)
    assert.doesNotMatch(gridCss, /#[0-9a-fA-F]{3,8}/)
    assert.doesNotMatch(gridCss, /rgba?\(/)
  })
})
