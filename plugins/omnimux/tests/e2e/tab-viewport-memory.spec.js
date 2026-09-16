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
function fixture(panelMode = 'push', initialTab = 'omnimux-assets:library') {
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

test('e2e: 首次打开插件页面默认全屏展开，面板模式自动调和为 fullscreen', async () => {
  const win = fixture('push', 'omnimux-assets:library')
  const doc = win.document
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  const button = doc.getElementById('mode-btn')

  // 模拟原生点击全屏行为：更新属性与按钮 mode
  button.addEventListener('click', () => {
    panel.setAttribute('data-sidebar-right-panel', 'fullscreen')
    button.setAttribute('data-sidebar-right-mode', 'push')
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

  // 默认期望全屏，宿主调和器检测到面板为 push，自动触发点击全屏按钮
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen', '首次打开插件页面必须自动全屏展开')

  uninstall()
  bindWorkbenchDeps({ sidebarRight: null, sessions: null })
})

test('e2e: 用户收起全屏后精准记录分栏偏好，切其他页面全屏，切回自动还原分栏', async () => {
  const win = fixture('fullscreen', 'omnimux-assets:library')
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

  // 1. 用户点击右上角收起全屏按钮（进入分栏）
  button.click()
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push', '点击后应进入分栏模式')
  assert.equal(focusRecordForTab('session-e2e', 'omnimux-assets:library').mode, WORKBENCH_FOCUS.split, '资产库应被精准记录为分栏模式')

  // 2. 用户切换到「灵感社区」（未调整过，默认期望全屏）
  activeTab = { kind: 'omnimux-inspiration:library' }
  const tabEl = doc.querySelector('[role="tab"]')
  tabEl.setAttribute('data-dockkit-tab', 'omnimux-inspiration:library')
  await new Promise((r) => setTimeout(r, 60))

  // 验证灵感社区自动进入全屏
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen', '切换到新页面必须自动恢复为全屏')

  // 3. 用户切回「资产库」（曾设为分栏）
  activeTab = { kind: 'omnimux-assets:library' }
  tabEl.setAttribute('data-dockkit-tab', 'omnimux-assets:library')
  await new Promise((r) => setTimeout(r, 60))

  // 验证资产库自动恢复为分栏，展示会话栏
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push', '切回曾分栏的页面必须自动还原为分栏并展示会话栏')

  uninstall()
  bindWorkbenchDeps({ sidebarRight: null, sessions: null })
})

test('e2e: chrome 装配层确实安装并回收了 installTabViewportReconciler', () => {
  assert.match(CHROME_SOURCE, /installTabViewportReconciler\(\)/)
  assert.match(CHROME_SOURCE, /unsubTabReconciler\?\.\(\)/)
})
