import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { test } from 'node:test'
import { executeOmnimuxMedia } from './execute.js'
import { createMediaTaskRecord, saveMediaTaskRecord, getMediaTaskRecord, findMediaTaskByRequestKey } from './task-store.js'

async function isolated(run) {
  const home = mkdtempSync(join(tmpdir(), 'media-config-intent-3312-'))
  const previousHome = process.env.DSH_HOME
  const previousFetch = globalThis.fetch
  process.env.DSH_HOME = home
  globalThis.fetch = async () => { throw new Error('Real network access is forbidden in this fixture') }
  try { await run(home) } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    globalThis.fetch = previousFetch
    assert.ok(isAbsolute(home) && home.startsWith(join(tmpdir(), 'media-config-intent-3312-')))
    rmSync(home, { recursive: true, force: true })
  }
}

function registered() {
  return { defaultProvider: 'custom', providers: { custom: {
    protocol: 'openai-media', baseUrl: 'https://custom.fixture.invalid/v1',
    apiKeyEnv: 'OMNIMUX_MEDIA_KEY_CUSTOM', models: { image: 'gpt-image-2.5' },
  } } }
}

function settings() {
  return { scenarioBindings: { image: { channel: 'byok', provider: 'custom' } },
    byokProviders: [{ provider: 'custom', endpoint: 'https://custom.fixture.invalid/v1',
      models: { image: 'gpt-image-2.5' }, capabilities: ['image'], saveState: 'ready' }] }
}

function completedImage() {
  return new Response(JSON.stringify({ status: 'completed', data: [{ b64_json: 'cG5n' }] }),
    { headers: { 'content-type': 'application/json' } })
}

function rejectionInput(home, requestKey, counters) {
  return { model: 'gpt-image-2.5', prompt: 'synthetic custom image', dest: join(home, requestKey + '.png'),
    requestKey, media: registered(), env: { OMNIMUX_MEDIA_KEY_CUSTOM: 'synthetic-trusted-config-key' },
    credentials: { async resolve() { counters.credentials++; return { value: 'synthetic-service-key' } } },
    runtime: { async execute(request) {
      counters.runtime++
      assert.equal(request.providerId, 'custom')
      assert.equal(request.modelId, 'custom-image')
      assert.equal(request.input.model, 'gpt-image-2.5')
      return { taskId: 'synthetic-task', outputs: [{ type: 'image', url: 'data:image/png;base64,cG5n' }] }
    } },
    fetcher: async () => { counters.http++; return completedImage() },
  }
}

function assertUntouched(input, counters) {
  assert.deepEqual(counters, { credentials: 0, runtime: 0, http: 0 })
  assert.equal(existsSync(input.dest), false)
  assert.equal(findMediaTaskByRequestKey(input.requestKey), null)
}

function acceptedTask(requestKey) {
  const record = createMediaTaskRecord({ capability: 'image', model: 'gpt-image-2.5',
    providerId: 'custom', protocol: 'openai-media', baseUrl: 'https://custom.fixture.invalid/v1',
    wireModel: 'gpt-image-2.5', taskPath: 'images/generations', requestKey,
    credentialRef: 'OMNIMUX_MEDIA_KEY_CUSTOM' })
  record.status = 'submitted'
  record.upstreamTaskId = 'accepted-custom-task-3312'
  saveMediaTaskRecord(record)
  return getMediaTaskRecord(record.taskRef)
}

test('3312: trusted custom Config accepts a bare known model without runtime settings on the real HTTP and runtime execution paths', async () => isolated(async (home) => {
  const calls = []
  const dest = join(home, 'http-image.png')
  const result = await executeOmnimuxMedia('image', {
    model: 'gpt-image-2.5', prompt: 'synthetic custom image', dest, media: registered(),
    env: { OMNIMUX_MEDIA_KEY_CUSTOM: 'synthetic-trusted-config-key' },
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method, auth: new Headers(init.headers).get('authorization'), body: JSON.parse(init.body) })
      return completedImage()
    },
  })
  assert.equal(result.mode, 'live')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://custom.fixture.invalid/v1/images/generations')
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].auth, 'Bearer synthetic-trusted-config-key')
  assert.equal(calls[0].body.model, 'gpt-image-2.5')
  assert.equal(readFileSync(dest, 'utf8'), 'png')
  assert.equal(getMediaTaskRecord(result.taskRef).providerId, 'custom')
  assert.equal(getMediaTaskRecord(result.taskRef).status, 'ready')

  const counters = { credentials: 0, runtime: 0, http: 0 }
  const input = rejectionInput(home, 'bare-runtime-control', counters)
  const runtimeResult = await executeOmnimuxMedia('image', input)
  assert.equal(runtimeResult.mode, 'live')
  assert.deepEqual(counters, { credentials: 0, runtime: 1, http: 0 })
  assert.equal(readFileSync(input.dest, 'utf8'), 'png')
  assert.equal(getMediaTaskRecord(runtimeResult.taskRef).baseUrl, 'https://custom.fixture.invalid/v1')
}))

