import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  installWorkbenchGlobal,
  resetWorkbenchForTests,
  getConversationCollapsed,
} from '../../plugins/omnimux/src/client/workbench.js'
import {
  WORKBENCH_FOCUS,
  focusRecordForTab,
} from '../../plugins/omnimux/src/client/workbench/focus-state.js'
import {
  CONVERSATION_COLLAPSED_ATTR,
} from '../../plugins/omnimux/src/client/conversation-collapse.js'

function createSessionSwitchFixture() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame" data-desktop-mode="advanced" style="grid-template-columns: 280px minmax(0px, 1fr) 778px;">
      <aside class="dshDesktopSidebarSurface">
        <div role="treeitem" aria-selected="true">香水喷雾瓶带货视频制作</div>
      </aside>
      <main class="dshDesktopConversationSurface" style="width: 670px;">
        <div data-slot="conversation.session">
          <header class="uPhUma_header"></header>
          <div data-slot="conversation.view"></div>
        </div>
        <div data-composer-seat>
          <div data-composer-card></div>
        </div>
      </main>
      <aside class="dshDesktopRightbarSurface" data-rightbar-col="true">
        <div class="Ng7Ira_panel" data-sidebar-right-panel="push" data-sidebar-right-open="true" style="width: 778px;">
          <div role="tablist" data-dockkit-strip="pane1">
            <div role="tab" aria-selected="true" data-dockkit-tab="omnimux:media-viewer">图像生成</div>
          </div>
        </div>
      </aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  return dom.window
}

test('e2e (Issue #2352): 切换至打开了图像生成(omnimux:media-viewer)等工作台标签页的会话，未显式选过全屏前恒定保持三栏分栏，会话栏绝不自动折叠隐藏', async () => {
  const win = createSessionSwitchFixture()
  globalThis.window = win
  globalThis.document = win.document
  resetWorkbenchForTests()

  const api = installWorkbenchGlobal(win)
  let state = {
    splits: {
      kind: 'leaf',
      id: 'main',
      active: 'omnimux:media-viewer',
      tabs: [{ id: 'omnimux:media-viewer', type: 'omnimux:media-viewer' }],
    },
    width: 778,
    panelOpen: true,
  }

  const store = {
    getSnapshot: () => ({ sessionId: 'sess-media-viewer-switch', state }),
    reduce: (fn) => { state = fn(state) },
  }

  api.bind({
    betterSidebar: {
      openTab(seed) {
        state = {
          ...state,
          splits: {
            kind: 'leaf',
            id: 'main',
            active: seed.id,
            tabs: [{ id: seed.id, type: seed.type }],
          },
        }
      },
      getTab(id) { return { id } },
      getSnapshot() { return { sessionId: 'sess-media-viewer-switch', state } },
    },
    sessions: {
      list: { getSnapshot: () => ({ current: 'sess-media-viewer-switch' }) },
    },
  })

  // 1. 会话挂载（模拟从左侧切换进入该会话）
  api.attachStore(store)

  // 2. 核心断言：会话切换后，未显式选择过全屏的前提下，保持分栏，折叠标记恒定为 false
  assert.equal(getConversationCollapsed(), false, '会话切换后中间会话栏恒定不得被折叠')
  assert.equal(win.document.documentElement.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, 'DOM 根节点不得附带折叠属性')

  // 3. 检查焦点记录为非显式全屏
  const record = focusRecordForTab('sess-media-viewer-switch', 'omnimux:media-viewer')
  assert.equal(record.explicit, false, '未显式操作前 explicit 必须保持 false')
  assert.equal(record.mode, WORKBENCH_FOCUS.split, '会话切换后焦点应为分栏模式')

  // 4. 用户显式点击右上角全屏时，才允许进入全屏并折叠会话栏
  api.setFocus(WORKBENCH_FOCUS.gui, store, { viewportWidth: 1728, officialSidebarWidth: 280 }, 'omnimux:media-viewer')
  assert.equal(getConversationCollapsed(), true, '用户显式点击全屏后才允许折叠中间栏')
  const updatedRecord = focusRecordForTab('sess-media-viewer-switch', 'omnimux:media-viewer')
  assert.equal(updatedRecord.explicit, true, '显式点击后 explicit 应标记为 true')
  assert.equal(updatedRecord.mode, WORKBENCH_FOCUS.gui, '显式点击后 mode 应为 gui')

  resetWorkbenchForTests()
})
