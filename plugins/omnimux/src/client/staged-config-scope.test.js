import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useStagedConfigScope } from './staged-config-scope.js'

function createScope(initialValues = {}, initialRevision = 7) {
  let snapshot = { status: 'ready', value: { ...initialValues }, user: {}, writable: true, revision: initialRevision }
  const listeners = new Set()
  const mutateCalls = []
  return {
    mutateCalls,
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    mutate: async (ops, revision) => {
      mutateCalls.push({ ops, revision })
      snapshot = { ...snapshot, revision: snapshot.revision + 1 }
      return true
    },
  }
}

function Harness({ scope, onValue }) {
  const draft = useStagedConfigScope(scope)
  onValue(draft)
  return null
}

describe('staged config scope', () => {
  it('stages edits locally and writes once on save', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>')
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const scope = createScope({ defaultTextModel: 'old' })
    let draft
    const root = createRoot(dom.window.document.body)
    await act(async () => {
      root.render(React.createElement(Harness, { scope, onValue: (value) => { draft = value } }))
    })
    await act(async () => {
      await draft.scope.set('defaultTextModel', 'new-model')
    })
    assert.equal(scope.mutateCalls.length, 0)
    assert.equal(draft.state.dirty, true)
    assert.equal(draft.snapshot.value.defaultTextModel, 'new-model')
    await act(async () => { await draft.save() })
    assert.equal(scope.mutateCalls.length, 1)
    assert.deepEqual(scope.mutateCalls[0], {
      ops: [{ op: 'set', path: ['defaultTextModel'], value: 'new-model' }],
      revision: 7,
    })
    assert.equal(draft.state.dirty, false)
    await act(async () => { root.unmount() })
  })
})
