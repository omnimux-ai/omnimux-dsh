import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  CONVERSATION_SCROLLBAR_CSS,
  CONVERSATION_SCROLLBAR_STYLE_ID,
  SCROLL_ACTIVE_ATTR,
  SCROLL_CONTAINER_SELECTOR,
  SCROLL_REVEAL_DWELL_MS,
  ensureConversationScrollbarChrome,
  installConversationScrollbarReveal,
  isScrollbarGrabZone,
} from './conversation-scrollbar.js'

function fixture() {
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body><div data-conversation-scroll><p>hi</p></div></body></html>`,
    { url: 'http://127.0.0.1:45120/' },
  )
  return dom.window.document
}

/** 选择器里含 `[`/`]`，进正则必须转义。 */
const escapedSelector = SCROLL_CONTAINER_SELECTOR.replace(/[[\]]/g, '\\$&')

test('样式表只用伪元素控制滑块，绝不用会塌缩装订线的标准属性', () => {
  // 实机实测：给该容器加 scrollbar-color 会让 scrollbar-gutter 预留的装订线
  // 从 16px 塌缩为 0，滚动条出现/消失时会话内容横向跳动 8px。
  assert.doesNotMatch(CONVERSATION_SCROLLBAR_CSS, /scrollbar-color\s*:/)
  assert.doesNotMatch(CONVERSATION_SCROLLBAR_CSS, /scrollbar-width\s*:/)
  assert.doesNotMatch(CONVERSATION_SCROLLBAR_CSS, /scrollbar-gutter\s*:/)
  assert.match(CONVERSATION_SCROLLBAR_CSS, new RegExp(`${escapedSelector}::-webkit-scrollbar-thumb`))
  assert.match(CONVERSATION_SCROLLBAR_CSS, /background:transparent/)
  assert.match(CONVERSATION_SCROLLBAR_CSS, new RegExp(`\\[${SCROLL_ACTIVE_ATTR}\\]::-webkit-scrollbar-thumb`))
  assert.match(CONVERSATION_SCROLLBAR_CSS, /--dsw-alias-border-l3/)
})

test('ensureConversationScrollbarChrome 注入样式表且幂等', () => {
  const doc = fixture()
  const first = ensureConversationScrollbarChrome(doc)
  assert.ok(first)
  assert.equal(first.id, CONVERSATION_SCROLLBAR_STYLE_ID)
  assert.equal(doc.querySelectorAll(`#${CONVERSATION_SCROLLBAR_STYLE_ID}`).length, 1)
  assert.equal(doc.querySelectorAll('style').length, 1)
  ensureConversationScrollbarChrome(doc)
  assert.equal(doc.querySelectorAll('style').length, 1, '重复安装不得复制样式表')
})

test('isScrollbarGrabZone 只认容器右缘装订线内的指针', () => {
  const rect = { left: 100, right: 700, top: 200, bottom: 900 }
  assert.equal(isScrollbarGrabZone(rect, 700, 500), true, '贴着右缘')
  assert.equal(isScrollbarGrabZone(rect, 690, 500), true, '右缘内 10px')
  assert.equal(isScrollbarGrabZone(rect, 680, 500), true, '右缘内 20px（band 边界）')
  assert.equal(isScrollbarGrabZone(rect, 679, 500), false, '超过 band')
  assert.equal(isScrollbarGrabZone(rect, 400, 500), false, '正文中央绝不唤出滚动条')
  assert.equal(isScrollbarGrabZone(rect, 700, 100), false, '纵向出界')
  assert.equal(isScrollbarGrabZone(rect, 720, 500), false, '横向出界')
  assert.equal(isScrollbarGrabZone(null, 700, 500), false, '无几何信息时不误判')
})

test('滚动时浮现滑块，静置后自动隐去', async () => {
  const doc = fixture()
  const el = doc.querySelector(SCROLL_CONTAINER_SELECTOR)
  const uninstall = installConversationScrollbarReveal(doc)

  assert.equal(el.hasAttribute(SCROLL_ACTIVE_ATTR), false, '默认不可见')
  el.dispatchEvent(new doc.defaultView.Event('scroll'))
  assert.equal(el.hasAttribute(SCROLL_ACTIVE_ATTR), true, '滚动即出现')

  await new Promise((r) => setTimeout(r, SCROLL_REVEAL_DWELL_MS + 250))
  assert.equal(el.hasAttribute(SCROLL_ACTIVE_ATTR), false, '静置后自动隐去')

  uninstall()
  el.dispatchEvent(new doc.defaultView.Event('scroll'))
  assert.equal(el.hasAttribute(SCROLL_ACTIVE_ATTR), false, '取消安装后不再响应')
})

test('指针停在装订线上时滑块保持可见，可被抓住拖动', async () => {
  const doc = fixture()
  const el = doc.querySelector(SCROLL_CONTAINER_SELECTOR)
  el.getBoundingClientRect = () => ({ left: 100, right: 700, top: 200, bottom: 900, width: 600, height: 700 })
  const uninstall = installConversationScrollbarReveal(doc)

  el.dispatchEvent(new doc.defaultView.Event('scroll'))
  const grab = new doc.defaultView.Event('pointermove', { bubbles: true })
  Object.assign(grab, { clientX: 695, clientY: 500 })
  el.dispatchEvent(grab)
  assert.equal(el.hasAttribute(SCROLL_ACTIVE_ATTR), true)

  await new Promise((r) => setTimeout(r, SCROLL_REVEAL_DWELL_MS + 250))
  assert.equal(el.hasAttribute(SCROLL_ACTIVE_ATTR), true, '指针停在装订线上时不得自动隐去')

  const away = new doc.defaultView.Event('pointerleave', { bubbles: true })
  el.dispatchEvent(away)
  await new Promise((r) => setTimeout(r, 50))
  el.dispatchEvent(new doc.defaultView.Event('scroll'))
  await new Promise((r) => setTimeout(r, SCROLL_REVEAL_DWELL_MS + 250))
  assert.equal(el.hasAttribute(SCROLL_ACTIVE_ATTR), false, '指针离开后恢复静置隐去')

  uninstall()
})

test('正文区域移动指针不会唤出滚动条', () => {
  const doc = fixture()
  const el = doc.querySelector(SCROLL_CONTAINER_SELECTOR)
  el.getBoundingClientRect = () => ({ left: 100, right: 700, top: 200, bottom: 900, width: 600, height: 700 })
  const uninstall = installConversationScrollbarReveal(doc)

  const move = new doc.defaultView.Event('pointermove', { bubbles: true })
  Object.assign(move, { clientX: 400, clientY: 500 })
  el.dispatchEvent(move)
  assert.equal(el.hasAttribute(SCROLL_ACTIVE_ATTR), false)

  uninstall()
})
