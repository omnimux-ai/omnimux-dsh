/**
 * 「让对话可见」统一实现：**两层状态**都必须处理。
 *
 * 关键回归：宿主右侧栏全屏态下插件折叠键通常是 `false`，
 * 此前「读到 false 就跳过」的写法会让宿主全屏永不被退出 ——
 * 用户看到的是「提示已添加，但会话栏不动」。
 */

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { ensureConversationVisible } from './ensure-conversation-visible.js'

const previousWindow = globalThis.window
const previousDocument = globalThis.document
/** @type {JSDOM | undefined} */
let dom

afterEach(() => {
  dom?.window.close()
  dom = undefined
  globalThis.window = previousWindow
  globalThis.document = previousDocument
})

/** 造一个「宿主右侧栏全屏」文档：面板属性 + 官方 `push` 模式控件。 */
function createFullscreenDom() {
  dom = new JSDOM(`<!doctype html><html><body>
    <div data-sidebar-right-panel="fullscreen" data-sidebar-right-open="true">
      <button data-sidebar-right-mode="push">push</button>
    </div>
  </body></html>`)
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  return dom.window.document
}

test('宿主全屏时：点击官方退出控件，且不依赖折叠键', () => {
  const doc = createFullscreenDom()
  let clicked = 0
  doc.querySelector('button[data-sidebar-right-mode="push"]').addEventListener('click', () => { clicked += 1 })

  const focusCalls = []
  const result = ensureConversationVisible(doc, {
    getConversationCollapsed: () => false, // 全屏态下折叠键恰恰是 false
    setFocus: (mode) => focusCalls.push(mode),
  })

  assert.equal(clicked, 1, '必须点了官方退出控件')
  assert.equal(result.hostFullscreenExited, true)
  assert.equal(result.collapseCleared, false, '折叠键本来就是 false，无需再清')
  assert.deepEqual(focusCalls, [], '折叠键为 false 时不该写焦点')
})

test('折叠键为真时：用 setFocus(split) 清粘性折叠', () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const focusCalls = []

  const result = ensureConversationVisible(dom.window.document, {
    getConversationCollapsed: () => true,
    setFocus: (mode) => focusCalls.push(mode),
  })

  assert.deepEqual(focusCalls, ['split'])
  assert.equal(result.collapseCleared, true)
  assert.equal(result.hostFullscreenExited, false)
})

test('全屏 + 折叠键同时成立：两件事都做', () => {
  const doc = createFullscreenDom()
  let clicked = 0
  doc.querySelector('button[data-sidebar-right-mode="push"]').addEventListener('click', () => { clicked += 1 })
  const focusCalls = []

  const result = ensureConversationVisible(doc, {
    getConversationCollapsed: () => true,
    setFocus: (mode) => focusCalls.push(mode),
  })

  assert.equal(clicked, 1)
  assert.deepEqual(focusCalls, ['split'])
  assert.deepEqual(result, { hostFullscreenExited: true, collapseCleared: true })
})

test('本来就可见时：纯 no-op（不得产生任何布局动作）', () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const focusCalls = []

  const result = ensureConversationVisible(dom.window.document, {
    getConversationCollapsed: () => false,
    setFocus: (mode) => focusCalls.push(mode),
  })

  assert.deepEqual(focusCalls, [])
  assert.deepEqual(result, { hostFullscreenExited: false, collapseCleared: false })
})

test('API 缺失或抛错：静默降级，绝不抛出', () => {
  const doc = createFullscreenDom()

  assert.doesNotThrow(() => ensureConversationVisible(doc, undefined))
  assert.doesNotThrow(() => ensureConversationVisible(doc, {
    getConversationCollapsed: () => { throw new Error('boom') },
    setFocus: () => { throw new Error('boom') },
  }))
  const result = ensureConversationVisible(doc, {
    getConversationCollapsed: () => { throw new Error('boom') },
  })
  assert.equal(result.collapseCleared, false)
})
