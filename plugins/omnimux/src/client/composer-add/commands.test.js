import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { registerComposerAddCommands } from './commands.js'

const t = (key) => ({
  'composerAdd.addFile': '添加文件或文件夹',
  'composerAdd.fromLibrary': '从资产库添加',
}[key] || key)

function makeCtx(capabilities = { clientAction: true }) {
  const registrations = []
  const effects = []
  return {
    registrations,
    effects,
    ctx: {
      inject(deps, callback) {
        assert.deepEqual(deps, ['commandUi'])
        callback({ commandUi: {
          capabilities,
          register(row) { registrations.push(row); return () => { row.stopped = true } },
        } })
      },
      effect(factory) { effects.push(factory) },
    },
  }
}

describe('registerComposerAddCommands', () => {
  it('registers both native command-list entries as session-bound client actions', async () => {
    const { ctx, registrations } = makeCtx()
    const calls = []
    registerComposerAddCommands(ctx, {
      t,
      onAddFile: (...args) => { calls.push(['file', ...args]) },
      onAddLibrary: (...args) => { calls.push(['library', ...args]) },
    })
    assert.deepEqual(registrations.map(row => [row.name, row.description, row.ui.kind]), [
      ['add-file', '添加文件或文件夹', 'clientAction'],
      ['add-from-library', '从资产库添加', 'clientAction'],
    ])
    const signal = new AbortController().signal
    const restore = () => {}
    await registrations[0].ui.run({ session: { sessionId: 's1' }, signal, restoreComposerFocus: restore })
    await registrations[1].ui.run({ session: { sessionId: 's2' }, signal, restoreComposerFocus: restore })
    assert.deepEqual(calls.map(([kind, sessionId, actionSignal, actionRestore]) => [kind, sessionId, actionSignal, actionRestore]), [
      ['file', 's1', signal, restore],
      ['library', 's2', signal, restore],
    ])
    assert.equal(calls[0][4].aborted, false)
    assert.equal(calls[0][4], calls[1][4])
  })

  it('cleans both registrations through the caller effect', () => {
    const { ctx, registrations, effects } = makeCtx()
    registerComposerAddCommands(ctx, { t, onAddFile() {}, onAddLibrary() {} })
    effects[0]()()
    assert.equal(registrations.every(row => row.stopped), true)
  })

  it('does not register client actions on a runtime without the explicit capability', () => {
    const { ctx, registrations, effects } = makeCtx({})
    const unavailable = []
    registerComposerAddCommands(ctx, {
      t,
      onAddFile() { throw new Error('must not run') },
      onAddLibrary() { throw new Error('must not run') },
      onClientActionUnavailable() { unavailable.push('notice') },
    })
    assert.deepEqual(registrations, [])
    assert.deepEqual(effects, [])
    assert.deepEqual(unavailable, ['notice'])
  })

  it('registers both direct entries after a capability-bearing runtime reload', () => {
    const oldRuntime = makeCtx({})
    registerComposerAddCommands(oldRuntime.ctx, { t, onAddFile() {}, onAddLibrary() {} })
    assert.equal(oldRuntime.registrations.length, 0)

    const upgradedRuntime = makeCtx({ clientAction: true })
    registerComposerAddCommands(upgradedRuntime.ctx, { t, onAddFile() {}, onAddLibrary() {} })
    assert.deepEqual(upgradedRuntime.registrations.map(row => row.name), ['add-file', 'add-from-library'])
  })

  it('settles a delayed old registration on dispose without aborting its replacement', async () => {
    const first = makeCtx()
    let oldRegistrationSignal
    let oldWrites = 0
    registerComposerAddCommands(first.ctx, {
      t,
      onAddFile(_sessionId, _signal, _restore, registrationSignal) {
        oldRegistrationSignal = registrationSignal
        return new Promise((resolve) => {
          registrationSignal.addEventListener('abort', () => resolve(), { once: true })
          queueMicrotask(() => { if (!registrationSignal.aborted) oldWrites += 1 })
        })
      },
      onAddLibrary() {},
    })
    const pending = first.registrations[0].ui.run({
      session: { sessionId: 's1' }, signal: new AbortController().signal, restoreComposerFocus() {},
    })
    first.effects[0]()()
    await pending
    assert.equal(oldRegistrationSignal.aborted, true)
    assert.equal(oldWrites, 0)

    const replacement = makeCtx()
    let replacementRegistrationSignal
    registerComposerAddCommands(replacement.ctx, {
      t,
      onAddFile(_sessionId, _signal, _restore, registrationSignal) { replacementRegistrationSignal = registrationSignal },
      onAddLibrary() {},
    })
    await replacement.registrations[0].ui.run({
      session: { sessionId: 's1' }, signal: new AbortController().signal, restoreComposerFocus() {},
    })
    assert.equal(replacementRegistrationSignal.aborted, false)
  })
})
