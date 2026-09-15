import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR,
  installFullscreenCollapseSync,
  resolveFullscreenCollapse,
} from './fullscreen-collapse-sync.js'
import { CONVERSATION_COLLAPSED_ATTR } from '../conversation-collapse.js'

/**
 * 整帧夹具：左栏 + 会话列 + 右侧面板容器。面板模式由测试自行改写。
 * @param {string} panelMode `fullscreen` / `push`
 */
function fixture(panelMode) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame">
      <aside class="dshDesktopSidebarSurface"></aside>
      <main class="dshDesktopConversationSurface"></main>
      <aside class="dshDesktopRightbarSurface">
        <div class="Ng7Ira_panel" data-sidebar-right-panel="${panelMode}" data-sidebar-right-open="true"></div>
      </aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  return dom.window.document
}

test('resolveFullscreenCollapse：进入全屏收起、退出还原、不吞掉用户自己的收起偏好', () => {
  // 进入全屏：记下进入前的值并收起
  assert.deepEqual(resolveFullscreenCollapse(true, null, false), { collapsed: true, snapshot: false })
  assert.deepEqual(resolveFullscreenCollapse(true, null, true), { collapsed: true, snapshot: true })
  // 全屏中：快照保持，折叠态恒为收起
  assert.deepEqual(resolveFullscreenCollapse(true, false, true), { collapsed: true, snapshot: false })
  // 退出全屏：还原进入前的值
  assert.deepEqual(resolveFullscreenCollapse(false, false, true), { collapsed: false, snapshot: null })
  assert.deepEqual(resolveFullscreenCollapse(false, true, false), { collapsed: true, snapshot: null })
  // 不在全屏驱动中：维持现状，不碰 DOM
  assert.deepEqual(resolveFullscreenCollapse(false, null, true), { collapsed: true, snapshot: null })
  assert.deepEqual(resolveFullscreenCollapse(false, null, false), { collapsed: false, snapshot: null })
})

test('宿主全屏即收起中间会话栏，退出后还原进入前的值', async () => {
  const doc = fixture('push')
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, '分栏态默认不折叠')

  const uninstall = installFullscreenCollapseSync(doc)

  // 进入全屏（原生全屏按钮只改面板模式属性）
  root.setAttribute(CONVERSATION_COLLAPSED_ATTR, '')
  root.removeAttribute(CONVERSATION_COLLAPSED_ATTR)
  panel.setAttribute('data-sidebar-right-panel', 'fullscreen')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '全屏必须收起中间会话栏')
  assert.equal(root.hasAttribute(FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR), true, '必须留住进入前的快照')

  // 退出全屏
  panel.setAttribute('data-sidebar-right-panel', 'push')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, '退出全屏必须还原')
  assert.equal(root.hasAttribute(FULLSCREEN_COLLAPSE_SNAPSHOT_ATTR), false, '快照必须清掉')

  uninstall()
})

test('用户自己收起的会话栏，进出全屏后仍然保持收起', async () => {
  const doc = fixture('push')
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  // 用户先手动收起会话栏
  root.setAttribute(CONVERSATION_COLLAPSED_ATTR, '')
  const uninstall = installFullscreenCollapseSync(doc)

  panel.setAttribute('data-sidebar-right-panel', 'fullscreen')
  await new Promise((r) => setTimeout(r, 30))
  panel.setAttribute('data-sidebar-right-panel', 'push')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '不得顶开用户手动收起的会话栏')

  uninstall()
})

test('分栏态不动折叠键，取消安装后不再响应', async () => {
  const doc = fixture('push')
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  const uninstall = installFullscreenCollapseSync(doc)

  panel.setAttribute('data-sidebar-right-open', 'false')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, '非全屏且未收起时不得折叠')

  uninstall()
  panel.setAttribute('data-sidebar-right-panel', 'fullscreen')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, '取消安装后不得再写折叠键')
})
