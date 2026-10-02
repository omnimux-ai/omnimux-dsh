import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { PRODUCT_STAGE_CHROME, ensureProductStageChrome, readConversationBox } from './conversation-box.js'
import { persistSessionThreeColumn, resetConversationCollapseForTests } from './conversation-collapse.js'

function fakeEl(rect, parent = null) {
  return {
    getBoundingClientRect: () => rect,
    parentElement: parent,
  }
}

/**
 * @param {Record<string, unknown>} nodes
 */
function stubDocument(nodes) {
  const previous = globalThis.document
  globalThis.document = {
    querySelector(sel) {
      return nodes[sel] ?? null
    },
  }
  return () => {
    globalThis.document = previous
  }
}

describe('readConversationBox', () => {
  it('covers the whole conversation column, session header included', () => {
    const scroll = fakeEl({ top: 80, left: 260, width: 800, height: 600 })
    const column = fakeEl({ top: 0, left: 260, width: 800, height: 680 })
    const restore = stubDocument({
      '[data-conversation-scroll]': scroll,
      '[data-slot="conversation"]': column,
    })
    try {
      // First-level product pages are not session views: the box must span
      // the whole conversation column, not only the scrollport.
      assert.deepEqual(readConversationBox(), { top: 0, left: 260, width: 800, height: 680 })
    } finally {
      restore()
    }
  })

  it('walks up to a sizable ancestor when the conversation node is flat', () => {
    const ancestor = fakeEl({ top: 0, left: 200, width: 900, height: 700 })
    const column = fakeEl({ top: 0, left: 260, width: 0, height: 0 }, ancestor)
    const restore = stubDocument({ '[data-slot="conversation"]': column })
    try {
      assert.deepEqual(readConversationBox(), { top: 0, left: 200, width: 900, height: 700 })
    } finally {
      restore()
    }
  })

  it('falls back to the scrollport when no conversation column is sizable', () => {
    const scroll = fakeEl({ top: 80, left: 260, width: 800, height: 600 })
    const column = fakeEl({ top: 0, left: 260, width: 0, height: 0 })
    const restore = stubDocument({
      '[data-conversation-scroll]': scroll,
      '[data-slot="conversation"]': column,
    })
    try {
      assert.deepEqual(readConversationBox(), { top: 80, left: 260, width: 800, height: 600 })
    } finally {
      restore()
    }
  })
})

