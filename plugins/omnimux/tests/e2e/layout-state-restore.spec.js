import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { installFullscreenCollapseSync } from '../../src/client/workbench/fullscreen-collapse-sync.js'
import { COMPOSER_WIDTH_PREF_KEY, guardComposerWidthPreference } from '../../src/client/composer-width-guard.js'
import { CONVERSATION_COLLAPSED_ATTR } from '../../src/client/conversation-collapse.js'

const here = dirname(fileURLToPath(import.meta.url))
const CHROME_SOURCE = readFileSync(join(here, '..', '..', 'src', 'client', 'chrome.js'), 'utf8')

/**
 * 整帧夹具：左栏 + 会话列 + 右侧面板 + 一个可测量的会话列容器。
 * @param {string} panelMode
 * @param {number} columnWidth
 */
function fixture(panelMode, columnWidth = 668) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame">
      <aside class="dshDesktopSidebarSurface"></aside>
      <main class="dshDesktopConversationSurface"><div data-conversation-scroll></div></main>
      <aside class="dshDesktopRightbarSurface">
        <div class="Ng7Ira_panel" data-sidebar-right-panel="${panelMode}" data-sidebar-right-open="true"></div>
      </aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  const win = dom.window
  const column = win.document.querySelector('[data-conversation-scroll]')
  column.getBoundingClientRect = () => ({ left: 280, right: 280 + columnWidth, top: 0, bottom: 900, width: columnWidth, height: 900 })
  return win
}

test('e2e: 点原生全屏按钮收起中间会话栏，退出后精确还原', async () => {
  const win = fixture('push')
  const doc = win.document
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  const uninstall = installFullscreenCollapseSync(doc)

  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, '分栏态不得折叠')

  // 原生全屏按钮只改面板模式属性，不经过插件的焦点切换
  panel.setAttribute('data-sidebar-right-panel', 'fullscreen')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '进入全屏必须收起中间会话栏')

  panel.setAttribute('data-sidebar-right-panel', 'push')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), false, '退出全屏必须还原')

  uninstall()
})

test('e2e: 用户自己收起的会话栏，进出全屏后不得被顶开', async () => {
  const win = fixture('push')
  const doc = win.document
  const root = doc.documentElement
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  root.setAttribute(CONVERSATION_COLLAPSED_ATTR, '')
  const uninstall = installFullscreenCollapseSync(doc)

  panel.setAttribute('data-sidebar-right-panel', 'fullscreen')
  await new Promise((r) => setTimeout(r, 30))
  panel.setAttribute('data-sidebar-right-panel', 'push')
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(root.hasAttribute(CONVERSATION_COLLAPSED_ATTR), true, '折叠键是用户偏好，还原时不得不当清除')

  uninstall()
})

test('e2e: 残留宽度偏好被清除后，输入框上限回到原生自适应值', () => {
  // 实机现场：列宽 668、存档 920.6796875 → 卡片被钉在 672px
  const stale = fixture('push', 668)
  stale.localStorage.setItem(COMPOSER_WIDTH_PREF_KEY, '920.6796875')
  assert.equal(guardComposerWidthPreference(stale).cleared, true, '越界偏好必须清除')
  assert.equal(stale.localStorage.getItem(COMPOSER_WIDTH_PREF_KEY), null)
  // 清除后原生自适应 = max(680, min(668 × 0.64, 920)) = 680 → 卡片 712px

  // 合法范围内的偏好必须保留（原生宽度手柄的调整不能被吞）
  const keep = fixture('push', 2000)
  keep.localStorage.setItem(COMPOSER_WIDTH_PREF_KEY, '900')
  assert.equal(guardComposerWidthPreference(keep).cleared, false)
  assert.equal(keep.localStorage.getItem(COMPOSER_WIDTH_PREF_KEY), '900')
})

test('e2e: chrome 装配层确实安装并回收了两项能力', () => {
  assert.match(CHROME_SOURCE, /installFullscreenCollapseSync\(\)/)
  assert.match(CHROME_SOURCE, /unsubFullscreenCollapse\?\.\(\)/)
  assert.match(CHROME_SOURCE, /installComposerWidthGuard\(\)/)
  assert.match(CHROME_SOURCE, /unsubWidthGuard\?\.\(\)/)
})
