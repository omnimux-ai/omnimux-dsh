import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const viewJsx = readFileSync(join(here, 'CloudAssetsView.jsx'), 'utf8')
const stylesJs = readFileSync(join(here, 'styles.js'), 'utf8')

/**
 * The cloud card is deliberately the smallest thing that still identifies an
 * asset: a thumbnail, a title, and one control that mounts it into the
 * conversation. These assertions pin that shape, because every element removed
 * here was removed on purpose and re-adding one would silently undo the
 * decision.
 */
describe('Cloud card minimalism contract', () => {
  it('drops the media badge, tags, and bottom action bar from a card', () => {
    assert.doesNotMatch(viewJsx, /<Badge\b/)
    assert.doesNotMatch(viewJsx, /mediaLabelOf/)
    assert.doesNotMatch(viewJsx, /omnimux-assets-cloud-tags?["'\s]/)
    assert.doesNotMatch(viewJsx, /omnimux-assets-overlay-btn/)
    assert.doesNotMatch(viewJsx, /cloud\.action\.save/)
  })

  it('shows the description on audio and text rows only, so a picture card is thumbnail plus title', () => {
    assert.match(viewJsx, /function showsDescription\(mediaType\)/)
    assert.match(viewJsx, /return mediaType === 'audio' \|\| mediaType === 'document'/)
    assert.match(viewJsx, /\{showsDescription\(asset\.mediaType\) && asset\.description !== '' \? \(/)
  })

  it('mounts a card into the conversation through the shared attachment path', () => {
    assert.match(viewJsx, /import \{ addAssetToConversation \} from '\.\/add-to-chat\.js'/)
    assert.match(viewJsx, /addAssetToConversation\(asset\)/)
    assert.match(viewJsx, /<ChatIcon size=\{16\} \/>/)
    assert.match(viewJsx, /t\('card\.addToConversation'\)/)
    assert.match(viewJsx, /title=\{addLabel\}/)
    // Hover affordance only: the control stays out of the thumbnail's way.
    assert.match(viewJsx, /className="omnimux-assets-cloud-chat"/)
  })

  it('plays audio from the thumbnail itself instead of a dedicated button', () => {
    assert.match(viewJsx, /const canPlay = asset\.mediaType === 'audio' && asset\.playable/)
    assert.match(viewJsx, /role=\{canPlay \? 'button' : undefined\}/)
    assert.match(viewJsx, /aria-pressed=\{canPlay \? \(playing \? 'true' : 'false'\) : undefined\}/)
    assert.match(viewJsx, /onKeyDown=\{canPlay \? activateRowKeydown\(togglePlay\) : undefined\}/)
    assert.match(viewJsx, /<PauseIcon size=\{16\} \/>/)
  })
})

describe('Cloud chrome stays neutral', () => {
  it('inks the selected chip with the label colour and inverts the label on it', () => {
    const selected = stylesJs.slice(stylesJs.indexOf('.omnimux-assets-cloud-chip[aria-pressed="true"]'))
    assert.match(selected, /background: var\(--dsw-alias-label-primary\)/)
    assert.match(selected, /color: var\(--dsw-alias-label-primary-foreground\)/)
    assert.doesNotMatch(selected.slice(0, selected.indexOf('}')), /brand-primary|interactive-bg-hover-accent/)
  })

  it('inverts the add-to-conversation control on its own hover', () => {
    const hover = stylesJs.slice(stylesJs.indexOf('.omnimux-assets-cloud-chat:hover'))
    assert.match(hover, /background: var\(--dsw-alias-label-primary\)/)
    assert.match(hover, /color: var\(--dsw-alias-label-primary-foreground\)/)
  })

  it('leaves no orphaned tag styling behind', () => {
    assert.doesNotMatch(stylesJs, /\.omnimux-assets-cloud-tag\b/)
  })
})
