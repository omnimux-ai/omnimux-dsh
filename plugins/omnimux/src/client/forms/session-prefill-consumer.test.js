import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionPrefillConsumer } from './mount.js'
import {
  getPendingSessionPrefill,
  queueSessionPrefill,
  resetSessionPrefill,
} from './session-prefill.js'

/**
 * Integration gate: the real `SessionPrefillConsumer` (the official slot
 * component, including its `phase` wiring) against the real seam. Unit tests
 * cover `consumeSessionPrefill`; this proves the mounted component actually
 * receives the append intent and writes through `inputActions.setDraft`, so a
 * browser stub cannot drift away from the shipped contract unnoticed.
 */
async function withConsumer(initialState, run) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' })
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const state = Object.assign({ imageIds: [] }, initialState)
  const writes = []
  const root = createRoot(dom.window.document.querySelector('#root'))
  try {
    await act(async () => root.render(React.createElement(SessionPrefillConsumer, {
      sessionId: 'qa-session',
      useInput: selector => selector(state),
      inputActions: { setDraft(next) { writes.push(next); state.draft = next } },
    })))
    await run({ state, writes })
  } finally {
    resetSessionPrefill()
    await act(async () => root.unmount())
    Object.assign(globalThis, { window: previous.window, document: previous.document, IS_REACT_ACT_ENVIRONMENT: previous.act })
    dom.window.close()
  }
}

test('mounted official consumer appends a queued intent to the existing draft', async () => {
  resetSessionPrefill()
  await withConsumer({ draft: '我的问题：先看舞蹈参考', phase: 'plain' }, async ({ state, writes }) => {
    let completion
    await act(async () => {
      completion = queueSessionPrefill({
        targetSessionId: 'qa-session', prompt: 'COLLECTION', mode: 'append', attach: () => ({ ok: true }),
      })
      await new Promise(resolve => setTimeout(resolve, 100))
    })
    assert.deepEqual(await completion, { ok: true, via: 'input-actions', appended: true })
    assert.equal(state.draft, '我的问题：先看舞蹈参考\n\nCOLLECTION')
    assert.deepEqual(writes, ['我的问题：先看舞蹈参考\n\nCOLLECTION'])
    assert.equal(getPendingSessionPrefill(), null)
  })
})

test('mounted consumer refuses append while the composer is not plain', async () => {
  resetSessionPrefill()
  await withConsumer({ draft: '不可追加', phase: 'command' }, async ({ state, writes }) => {
    let completion
    await act(async () => {
      completion = queueSessionPrefill({
        targetSessionId: 'qa-session', prompt: 'COLLECTION', mode: 'append', attach: () => ({ ok: true }),
      })
      await new Promise(resolve => setTimeout(resolve, 100))
    })
    assert.deepEqual(await completion, { ok: false, error: 'draft-protected' })
    assert.equal(state.draft, '不可追加')
    assert.deepEqual(writes, [])
  })
})
