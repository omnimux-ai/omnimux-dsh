import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
const output = await build({ entryPoints: [new URL('./AttachmentSubmitBridge.jsx', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] })
const module = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const { AttachmentSubmitBridge } = module.exports
const item = { id: 'one', title: 'brief', extension: 'MD', relativePath: 'brief.md', kind: 'document' }
const CONTEXT_MARKER = '### 会话关联上下文'

/**
 * 发送链路硬门禁：附件说明绝不写进用户草稿。
 *
 * 附件真源由宿主原生 `agent/pre-step` 注入（`getUiContext().attachedContextText`）。
 * 一旦有人再把数据块拼进草稿，用户气泡里就会出现空行与被掏空的引用图标 ——
 * 这条断言就是那道不许再走回头路的口子。
 */
function assertDraftNotPolluted(draft) {
  assert.ok(!draft.includes(CONTEXT_MARKER), '草稿不得出现会话关联上下文数据块')
  assert.ok(!draft.includes('brief.md'), '草稿不得出现附件路径')
  assert.ok(!draft.includes('@inspiration/'), '草稿不得出现虚拟引用指针')
}

test('发送前不改写草稿，只把最新 viewport 信封推给宿主', async () => {
  const dom = new JSDOM('<div data-phase="hero"><textarea>https://example.com/video</textarea><div id="bridge"></div><div data-composer-input="true" contenteditable="true"></div><button data-send-button>Send</button></div>')
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const root = createRoot(document.querySelector('#bridge'))
  let draft = 'ask'; let current = 'A'; let sends = 0
  let attachments = [item]
  let pushed = 0
  const arms = []
  const props = { sessionId: 'A', useInput: selector => selector({ draft, phase: 'plain' }), inputActions: { setDraft(value) { draft = value } },
    attachmentStore: { getSnapshot: () => attachments }, attachmentAdmission: { arm: (...args) => arms.push(args) }, getCurrentSessionId: () => current, t: key => key }
  window.__omnimuxHubEvents = { pushViewport: () => { pushed += 1 } }
  document.querySelector('button').addEventListener('click', () => sends++)
  try {
    await act(async () => root.render(React.createElement(AttachmentSubmitBridge, props)))
    assert.equal(document.querySelector('#bridge > div').style.display, 'none', 'empty notice container should not occupy layout space')
    await act(async () => document.querySelector('button').click())
    // 核心断言：单次回车/点击立即发送，绝不被拦截；草稿保持用户原文，附件只走宿主原生通道
    assert.equal(sends, 1)
    assert.equal(arms.length, 1)
    assert.equal(draft, 'ask', '发送不得把附件数据块写回草稿')
    assertDraftNotPolluted(draft)
    assert.equal(pushed, 1, '发送时补推一次 viewport 信封，保证宿主已拿到最新附件上下文')
    assert.equal(document.querySelector('#bridge > div').style.display, 'none', '不再弹出素材说明已加入草稿通知')
    assert.equal(document.querySelector('textarea').value, 'https://example.com/video')
    current = 'B'; draft = 'another session'
    await act(async () => document.querySelector('button').click())
    assert.equal(draft, 'another session'); assert.equal(arms.length, 1)
    current = 'A'; draft = ''; attachments = []
    window.__omnimuxWorkbench = { getUiContext: () => ({ ok: true }), formatCompactContextBlock: () => '<ui_context>page</ui_context>' }
    await act(async () => root.render(React.createElement(AttachmentSubmitBridge, props)))
    const editor = document.querySelector('[data-composer-input]')
    await act(async () => editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    assert.equal(draft, '', 'empty Enter must not create a context-only message')
    draft = '/command'
    await act(async () => root.render(React.createElement(AttachmentSubmitBridge, props)))
    await act(async () => editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    assert.equal(draft, '/command', 'context must preserve slash position')
    draft = 'select @reference'; attachments = [item]
    await act(async () => root.render(React.createElement(AttachmentSubmitBridge, props)))
    const menu = document.createElement('div'); menu.dataset.triggerMenu = ''; document.body.appendChild(menu)
    const list = document.createElement('div'); list.setAttribute('aria-activedescendant', 'candidate'); menu.appendChild(list)
    await act(async () => editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    assert.equal(draft, 'select @reference', 'menu Enter belongs to the official picker')
    list.removeAttribute('aria-activedescendant')
    let accepted = true
    await act(async () => { accepted = editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    assert.equal(accepted, true, '无候选选中时回车直接放行发送，不再拦截')
    assert.equal(draft, 'select @reference', '附件不得进入用户可见正文')
    assertDraftNotPolluted(draft)
  } finally {
    await act(async () => root.unmount()); dom.window.close()
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})
