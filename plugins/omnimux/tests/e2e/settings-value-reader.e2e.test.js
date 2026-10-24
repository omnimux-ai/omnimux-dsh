import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  cancel,
  getSnapshot,
  installAuthGlobal,
  resetAuthGate,
  setRuntimeChoiceReader,
} from '../../src/client/auth-gate.js'
import { installSettingsValueReader } from '../../src/client/settings-value-reader.js'

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

/** Install the real auth gate against a fake device flow and a logged-out host. */
function installGate() {
  const win = {}
  installAuthGlobal(win, {
    getStatus: async () => ({ ok: true, status: 200, body: { logged_in: false, username: 'ada' } }),
    runLogin: () => ({ start() {}, stop() {}, cancel() {} }),
    peekCache: () => null,
  })
  resetAuthGate()
  return win
}

function customKeyValue() {
  return {
    runtimeMode: 'key',
    runtimeKeyEndpoint: 'https://example.test/v1',
    runtimeKeyModel: 'demo',
    runtimeKeyVerified: true,
  }
}

function cleanup() {
  setRuntimeChoiceReader(null)
  cancel('done')
  resetAuthGate()
}

test('E2E: 0.2.x configForms value lets a custom key generate without the official window', async () => {
  const forms = {
    get: () => ({ getSnapshot: () => ({ status: 'ready', value: customKeyValue() }) }),
  }
  const read = installSettingsValueReader({ ctx: fakeCtx({ configForms: forms }), namespace: 'omnimux' })
  assert.equal(typeof read, 'function')
  setRuntimeChoiceReader(read)

  const win = installGate()
  let bypassed = null
  await win.__omnimuxAuth.ensureLogin({
    kind: 'explicit',
    action: 'generate',
    onSuccess: profile => {
      bypassed = profile
    },
  })
  assert.equal(bypassed?.runtimeBypass, true)
  assert.equal(getSnapshot().phase, 'closed')
  cleanup()
})

test('E2E: 0.1.5 settingsScope value keeps the same bypass behaviour', async () => {
  const binder = { bind: () => ({ getSnapshot: () => ({ value: customKeyValue() }) }) }
  const read = installSettingsValueReader({ ctx: fakeCtx({ settingsScope: binder }), namespace: 'omnimux' })
  setRuntimeChoiceReader(read)

  const win = installGate()
  let bypassed = null
  await win.__omnimuxAuth.ensureLogin({
    kind: 'explicit',
    action: 'generate',
    onSuccess: profile => {
      bypassed = profile
    },
  })
  assert.equal(bypassed?.runtimeBypass, true)
  assert.equal(getSnapshot().phase, 'closed')
  cleanup()
})

test('E2E: 0.2.x official value still prompts for the official window', async () => {
  const forms = {
    get: () => ({ getSnapshot: () => ({ status: 'ready', value: { runtimeMode: 'official' } }) }),
  }
  setRuntimeChoiceReader(installSettingsValueReader({ ctx: fakeCtx({ configForms: forms }), namespace: 'omnimux' }))

  const win = installGate()
  await win.__omnimuxAuth.ensureLogin({
    kind: 'explicit',
    action: 'generate',
    onSuccess: () => {
      throw new Error('official must still prompt')
    },
  })
  assert.equal(getSnapshot().phase, 'prompt')
  cleanup()
})
