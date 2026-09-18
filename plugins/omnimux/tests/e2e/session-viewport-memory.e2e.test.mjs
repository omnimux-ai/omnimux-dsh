import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { createTabViewportReconciler, installTabViewportReconciler } from '../../src/client/workbench/tab-viewport-reconciler.js'
import {
  CONVERSATION_COLLAPSED_ATTR,
  loadConversationCollapsed,
  persistConversationCollapsed,
  resetConversationCollapseForTests,
} from '../../src/client/conversation-collapse.js'
import { bindWorkbenchDeps } from '../../src/client/workbench/host-adapter.js'

function fixture(panelMode = 'push', initialTab = 'omnimux-workflow:library') {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame">
      <aside class="dshDesktopSidebarSurface">
        <div role="treeitem" aria-selected="true" id="sess-1-item">会话1</div>
        <div role="treeitem" aria-selected="false" id="sess-2-item">会话2</div>
      </aside>
      <main class="dshDesktopConversationSurface"></main>
      <aside class="dshDesktopRightbarSurface">
        <div class="Ng7Ira_panel" data-sidebar-right-panel="${panelMode}" data-sidebar-right-open="true">
          <div role="tablist">
            <div role="tab" aria-selected="true" data-dockkit-tab="${initialTab}">${initialTab}</div>
            <div role="tab" aria-selected="false" data-dockkit-tab="omnimux:media-viewer">图像生成</div>
          </div>
          <button type="button" class="Ng7Ira_iconButton" data-sidebar-right-mode="${panelMode === 'fullscreen' ? 'push' : 'fullscreen'}" id="mode-btn"></button>
        </div>
      </aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  return dom.window
}

test('e2e: 同一会话内全屏后切换任意页签，视窗模式绝对锁定全屏，中间会话栏绝不弹出', async () => {
  resetConversationCollapseForTests()
  const win = fixture('push', 'omnimux-workflow:library')
  const doc = win.document
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  const button = doc.getElementById('mode-btn')

  button.addEventListener('click', () => {
    const isFs = panel.getAttribute('data-sidebar-right-panel') === 'fullscreen'
    panel.setAttribute('data-sidebar-right-panel', isFs ? 'push' : 'fullscreen')
    button.setAttribute('data-sidebar-right-mode', isFs ? 'fullscreen' : 'push')
  })

  let activeSession = 'session-1'
  let activeTabKind = 'omnimux-workflow:library'

  bindWorkbenchDeps({
    sidebarRight: {
      isExpanded: () => true,
      active: () => ({ kind: activeTabKind }),
    },
    sessions: {
      list: { getSnapshot: () => ({ current: activeSession }) },
    },
  })

  const uninstall = installTabViewportReconciler(doc)
  await new Promise((r) => setTimeout(r, 40))

  // 1. 初态：分栏
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false)

  // 2. 用户在 session-1 中点击全屏
  button.click()
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '会话栏收起折叠')
  assert.equal(loadConversationCollapsed('session-1'), true, 'session-1 已持久化记录全屏偏好')

  // 3. 在同一会话内切换到「图像生成」页签
  activeTabKind = 'omnimux:media-viewer'
  // 派发点击或属性变更
  doc.querySelector('[data-dockkit-tab="omnimux:media-viewer"]').setAttribute('aria-selected', 'true')
  await new Promise((r) => setTimeout(r, 40))

  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen', '切换至图像生成页签必须保持全屏')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '中间会话栏绝对不被顶开展开')

  // 4. 切回「项目」页签
  activeTabKind = 'omnimux-workflow:library'
  doc.querySelector('[data-dockkit-tab="omnimux:media-viewer"]').setAttribute('aria-selected', 'false')
  await new Promise((r) => setTimeout(r, 40))

  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen', '切回项目页签必须继续保持全屏')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '中间会话栏依然保持折叠')

  uninstall()
  resetConversationCollapseForTests()
  bindWorkbenchDeps({ sidebarRight: null, sessions: null })
})

test('e2e: 跨会话切换时，不同会话独立保持其视窗模式，切回精准还原全屏', async () => {
  resetConversationCollapseForTests()
  const win = fixture('push', 'omnimux-workflow:library')
  const doc = win.document
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  const button = doc.getElementById('mode-btn')

  button.addEventListener('click', () => {
    const isFs = panel.getAttribute('data-sidebar-right-panel') === 'fullscreen'
    panel.setAttribute('data-sidebar-right-panel', isFs ? 'push' : 'fullscreen')
    button.setAttribute('data-sidebar-right-mode', isFs ? 'fullscreen' : 'push')
  })

  let activeSession = 'session-A'
  let activeTabKind = 'omnimux-workflow:library'

  bindWorkbenchDeps({
    sidebarRight: {
      isExpanded: () => true,
      active: () => ({ kind: activeTabKind }),
    },
    sessions: {
      list: { getSnapshot: () => ({ current: activeSession }) },
    },
  })

  const uninstall = installTabViewportReconciler(doc)
  await new Promise((r) => setTimeout(r, 40))

  // 1. session-A 进入全屏
  button.click()
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true)

  // 2. 切换至 session-B（该会话未选过全屏，应为分栏）
  activeSession = 'session-B'
  // 触发 DOM 变更通知
  doc.getElementById('sess-2-item').setAttribute('aria-selected', 'true')
  await new Promise((r) => setTimeout(r, 60))

  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push', 'session-B 自动呈现分栏')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, 'session-B 会话栏自动展开')

  // 3. 切换回 session-A
  activeSession = 'session-A'
  doc.getElementById('sess-1-item').setAttribute('aria-selected', 'true')
  await new Promise((r) => setTimeout(r, 60))

  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen', 'session-A 自动精准还原为全屏')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, 'session-A 会话栏自动恢复折叠')

  uninstall()
  resetConversationCollapseForTests()
  bindWorkbenchDeps({ sidebarRight: null, sessions: null })
})
