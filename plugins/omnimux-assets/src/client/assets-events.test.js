import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ASSETS_CHANGED_EVENT, notifyAssetsChanged, subscribeAssetsChanged } from './assets-events.js'

/** Minimal window stand-in: records listeners and the events dispatched at them. */
function fakeWindow() {
  const listeners = new Map()
  const dispatched = []
  return {
    dispatched,
    addEventListener(type, listener) {
      const list = listeners.get(type) ?? []
      list.push(listener)
      listeners.set(type, list)
    },
    removeEventListener(type, listener) {
      const list = listeners.get(type) ?? []
      listeners.set(type, list.filter((row) => row !== listener))
    },
    dispatchEvent(event) {
      dispatched.push(event)
      for (const listener of listeners.get(event.type) ?? []) listener(event)
      return true
    },
    listenerCount(type) {
      return (listeners.get(type) ?? []).length
    },
  }
}

/** CustomEvent stand-in, so the test does not depend on a DOM runtime. */
class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type
    this.detail = init.detail
  }
}

describe('cloud -> local change signal', () => {
  it('names the event both feeds agree on', () => {
    assert.equal(ASSETS_CHANGED_EVENT, 'omnimux:assets:changed')
  })

  it('dispatches the event on the window', () => {
    const win = fakeWindow()
    const dispatched = notifyAssetsChanged({ window: win, CustomEvent: FakeCustomEvent })
    assert.equal(dispatched, true)
    assert.equal(win.dispatched.length, 1)
    assert.equal(win.dispatched[0].type, 'omnimux:assets:changed')
  })

  it('reports failure instead of throwing when there is no window', () => {
    assert.equal(notifyAssetsChanged({ window: null }), false)
    assert.equal(notifyAssetsChanged({ window: {} }), false)
  })

  it('reports failure rather than throwing when dispatch is refused', () => {
    const win = fakeWindow()
    win.dispatchEvent = () => { throw new Error('refused') }
    assert.equal(notifyAssetsChanged({ window: win, CustomEvent: FakeCustomEvent }), false)
  })

  it('lets a subscriber hear the signal and stop hearing it after unsubscribe', () => {
    const win = fakeWindow()
    let heard = 0
    const unsubscribe = subscribeAssetsChanged({ window: win, handler: () => { heard += 1 } })
    assert.equal(win.listenerCount('omnimux:assets:changed'), 1)

    notifyAssetsChanged({ window: win, CustomEvent: FakeCustomEvent })
    assert.equal(heard, 1)

    unsubscribe()
    assert.equal(win.listenerCount('omnimux:assets:changed'), 0)
    notifyAssetsChanged({ window: win, CustomEvent: FakeCustomEvent })
    assert.equal(heard, 1)
  })

  it('returns a no-op unsubscribe when the target cannot listen', () => {
    assert.equal(typeof subscribeAssetsChanged({ window: null, handler: () => {} }), 'function')
    assert.equal(typeof subscribeAssetsChanged({ window: fakeWindow() }), 'function')
    subscribeAssetsChanged({ window: fakeWindow(), handler: () => {} })()
  })
})
