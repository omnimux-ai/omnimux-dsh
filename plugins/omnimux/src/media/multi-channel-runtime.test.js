import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { executeOmnimuxMedia, resolveEffectiveMediaModel, isExternalMediaProvider, EXTERNAL_MEDIA_PROVIDERS } from './execute.js'
import { DEFAULT_PROVIDER_ENDPOINTS } from '../byok/http.js'
import { mountMedia } from './mount.js'
import { OmnimuxError } from './errors.js'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let fixtureHome, previousHome
before(() => { previousHome = process.env.DSH_HOME; fixtureHome = mkdtempSync(join(tmpdir(), 'multi-runtime-home-')); process.env.DSH_HOME = fixtureHome })
after(() => { if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; rmSync(fixtureHome, { recursive: true, force: true }) })

const FAL_MEDIA = { defaultProvider: 'fal', providers: { fal: { protocol: 'openai-media', baseUrl: 'https://fal.fixture.invalid/v1', apiKeyEnv: 'OMNIMUX_MEDIA_KEY_FAL', models: { image: 'fixture-image', video: 'fixture-video' } } } }
const OPENAI_MEDIA = { defaultProvider: 'openai', providers: { openai: { protocol: 'openai-media', baseUrl: 'https://openai.fixture.invalid/v1', apiKeyEnv: 'OMNIMUX_MEDIA_KEY_OPENAI', models: { image: 'fixture-image', video: 'fixture-video' } } } }
const CUSTOM_MEDIA = { defaultProvider: 'custom', providers: { custom: { protocol: 'openai-media', baseUrl: 'https://custom.fixture.invalid/v1', apiKeyEnv: 'OMNIMUX_MEDIA_KEY_CUSTOM', models: { image: 'fixture-image' } } } }
function falSettings() {
  return { runtimeMode: 'agent', runtimeAgentId: 'fixture-agent', runtimeAgentVerified: true,
    scenarioBindings: { text: { channel: 'agent' }, image: { channel: 'byok', provider: 'fal' }, video: { channel: 'pending' } },
    byokProviders: [{ provider: 'fal', endpoint: 'https://fal.fixture.invalid/v1', models: { image: 'fixture-image' }, capabilities: ['image'] }] }
}
function openaiSettings() {
  return { runtimeMode: 'agent', runtimeAgentId: 'fixture-agent', runtimeAgentVerified: true,
    scenarioBindings: { text: { channel: 'agent' }, image: { channel: 'byok', provider: 'openai' }, video: { channel: 'pending' } },
    byokProviders: [{ provider: 'openai', endpoint: 'https://openai.fixture.invalid/v1', models: { image: 'fixture-image' }, capabilities: ['image'] }] }
}
function customSettings() {
  return { scenarioBindings: { image: { channel: 'byok', provider: 'custom' } },
    byokProviders: [{ provider: 'custom', endpoint: 'https://custom.fixture.invalid/v1', models: { image: 'fixture-image' }, capabilities: ['image'] }] }
}
function credentials(ref) {
  return { async resolve(requested) { assert.equal(requested, ref); return { value: 'fixture-provider-key' } } }
}
function submittedRuntime(check) {
  return { async execute(req) { check(req); return { taskId: 'fixture-task', outputs: [] } } }
}
function submit(current, media, model, check = () => {}) {
  return executeOmnimuxMedia('image', { dest: '/tmp/unused-multi.png', prompt: 'fixture', model, runtimeSettings: current, media,
    credentials: credentials(media.defaultProvider === 'fal' ? 'OMNIMUX_MEDIA_KEY_FAL' : media.defaultProvider === 'openai' ? 'OMNIMUX_MEDIA_KEY_OPENAI' : 'OMNIMUX_MEDIA_KEY_CUSTOM'),
    runtime: submittedRuntime(check), wait: false })
}
async function rejectImage(current, model, code = 'omnimux-unconfigured', media = FAL_MEDIA, extra = {}) {
  let calls = 0
  await assert.rejects(() => executeOmnimuxMedia('image', { dest: '/tmp/unused-reject.png', prompt: 'fixture', model,
    runtimeSettings: current, media, group: extra.group, allowedGroups: extra.allowedGroups,
    credentials: { async resolve() { calls++; throw new Error('unexpected credential') } },
    runtime: { async execute() { calls++; throw new Error('unexpected runtime') } },
    fetcher: async () => { calls++; throw new Error('unexpected HTTP') } }), (error) => error instanceof OmnimuxError && error.code === code)
  assert.equal(calls, 0)
}
function mounted(read, execute, media = {}, kind = 'image') {
  let api
  mountMedia({ get(name) { if (name === 'settings') return { get: read } }, tools: { register() {} },
    provide(name, value) { if (name === 'imageGenerate' && kind === 'image' || name === 'videoGenerate' && kind === 'video') api = value } }, { kind, execute, media, jsonOut: {}, gate: { capabilities: { media: true } } })
  return api
}

