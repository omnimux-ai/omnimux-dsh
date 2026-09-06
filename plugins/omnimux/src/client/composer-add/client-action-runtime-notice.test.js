import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  notifyClientActionRuntimeUpdateOnce,
  resetClientActionRuntimeNoticesForTests,
} from './client-action-runtime-notice.js'

function storage() {
  const entries = new Map()
  return {
    getItem(key) { return entries.get(key) ?? null },
    setItem(key, value) { entries.set(key, value) },
  }
}

describe('client-action runtime notice', () => {
  it('uses one origin-level notice when no reliable Host build identity is exposed', () => {
    resetClientActionRuntimeNoticesForTests()
    const calls = []
    const local = storage()
    assert.equal(notifyClientActionRuntimeUpdateOnce({ storage: local, notify: () => calls.push('first') }), true)
    assert.equal(notifyClientActionRuntimeUpdateOnce({ storage: local, notify: () => calls.push('again') }), false)
    assert.deepEqual(calls, ['first'])
  })

  it('still notifies once when resolving Host storage throws', () => {
    resetClientActionRuntimeNoticesForTests()
    let calls = 0
    const unavailableStorage = () => { throw new Error('storage disabled') }
    assert.equal(notifyClientActionRuntimeUpdateOnce({ storage: unavailableStorage, notify: () => { calls += 1 } }), true)
    assert.equal(notifyClientActionRuntimeUpdateOnce({ storage: unavailableStorage, notify: () => { calls += 1 } }), false)
    assert.equal(calls, 1)
  })
})
