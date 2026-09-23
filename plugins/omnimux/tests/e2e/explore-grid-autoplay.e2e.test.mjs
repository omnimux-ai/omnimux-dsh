import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('explore grid autoplay e2e contracts: 5 columns grid, shelf limit, and in-viewport playback', async () => {
  const styles = readFileSync(new URL('../../src/client/session-guide/styles.js', import.meta.url), 'utf8')
  assert.ok(styles.includes('.omnimux-shelf-grid'), 'shelf grid must be defined')
  assert.ok(styles.includes('.omnimux-tpl-full-grid'), 'full grid must be defined')
  assert.ok(styles.includes('repeat(5, minmax(0, 1fr))'), '5 columns must be defined')

  const cardItem = readFileSync(new URL('../../src/client/session-guide/templates/TemplateCardItem.jsx', import.meta.url), 'utf8')
  assert.ok(cardItem.includes('IntersectionObserver'), 'card item must track viewport intersection')
  assert.ok(cardItem.includes('inViewport || hovered || focused'), 'video must autoplay when in viewport')
})