describe('Multi-Channel Runtime & Effective Media Model', () => {
  describe('resolveEffectiveMediaModel legacy helper remains compatible', () => {
    it('strips channel suffix and prioritizes explicit inputModel', () => {
      const settings = { runtimeMediaProvider: 'fal', runtimeKeyVerified: true, runtimeMediaImageModel: 'global-singleton-model' }
      assert.equal(resolveEffectiveMediaModel('seedance-2-0@byok-fal', 'fal', 'video', settings), 'seedance-2-0')
      assert.equal(resolveEffectiveMediaModel('gpt-image-2.5@standard', 'openai', 'image', settings), 'gpt-image-2.5')
      assert.equal(resolveEffectiveMediaModel('seedance-2-0', 'fal', 'video', settings), 'seedance-2-0')
    })
    it('falls back to mediaChoice.activeModel when inputModel is not provided', () => {
      const settings = { runtimeMediaProvider: 'fal', runtimeKeyVerified: true, runtimeMediaImageModel: 'custom-flux-pro' }
      assert.equal(resolveEffectiveMediaModel(undefined, 'fal', 'image', settings), 'custom-flux-pro')
      assert.equal(resolveEffectiveMediaModel('', 'fal', 'image', settings), 'custom-flux-pro')
      assert.equal(resolveEffectiveMediaModel('   ', 'fal', 'image', settings), 'custom-flux-pro')
    })
    it('falls back to runtimeKeyModel when mediaChoice has no explicit provider', () => {
      assert.equal(resolveEffectiveMediaModel(undefined, 'custom', 'image', { runtimeKeyModel: 'custom-model-id' }), 'custom-model-id')
    })
    it('falls back to DEFAULT_MEDIA_MODELS when neither is configured', () => {
      assert.equal(resolveEffectiveMediaModel(undefined, 'fal', 'image', {}), 'fal-ai/flux/dev')
      assert.equal(resolveEffectiveMediaModel(undefined, 'fal', 'video', {}), 'fal-ai/kling-video/v1/standard')
    })
    it('reads provider-specific models without borrowing a generic or unverified record', () => {
      const settings = { runtimeMediaProvider: 'fal', runtimeKeyVerified: true, runtimeMediaImageModel: 'flux-dev-default', byokProviders: [
        { provider: 'openai', verified: true, models: { image: 'dall-e-3-hd' } },
        { provider: 'openrouter', verified: true, model: 'midjourney-proxy-v1' },
        { provider: 'unverified-provider', verified: false, model: 'should-never-be-read' }] }
      assert.equal(resolveEffectiveMediaModel(undefined, 'openai', 'image', settings), 'dall-e-3-hd')
      assert.notEqual(resolveEffectiveMediaModel(undefined, 'openrouter', 'image', settings), 'midjourney-proxy-v1')
      assert.equal(resolveEffectiveMediaModel(undefined, 'fal', 'image', settings), 'flux-dev-default')
      assert.equal(resolveEffectiveMediaModel(undefined, 'unverified-provider', 'image', settings), 'fal-ai/flux/dev')
    })
    it('prioritizes explicit logical model and otherwise reads the provider physical model', () => {
      const settings = { runtimeMediaProvider: 'fal', runtimeKeyVerified: true, byokProviders: [{ provider: 'fal', verified: true, models: { image: 'fal-ai/flux/schnell' } }] }
      assert.equal(resolveEffectiveMediaModel('seedream-5-0-pro@byok-fal', 'fal', 'image', settings), 'seedream-5-0-pro')
      assert.equal(resolveEffectiveMediaModel(undefined, 'fal', 'image', settings), 'fal-ai/flux/schnell')
    })
    it('strips bare channel prefixes and falls back safely', () => {
      const settings = { runtimeMediaProvider: 'fal', runtimeKeyVerified: true }
      assert.equal(resolveEffectiveMediaModel('@byok-fal', 'fal', 'image', settings), 'fal-ai/flux/dev')
      assert.equal(resolveEffectiveMediaModel('@official', 'fal', 'video', settings), 'fal-ai/kling-video/v1/standard')
    })
    it('prevents cross-provider activeModel leakage', () => {
      const settings = { runtimeMediaProvider: 'fal', runtimeKeyVerified: true, runtimeMediaImageModel: 'main-fal-exclusive-model' }
      assert.equal(resolveEffectiveMediaModel(undefined, 'openai', 'image', settings), 'fal-ai/flux/dev')
      assert.equal(resolveEffectiveMediaModel(undefined, 'fal', 'image', settings), 'main-fal-exclusive-model')
    })
    it('parses multi-at model strings without corruption', () => {
      assert.equal(resolveEffectiveMediaModel('seedance-2-0@standard@extra', 'fal', 'video', {}), 'fal-ai/kling-video/v1/standard')
      assert.equal(resolveEffectiveMediaModel('gpt-image-2.5@byok-fal', 'fal', 'image', {}), 'gpt-image-2.5')
    })
    it('validates malformed runtimeMediaProvider values', () => {
      for (const invalid of [123, true, {}, [], null, '   ']) assert.equal(resolveEffectiveMediaModel(undefined, undefined, 'image', { runtimeMediaProvider: invalid }), 'fal-ai/flux/dev')
    })
    it('explicit logical models override the main physical model', () => {
      const settings = { runtimeMediaProvider: 'fal', runtimeKeyVerified: true, runtimeMediaImageModel: 'flux-dev-real' }
      assert.equal(resolveEffectiveMediaModel('seedream-5-0', 'fal', 'image', settings), 'seedream-5-0')
      assert.equal(resolveEffectiveMediaModel(undefined, 'fal', 'image', settings), 'flux-dev-real')
      assert.equal(resolveEffectiveMediaModel('seedance-2-0', 'fal', 'video', settings), 'seedance-2-0')
    })
    it('unverified records never win over a verified record without model', () => {
      const settings = { runtimeMediaProvider: 'fal', runtimeKeyVerified: true, byokProviders: [{ provider: 'fal', verified: true }, { provider: 'fal', verified: false, models: { image: 'malicious-unverified-model' } }] }
      const resolved = resolveEffectiveMediaModel(undefined, 'fal', 'image', settings)
      assert.notEqual(resolved, 'malicious-unverified-model')
      assert.equal(resolved, 'fal-ai/flux/dev')
    })
    it('legacy helper selects the modal model from same-provider records', () => {
      const settings = { byokProviders: [{ provider: 'siliconflow', verified: true, capabilities: ['video'], model: 'wan-2.1', videoModel: 'wan-2.1' },
        { provider: 'siliconflow', verified: true, capabilities: ['image'], model: 'flux-schnell', imageModel: 'flux-schnell' }] }
      assert.equal(resolveEffectiveMediaModel(undefined, 'siliconflow', 'image', settings), 'flux-schnell')
      assert.equal(resolveEffectiveMediaModel(undefined, 'siliconflow', 'video', settings), 'wan-2.1')
    })
  })

  describe('explicit media choices and exact registered provider configuration', () => {
    it('agent text does not block an explicitly configured fal media request', async () => {
      let called = 0
      const result = await submit(falSettings(), FAL_MEDIA, 'explicit-image@byok-fal', (req) => { called++; assert.equal(req.providerId, 'fal'); assert.equal(req.input.model, 'explicit-image') })
      assert.equal(result.mode, 'submitted'); assert.equal(result.taskId, 'fixture-task'); assert.equal(called, 1)
    })
    it('registered media executes the actual protocol and collects bytes without a real service', async (t) => {
      const dir = mkdtempSync(join(tmpdir(), 'multi-protocol-')); t.after(() => rmSync(dir, { recursive: true, force: true }))
      const calls = []
      const fetcher = async (url, init) => {
        calls.push({ url: String(url), method: init.method, auth: new Headers(init.headers).get('authorization') })
        if (init.method === 'POST') { assert.equal(JSON.parse(init.body).model, 'fixture-image'); return new Response(JSON.stringify({ task_id: 'registered-task' }), { headers: { 'content-type': 'application/json' } }) }
        if (String(url).endsWith('/content')) return new Response('png', { headers: { 'content-type': 'image/png' } })
        return new Response(JSON.stringify({ status: 'completed', data: [{ url: 'https://fal.fixture.invalid/v1/images/registered/content' }] }), { headers: { 'content-type': 'application/json' } })
      }
      const first = await executeOmnimuxMedia('image', { dest: join(dir, 'image.png'), prompt: 'fixture', runtimeSettings: falSettings(), media: FAL_MEDIA, credentials: credentials('OMNIMUX_MEDIA_KEY_FAL'), fetcher, wait: false })
      assert.equal(first.mode, 'submitted'); assert.equal(first.taskId, 'registered-task'); assert.match(first.taskRef, /^mtask_/)
      const result = await executeOmnimuxMedia('image', { taskRef: first.taskRef, dest: join(dir, 'image.png'), runtimeSettings: falSettings(), media: FAL_MEDIA, credentials: credentials('OMNIMUX_MEDIA_KEY_FAL'), fetcher })
      assert.equal(result.mode, 'live'); assert.equal(result.taskId, 'registered-task'); assert.equal(result.taskRef, first.taskRef); assert.equal(result.url, 'https://fal.fixture.invalid/v1/images/registered/content'); assert.equal(readFileSync(join(dir, 'image.png'), 'utf8'), 'png')
      assert.equal(calls.length, 3); assert.equal(calls[0].method, 'POST'); assert.notEqual(calls[1].method, 'POST'); assert.notEqual(calls[2].method, 'POST')
      assert.ok(calls.every((call) => call.url.startsWith('https://fal.fixture.invalid/v1/')))
      assert.equal(calls[0].auth, 'Bearer fixture-provider-key'); assert.equal(calls[1].auth, 'Bearer fixture-provider-key')
      assert.equal(calls[2].auth, null, 'an artifact URL without explicit credential-origin authorization cannot inherit the provider key')
    })
    it('unknown or incompletely configured BYOK channels fail before credentials', async () => {
      await rejectImage({ byokProviders: [{ provider: 'openai', verified: false }] }, 'fixture@byok-openai')
      await rejectImage({}, 'fixture@byok-custom')
    })
    it('unsupported media kinds are invalid requests', async () => {
      await assert.rejects(() => executeOmnimuxMedia('invalid-cap', { dest: '/tmp/unused', prompt: 'fixture' }), { code: 'omnimux-invalid-request' })
    })
    it('bare BYOK channel names are invalid requests', async () => { await rejectImage({}, 'fixture@byok-', 'omnimux-invalid-request') })
    it('independent openai media remains available with no main mediaChoice', async () => {
      const result = await submit(openaiSettings(), OPENAI_MEDIA, 'explicit-image@byok-openai')
      assert.equal(result.mode, 'submitted'); assert.equal(result.taskId, 'fixture-task')
    })
    it('image configuration never enables a requested video capability', async () => {
      let calls = 0
      await assert.rejects(() => executeOmnimuxMedia('video', { dest: '/tmp/unused.mp4', prompt: 'fixture', model: 'fixture@byok-fal', runtimeSettings: falSettings(), media: FAL_MEDIA,
        credentials: { async resolve() { calls++; } }, fetcher: async () => { calls++; } }), { code: 'omnimux-unconfigured' })
      assert.equal(calls, 0)
    })
    it('same-provider duplicate records are rejected rather than selecting the first verified one', async () => {
      const current = falSettings(); current.byokProviders.push({ provider: 'fal', endpoint: 'https://other.fixture.invalid/v1', models: { image: 'other-image' }, capabilities: ['image'], verified: true })
      await rejectImage(current, 'fixture@byok-fal')
    })
    it('unverified duplicate candidates cannot shadow or silently inherit the main source', async () => {
      const current = falSettings(); current.runtimeKeyVerified = true; current.runtimeMediaProvider = 'fal'; current.runtimeMediaImage = true
      current.byokProviders.push({ provider: 'fal', verified: false, image: false, endpoint: 'https://unverified.fixture.invalid/v1' })
      await rejectImage(current, 'fixture@byok-fal')
    })
    it('missing provider and generic legacy keys never establish media authorization', async () => {
      await rejectImage({ runtimeMode: 'agent', runtimeKeyVerified: true, runtimeMediaImage: true }, 'fixture@byok-fal')
      let http = 0, refs = []
      const current = { scenarioBindings: { image: { channel: 'byok', provider: 'openrouter' } }, byokProviders: [{ provider: 'openrouter', endpoint: 'https://router.fixture.invalid/v1', models: { image: 'fixture' }, capabilities: ['image'] }] }
      await assert.rejects(() => executeOmnimuxMedia('image', { dest: '/tmp/unused.png', prompt: 'fixture', runtimeSettings: current,
        env: { OMNIMUX_MEDIA_KEY: 'must-not-leak' }, credentials: { async resolve(ref) { refs.push(ref); return undefined } }, fetcher: async () => { http++; } }), { code: 'omnimux-unconfigured' })
      assert.deepEqual(refs, ['OMNIMUX_MEDIA_KEY_OPENROUTER']); assert.equal(http, 0)
    })
    it('custom provider missing endpoint is rejected', async () => {
      const current = customSettings(); current.byokProviders[0].endpoint = '  '; await rejectImage(current, 'fixture@byok-custom', 'omnimux-unconfigured', CUSTOM_MEDIA)
    })
    it('custom provider non-HTTP endpoint is rejected', async () => {
      const current = customSettings(); current.byokProviders[0].endpoint = 'ftp://fixture.invalid/api'; await rejectImage(current, 'fixture@byok-custom', 'omnimux-unconfigured', CUSTOM_MEDIA)
    })
    it('implicit custom choice with empty endpoint is rejected', async () => {
      const current = customSettings(); current.byokProviders[0].endpoint = ''; await rejectImage(current, undefined, 'omnimux-unconfigured', CUSTOM_MEDIA)
    })
    it('modal-mismatched duplicate records cannot silently shadow the selected video source', async () => {
      let calls = 0
      const current = { scenarioBindings: { video: { channel: 'byok', provider: 'fal' } }, byokProviders: [
        { provider: 'fal', endpoint: 'https://fal.fixture.invalid/v1', models: { video: 'fixture-video' }, capabilities: ['video'] },
        { provider: 'fal', endpoint: 'https://other.fixture.invalid/v1', models: { image: 'fixture-image' }, capabilities: ['image'] }] }
      await assert.rejects(() => executeOmnimuxMedia('video', { dest: '/tmp/unused.mp4', prompt: 'fixture', runtimeSettings: current, media: FAL_MEDIA, credentials: { async resolve() { calls++; } } }), { code: 'omnimux-unconfigured' })
      assert.equal(calls, 0)
    })
    it('explicit configured BYOK does not require the obsolete main verified flag', async () => {
      const current = falSettings(); current.runtimeMediaProvider = ''; current.runtimeKeyVerified = false
      const result = await submit(current, FAL_MEDIA, 'explicit-image@byok-fal'); assert.equal(result.mode, 'submitted')
    })
    it('unknown explicit channel fails before credentials', async () => { await rejectImage(falSettings(), 'fixture@unknown-custom-group', 'unknown-group') })
    it('BYOK execution discards forged client env and uses only the selected provider reference', async () => {
      let calls = 0
      const result = await executeOmnimuxMedia('image', { dest: '/tmp/unused.png', prompt: 'fixture', model: 'fixture@byok-custom', runtimeSettings: customSettings(), media: CUSTOM_MEDIA,
        credentials: credentials('OMNIMUX_MEDIA_KEY_CUSTOM'), env: { UNTRUSTED_CLIENT_VAR: 'malicious', OMNIMUX_TOKEN: 'forged' },
        runtime: submittedRuntime((req) => { calls++; assert.equal(req.providerId, 'custom'); assert.equal(req.input.model, 'fixture'); assert.equal(req.input.OMNIMUX_TOKEN, undefined); assert.equal(req.input.UNTRUSTED_CLIENT_VAR, undefined) }), wait: false })
      assert.equal(result.mode, 'submitted'); assert.equal(calls, 1)
    })
  })

  describe('mounted media authority and independent scenarios', () => {
    it('official catalogue is independent of agent chat, but unknown models/groups and incomplete BYOK cannot penetrate', async () => {
      let current = { runtimeMode: 'agent', runtimeAgentId: 'fixture', runtimeAgentVerified: true }, calls = 0, captured
      const api = mounted(() => current, (req) => { calls++; captured = req; return { ok: true } })
      assert.throws(() => api.execute({ dest: '/tmp/unused.png', model: 'unregistered-custom-model' }), { code: 'omnimux-unconfigured' }); assert.equal(calls, 0)
      await api.execute({ dest: '/tmp/unused.png', model: 'gpt-image-2.5' }); assert.equal(captured.provider, 'omnimux')
      const video = mounted(() => current, (req) => { calls++; captured = req; return { ok: true } }, {}, 'video')
      for (const model of ['seedance-2-0', 'minimax-h3', 'seedance-2-0@official']) {
        await video.execute({ dest: '/tmp/unused.mp4', model }); assert.equal(captured.provider, 'omnimux')
      }
      const before = calls
      assert.throws(() => api.execute({ dest: '/tmp/unused.png', model: 'fixture@byok-fal' }), { code: 'omnimux-unconfigured' })
      assert.throws(() => api.execute({ dest: '/tmp/unused.png', model: 'seedance-2-0@unknown-custom-channel' }), { code: 'unknown-group' })
      assert.throws(() => api.execute({ dest: '/tmp/unused.png', model: 'gpt-image-2.5@official' }), { code: 'unknown-group' }); assert.equal(calls, before)
      await api.execute({ dest: '/tmp/unused.png', model: 'gpt-image-2.5@standard' }); assert.equal(captured.provider, 'omnimux')
      await api.execute({ dest: '/tmp/unused.png', model: 'gpt-image-2.5', provider: 'omnimux' }); assert.equal(captured.provider, 'omnimux')
      current = { runtimeMode: 'key', runtimeKeyVerified: false }; await video.execute({ dest: '/tmp/unused.png', model: 'seedance-2-0@official' }); assert.equal(captured.provider, 'omnimux')
      current = { runtimeMode: 'official' }; await video.execute({ dest: '/tmp/unused.mp4', model: 'seedance-2-0' }); assert.equal(captured.provider, 'omnimux')
      current = { runtimeMode: 'agent', runtimeAgentVerified: true, runtimeKeyVerified: false, allowOfficialMediaFallback: false }
      assert.throws(() => api.execute({ dest: '/tmp/unused.png', model: 'unregistered-custom-model' }), { code: 'omnimux-unconfigured' })
      current.allowOfficialMediaFallback = true; await video.execute({ dest: '/tmp/unused.png', model: 'seedance-2-0' }); assert.equal(captured.provider, 'omnimux')
      await video.execute({ dest: '/tmp/unused.mp4', model: 'seedance-2-0@official', env: { OMNIMUX_API_KEY: 'forged', UNTRUSTED_CLIENT_VAR: 'forged' } })
      assert.equal(captured.env.UNTRUSTED_CLIENT_VAR, undefined); assert.notEqual(captured.env.OMNIMUX_API_KEY, 'forged')
    })
    it('an explicitly disabled image remains blocked despite its declared model, capability and registered protocol', async () => {
      const current = falSettings(); current.byokProviders[0].image = false
      assert.deepEqual(current.byokProviders[0].capabilities, ['image'])
      assert.equal(current.byokProviders[0].models.image, 'fixture-image')
      assert.equal(current.byokProviders[0].endpoint, FAL_MEDIA.providers.fal.baseUrl)
      await rejectImage(current, 'fixture-image@byok-fal')
    })
    it('an image excluded by capabilities remains blocked without an explicit image flag', async () => {
      const current = falSettings(); current.byokProviders[0].capabilities = ['video']
      assert.equal(Object.hasOwn(current.byokProviders[0], 'image'), false)
      assert.equal(current.byokProviders[0].models.image, 'fixture-image')
      assert.equal(current.byokProviders[0].endpoint, FAL_MEDIA.providers.fal.baseUrl)
      await rejectImage(current, 'fixture-image@byok-fal')
    })
    it('verified record with no modal declarations does not authorize media', async () => {
      const current = falSettings(); current.byokProviders = [{ provider: 'fal', verified: true, endpoint: 'https://fal.fixture.invalid/v1' }]
      await rejectImage(current, 'fixture@byok-fal')
    })
    it('declared modal model alone is not universal support; exact capabilities and adapter are required', async () => {
      const current = falSettings(); current.byokProviders[0].capabilities = []
      await rejectImage(current, 'fixture@byok-fal')
      current.byokProviders[0].capabilities = ['image']; assert.equal((await submit(current, FAL_MEDIA, 'fixture@byok-fal')).mode, 'submitted')
    })
    it('official catalogue request never silently routes to a ready BYOK source', async () => {
      let provider
      const result = await executeOmnimuxMedia('image', { dest: '/tmp/unused.png', prompt: 'fixture', model: 'gpt-image-2.5', runtimeSettings: falSettings(), env: { OMNIMUX_API_KEY: 'sk-fixture' },
        runtime: submittedRuntime((req) => { provider = req.providerId }), wait: false })
      assert.equal(provider, 'omnimux'); assert.equal(result.mode, 'submitted')
    })
    it('legacy official state keeps saved official image generation live alongside ready BYOK metadata', async (t) => {
      const dir = mkdtempSync(join(tmpdir(), 'official-ready-byok-'))
      t.after(() => rmSync(dir, { recursive: true, force: true }))
      const current = falSettings()
      current.runtimeMode = 'official'
      current.runtimeKeyVerified = true
      current.runtimeMediaProvider = 'fal'
      current.runtimeMediaImage = true
      current.runtimeMediaImageModel = 'fixture-image'
      current.runtimeKeyEndpoint = 'https://fal.fixture.invalid/v1'
      current.scenarioBindings.image = { channel: 'official' }
      current.byokProviders[0].verified = true
      current.byokProviders[0].image = true
      const media = { defaultProvider: 'omnimux', providers: {
        fal: FAL_MEDIA.providers.fal,
        omnimux: { protocol: 'openai-media', baseUrl: 'https://api.omnimux.ai/v1', apiKeyEnv: 'OMNIMUX_API_KEY', models: { image: 'gpt-image-2.5' } },
      } }
      const dest = join(dir, 'official.png'), refs = [], requests = []
      const result = await executeOmnimuxMedia('image', {
        dest, prompt: 'official lamp', model: 'gpt-image-2.5', runtimeSettings: current, media, env: {}, wait: true,
        credentials: { async resolve(ref) { refs.push(ref); assert.equal(ref, 'OMNIMUX_API_KEY'); return { value: 'sk-official-coexistence-fixture' } } },
        fetcher: async (url, init) => {
          requests.push({ url: String(url), method: init.method, auth: new Headers(init.headers).get('authorization'), body: JSON.parse(init.body) })
          assert.equal(String(url), 'https://api.omnimux.ai/v1/images/generations')
          return new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw==' }] }), { headers: { 'content-type': 'application/json' } })
        },
      })
      assert.equal(result.mode, 'live')
      assert.deepEqual(refs, ['OMNIMUX_API_KEY'])
      assert.equal(requests.length, 1)
      assert.equal(requests[0].method, 'POST')
      assert.equal(requests[0].auth, 'Bearer sk-official-coexistence-fixture')
      assert.equal(requests[0].body.model, 'gpt-image-2.5')
      assert.equal(requests[0].body.prompt, 'official lamp')
      assert.deepEqual(readFileSync(dest), Buffer.from([137, 80, 78, 71]))
    })
    it('provider credentials are resolved per request, never from forged client env or stale verification', async () => {
      let http = 0, refs = []
      await assert.rejects(() => executeOmnimuxMedia('image', { dest: '/tmp/unused.png', prompt: 'fixture', runtimeSettings: falSettings(), media: FAL_MEDIA,
        env: { OMNIMUX_MEDIA_KEY_FAL: 'forged-client-key' }, credentials: { async resolve(ref) { refs.push(ref); return undefined } }, fetcher: async () => { http++; } }), { code: 'omnimux-unconfigured' })
      assert.equal(http, 0); assert.deepEqual(refs, ['OMNIMUX_MEDIA_KEY_FAL'])
      assert.equal((await submit(falSettings(), FAL_MEDIA, 'fixture@byok-fal')).mode, 'submitted')
    })
    it('capabilities apply independently to image and video', async () => {
      assert.equal((await submit(openaiSettings(), OPENAI_MEDIA, 'fixture@byok-openai')).mode, 'submitted')
      let calls = 0
      await assert.rejects(() => executeOmnimuxMedia('video', { dest: '/tmp/unused.mp4', prompt: 'fixture', model: 'fixture@byok-openai', runtimeSettings: openaiSettings(), media: OPENAI_MEDIA,
        credentials: { async resolve() { calls++; } } }), { code: 'omnimux-unconfigured' }); assert.equal(calls, 0)
    })
    it('official mount uses authoritative server token and discards client base URL', async () => {
      const old = process.env.OMNIMUX_API_KEY
      try {
        process.env.OMNIMUX_API_KEY = 'sk-authoritative-server-token'; let captured
        const api = mounted(() => ({ runtimeMode: 'official' }), (req) => { captured = req; return { ok: true } })
        await api.execute({ dest: '/tmp/unused.png', model: 'gpt-image-2.5@standard', env: { OMNIMUX_API_KEY: 'forged', OMNIMUX_BASE_URL: 'https://evil.invalid', SOME_OTHER_VAR: 'forged' } })
        assert.equal(captured.env.OMNIMUX_API_KEY, 'sk-authoritative-server-token'); assert.equal(captured.env.OMNIMUX_BASE_URL, undefined); assert.equal(captured.env.SOME_OTHER_VAR, undefined)
      } finally { if (old === undefined) delete process.env.OMNIMUX_API_KEY; else process.env.OMNIMUX_API_KEY = old }
    })
    it('official mount with no server token purges forged client credentials', async () => {
      const old = process.env.OMNIMUX_API_KEY
      try { delete process.env.OMNIMUX_API_KEY; let captured
        const api = mounted(() => ({ runtimeMode: 'official' }), (req) => { captured = req; return { ok: true } })
        await api.execute({ dest: '/tmp/unused.png', model: 'gpt-image-2.5@standard', env: { OMNIMUX_API_KEY: 'forged', CUSTOM_VAR: 'forged' } }); assert.deepEqual(captured.env, {})
      } finally { if (old === undefined) delete process.env.OMNIMUX_API_KEY; else process.env.OMNIMUX_API_KEY = old }
    })
    it('external provider identity does not imply any registered protocol', () => {
      for (const name of ['custom', 'CUSTOM', 'fal', 'openai', 'openrouter', 'byok']) assert.equal(isExternalMediaProvider(name), true)
      assert.equal(isExternalMediaProvider('omnimux'), false)
    })
    it('official line works in agent mode but cross-model dedicated line appropriation is blocked', async () => {
      let calls = 0
      const api = mounted(() => ({ runtimeMode: 'agent', runtimeAgentVerified: false }), () => { calls++; return { ok: true } })
      await api.execute({ dest: '/tmp/unused.png', model: 'seedance-2-0@official' }); assert.equal(calls, 1)
      assert.throws(() => api.execute({ dest: '/tmp/unused.png', model: 'gpt-image-2.5@seedance-2-0-task-pro' }), { code: 'unknown-group' }); assert.equal(calls, 1)
    })
    it('siliconflow identity and documented default endpoint remain available', () => {
      assert.ok(EXTERNAL_MEDIA_PROVIDERS.includes('siliconflow')); assert.equal(isExternalMediaProvider('siliconflow'), true); assert.equal(isExternalMediaProvider('SILICONFLOW'), true)
      assert.equal(DEFAULT_PROVIDER_ENDPOINTS.siliconflow, 'https://api.siliconflow.cn/v1')
    })
    it('legacy helper never claims an unverified physical model', () => {
      const model = resolveEffectiveMediaModel(undefined, 'fal', 'image', { byokProviders: [{ provider: 'fal', verified: false, model: 'unverified-stolen-model', models: { image: 'unverified-stolen-image-model' } }] })
      assert.notEqual(model, 'unverified-stolen-model'); assert.notEqual(model, 'unverified-stolen-image-model'); assert.equal(model, 'fal-ai/flux/dev')
    })
    it('implicit video-only legacy provider does not authorize image', async () => {
      await rejectImage({ runtimeMode: 'agent', runtimeAgentId: 'fixture', runtimeAgentVerified: true, byokProviders: [{ provider: 'fal', verified: true, video: true, image: false }] }, undefined)
    })
    it('a saved image binding selects the exact provider and physical model with no channel suffix', async () => {
      let captured
      const result = await submit(openaiSettings(), OPENAI_MEDIA, undefined, (req) => { captured = req })
      assert.equal(result.mode, 'submitted'); assert.equal(captured.providerId, 'openai'); assert.equal(captured.input.model, 'fixture-image')
    })
    it('missing or empty agent id cannot authorize an unknown media model', () => {
      let current = { runtimeMode: 'agent', runtimeAgentId: '', runtimeAgentVerified: true, allowOfficialMediaFallback: true }, calls = 0
      const api = mounted(() => current, () => { calls++; })
      assert.throws(() => api.execute({ dest: '/tmp/unused.png', model: 'unregistered-custom-model' }), { code: 'omnimux-unconfigured' })
      current = { runtimeMode: 'agent', runtimeAgentVerified: true, allowOfficialMediaFallback: true }
      assert.throws(() => api.execute({ dest: '/tmp/unused.png', model: 'unregistered-custom-model' }), { code: 'omnimux-unconfigured' }); assert.equal(calls, 0)
    })
    it('a verified text-only endpoint never silently becomes custom image support', async () => {
      await rejectImage({ runtimeMode: 'key', runtimeKeyEndpoint: 'https://custom.fixture.invalid/v1', runtimeKeyModel: 'internal-llm', runtimeKeyVerified: true, runtimeMediaImage: true }, 'unregistered-image')
    })
    it('image and video bindings independently select their configured provider, with explicit model override preserved', async () => {
      const current = { scenarioBindings: { image: { channel: 'byok', provider: 'fal' }, video: { channel: 'byok', provider: 'openai' } }, byokProviders: [
        { provider: 'fal', endpoint: 'https://fal.fixture.invalid/v1', models: { image: 'fixture-image' }, capabilities: ['image'] },
        { provider: 'openai', endpoint: 'https://openai.fixture.invalid/v1', models: { video: 'fixture-video' }, capabilities: ['video'] }] }
      let captured
      const first = await executeOmnimuxMedia('video', { dest: '/tmp/unused.mp4', prompt: 'fixture', model: 'explicit-video', runtimeSettings: current, media: OPENAI_MEDIA,
        credentials: credentials('OMNIMUX_MEDIA_KEY_OPENAI'), runtime: submittedRuntime((req) => { captured = req }), wait: false })
      assert.equal(first.mode, 'submitted'); assert.equal(captured.providerId, 'openai'); assert.equal(captured.input.model, 'explicit-video')
      const second = await executeOmnimuxMedia('video', { dest: '/tmp/unused.mp4', prompt: 'fixture', runtimeSettings: current, media: OPENAI_MEDIA,
        credentials: credentials('OMNIMUX_MEDIA_KEY_OPENAI'), runtime: submittedRuntime((req) => { captured = req }), wait: false })
      assert.equal(second.mode, 'submitted'); assert.equal(captured.input.model, 'fixture-video')
    })
    it('pure media configuration works without configuring any text model', async () => {
      const current = customSettings(); current.runtimeKeyModel = ''; current.runtimeKeyVerified = false
      assert.equal((await submit(current, CUSTOM_MEDIA, 'fixture@byok-custom')).mode, 'submitted')
    })
    it('agent official media plans without credentials and resolves the current credential at execution', async (t) => {
      const dir = mkdtempSync(join(tmpdir(), 'official-agent-creds-')); t.after(() => rmSync(dir, { recursive: true, force: true }))
      const old = process.env.OMNIMUX_API_KEY; let api; const refs = [], requests = []
      try {
        delete process.env.OMNIMUX_API_KEY
        mountMedia({ get(name) { if (name === 'settings') return { get: () => ({ runtimeMode: 'agent', runtimeAgentVerified: true }) }; if (name === 'credentials') return { async resolve(ref) { refs.push(ref); assert.equal(ref, 'OMNIMUX_API_KEY'); return { value: 'sk-fixture-current' } } } },
          tools: { register() {} }, provide(name, value) { if (name === 'imageGenerate') api = value } }, {
          kind: 'image', media: {}, jsonOut: {}, execute(req) {
            assert.deepEqual(req.env, {}); assert.deepEqual(refs, [])
            return executeOmnimuxMedia('image', { prompt: req.prompt, dest: req.dest, model: req.model, provider: req.provider, env: req.env, credentials: req.credentials, runtimeSettings: req.runtimeSettings,
              fetcher: async (url, init) => { requests.push({ url: String(url), method: init.method, authorization: new Headers(init.headers).get('authorization'), body: JSON.parse(init.body) }); return new Response(JSON.stringify({ data: [{ b64_json: 'cG5n' }] }), { headers: { 'content-type': 'application/json' } }) } })
          } })
        const dest = join(dir, 'image.png'); const result = await api.execute({ prompt: 'a lamp', dest, model: 'gpt-image-2.5', env: { OMNIMUX_API_KEY: 'sk-forged', UNTRUSTED_CLIENT_VAR: 'forged' } })
        assert.equal(result.mode, 'live'); assert.deepEqual(refs, ['OMNIMUX_API_KEY']); assert.equal(requests.length, 1); assert.equal(requests[0].method, 'POST')
        assert.equal(requests[0].url, 'https://api.omnimux.ai/v1/images/generations'); assert.equal(requests[0].authorization, 'Bearer sk-fixture-current'); assert.equal(requests[0].body.model, 'gpt-image-2.5')
        assert.equal(existsSync(dest), true); assert.equal(readFileSync(dest, 'utf8'), 'png')
      } finally { if (old === undefined) delete process.env.OMNIMUX_API_KEY; else process.env.OMNIMUX_API_KEY = old }
    })
    it('placeholder, non-sk Bearer and control-character server values never enter official API credentials', async () => {
      const old = process.env.OMNIMUX_API_KEY
      try { let captured; const api = mounted(() => ({ runtimeMode: 'official' }), (req) => { captured = req; return { ok: true } })
        for (const token of ['undefined', 'null', 'false', 'none', '0', '  ', 'Bearer valid-long-secret-key-12345', 'token\rwithcr', 'token\nwithlf', 'token\twithtab']) {
          process.env.OMNIMUX_API_KEY = token; await api.execute({ dest: '/tmp/unused.png', model: 'gpt-image-2.5@standard' }); assert.equal(captured.env.OMNIMUX_API_KEY, undefined)
        }
      } finally { if (old === undefined) delete process.env.OMNIMUX_API_KEY; else process.env.OMNIMUX_API_KEY = old }
    })
    it('explicit BYOK overrides the official saved choice and never borrows its key', async () => {
      const current = falSettings(); current.scenarioBindings.image = { channel: 'official' }
      let calls = 0
      await assert.rejects(() => executeOmnimuxMedia('image', { dest: '/tmp/unused.png', prompt: 'fixture', model: 'fixture@byok-fal', runtimeSettings: current, media: FAL_MEDIA,
        env: { OMNIMUX_API_KEY: 'sk-official-fixture' }, credentials: { async resolve(ref) { assert.equal(ref, 'OMNIMUX_MEDIA_KEY_FAL'); return undefined } }, fetcher: async () => { calls++; } }), { code: 'omnimux-unconfigured' })
      assert.equal(calls, 0); let provider
      assert.equal((await submit(current, FAL_MEDIA, 'fixture@byok-fal', (req) => { provider = req.providerId })).mode, 'submitted'); assert.equal(provider, 'fal')
    })
    it('conflicting official and BYOK allowedGroups fail before credentials', async () => {
      await rejectImage(falSettings(), 'gpt-image-2.5', 'omnimux-invalid-request', FAL_MEDIA, { allowedGroups: ['official', 'byok-fal'] })
    })
    it('a generic model field never declares all media capabilities', async () => {
      const current = falSettings(); current.byokProviders = [{ provider: 'fal', endpoint: 'https://fal.fixture.invalid/v1', verified: true, model: 'fal-ai/flux/schnell' }]
      await rejectImage(current, 'seedream-5-0@byok-fal')
    })
    it('mount normalizes official channel case without changing the selected provider', async () => {
      let captured; const api = mounted(() => ({ runtimeMode: 'official' }), (req) => { captured = req; return { ok: true } }, {}, 'video')
      await api.execute({ dest: '/tmp/unused.mp4', model: 'seedance-2-0', group: '  OFFICIAL  ' }); assert.equal(captured.provider, 'omnimux')
    })
  })
})
