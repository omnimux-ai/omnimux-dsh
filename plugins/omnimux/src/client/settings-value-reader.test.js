import assert from 'node:assert/strict'
import { test } from 'node:test'

import { installSettingsValueReader } from './settings-value-reader.js'

/** Fake context whose `inject` resolves the requested services immediately. */
function fakeCtx({ settingsScope, configForms } = {}) {
  return {
    inject(names, callback) {
      const context = {}
      if (names.includes('settingsScope') && settingsScope) context.settingsScope = settingsScope
      if (names.includes('configForms') && configForms) context.configForms = configForms
      callback(context)
    },
  }
}

test('configForms: reads the live namespace value', () => {
  let current = { value: undefined }
  const controller = { getSnapshot: () => current }
  let queriedId
  const forms = {
    get(entryId) {
      queriedId = entryId
      return controller
    },
  }
  const read = installSettingsValueReader({ ctx: fakeCtx({ configForms: forms }), namespace: 'omnimux' })
  assert.equal(typeof read, 'function')
  assert.equal(queriedId, 'omnimux')
  current = { value: { runtimeMode: 'official' } }
  assert.deepEqual(read(), { runtimeMode: 'official' })
})

test('configForms: reads through get(entryId) and prefers the newer service', () => {
  const calls = []
  const forms = {
    get(entryId) {
      calls.push(entryId)
      return { getSnapshot: () => ({ status: 'ready', value: { runtimeMode: 'custom' } }) }
    },
  }
  const read = installSettingsValueReader({ ctx: fakeCtx({ configForms: forms }), namespace: 'omnimux' })
  assert.deepEqual(read(), { runtimeMode: 'custom' })
  assert.deepEqual(calls, ['omnimux'])
})

test('both services: configForms wins regardless of injection order', () => {
  const binder = { bind: () => ({ getSnapshot: () => ({ value: { runtimeMode: 'official' } }) }) }
  const forms = { get: () => ({ getSnapshot: () => ({ value: { runtimeMode: 'custom' } }) }) }
  const read = installSettingsValueReader({
    ctx: fakeCtx({ settingsScope: binder, configForms: forms }),
    namespace: 'omnimux',
  })
  assert.deepEqual(read(), { runtimeMode: 'custom' })
})

test('no supported service: reader returns undefined without throwing', () => {
  const read = installSettingsValueReader({ ctx: fakeCtx({}), namespace: 'omnimux' })
  assert.equal(read(), undefined)
})

test('malformed services are ignored', () => {
  const read = installSettingsValueReader({
    ctx: fakeCtx({ settingsScope: {}, configForms: { get: () => null } }),
    namespace: 'omnimux',
  })
  assert.equal(read(), undefined)
})

test('missing ctx.inject: no reader is installed', () => {
  assert.equal(installSettingsValueReader({ ctx: {}, namespace: 'omnimux' }), null)
  assert.equal(installSettingsValueReader({ ctx: null, namespace: 'omnimux' }), null)
})
