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
import { persistSessionThreeColumn, resetConversationCollapseForTests } from '../conversation-collapse.js'

const previousWindow = globalThis.window
const previousDocument = globalThis.document
/** @type {JSDOM | undefined} */
let dom

afterEach(() => {
  resetConversationCollapseForTests()
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
  assert.equal(result.sessionFullscreen, false, '无参数调用只让聊天可见，不收右侧')
  assert.deepEqual(focusCalls, ['split'])
})

test('无参数且折叠键为真：用 setFocus(split) 清粘性折叠', () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const focusCalls = []

  const result = ensureConversationVisible(dom.window.document, {
    getConversationCollapsed: () => true,
    setFocus: (mode) => focusCalls.push(mode),
  })

  assert.deepEqual(focusCalls, ['split'])
  assert.equal(result.sessionFullscreen, false)
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
  assert.equal(result.hostFullscreenExited, true)
  assert.equal(result.sessionFullscreen, false)
})

test('该会话有三栏记忆：退出全屏并 setFocus(split)', () => {
  const doc = createFullscreenDom()
  persistSessionThreeColumn(true, 'sess-three')
  let clicked = 0
  doc.querySelector('button[data-sidebar-right-mode="push"]').addEventListener('click', () => { clicked += 1 })
  const focusCalls = []

  const result = ensureConversationVisible(doc, {
    getConversationCollapsed: () => true,
    setFocus: (mode) => focusCalls.push(mode),
  }, { sessionId: 'sess-three' })

  assert.equal(clicked, 1)
  assert.deepEqual(focusCalls, ['split'])
  assert.equal(result.sessionFullscreen, false)
  assert.equal(result.hostFullscreenExited, true)
})

test('该会话有三栏记忆且当前已是聊天全屏：仍 setFocus(split)', () => {
  persistSessionThreeColumn(true, 'sess-three')
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const focusCalls = []
  const result = ensureConversationVisible(dom.window.document, {
    getConversationCollapsed: () => false,
    setFocus: (mode) => focusCalls.push(mode),
  }, { sessionId: 'sess-three' })

  assert.deepEqual(focusCalls, ['split'])
  assert.equal(result.sessionFullscreen, false)
  assert.equal(result.hostFullscreenExited, false)
})

test('新对话：进入会话全屏', () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const focusCalls = []

  const result = ensureConversationVisible(dom.window.document, {
    getConversationCollapsed: () => false,
    setFocus: (mode) => focusCalls.push(mode),
  }, { newSession: true })

  assert.deepEqual(focusCalls, ['chat'])
  assert.equal(result.sessionFullscreen, true)
})

test('点无三栏记忆的旧会话：进入会话全屏', () => {
  const doc = createFullscreenDom()
  const focusCalls = []
  const result = ensureConversationVisible(doc, {
    getConversationCollapsed: () => false,
    setFocus: (mode) => focusCalls.push(mode),
  }, { sessionId: 'sess-new' })

  assert.deepEqual(focusCalls, ['chat'])
  assert.equal(result.sessionFullscreen, true)
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
  assert.equal(result.sessionFullscreen, false)
})

test('无 api 的会话全屏：collapseCleared 不得谎报成功', () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const result = ensureConversationVisible(dom.window.document, undefined, { newSession: true })
  assert.equal(result.sessionFullscreen, true)
  assert.equal(result.collapseCleared, false)
})
