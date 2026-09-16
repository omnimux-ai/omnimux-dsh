import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  createTabViewportReconciler,
  installTabViewportReconciler,
  ensureHealthySplitWidth,
} from '../../src/client/workbench/tab-viewport-reconciler.js'
import {
  installFullscreenCollapseSync,
  FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR,
} from '../../src/client/workbench/fullscreen-collapse-sync.js'
import { CONVERSATION_COLLAPSED_ATTR, ensureConversationCollapseChrome } from '../../src/client/conversation-collapse.js'
import { WORKBENCH_FOCUS } from '../../src/client/workbench/focus-state.js'

function createDomFixture(panelMode = 'push') {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame">
      <aside class="dshDesktopSidebarSurface">
        <div role="treeitem" aria-selected="false">会话1</div>
      </aside>
      <main class="dshDesktopConversationSurface"></main>
      <aside class="dshDesktopRightbarSurface">
        <div class="Ng7Ira_panel" data-sidebar-right-panel="${panelMode}" data-sidebar-right-open="true">
          <div class="_tabBar_17p4l_130">
            <div data-dockkit-tab="omnimux-workflow:library" data-active="true" class="_tabActive_17p4l_243">项目</div>
            <div data-dockkit-tab="omnimux-assets:library" data-active="false">资产库</div>
          </div>
          <button data-sidebar-right-mode="${panelMode === 'fullscreen' ? 'push' : 'fullscreen'}" aria-label="${panelMode === 'fullscreen' ? '分栏' : '全屏'}"></button>
        </div>
      </aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  return dom.window.document
}

test('AC-1 & AC-2: 工作台默认全屏，手动点击退出全屏后会话栏立即恢复展开且不留死锁属性', async () => {
  const doc = createDomFixture('fullscreen')
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')

  const uninstallSync = installFullscreenCollapseSync(doc)
  const uninstallReconciler = installTabViewportReconciler(doc)

  await new Promise(r => setTimeout(r, 40))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '全屏下会话栏应被收起')

  // 用户点击右上角退出全屏（分栏）
  panel.setAttribute('data-sidebar-right-panel', 'push')
  const modeBtn = doc.querySelector('button[data-sidebar-right-mode]')
  modeBtn.setAttribute('data-sidebar-right-mode', 'fullscreen')

  await new Promise(r => setTimeout(r, 60))

  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, '退出全屏进入分栏必须彻底清除折叠属性')
  assert.equal(root.hasAttribute(FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR), false, '退出全屏必须清除快照属性')

  uninstallSync()
  uninstallReconciler()
})

test('AC-3: 用户退出全屏偏好被记住，跨 Tab 切换后切回保持分栏且会话栏展开', async () => {
  const doc = createDomFixture('fullscreen')
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')

  const memoryStore = new Map()
  let currentTab = 'omnimux-workflow:library'

  const reconciler = createTabViewportReconciler({
    getDoc: () => doc,
    getSessionId: () => 'sess-1',
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

  // 1. 初态项目为全屏（当存在显式全屏偏好记录时）
  memoryStore.set('omnimux-workflow:library', { mode: WORKBENCH_FOCUS.gui, explicit: true })
  reconciler.sync()
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen')

  // 2. 用户在项目页手动切为分栏
  panel.setAttribute('data-sidebar-right-panel', 'push')
  reconciler.sync()
  assert.equal(memoryStore.get('omnimux-workflow:library')?.mode, WORKBENCH_FOCUS.split, '应持久化记录 split')

  // 3. 切换至资产库（显式配置全屏偏好时恢复全屏）
  memoryStore.set('omnimux-assets:library', { mode: WORKBENCH_FOCUS.gui, explicit: true })
  currentTab = 'omnimux-assets:library'
  reconciler.sync()
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen', '资产库显式配置全屏时恢复全屏')

  // 4. 切回项目页（应自动恢复分栏，且会话栏展开）
  currentTab = 'omnimux-workflow:library'
  reconciler.sync()
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push', '切回项目页应自动恢复分栏')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, '会话栏必须展开')

  reconciler.reset()
})

test('AC-4: 分栏面板 CSS 铺满保证与健康分栏宽度保底机制', async () => {
  const doc = createDomFixture('push')
  const styleEl = ensureConversationCollapseChrome(doc)
  assert.match(styleEl.textContent, /\.dshDesktopRightbarSurface \[class\*="_panel"\]:not\(\[data-sidebar-right-panel="fullscreen"\]\)/)
  assert.match(styleEl.textContent, /width:100%!important/)

  // 测试健康宽度自愈：当 layout.rightbar 被极端压到 300px 时，自愈恢复到健康值（≥500px）
  let currentRightbar = 300
  const mockLayout = {
    getSnapshot: () => ({ rightbar: currentRightbar }),
    setRightbar: (w) => { currentRightbar = w },
  }

  // 挂载到 frame 的 __reactFiber 上模拟原生桌面端
  const frame = doc.querySelector('.dshDesktopFrame')
  frame.__reactFiber$test = {
    memoizedProps: { layout: mockLayout },
  }

  ensureHealthySplitWidth(doc)
  assert.ok(currentRightbar >= 500, `自愈后宽度必须恢复到健康黄金比例(>=500px)，实际: ${currentRightbar}`)
})

test('AC-5: 从分栏页面跨页面切回偏好全屏的页面，即便会话选中也必须确定性恢复全屏', async () => {
  const doc = createDomFixture('push')
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  // 模拟当前会话项选中且会话可见
  const sessionItem = doc.querySelector('[role="treeitem"]')
  sessionItem.setAttribute('aria-selected', 'true')
  root.removeAttribute(CONVERSATION_COLLAPSED_ATTR)

  let currentTab = 'omnimux-workflow:library'
  const memoryStore = new Map([
    ['omnimux-workflow:library', { mode: WORKBENCH_FOCUS.split, explicit: true }],
    ['omnimux-assets:library', { mode: WORKBENCH_FOCUS.gui, explicit: true }]
  ])

  const reconciler = createTabViewportReconciler({
    getDoc: () => doc,
    getSessionId: () => 'sess-1',
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
    }
  })

  // 1. 初次同步保持当前会话展示
  reconciler.sync()
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push')

  // 2. 用户切换至资产库（明确跨 Tab 切换）
  currentTab = 'omnimux-assets:library'
  reconciler.sync()

  // 必须确定性调和进入全屏，不得被会话选中态误杀
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'fullscreen', '切入偏好全屏页面时必须恢复全屏')

  reconciler.reset()
})

