import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountTextComplete } from './mount.js'
import { parseTextConfig } from './catalog.js'
import { parseGateConfig } from '../gate/config.js'

function customSettings() {
  return {
    runtimeMode: 'agent', runtimeAgentId: 'codex', runtimeAgentVerified: true,
    scenarioBindings: { text: { channel: 'byok', provider: 'custom' }, analysis: { channel: 'official' } },
    byokProviders: [{ provider: 'custom', endpoint: 'https://custom.test/v1', models: { text: 'saved-text' }, capabilities: ['text'] }],
  }
}
function getter(value) { return { get: (section) => section === 'omnimux' ? value : undefined } }
function harness(settings, dedicatedKey = 'synthetic-custom-key') {
  const calls = { credentials: [], http: [], stream: [], agent: [], attachments: [] }
  let api
  const credentials = { async resolve(ref) {
    calls.credentials.push(ref)
    if (ref === 'OMNIMUX_MEDIA_KEY_CUSTOM') return dedicatedKey ? { value: dedicatedKey } : undefined
    if (ref === 'OMNIMUX_BYOK_API_KEY') return { value: 'synthetic-unrelated-legacy-key' }
    return undefined
  } }
  const llm = { async * stream(options) {
    calls.stream.push(options)
    yield { type: 'text-delta', text: 'official reply' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } }
  mountTextComplete({
    tools: { register() {} },
    provide(name, value) { if (name === 'textComplete') api = value },
    get(name) {
      if (name === 'settings') return settings
      if (name === 'credentials') return credentials
      if (name === 'llm') return llm
      if (name === 'attachments') return { async saveImage(request) {
        calls.attachments.push(request)
        return { attachmentId: 'synthetic-image', mediaType: 'image/png', bytes: 12, width: 1, height: 1 }
      } }
      return undefined
    },
  }, { text: parseTextConfig(undefined), gate: parseGateConfig(undefined) }, {}, (error) => { throw error })
  const dependencies = {
    prompt: 'write', env: {},
    fetcher: async (url, options) => {
      calls.http.push({ url, authorization: options.headers.authorization, body: JSON.parse(options.body) })
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'custom reply' } }] }) }
    },
    agentRun: async (request) => { calls.agent.push(request); return 'local reply' },
  }
  return { calls, execute: (request) => api.execute(Object.assign({}, dependencies, request)) }
}
function zeroDependencies(calls) {
  assert.deepEqual(calls.credentials, [])
  assert.deepEqual(calls.http, [])
  assert.deepEqual(calls.stream, [])
  assert.deepEqual(calls.agent, [])
  assert.deepEqual(calls.attachments, [])
}
async function rejectedIntent(request) {
  const h = harness(getter(customSettings()))
  await assert.rejects(() => h.execute(request), (error) =>
    error.code === 'omnimux-invalid-request' || error.code === 'no-candidates' || error.code === 'unknown-group')
  zeroDependencies(h.calls)
}

test('public text uses its bound record and dedicated provider key', async () => {
  const h = harness(getter(customSettings()))
  const result = await h.execute({})
  assert.equal(result.text, 'custom reply')
  assert.equal(h.calls.http.length, 1)
  assert.equal(h.calls.http.at(0).url, 'https://custom.test/v1/chat/completions')
  assert.equal(h.calls.http.at(0).body.model, 'saved-text')
  assert.equal(h.calls.http.at(0).authorization, 'Bearer synthetic-custom-key')
  assert.deepEqual(h.calls.credentials, ['OMNIMUX_MEDIA_KEY_CUSTOM'])
  assert.deepEqual(h.calls.agent, [])
  assert.deepEqual(h.calls.stream, [])
})

test('missing dedicated key never falls back to an unrelated legacy key', async () => {
  const h = harness(getter(customSettings()), '')
  await assert.rejects(() => h.execute({}), (error) => error.code === 'omnimux-unconfigured')
  assert.deepEqual(h.calls.credentials, ['OMNIMUX_MEDIA_KEY_CUSTOM'])
  assert.deepEqual(h.calls.http, [])
  assert.deepEqual(h.calls.stream, [])
  assert.deepEqual(h.calls.agent, [])
})

test('provider without an endpoint rejects before credentials or HTTP', async () => {
  const value = customSettings()
  value.byokProviders.at(0).endpoint = ''
  const h = harness(getter(value))
  await assert.rejects(() => h.execute({}), (error) => error.code === 'omnimux-unconfigured')
  zeroDependencies(h.calls)
})

test('custom text model remains outside the official whitelist and uses its bound provider', async () => {
  const h = harness(getter(customSettings()))
  const result = await h.execute({ model: 'totally-custom-model-id' })
  assert.equal(result.model, 'totally-custom-model-id')
  assert.equal(h.calls.http.at(0).body.model, 'totally-custom-model-id')
  assert.deepEqual(h.calls.credentials, ['OMNIMUX_MEDIA_KEY_CUSTOM'])
  assert.deepEqual(h.calls.stream, [])
  assert.deepEqual(h.calls.agent, [])
})

