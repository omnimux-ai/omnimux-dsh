import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  PRODUCT_STAGE_CHROME,
  STAGE_CSS_CLASS_MAP,
  claimProductStage,
  ensureProductStageChrome,
  releaseProductStage,
} from './conversation-box.js'

describe('Stage Mutual Exclusion & Host Chrome Rules', () => {
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
    dom = new JSDOM(`<!doctype html><html><head></head><body>
      <div data-slot="shell.overlay">
        <div class="omnimux-accounts-stage" data-visible="false">Accounts</div>
        <div class="omnimux-analytics-stage" data-visible="false">Analytics</div>
        <div class="omnimux-inspiration-stage" data-visible="false">Inspiration</div>
        <div class="omnimux-assets-stage" data-visible="false">Assets</div>
        <div class="omnimux-products-stage" data-visible="false">Products</div>
        <div class="omnimux-workflow-stage" data-visible="false">Workflow</div>
        <div class="omnimux-publish-stage" data-visible="false">Publish</div>
        <div class="omnimux-clip-stage" data-visible="false">Clip</div>
        <div class="omnimux-apps-stage" data-visible="false">Apps</div>
      </div>
    </body></html>`, { url: 'http://localhost' })
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.HTMLElement = dom.window.HTMLElement
    globalThis.HTMLStyleElement = dom.window.HTMLStyleElement
    globalThis.Element = dom.window.Element
    globalThis.CustomEvent = dom.window.CustomEvent
  }

  it('declares all known first-level product stage classes in STAGE_CSS_CLASS_MAP', () => {
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-accounts'], 'omnimux-accounts-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-assets'], 'omnimux-assets-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-analytics'], 'omnimux-analytics-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-products'], 'omnimux-products-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-inspiration'], 'omnimux-inspiration-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-workflow'], 'omnimux-workflow-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-publish'], 'omnimux-publish-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-clip'], 'omnimux-clip-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-apps'], 'omnimux-apps-stage')
    assert.equal(Object.keys(STAGE_CSS_CLASS_MAP).length, 9)
  })

  it('injects host-level mutual exclusion CSS for each stage', () => {
    for (const [id, className] of Object.entries(STAGE_CSS_CLASS_MAP)) {
      const expectedRule = `html[data-dsh-product-stage="${id}"] [data-slot="shell.overlay"] > [class*="-stage"]:not(.${className})`
      assert.ok(
        PRODUCT_STAGE_CHROME.includes(expectedRule),
        `PRODUCT_STAGE_CHROME must contain sibling-scoped mutual exclusion rule for ${id} targeting ${className}`,
      )
    }
  })

  it('scopes mutual exclusion to sibling stage roots, not descendants', () => {
    setup()
    ensureProductStageChrome()

    const chrome = document.getElementById('dsh-product-stage-chrome')?.textContent ?? ''
    assert.match(
      chrome,
      /\[data-slot="shell\.overlay"\] > \[class\*="-stage"\]:not\(\.omnimux-accounts-stage\)/,
      'the active-stage rule must select sibling roots through the overlay slot',
    )
    assert.doesNotMatch(
      chrome,
      /html\[data-dsh-product-stage="omnimux-accounts"\]\s+\[class\*="-stage"\]\s*:not\(\.omnimux-accounts-stage\)/,
      'a descendant-wide selector hides stage headers and bodies inside the active page',
    )
  })

  it('keeps BEM internals and vendored -stage fragments visible when no stage is active', () => {
    setup()
    ensureProductStageChrome()

    const chrome = document.getElementById('dsh-product-stage-chrome')?.textContent ?? ''
    assert.match(
      chrome,
      /html:not\(\[data-dsh-product-stage\]\) \[data-slot="shell\.overlay"\] > \[class\$="-stage"\]\{display:none/,
      'the idle rule must hide only overlay direct children ending in -stage (workbench *-stage roots must stay visible; #344)',
    )
    assert.doesNotMatch(
      chrome,
      /html:not\(\[data-dsh-product-stage\]\) \[class\$="-stage"\]\{display:none/,
      'a document-wide idle rule blanks workbench Tab panels whose roots also end in -stage (#344)',
    )
    assert.doesNotMatch(
      chrome,
      /html:not\(\[data-dsh-product-stage\]\) \[class\*="-stage"\]\{display:none/,
      'a fragment-wide idle rule would hide BEM internals and the vendored OpenReel studio classes (e.g. bg-stage-bg) opened from the canvas tab (#84)',
    )
  })

  it('updates html dataset when claiming and releasing product stage', () => {
    setup()
    ensureProductStageChrome()

    claimProductStage('omnimux-analytics')
    assert.equal(document.documentElement.dataset.dshProductStage, 'omnimux-analytics')

    claimProductStage('omnimux-inspiration')
    assert.equal(document.documentElement.dataset.dshProductStage, 'omnimux-inspiration')

    releaseProductStage('omnimux-inspiration')
    assert.equal(document.documentElement.dataset.dshProductStage, undefined)
  })

  it('never hides better-sidebar or panel-host when omnimux-apps stage is active', () => {
    setup()
    ensureProductStageChrome()

    const chrome = document.getElementById('dsh-product-stage-chrome')?.textContent ?? ''
    assert.match(
      chrome,
      /html\[data-dsh-product-stage\]:not\(\[data-dsh-product-stage="omnimux-apps"\]\)\s+\[data-dsh-better-sidebar\]/,
      'better-sidebar must never be hidden when omnimux-apps is active (apps live in workbench tabs)',
    )
    assert.match(
      chrome,
      /html\[data-dsh-product-stage\]:not\(\[data-dsh-product-stage="omnimux-apps"\]\)\s+\[data-dsh-panel-host\]/,
      'panel-host must never be hidden when omnimux-apps is active (apps live in workbench tabs)',
    )
  })

  it('reconciles workbench panel on new session intent without touching a real expanded sidebar', () => {
    setup()
    delete document.documentElement.dataset.dshSessionCloser
    ensureProductStageChrome()

    let closed = 0
    globalThis.window.__omnimuxWorkbench = {
      closePanel() { closed++ },
      getConversationCollapsed() { return false },
      setFocus() {},
    }

    // 1. 官方侧栏「+ 新对话」
    const shellBtn = document.createElement('button')
    shellBtn.className = 'x-Wl6W_newSession'
    shellBtn.textContent = '新对话'
    document.body.append(shellBtn)
    shellBtn.click()
    assert.equal(closed, 1, 'shell newSession button must reconcile workbench panel while the sidebar is collapsed')

    // 2. 工作区行「在“测试环境”中新建对话」
    const treeitem = document.createElement('div')
    treeitem.setAttribute('role', 'treeitem')
    const wsBtn = document.createElement('button')
    wsBtn.setAttribute('aria-label', '在“测试环境”中新建对话')
    treeitem.append(wsBtn)
    document.body.append(treeitem)
    wsBtn.click()
    assert.equal(closed, 2, 'workspace newSession button must reconcile workbench panel while the sidebar is collapsed')

    // 3. 顶栏「新建对话」按钮
    const topbarBtn = document.createElement('button')
    topbarBtn.setAttribute('data-omnimux-topbar-new-session', '1')
    document.body.append(topbarBtn)
    topbarBtn.click()
    assert.equal(closed, 3, 'topbar newSession button must reconcile workbench panel while the sidebar is collapsed')

    // 4. 收起轨新建会话菜单项
    const menu = document.createElement('div')
    menu.id = 'omnimux-sidebar-new-menu'
    const menuItem = document.createElement('div')
    menuItem.setAttribute('role', 'menuitem')
    menuItem.textContent = '新建对话'
    menu.append(menuItem)
    document.body.append(menu)
    menuItem.click()
    assert.equal(closed, 4, 'menu newSession pick must reconcile workbench panel while the sidebar is collapsed')

    // 5. 普通会话树行点击：不应触发 closePanel
    const plainRow = document.createElement('div')
    plainRow.setAttribute('role', 'treeitem')
    plainRow.textContent = '已有会话'
    document.body.append(plainRow)
    plainRow.click()
    assert.equal(closed, 4, 'plain session row must not close workbench panel')

    // 6. 真实右侧侧栏展开着：新会话只把会话挤到中间栏，不得破坏用户已打开的分栏
    const frame = document.createElement('div')
    frame.className = 'dshDesktopFrame'
    const rightbar = document.createElement('div')
    rightbar.setAttribute('data-rightbar-col', '')
    Object.defineProperty(rightbar, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 1028, height: 600, top: 0, left: 680, right: 1708, bottom: 600, x: 680, y: 0 }),
    })
    frame.append(rightbar)
    document.body.append(frame)
    topbarBtn.click()
    assert.equal(closed, 4, 'an expanded right sidebar must survive a new session intent (split stays open)')
    shellBtn.click()
    assert.equal(closed, 4, 'shell newSession must not collapse an expanded right sidebar either')
    menuItem.click()
    assert.equal(closed, 4, 'menu newSession pick must not collapse an expanded right sidebar either')
    wsBtn.click()
    assert.equal(closed, 4, 'workspace newSession must not collapse an expanded right sidebar either')

    // 7. 宿主已收起侧栏、内存状态仍停在 open：补写关闭，两端状态收敛
    frame.setAttribute('data-rightbar-collapsed', 'true')
    wsBtn.click()
    assert.equal(closed, 5, 'a stale open state must be reconciled once the host sidebar is collapsed')
  })
})
