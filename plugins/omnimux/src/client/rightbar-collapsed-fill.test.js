import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import {
  COLLAPSED_ATTR,
  LEFT_COLLAPSED_ATTR,
  FILL_MARK_ATTR,
  computeCollapsedPanelSpan,
  releaseCollapsedPanelFill,
  syncCollapsedPanelFill,
} from './rightbar-collapsed-fill.js'

/** 极简假 DOM：只实现本模块真正用到的表面。 */
function makeEnv({ collapsed = true, leftCollapsed = false, innerWidth = 1920, railRight = 280, hasPanel = true } = {}) {
  const writes = []
  const style = {
    _map: new Map(),
    setProperty(name, value, priority) { writes.push([name, value, priority || '']); this._map.set(name, { value, priority: priority || '' }) },
    getPropertyValue(name) { return this._map.get(name)?.value || '' },
    getPropertyPriority(name) { return this._map.get(name)?.priority || '' },
    removeProperty(name) { this._map.delete(name) },
  }
  const attrs = new Map()
  attrs.set('data-sidebar-right-panel', 'push')
  attrs.set('data-sidebar-right-open', 'true')
  const panel = {
    style,
    getAttribute: (n) => attrs.get(n) ?? null,
    setAttribute: (n, v) => attrs.set(n, v),
    removeAttribute: (n) => attrs.delete(n),
    getBoundingClientRect: () => ({ right: railRight, left: 0, width: railRight }),
  }
  const root = {
    hasAttribute: (n) => (n === COLLAPSED_ATTR ? collapsed : n === LEFT_COLLAPSED_ATTR ? leftCollapsed : false),
  }
  const doc = {
    documentElement: root,
    defaultView: { innerWidth, addEventListener() {}, removeEventListener() {} },
    querySelector: (sel) => {
      if (sel.includes('data-sidebar-right-panel')) return hasPanel ? panel : null
      if (sel.includes('dshDesktopSidebarSurface')) return { getBoundingClientRect: () => ({ right: railRight, width: railRight }) }
      return null
    },
  }
  return { doc, panel, writes, attrs }
}

function makeNativeEnv(t, grid = '280px minmax(0px, 1fr) 864px') {
  const dom = new JSDOM(`<div class="_1qAH1q_frame">
    <div class="_1qAH1q_sidebarCol"></div>
    <div data-sidebar-right-panel="fullscreen" data-sidebar-right-open></div>
  </div>`)
  t.after(() => dom.window.close())
  const doc = dom.window.document
  doc.documentElement.setAttribute(COLLAPSED_ATTR, '')
  Object.defineProperty(dom.window, 'innerWidth', { value: 1920, writable: true })
  const frame = doc.querySelector('[class*="frame"]')
  frame.style.gridTemplateColumns = grid
  const rail = doc.querySelector('[class*="sidebarCol"]')
  rail.getBoundingClientRect = () => ({ right: 280, width: 280 })
  return { doc, frame, rail, panel: doc.querySelector('[data-sidebar-right-panel]') }
}

describe('native panel fill boundaries', () => {
  it('uses the shell track with CSS-module columns and follows left collapse/restore', (t) => {
    const { doc, panel, rail } = makeNativeEnv(t)
    rail.getBoundingClientRect = () => ({ right: 1920, width: 1920 })
    assert.equal(syncCollapsedPanelFill(doc), true)
    assert.equal(panel.style.getPropertyValue('width'), '1640px')
    doc.documentElement.setAttribute(LEFT_COLLAPSED_ATTR, '')
    syncCollapsedPanelFill(doc)
    assert.equal(panel.style.getPropertyValue('width'), '1920px')
    doc.documentElement.removeAttribute(LEFT_COLLAPSED_ATTR)
    syncCollapsedPanelFill(doc)
    assert.equal(panel.style.getPropertyValue('width'), '1640px')
  })

  it('falls back to the shared CSS-module sidebar selector without a shell track', (t) => {
    const { doc, panel } = makeNativeEnv(t, '')
    assert.equal(syncCollapsedPanelFill(doc), true)
    assert.equal(panel.style.getPropertyValue('width'), '1640px')
  })

  it('does not treat an absent rail as zero unless explicitly collapsed', (t) => {
    const { doc, panel, rail } = makeNativeEnv(t, '')
    rail.remove()
    assert.equal(syncCollapsedPanelFill(doc), false)
    assert.equal(panel.style.cssText, '')
    doc.documentElement.setAttribute(LEFT_COLLAPSED_ATTR, '')
    assert.equal(syncCollapsedPanelFill(doc), true)
    assert.equal(panel.style.getPropertyValue('width'), '1920px')
  })

  it('releases old ownership when rail measurement fails', (t) => {
    const { doc, panel, frame, rail } = makeNativeEnv(t)
    syncCollapsedPanelFill(doc)
    frame.style.gridTemplateColumns = ''
    rail.getBoundingClientRect = () => { throw new Error('unavailable') }
    assert.equal(syncCollapsedPanelFill(doc), false)
    assert.equal(panel.style.getPropertyValue('width'), '')
    assert.equal(panel.style.getPropertyValue('transition'), '')
    assert.equal(panel.hasAttribute(FILL_MARK_ATTR), false)
  })

  it('releases old ownership when viewport measurement fails', (t) => {
    const { doc, panel } = makeNativeEnv(t)
    syncCollapsedPanelFill(doc)
    doc.defaultView.innerWidth = 0
    assert.equal(syncCollapsedPanelFill(doc), false)
    assert.equal(panel.style.cssText, '')
    assert.equal(panel.hasAttribute(FILL_MARK_ATTR), false)
  })

  it('releases a retained closed panel and remains idempotent', (t) => {
    const { doc, panel } = makeNativeEnv(t)
    syncCollapsedPanelFill(doc)
    panel.removeAttribute('data-sidebar-right-open')
    panel.setAttribute('data-sidebar-right-panel', 'push')
    panel.style.setProperty('width', '864px')
    assert.equal(syncCollapsedPanelFill(doc), false)
    assert.equal(panel.style.cssText, '')
    assert.equal(panel.hasAttribute(FILL_MARK_ATTR), false)
    assert.equal(syncCollapsedPanelFill(doc), false)
    assert.equal(releaseCollapsedPanelFill(doc), false)
    panel.style.setProperty('width', '864px')
    syncCollapsedPanelFill(doc)
    assert.equal(panel.style.getPropertyValue('width'), '864px', 'unowned native geometry stays intact')
  })

  it('explicit cleanup also releases a closed panel without sync', (t) => {
    const { doc, panel } = makeNativeEnv(t)
    syncCollapsedPanelFill(doc)
    panel.removeAttribute('data-sidebar-right-open')
    assert.equal(releaseCollapsedPanelFill(doc), true)
    assert.equal(releaseCollapsedPanelFill(doc), false)
    assert.equal(panel.style.cssText, '')
  })
})