test('BYOK wire model preserves a user id that also happens to be an official alias', async () => {
  const h = harness(getter(customSettings()))
  const result = await h.execute({ model: 'grok-imagine-image-2', group: 'byok-custom' })
  assert.equal(h.calls.http.at(0).body.model, 'grok-imagine-image-2')
  assert.equal(result.model, 'grok-imagine-image-2')
})

test('explicit BYOK model wins over saved model and toolModel', async () => {
  const value = customSettings()
  value.toolModel = 'cpa:tool-default'
  const h = harness(getter(value))
  const result = await h.execute({ model: 'requested-text@byok-custom' })
  assert.equal(result.model, 'requested-text')
  assert.equal(h.calls.http.at(0).body.model, 'requested-text')
  assert.deepEqual(h.calls.credentials, ['OMNIMUX_MEDIA_KEY_CUSTOM'])
  assert.deepEqual(h.calls.stream, [])
})

test('explicit official model wins over saved provider and toolModel', async () => {
  const value = customSettings()
  value.toolModel = 'cpa:tool-default'
  const h = harness(getter(value))
  const result = await h.execute({ model: 'gemini-3.8-flash', operation: 'vision_chat' })
  assert.equal(result.model, 'gemini-3.8-flash')
  assert.equal(h.calls.stream.at(0).provider, 'omnimux')
  assert.equal(h.calls.stream.at(0).model, 'gemini-3.8-flash')
  assert.deepEqual(h.calls.http, [])
  assert.deepEqual(h.calls.credentials, [])
})

test('current describe value wins over obsolete get value', async () => {
  const current = customSettings()
  const h = harness({ describe: () => [{ ns: 'omnimux', value: current, user: current }],
    get: () => ({ runtimeMode: 'agent', runtimeAgentId: 'stale', runtimeAgentVerified: true }) })
  await h.execute({})
  assert.equal(h.calls.http.at(0).body.model, 'saved-text')
  assert.deepEqual(h.calls.agent, [])
})

test('describe raw user migration never infers text from legacy key or schema defaults', async () => {
  const h = harness({ describe: () => [{ ns: 'omnimux',
    value: { runtimeMode: 'key', scenarioBindings: { text: { channel: 'official' } } },
    user: { runtimeMode: 'key', runtimeKeyEndpoint: 'https://legacy.test/v1', runtimeKeyModel: 'legacy', runtimeKeyVerified: true },
  }] })
  await assert.rejects(() => h.execute({}), (error) => error.code === 'omnimux-unconfigured')
  zeroDependencies(h.calls)
})

test('get-only raw legacy key remains pending with zero dependencies', async () => {
  const h = harness(getter({ runtimeMode: 'key', runtimeKeyEndpoint: 'https://legacy.test/v1', runtimeKeyModel: 'legacy', runtimeKeyVerified: true }))
  await assert.rejects(() => h.execute({}), (error) => error.code === 'omnimux-unconfigured')
  zeroDependencies(h.calls)
})

test('partial provider save rejects before credentials or network', async () => {
  const value = customSettings()
  value.byokProviders.at(0).saveState = 'pending'
  const h = harness(getter(value))
  await assert.rejects(() => h.execute({}), (error) => error.code === 'omnimux-unconfigured')
  zeroDependencies(h.calls)
})

test('pending text remains local despite ready analysis', async () => {
  const value = customSettings()
  value.scenarioBindings.text = { channel: 'pending' }
  const h = harness(getter(value))
  await assert.rejects(() => h.execute({}), (error) => error.code === 'omnimux-unconfigured')
  zeroDependencies(h.calls)
})

test('BYOK inline and field conflict rejects with zero dependencies', async () => {
  await rejectedIntent({ model: 'requested-text@byok-custom', group: 'byok-openai' })
})
test('BYOK outside allowed pool rejects with zero dependencies', async () => {
  await rejectedIntent({ model: 'requested-text@byok-custom', allowedGroups: ['byok-openai'] })
})
test('non-array allowed pool rejects with zero dependencies', async () => {
  await rejectedIntent({ model: 'requested-text@byok-custom', allowedGroups: 'byok-custom' })
})
test('empty allowed row rejects with zero dependencies', async () => {
  await rejectedIntent({ model: 'requested-text@byok-custom', allowedGroups: [''] })
})
test('mixed official and BYOK pool rejects with zero dependencies', async () => {
  await rejectedIntent({ model: 'requested-text@byok-custom', allowedGroups: ['byok-custom', 'standard'] })
})
test('multiple at-signs reject with zero dependencies', async () => {
  await rejectedIntent({ model: 'requested-text@byok-custom@standard' })
})
test('official inline and field conflict rejects with zero dependencies', async () => {
  await rejectedIntent({ model: 'gemini-3.8-flash@standard', group: 'cheap' })
})
test('official outside allowed pool rejects with zero dependencies', async () => {
  await rejectedIntent({ model: 'gemini-3.8-flash@standard', allowedGroups: ['cheap'] })
})

