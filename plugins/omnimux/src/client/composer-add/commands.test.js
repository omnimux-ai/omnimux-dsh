import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  decorateFileCommand,
  decorateLibraryCommand,
  installComposerAddCommands,
  listenComposerAddCommands,
  FILE_COMMAND,
  LIBRARY_COMMAND,
} from './commands.js'

function eventFixture() {
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
      openFile(id) { calls.push(['file', id]) },
      openLibrary(id) { calls.push(['library', id]) },
    },
    async emit(id, name, result) {
      for (const listener of listeners) await listener(id, name, result)
    },
  }
}

describe('composer command acknowledgment', () => {
  it('handles only successful owned commands with the event session', async () => {
    const f = eventFixture()
    const stop = listenComposerAddCommands(f.ctx, f.actions)
    await f.emit('a', 'add-file', { kind: 'success' })
    await f.emit('b', 'add-from-library', { kind: 'success' })
    await f.emit('c', 'add-from-library', { kind: 'error', text: 'failed' })
    await f.emit('c', 'clear', { kind: 'success' })
    assert.deepEqual(f.calls, [['file', 'a'], ['library', 'b']])
    stop()
  })

  it('unregisters before remount so a single acknowledgment triggers once', async () => {
    const f = eventFixture()
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

describe('composer library command decoration', () => {
  it('opens the picker on the same click that closes the menu', () => {
    const decorations = []
    const calls = []
    const commandUi = {
      decorate(spec) {
        decorations.push(spec)
        return () => { decorations.length = 0 }
      },
    }
    const stop = decorateLibraryCommand(commandUi, {
      openLibrary(id) { calls.push(id) },
    })
    assert.equal(decorations.length, 1)
    assert.equal(decorations[0].name, LIBRARY_COMMAND)
    assert.equal(decorations[0].ui.kind, 'action')
    decorations[0].ui.run({ sessionId: 's1' })
    assert.deepEqual(calls, ['s1'])
    stop()
    assert.equal(decorations.length, 0)
  })

  it('keeps the click-time decoration and the delayed acknowledgment together', () => {
    const calls = []
    const listeners = new Set()
    const decorations = new Map()
    const ctx = {
      on(event, listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      commandUi: {
        decorate(spec) {
          decorations.set(spec.name, spec)
          return () => { decorations.delete(spec.name) }
        },
      },
    }
    const stop = installComposerAddCommands(ctx, {
      openLibrary(id) { calls.push(['library', id]) },
      openFile(id) { calls.push(['file', id]) },
    })
    assert.equal(listeners.size, 1)
    assert.equal(decorations.get(LIBRARY_COMMAND).ui.kind, 'action')
    assert.equal(decorations.get(FILE_COMMAND).ui.kind, 'action')
    decorations.get(LIBRARY_COMMAND).ui.run({ sessionId: 's1' })
    decorations.get(FILE_COMMAND).ui.run({ sessionId: 's2' })
    assert.deepEqual(calls, [['library', 's1'], ['file', 's2']])
    stop()
    assert.equal(listeners.size, 0)
    assert.equal(decorations.size, 0)
  })

  it('falls back to the acknowledgment when the host cannot decorate', async () => {
    const f = eventFixture()
    const stop = installComposerAddCommands(f.ctx, f.actions)
    await f.emit('s1', LIBRARY_COMMAND, { kind: 'success' })
    await f.emit('s2', FILE_COMMAND, { kind: 'success' })
    assert.deepEqual(f.calls, [['library', 's1'], ['file', 's2']])
    stop()
  })
})
