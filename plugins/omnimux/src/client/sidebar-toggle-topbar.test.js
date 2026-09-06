import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LEFT_COLLAPSED_HTML_ATTR,
  SIDEBAR_TOGGLE_TOPBAR_ATTR,
  SIDEBAR_TOGGLE_TOPBAR_HTML_ATTR,
  TOPBAR_NEW_SESSION_ATTR,
  TOPBAR_MACOS_INSET_PX,
  TOPBAR_TOGGLE_GAP_PX,
  TOPBAR_TOGGLE_LEFT_PX,
  TOPBAR_TOGGLE_RIGHT_MARGIN_PX,
  TOPBAR_TOGGLE_SIZE_PX,
  TOPBAR_TOGGLE_Z_INDEX,
  applyTopbarToggleCssVars,
  computeChromeLayout,
  computeTabBarPadLeft,
  computeToggleLeftPx,
  ensureSidebarToggleTopbar,
  findVisibleWorkbenchPanel,
  findOfficialNewSessionButton,
  findOfficialSidebarToggle,
  getExplicitLeftCollapseIntent,
  installSidebarToggleTopbar,
  isLeftSidebarCollapsed,
  setExplicitLeftCollapseIntent,
  syncLeftCollapsedHtmlAttr,
  syncTopbarTabClearance,
} from './sidebar-toggle-topbar.js'
import { PRODUCT_STAGE_CHROME } from './conversation-box.js'

const here = dirname(fileURLToPath(import.meta.url))
const moduleSource = readFileSync(join(here, 'sidebar-toggle-topbar.js'), 'utf8')
const chromeSource = readFileSync(join(here, 'chrome.js'), 'utf8')
const workbenchSource = readFileSync(join(here, 'workbench.js'), 'utf8')

/** @type {JSDOM | undefined} */
let dom
const previous = {
  window: globalThis.window,
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  MutationObserver: globalThis.MutationObserver,
}

afterEach(() => {
  dom?.window.close()
  dom = undefined
  globalThis.window = previous.window
  globalThis.document = previous.document
  globalThis.HTMLElement = previous.HTMLElement
  if (previous.MutationObserver === undefined) delete globalThis.MutationObserver
  else globalThis.MutationObserver = previous.MutationObserver
})

/**
 * @param {string} [html]
 */
