import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { installTabViewportReconciler } from '../../src/client/workbench/tab-viewport-reconciler.js'
import { WORKBENCH_FOCUS, focusRecordForTab, persistSessionFocus } from '../../src/client/workbench/focus-state.js'
import { bindWorkbenchDeps } from '../../src/client/workbench/host-adapter.js'

const here = dirname(fileURLToPath(import.meta.url))
const CHROME_SOURCE = readFileSync(join(here, '..', '..', 'src', 'client', 'chrome.js'), 'utf8')

/**
 * 宿主整帧夹具：包含左侧栏、会话列、右侧面板、模式控制按钮与 Tabbar。
 * @param {string} panelMode
 * @param {string} initialTab
 */
function fixture(panelMode = 'fullscreen', initialTab = 'omnimux-assets:library') {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame">
      <aside class="dshDesktopSidebarSurface"></aside>
      <main class="dshDesktopConversationSurface"><div data-conversation-scroll></div></main>
      <aside class="dshDesktopRightbarSurface">
        <div class="Ng7Ira_panel" data-sidebar-right-panel="${panelMode}" data-sidebar-right-open="true">
          <div role="tablist">
            <div role="tab" aria-selected="true" data-dockkit-tab="${initialTab}">${initialTab}</div>
          </div>
          <button data-sidebar-right-mode="${panelMode === 'fullscreen' ? 'push' : 'fullscreen'}" id="mode-btn"></button>
        </div>
      </aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  const win = dom.window
  globalThis.window = win
  globalThis.document = win.document
  return win
}

test('e2e: 已全屏的插件页面调和器不得拆回三栏（Issue #2516 图 1）', async () => {
  const win = fixture('fullscreen', 'omnimux-assets:library')
  const doc = win.document
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  const button = doc.getElementById('mode-btn')

  button.addEventListener('click', () => {
    panel.setAttribute('data-sidebar-right-panel', 'push')
    button.setAttribute('data-sidebar-right-mode', 'fullscreen')
  })

  let activeTab = { kind: 'omnimux-assets:library' }
  bindWorkbenchDeps({
    sidebarRight: {
      isExpanded: () => true,
      active: () => activeTab,
    },
    sessions: {
      list: { getSnapshot: () => ({ current: 'session-e2e' }) },
    },
  })

  const uninstall = installTabViewportReconciler(doc)

  await new Promise((r) => setTimeout(r, 60))
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen', '已全屏的右侧页面不得被调和器拆回三栏')

  uninstall()
  bindWorkbenchDeps({ sidebarRight: null, sessions: null })
})

test('e2e: 用户在分栏下切换页面当前状态优先保持分栏，主动全屏才进入全屏', async () => {
  const win = fixture('push', 'omnimux-assets:library')
  const doc = win.document
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  const button = doc.getElementById('mode-btn')

  button.addEventListener('click', () => {
    const currentMode = panel.getAttribute('data-sidebar-right-panel')
    const nextMode = currentMode === 'fullscreen' ? 'push' : 'fullscreen'
    panel.setAttribute('data-sidebar-right-panel', nextMode)
    button.setAttribute('data-sidebar-right-mode', nextMode === 'fullscreen' ? 'push' : 'fullscreen')
  })

  let activeTab = { kind: 'omnimux-assets:library' }
  bindWorkbenchDeps({
    sidebarRight: {
      isExpanded: () => true,
      active: () => activeTab,
    },
    sessions: {
      list: { getSnapshot: () => ({ current: 'session-e2e' }) },
    },
  })

  const uninstall = installTabViewportReconciler(doc)
  await new Promise((r) => setTimeout(r, 60))

  // 1. 初态为分栏
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push')

  // 2. 用户在分栏状态下切换到「灵感社区」（当前状态优先，绝不触发全屏）
  activeTab = { kind: 'omnimux-inspiration:library' }
  const tabEl = doc.querySelector('[role="tab"]')
  tabEl.setAttribute('data-dockkit-tab', 'omnimux-inspiration:library')
  await new Promise((r) => setTimeout(r, 60))

  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push', '切换到新页面当前分栏状态优先，保持分栏')

  // 3. 用户主动点击全屏按钮，进入全屏
  button.click()
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen', '用户主动点击全屏按钮进入全屏')

  // 4. 用户点击退出全屏，回到分栏
  button.click()
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push', '用户主动退出全屏回到分栏')

  uninstall()
  bindWorkbenchDeps({ sidebarRight: null, sessions: null })
})

test('e2e: chrome 装配层确实安装并回收了 installTabViewportReconciler', () => {
  assert.match(CHROME_SOURCE, /installTabViewportReconciler\(\)/)
  assert.match(CHROME_SOURCE, /unsubTabReconciler\?\.\(\)/)
})
