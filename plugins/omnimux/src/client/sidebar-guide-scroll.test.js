import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  SIDEBAR_GUIDE_SCROLL_CSS,
  SIDEBAR_GUIDE_SCROLL_STYLE_ID,
  ensureSidebarGuideScrollChrome,
  removeSidebarGuideScrollChrome,
} from './sidebar-guide-scroll.js'

const previousDocument = globalThis.document

afterEach(() => {
  if (previousDocument === undefined) delete globalThis.document
  else globalThis.document = previousDocument
})

/** Minimal document with a head that tracks appended nodes by id. */
function makeDoc() {
  const nodes = new Map()
  const head = {
    append(node) { nodes.set(node.id, node) },
  }
  return {
    _nodes: nodes,
    head,
    getElementById(id) { return nodes.get(id) ?? null },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        id: '',
        textContent: '',
        remove() { nodes.delete(this.id) },
      }
    },
  }
}

test('guide scroll CSS targets only the populated right-sidebar guide via stable hooks', () => {
  // Scoped to the right-sidebar tab body and the guide content container.
  assert.match(SIDEBAR_GUIDE_SCROLL_CSS, /\[data-sidebar-right-tab\]/)
  assert.match(SIDEBAR_GUIDE_SCROLL_CSS, /\[data-sidebar-right-guide\]/)
  assert.match(SIDEBAR_GUIDE_SCROLL_CSS, /:has\(\[data-sidebar-right-guide-entry\]\)/)
  // The three declarations that make the guide a bounded scroll container.
  assert.match(SIDEBAR_GUIDE_SCROLL_CSS, /overflow-y:\s*auto\s*!important/)
  assert.match(SIDEBAR_GUIDE_SCROLL_CSS, /max-height:\s*100%\s*!important/)
  assert.match(SIDEBAR_GUIDE_SCROLL_CSS, /justify-content:\s*safe center\s*!important/)
  // Must never depend on the official hashed class names or fixed DOM depth.
  assert.doesNotMatch(SIDEBAR_GUIDE_SCROLL_CSS, /L5GtOG/)
  assert.doesNotMatch(SIDEBAR_GUIDE_SCROLL_CSS, />\s*div\s*>\s*div/)
})

test('ensure injects the style once and is idempotent; remove cleans it up', () => {
  const doc = makeDoc()
  const first = ensureSidebarGuideScrollChrome(doc)
  assert.ok(first, 'style node created')
  assert.equal(first.id, SIDEBAR_GUIDE_SCROLL_STYLE_ID)
  assert.equal(first.textContent, SIDEBAR_GUIDE_SCROLL_CSS)
  assert.equal(doc._nodes.size, 1)

  // Second call reuses the same node and does not append a duplicate.
  const second = ensureSidebarGuideScrollChrome(doc)
  assert.equal(second, first)
  assert.equal(doc._nodes.size, 1)

  removeSidebarGuideScrollChrome(doc)
  assert.equal(doc._nodes.has(SIDEBAR_GUIDE_SCROLL_STYLE_ID), false)
})
