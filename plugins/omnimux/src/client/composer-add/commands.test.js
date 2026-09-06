import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { registerComposerAddCommands } from './commands.js'

function makeCtx(opts) {
  const registrations = []
  const effects = []
  const defaultUi = {
    register(contribution) {
      registrations.push(contribution)
      return () => { contribution.__stopped = true }
    },
  }
  const ui = opts && 'commandUi' in opts ? opts.commandUi : defaultUi
  const ctx = {
    inject(deps, cb) {
      assert.deepEqual(deps, ['commandUi'])
      cb(ui == null ? {} : { commandUi: ui })
    },
    effect(factory, label) {
      effects.push({ factory, label })
    },
  }
  return { ctx, registrations, effects, ui }
}

const t = (key) => ({
  'composerAdd.addFile': '添加文件或文件夹',
  'composerAdd.fromLibrary': '从资产库添加',
  'composerAdd.pickFiles': '选择文件…',
  'composerAdd.pickFolder': '选择文件夹…',
  'composerAdd.openLibrary': '打开资产库…',
}[key] || key)

function makeActions() {
  const calls = []
  return {
    actions: {
      t,
      onAddFile: () => calls.push('file'),
      onAddFolder: () => calls.push('folder'),
      onAddLibrary: () => calls.push('library'),
    },
    calls,
  }
}

describe('registerComposerAddCommands', () => {
  it('registers add-file and add-from-library contributions with descriptions', () => {
    const { ctx, registrations } = makeCtx()
    const { actions } = makeActions()
    registerComposerAddCommands(ctx, actions)
    assert.equal(registrations.length, 2)
    assert.equal(registrations[0].name, 'add-file')
    assert.equal(registrations[0].description, '添加文件或文件夹')
    assert.equal(registrations[1].name, 'add-from-library')
    assert.equal(registrations[1].description, '从资产库添加')
    for (const row of registrations) {
      assert.equal(row.available(), true)
      assert.equal(row.ui.kind, 'popupSelect')
    }
  })

  it('add-file popup offers file and folder rows', async () => {
    const { ctx, registrations } = makeCtx()
    const { actions } = makeActions()
    registerComposerAddCommands(ctx, actions)
    const fileOptions = await registrations[0].ui.options()
    assert.deepEqual(fileOptions, [
      { id: 'file', label: '选择文件…' },
      { id: 'folder', label: '选择文件夹…' },
    ])
    const libOptions = await registrations[1].ui.options()
    assert.deepEqual(libOptions, [{ id: 'open', label: '打开资产库…' }])
  })

  it('onSelect dispatches file, folder, and library actions', () => {
    const { ctx, registrations } = makeCtx()
    const { actions, calls } = makeActions()
    registerComposerAddCommands(ctx, actions)
    registrations[0].ui.onSelect({ id: 'file' })
    registrations[0].ui.onSelect({ id: 'folder' })
    registrations[1].ui.onSelect({ id: 'open' })
    assert.deepEqual(calls, ['file', 'folder', 'library'])
  })

  it('falls back folder selection to onAddFile when onAddFolder is missing', () => {
    const { ctx, registrations } = makeCtx()
    const calls = []
    registerComposerAddCommands(ctx, {
      t,
      onAddFile: () => calls.push('file'),
      onAddLibrary: () => calls.push('library'),
    })
    registrations[0].ui.onSelect({ id: 'folder' })
    assert.deepEqual(calls, ['file'])
  })

  it('registers a cleanup effect that stops both contributions', () => {
    const { ctx, registrations, effects } = makeCtx()
    const { actions } = makeActions()
    registerComposerAddCommands(ctx, actions)
    assert.equal(effects.length, 1)
    const cleanup = effects[0].factory()
    cleanup()
    assert.equal(registrations[0].__stopped, true)
    assert.equal(registrations[1].__stopped, true)
    cleanup()
  })

  it('is a graceful no-op when inject or commandUi is unavailable', () => {
    const { actions } = makeActions()
    assert.doesNotThrow(() => registerComposerAddCommands({}, actions))
    const { ctx, registrations } = makeCtx({ commandUi: undefined })
    assert.doesNotThrow(() => registerComposerAddCommands(ctx, actions))
    assert.equal(registrations.length, 0)
    const ctxB = makeCtx({ commandUi: { register: null } })
    assert.doesNotThrow(() => registerComposerAddCommands(ctxB.ctx, actions))
  })
})
