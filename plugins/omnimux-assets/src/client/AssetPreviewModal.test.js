import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { zh, en } from './locales.js'

const here = dirname(fileURLToPath(import.meta.url))
const modalJsx = readFileSync(join(here, 'AssetPreviewModal.jsx'), 'utf8')
const stylesJs = readFileSync(join(here, 'styles.js'), 'utf8')

describe('AssetPreviewModal component contract and tokens compliance', () => {
  it('conforms to Backdrop, Container, Header, Body and Footer layout', () => {
    // Backdrop with Gaussian blur mask
    assert.match(modalJsx, /className="omnimux-assets-modal-backdrop"/)
    assert.match(modalJsx, /role="dialog"/)
    assert.match(modalJsx, /aria-modal="true"/)
    assert.match(modalJsx, /onClick=\{onClose\}/)

    // Container with stopPropagation
    assert.match(modalJsx, /className="omnimux-assets-modal-container"/)
    assert.match(modalJsx, /event\.stopPropagation\(\)/)

    // Header with title, extension badge, and CloseIcon
    assert.match(modalJsx, /className="omnimux-assets-modal-header"/)
    assert.match(modalJsx, /className="omnimux-assets-modal-badge"/)
    assert.match(modalJsx, /<CloseIcon\s+size=\{16\}\s*\/>/)

    // Body with media switch
    assert.match(modalJsx, /className="omnimux-assets-modal-body"/)
    assert.match(modalJsx, /className="omnimux-assets-modal-image"/)
    assert.match(modalJsx, /className="omnimux-assets-modal-video"/)
    assert.match(modalJsx, /className="omnimux-assets-modal-unsupported"/)

    // Footer with path and primary AddToConversation button
    assert.match(modalJsx, /className="omnimux-assets-modal-footer"/)
    assert.match(modalJsx, /className="omnimux-assets-modal-path"/)
    assert.match(modalJsx, /\{added \? t\('modal\.addedToConversation'\) : t\('modal\.addToConversation'\)\}/)
  })

  it('implements Escape key global listener for fast dismissal', () => {
    assert.match(modalJsx, /event\.key === 'Escape'/)
    assert.match(modalJsx, /window\.addEventListener\('keydown', handleKeyDown\)/)
    assert.match(modalJsx, /window\.removeEventListener\('keydown', handleKeyDown\)/)
  })

  it('implements 1800ms timer feedback on AddToConversation click', () => {
    assert.match(modalJsx, /setTimeout\([\s\S]*?, 1800\)/)
    assert.match(modalJsx, /disabled=\{added\}/)
    assert.match(modalJsx, /addMediaToConversation\(item\)/)
  })

  it('strictly adheres to 100% --dsw-* design tokens in styles.js for modal classes', () => {
    // Backdrop blur and mask
    assert.match(stylesJs, /\.omnimux-assets-modal-backdrop\s*\{[\s\S]*?backdrop-filter:\s*blur\(16px\);/)
    assert.match(stylesJs, /\.omnimux-assets-modal-backdrop\s*\{[\s\S]*?background:\s*var\(--dsw-alias-bg-mask-1\);/)

    // Container tokens
    assert.match(stylesJs, /\.omnimux-assets-modal-container\s*\{[\s\S]*?background:\s*var\(--dsw-alias-bg-base/)
    assert.match(stylesJs, /\.omnimux-assets-modal-container\s*\{[\s\S]*?border:\s*1px\s+solid\s+var\(--dsw-alias-border-l2\);/)
    assert.match(stylesJs, /\.omnimux-assets-modal-container\s*\{[\s\S]*?box-shadow:\s*0\s+16px\s+48px\s+var\(--dsw-alias-bg-mask-1\);/)

    // Image contain style
    assert.match(stylesJs, /\.omnimux-assets-modal-image\s*\{[\s\S]*?object-fit:\s*contain;/)

    // No bare rgba or hex in modal styles
    const modalCssPart = stylesJs.slice(stylesJs.indexOf('.omnimux-assets-modal-backdrop'))
    assert.doesNotMatch(modalCssPart, /#[0-9a-fA-F]{3,8}\b/)
    assert.doesNotMatch(modalCssPart, /rgba\(/)
  })

  it('contains valid modal localization in zh and en', () => {
    assert.equal(zh['modal.addToConversation'], '加入对话')
    assert.equal(zh['modal.addedToConversation'], '已加入')
    assert.equal(zh['modal.close'], '关闭预览')
    assert.equal(zh['modal.unsupportedMedia'], '当前文件格式不支持内嵌预览')

    assert.equal(en['modal.addToConversation'], 'Add to Conversation')
    assert.equal(en['modal.addedToConversation'], 'Added')
    assert.equal(en['modal.close'], 'Close Preview')
    assert.equal(en['modal.unsupportedMedia'], 'Preview not supported for this file format')
  })
})