describe('PRODUCT_STAGE_CHROME', () => {
  it('hides the session header and selected-row highlight while a product stage is active', () => {
    assert.match(PRODUCT_STAGE_CHROME, /conversation\.session\.header/)
    assert.match(PRODUCT_STAGE_CHROME, /treeitem/)
    assert.match(PRODUCT_STAGE_CHROME, /toggleCluster/)
    assert.match(PRODUCT_STAGE_CHROME, /pointer-events:none/)
    assert.match(PRODUCT_STAGE_CHROME, /dsh-window-drag/)
    assert.match(PRODUCT_STAGE_CHROME, /body\[data-dsh-desktop-mode\] \[class\*="tabBar"\]/)
    assert.match(PRODUCT_STAGE_CHROME, /tabBar"\] \*\{-webkit-app-region:no-drag/)
    assert.match(PRODUCT_STAGE_CHROME, /\[class\*="sidebarCol"\] \[class\*="logoRow"\]/)
    assert.match(PRODUCT_STAGE_CHROME, /logoRow"\] \*\{[\s\S]*-webkit-app-region:no-drag/)
    assert.match(PRODUCT_STAGE_CHROME, /data-dsh-panel-host/)
    assert.match(PRODUCT_STAGE_CHROME, /data-dsh-better-sidebar/)
    assert.match(PRODUCT_STAGE_CHROME, /\[data-dsh-better-sidebar\] \[class\*="_panel"\]/)
    assert.doesNotMatch(PRODUCT_STAGE_CHROME, /html\[data-dsh-product-stage\]\s+\[class\*="_panel"\]/, '禁止使用无命名空间的全局 _panel 选择器，避免误杀设置弹窗 VOzbGW_panel')
    assert.match(PRODUCT_STAGE_CHROME, /--dsh-sidebar-width/)
    assert.match(PRODUCT_STAGE_CHROME, /--dsh-sidebar-height/)
    assert.match(PRODUCT_STAGE_CHROME, /margin-right:0px/)
    // Topbar sidebar toggle layout (traffic → toggle → tabBar)
    assert.match(PRODUCT_STAGE_CHROME, /data-omnimux-sidebar-toggle-topbar/)
    assert.match(PRODUCT_STAGE_CHROME, /--omnimux-topbar-toggle-end/)
    assert.match(PRODUCT_STAGE_CHROME, /data-omnimux-left-collapsed/)
    assert.match(PRODUCT_STAGE_CHROME, /\[data-sidebar-collapsed\] \[class\*="sidebarCol"\]/)
    assert.match(PRODUCT_STAGE_CHROME, /padding-left:var\(--omnimux-tabbar-pad-left/)
    assert.match(PRODUCT_STAGE_CHROME, /padding-left:var\(--omnimux-topbar-toggle-end/)
    assert.match(
      PRODUCT_STAGE_CHROME,
      /data-omnimux-left-collapsed\] \[data-slot="conversation\.session\.header"\] header/,
    )
    assert.match(PRODUCT_STAGE_CHROME, /data-omnimux-topbar-new-session/)
    assert.match(PRODUCT_STAGE_CHROME, /--omnimux-topbar-new-session-left/)
    assert.match(PRODUCT_STAGE_CHROME, /z-index:\s*(50|9999)/)
    // Settings modal must outrank body-portaled better-sidebar + cluster while open,
    // and escape the gui-mode #root width squeeze that otherwise clips it.
    assert.match(
      PRODUCT_STAGE_CHROME,
      /#root:has\(\[role="dialog"\]\[aria-modal="true"\]\)\s*\{[\s\S]*?z-index:\s*1100\s*!important/,
    )
    assert.match(
      PRODUCT_STAGE_CHROME,
      /#root:has\(\[role="dialog"\]\[aria-modal="true"\]\)\s*\{[\s\S]*?width:\s*100%\s*!important/,
    )
    assert.match(
      PRODUCT_STAGE_CHROME,
      /#root:has\(\[role="dialog"\]\[aria-modal="true"\]\)\s*\{[\s\S]*?overflow:\s*visible\s*!important/,
    )
    assert.match(PRODUCT_STAGE_CHROME, /--dsw-alias-brand-primary|--dsw-alias-interactive-bg-hover-accent|--dsw-alias-label-accent/)
  })
})

describe('session-row closer', () => {
  /** @type {JSDOM | undefined} */
  let dom
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLStyleElement: globalThis.HTMLStyleElement,
    Element: globalThis.Element,
    CustomEvent: globalThis.CustomEvent,
  }

  afterEach(() => {
    dom?.window.close()
    dom = undefined
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.HTMLElement = previous.HTMLElement
    globalThis.HTMLStyleElement = previous.HTMLStyleElement
    globalThis.Element = previous.Element
    globalThis.CustomEvent = previous.CustomEvent
  })

  function setup() {
    dom = new JSDOM(`<!doctype html><html><body>
      <button type="button" class="brand" aria-label="新建会话" id="brand">OmniMux</button>
      <button type="button" class="newSession" aria-label="新建会话" id="new-session">新会话</button>
      <button type="button" class="omnimux-sidebar-inline-btn" id="new-project">新建项目</button>
      <div role="treeitem" aria-selected="true" id="current">当前会话<button type="button" id="pin">pin</button></div>
      <div role="treeitem" aria-selected="false" id="other">其它会话</div>
      <div role="treeitem" id="workspace">工作区<button type="button" id="ws-plus" aria-label="在“演示”中新建会话">+</button></div>
      <div id="omnimux-sidebar-new-menu" class="omnimux-sidebar-new-menu">
        <button type="button" role="menuitem" id="menu-session">新建会话</button>
        <button type="button" role="menuitem" id="menu-project">新建项目</button>
      </div>
    </body></html>`, { url: 'http://127.0.0.1/' })
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.HTMLElement = dom.window.HTMLElement
    globalThis.HTMLStyleElement = dom.window.HTMLStyleElement
    globalThis.Element = dom.window.Element
    globalThis.CustomEvent = dom.window.CustomEvent
    document.documentElement.dataset.dshProductStage = 'omnimux-assets'
    delete document.documentElement.dataset.dshSessionCloser
    // #2520：会话行点击只有该会话有三栏记忆才恢复 split；测试在行 id 上预置记忆，
    // 覆盖恢复三栏分支（无记忆 → 会话全屏 'chat' 由别的用例覆盖）。
    resetConversationCollapseForTests()
    persistSessionThreeColumn(true, 'other')
    persistSessionThreeColumn(true, 'current')
  }

  it('rewrites injected chrome that has window-drag but not scoped better-sidebar panel rule', () => {
    setup()
    const style = document.createElement('style')
    style.id = 'dsh-product-stage-chrome'
    style.textContent = 'html[data-dsh-product-stage] #dsh-window-drag{-webkit-app-region:no-drag}'
    document.head.append(style)
    ensureProductStageChrome()
    assert.match(style.textContent, /data-dsh-panel-host/)
    assert.match(style.textContent, /\[data-dsh-better-sidebar\] \[class\*="_panel"\]/)
    assert.match(style.textContent, /--dsh-sidebar-width/)
    assert.match(style.textContent, /data-omnimux-sidebar-toggle-topbar/)
    assert.match(style.textContent, /--omnimux-topbar-toggle-end/)
    assert.match(style.textContent, /--omnimux-tabbar-pad-left/)
    assert.match(style.textContent, /#root:has\(\[role="dialog"\]\[aria-modal="true"\]\)/)
  })

  it('closes the product page when an unselected session row is clicked', () => {
    setup()
    /** @type {{ id?: string } | null} */
    let detail = null
    window.addEventListener('dsh-product-stage', (event) => {
      detail = /** @type {CustomEvent} */ (event).detail
    })
    ensureProductStageChrome()
    document.getElementById('other').click()
    assert.equal(document.documentElement.dataset.dshProductStage, undefined)
    assert.deepEqual(detail, { id: '' })
  })

  it('closes the product page when the already-selected session row is clicked', () => {
    setup()
    ensureProductStageChrome()
    document.getElementById('current').click()
    assert.equal(document.documentElement.dataset.dshProductStage, undefined)
  })

  it('does not close when a button inside a session row is clicked', () => {
    setup()
    ensureProductStageChrome()
    document.getElementById('pin').click()
    assert.equal(document.documentElement.dataset.dshProductStage, 'omnimux-assets')
  })

  it('is a no-op when no product stage is open', () => {
    setup()
    delete document.documentElement.dataset.dshProductStage
    ensureProductStageChrome()
    assert.doesNotThrow(() => { document.getElementById('other').click() })
  })

  it('closes the product page when 新会话 is clicked', () => {
    setup()
    ensureProductStageChrome()
    document.getElementById('new-session').click()
    assert.equal(document.documentElement.dataset.dshProductStage, undefined)
  })

  it('closes the product page when the brand new-session shortcut is clicked', () => {
    setup()
    ensureProductStageChrome()
    document.getElementById('brand').click()
    assert.equal(document.documentElement.dataset.dshProductStage, undefined)
  })

  it('closes the product page when a workspace-group plus is clicked', () => {
    setup()
    ensureProductStageChrome()
    document.getElementById('ws-plus').click()
    assert.equal(document.documentElement.dataset.dshProductStage, undefined)
  })

  it('closes the product page when the collapsed menu pick 新建会话 is clicked', () => {
    setup()
    ensureProductStageChrome()
    document.getElementById('menu-session').click()
    assert.equal(document.documentElement.dataset.dshProductStage, undefined)
  })

  it('does not close when 新建项目 is clicked', () => {
    setup()
    ensureProductStageChrome()
    document.getElementById('new-project').click()
    assert.equal(document.documentElement.dataset.dshProductStage, 'omnimux-assets')
  })

  it('does not close when the collapsed menu pick 新建项目 is clicked', () => {
    setup()
    ensureProductStageChrome()
    document.getElementById('menu-project').click()
    assert.equal(document.documentElement.dataset.dshProductStage, 'omnimux-assets')
  })

  it('reveals collapsed conversation when a workspace session row is clicked', () => {
    setup()
    delete document.documentElement.dataset.dshProductStage
    const focusChanges = []
    let collapsed = true
    window.__omnimuxWorkbench = {
      getConversationCollapsed: () => collapsed,
      setFocus: (mode) => {
        focusChanges.push(mode)
        if (mode === 'split') collapsed = false
        return true
      },
    }
    ensureProductStageChrome()
    document.getElementById('other').click()
    assert.deepEqual(focusChanges, ['split'])
    assert.equal(collapsed, false)
  })

  it('reveals collapsed conversation when the already-selected session row is clicked', () => {
    setup()
    delete document.documentElement.dataset.dshProductStage
    const focusChanges = []
    let collapsed = true
    window.__omnimuxWorkbench = {
      getConversationCollapsed: () => collapsed,
      setFocus: (mode) => {
        focusChanges.push(mode)
        if (mode === 'split') collapsed = false
        return true
      },
    }
    ensureProductStageChrome()
    document.getElementById('current').click()
    assert.deepEqual(focusChanges, ['split'])
  })

  it('session click while conversation is already visible keeps the split session focused', () => {
    setup()
    delete document.documentElement.dataset.dshProductStage
    const focusChanges = []
    window.__omnimuxWorkbench = {
      getConversationCollapsed: () => false,
      setFocus: (mode) => {
        focusChanges.push(mode)
        return true
      },
    }
    ensureProductStageChrome()
    document.getElementById('other').click()
    // #2520：有三栏记忆 → 恢复 split（全屏退出）而非跳过。
    assert.deepEqual(focusChanges, ['split'])
  })

  it('does not reveal conversation when a pin button inside a session row is clicked', () => {
    setup()
    delete document.documentElement.dataset.dshProductStage
    const focusChanges = []
    window.__omnimuxWorkbench = {
      getConversationCollapsed: () => true,
      setFocus: (mode) => {
        focusChanges.push(mode)
        return true
      },
    }
    ensureProductStageChrome()
    document.getElementById('pin').click()
    assert.deepEqual(focusChanges, [])
  })

  it('leaves product stage and reveals conversation on session click while collapsed', () => {
    setup()
    const focusChanges = []
    let collapsed = true
    window.__omnimuxWorkbench = {
      getConversationCollapsed: () => collapsed,
      setFocus: (mode) => {
        focusChanges.push(mode)
        if (mode === 'split') collapsed = false
        return true
      },
    }
    ensureProductStageChrome()
    document.getElementById('other').click()
    assert.equal(document.documentElement.dataset.dshProductStage, undefined)
    assert.deepEqual(focusChanges, ['split'])
  })

  it('does not close when collapsed-rail plus is captured to open the menu', () => {
    setup()
    ensureProductStageChrome()
    const btn = document.getElementById('new-session')
    btn.addEventListener('click', (event) => { event.stopPropagation() }, true)
    btn.click()
    assert.equal(document.documentElement.dataset.dshProductStage, 'omnimux-assets')
  })
})
