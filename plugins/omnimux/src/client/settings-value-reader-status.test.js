import assert from 'node:assert/strict'
import { test } from 'node:test'

import { installSettingsValueReader } from './settings-value-reader.js'

/** Client context whose `inject` resolves the requested services immediately. */
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

test('configForms: loading and unavailable namespaces never count as readable', () => {
  let current = { status: 'loading', value: undefined }
  const forms = { get: () => ({ getSnapshot: () => current }) }
  const read = installSettingsValueReader({ ctx: fakeCtx({ configForms: forms }), namespace: 'omnimux' })
  assert.equal(read(), undefined, 'loading has no readable value yet')

  current = { status: 'ready', value: { runtimeMode: 'key' } }
  assert.deepEqual(read(), { runtimeMode: 'key' }, 'ready exposes the value')

  // The Host stopped serving the namespace while the last value is still there.
  current = { status: 'unavailable', value: { runtimeMode: 'key' } }
  assert.equal(read(), undefined, 'a stale value must not read as a choice')
})

test('settingsScope: snapshots without a status field keep reading their value', () => {
  const scope = { getSnapshot: () => ({ value: { runtimeMode: 'key' } }) }
  const binder = { bind: () => scope }
  const read = installSettingsValueReader({ ctx: fakeCtx({ settingsScope: binder }), namespace: 'omnimux' })
  assert.deepEqual(read(), { runtimeMode: 'key' })
})