describe('computeCollapsedPanelSpan', () => {
  it('rejects missing, zero, invalid or nonfinite measurements', () => {
    for (const leftRailRight of [undefined, null, 0, -1, NaN, Infinity]) {
      assert.equal(computeCollapsedPanelSpan({ viewportWidth: 1920, leftRailRight }), 0)
    }
    assert.equal(computeCollapsedPanelSpan({ viewportWidth: Infinity, leftCollapsed: true }), 0)
    assert.equal(computeCollapsedPanelSpan({ viewportWidth: 1920, leftCollapsed: true }), 1920)
  })
  it('spans from the left rail right edge to the viewport edge', () => {
    assert.equal(computeCollapsedPanelSpan({ viewportWidth: 1920, leftRailRight: 280, leftCollapsed: false }), 1640)
  })

  it('spans the whole viewport when the left rail is collapsed', () => {
    assert.equal(computeCollapsedPanelSpan({ viewportWidth: 1920, leftRailRight: 280, leftCollapsed: true }), 1920)
  })

  it('returns 0 when the viewport cannot be measured', () => {
    assert.equal(computeCollapsedPanelSpan({ viewportWidth: 0, leftRailRight: 280 }), 0)
  })
})

describe('syncCollapsedPanelFill', () => {
  it('writes the full span inline with important, and neutralizes the width transition', () => {
    const { doc, panel, attrs } = makeEnv()
    assert.equal(syncCollapsedPanelFill(doc), true)
    assert.equal(panel.style.getPropertyValue('width'), '1640px')
    assert.equal(panel.style.getPropertyPriority('width'), 'important')
    // 过渡中的值在层叠里高于 author !important：不中和过渡，宽度写不进去。
    assert.equal(panel.style.getPropertyPriority('transition'), 'important')
    assert.equal(panel.style.getPropertyValue('transition'), 'none')
    assert.equal(attrs.get(FILL_MARK_ATTR), '1')
  })

  it('is idempotent once settled so the style observer cannot self-trigger', () => {
    const { doc, writes } = makeEnv()
    syncCollapsedPanelFill(doc)
    const afterFirst = writes.length
    syncCollapsedPanelFill(doc)
    assert.equal(writes.length, afterFirst, 'repeat sync must not rewrite settled values')
  })

  it('re-applies when the shell rewrites the inline width', () => {
    const { doc, panel } = makeEnv()
    syncCollapsedPanelFill(doc)
    panel.style.setProperty('width', '864px') // 外壳重渲染覆盖
    syncCollapsedPanelFill(doc)
    assert.equal(panel.style.getPropertyValue('width'), '1640px')
    assert.equal(panel.style.getPropertyPriority('width'), 'important')
  })

  it('does nothing while the conversation is not collapsed', () => {
    const { doc, panel } = makeEnv({ collapsed: false })
    assert.equal(syncCollapsedPanelFill(doc), false)
    assert.equal(panel.style.getPropertyValue('width'), '')
  })

  it('releases the held geometry when the collapsed state ends', () => {
    const { doc, panel } = makeEnv()
    syncCollapsedPanelFill(doc)
    assert.equal(panel.style.getPropertyValue('width'), '1640px')
    const env = makeEnv({ collapsed: false })
    // 复用同一面板：把 el 换成同一实例，验证松手行为
    env.doc.querySelector = (sel) => (sel.includes('data-sidebar-right-panel') ? panel : env.doc.querySelector(sel))
    syncCollapsedPanelFill(env.doc)
    assert.equal(panel.style.getPropertyValue('width'), '', 'release must hand geometry back to the shell')
    assert.equal(panel.style.getPropertyPriority('transition'), '')
    assert.equal(panel.getAttribute(FILL_MARK_ATTR), null)
  })

  it('no-ops when there is no open panel', () => {
    const { doc } = makeEnv({ hasPanel: false })
    assert.equal(syncCollapsedPanelFill(doc), false)
  })

  it('no-ops when the span cannot be computed', () => {
    const { doc, panel } = makeEnv({ innerWidth: 0 })
    assert.equal(syncCollapsedPanelFill(doc), false)
    assert.equal(panel.style.getPropertyValue('width'), '')
  })

  it('release is safe to call twice', () => {
    const { doc } = makeEnv()
    syncCollapsedPanelFill(doc)
    assert.equal(releaseCollapsedPanelFill(doc), true)
    assert.equal(releaseCollapsedPanelFill(doc), false)
  })
})
