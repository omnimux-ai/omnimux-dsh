import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { ensureConversationVisible } from '../../src/client/workbench/ensure-conversation-visible.js'
import {
  findHostFullscreenExitButton,
  exitHostRightSidebarFullscreen,
  HOST_FULLSCREEN_PANEL_SELECTOR,
} from '../../src/client/workbench/host-fullscreen.js'
import { createTabViewportReconciler } from '../../src/client/workbench/tab-viewport-reconciler.js'
import { WORKBENCH_FOCUS } from '../../src/client/workbench/focus-state.js'

/**
 * 宿主整帧夹具：包含左侧栏会话项、中间会话列、右侧全屏面板与原生按钮。
 */
function fixture(panelMode = 'fullscreen') {
  const dom = new JSDOM(`<!doctype html><html data-omnimux-conversation-collapsed data-omnimux-fullscreen-collapse-snapshot><body>
    <div class="dshDesktopFrame">
      <aside class="dshDesktopSidebarSurface">
        <div role="treeitem" aria-selected="false" id="session-row-1">会话1</div>
      </aside>
      <main class="dshDesktopConversationSurface" style="width: 0px;"></main>
      <aside class="dshDesktopRightbarSurface">
        <div class="Ng7Ira_panel" data-sidebar-right-panel="${panelMode}" data-sidebar-right-open="true">
          <!-- 内部窗格分栏按钮：aria-label 为 分栏，带有 data-dockkit-split-button -->
          <button type="button" class="_iconButton_17p4l_408" aria-label="分栏" data-dockkit-split-button="pane1" id="pane-split-btn"></button>
          <!-- 官方模式切换按钮：退出全屏 -->
          <button type="button" class="Ng7Ira_iconButton" aria-label="退出全屏" data-sidebar-right-mode="push" id="exit-btn"></button>
        </div>
      </aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  const win = dom.window
  globalThis.window = win
  globalThis.document = win.document
  return win
}

test('e2e: 退出全屏按钮精准定位，排除 data-dockkit-split-button 干扰', () => {
  const win = fixture('fullscreen')
  const doc = win.document
  const exitBtn = findHostFullscreenExitButton(doc)
  assert.equal(exitBtn?.id, 'exit-btn', '必须定位到真实退出全屏按钮，严禁误选内部窗格切分按钮')
})

test('e2e: 退出全屏并彻底清除会话栏折叠属性与快照', () => {
  const win = fixture('fullscreen')
  const doc = win.document
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  const exitBtn = doc.getElementById('exit-btn')

  exitBtn.addEventListener('click', () => {
    panel.setAttribute('data-sidebar-right-panel', 'push')
  })

  let setCollapsedVal = null
  let setFocusVal = null
  const api = {
    getConversationCollapsed: () => false, // 模拟内存返回 false 但 DOM 有属性的脱节现场
    setConversationCollapsed: (v) => { setCollapsedVal = v },
    setFocus: (mode) => { setFocusVal = mode },
  }

  const res = ensureConversationVisible(doc, api)
  assert.equal(res.hostFullscreenExited, true, '宿主必须执行退出全屏动作')
  assert.equal(res.collapseCleared, true, '必须清除折叠状态')
  assert.equal(root.hasAttribute('data-omnimux-conversation-collapsed'), false, 'DOM 上的折叠属性必须被物理清除')
  assert.equal(root.hasAttribute('data-omnimux-fullscreen-collapse-snapshot'), false, '全屏快照必须被清除')
  assert.equal(setCollapsedVal, false, '内存状态必须同步置为 false')
  assert.equal(setFocusVal, 'split', '必须调用 setFocus split 恢复弹性宽度')
})

test('e2e: 会话项选中且会话可见时，调和器绝对不得将工作台反向推回全屏', () => {
  const win = fixture('push')
  const doc = win.document
  const root = doc.documentElement
  root.removeAttribute('data-omnimux-conversation-collapsed')
  
  // 模拟用户点击会话行后会话行被选中
  const sessionRow = doc.getElementById('session-row-1')
  sessionRow.setAttribute('aria-selected', 'true')

  const enters = []
  const reconciler = createTabViewportReconciler({
    getDoc: () => doc,
    getSessionId: () => 's-1',
    getTabId: () => 'omnimux-market:plaza', // 偏好为 gui 的工作台
    getFocusRecord: () => ({ mode: WORKBENCH_FOCUS.gui }),
    isFullscreen: () => false,
    enterFullscreen: () => { enters.push('entered') },
    exitFullscreen: () => {},
  })

  // 面板为 push，虽然当前 Tab 偏好是 gui，但会话处于选中展示态，严禁进入全屏！
  reconciler.sync()
  assert.equal(enters.length, 0, '会话优先：绝对不得反向推进全屏')
})
