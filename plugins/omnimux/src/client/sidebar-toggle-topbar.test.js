import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
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
  CONVERSATION_WIDTH_FALLBACK_PX,
  computeToggleLeftPx,
  deriveConversationWidthPx,
  ensureSidebarToggleTopbar,
  findVisibleWorkbenchPanel,
  findOfficialNewSessionButton,
  findOfficialSidebarToggle,
  getExplicitLeftCollapseIntent,
  installSidebarToggleTopbar,
  isLeftSidebarCollapsed,
  isSamePxValue,
  isShellSplitDragging,
  notePluginPanelWidthWrite,
  noteShellSplitDragObserved,
  readShellSplitPx,
  resetConversationRatioAuthorityForTests,
  resolveConversationRatio,
  setExplicitLeftCollapseIntent,
  syncLeftCollapsedHtmlAttr,
  syncNativeRightbarControls,
  syncTopbarTabClearance,
} from './sidebar-toggle-topbar.js'
import { PRODUCT_STAGE_CHROME } from './conversation-box.js'
// 拖拽分支与稳态分支的地板是同一个常量（H-3）：320 的历史常量已随比例制移除。
import { CONVERSATION_MIN_CHAT_PX, CONVERSATION_RATIO_DEFAULT } from './conversation-ratio.js'
import { bindWorkbenchDeps, resetWorkbenchHostAdapter } from './workbench/host-adapter.js'
import {
  WORKSPACE_LAYOUT_KEY,
  persistChatRatioNow,
  readChatRatio,
  resetWorkspaceLayoutStoreForTests,
} from './workbench/workspace-layout-store.js'

const here = dirname(fileURLToPath(import.meta.url))
const moduleSource = readFileSync(join(here, 'sidebar-toggle-topbar.js'), 'utf8')
const chromeSource = readFileSync(join(here, 'chrome.js'), 'utf8')
// collapsedLeftRailFallbackPx moved to the geometry submodule (Issue #545 split).
const workbenchGeometrySource = readFileSync(join(here, 'workbench/geometry.js'), 'utf8')

it('conversation fill rules leave native panel geometry to its mode owner', () => {
  const source = readFileSync(join(here, 'conversation-collapse.js'), 'utf8')
  const fillSelectors = source.split('\n').filter(line => line.includes('.dshDesktopRightbarSurface [class*="_panel"]') && line.includes(':not([data-sidebar-right-panel])'))
  assert.equal(fillSelectors.length, 2)
  for (const selector of fillSelectors) assert.ok(selector.includes(':not([data-sidebar-right-panel])'), 'native push must not acquire width:auto before fullscreen commits')
})

it('split panels keep native grid geometry while fullscreen stays right-anchored', () => {
  // 分栏态（push）的定位、宽度与过渡归外壳原生三列网格所有：外壳把面板作为第三列
  // 的网格项渲染，拖拽分割线时按列宽实时定位。把面板改成视口右锚 fixed 元素的规则
  // 必须带 fullscreen 限定，否则面板脱离网格不再跟随列宽（CDP 实测拖拽中左缘最多
  // 落后分割线 71px 黑缝），并会以自身 0.3s 宽度过渡追赶指针。
  assert.doesNotMatch(
    moduleSource,
    /\[data-sidebar-right-panel\]\[data-sidebar-right-open\]/,
    'no unqualified panel rule may force split panels out of the native grid',
  )
  const shared = moduleSource.match(/\.dshDesktopFrame \[data-sidebar-right-panel="fullscreen"\]\[data-sidebar-right-open\]\s*\{([^}]+)\}/)?.[1]
  assert.ok(shared, 'fullscreen needs the right-anchored geometry before the click')
  assert.match(shared, /position:\s*fixed\s*!important/)
  assert.match(shared, /left:\s*auto\s*!important/)
  assert.match(shared, /right:\s*0\s*!important/)
  assert.match(shared, /width var\(--ds-transition-duration-slow\) var\(--ds-ease-in-out\)/)
  assert.doesNotMatch(shared, /transition:\s*left/)
  const collapsed = moduleSource.match(/\.dshDesktopFrame\[data-sidebar-collapsed\] \[class\*="_panel"\]\[data-sidebar-right-panel="fullscreen"\]\s*\{([^}]+)\}/)?.[1]
  assert.match(collapsed, /left:\s*auto\s*!important/, 'collapsed fullscreen must stay right-anchored during width interpolation')
  assert.match(moduleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-sidebar-right-panel="fullscreen"\]\[data-sidebar-right-open\][\s\S]*?transition:\s*none\s*!important/)
})

it('stable fullscreen panel rules include borders inside the workspace span', () => {
  const stable = moduleSource.match(/^\[data-sidebar-right-panel="fullscreen"\],\n\[class\*="_panel"\]\[data-sidebar-right-panel="fullscreen"\]\s*\{([^}]+)\}/m)?.[1]
  assert.ok(stable, 'must not depend on the legacy desktop frame class')
  assert.match(stable, /box-sizing:\s*border-box\s*!important/)
  assert.match(stable, /width:\s*calc\(100vw - var\(--omnimux-sidebar-width, 280px\)\)/)
})

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

  it('strictly scopes observers to targeted containers without full-tree doc.body childList observation', () => {
    const doc = setup()
    const observed = []
    const OriginalObserver = globalThis.MutationObserver
    class SpyObserver extends OriginalObserver {
      constructor(cb) {
        super(cb)
      }
      observe(target, options) {
        observed.push({ target, options })
        super.observe(target, options)
      }
    }
    globalThis.MutationObserver = SpyObserver

    const cleanup = installSidebarToggleTopbar(doc)
    // Verify that NO observer observed doc.body with childList: true or subtree: true
    const bodyChildListObs = observed.filter(o => o.target === doc.body && o.options.childList === true)
    assert.equal(bodyChildListObs.length, 0, 'Must not observe doc.body childList')
    const bodySubtreeObs = observed.filter(o => o.target === doc.body && o.options.subtree === true)
    assert.equal(bodySubtreeObs.length, 0, 'Must not observe doc.body subtree')

    cleanup()
    globalThis.MutationObserver = OriginalObserver
  })
})

