import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  createTabViewportReconciler,
  installTabViewportReconciler,
} from '../../plugins/omnimux/src/client/workbench/tab-viewport-reconciler.js'
import {
  CONVERSATION_COLLAPSED_ATTR,
} from '../../plugins/omnimux/src/client/conversation-collapse.js'
import {
  FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR,
} from '../../plugins/omnimux/src/client/workbench/fullscreen-collapse-sync.js'
import { WORKBENCH_FOCUS } from '../../plugins/omnimux/src/client/workbench/focus-state.js'

function createThreeColumnFixture() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame" data-desktop-mode="advanced">
      <aside class="dshDesktopSidebarSurface">
        <div role="treeitem" aria-selected="true">当前会话</div>
      </aside>
      <main class="dshDesktopConversationSurface" style="width: 670px;"></main>
      <aside class="dshDesktopRightbarSurface">
        <div class="Ng7Ira_panel" data-sidebar-right-panel="push" data-sidebar-right-open="true" style="width: 778px;">
          <div role="tablist" data-dockkit-strip="pane1">
            <div role="tab" aria-selected="true" data-dockkit-tab="tab-project">项目</div>
            <div role="tab" aria-selected="false" data-dockkit-tab="tab-canvas">创作画布</div>
            <div role="tab" aria-selected="false" data-dockkit-tab="tab-assets">资产库</div>
            <div role="tab" aria-selected="false" data-dockkit-tab="tab-auto">自动化</div>
            <div role="tab" aria-selected="false" data-dockkit-tab="tab-insp">灵感社区</div>
          </div>
          <button data-sidebar-right-mode="fullscreen" aria-label="全屏" id="mode-btn"></button>
        </div>
      </aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  return dom.window.document
}

test('e2e: 三栏分栏状态下连续切换所有工作台页签，当前状态绝对优先，恒定保持分栏且中间会话展开', async () => {
  const doc = createThreeColumnFixture()
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')

  // 模拟历史记录：多个页签曾被标记为全屏偏好
  const memoryStore = new Map([
    ['omnimux-workflow:library', { mode: WORKBENCH_FOCUS.split, explicit: true }],
    ['omnimux-workflow:canvas', { mode: WORKBENCH_FOCUS.gui, explicit: true }],
    ['omnimux-assets:library', { mode: WORKBENCH_FOCUS.gui, explicit: true }],
    ['omnimux-automation:workbench', { mode: WORKBENCH_FOCUS.gui, explicit: true }],
    ['omnimux-inspiration:library', { mode: WORKBENCH_FOCUS.gui, explicit: true }],
  ])

  let currentTab = 'omnimux-workflow:library'

  const reconciler = createTabViewportReconciler({
    getDoc: () => doc,
    getSessionId: () => 'sess-test-three-column',
    getTabId: () => currentTab,
    getFocusRecord: (_s, tab) => memoryStore.get(tab),
    persistFocus: (_s, tab, rec) => memoryStore.set(tab, rec),
    isFullscreen: () => panel.getAttribute('data-sidebar-right-panel') === 'fullscreen',
    enterFullscreen: () => {
      panel.setAttribute('data-sidebar-right-panel', 'fullscreen')
      root.setAttribute(CONVERSATION_COLLAPSED_ATTR, '')
    },
    exitFullscreen: () => {
      panel.setAttribute('data-sidebar-right-panel', 'push')
      root.removeAttribute(CONVERSATION_COLLAPSED_ATTR)
      root.removeAttribute(FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR)
    }
  })

  // 1. 初始状态：项目页签，分栏展开
  reconciler.sync()
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false)

  // 2. 依次切换到曾经全屏过的各个页签
  const targetTabs = [
    'omnimux-workflow:canvas',
    'omnimux-assets:library',
    'omnimux-automation:workbench',
    'omnimux-inspiration:library',
  ]

  for (const tab of targetTabs) {
    currentTab = tab
    reconciler.sync()

    // 关键断言：当前分栏状态绝对优先，绝不允许自动触发全屏拉伸！
    assert.equal(
      panel.getAttribute('data-sidebar-right-panel'),
      'push',
      `切换到 ${tab} 时面板必须保持分栏（push 模式），严禁自动全屏`
    )
    assert.equal(
      root.hasAttribute(CONVERSATION_COLLAPSED_ATTR),
      false,
      `切换到 ${tab} 时中间会话栏必须保持展开，绝不能被折叠隐藏`
    )
  }

  // 3. 用户主动点击全屏按钮后，正常进入全屏
  panel.setAttribute('data-sidebar-right-panel', 'fullscreen')
  root.setAttribute(CONVERSATION_COLLAPSED_ATTR, '')
  reconciler.sync()

  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true)

  // 4. 用户在全屏状态下点击退出全屏，恢复分栏
  panel.setAttribute('data-sidebar-right-panel', 'push')
  root.removeAttribute(CONVERSATION_COLLAPSED_ATTR)
  reconciler.sync()

  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false)

  reconciler.reset()
})
