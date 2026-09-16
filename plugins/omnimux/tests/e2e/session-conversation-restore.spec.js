import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { installFullscreenCollapseSync, FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR } from '../../src/client/workbench/fullscreen-collapse-sync.js'
import { ensureConversationVisible } from '../../src/client/workbench/ensure-conversation-visible.js'
import { CONVERSATION_COLLAPSED_ATTR } from '../../src/client/conversation-collapse.js'

function fixture(panelMode = 'fullscreen') {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame">
      <aside class="dshDesktopSidebarSurface">
        <div role="treeitem" aria-selected="false" id="sess-1">会话1</div>
      </aside>
      <main class="dshDesktopConversationSurface"></main>
      <aside class="dshDesktopRightbarSurface">
        <div class="Ng7Ira_panel" data-sidebar-right-panel="${panelMode}" data-sidebar-right-open="true">
          <button data-sidebar-right-mode="push" id="exit-btn"></button>
        </div>
      </aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  return dom.window.document
}

test('e2e: 在全屏状态下点击会话项，确定性退出全屏并展开会话栏，快照彻底清空', async () => {
  const doc = fixture('fullscreen')
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  const exitBtn = doc.getElementById('exit-btn')

  exitBtn.addEventListener('click', () => {
    panel.setAttribute('data-sidebar-right-panel', 'push')
  })

  // 1. 安装同步器，面板全屏驱动下折叠属性被置位
  const uninstall = installFullscreenCollapseSync(doc)
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '全屏下必须收起会话栏')
  assert.equal(root.hasAttribute(FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR), true, '必须记录快照属性')

  // 2. 模拟点击左侧会话项，触发 ensureConversationVisible
  let setCollapsedVal = null
  let setFocusVal = null
  const api = {
    getConversationCollapsed: () => true,
    setConversationCollapsed: (v) => { setCollapsedVal = v },
    setFocus: (mode) => { setFocusVal = mode },
  }

  ensureConversationVisible(doc, api)
  await new Promise((r) => setTimeout(r, 50))

  // 3. 断言退出全屏后会话栏完全展开，且同步器绝不再反向写回折叠！
  assert.equal(panel.getAttribute('data-sidebar-right-panel'), 'push', '必须退出全屏为 push')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, 'DOM 上的折叠必须被彻底清除')
  assert.equal(root.hasAttribute(FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR), false, '快照属性必须被彻底清空')
  assert.equal(setCollapsedVal, false, '内存状态必须置为 false')
  assert.equal(setFocusVal, 'split', '必须派发 split 恢复弹性网格宽度')

  uninstall()
})