function setup(html) {
  dom = new JSDOM(html || `<!doctype html><html><body>
    <div class="frame_abc" data-sidebar-collapsed>
      <div class="sidebarCol_x">
        <div class="logoRow_y">
          <button type="button" class="iconButton_z toggle_w" aria-label="打开侧边栏">T</button>
        </div>
        <button type="button" class="newSession_n" aria-label="新建会话">新会话</button>
      </div>
    </div>
    <div class="tabBar_n" data-dsh-better-sidebar>
      <div class="tabList_m"></div>
    </div>
  </body></html>`, { url: 'http://127.0.0.1/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.MutationObserver = dom.window.MutationObserver
  return dom.window.document
}

describe('sidebar-toggle-topbar selectors', () => {
  it('finds toggle by zh aria-label', () => {
    const doc = setup()
    const btn = findOfficialSidebarToggle(doc)
    assert.ok(btn)
    assert.equal(btn.getAttribute('aria-label'), '打开侧边栏')
  })

  it('finds toggle by en Collapse sidebar aria-label', () => {
    const doc = setup(`<!doctype html><html><body>
      <button type="button" aria-label="Collapse sidebar">C</button>
    </body></html>`)
    const btn = findOfficialSidebarToggle(doc)
    assert.ok(btn)
    assert.equal(btn.getAttribute('aria-label'), 'Collapse sidebar')
  })

  it('falls back to logoRow toggle class fragment (no hash)', () => {
    const doc = setup(`<!doctype html><html><body>
      <div class="sidebarCol_hash">
        <div class="logoRow_hash">
          <button type="button" class="iconButton_hash toggle_hash">x</button>
        </div>
      </div>
    </body></html>`)
    const btn = findOfficialSidebarToggle(doc)
    assert.ok(btn)
    assert.match(String(btn.className), /toggle/)
  })

  it('source never hardcodes CSS-module hashes', () => {
    assert.doesNotMatch(moduleSource, /_9I8crW/)
    assert.doesNotMatch(moduleSource, /nArs4W/)
    assert.doesNotMatch(moduleSource, /_6PxbcG/)
  })
})

describe('ensureSidebarToggleTopbar', () => {
  it('marks html + button and writes CSS vars', () => {
    const doc = setup()
    const btn = ensureSidebarToggleTopbar(doc)
    assert.ok(btn)
    assert.equal(btn.getAttribute(SIDEBAR_TOGGLE_TOPBAR_ATTR), '1')
    assert.equal(doc.documentElement.hasAttribute(SIDEBAR_TOGGLE_TOPBAR_HTML_ATTR), true)
    assert.equal(
      doc.documentElement.style.getPropertyValue('--omnimux-topbar-toggle-left'),
      `${TOPBAR_TOGGLE_LEFT_PX}px`,
    )
    // Collapsed cluster: toggle + gap + new-session + gap
    const expectedEnd = TOPBAR_TOGGLE_LEFT_PX + TOPBAR_TOGGLE_SIZE_PX + TOPBAR_TOGGLE_GAP_PX
      + TOPBAR_TOGGLE_SIZE_PX + TOPBAR_TOGGLE_GAP_PX
    assert.equal(
      doc.documentElement.style.getPropertyValue('--omnimux-topbar-toggle-end'),
      `${expectedEnd}px`,
    )
    assert.equal(
      doc.documentElement.style.getPropertyValue('--omnimux-topbar-new-session-left'),
      `${TOPBAR_TOGGLE_LEFT_PX + TOPBAR_TOGGLE_SIZE_PX + TOPBAR_TOGGLE_GAP_PX}px`,
    )
  })

  it('injects the toggle into the tabBar anchor and returns it', () => {
    const doc = setup()
    const btn = ensureSidebarToggleTopbar(doc)
    assert.ok(btn)
    const tabBar = doc.querySelector('[class*="tabBar"]')
    assert.ok(tabBar, 'fixture has a tabBar anchor')
    assert.ok(tabBar.contains(btn), 'injected button should live inside the tabBar anchor')
  })

  it('sets no-drag and z-index >= 50 on the toggle', () => {
    const doc = setup()
    const btn = ensureSidebarToggleTopbar(doc)
    assert.ok(btn)
    const region = btn.style.getPropertyValue('-webkit-app-region')
      || btn.style.webkitAppRegion
      || btn.getAttribute('style')
      || ''
    assert.match(String(region), /no-drag/)
    const zRaw = btn.style.getPropertyValue('z-index') || btn.style.zIndex || ''
    const zMatch = String(btn.getAttribute('style') || '').match(/z-index:\s*(\d+)/)
    const z = Number(zRaw) || Number(zMatch?.[1] || 0)
    assert.ok(z >= TOPBAR_TOGGLE_Z_INDEX, `expected z-index >= ${TOPBAR_TOGGLE_Z_INDEX}, got ${z}`)
  })

  it('hides the official trigger and mirrors collapse onto html', () => {
    const doc = setup()
    ensureSidebarToggleTopbar(doc)
    const official = doc.querySelector('button[aria-label="打开侧边栏"]')
    assert.ok(official, 'official toggle present')
    assert.equal(official.getAttribute('data-omnimux-original-sidebar-toggle'), '1')
    assert.equal(doc.documentElement.hasAttribute(LEFT_COLLAPSED_HTML_ATTR), true)
    // aria on the injected button follows collapse state
    const btn = doc.querySelector('[data-omnimux-sidebar-toggle-topbar="1"]')
    assert.equal(btn?.getAttribute('aria-label'), '打开侧边栏')
  })

  it('official finder never returns our injected button (no click recursion)', () => {
    const doc = setup()
    const injected = ensureSidebarToggleTopbar(doc)
    assert.ok(injected)
    const found = findOfficialSidebarToggle(doc)
    assert.ok(found)
    assert.notEqual(found, injected)
  })

  it('mirrors frame data-sidebar-collapsed onto html', () => {
    const doc = setup()
    ensureSidebarToggleTopbar(doc)
    assert.equal(doc.documentElement.hasAttribute(LEFT_COLLAPSED_HTML_ATTR), true)
    assert.equal(isLeftSidebarCollapsed(doc), true)

    doc.querySelector('[data-sidebar-collapsed]')?.removeAttribute('data-sidebar-collapsed')
    syncLeftCollapsedHtmlAttr(doc)
    assert.equal(doc.documentElement.hasAttribute(LEFT_COLLAPSED_HTML_ATTR), false)
  })

  it('applyTopbarToggleCssVars accepts custom geometry', () => {
    const doc = setup()
    // Collapsed fixture expands end by one extra control (size+gap).
    applyTopbarToggleCssVars(doc, { left: 80, size: 36, gap: 8 })
    assert.equal(doc.documentElement.style.getPropertyValue('--omnimux-topbar-toggle-end'), '168px')
    applyTopbarToggleCssVars(doc, { left: 80, size: 36, gap: 8, end: 124 })
    assert.equal(doc.documentElement.style.getPropertyValue('--omnimux-topbar-toggle-end'), '124px')
  })

  it('computeToggleLeftPx: collapsed -> top-left, expanded -> sidebar top-right', () => {
    const doc = setup()
    // collapsed fixture (data-sidebar-collapsed on frame)
    assert.equal(computeToggleLeftPx(doc), TOPBAR_TOGGLE_LEFT_PX)
    // expand: remove collapse attr and give the sidebar a real width
    doc.querySelector('[data-sidebar-collapsed]')?.removeAttribute('data-sidebar-collapsed')
    const col = doc.querySelector('[class*="sidebarCol"]')
    assert.ok(col)
    col.style.width = '280px'
    Object.defineProperty(col, 'offsetWidth', { value: 280, configurable: true })
    const expected = 280 - TOPBAR_TOGGLE_SIZE_PX - TOPBAR_TOGGLE_RIGHT_MARGIN_PX
    assert.equal(computeToggleLeftPx(doc), expected)
  })

  it('explicit intent locks collapsed state even if AppFrame frame drops attr during drag', () => {
    const doc = setup()
    ensureSidebarToggleTopbar(doc)
    assert.equal(doc.documentElement.hasAttribute(LEFT_COLLAPSED_HTML_ATTR), true)

    // User explicitly collapsed
    setExplicitLeftCollapseIntent(true)

    // Simulate AppFrame momentarily dropping data-sidebar-collapsed during 1024px crossing while dragging
    doc.querySelector('[data-sidebar-collapsed]')?.removeAttribute('data-sidebar-collapsed')
    doc.body.setAttribute('data-dsh-sidebar-dragging', '')

    syncLeftCollapsedHtmlAttr(doc)
    assert.equal(doc.documentElement.hasAttribute(LEFT_COLLAPSED_HTML_ATTR), true, 'must preserve collapsed intent during drag')

    doc.body.removeAttribute('data-dsh-sidebar-dragging')
    setExplicitLeftCollapseIntent(null)
  })
})

describe('computeChromeLayout tab pad (overlap, not collapsed boolean)', () => {
  // toggle + new-session cluster while collapsed
  const toggleEndCollapsed = TOPBAR_TOGGLE_LEFT_PX + TOPBAR_TOGGLE_SIZE_PX + TOPBAR_TOGGLE_GAP_PX
    + TOPBAR_TOGGLE_SIZE_PX + TOPBAR_TOGGLE_GAP_PX

  function mockRect(el, { left, width, height = 900 }) {
    el.getBoundingClientRect = () => ({
      x: left, y: 0, left, top: 0, width, height, right: left + width, bottom: height,
    })
  }

  it('uses the semantic panel host and ignores bottom, hidden, and unrelated panels', () => {
    const doc = setup(`<!doctype html><html><body>
      <div data-dsh-better-sidebar>
        <div id="unrelated" class="settings_panel"></div>
        <div data-dsh-panel-host="true">
          <div id="bottom" class="nArs4W_panel nArs4W_bottomPanel"></div>
          <div id="hidden" class="nArs4W_panelHidden"></div>
          <div id="workbench" class="nArs4W_panel" data-omnimux-workbench-panel>
            <div class="nArs4W_panelBody">
              <div class="nArs4W_workbench">
                <div class="nArs4W_pane"><div class="nArs4W_tabBar"></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body></html>`)
    for (const id of ['unrelated', 'bottom', 'hidden', 'workbench']) {
      mockRect(doc.getElementById(id), { left: id === 'workbench' ? 640 : 0, width: 1088 })
    }
    assert.equal(findVisibleWorkbenchPanel(doc), doc.getElementById('workbench'))
    assert.equal(computeTabBarPadLeft(doc), 0)
  })

  it('A expanded+gui: panel at 280, pad 0 (toggle lives on the rail)', () => {
    const doc = setup(`<!doctype html><html><body>
      <div class="frame_abc">
        <div class="sidebarCol_x"></div>
      </div>
      <div data-dsh-better-sidebar>
        <div data-dsh-panel-host="true">
          <div class="nArs4W_panel">
            <div class="nArs4W_tabBar"></div>
          </div>
        </div>
      </div>
    </body></html>`)
    const col = doc.querySelector('[class*="sidebarCol"]')
    Object.defineProperty(col, 'offsetWidth', { value: 280, configurable: true })
    mockRect(col, { left: 0, width: 280 })
    mockRect(doc.querySelector('[class*="panel"]'), { left: 280, width: 1448 })
    const layout = computeChromeLayout(doc)
    assert.equal(layout.collapsed, false)
    assert.equal(layout.toggleLeft, 280 - TOPBAR_TOGGLE_SIZE_PX - TOPBAR_TOGGLE_RIGHT_MARGIN_PX)
    assert.equal(layout.tabPadLeft, 0)
    assert.equal(computeTabBarPadLeft(doc), 0)
  })

  it('B collapsed+gui fill: panel at 0, pad = toggleEnd (labels clear the button)', () => {
    const doc = setup(`<!doctype html><html><body>
      <div class="frame_abc" data-sidebar-collapsed>
        <div class="sidebarCol_x"></div>
      </div>
      <div data-dsh-better-sidebar>
        <div data-dsh-panel-host="true">
          <div class="nArs4W_panel">
            <div class="nArs4W_tabBar"></div>
          </div>
        </div>
      </div>
    </body></html>`)
    mockRect(doc.querySelector('[class*="panel"]'), { left: 0, width: 1728 })
    const layout = computeChromeLayout(doc)
    assert.equal(layout.collapsed, true)
    assert.equal(layout.toggleLeft, TOPBAR_TOGGLE_LEFT_PX)
    assert.equal(layout.tabPadLeft, toggleEndCollapsed)
  })

  it('D collapsed+split: panel starts right of toggle, pad 0 (must not shove tabs)', () => {
    const doc = setup(`<!doctype html><html><body>
      <div class="frame_abc" data-sidebar-collapsed>
        <div class="sidebarCol_x"></div>
      </div>
      <div data-dsh-better-sidebar>
        <div data-dsh-panel-host="true">
          <div class="nArs4W_panel">
            <div class="nArs4W_tabBar"></div>
          </div>
        </div>
      </div>
    </body></html>`)
    mockRect(doc.querySelector('[class*="panel"]'), { left: 640, width: 1088 })
    const layout = computeChromeLayout(doc)
    assert.equal(layout.collapsed, true)
    assert.equal(layout.tabPadLeft, 0)
  })

  it('stale gui (collapsed but panel still at 280) keeps pad 0 so tabs do not jump further right', () => {
    const doc = setup(`<!doctype html><html><body>
      <div class="frame_abc" data-sidebar-collapsed>
        <div class="sidebarCol_x"></div>
      </div>
      <div data-dsh-better-sidebar>
        <div data-dsh-panel-host="true">
          <div class="nArs4W_panel">
            <div class="nArs4W_tabBar"></div>
          </div>
        </div>
      </div>
    </body></html>`)
    mockRect(doc.querySelector('[class*="panel"]'), { left: 280, width: 1448 })
    assert.equal(computeTabBarPadLeft(doc), 0)
  })

  it('writes --omnimux-tabbar-pad-left from layout', () => {
    const doc = setup(`<!doctype html><html><body>
      <div class="frame_abc" data-sidebar-collapsed>
        <div class="sidebarCol_x"></div>
      </div>
      <div data-dsh-better-sidebar>
        <div data-dsh-panel-host="true">
          <div class="nArs4W_panel">
            <div class="nArs4W_tabBar"></div>
          </div>
        </div>
      </div>
    </body></html>`)
    mockRect(doc.querySelector('[class*="panel"]'), { left: 0, width: 1728 })
    applyTopbarToggleCssVars(doc)
    assert.equal(
      doc.documentElement.style.getPropertyValue('--omnimux-tabbar-pad-left'),
      `${toggleEndCollapsed}px`,
    )
  })
})

describe('topbar host layout', () => {
  for (const { name, mode, platform, inset } of [
    { name: 'ordinary browser', inset: 8 },
    { name: 'macOS desktop', mode: 'extended', platform: 'darwin', inset: 84 },
    { name: 'Windows desktop', mode: 'extended', platform: 'win32', inset: 8 },
    { name: 'platform without desktop host', platform: 'darwin', inset: 8 },
  ]) {
    it(`${name} reserves its gutter and only overlaps the full-width workbench`, () => {
      const doc = setup()
      if (mode) doc.body.setAttribute('data-dsh-desktop-mode', mode)
      if (platform) doc.body.setAttribute('data-dsh-desktop-platform', platform)
      const host = doc.createElement('div')
      host.setAttribute('data-dsh-panel-host', 'true')
      const panel = doc.createElement('div')
      panel.className = 'test_panel'
      host.append(panel)
      doc.querySelector('[data-dsh-better-sidebar]').append(host)
      let panelLeft = 0
      panel.getBoundingClientRect = () => ({ left: panelLeft, width: 768 - panelLeft, height: 600 })
      assert.equal(computeChromeLayout(doc).toggleLeft, inset)
      assert.equal(computeChromeLayout(doc).tabPadLeft, inset + 80)
      panelLeft = 400
      assert.equal(computeChromeLayout(doc).tabPadLeft, 0)

      doc.querySelector('[data-sidebar-collapsed]').removeAttribute('data-sidebar-collapsed')
      Object.defineProperty(doc.querySelector('[class*="sidebarCol"]'), 'offsetWidth', { value: 280 })
      assert.equal(computeChromeLayout(doc).toggleLeft, 240)
      assert.equal(computeChromeLayout(doc).newSessionLeft, null)
    })
  }

  it('updates an installed layout when desktop host markers arrive or disappear', async () => {
    const doc = setup()
    const cleanup = installSidebarToggleTopbar(doc)
    const inset = () => doc.documentElement.style.getPropertyValue('--omnimux-topbar-toggle-left')
    assert.equal(inset(), '8px')
    doc.body.setAttribute('data-dsh-desktop-mode', 'extended')
    doc.body.setAttribute('data-dsh-desktop-platform', 'darwin')
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(inset(), `${TOPBAR_MACOS_INSET_PX}px`)
    doc.body.removeAttribute('data-dsh-desktop-mode')
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(inset(), '8px')
    cleanup()
  })
})

describe('right topbar tab clearance', () => {
  it('tracks the visible control cluster without padding other split panes', () => {
    const doc = setup(`<!doctype html><html><body>
      <div data-dsh-better-sidebar>
        <div class="test_toggleCluster"></div>
        <div data-dsh-panel-host="true">
          <div class="test_panel">
            <div><div id="left" class="test_tabBar"></div></div>
            <div><div id="right" class="test_tabBar"></div></div>
            <div><div id="lower" class="test_tabBar"></div></div>
          </div>
        </div>
        <div class="test_bottomPanel"><div id="bottom" class="test_tabBar"></div></div>
      </div>
    </body></html>`)
    const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })
    doc.querySelector('.test_panel').getBoundingClientRect = () => rect(0, 0, 981, 900)
    let controls = rect(901, 4, 72, 32)
    const cluster = doc.querySelector('.test_toggleCluster')
    cluster.getBoundingClientRect = () => controls
    doc.getElementById('left').getBoundingClientRect = () => rect(0, 0, 490, 41)
    doc.getElementById('right').getBoundingClientRect = () => rect(491, 0, 490, 41)
    doc.getElementById('lower').getBoundingClientRect = () => rect(0, 450, 981, 41)
    for (const id of ['left', 'right', 'lower']) {
      const bar = doc.getElementById(id)
      bar.parentElement.getBoundingClientRect = bar.getBoundingClientRect
    }
    const padding = id => doc.getElementById(id).style.getPropertyValue('--omnimux-tabbar-pad-right')

    syncTopbarTabClearance(doc)
    assert.equal(padding('right'), '88px')
    assert.equal(padding('left'), '0px')
    assert.equal(padding('lower'), '0px')
    assert.equal(padding('bottom'), '')
    controls = rect(861, 4, 112, 32)
    syncTopbarTabClearance(doc)
    assert.equal(padding('right'), '128px', 'the conditional conversation control must also clear the tab strip')
    controls = rect(901, 4, 72, 32)
    syncTopbarTabClearance(doc)
    assert.equal(padding('right'), '88px', 'hidden controls must not leave an empty slot')
    doc.getElementById('right').parentElement.getBoundingClientRect = () => rect(940, 0, 41, 400)
    doc.getElementById('right').getBoundingClientRect = () => rect(940, 0, 150, 41)
    syncTopbarTabClearance(doc)
    syncTopbarTabClearance(doc)
    assert.equal(padding('right'), '41px', 'tab overflow must not feed back into the next overlap calculation')
    cluster.remove()
    syncTopbarTabClearance(doc)
    assert.equal(padding('right'), '0px')
  })
})

