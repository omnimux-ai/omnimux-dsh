import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Readable } from 'node:stream'
import { registerAgentRoutes } from './http.js'
import { parseSettingsSection } from '../settings/schema.js'

function fakeRes() {
  return { status: 0, text: '', writeHead(status) { this.status = status }, end(text) { this.text = text }, body() { return JSON.parse(this.text) } }
}
function fakeReq(method, body, headers = {}) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  stream.method = method
  stream.headers = headers
  return stream
}
function fakeSettings(initial = {}) {
  let value = parseSettingsSection(initial)
  let revision = 1
  const updates = []
  return {
    updates,
    get value() { return structuredClone(value) },
    get revision() { return revision },
    get: async () => structuredClone(value),
    describe: () => [{ ns: 'omnimux', revision, value: structuredClone(value) }],
    update: async (ns, patch, expectedRevision) => {
      assert.equal(ns, 'omnimux')
      assert.equal(expectedRevision, revision)
      updates.push(structuredClone(patch))
      value = parseSettingsSection(Object.assign({}, value, patch))
      revision += 1
    },
  }
}
function register(deps) {
  const handlers = new Map()
  registerAgentRoutes({ register(route) { handlers.set(route.path, route.handler); return () => handlers.delete(route.path) } }, Object.assign({ authProbe: async () => ({ state: 'unknown', method: 'none' }) }, deps))
  return handlers
}

const NPM_CLAUDE_PATH = '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude'
function agentRow(overrides = {}) {
  const id = overrides.id || 'claude'
  return Object.assign({ id, name: id, installed: true, version: '2.1.223 (Claude Code)', models: [], bin: id, binPath: NPM_CLAUDE_PATH }, overrides)
}
function fakeAuthProbe(byId = {}) {
  const seen = []
  const entries = new Map(Object.entries(byId))
  const probe = async (target) => {
    const id = typeof target === 'string' ? target : target?.id
    seen.push(id)
    return Object.assign({}, entries.get(id) || { state: 'unknown', method: 'none' })
  }
  probe.seen = seen
  return probe
}
function withUrl(req, url) { req.url = url; return req }
function deadline(ms, message) {
  return new Promise((unused, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    if (typeof timer.unref === 'function') timer.unref()
  })
}
function installedProbe(version = '2.1.223') { return async () => ({ installed: true, version }) }
const CROSS_ORIGIN = { origin: 'https://evil.example' }

