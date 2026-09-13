import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { zh, en } from './locales.js'

const here = dirname(fileURLToPath(import.meta.url))
const gridJsx = readFileSync(join(here, 'AssetGrid.jsx'), 'utf8')
const stageJsx = readFileSync(join(here, 'AssetsStage.jsx'), 'utf8')
const stylesJs = readFileSync(join(here, 'styles.js'), 'utf8')

describe('AssetGrid cover preview and card CTA actions contract', () => {
  it('implements image cover preview with fallback to FileIcon in AssetGrid.jsx', () => {
    // Uses previewUrl and pickCoverFile
    assert.match(gridJsx, /import\s+.*previewUrl.*from '\.\/api\.js'/)
    assert.match(gridJsx, /import\s+.*pickCoverFile.*from '\.\/add-to-chat\.js'/)
    // Renders img with omnimux-assets-card-media and onError handler
    assert.match(gridJsx, /<img[\s\S]*?className="omnimux-assets-card-media"[\s\S]*?onError=/)
    // Falls back to FileIcon size 22 when broken or no image
    assert.match(gridJsx, /<FileIcon\s+size=\{22\}\s*\/>/)
  })

  it('implements View and AddToConversation buttons in grid card actions', () => {
    // Card buttons use t('card.view') and t('card.addToConversation')
    assert.match(gridJsx, /\{t\('card\.view'\)\}/)
    assert.match(gridJsx, /\{added \? t\('card\.addedToConversation'\) : t\('card\.addToConversation'\)\}/)
    // Prevents propagation on click
    assert.match(gridJsx, /event\.stopPropagation\(\)/)
    // Disables when added
    assert.match(gridJsx, /disabled=\{added\}/)
  })

  it('implements View and AddToConversation buttons in list row actions', () => {
    assert.match(gridJsx, /className="omnimux-assets-list-actions"/)
    assert.match(stylesJs, /\.omnimux-assets-list-actions\s*\{/)
  })

  it('implements dual-track branching for folder vs single media assets', () => {
    // Imports isFolderAsset and resolveAssetMediaPreview
    assert.match(gridJsx, /import\s+.*isFolderAsset.*resolveAssetMediaPreview.*from '\.\/asset-routing\.js'/)
    // In Card: branches on isFolderAsset(asset)
    assert.match(gridJsx, /if\s*\(isFolderAsset\(asset\)\)\s*\{[\s\S]*?onOpen\(asset\)/)
    assert.match(gridJsx, /onPreview\(resolveAssetMediaPreview\(asset\)\)/)
  })

  it('completely removes copyCite and remove buttons from card actions and list rows', () => {
    assert.doesNotMatch(gridJsx, /\{t\('card\.copyCite'\)\}/)
    assert.doesNotMatch(gridJsx, /\{t\('mapping\.remove'\)\}/)
  })

  it('contains complete i18n locales for card actions with Add to Conversation updated', () => {
    assert.equal(zh['card.view'], '查看详情')
    assert.equal(zh['card.addToConversation'], '添加到会话')
    assert.equal(zh['card.addedToConversation'], '已添加')
    assert.equal(zh['card.actions'], '操作')

    assert.equal(en['card.view'], 'View Details')
    assert.equal(en['card.addToConversation'], 'Add to Conversation')
    assert.equal(en['card.addedToConversation'], 'Added')
    assert.equal(en['card.actions'], 'Actions')
  })

  it('AssetsStage routes list and grid view cleanly through AssetGrid without raw inputs', () => {
    assert.doesNotMatch(stageJsx, /AssetsTableView/)
    assert.doesNotMatch(stageJsx, /<input\b/)
    assert.match(stageJsx, /<AssetGrid\b/)
  })

  it('migrates card CTA buttons into thumb hover overlay with EyeIcon and ChatIcon', () => {
    // 1. Overlay is placed inside card thumb
    assert.match(gridJsx, /<div className="omnimux-assets-card-overlay">/)
    assert.match(gridJsx, /<div className="omnimux-assets-card-overlay-actions">/)
    // 2. Buttons contain EyeIcon and ChatIcon
    assert.match(gridJsx, /<EyeIcon\s+size=\{14\}\s*\/>/)
    assert.match(gridJsx, /<ChatIcon\s+size=\{14\}\s*\/>/)
    // 3. Conforms to MediaCard and Table primitive composite contract without legacy raw button or card-actions
    assert.match(gridJsx, /<MediaCard\b/)
    assert.match(gridJsx, /<Table\b/)
    assert.doesNotMatch(gridJsx, /omnimux-assets-card-actions/)
    assert.doesNotMatch(gridJsx, /<button\b/)
    // 4. Styles define thumb height 136px and overlay hover styling
    assert.match(stylesJs, /\.omnimux-assets-card-thumb\s*\{[\s\S]*?height:\s*136px;/)
    assert.match(stylesJs, /\.omnimux-assets-card-overlay\s*\{[\s\S]*?background:\s*linear-gradient/)
    assert.match(stylesJs, /\.omnimux-assets-overlay-btn--secondary/)
    assert.match(stylesJs, /\.omnimux-assets-overlay-btn--primary/)
  })
})
