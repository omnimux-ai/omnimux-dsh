import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const viewJsx = readFileSync(join(here, 'CloudAssetsView.jsx'), 'utf8')
const stylesJs = readFileSync(join(here, 'styles.js'), 'utf8')

/** The save control's own handler, isolated from the rest of the card. */
const saveHandler = viewJsx.slice(
  viewJsx.indexOf('const handleSave'),
  viewJsx.indexOf('const handlePlayClick'),
)

/**
 * The cloud card is deliberately the smallest thing that still identifies an
 * asset: a thumbnail, a title, and the two hover controls that move it out of
 * the cloud — into the conversation, or into the local library. These
 * assertions pin that shape, because every element removed here was removed on
 * purpose and re-adding one would silently undo the decision.
 */
describe('Cloud card minimalism contract', () => {
  it('drops the media badge, tags, and bottom action bar from a card', () => {
    assert.doesNotMatch(viewJsx, /<Badge\b/)
    assert.doesNotMatch(viewJsx, /mediaLabelOf/)
    assert.doesNotMatch(viewJsx, /omnimux-assets-cloud-tags?["'\s]/)
    assert.doesNotMatch(viewJsx, /omnimux-assets-overlay-btn/)
    // Both remaining controls are icon plates in the hover cluster; neither
    // grows a labelled bottom bar back onto the card.
    assert.match(viewJsx, /className="omnimux-assets-cloud-actions"/)
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

/**
 * The other half of the card: 收藏到本地 copies the catalog row into the local
 * library, and the card has to say so in three places — the icon, the tooltip
 * and the pressed state — before the user can trust that it landed.
 */
describe('Cloud card save-to-local contract', () => {
  it('runs the card control through the feed save, not a private request', () => {
    assert.match(viewJsx, /onSave=\{feed\.saveToLocal\}/)
    assert.match(saveHandler, /if \(saved \|\| saving\) return/)
    assert.match(saveHandler, /onSave\?\.\(asset\)/)
    assert.match(viewJsx, /className="omnimux-assets-cloud-save"/)
  })

  it('keeps the hover controls from also opening the preview behind them', () => {
    assert.match(saveHandler, /event\.stopPropagation\(\)/)
    assert.match(viewJsx, /const handlePlayClick = \(event\) => \{\n    event\.stopPropagation\(\)\n    togglePlay\(\)\n  \}/)
  })

  it('swaps 收藏到本地 for 已收藏 once the row is saved', () => {
    assert.match(viewJsx, /const saveLabel = saved \? t\('cloud\.action\.saved'\) : t\('cloud\.action\.save'\)/)
    assert.match(viewJsx, /title=\{saveLabel\}/)
    assert.match(viewJsx, /aria-pressed=\{saved \? 'true' : 'false'\}/)
    assert.match(viewJsx, /<PlusIcon size=\{16\} \/>/)
    assert.match(viewJsx, /\{saved \? <CheckIcon size=\{16\} \/> : <PlusIcon size=\{16\} \/>\}/)
  })

  it('reports both the saved and the in-flight state from the shared controller', () => {
    assert.match(viewJsx, /saved=\{feed\.savedIds\.has\(asset\.id\)\}/)
    assert.match(viewJsx, /saving=\{feed\.savingId === asset\.id\}/)
    assert.match(viewJsx, /disabled=\{saved \|\| saving\}/)
    assert.match(viewJsx, /disabled=\{saved \|\| saving\}/)
  })

  it('marks the card itself, so the saved state is readable without a hover', () => {
    assert.match(viewJsx, /data-saved=\{saved \? 'true' : 'false'\}/)
  })
})

describe('Cloud card opens the preview', () => {
  it('opens the row preview from the card and from its title', () => {
    assert.match(viewJsx, /const openPreview = useCallback\(\(\) => \{ onPreview\?\.\(asset\) \}, \[asset, onPreview\]\)/)
    assert.match(viewJsx, /onClick=\{openPreview\}/)
    assert.match(viewJsx, /aria-label=\{previewLabel\}/)
    assert.match(viewJsx, /onKeyDown=\{activateRowKeydown\(openPreview\)\}/)
    assert.match(viewJsx, /const previewLabel = `\$\{asset\.name\} · \$\{t\('card\.view'\)\}`/)
  })

  it('lets a voice thumbnail keep the click for playback instead', () => {
    assert.match(viewJsx, /onClick=\{canPlay \? handlePlayClick : undefined\}/)
  })

  it('hands the preview handler down from the view to every card', () => {
    assert.match(viewJsx, /const \{ t, open = true, onPreview, save \} = props/)
    assert.match(viewJsx, /useCloudAssetsFeed\(\{ t, open, save \}\)/)
    assert.match(viewJsx, /onPreview=\{onPreview\}/)
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

  it('gives the save plate the same neutral treatment, and no hue of its own', () => {
    const actions = stylesJs.slice(
      stylesJs.indexOf('.omnimux-assets-cloud-card .omnimux-assets-cloud-actions'),
      stylesJs.indexOf('.omnimux-assets-cloud-desc'),
    )
    assert.match(actions, /background: var\(--dsw-alias-bg-elevated\)/)
    assert.match(actions, /background: var\(--dsw-alias-label-primary\)/)
    assert.match(actions, /color: var\(--dsw-alias-label-primary-foreground\)/)
    // No brand accent, and no raw colour: every plate is a token.
    assert.doesNotMatch(actions, /brand-primary|interactive-bg-hover-accent/)
    assert.doesNotMatch(actions, /#[0-9a-fA-F]{3,8}\b/)
    assert.doesNotMatch(actions, /rgba\(/)
  })

  it('keeps 已收藏 on screen at rest instead of hiding it until the next hover', () => {
    const saved = stylesJs.slice(stylesJs.indexOf('.omnimux-assets-cloud-save[aria-pressed="true"]'))
    assert.match(saved, /opacity: 1/)
    assert.match(saved, /background: var\(--dsw-alias-label-primary\)/)
  })

  it('leaves no orphaned tag styling behind', () => {
    assert.doesNotMatch(stylesJs, /\.omnimux-assets-cloud-tag\b/)
  })
})