describe('agent routes', () => {
  it('GET lists scanned agents', async () => {
    const handlers = register({ settings: fakeSettings(), scan: async () => [{ id: 'claude', name: 'Claude Code', installed: true, version: '2.1' }] })
    const res = fakeRes()
    await handlers.get('/omnimux/agents')(fakeReq('GET'), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().agents.length, 1)
    assert.equal(res.body().agents[0].installed, true)
  })
  it('select marks a probed agent verified and changes only the text binding', async () => {
    const settings = fakeSettings({ scenarioBindings: { text: { channel: 'official' }, image: { channel: 'byok', provider: 'openai' }, video: { channel: 'byok', provider: 'fal' } } })
    const before = settings.value.scenarioBindings
    const handlers = register({ settings, probe: async () => ({ installed: true, version: '2.1' }) })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/select')(fakeReq('POST', { id: 'claude' }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, true)
    assert.equal(res.body().saved, true)
    assert.equal(settings.value.runtimeAgentId, 'claude')
    assert.equal(settings.value.runtimeAgentVerified, true)
    assert.deepEqual(settings.value.scenarioBindings.text, { channel: 'agent' })
    assert.deepEqual(settings.value.scenarioBindings.image, before.image)
    assert.deepEqual(settings.value.scenarioBindings.video, before.video)
    assert.deepEqual(settings.value.scenarioBindings.audio, before.audio)
    assert.deepEqual(settings.value.scenarioBindings.analysis, before.analysis)
    assert.equal(settings.updates.length, 1)
  })
  it('select on a missing binary preserves the previously confirmed choice', async () => {
    const settings = fakeSettings({ runtimeAgentId: 'claude', runtimeAgentVerified: true, scenarioBindings: { text: { channel: 'agent' }, image: { channel: 'byok', provider: 'openai' } } })
    const before = settings.value
    const handlers = register({ settings, probe: async () => ({ installed: false, version: '' }) })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/select')(fakeReq('POST', { id: 'kimi' }), res)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body(), { ok: false, error: 'not-installed' })
    assert.deepEqual(settings.value, before)
    assert.equal(settings.value.runtimeAgentId, 'claude')
    assert.equal(settings.value.runtimeAgentVerified, true)
    assert.deepEqual(settings.updates, [])
  })
  it('select rejects an unknown agent id', async () => {
    const handlers = register({ settings: fakeSettings() })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/select')(fakeReq('POST', { id: 'nope' }), res)
    assert.equal(res.status, 400)
  })
  it('GET refuses a cross-origin read (machine fingerprint)', async () => {
    const handlers = register({ settings: fakeSettings(), scan: async () => [{ id: 'claude', name: 'Claude Code', installed: true, version: '2.1' }] })
    const res = fakeRes()
    await handlers.get('/omnimux/agents')(fakeReq('GET', undefined, CROSS_ORIGIN), res)
    assert.equal(res.status, 403)
  })
  it('select refuses a cross-origin write', async () => {
    const settings = fakeSettings()
    const handlers = register({ settings })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/select')(fakeReq('POST', { id: 'claude' }, CROSS_ORIGIN), res)
    assert.equal(res.status, 403)
    assert.deepEqual(settings.updates, [])
  })
  it('checkOnly probes installation without changing any saved choice', async () => {
    const settings = fakeSettings({ runtimeAgentId: 'kimi', runtimeAgentVerified: true })
    const before = settings.value
    const probed = []
    const handlers = register({ settings, probe: async (bin) => { probed.push(bin); return { installed: true, version: '2.1' } } })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/select')(fakeReq('POST', { id: 'claude', checkOnly: true }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, true)
    assert.equal(res.body().checkType, 'installed-program')
    assert.equal(res.body().saved, false)
    assert.deepEqual(probed, ['claude'])
    assert.deepEqual(settings.value, before)
    assert.deepEqual(settings.updates, [])
  })
  it('late installed probe rejects a revision change without overwriting the newer choice', async () => {
    const settings = fakeSettings()
    const handlers = register({ settings, probe: async () => {
      await settings.update('omnimux', { runtimeAgentId: 'kimi', runtimeAgentVerified: true }, settings.revision)
      return { installed: true, version: '2.1' }
    } })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/select')(fakeReq('POST', { id: 'claude' }), res)
    assert.equal(res.status, 409)
    assert.equal(settings.value.runtimeAgentId, 'kimi')
    assert.equal(settings.updates.length, 1)
  })
})

describe('agent routes · sign-in state', () => {
  it('GET /omnimux/agents carries auth state and login support per row', async () => {
    const authProbe = fakeAuthProbe({ claude: { state: 'signed-in', method: 'command' }, qwen: { state: 'signed-out', method: 'file' } })
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude' }), agentRow({ id: 'qwen' })], authProbe })
    const res = fakeRes()
    await handlers.get('/omnimux/agents')(fakeReq('GET'), res)
    assert.equal(res.status, 200)
    const claude = res.body().agents.find((row) => row.id === 'claude')
    const qwen = res.body().agents.find((row) => row.id === 'qwen')
    assert.equal(claude.auth.state, 'signed-in')
    assert.equal(claude.auth.method, 'command')
    assert.equal(claude.auth.loginSupported, true)
    assert.equal(qwen.auth.state, 'signed-out')
    assert.equal(qwen.auth.method, 'file')
    assert.equal(qwen.auth.loginSupported, false)
  })
  it('GET /omnimux/agents never probes an agent that is not installed', async () => {
    const authProbe = fakeAuthProbe({ claude: { state: 'signed-in', method: 'command' } })
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude' }), agentRow({ id: 'codex', installed: false, version: '' })], authProbe })
    const res = fakeRes()
    await handlers.get('/omnimux/agents')(fakeReq('GET'), res)
    assert.equal(res.status, 200)
    const codex = res.body().agents.find((row) => row.id === 'codex')
    assert.equal(codex.auth.state, 'unknown')
    assert.equal(codex.auth.method, 'none')
    assert.equal(authProbe.seen.includes('codex'), false)
  })
  it('GET /omnimux/agents reports unknown instead of guessing when the probe fails', async () => {
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude' })], authProbe: async () => { throw new Error('probe exploded') } })
    const res = fakeRes()
    await handlers.get('/omnimux/agents')(fakeReq('GET'), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().agents[0].auth.state, 'unknown')
    assert.notEqual(res.body().agents[0].auth.state, 'signed-out')
  })
})

