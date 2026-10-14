import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { executeOmnimuxMedia } from './execute.js'
import { mountMedia } from './mount.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let fixtureHome, previousHome
before(() => { previousHome = process.env.DSH_HOME; fixtureHome = mkdtempSync(join(tmpdir(), 'scene-boundary-home-')); process.env.DSH_HOME = fixtureHome })
after(() => { if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; rmSync(fixtureHome, { recursive: true, force: true }) })

function settings() {
  return {
    runtimeMode: 'agent', runtimeAgentId: 'fixture-agent', runtimeAgentVerified: true,
    scenarioBindings: { text: { channel: 'agent' }, image: { channel: 'byok', provider: 'custom' }, video: { channel: 'pending' } },
    byokProviders: [{ provider: 'custom', endpoint: 'https://media.fixture.invalid/v1', models: { image: 'fixture-image' }, capabilities: ['image'] }],
  }
}
function registered() {
  return { defaultProvider: 'custom', providers: { custom: { protocol: 'openai-media', baseUrl: 'https://media.fixture.invalid/v1', apiKeyEnv: 'OMNIMUX_MEDIA_KEY_CUSTOM', models: { image: 'fixture-image' } } } }
}

test('3312: image binding never borrows a pending video choice, with zero credentials and HTTP', async () => {
  let credentials = 0, http = 0
  await assert.rejects(() => executeOmnimuxMedia('video', {
    dest: '/tmp/unused-3312.mp4', prompt: 'fixture', runtimeSettings: settings(), media: registered(),
    credentials: { async resolve() { credentials++; return { value: 'fixture-key' } } },
    fetcher: async () => { http++; throw new Error('unexpected HTTP') },
  }), { code: 'omnimux-unconfigured' })
  assert.equal(credentials, 0)
  assert.equal(http, 0)
})

test('3312: configured provider without an exact registered adapter is rejected before HTTP', async () => {
  let http = 0
  await assert.rejects(() => executeOmnimuxMedia('image', {
    dest: '/tmp/unused-3312.png', prompt: 'fixture', runtimeSettings: settings(),
    credentials: { async resolve(ref) { assert.equal(ref, 'OMNIMUX_MEDIA_KEY_CUSTOM'); return { value: 'fixture-key' } } },
    fetcher: async () => { http++; throw new Error('unexpected HTTP') },
  }), { code: 'needs-provider' })
  assert.equal(http, 0)
})

test('3312: partial bindings cannot imply other media capabilities through verified flags', async () => {
  let calls = 0
  const current = { runtimeMode: 'key', runtimeKeyVerified: true, runtimeMediaProvider: 'fal', runtimeMediaImage: true, runtimeMediaVideo: true,
    scenarioBindings: { image: { channel: 'official' } } }
  await assert.rejects(() => executeOmnimuxMedia('video', {
    dest: '/tmp/unused-partial-3312.mp4', prompt: 'fixture', runtimeSettings: current,
    credentials: { async resolve() { calls++; return { value: 'fixture-key' } } },
    fetcher: async () => { calls++; throw new Error('unexpected HTTP') },
  }), { code: 'omnimux-unconfigured' })
  assert.equal(calls, 0)
})

test('3312: mounted pending media does not call credentials or executor', () => {
  let api, calls = 0
  mountMedia({ get(name) { if (name === 'settings') return { get: settings }; if (name === 'credentials') return { async resolve() { calls++; } } },
    tools: { register() {} }, provide(name, value) { if (name === 'videoGenerate') api = value } },
  { kind: 'video', media: registered(), jsonOut: {}, execute() { calls++; throw new Error('unexpected executor') } })
  assert.throws(() => api.execute({ dest: '/tmp/unused-mounted-3312.mp4', prompt: 'fixture' }), { code: 'omnimux-unconfigured' })
  assert.equal(calls, 0)
})

test('3312: registered provider with a different endpoint is rejected and never submits', async () => {
  const media = registered(); media.providers.custom.baseUrl = 'https://other.fixture.invalid/v1'
  let http = 0
  await assert.rejects(() => executeOmnimuxMedia('image', {
    dest: '/tmp/unused-mismatch-3312.png', prompt: 'fixture', runtimeSettings: settings(), media,
    credentials: { async resolve(ref) { assert.equal(ref, 'OMNIMUX_MEDIA_KEY_CUSTOM'); return { value: 'fixture-key' } } },
    fetcher: async () => { http++; throw new Error('unexpected HTTP') },
  }), { code: 'needs-provider' })
  assert.equal(http, 0)
})

test('3312: malformed model and conflicting channels fail before all credential and HTTP dependencies', async () => {
  let calls = 0
  const dependencies = { dest: '/tmp/unused-invalid-3312.png', prompt: 'fixture', runtimeSettings: settings(), media: registered(),
    credentials: { async resolve() { calls++; throw new Error('unexpected credential') } },
    fetcher: async () => { calls++; throw new Error('unexpected HTTP') } }
  for (const request of [
    { model: 7 }, { model: '' }, { model: 'fixture@byok-' }, { model: 'fixture@byok-custom@extra' },
    { model: 'fixture@byok-custom', provider: 'fal' }, { model: 'fixture@byok-custom', group: 'standard' },
    { model: 'fixture@byok-custom', allowedGroups: ['byok-fal'] }, { allowedGroups: ['standard', 'byok-custom'] },
    { allowedGroups: [false] },
  ]) await assert.rejects(() => executeOmnimuxMedia('image', Object.assign({}, dependencies, request)), { code: 'omnimux-invalid-request' })
  assert.equal(calls, 0)
})

test('3312: native provider metadata is not an implicit adapter even when verified', async () => {
  let http = 0
  const current = { scenarioBindings: { image: { channel: 'byok', provider: 'fal' } },
    byokProviders: [{ provider: 'fal', endpoint: 'https://native.fixture.invalid/v1', models: { image: 'fixture-image' }, capabilities: ['image'], verified: true }] }
  await assert.rejects(() => executeOmnimuxMedia('image', {
    dest: '/tmp/unused-native-3312.png', prompt: 'fixture', runtimeSettings: current,
    credentials: { async resolve(ref) { assert.equal(ref, 'OMNIMUX_MEDIA_KEY_FAL'); return { value: 'fixture-key' } } },
    fetcher: async () => { http++; throw new Error('unexpected native HTTP') },
  }), { code: 'needs-provider' })
  assert.equal(http, 0)
})
