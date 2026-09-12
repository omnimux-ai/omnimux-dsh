import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listenComposerAddCommands } from './commands.js'

function fixture() {
  const listeners = new Set()
  const calls = []
  return {
    listeners, calls,
    ctx: { on(event, listener) {
      assert.equal(event, 'command/executed')
      listeners.add(listener)
      return () => listeners.delete(listener)
    } },
    actions: {
      openLibrary(id) { calls.push(['library', id]) },
    },
    async emit(id, name, result) {
      for (const listener of listeners) await listener(id, name, result)
    },
  }
}

describe('composer command acknowledgment', () => {
  it('handles only successful owned commands with the event session', async () => {
    const f = fixture()
    const stop = listenComposerAddCommands(f.ctx, f.actions)
    await f.emit('b', 'add-from-library', { kind: 'success' })
    await f.emit('c', 'add-from-library', { kind: 'error', text: 'failed' })
    await f.emit('c', 'clear', { kind: 'success' })
    assert.deepEqual(f.calls, [['library', 'b']])
    stop()
  })

  it('unregisters before remount so a single acknowledgment triggers once', async () => {
    const f = fixture()
    const first = listenComposerAddCommands(f.ctx, f.actions)
    first()
    const next = listenComposerAddCommands(f.ctx, f.actions)
    await f.emit('a', 'add-from-library', { kind: 'success' })
    assert.deepEqual(f.calls, [['library', 'a']])
    next()
    next()
    await f.emit('a', 'add-from-library', { kind: 'success' })
    assert.equal(f.calls.length, 1)
    assert.equal(f.listeners.size, 0)
  })
})
