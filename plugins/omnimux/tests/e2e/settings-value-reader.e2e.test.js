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

test('E2E: retired settingsScope service no longer bypasses the login gate', async () => {
  // Regression for the #3773 removal: DSH 0.2.1 ships no `settingsScope` service, so
  // this module installs nothing on a host that exposes only the retired binder. The
  // reader must stay empty and the gate must keep prompting — a silent bypass here
  // would let an unconfigured account generate.
  const binder = { bind: () => ({ getSnapshot: () => ({ value: customKeyValue() }) }) }
  const read = installSettingsValueReader({ ctx: fakeCtx({ settingsScope: binder }), namespace: 'omnimux' })
  assert.equal(typeof read, 'function')
  assert.equal(read(), undefined, 'the retired service must never be read')
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
  assert.equal(bypassed, null, 'a retired-settingsScope host must not bypass the gate')
  assert.equal(getSnapshot().phase, 'prompt')
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