describe('installSidebarToggleTopbar', () => {
  it('cleanup removes markers and vars', () => {
    const doc = setup()
    const cleanup = installSidebarToggleTopbar(doc)
    const tabBar = doc.createElement('div')
    tabBar.className = 'test_tabBar'
    tabBar.style.setProperty('--omnimux-tabbar-pad-right', '88px')
    doc.querySelector('[data-dsh-better-sidebar]').append(tabBar)
    assert.equal(doc.documentElement.hasAttribute(SIDEBAR_TOGGLE_TOPBAR_HTML_ATTR), true)
    assert.ok(doc.querySelector(`[${TOPBAR_NEW_SESSION_ATTR}="1"]`))
    cleanup()
    assert.equal(doc.documentElement.hasAttribute(SIDEBAR_TOGGLE_TOPBAR_HTML_ATTR), false)
    assert.equal(doc.documentElement.hasAttribute(LEFT_COLLAPSED_HTML_ATTR), false)
    assert.equal(doc.querySelector(`[${SIDEBAR_TOGGLE_TOPBAR_ATTR}="1"]`), null)
    assert.equal(doc.querySelector(`[${TOPBAR_NEW_SESSION_ATTR}="1"]`), null)
    assert.equal(tabBar.style.getPropertyValue('--omnimux-tabbar-pad-right'), '')
  })
})

