import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  CONTENT_LANDING_TABS,
  LANDED_CARD_ATTRIBUTE,
  LANDED_HIGHLIGHT_CLASS,
  landedCardSelector,
  revealLandedCard,
  tabAfterContentImport,
  withLandedItem,
} from './import-landing.js'

/**
 * Unit gate for the import landing rules.
 *
 * The render gate (`import-landing-render.test.js`) drives the real dialog and
 * grid; this one pins the decisions themselves, including the tab table and the
 * idempotence of the pin, which are cheaper to state here than through a mount.
 */

describe('import landing — tab decision', () => {
  it('keeps the tabs that can already show a local row', () => {
    for (const tab of CONTENT_LANDING_TABS) {
      assert.equal(tabAfterContentImport(tab), tab, `${tab} must be kept: it can list a local row`)
    }
  })

  it('moves to local from a tab that cannot show the imported row', () => {
    assert.equal(tabAfterContentImport('public'), 'local')
    assert.equal(tabAfterContentImport('rivals'), 'local')
    assert.equal(tabAfterContentImport(undefined), 'local')
  })
})

describe('import landing — pinned row', () => {
  const landed = { id: 'local-9', title: 'imported' }

  it('prepends the landed row when the list does not hold it', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    assert.deepEqual(withLandedItem(items, landed, 'local').map((row) => row.id), ['local-9', 'a', 'b'])
    assert.deepEqual(withLandedItem(items, landed, 'all').map((row) => row.id), ['local-9', 'a', 'b'])
  })

  it('never duplicates a row the list already holds', () => {
    const items = [{ id: 'local-9' }, { id: 'b' }]
    const merged = withLandedItem(items, landed, 'local')
    assert.equal(merged.filter((row) => row.id === 'local-9').length, 1)
    assert.equal(merged[0], items[0])
  })

  it('is inert on tabs that cannot hold a local row, and without a landed row', () => {
    const items = [{ id: 'a' }]
    assert.deepEqual(withLandedItem(items, landed, 'public'), items)
    assert.deepEqual(withLandedItem(items, landed, 'rivals'), items)
    assert.deepEqual(withLandedItem(items, null, 'local'), items)
    assert.deepEqual(withLandedItem(null, landed, 'local'), [landed])
  })

  it('ignores a landed row without an id, which could not be found in the DOM', () => {
    const items = [{ id: 'a' }]
    assert.deepEqual(withLandedItem(items, { title: 'no id' }, 'all'), items)
  })
})

describe('import landing — reveal', () => {
  function domWithCard(id) {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div class="omnimux-inspiration-grid"><div class="omnimux-inspiration-card-pure" ${LANDED_CARD_ATTRIBUTE}="${id}"></div></div></body></html>`)
    return dom
  }

  it('finds the card by row id', () => {
    const dom = domWithCard('local-1')
    const node = dom.window.document.querySelector(landedCardSelector('local-1'))
    assert.ok(node, 'the selector must match the card the grid rendered')
    assert.equal(dom.window.document.querySelector(landedCardSelector('local-2')), null)
  })

  it('escapes quotes so an id cannot break out of the selector', () => {
    assert.equal(landedCardSelector('a"b'), `[${LANDED_CARD_ATTRIBUTE}="a\\"b"]`)
  })

  it('highlights the card, scrolls it into view, and cleans both up', () => {
    const dom = domWithCard('local-1')
    const node = dom.window.document.querySelector(landedCardSelector('local-1'))
    const scrolled = []
    node.scrollIntoView = (options) => scrolled.push(options)

    const cleanup = revealLandedCard('local-1', { document: dom.window.document })
    assert.equal(node.classList.contains(LANDED_HIGHLIGHT_CLASS), true, 'the landed card must be flashed')
    assert.equal(scrolled.length, 1, 'the landed card must be scrolled into view')

    cleanup()
    assert.equal(node.classList.contains(LANDED_HIGHLIGHT_CLASS), false, 'the flash must end')
    dom.window.close()
  })

  it('is a no-op — not a crash — when the card is not on screen yet', () => {
    const dom = domWithCard('local-1')
    const cleanup = revealLandedCard('missing', { document: dom.window.document })
    assert.equal(typeof cleanup, 'function')
    cleanup()
    dom.window.close()
    // A missing card and a missing document are the same kind of timing detail.
    assert.equal(typeof revealLandedCard('local-1', { document: null }), 'function')
  })
})