test('3312: trusted custom Config rejects explicit standard and cheap pool intent before credentials, runtime, HTTP or outputs', async () => isolated(async (home) => {
  for (const intent of [{ group: 'standard' }, { allowedGroups: ['cheap'] }, { model: 'gpt-image-2.5@standard' }]) {
    const counters = { credentials: 0, runtime: 0, http: 0 }
    const input = Object.assign(rejectionInput(home, 'official-intent', counters), intent)
    await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'unknown-group' })
    assertUntouched(input, counters)
  }
}))

test('3312: trusted custom Config rejects inline byok-openai intent instead of submitting to its configured custom origin', async () => isolated(async (home) => {
  const counters = { credentials: 0, runtime: 0, http: 0 }
  const input = rejectionInput(home, 'different-byok-provider', counters)
  input.model = 'gpt-image-2.5@byok-openai'
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'unknown-group' })
  assertUntouched(input, counters)
}))

test('3312: explicit custom provider with an official standard group is rejected before all execution dependencies', async () => isolated(async (home) => {
  const counters = { credentials: 0, runtime: 0, http: 0 }
  const input = rejectionInput(home, 'explicit-provider-conflict', counters)
  input.provider = 'custom'
  input.group = 'standard'
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'unknown-group' })
  assertUntouched(input, counters)
}))

test('3312: accepted custom tasks retain their origin and handle when pending or changed settings lack a credential service, never trusting stale dedicated env', async () => isolated(async (home) => {
  const pending = settings()
  pending.scenarioBindings.image = { channel: 'pending' }
  const changed = settings()
  changed.byokProviders[0].endpoint = 'https://replacement.fixture.invalid/v1'
  const saving = settings()
  saving.byokProviders[0].saveState = 'pending'
  let fixture = 0
  for (const current of [pending, changed, saving]) {
    fixture++
    const record = acceptedTask('accepted-no-service-' + fixture)
    const counters = { credentials: 0, runtime: 0, http: 0 }
    const input = rejectionInput(home, 'collect-no-service-' + fixture, counters)
    input.taskRef = record.taskRef
    input.runtimeSettings = current
    input.env = { OMNIMUX_MEDIA_KEY_CUSTOM: 'forged-stale-dedicated', OMNIMUX_MEDIA_KEY: 'forged-generic', OMNIMUX_API_KEY: 'sk-forged-official' }
    delete input.credentials
    await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'omnimux-unconfigured' })
    assertUntouched(input, counters)
    assert.deepEqual(getMediaTaskRecord(record.taskRef), record)
    assert.equal(findMediaTaskByRequestKey(record.requestKey).taskRef, record.taskRef)
  }
}))

test('3312: same-origin ready custom provider still requires the current credential service for accepted task collection', async () => isolated(async (home) => {
  const record = acceptedTask('accepted-ready-no-service')
  const counters = { credentials: 0, runtime: 0, http: 0 }
  const input = rejectionInput(home, 'ready-no-service-collect', counters)
  input.taskRef = record.taskRef
  input.runtimeSettings = settings()
  input.env = { OMNIMUX_MEDIA_KEY_CUSTOM: 'forged-stale-dedicated' }
  delete input.credentials
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'omnimux-unconfigured' })
  assertUntouched(input, counters)
  assert.deepEqual(getMediaTaskRecord(record.taskRef), record)
  assert.equal(findMediaTaskByRequestKey(record.requestKey).taskRef, record.taskRef)
}))