test('inline official and local field intents cannot be exchanged before a local call', async () => {
  const h = harness(getter({ runtimeMode: 'agent', runtimeAgentId: 'codex', runtimeAgentVerified: true }))
  await assert.rejects(() => h.execute({ model: 'custom-model@standard', group: 'agent' }), { code: 'omnimux-invalid-request' })
  zeroDependencies(h.calls)
})

test('inline local and official field intents cannot be exchanged before any dependency', async () => {
  const h = harness(getter({ runtimeMode: 'agent', runtimeAgentId: 'codex', runtimeAgentVerified: true }))
  await assert.rejects(() => h.execute({ model: 'custom-model@agent', group: 'standard' }), { code: 'omnimux-invalid-request' })
  zeroDependencies(h.calls)
})

test('legacy local alias cannot erase a conflicting field channel', async () => {
  const h = harness(getter({ runtimeMode: 'agent', runtimeAgentId: 'codex', runtimeAgentVerified: true }))
  await assert.rejects(() => h.execute({ model: '@agent', group: 'byok-custom' }),
    (error) => error.code === 'omnimux-invalid-request')
  zeroDependencies(h.calls)
})

test('explicit legacy local selection must remain inside its allowed pool', async () => {
  const h = harness(getter({ runtimeMode: 'agent', runtimeAgentId: 'codex', runtimeAgentVerified: true }))
  await assert.rejects(() => h.execute({ model: '@local', allowedGroups: ['standard'] }),
    (error) => error.code === 'omnimux-invalid-request')
  zeroDependencies(h.calls)
})

test('explicit legacy agent alias preserves local selection and model', async () => {
  const h = harness(getter({ runtimeMode: 'agent', runtimeAgentId: 'codex', runtimeAgentVerified: true, runtimeAgentModel: 'local-model' }))
  const result = await h.execute({ model: '@agent' })
  assert.equal(result.model, 'codex')
  assert.equal(result.agentModel, 'local-model')
  assert.equal(h.calls.agent.length, 1)
  assert.equal(h.calls.agent.at(0).id, 'codex')
  assert.equal(h.calls.agent.at(0).model, 'local-model')
  assert.deepEqual(h.calls.credentials, [])
  assert.deepEqual(h.calls.http, [])
  assert.deepEqual(h.calls.stream, [])
})
test('explicit legacy local alias preserves local selection and model', async () => {
  const h = harness(getter({ runtimeMode: 'agent', runtimeAgentId: 'codex', runtimeAgentVerified: true, runtimeAgentModel: 'local-model' }))
  const result = await h.execute({ model: '@local' })
  assert.equal(result.model, 'codex')
  assert.equal(result.agentModel, 'local-model')
  assert.equal(h.calls.agent.length, 1)
  assert.equal(h.calls.agent.at(0).id, 'codex')
  assert.equal(h.calls.agent.at(0).model, 'local-model')
  assert.deepEqual(h.calls.credentials, [])
  assert.deepEqual(h.calls.http, [])
  assert.deepEqual(h.calls.stream, [])
})

test('text provider capability never implies analysis capability', async () => {
  const value = customSettings()
  value.scenarioBindings.analysis = { channel: 'byok', provider: 'custom' }
  const h = harness(getter(value))
  await assert.rejects(() => h.execute({ prompt: 'describe', image: 'https://asset.test/not-fetched.png' }),
    (error) => error.code === 'omnimux-unconfigured')
  zeroDependencies(h.calls)
})

test('explicitly official analysis runs while text remains pending', async () => {
  const value = customSettings()
  value.scenarioBindings.text = { channel: 'pending' }
  const h = harness(getter(value))
  const result = await h.execute({ prompt: 'describe', image: 'data:image/png;base64,iVBORw0KGgoAAAAA' })
  assert.equal(result.text, 'official reply')
  assert.equal(h.calls.stream.length, 1)
  assert.equal(h.calls.stream.at(0).provider, 'omnimux')
  assert.equal(h.calls.attachments.length, 1)
  assert.equal(h.calls.stream.at(0).messages.at(0).content.at(1).attachment.attachmentId, 'synthetic-image')
  assert.deepEqual(h.calls.agent, [])
  assert.deepEqual(h.calls.http, [])
  assert.deepEqual(h.calls.credentials, [])
})

test('explicit local media request never fetches an asset or credential', async () => {
  const h = harness(getter({ runtimeMode: 'agent', runtimeAgentId: 'codex', runtimeAgentVerified: true }))
  await assert.rejects(() => h.execute({ prompt: 'describe', model: '@local', image: 'https://asset.test/not-fetched.png' }),
    (error) => error.code === 'omnimux-unconfigured' || error.code === 'omnimux-invalid-request')
  zeroDependencies(h.calls)
})