describe('agent routes · update state', () => {
  it('GET /omnimux/agents/updates returns the checker payload', async () => {
    const payload = { checkedAt: 1760000000000, updates: { claude: { state: 'available', current: '2.1.223', latest: '2.1.289', channel: 'npm', installShape: 'npm', supported: true } } }
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude' })], updateCheck: async () => payload })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/updates')(withUrl(fakeReq('GET'), '/omnimux/agents/updates'), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().checkedAt, payload.checkedAt)
    assert.equal(res.body().updates.claude.state, 'available')
    assert.equal(res.body().updates.claude.latest, '2.1.289')
    assert.equal(res.body().updates.claude.supported, true)
  })
  it('GET /omnimux/agents/updates forwards ?refresh=1 and only then', async () => {
    const seen = []
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude' })], updateCheck: async (...args) => { seen.push(args); return { checkedAt: 1, updates: {} } } })
    const askedForRefresh = (args) => args.some((arg) => arg && typeof arg === 'object' && Boolean(arg.refresh))
    const plain = fakeRes()
    await handlers.get('/omnimux/agents/updates')(withUrl(fakeReq('GET'), '/omnimux/agents/updates'), plain)
    assert.equal(seen.length, 1)
    assert.equal(askedForRefresh(seen[0]), false)
    const refreshed = fakeRes()
    await handlers.get('/omnimux/agents/updates')(withUrl(fakeReq('GET'), '/omnimux/agents/updates?refresh=1'), refreshed)
    assert.equal(seen.length, 2)
    assert.equal(askedForRefresh(seen[1]), true)
  })
})

describe('agent routes · login', () => {
  it('POST /omnimux/agents/login rejects an unknown agent id', async () => {
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude' })], probe: installedProbe() })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/login')(fakeReq('POST', { id: 'nope' }), res)
    assert.equal(res.status, 400)
    assert.equal(res.body().ok, false)
    assert.equal(res.body().error, 'unknown-agent')
  })
  it('POST /omnimux/agents/login reports a missing install', async () => {
    let launched = false
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude', installed: false, version: '' })], probe: async () => ({ installed: false, version: '' }), login: async () => { launched = true; return { ok: true, launched: true, mode: 'terminal' } } })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/login')(fakeReq('POST', { id: 'claude' }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, false)
    assert.equal(res.body().error, 'not-installed')
    assert.equal(launched, false)
  })
  it('POST /omnimux/agents/login launches the CLI login', async () => {
    const launched = []
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude' })], probe: installedProbe(), login: async (target) => { launched.push(typeof target === 'string' ? target : target?.id); return { ok: true, launched: true, mode: 'terminal' } } })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/login')(fakeReq('POST', { id: 'claude' }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, true)
    assert.equal(res.body().launched, true)
    assert.deepEqual(launched, ['claude'])
  })
})

