import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { mountGeneratePanel, findGenerateHost, GENERATE_HOST_SELECTOR } from './host-mount.js'

// The host container mount is the seam between the video plugin's generation
// surface and the Clip editor's left column, so its lifetime rules are pinned
// here: mount when the container appears, re-mount when the editor rebuilds it,
// unmount when it goes away, and stay inert without a container or a surface.
const Panel = () => null

const roots = []
function fakeCreateRoot(container) {
  const root = {
    container,
    renders: [],
    unmounted: 0,
    render(element) { this.renders.push(element) },
    unmount() { this.unmounted += 1 },
  }
  roots.push(root)
  return root
}

const observers = []
const previousMutationObserver = globalThis.MutationObserver

class MockMutationObserver {
  constructor(callback) {
    this.callback = callback
    this.disconnected = false
    observers.push(this)
  }
  observe() {}
  disconnect() { this.disconnected = true }
}

afterEach(() => {
  roots.length = 0
  observers.length = 0
  if (previousMutationObserver === undefined) delete globalThis.MutationObserver
  else globalThis.MutationObserver = previousMutationObserver
})

function makeDocument(hosts = []) {
  const doc = {
    body: {},
    hosts: [...hosts],
    queried: [],
    querySelector(selector) {
      doc.queried.push(selector)
      return doc.hosts[0] ?? null
    },
  }
  return doc
}

function mount(options) {
  globalThis.MutationObserver = MockMutationObserver
  return mountGeneratePanel({ component: Panel, createRoot: fakeCreateRoot, ...options })
}

test('findGenerateHost reports the editor container only when it exists', () => {
  const host = {}
  const doc = makeDocument([host])
  assert.equal(findGenerateHost(makeDocument()), null)
  assert.equal(findGenerateHost(doc), host)
  assert.equal(findGenerateHost(undefined), null)
  assert.equal(findGenerateHost({}), null, 'a document without querySelector must not throw')
  assert.equal(doc.queried[0], GENERATE_HOST_SELECTOR)
})

test('mountGeneratePanel renders the panel into the container it finds', () => {
  const host = {}
  const dispose = mount({ document: makeDocument([host]) })

  assert.equal(roots.length, 1)
  assert.equal(roots[0].container, host)
  assert.equal(roots[0].renders.length, 1)
  assert.equal(roots[0].renders[0].props.variant, 'panel', 'the panel variant drives the embedded layout')
  assert.equal(roots[0].renders[0].props.visible, true)

  dispose()
  assert.equal(roots[0].unmounted, 1)
})

test('a rebuilt container is re-mounted and the previous root is unmounted', () => {
  const doc = makeDocument([{}])
  const dispose = mount({ document: doc })
  assert.equal(roots.length, 1)

  const rebuilt = {}
  doc.hosts = [rebuilt]
  observers[0].callback()

  assert.equal(roots.length, 2, 'the editor rebuilt the column, so the panel remounts')
  assert.equal(roots[0].unmounted, 1, 'the stale container must release its root')
  assert.equal(roots[1].container, rebuilt)

  observers[0].callback()
  assert.equal(roots.length, 2, 'an unchanged container must not remount')

  dispose()
})

test('a removed container unmounts the panel without throwing', () => {
  const doc = makeDocument([{}])
  const dispose = mount({ document: doc })
  assert.equal(roots.length, 1)

  doc.hosts = []
  assert.doesNotThrow(() => observers[0].callback())

  assert.equal(roots[0].unmounted, 1)
  assert.equal(roots.length, 1, 'no container means no new root')

  dispose()
})

test('dispose unmounts the panel and stops observing', () => {
  const doc = makeDocument([{}])
  const dispose = mount({ document: doc })
  const observer = observers[0]

  dispose()

  assert.equal(roots[0].unmounted, 1)
  assert.equal(observer.disconnected, true)

  const before = doc.queried.length
  doc.hosts = [{}]
  observer.callback()
  assert.equal(doc.queried.length, before, 'a disposed mount must not touch the DOM again')
})

test('mountGeneratePanel is inert without a container or a surface', () => {
  const withoutDocument = mount({ document: undefined })
  assert.equal(typeof withoutDocument, 'function')
  withoutDocument()

  const withoutQuerySelector = mount({ document: { body: {} } })
  assert.equal(typeof withoutQuerySelector, 'function')
  withoutQuerySelector()

  globalThis.MutationObserver = MockMutationObserver
  const withoutComponent = mountGeneratePanel({ document: makeDocument([{}]), createRoot: fakeCreateRoot })
  assert.equal(typeof withoutComponent, 'function')
  withoutComponent()
  assert.equal(roots.length, 0)
})
