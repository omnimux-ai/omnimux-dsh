import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import {
  CONVERSATION_SCROLLBAR_CSS,
  CONVERSATION_SCROLLBAR_STYLE_ID,
  SCROLL_ACTIVE_ATTR,
  SCROLL_CONTAINER_SELECTOR,
  SCROLL_REVEAL_DWELL_MS,
  ensureConversationScrollbarChrome,
  installConversationScrollbarReveal,
} from '../../src/client/conversation-scrollbar.js'

const here = dirname(fileURLToPath(import.meta.url))
const CHROME_SOURCE = readFileSync(join(here, '..', '..', 'src', 'client', 'chrome.js'), 'utf8')

/**
 * 会话列可见的整帧夹具：滚动容器长于一屏，右侧另有画布滚动区（不得被本改动波及）。
 */
function fixture() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="dshDesktopFrame">
      <main class="dshDesktopConversationSurface">
        <div data-conversation-scroll><div style="height:3000px">messages</div></div>
      </main>
      <aside class="dshDesktopRightbarSurface"><div data-omnimux-canvas-scroll><div style="height:3000px">canvas</div></div></aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  return dom.window.document
}

test('e2e: 会话栏滚动条默认隐藏、滚动浮现、静置隐去，且装订线几何全程不变', async () => {
  const doc = fixture()
  const scroll = doc.querySelector(SCROLL_CONTAINER_SELECTOR)
  // JSDOM 无布局引擎：给容器固定几何，模拟真实装订线（实机 offsetW 668 / clientW 652）。
  scroll.getBoundingClientRect = () => ({ left: 280, right: 948, top: 40, bottom: 958, width: 668, height: 918 })
  Object.defineProperty(scroll, 'offsetWidth', { value: 668, configurable: true })
  Object.defineProperty(scroll, 'clientWidth', { value: 652, configurable: true })

  ensureConversationScrollbarChrome(doc)
  const uninstall = installConversationScrollbarReveal(doc)

  // 1. 默认不可见
  assert.equal(scroll.hasAttribute(SCROLL_ACTIVE_ATTR), false, '未滚动时不得带浮现标记')

  // 2. 滚动即出现
  scroll.dispatchEvent(new doc.defaultView.Event('scroll'))
  assert.equal(scroll.hasAttribute(SCROLL_ACTIVE_ATTR), true, '滚动后必须浮现')

  // 3. 静置即消失
  await new Promise((r) => setTimeout(r, SCROLL_REVEAL_DWELL_MS + 300))
  assert.equal(scroll.hasAttribute(SCROLL_ACTIVE_ATTR), false, '静置后必须隐去')

  // 4. 出现/消失全程不改几何（装订线由宿主 scrollbar-gutter 固定预留）
  assert.equal(scroll.offsetWidth - scroll.clientWidth, 16, '装订线宽度必须保持 16px，不得因滚动条显隐跳动')

  uninstall()
})

test('e2e: 出现期间指针停在装订线上可抓住拖动，离开后恢复自动隐去', async () => {
  const doc = fixture()
  const scroll = doc.querySelector(SCROLL_CONTAINER_SELECTOR)
  scroll.getBoundingClientRect = () => ({ left: 280, right: 948, top: 40, bottom: 958, width: 668, height: 918 })
  ensureConversationScrollbarChrome(doc)
  const uninstall = installConversationScrollbarReveal(doc)

  scroll.dispatchEvent(new doc.defaultView.Event('scroll'))
  const grab = new doc.defaultView.Event('pointermove', { bubbles: true })
  Object.assign(grab, { clientX: 944, clientY: 500 })
  scroll.dispatchEvent(grab)
  await new Promise((r) => setTimeout(r, SCROLL_REVEAL_DWELL_MS + 300))
  assert.equal(scroll.hasAttribute(SCROLL_ACTIVE_ATTR), true, '指针停在装订线上时滑块必须保持可见，否则用户抓不住')

  const leave = new doc.defaultView.Event('pointerleave', { bubbles: true })
  scroll.dispatchEvent(leave)
  scroll.dispatchEvent(new doc.defaultView.Event('scroll'))
  await new Promise((r) => setTimeout(r, SCROLL_REVEAL_DWELL_MS + 300))
  assert.equal(scroll.hasAttribute(SCROLL_ACTIVE_ATTR), false, '指针离开后必须恢复静置隐去')

  uninstall()
})

test('e2e: 其它滚动容器不受影响，且 chrome 装配层确实安装并回收了本能力', () => {
  const doc = fixture()
  const canvasScroll = doc.querySelector('[data-omnimux-canvas-scroll]')
  ensureConversationScrollbarChrome(doc)
  const uninstall = installConversationScrollbarReveal(doc)

  canvasScroll.dispatchEvent(new doc.defaultView.Event('scroll'))
  assert.equal(canvasScroll.hasAttribute(SCROLL_ACTIVE_ATTR), false, '画布滚动不得唤出会话栏滚动条')
  assert.equal(doc.getElementById(CONVERSATION_SCROLLBAR_STYLE_ID)?.textContent, CONVERSATION_SCROLLBAR_CSS)

  uninstall()
  assert.match(CHROME_SOURCE, /ensureConversationScrollbarChrome\(\)/)
  assert.match(CHROME_SOURCE, /installConversationScrollbarReveal\(\)/)
  assert.match(CHROME_SOURCE, /unsubScrollbar\?\.\(\)/)
})