describe('topbar new-session control (collapsed only)', () => {
  it('finds official new session by aria-label', () => {
    const doc = setup()
    const btn = findOfficialNewSessionButton(doc)
    assert.ok(btn)
    assert.equal(btn.getAttribute('aria-label'), '新建会话')
  })

  it('injects new-session when collapsed and removes when expanded', () => {
    const doc = setup()
    ensureSidebarToggleTopbar(doc)
    const injected = doc.querySelector(`[${TOPBAR_NEW_SESSION_ATTR}="1"]`)
    assert.ok(injected)
    assert.equal(injected.getAttribute('aria-label'), '新建会话')
    const tabBar = doc.querySelector('[class*="tabBar"]')
    assert.ok(tabBar.contains(injected))

    // Expand: drop collapse attr and re-ensure
    doc.querySelector('[data-sidebar-collapsed]')?.removeAttribute('data-sidebar-collapsed')
    setExplicitLeftCollapseIntent(false)
    ensureSidebarToggleTopbar(doc)
    assert.equal(doc.querySelector(`[${TOPBAR_NEW_SESSION_ATTR}="1"]`), null)
    setExplicitLeftCollapseIntent(null)
  })

  it('click opens coordinator menu anchored to the topbar control', () => {
    const doc = setup()
    // setup() fixture is collapsed with an official newSession button; coordinator
    // openCollapsedNewMenuAt succeeds (session-only menu when no project row).
    ensureSidebarToggleTopbar(doc)
    const btn = doc.querySelector(`[${TOPBAR_NEW_SESSION_ATTR}="1"]`)
    assert.ok(btn)
    btn.getBoundingClientRect = () => ({
      x: 124, y: 4, left: 124, top: 4, width: 32, height: 32, right: 156, bottom: 36,
    })
    // Official rail button is off-screen / zeroed when left rail is collapsed.
    const official = findOfficialNewSessionButton(doc)
    if (official) {
      official.getBoundingClientRect = () => ({
        x: 0, y: 90, left: 0, top: 90, width: 0, height: 0, right: 0, bottom: 90,
      })
    }
    btn.click()
    const menu = doc.getElementById('omnimux-sidebar-new-menu')
    assert.ok(menu, 'menu should open under the visible topbar control')
    assert.equal(menu.style.left, '124px')
    assert.equal(menu.style.top, '42px')
  })

  it('computeChromeLayout exposes newSessionLeft only when collapsed', () => {
    const doc = setup()
    const collapsed = computeChromeLayout(doc)
    assert.equal(collapsed.collapsed, true)
    assert.equal(
      collapsed.newSessionLeft,
      TOPBAR_TOGGLE_LEFT_PX + TOPBAR_TOGGLE_SIZE_PX + TOPBAR_TOGGLE_GAP_PX,
    )
    assert.equal(
      collapsed.toggleEnd,
      TOPBAR_TOGGLE_LEFT_PX + TOPBAR_TOGGLE_SIZE_PX + TOPBAR_TOGGLE_GAP_PX
        + TOPBAR_TOGGLE_SIZE_PX + TOPBAR_TOGGLE_GAP_PX,
    )

    doc.querySelector('[data-sidebar-collapsed]')?.removeAttribute('data-sidebar-collapsed')
    const col = doc.querySelector('[class*="sidebarCol"]')
    Object.defineProperty(col, 'offsetWidth', { value: 280, configurable: true })
    const expanded = computeChromeLayout(doc)
    assert.equal(expanded.collapsed, false)
    assert.equal(expanded.newSessionLeft, null)
    assert.equal(
      expanded.toggleEnd,
      expanded.toggleLeft + TOPBAR_TOGGLE_SIZE_PX + TOPBAR_TOGGLE_GAP_PX,
    )
  })
})

