import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readRightPanelLeft, readVidsCenterBox } from './vids-stage-box.js'

function fakeEl(rect, extras = {}) {
  return {
    getBoundingClientRect: () => rect,
    parentElement: extras.parent ?? null,
    ...extras,
  }
}

function stubDom({ nodes = {}, styles = {}, win = { innerWidth: 1728, innerHeight: 994 } } = {}) {
  const previous = { document: globalThis.document, window: globalThis.window, getComputedStyle: globalThis.getComputedStyle }
  globalThis.window = win
  globalThis.document = {
    querySelector(sel) {
      return nodes[sel] ?? null
    },
  }
  globalThis.getComputedStyle = (el) => styles.get?.(el) || { display: 'flex', visibility: 'visible' }
  return () => {
    globalThis.document = previous.document
    globalThis.window = previous.window
    globalThis.getComputedStyle = previous.getComputedStyle
  }
}

describe('readVidsCenterBox', () => {
  it('prefers centerCol and clamps width to the right panel left edge', () => {
    const center = fakeEl({ top: 0, left: 280, width: 670, height: 994 })
    const fatAncestor = fakeEl({ top: 0, left: 280, width: 1448, height: 994 })
    const right = fakeEl({ top: 0, left: 950, width: 778, height: 994 })
    const restore = stubDom({
      nodes: {
        '[class*="centerCol"]': center,
        '[data-slot="conversation"]': fatAncestor,
        '[data-sidebar-right-panel][data-sidebar-right-open]': right,
      },
    })
    try {
      assert.deepEqual(readVidsCenterBox(), {
        top: 0,
        left: 280,
        width: 670,
        height: 994,
      })
    } finally {
      restore()
    }
  })

  it('clamps a fat conversation ancestor when right panel is open', () => {
    const fat = fakeEl({ top: 0, left: 280, width: 1448, height: 994 })
    const right = fakeEl({ top: 0, left: 950, width: 778, height: 994 })
    const restore = stubDom({
      nodes: {
        '[data-slot="conversation"]': fat,
        '[data-sidebar-right-panel][data-sidebar-right-open]': right,
      },
    })
    try {
      assert.deepEqual(readVidsCenterBox(), {
        top: 0,
        left: 280,
        width: 670,
        height: 994,
      })
    } finally {
      restore()
    }
  })

  it('does not expand to viewport-minus-left like Apps readConversationBox', () => {
    const column = fakeEl({ top: 0, left: 280, width: 420, height: 900 })
    const restore = stubDom({
      nodes: { '[class*="centerCol"]': column },
      win: { innerWidth: 1728, innerHeight: 994 },
    })
    try {
      const box = readVidsCenterBox()
      assert.equal(box.left, 280)
      assert.equal(box.width, 420)
      assert.notEqual(box.width, 1728 - 280)
    } finally {
      restore()
    }
  })

  it('falls back when no conversation column exists', () => {
    const restore = stubDom({ nodes: {}, win: { innerWidth: 1440, innerHeight: 900 } })
    try {
      assert.deepEqual(readVidsCenterBox(), {
        top: 0,
        left: 56,
        width: 1384,
        height: 900,
      })
    } finally {
      restore()
    }
  })
})

describe('readRightPanelLeft', () => {
  it('returns null for off-screen collapsed panels', () => {
    const right = fakeEl({ top: 0, left: 1729, width: 1, height: 994 })
    const restore = stubDom({
      nodes: {
        '[data-sidebar-right-panel][data-sidebar-right-open]': right,
        '[data-sidebar-right-panel]': right,
      },
    })
    try {
      assert.equal(readRightPanelLeft(), null)
    } finally {
      restore()
    }
  })
})
