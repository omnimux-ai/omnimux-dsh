import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createPickerActionController } from './picker-action.js'

function deferred() {
  let resolve
  return { promise: new Promise((done) => { resolve = done }), resolve }
}

describe('composer picker action ownership', () => {
  it('ignores cleanup when no action is open', () => {
    const controller = createPickerActionController()
    assert.equal(controller.settle(null), false)
  })

  it('ignores a delayed confirmation after Escape closes and a new action opens', async () => {
    const controller = createPickerActionController()
    const writes = []
    const oldSignal = new AbortController().signal
    let oldSettled = 0
    const oldAction = {
      signal: oldSignal,
      resolve() { oldSettled += 1 },
      restoreComposerFocus() {},
    }
    const nextAction = {
      signal: new AbortController().signal,
      resolve() {},
      restoreComposerFocus() {},
    }
    controller.start(oldAction)
    const response = deferred()
    const delayedConfirm = (async () => {
      await response.promise
      if (oldAction.signal.aborted || !controller.isCurrent(oldAction)) return
      writes.push('old response wrote the tray')
    })()

    assert.equal(controller.settle(oldAction), true, 'Escape settles the pending action')
    controller.start(nextAction)
    response.resolve()
    await delayedConfirm

    assert.deepEqual(writes, [])
    assert.equal(oldSettled, 1)
    assert.equal(controller.settle(oldAction), false, 'a stale close cannot settle the new action')
    assert.equal(controller.isCurrent(nextAction), true)
  })

  it('settles a superseded session action without restoring its focus', () => {
    const controller = createPickerActionController()
    let oldSettled = 0
    let oldFocus = 0
    const oldAction = {
      signal: new AbortController().signal,
      resolve() { oldSettled += 1 },
      restoreComposerFocus() { oldFocus += 1 },
    }
    const nextAction = {
      signal: new AbortController().signal,
      resolve() {},
      restoreComposerFocus() {},
    }

    controller.start(oldAction)
    assert.equal(controller.revision(), 1)
    controller.start(nextAction)

    assert.equal(oldSettled, 1)
    assert.equal(oldFocus, 0)
    assert.equal(controller.isCurrent(oldAction), false)
    assert.equal(controller.isCurrent(nextAction), true)
    assert.equal(controller.revision(), 2)
  })
})