describe('chrome CSS contracts (conversation-box PRODUCT_STAGE_CHROME)', () => {
  it('styles the real panel-host hierarchy without touching hidden or bottom panels', () => {
    const doc = setup(`<!doctype html><html data-omnimux-sidebar-toggle-topbar><head>
      <style>.nArs4W_tabBarPlus{width:22px;height:22px;border-radius:5px}</style>
    </head><body><div data-dsh-better-sidebar>
      <div data-dsh-panel-host="true">
        <div class="nArs4W_panel nArs4W_panelHidden"><div class="nArs4W_tabBar"><button id="hidden-plus" class="nArs4W_tabBarPlus"></button></div></div>
        <div class="nArs4W_panel nArs4W_bottomPanel"><div class="nArs4W_tabBar"><button id="bottom-plus" class="nArs4W_tabBarPlus"></button></div></div>
        <div class="nArs4W_panel" data-omnimux-workbench-panel>
          <div class="nArs4W_panelBody"><div class="nArs4W_workbench"><div class="nArs4W_pane">
            <div id="workbench-tabbar" class="nArs4W_tabBar"><span class="nArs4W_tabList"><button id="workbench-plus" class="nArs4W_tabBarPlus"><svg id="workbench-plus-icon"></svg></button></span></div>
          </div></div></div>
        </div>
      </div>
    </div></body></html>`)
    const style = doc.createElement('style')
    style.textContent = PRODUCT_STAGE_CHROME
    doc.head.append(style)
    const computed = id => doc.defaultView.getComputedStyle(doc.getElementById(id))

    assert.equal(computed('workbench-plus').width, 'var(--omnimux-topbar-toggle-size)')
    assert.equal(computed('workbench-plus').height, 'var(--omnimux-topbar-toggle-size)')
    assert.equal(computed('workbench-plus').borderRadius, '8px')
    assert.equal(computed('workbench-plus-icon').width, '16px')
    assert.equal(computed('workbench-plus-icon').height, '16px')
    assert.equal(computed('hidden-plus').width, '22px')
    assert.equal(computed('bottom-plus').width, '22px')
    assert.equal(computed('workbench-tabbar').paddingLeft, 'var(--omnimux-tabbar-pad-left,0px)')
    assert.equal(
      computed('workbench-tabbar').height,
      'calc(var(--omnimux-topbar-toggle-size) + 2 * var(--omnimux-topbar-toggle-top) + 1px)',
    )
  })

  it('includes topbar toggle fixed geometry, visual-0 rail, tabBar padding, blue dot', () => {
    assert.match(PRODUCT_STAGE_CHROME, /data-omnimux-sidebar-toggle-topbar/)
    assert.match(PRODUCT_STAGE_CHROME, /--omnimux-topbar-toggle-end/)
    assert.match(PRODUCT_STAGE_CHROME, /position:\s*fixed/)
    assert.match(PRODUCT_STAGE_CHROME, /-webkit-app-region:\s*no-drag/)
    assert.match(PRODUCT_STAGE_CHROME, /z-index:\s*9999/)
    assert.match(PRODUCT_STAGE_CHROME, /data-sidebar-collapsed\][^{]*\[class\*="sidebarCol"\]/)
    assert.match(PRODUCT_STAGE_CHROME, /width:\s*0\s*!important/)
    // Collapsed rail zeroes the first frame grid track so centerCol has balanced margins
    assert.match(PRODUCT_STAGE_CHROME, /grid-template-columns:\s*0px\s+minmax\(0px,\s*1fr\)\s+0px\s*!important/)
    assert.match(PRODUCT_STAGE_CHROME, /\[class\*="tabBar"\]/)
    assert.match(PRODUCT_STAGE_CHROME, /padding-left:\s*var\(--omnimux-tabbar-pad-left/)
    assert.match(PRODUCT_STAGE_CHROME, /data-omnimux-left-collapsed/)
    // Must not pad every tabBar (would shove tabBarPlus / bottom strip).
    assert.doesNotMatch(
      PRODUCT_STAGE_CHROME,
      /data-omnimux-left-collapsed\] \[class\*="tabBar"\]/,
    )
    // Collapsed: session title shares the top row with traffic lights + toggle.
    // Pad the real <header> under the slot host (wrapper DIV), not only the host.
    assert.match(
      PRODUCT_STAGE_CHROME,
      /data-omnimux-left-collapsed\] \[data-slot="conversation\.session\.header"\] header/,
    )
    assert.match(PRODUCT_STAGE_CHROME, /padding-left:\s*var\(--omnimux-topbar-toggle-end\)/)
    assert.match(PRODUCT_STAGE_CHROME, /padding-top:\s*var\(--omnimux-topbar-toggle-top/)
    assert.match(PRODUCT_STAGE_CHROME, /data-omnimux-topbar-new-session/)
    assert.match(PRODUCT_STAGE_CHROME, /--omnimux-topbar-new-session-left/)
    assert.match(PRODUCT_STAGE_CHROME, /::after/)
    assert.match(PRODUCT_STAGE_CHROME, /--dsw-alias-/)
    assert.doesNotMatch(PRODUCT_STAGE_CHROME, /#[0-9a-fA-F]{3,8}\b/)
  })
})

describe('hard constraints', () => {
  it('never imports or calls setConversationCollapsed', () => {
    assert.doesNotMatch(moduleSource, /setConversationCollapsed/)
    assert.doesNotMatch(moduleSource, /from ['"]\.\/conversation-collapse/)
    assert.doesNotMatch(moduleSource, /from ['"]\.\/chat-toggle/)
    assert.doesNotMatch(moduleSource, /import\s+.*conversation-collapse/)
    assert.doesNotMatch(moduleSource, /import\s+.*chat-toggle/)
  })

  it('chrome.js mounts installSidebarToggleTopbar with cleanup', () => {
    assert.match(chromeSource, /installSidebarToggleTopbar/)
    assert.match(chromeSource, /sidebar-toggle-topbar\.js/)
  })

  it('workbench collapsed fallback respects topbar feature (0)', () => {
    assert.match(workbenchSource, /collapsedLeftRailFallbackPx|data-omnimux-sidebar-toggle-topbar/)
  })
})
