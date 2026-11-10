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

function mount(scope) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let draft
  const root = createRoot(dom.window.document.body)
  const render = async () => {
    await act(async () => {
      root.render(React.createElement(Harness, { scope, onValue: (value) => { draft = value } }))
    })
  }
  return { root, render, get: () => draft }
}

describe('staged config scope extra cases', () => {
  it('discards drafts without writing', async () => {
    const scope = createScope({ defaultTextModel: 'old' })
    const mounted = mount(scope)
    await mounted.render()
    await act(async () => { await mounted.get().scope.set('defaultTextModel', 'draft') })
    await act(async () => { mounted.get().discard() })
    assert.equal(mounted.get().state.dirty, false)
    assert.equal(mounted.get().snapshot.value.defaultTextModel, 'old')
    assert.equal(scope.mutateCalls.length, 0)
    await act(async () => { mounted.root.unmount() })
  })

  it('keeps drafts after a failed multi-field save and can retry', async () => {
    const scope = createScope({ defaultTextModel: 'old' })
    let failNext = true
    scope.mutate = async (ops, revision) => {
      scope.mutateCalls.push({ ops, revision })
      return !failNext
    }
    const mounted = mount(scope)
    await mounted.render()
    await act(async () => {
      await mounted.get().scope.set('defaultTextModel', 'new-model')
      await mounted.get().scope.set('defaultImageModel', 'new-image')
    })
    await act(async () => { await mounted.get().save() })
    assert.equal(mounted.get().state.failed, true)
    assert.equal(mounted.get().state.dirty, true)
    assert.deepEqual(scope.mutateCalls[0].ops.map((op) => op.path[0]), ['defaultTextModel', 'defaultImageModel'])
    failNext = false
    await act(async () => { await mounted.get().save() })
    assert.equal(mounted.get().state.failed, false)
    assert.equal(mounted.get().state.dirty, false)
    await act(async () => { mounted.root.unmount() })
  })
})