test('AC-6: 自动化 Tab 身份收敛与侧栏激活仲裁验证 (Issue #2046)', async () => {
  const { resolveSidebarActiveTarget, mapNativeTabKeyToRailTab } = await import('../../src/client/workbench/sidebar-activation.js')
  const AUTO = 'omnimux-automation:workbench'

  assert.equal(mapNativeTabKeyToRailTab(AUTO), AUTO, 'Tab ID 应直接映射为合规的左栏 tabId')
  assert.equal(mapNativeTabKeyToRailTab('自动化'), AUTO, 'Tab Title 自动化 应映射为合规的左栏 tabId')
  assert.equal(mapNativeTabKeyToRailTab(' 自动化 '), AUTO, '带空格的 Tab Title 应容错映射')

  const verdict = resolveSidebarActiveTarget({
    selectedSessionRows: 0,
    conversationVisible: false,
    panelExpanded: true,
    activeTabKey: AUTO,
  })
  assert.equal(verdict.winner, 'row', '自动化页面激活时侧边栏应胜出激活行')
  assert.equal(verdict.tabId, AUTO, '胜出的 tabId 必须严格等于自动化 Tab ID')
})

test('AC-7: 右侧边栏展开不再强制伪全屏，未显式配置时默认并排分栏 (Issue #2056)', async () => {
  const doc = createDomFixture('push')
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  const enters = []
  const exits = []

  let currentTab = 'omnimux-workflow:library'
  const memoryStore = new Map()

  const reconciler = createTabViewportReconciler({
    getDoc: () => doc,
    getSessionId: () => 'sess-1',
    getTabId: () => currentTab,
    getFocusRecord: (_s, tab) => memoryStore.get(tab) || { mode: WORKBENCH_FOCUS.gui, explicit: false },
    persistFocus: (_s, tab, rec) => memoryStore.set(tab, rec),
    isFullscreen: () => panel.getAttribute('data-sidebar-right-panel') === 'fullscreen',
    enterFullscreen: () => {
      enters.push(currentTab)
      panel.setAttribute('data-sidebar-right-panel', 'fullscreen')
      root.setAttribute(CONVERSATION_COLLAPSED_ATTR, '')
    },
    exitFullscreen: () => {
      exits.push(currentTab)
      panel.setAttribute('data-sidebar-right-panel', 'push')
      root.removeAttribute(CONVERSATION_COLLAPSED_ATTR)
    },
  })

  // 1. 未记录显式偏好的工作台页签，展开面板时保持分栏，不得进入全屏
  reconciler.sync()
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push', '初始展开时必须保持分栏')
  assert.deepEqual(enters, [], '不得自动调用 enterFullscreen')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, '会话栏保持展开')

  // 2. 即便左侧列表没有任何选中会话，同样保持分栏，绝不受左侧列表渲染状态干扰
  const sessionItem = doc.querySelector('[role="treeitem"]')
  if (sessionItem) sessionItem.removeAttribute('aria-selected')
  reconciler.sync()
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push', '无选中会话时同样必须保持分栏')
  assert.deepEqual(enters, [], '无选中会话时不得推入全屏')

  reconciler.reset()
})