describe('topbar new-session control (collapsed only)', () => {
  it('finds official new session by aria-label', () => {
    const doc = setup()
    const btn = findOfficialNewSessionButton(doc)
    assert.ok(btn)
    assert.equal(btn.getAttribute('aria-label'), '新建会话')
  })

  it('does not treat logoRow brand button as new session', () => {
    const doc = setup(`<!doctype html><html><body>
      <div class="sidebarCol_x">
        <div class="logoRow_y">
          <button type="button" class="x-Wl6W_brand" aria-label="OmniMux">OmniMux</button>
          <button type="button" class="x-Wl6W_toggle" aria-label="收起侧边栏">T</button>
        </div>
        <button type="button" class="newSession_n" aria-label="新对话">新对话</button>
      </div>
    </body></html>`)
    const btn = findOfficialNewSessionButton(doc)
    assert.ok(btn)
    assert.equal(btn.getAttribute('aria-label'), '新对话')
    assert.match(String(btn.className), /newSession/)
    assert.doesNotMatch(String(btn.className), /brand/)
  })

  it('source never treats hashed brand class as new session', () => {
    assert.doesNotMatch(moduleSource, /x-Wl6W_brand/)
    assert.doesNotMatch(moduleSource, /button\.x-Wl6W_brand/)
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

  it('sets --omnimux-sidebar-width reflecting collapsed vs expanded rail', () => {
    const doc = setup()
    applyTopbarToggleCssVars(doc)
    assert.equal(doc.documentElement.style.getPropertyValue('--omnimux-sidebar-width'), '0px')

    doc.querySelector('[data-sidebar-collapsed]')?.removeAttribute('data-sidebar-collapsed')
    const col = doc.querySelector('[class*="sidebarCol"]')
    Object.defineProperty(col, 'offsetWidth', { value: 310, configurable: true })
    applyTopbarToggleCssVars(doc)
    assert.equal(doc.documentElement.style.getPropertyValue('--omnimux-sidebar-width'), '310px')
  })

  it('ensures rightbar chrome styles refactor fullscreen to occupy right workspace without obscuring sidebar', () => {
    const doc = setup()
    syncNativeRightbarControls(doc)
    const style = doc.getElementById('omnimux-rightbar-chrome-styles')
    assert.ok(style, 'style element must exist')
    const css = style.textContent

    // 0. Tab strip standard height and breathing padding
    assert.match(css, /\[data-dockkit-strip\]/)
    assert.match(css, /height:\s*40px\s*!important/)
    assert.match(css, /padding:\s*6px\s+6px\s+6px\s+10px\s*!important/)

    // 1. Tab title & close button ergonomics
    assert.match(css, /\[data-dockkit-tab-close\]/)
    assert.match(css, /right:\s*6px\s*!important/)
    assert.match(css, /padding-right:\s*28px\s*!important/)

    // 2. Fullscreen mode anchors to sidebar width when expanded
    assert.match(css, /\[data-sidebar-right-panel="fullscreen"\]/)
    assert.match(css, /left:\s*var\(--omnimux-sidebar-width,\s*280px\)\s*!important/)
    assert.match(css, /width:\s*calc\(100vw\s*-\s*var\(--omnimux-sidebar-width,\s*280px\)\)\s*!important/)

    // 3. Fullscreen mode expands to true full viewport when left sidebar is collapsed
    assert.match(css, /html\[data-omnimux-left-collapsed\]\s+\[data-sidebar-right-panel="fullscreen"\]/)
    assert.match(css, /left:\s*auto\s*!important/)
    assert.match(css, /width:\s*calc\(100vw\s*-\s*var\(--omnimux-sidebar-width,\s*0px\)\)\s*!important/)

    // 4. Sidebar surface remains raised above fullscreen panel
    assert.match(css, /\.dshDesktopSidebarSurface/)
    assert.match(css, /z-index:\s*35\s*!important/)

    // 5. macOS traffic lights & button cluster safe inset when collapsed + fullscreen
    assert.match(css, /padding-left:\s*var\(--omnimux-topbar-toggle-end,\s*164px\)\s*!important/)
    assert.match(css, /padding-left:\s*var\(--omnimux-topbar-toggle-end,\s*88px\)\s*!important/)
  })

  it('syncNativeRightbarControls preserves native mode and split control order', () => {
    const doc = setup(`<!doctype html><html><body>
      <div data-dockkit-strip-chrome="true">
        <button data-dockkit-split-button="true" aria-label="分栏">Split</button>
        <button data-sidebar-right-mode="push" aria-label="退出全屏">ExitFS</button>
      </div>
    </body></html>`)
    syncNativeRightbarControls(doc)
    const chrome = doc.querySelector('[data-dockkit-strip-chrome="true"]')
    const buttons = Array.from(chrome.querySelectorAll('button'))
    assert.equal(buttons[0].getAttribute('data-dockkit-split-button'), 'true')
    assert.equal(buttons[1].getAttribute('data-sidebar-right-mode'), 'push')
  })
})

describe('left rail width poisoning (issue #1618)', () => {
  const COLLAPSED_MARKER = 'data-omnimux-conversation-collapsed'

  /**
   * Frame shaped like the real desktop shell: it publishes the rail track as an
   * inline `grid-template-columns`, which survives our `!important` override.
   * @param {{ inlineTrack?: string, railWidth?: number, forced?: boolean }} [opts]
   */
  function setupRailFrame(opts = {}) {
    const style = opts.inlineTrack
      ? ` style="grid-template-columns: ${opts.inlineTrack} minmax(0px, 1fr) 0px;"`
      : ''
    const doc = setup(`<!doctype html><html><body>
      <div class="dshDesktopFrame"${style}>
        <div class="sidebarCol_x"></div>
      </div>
    </body></html>`)
    if (opts.forced) doc.documentElement.setAttribute(COLLAPSED_MARKER, '')
    const col = doc.querySelector('[class*="sidebarCol"]')
    if (opts.railWidth !== undefined) {
      Object.defineProperty(col, 'offsetWidth', { value: opts.railWidth, configurable: true })
    }
    return { doc, col }
  }

  it('ignores the reading our own grid override produced (the live failure)', () => {
    // Reproduces 2026-09-13 Dev App: rail forced to 1px by the previous write,
    // shell still asking for 280px. Sampling this reading must not write 1px.
    const { doc } = setupRailFrame({ inlineTrack: '280px', railWidth: 1, forced: true })
    const layout = computeChromeLayout(doc)
    assert.equal(layout.collapsed, false)
    assert.equal(layout.leftRailW, 280)
    applyTopbarToggleCssVars(doc)
    assert.equal(doc.documentElement.style.getPropertyValue('--omnimux-sidebar-width'), '280px')
  })

  it('tracks a genuine measurement while the override is inactive', () => {
    const { doc, col } = setupRailFrame({ inlineTrack: '280px', railWidth: 280 })
    assert.equal(computeChromeLayout(doc).leftRailW, 280)
    // User drags the rail narrower: the shell track and the reading move together.
    Object.defineProperty(col, 'offsetWidth', { value: 220, configurable: true })
    assert.equal(computeChromeLayout(doc).leftRailW, 220)
  })

  it('repairs a sub-threshold reading from the shell track when the override is off', () => {
    const { doc } = setupRailFrame({ inlineTrack: '300px', railWidth: 1 })
    assert.equal(computeChromeLayout(doc).leftRailW, 300)
  })

  it('falls back to the last good width when the shell publishes no track', () => {
    const { doc, col } = setupRailFrame({ railWidth: 260 })
    assert.equal(computeChromeLayout(doc).leftRailW, 260)
    Object.defineProperty(col, 'offsetWidth', { value: 2, configurable: true })
    assert.equal(computeChromeLayout(doc).leftRailW, 260)
  })

  it('still writes 0 for a collapsed rail', () => {
    const { doc } = setupRailFrame({ inlineTrack: '280px', railWidth: 280 })
    doc.querySelector('[class*="sidebarCol"]').closest('.dshDesktopFrame').setAttribute('data-sidebar-collapsed', '')
    assert.equal(computeChromeLayout(doc).leftRailW, 0)
  })

  it('collapses the rail to zero where the shell keeps a folded native track (issue #2077 supersedes #1618)', () => {
    // 产品决策变更：收起即完全收起。宿主收起后仍会保留一条原生窄栏（真机 90px），
    // 旧契约（#1618）要求如实镜像该窄栏，会让框架首列被右侧栏收起规则钉住，
    // 屏左留下死带；现改为收起意图优先、一律镜像 0。
    const { doc } = setupRailFrame({ inlineTrack: '56px', railWidth: 56 })
    const frame = doc.querySelector('.dshDesktopFrame')
    frame.setAttribute('data-sidebar-collapsed', '')
    const panel = doc.createElement('aside')
    panel.setAttribute('data-sidebar-right-panel', 'push')
    frame.append(panel)
    for (const frameClass of ['dshDesktopFrame', 'frame_standard']) {
      frame.className = frameClass
      for (const closed of ['true', 'false']) {
        frame.setAttribute('data-rightbar-collapsed', closed)
        applyTopbarToggleCssVars(doc)
        assert.equal(doc.documentElement.style.getPropertyValue('--omnimux-sidebar-width'), '0px')
      }
    }
    panel.remove()
    applyTopbarToggleCssVars(doc)
    assert.equal(doc.documentElement.style.getPropertyValue('--omnimux-sidebar-width'), '0px')
  })

  it('mirrors the shell rail width while the left rail is expanded (issue #2077 AC-3)', () => {
    const { doc, col } = setupRailFrame({ inlineTrack: '300px', railWidth: 300 })
    Object.defineProperty(col, 'offsetWidth', { value: 300, configurable: true })
    applyTopbarToggleCssVars(doc)
    assert.equal(doc.documentElement.style.getPropertyValue('--omnimux-sidebar-width'), '300px')
  })

  it('defers ResizeObserver writes out of the delivery cycle', () => {
    assert.match(moduleSource, /new ResizeObserverClass\(scheduleSync\)/)
  })

  it('keeps the shell rail width when rightbar closure forces the grid without hiding conversation', () => {
    const { doc, col } = setupRailFrame({ inlineTrack: '280px', railWidth: 239 })
    doc.querySelector('.dshDesktopFrame').setAttribute('data-rightbar-collapsed', 'true')
    assert.equal(doc.documentElement.hasAttribute(COLLAPSED_MARKER), false)
    for (let i = 0; i < 20; i++) {
      Object.defineProperty(col, 'offsetWidth', { value: 239 - i * 3, configurable: true })
      applyTopbarToggleCssVars(doc)
      assert.equal(doc.documentElement.style.getPropertyValue('--omnimux-sidebar-width'), '280px')
    }
  })

  it('holds the rail steady across 20 feedback iterations (loop closed)', () => {
    const { doc, col } = setupRailFrame({ inlineTrack: '280px', railWidth: 280, forced: true })
    const widths = []
    for (let i = 0; i < 20; i++) {
      applyTopbarToggleCssVars(doc)
      const written = Number.parseFloat(doc.documentElement.style.getPropertyValue('--omnimux-sidebar-width'))
      widths.push(written)
      // Emulate conversation-box.js: the measured column IS the written value.
      Object.defineProperty(col, 'offsetWidth', { value: written, configurable: true })
    }
    assert.deepEqual(Array.from(new Set(widths)), [280])
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
    assert.match(workbenchGeometrySource, /collapsedLeftRailFallbackPx|data-omnimux-sidebar-toggle-topbar/)
  })
})

describe('rightbar toggle dedupe (issue #1622)', () => {
  /**
   * 造一个最小外壳结构：原生容器 + 可选的「被本插件搬走的旧拷贝」。
   * @param {{ collapsed?: boolean, nativeInChrome?: boolean, staleCopies?: Array<'toggle'|'expand'> }} [opts]
   */
  function makeDoc(opts = {}) {
    const { collapsed = false, nativeInChrome = true, staleCopies = [] } = opts
    const doc = setup(`<!doctype html><html><body>
      <div class="dshDesktopFrame"${collapsed ? ' data-rightbar-collapsed="true"' : ''}>
        <div data-dockkit-strip-chrome="true"></div>
      </div>
    </body></html>`)
    if (nativeInChrome) {
      const native = doc.createElement('button')
      native.setAttribute('data-sidebar-right-toggle', '')
      native.setAttribute('aria-label', '收起右侧边栏')
      doc.querySelector('[data-dockkit-strip-chrome="true"]').appendChild(native)
    }
    for (const kind of staleCopies) {
      const copy = doc.createElement('button')
      copy.setAttribute(kind === 'expand' ? 'data-sidebar-right-expand' : 'data-sidebar-right-toggle', '')
      copy.setAttribute('data-original-parent', '_stripChrome')
      doc.body.appendChild(copy)
    }
    return doc
  }

  const copies = (doc) => Array.from(doc.querySelectorAll('button[data-original-parent]'))
  const controlCount = (doc) => doc.querySelectorAll('button[data-sidebar-right-toggle], button[data-sidebar-right-expand]').length

  it('does not relocate native controls when the right bar is collapsed', () => {
    const doc = makeDoc({ collapsed: true, staleCopies: ['toggle', 'expand'] })
    syncNativeRightbarControls(doc)

    assert.equal(copies(doc).length, 2, 'synchronization must not remove React-owned nodes')
    assert.equal(controlCount(doc), 3)
    assert.ok(doc.querySelector('[data-dockkit-strip-chrome] button[data-sidebar-right-toggle]'))
    assert.equal(copies(doc)[0].getAttribute('style'), null)
  })

  it('preserves framework-owned nodes until reload', () => {
    const doc = makeDoc({ collapsed: false, staleCopies: ['toggle', 'expand'] })
    syncNativeRightbarControls(doc)

    assert.equal(copies(doc).length, 2, 'legacy moved nodes require reload, not React tree mutation')
    assert.equal(controlCount(doc), 3)
    assert.ok(doc.querySelector('[data-dockkit-strip-chrome="true"] button[data-sidebar-right-toggle]'))
  })

  it('does not accumulate controls across repeated collapse/expand cycles', () => {
    const doc = makeDoc({ collapsed: true })
    const frame = doc.querySelector('.dshDesktopFrame')

    for (let round = 1; round <= 3; round += 1) {
      syncNativeRightbarControls(doc)

      // React replaces its own native control; sync must not retain a moved copy.
      doc.querySelector('[data-dockkit-strip-chrome="true"]').replaceChildren()
      const fresh = doc.createElement('button')
      fresh.setAttribute('data-sidebar-right-toggle', '')
      doc.querySelector('[data-dockkit-strip-chrome="true"]').appendChild(fresh)

      frame.removeAttribute('data-rightbar-collapsed')
      syncNativeRightbarControls(doc)

      assert.equal(copies(doc).length, 0, `第 ${round} 轮展开后不应残留拷贝`)
      assert.ok(controlCount(doc) <= 1, `第 ${round} 轮控件总数不应增长（实际 ${controlCount(doc)}）`)

      frame.setAttribute('data-rightbar-collapsed', 'true')
    }
  })
})

describe('rightbar toggle seating in the header row (issue #1664)', () => {
  /**
   * 外壳标题行同形结构：utilities 组（桌面端在这里放「打开工作目录」按钮组，
   * 也就是被固定定位按钮压住的那个胶囊）+ 最右端空槽位 corner。
   * @param {{ corner?: boolean, collapsed?: boolean }} [opts]
   */
  function makeShellDoc(opts = {}) {
    const { corner = true, collapsed = true } = opts
    const cornerHtml = corner
      ? `<div class="uPhUma_headerCorner" data-conversation-header-corner=""><div data-slot="conversation.session.header.corner" style="display: contents;"></div></div>`
      : ''
    return setup(`<!doctype html><html><body>
      <div class="dshDesktopFrame"${collapsed ? ' data-rightbar-collapsed="true"' : ''}>
        <header class="uPhUma_header">
          <div class="uPhUma_titleRow">
            <div class="uPhUma_titleCluster"><nav class="uPhUma_crumbs">会话标题</nav></div>
            <div class="uPhUma_headerUtilities"><button type="button" aria-label="在 访达 中打开工作目录">finder</button></div>
            ${cornerHtml}
          </div>
        </header>
        <div data-dockkit-strip-chrome="true">
          <button type="button" data-sidebar-right-toggle aria-label="收起右侧边栏">toggle</button>
        </div>
      </div>
    </body></html>`)
  }

  const seatedControl = (doc) => doc.querySelector('button[data-sidebar-right-toggle][data-original-parent], button[data-sidebar-right-expand][data-original-parent]')

  it('leaves the corner seat to its native expand component', () => {
    const doc = makeShellDoc()
    syncNativeRightbarControls(doc)

    const corner = doc.querySelector('[data-conversation-header-corner]')
    const kept = seatedControl(doc)
    assert.equal(kept, null, 'native toggle must not be moved into the expand seat')
    assert.equal(corner.querySelector('button'), null)
    assert.ok(doc.querySelector('[data-dockkit-strip-chrome] [data-sidebar-right-toggle]'))
  })

  it('does not insert controls into unrelated utilities when corner is absent', () => {
    const doc = makeShellDoc({ corner: false })
    syncNativeRightbarControls(doc)

    const utilities = doc.querySelector('[class*="headerUtilities"]')
    const kept = seatedControl(doc)
    assert.equal(kept, null)
    assert.equal(utilities.children.length, 1, 'Finder utility remains untouched')
    assert.ok(doc.querySelector('[data-dockkit-strip-chrome] [data-sidebar-right-toggle]'))
  })

  it('keeps native placement unchanged across expansion', () => {
    const doc = makeShellDoc()
    syncNativeRightbarControls(doc)
    assert.equal(seatedControl(doc), null, 'native controls remain in their owning tree')

    doc.querySelector('.dshDesktopFrame').removeAttribute('data-rightbar-collapsed')
    syncNativeRightbarControls(doc)

    const corner = doc.querySelector('[data-conversation-header-corner]')
    assert.equal(corner.querySelector('button'), null, '展开态不得在右上角留下控件')
    assert.ok(doc.querySelector('[data-dockkit-strip-chrome="true"] button[data-sidebar-right-toggle]'), '控件应回到原生容器')
  })
})

describe('three-column sidebar collapse proportions (issue #2074)', () => {
  it('eliminates auto track rule and allocates released space to rightbar while keeping conversation width', () => {
    assert.doesNotMatch(
      PRODUCT_STAGE_CHROME,
      /grid-template-columns:\s*0px\s+minmax\(0px,\s*1fr\)\s+auto\s*!important/,
      'auto 规则会导致右侧面板被压缩成 0px，必须彻底消除',
    )
    assert.match(
      PRODUCT_STAGE_CHROME,
      /grid-template-columns:\s*0px\s+var\(--omnimux-conversation-width,\s*380px\)\s+minmax\(0px,\s*1fr\)\s*!important/,
      '三分栏收起左侧栏时必须保持会话栏比例并将释放空间给右栏',
    )
    assert.match(
      PRODUCT_STAGE_CHROME,
      /\[data-rightbar-collapsed="true"\][\s\S]*?grid-template-columns:\s*0px\s+minmax\(0px,\s*1fr\)\s+0px\s*!important/,
      '右栏已收起时必须允许会话栏占满 100vw 全宽',
    )
  })

  it('publishes the ratio width while steady, and the authored remainder while dragging', () => {
    // 稳态：比例权威。1920 视口、左栏 280 → 舞台 1640 → round(1640 × 0.3) = 492。
    // 拖拽期：外壳 authored 几何权威 → 1920 − 280 − 1155 = 485（与 #2097 修复后逐字一致）。
    // 两个值都必须精确，任何一侧漂移都会让「拖拽跟手」或「缩放按比例」当场失真。
    const build = (dragging) => {
      const doc = setup(`<!doctype html><html><head></head><body>
      <div class="dshDesktopFrame" style="grid-template-columns:280px minmax(0px, 1fr) 1155px">
        <aside class="dshDesktopSidebarSurface" style="width: 280px;"></aside>
        <main class="dshDesktopConversationSurface"></main>
        <aside class="dshDesktopRightbarSurface"></aside>
      </div>
    </body></html>`)
      Object.defineProperty(doc.defaultView, 'innerWidth', { value: 1920, configurable: true })
      if (dragging) doc.body.setAttribute('data-dsh-sidebar-dragging', '')
      return doc
    }

    const steady = build(false)
    applyTopbarToggleCssVars(steady)
    assert.equal(
      steady.documentElement.style.getPropertyValue('--omnimux-conversation-width'),
      '492px',
      '稳态发布的必须是「舞台 × 比例」的值（AC-1：比例是唯一真源）',
    )

    const dragging = build(true)
    applyTopbarToggleCssVars(dragging)
    assert.equal(
      dragging.documentElement.style.getPropertyValue('--omnimux-conversation-width'),
      '485px',
      '拖拽期发布的必须是「视口 − 左栏 − 外壳第三轨」的当帧派生值（比例不得参与写入）',
    )
  })

  it('keeps the steady width invariant to repeated syncs (idempotent write, E-2)', () => {
    const doc = setup(`<!doctype html><html><head></head><body>
      <div class="dshDesktopFrame" style="grid-template-columns:280px minmax(0px, 1fr) 1155px">
        <aside class="dshDesktopSidebarSurface" style="width: 280px;"></aside>
        <main class="dshDesktopConversationSurface"></main>
        <aside class="dshDesktopRightbarSurface"></aside>
      </div>
    </body></html>`)
    Object.defineProperty(doc.defaultView, 'innerWidth', { value: 1920, configurable: true })

    const root = doc.documentElement
    let writes = 0
    const original = root.style.setProperty.bind(root.style)
    root.style.setProperty = (name, value, priority) => {
      if (name === '--omnimux-conversation-width') writes += 1
      return original(name, value, priority)
    }

    for (let i = 0; i < 10; i += 1) applyTopbarToggleCssVars(doc)

    assert.equal(writes, 1, `几何不变时连续 10 次同步只允许写 1 次，实测 ${writes} 次`)
    assert.equal(root.style.getPropertyValue('--omnimux-conversation-width'), '492px')
  })

  it('never derives a split width from a frame without an authored right track', () => {
    const doc = setup(`<!doctype html><html><head></head><body>
      <div class="dshDesktopFrame" style="grid-template-columns:280px minmax(0px, 1fr) 0px">
        <aside class="dshDesktopSidebarSurface"></aside>
        <main class="dshDesktopConversationSurface"></main>
        <aside class="dshDesktopRightbarSurface"></aside>
      </div>
    </body></html>`)
    Object.defineProperty(doc.defaultView, 'innerWidth', { value: 1920, configurable: true })

    applyTopbarToggleCssVars(doc)

    const written = Number.parseFloat(
      doc.documentElement.style.getPropertyValue('--omnimux-conversation-width'),
    )
    assert.ok(written < 1000, `右栏第三轨为 0 时不得派生分栏宽度，实际 ${written}`)
  })

  it('falls back to a healthy conversation width when the column cannot be measured', () => {
    const doc = setup(`<!doctype html><html><head></head><body>
      <div class="dshDesktopFrame">
        <main class="dshDesktopConversationSurface"></main>
      </div>
    </body></html>`)

    applyTopbarToggleCssVars(doc)

    const written = Number.parseFloat(
      doc.documentElement.style.getPropertyValue('--omnimux-conversation-width'),
    )
    assert.ok(Number.isFinite(written), '必须始终写入一个可用基准宽度')
    assert.ok(written >= 320, `基准宽度不得低于会话栏地板，实际 ${written}`)
  })
})

describe('derived conversation width (issue #2074 续 3 / #2608 比例制)', () => {
  /**
   * 最小外壳夹具：frame 内联栅格 + 视口宽。
   * `dragging` 打开时补上外壳拖拽标记，用于区分「稳态比例权威」与「拖拽 authored 权威」两组。
   */
  const framed = (grid, { dragging = false, viewportPx = 1920 } = {}) => {
    const dom = new JSDOM(`<!doctype html><html><body><div class="dshDesktopFrame" style="grid-template-columns:${grid}"></div></body></html>`)
    Object.defineProperty(dom.window, 'innerWidth', { value: viewportPx, configurable: true })
    if (dragging) dom.window.document.body.setAttribute('data-dsh-sidebar-dragging', '')
    return dom.window.document
  }

  it('carries no remembered baseline any more', () => {
    assert.doesNotMatch(
      moduleSource,
      /lastGoodConversationWidth|rememberConversationWidth|RIGHT_COLUMN_MIN_PX/,
      '宽度只能从外壳 authored 栅格派生，记忆式基准与取样阈值必须彻底移除',
    )
    assert.match(moduleSource, /export function deriveConversationWidthPx/, '必须导出派生函数')
  })

  it('reads the authored split from the shell inline grid, middle token included', () => {
    assert.deepEqual(readShellSplitPx(framed('280px minmax(0px, 1fr) 864px')), { rail: 280, right: 864 })
    assert.deepEqual(readShellSplitPx(framed('90px minmax(0px, 1fr) 0px')), { rail: 90, right: 0 })
  })

  it('observes the shell-authored grid so no pin can freeze the splitter', () => {
    assert.match(moduleSource, /attributeFilter:\s*\['style'\]/, '必须观察外壳内联栅格改写（AC-405）')
    assert.match(moduleSource, /bindFrameObserver\(\)/, '观察者必须挂进几何同步循环')
    const clickBody = moduleSource.slice(moduleSource.indexOf('btn.addEventListener'))
    assert.ok(
      clickBody.indexOf('truthy-sentinel') < 0 && clickBody.indexOf('rememberConversationWidth') < 0,
      '点击处理器不得再做分栏快照：派生值不依赖点击时序',
    )
  })

  describe('稳态组：比例权威（AC-1 / AC-3 / AC-4 / AC-9）', () => {
    it('derives the width from stage × ratio instead of the authored third track', () => {
      // 同一视口下外壳第三轨从 864 变到 604，稳态中栏都必须保持 492px：
      // 比例是唯一真源，authored 第三轨在稳态不参与中栏宽度。
      assert.equal(deriveConversationWidthPx(framed('280px minmax(0px, 1fr) 864px'), false, 280, 280), 492)
      assert.equal(deriveConversationWidthPx(framed('280px minmax(0px, 1fr) 604px'), false, 280, 280), 492)
    })

    it('follows the viewport at the same ratio (AC-4 缩放跟随)', () => {
      // 缩放前后比例不变：1920 → 492，2560 → 684；多出来的宽度不再全落中栏（#2316 的荒原）。
      assert.equal(
        deriveConversationWidthPx(framed('280px minmax(0px, 1fr) 1155px', { viewportPx: 1920 }), false, 280, 280),
        492,
      )
      assert.equal(
        deriveConversationWidthPx(framed('280px minmax(0px, 1fr) 1596px', { viewportPx: 2560 }), false, 280, 280),
        684,
      )
    })

    it('clamps to the 360px floor on a small viewport (AC-3)', () => {
      assert.equal(
        deriveConversationWidthPx(framed('280px minmax(0px, 1fr) 800px', { viewportPx: 1440 }), false, 280, 280),
        360,
        '1440 视口下舞台 1160 × 30% = 348 被 360px 下限抬到 360',
      )
    })

    it('keeps the same pixel width once the rail is collapsed (AC-9 保宽)', () => {
      const expanded = deriveConversationWidthPx(framed('280px minmax(0px, 1fr) 1155px'), false, 280, 280)
      const collapsed = deriveConversationWidthPx(framed('90px minmax(0px, 1fr) 1155px'), true, 0, 280)
      assert.equal(collapsed, expanded, '收起左栏不得改变中栏像素宽度，释放宽度全部进画布')
      assert.equal(collapsed, 492)
    })

    it('honours an explicit ratio from the caller (T05 持久化接线口)', () => {
      assert.equal(
        deriveConversationWidthPx(framed('280px minmax(0px, 1fr) 864px'), false, 280, 280, { chatRatio: 0.5 }),
        820,
        '舞台 1640 × 0.5 = 820',
      )
    })

    it('falls back to the default ratio when the supplied ratio is garbage', () => {
      const doc = framed('280px minmax(0px, 1fr) 864px')
      for (const bad of [Number.NaN, undefined, null, Number.POSITIVE_INFINITY]) {
        assert.equal(
          deriveConversationWidthPx(doc, false, 280, 280, { chatRatio: bad }),
          492,
          `损坏比例 ${String(bad)} 必须回落默认 0.3`,
        )
      }
    })

    it('falls back to the contract width when the viewport cannot be measured', () => {
      const dom = new JSDOM('<!doctype html><html><body></body></html>')
      Object.defineProperty(dom.window, 'innerWidth', { value: 0, configurable: true })
      assert.equal(
        deriveConversationWidthPx(dom.window.document, false, 280, 0),
        CONVERSATION_WIDTH_FALLBACK_PX,
        '首帧（视口不可测）必须发布兜底宽度，与 CSS 兜底值同源',
      )
    })
  })

  describe('拖拽组：authored 权威（防 #2097 复发）', () => {
    it('derives the native remainder while the rail is expanded', () => {
    assert.equal(
      deriveConversationWidthPx(framed('280px minmax(0px, 1fr) 864px', { dragging: true }), false, 280, 280),
      776,
    )
  })

  it('keeps that exact width once the rail is collapsed', () => {
    const doc = framed('90px minmax(0px, 1fr) 864px', { dragging: true })
    assert.equal(
      deriveConversationWidthPx(doc, true, 0, 280),
      776,
      '收起左栏不得改变会话栏宽度，释放宽度全部交给工作台（AC-101 / AC-103 / AC-403）',
    )
  })

  it('follows the native splitter while the rail is collapsed', () => {
    // 收起草稿态下拖拽 260px 后，外壳第三轨 864 → 604；旧实现把它吞掉（会话栏纹丝不动）。
    const doc = framed('90px minmax(0px, 1fr) 604px', { dragging: true })
    assert.equal(
      deriveConversationWidthPx(doc, true, 0, 280),
      1036,
      '收起态拖动分界线必须改变会话栏宽度（AC-404）',
    )
  })

  it('falls back to the contract width without an authored split', () => {
    assert.equal(
      deriveConversationWidthPx(framed('280px minmax(0px, 1fr) 0px', { dragging: true }), true, 0, 280),
      CONVERSATION_WIDTH_FALLBACK_PX,
      '拖拽期右栏第三轨为 0px（右栏收起）时不得派生会话栏宽度',
    )
  })

  it('never publishes below the conversation floor', () => {
    // 地板与稳态同源：拖拽分支若用历史 320，[320,360) 区间松手会跳回 360（H-3）。
    assert.equal(
      deriveConversationWidthPx(framed('280px minmax(0px, 1fr) 1600px', { dragging: true }), false, 280, 280),
      CONVERSATION_MIN_CHAT_PX,
    )
  })

  it('ignores the stored ratio while dragging (the #2097 authority switch)', () => {
    // 拖拽期把调用方给的比例故意设成 0.9，宽度仍必须逐帧跟随外壳 authored 几何：
    // 一旦比例参与拖拽写入路径，记忆式基准就被重新钉回轨道，#2097 原样复发。
    const doc = framed('280px minmax(0px, 1fr) 864px', { dragging: true })
    assert.equal(
      deriveConversationWidthPx(doc, false, 280, 280, { chatRatio: 0.9 }),
      776,
      '拖拽期比例只记录、不干预',
    )
  })

  describe('权威判据与幂等判据（E-2 / E-4 的底层谓词）', () => {
    it('treats the shell drag marker as the authority switch', () => {
      const idle = framed('280px minmax(0px, 1fr) 864px')
      assert.equal(isShellSplitDragging(idle), false, '无拖拽标记时必须走稳态比例权威')

      const viaBody = framed('280px minmax(0px, 1fr) 864px')
      viaBody.body.setAttribute('data-dsh-sidebar-dragging', '')
      assert.equal(isShellSplitDragging(viaBody), true, 'better-sidebar 的 body 标记必须被识别')

      const viaFrame = framed('280px minmax(0px, 1fr) 864px')
      viaFrame.querySelector('.dshDesktopFrame').setAttribute('data-dragging', '')
      assert.equal(isShellSplitDragging(viaFrame), true, '外壳 frame 的 data-dragging 必须被识别')

      assert.equal(isShellSplitDragging(null), false)
      assert.equal(isShellSplitDragging(undefined), false)
    })

    it('skips a rewrite only when the published value already matches within 1px', () => {
      assert.equal(isSamePxValue('492px', 492), true, '同值必须跳过写入（幂等）')
      assert.equal(isSamePxValue('492px', 492.4), true, '亚像素差异同样跳过')
      assert.equal(isSamePxValue('492px', 493), false, '差异达到 1px 必须重写')
      assert.equal(isSamePxValue('', 492), false, '变量尚未发布时必须写入')
      assert.equal(isSamePxValue('auto', 492), false, '非法值必须被真实数值覆盖')
      assert.equal(isSamePxValue(undefined, 492), false)
    })
  })
})

describe('老用户迁移门槛（H-1：插件自己写出的几何不得被当成用户版式）', () => {
  /** 外壳夹具：frame 内联栅格 + 视口宽；`rightbar` 由假 layout 句柄给出。 */
  const framedDoc = (grid, viewportPx = 1920) => {
    const doc = setup(`<!doctype html><html><head></head><body>
      <div class="dshDesktopFrame" style="grid-template-columns:${grid}">
        <aside class="dshDesktopSidebarSurface" style="width: 280px"></aside>
        <main class="dshDesktopConversationSurface"></main>
      </div>
    </body></html>`)
    Object.defineProperty(doc.defaultView, 'innerWidth', { value: viewportPx, configurable: true })
    return doc
  }
  const shellLayout = (rightbar) => ({ getSnapshot: () => ({ rightbar }), setRightbar() {} })
  /** 1920 视口 − 280 左栏 − 730 第三轨 = 910 中栏 ÷ 1640 舞台。 */
  const USER_RATIO = (1920 - 280 - 730) / (1920 - 280)

  beforeEach(() => {
    resetConversationRatioAuthorityForTests()
    resetWorkbenchHostAdapter()
    resetWorkspaceLayoutStoreForTests()
  })

  afterEach(() => {
    resetConversationRatioAuthorityForTests()
    resetWorkbenchHostAdapter()
    resetWorkspaceLayoutStoreForTests()
  })

  it('keeps the product default when the shell panel width was written by this plugin', () => {
    const doc = framedDoc('280px minmax(0px, 1fr) 730px')
    // 协调写先发生：外壳该字段随后变成数字，但那个数字是我们自己写出去的。
    notePluginPanelWidthWrite()
    bindWorkbenchDeps({ layout: shellLayout(730) })

    assert.equal(
      resolveConversationRatio(doc),
      CONVERSATION_RATIO_DEFAULT,
      '全新用户必须拿到产品默认 30%（规格 §10）',
    )
    assert.equal(readChatRatio(), null, '自证读数不得被反推并落盘（INV-4 / 禁改清单第 6、8 条）')
  })

  it('latches the first shell reading, so a later plugin write cannot reopen migration', () => {
    const doc = framedDoc('280px minmax(0px, 1fr) 730px')
    // 第 1 帧：外壳尚未持有面板宽 → 判定「本会话没有用户版式」。
    bindWorkbenchDeps({ layout: shellLayout(null) })
    assert.equal(resolveConversationRatio(doc), CONVERSATION_RATIO_DEFAULT)

    // 第 2 帧：协调写把该字段写成数字；缓存被一次真实落盘失效、键又被删掉之后，
    // 迁移判据仍必须回答「没有用户版式」——不得反推、不得落盘（这正是 H-1 的时序）。
    bindWorkbenchDeps({ layout: shellLayout(730) })
    persistChatRatioNow(CONVERSATION_RATIO_DEFAULT)
    doc.defaultView.localStorage.removeItem(WORKSPACE_LAYOUT_KEY)

    assert.equal(resolveConversationRatio(doc), CONVERSATION_RATIO_DEFAULT)
    assert.equal(readChatRatio(), null, '插件写出的数字不构成迁移前提')
  })

  it('still migrates a layout the user wrote themselves (positive control)', () => {
    const doc = framedDoc('280px minmax(0px, 1fr) 730px')
    bindWorkbenchDeps({ layout: shellLayout(730) })

    const ratio = resolveConversationRatio(doc)
    assert.ok(
      Math.abs(ratio - USER_RATIO) <= 0.005,
      `老用户版式必须按「中栏 ÷ 舞台」反推保留：期望 ${USER_RATIO}，实测 ${ratio}`,
    )
    assert.ok(
      Math.abs(readChatRatio() - USER_RATIO) <= 0.005,
      '迁移结果必须落盘（AC-11 老用户不突变）',
    )
  })

  it('allows migration once the user has dragged the divider themselves', () => {
    const doc = framedDoc('280px minmax(0px, 1fr) 730px')
    // 插件先写过面板宽（字段被污染），但本会话确实观察到用户拖拽 → 允许反推。
    notePluginPanelWidthWrite()
    noteShellSplitDragObserved()
    bindWorkbenchDeps({ layout: shellLayout(730) })

    assert.ok(Math.abs(resolveConversationRatio(doc) - USER_RATIO) <= 0.005)
  })

  it('re-resolves after a real write so both sides keep the same ratio (M-3 / H-4)', () => {
    const doc = framedDoc('280px minmax(0px, 1fr) 730px')
    bindWorkbenchDeps({ layout: shellLayout(null) })
    assert.equal(resolveConversationRatio(doc), CONVERSATION_RATIO_DEFAULT)

    // 别处写入新比例：缓存必须失效，否则中栏按新比例、右栏按旧比例，三栏之和当场破裂。
    persistChatRatioNow(0.42)
    assert.equal(resolveConversationRatio(doc), 0.42)
  })
})
})