describe('agent routes · update', () => {
  it('POST /omnimux/agents/update rejects an unknown agent id', async () => {
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude' })], probe: installedProbe(), installShape: () => 'npm' })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/update')(fakeReq('POST', { id: 'nope' }), res)
    assert.equal(res.status, 400)
    assert.equal(res.body().ok, false)
  })
  it('POST /omnimux/agents/update reports a missing install', async () => {
    let ran = false
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude', installed: false, version: '' })], probe: async () => ({ installed: false, version: '' }), installShape: () => 'npm', update: async () => { ran = true; return { ok: true, version: '2.1.289' } } })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/update')(fakeReq('POST', { id: 'claude' }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, false)
    assert.equal(res.body().error, 'not-installed')
    assert.equal(ran, false)
  })
  it('POST /omnimux/agents/update returns the re-probed version', async () => {
    const calls = []
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude' })], probe: installedProbe(), installShape: () => 'npm', update: async (target, options) => { calls.push({ id: typeof target === 'string' ? target : target?.id, options }); return { ok: true, version: '2.1.289 (Claude Code)' } } })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/update')(fakeReq('POST', { id: 'claude' }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, true)
    assert.equal(res.body().version, '2.1.289 (Claude Code)')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].id, 'claude')
    assert.equal(calls[0].options.shape, 'npm')
  })
  it('POST /omnimux/agents/update refuses a concurrent second call for the same id', async () => {
    let release = null
    let started = null
    const startedPromise = new Promise((resolve) => { started = resolve })
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude' })], probe: installedProbe(), installShape: () => 'npm', update: async () => { started(); await new Promise((resolve) => { release = resolve }); return { ok: true, version: '2.1.289' } } })
    const first = fakeRes()
    const pending = handlers.get('/omnimux/agents/update')(fakeReq('POST', { id: 'claude' }), first)
    await Promise.race([startedPromise, deadline(2000, 'the update route never reached the injected update seam')])
    const second = fakeRes()
    await handlers.get('/omnimux/agents/update')(fakeReq('POST', { id: 'claude' }), second)
    assert.equal(second.status, 409)
    assert.equal(second.body().ok, false)
    assert.equal(second.body().error, 'update-in-progress')
    release()
    await pending
    assert.equal(first.status, 200)
    assert.equal(first.body().ok, true)
    assert.equal(first.body().version, '2.1.289')
  })
})

describe('agent routes · same-origin protection on the new routes', () => {
  it('GET /omnimux/agents still refuses a cross-origin read with not-local', async () => {
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude' })] })
    const res = fakeRes()
    await handlers.get('/omnimux/agents')(fakeReq('GET', undefined, CROSS_ORIGIN), res)
    assert.equal(res.status, 403)
    assert.equal(res.body().error, 'not-local')
  })
  it('GET /omnimux/agents/updates refuses a cross-origin read', async () => {
    const handlers = register({ settings: fakeSettings(), scan: async () => [agentRow({ id: 'claude' })], updateCheck: async () => ({ checkedAt: 1, updates: {} }) })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/updates')(withUrl(fakeReq('GET', undefined, CROSS_ORIGIN), '/omnimux/agents/updates'), res)
    assert.equal(res.status, 403)
    assert.equal(res.body().error, 'not-local')
  })
  it('POST /omnimux/agents/login refuses a cross-origin write', async () => {
    const handlers = register({ settings: fakeSettings(), probe: installedProbe(), login: async () => ({ ok: true, launched: true, mode: 'terminal' }) })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/login')(fakeReq('POST', { id: 'claude' }, CROSS_ORIGIN), res)
    assert.equal(res.status, 403)
    assert.equal(res.body().error, 'not-local')
  })
  it('POST /omnimux/agents/update refuses a cross-origin write', async () => {
    const handlers = register({ settings: fakeSettings(), probe: installedProbe(), installShape: () => 'npm', update: async () => ({ ok: true, version: '2.1.289' }) })
    const res = fakeRes()
    await handlers.get('/omnimux/agents/update')(fakeReq('POST', { id: 'claude' }, CROSS_ORIGIN), res)
    assert.equal(res.status, 403)
    assert.equal(res.body().error, 'not-local')
  })
})
