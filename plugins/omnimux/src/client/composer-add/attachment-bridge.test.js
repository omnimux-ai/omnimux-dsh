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
const { AttachmentSubmitBridge, reconcileAttachmentDraft } = module.exports
const item = { id: 'one', title: 'brief', extension: 'MD', relativePath: 'brief.md', kind: 'document' }
test('attachment block follows changes without overwriting manual edits', () => {
  const first = reconcileAttachmentDraft('ask', '', [item])
  assert.equal(first.status, 'synced')
  assert.equal(reconcileAttachmentDraft(first.draft, first.block, [item]).status, 'ready')
  assert.equal(reconcileAttachmentDraft(first.draft, first.block, []).draft, 'ask')
  assert.equal(reconcileAttachmentDraft(first.draft + '.backup', first.block, [{ ...item, relativePath: 'new.md' }]).status, 'edited')
  assert.equal(reconcileAttachmentDraft(first.draft.replace('brief.md', 'my.md'), first.block, [item]).status, 'edited')
})
test('owner draft is updated before send; URL textarea, other sessions and failed drafts remain intact', async () => {
  const dom = new JSDOM('<div data-phase="hero"><textarea>https://example.com/video</textarea><div id="bridge"></div><div data-composer-input="true" contenteditable="true"></div><button data-send-button>Send</button></div>')
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const root = createRoot(document.querySelector('#bridge'))
  let draft = 'ask'; let current = 'A'; let sends = 0
  let attachments = [item]
  const arms = []
  const props = { sessionId: 'A', useInput: selector => selector({ draft, phase: 'plain' }), inputActions: { setDraft(value) { draft = value } },
    attachmentStore: { getSnapshot: () => attachments }, attachmentDrafts: new Map(), attachmentAdmission: { arm: (...args) => arms.push(args) }, getCurrentSessionId: () => current, t: key => key }
  document.querySelector('button').addEventListener('click', () => sends++)
  try {
    await act(async () => root.render(React.createElement(AttachmentSubmitBridge, props)))
    await act(async () => document.querySelector('button').click())
    assert.equal(sends, 0); assert.equal(arms.length, 0); assert.match(draft, /brief.md/)
    assert.equal(document.querySelector('textarea').value, 'https://example.com/video')
    await act(async () => root.render(React.createElement(AttachmentSubmitBridge, props)))
    await act(async () => document.querySelector('button').click())
    assert.equal(sends, 1); assert.equal(arms[0][0], 'A'); assert.equal(arms[0][1], draft)
    current = 'B'; draft = 'another session'
    await act(async () => document.querySelector('button').click())
    assert.equal(draft, 'another session'); assert.equal(arms.length, 1)
    current = 'A'; draft = ''; attachments = []; props.attachmentDrafts.clear()
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
    assert.equal(accepted, false, 'a menu without a selection still needs submission checks')
    assert.match(draft, /brief.md/)
  } finally {
    await act(async () => root.unmount()); dom.window.close()
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})
