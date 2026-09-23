import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHELVES_CONFIG, selectShelfItems } from './templates-data.js'

test('explore grid layout: shelf items restricted to top 5 and styles define 5 columns', () => {
  // 1. Shelf items limited to 5
  for (const shelf of SHELVES_CONFIG) {
    if (shelf.slug !== 'skills') {
      const items = selectShelfItems(shelf.slug, 5)
      assert.ok(items.length <= 5, `${shelf.slug} must have at most 5 items, got ${items.length}`)
    }
  }

  // 2. CSS grid definitions
  const styles = readFileSync(new URL('../styles.js', import.meta.url), 'utf8')
  assert.ok(styles.includes('.omnimux-shelf-grid'), 'styles must contain .omnimux-shelf-grid')
  assert.ok(styles.includes('repeat(5, minmax(0, 1fr))'), 'styles must define 5 columns repeat(5, minmax(0, 1fr))')
  assert.ok(styles.includes('max-width: 640px'), 'styles must include 640px responsive breakpoint')
  assert.ok(styles.includes('max-width: 420px'), 'styles must include 420px responsive breakpoint')
})

test('card item and video contract: in-viewport auto-play and preload handling', () => {
  const cardItemSource = readFileSync(new URL('./TemplateCardItem.jsx', import.meta.url), 'utf8')
  assert.ok(cardItemSource.includes('inViewport'), 'TemplateCardItem must track inViewport state')
  assert.ok(cardItemSource.includes('IntersectionObserver'), 'TemplateCardItem must use IntersectionObserver')
  assert.ok(cardItemSource.includes('inViewport || hovered || focused'), 'video active must consider inViewport')

  const videoSource = readFileSync(new URL('./TemplateVideo.jsx', import.meta.url), 'utf8')
  assert.ok(!videoSource.includes('crossOrigin'), 'TemplateVideo safely omits crossOrigin to prevent CORS errors on external media')
  assert.ok(videoSource.includes("preload={controls ? 'none' : (enabled ? 'auto' : 'none')}"), 'TemplateVideo must handle preload dynamically')
})
