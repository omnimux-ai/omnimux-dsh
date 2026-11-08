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

test('resolveFullscreenCollapse：进入全屏收起、退出恢复展开，杜绝死锁', () => {
  // 进入全屏：记下进入前的值并收起
  assert.deepEqual(resolveFullscreenCollapse(true, null, false), { collapsed: true, snapshot: false })
  assert.deepEqual(resolveFullscreenCollapse(true, null, true), { collapsed: true, snapshot: true })
  // 全屏中：快照保持，折叠态恒为收起
  assert.deepEqual(resolveFullscreenCollapse(true, false, true), { collapsed: true, snapshot: false })
  // 退出全屏（分栏模式）：一律恢复展开，清空快照
  assert.deepEqual(resolveFullscreenCollapse(false, false, true), { collapsed: false, snapshot: null })
  assert.deepEqual(resolveFullscreenCollapse(false, true, false), { collapsed: false, snapshot: null })
  assert.deepEqual(resolveFullscreenCollapse(false, null, true), { collapsed: false, snapshot: null })
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

test('进出全屏后恢复分栏展开，杜绝死锁在折叠态', async () => {
  const doc = fixture('push')
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  // 即使进入全屏前 DOM 上有折叠标记
  root.setAttribute(CONVERSATION_COLLAPSED_ATTR, '')
  const uninstall = installFullscreenCollapseSync(doc)

  panel.setAttribute('data-sidebar-right-panel', 'fullscreen')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '全屏下必须收起')

  // 用户点击退出全屏（分栏）
  panel.setAttribute('data-sidebar-right-panel', 'push')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, '退出全屏进入分栏必须恢复展开')

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

test('隐藏会话遗留的 fullscreen 面板不得折叠当前中间栏（rc.3 多会话挂载）', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame">
      <aside class="dshDesktopSidebarSurface"></aside>
      <main class="dshDesktopConversationSurface"></main>
      <aside class="dshDesktopRightbarSurface">
        <div class="Ng7Ira_session" hidden>
          <div class="Ng7Ira_panel" data-sidebar-right-panel="fullscreen" data-sidebar-right-open="true"></div>
        </div>
        <div class="Ng7Ira_session">
          <div class="Ng7Ira_panel" data-sidebar-right-panel="push" data-sidebar-right-open="true"></div>
        </div>
      </aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  const doc = dom.window.document
  const root = doc.documentElement
  const uninstall = installFullscreenCollapseSync(doc)
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, '隐藏会话的全屏面板不得折叠当前中间栏')
  uninstall()
})

test('会话包装的 hidden 翻转也会触发全屏判定重算', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame">
      <aside class="dshDesktopSidebarSurface"></aside>
      <main class="dshDesktopConversationSurface"></main>
      <aside class="dshDesktopRightbarSurface">
        <div class="Ng7Ira_session" data-sidebar-right-session="session-old">
          <div class="Ng7Ira_panel" data-sidebar-right-panel="fullscreen" data-sidebar-right-open="true"></div>
        </div>
        <div class="Ng7Ira_session" data-sidebar-right-session="session-current">
          <div class="Ng7Ira_panel" data-sidebar-right-panel="push" data-sidebar-right-open="true"></div>
        </div>
      </aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  const doc = dom.window.document
  const root = doc.documentElement
  const oldSession = doc.querySelector('[data-sidebar-right-session="session-old"]')
  const uninstall = installFullscreenCollapseSync(doc)
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '旧会话可见全屏时应折叠')
  oldSession.setAttribute('hidden', '')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, '隐藏旧会话后必须解除折叠')
  uninstall()
})

test('无关元素的 hidden 变化不得清掉用户手动收起的中间栏', async () => {
  const doc = fixture('push')
  const root = doc.documentElement
  const unrelated = doc.createElement('div')
  doc.body.append(unrelated)
  const uninstall = installFullscreenCollapseSync(doc)
  root.setAttribute(CONVERSATION_COLLAPSED_ATTR, '')
  unrelated.setAttribute('hidden', '')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '无关 hidden 变化不得改变用户手动收起状态')
  uninstall()
})

test('安装后新增无关 DOM 节点不得清掉用户手动收起的中间栏', async () => {
  const doc = fixture('push')
  const root = doc.documentElement
  const uninstall = installFullscreenCollapseSync(doc)
  root.setAttribute(CONVERSATION_COLLAPSED_ATTR, '')
  const unrelated = doc.createElement('div')
  doc.body.append(unrelated)
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '无关节点插入不得改变手动收起状态')
  uninstall()
})
