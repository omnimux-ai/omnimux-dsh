import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Readable } from 'node:stream'
import { registerAgentRoutes } from './http.js'

function fakeRes() {
  return {
    status: 0,
    text: '',
    writeHead(status) { this.status = status },
    end(text) { this.text = text },
    body() { return JSON.parse(this.text) },
  }
}

function fakeReq(method, body, headers = {}) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  stream.method = method
  stream.headers = headers
  return stream
}

function fakeSettings(initial = {}) {
  let value = { ...initial }
  return {
    get value() { return value },
    get: async () => value,
    describe: () => [{ ns: 'omnimux', revision: 1 }],
    update: async (ns, patch) => { value = { ...value, ...patch } },
  }
}

function register(deps) {
  const handlers = {}
  const webServer = {
    register(route) {
      handlers[route.path] = route.handler
      return () => { delete handlers[route.path] }
    },
  }
  registerAgentRoutes(webServer, deps)
  return handlers
}

describe('agent routes', () => {
  it('GET lists scanned agents', async () => {
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [{ id: 'claude', name: 'Claude Code', installed: true, version: '2.1' }],
    })
    const res = fakeRes()
    await handlers['/omnimux/agents'](fakeReq('GET'), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().agents.length, 1)
    assert.equal(res.body().agents[0].installed, true)
  })

  it('select marks a probed agent verified', async () => {
    const settings = fakeSettings({})
    const handlers = register({
      settings,
      probe: async () => ({ installed: true, version: '2.1' }),
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/select'](fakeReq('POST', { id: 'claude' }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, true)
    assert.equal(settings.value.runtimeAgentId, 'claude')
    assert.equal(settings.value.runtimeAgentVerified, true)
  })

  it('select on a missing binary stores the choice as unverified', async () => {
    const settings = fakeSettings({})
    const handlers = register({
      settings,
      probe: async () => ({ installed: false, version: '' }),
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/select'](fakeReq('POST', { id: 'kimi' }), res)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body(), { ok: false, error: 'not-installed' })
    assert.equal(settings.value.runtimeAgentId, 'kimi')
    assert.equal(settings.value.runtimeAgentVerified, false)
  })

  it('select rejects an unknown agent id', async () => {
    const handlers = register({ settings: fakeSettings({}) })
    const res = fakeRes()
    await handlers['/omnimux/agents/select'](fakeReq('POST', { id: 'nope' }), res)
    assert.equal(res.status, 400)
  })

  it('GET refuses a cross-origin read (machine fingerprint)', async () => {
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [{ id: 'claude', name: 'Claude Code', installed: true, version: '2.1' }],
    })
    const res = fakeRes()
    await handlers['/omnimux/agents'](fakeReq('GET', undefined, { origin: 'https://evil.example' }), res)
    assert.equal(res.status, 403)
  })

  it('select refuses a cross-origin write', async () => {
    const handlers = register({ settings: fakeSettings({}) })
    const res = fakeRes()
    await handlers['/omnimux/agents/select'](fakeReq('POST', { id: 'claude' }, { origin: 'https://evil.example' }), res)
    assert.equal(res.status, 403)
  })
})

const NPM_CLAUDE_PATH = '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude'

function agentRow(overrides = {}) {
  const { binPath = NPM_CLAUDE_PATH, id = 'claude', ...rest } = overrides
  return {
    id,
    name: id,
    installed: true,
    version: '2.1.223 (Claude Code)',
    models: [],
    bin: id,
    binPath,
    ...rest,
  }
}

/** Records which agents were asked for a sign-in state. */
function fakeAuthProbe(byId = {}) {
  const seen = []
  const probe = async (target) => {
    const id = typeof target === 'string' ? target : target?.id
    seen.push(id)
    return { ...(byId[id] || { state: 'unknown', method: 'none' }) }
  }
  probe.seen = seen
  return probe
}

function withUrl(req, url) {
  req.url = url
  return req
}

/** Rejects instead of hanging forever when a route never reaches a seam. */
function deadline(ms, message) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    if (typeof timer.unref === 'function') timer.unref()
  })
}

function installedProbe(version = '2.1.223') {
  return async () => ({ installed: true, version })
}

const CROSS_ORIGIN = { origin: 'https://evil.example' }

describe('agent routes · sign-in state', () => {
  it('GET /omnimux/agents carries auth state and login support per row', async () => {
    const authProbe = fakeAuthProbe({
      claude: { state: 'signed-in', method: 'command' },
      qwen: { state: 'signed-out', method: 'file' },
    })
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude' }), agentRow({ id: 'qwen' })],
      authProbe,
    })
    const res = fakeRes()
    await handlers['/omnimux/agents'](fakeReq('GET'), res)
    assert.equal(res.status, 200)
    const rows = res.body().agents
    const claude = rows.find((row) => row.id === 'claude')
    const qwen = rows.find((row) => row.id === 'qwen')
    assert.equal(claude.auth.state, 'signed-in')
    assert.equal(claude.auth.method, 'command')
    assert.equal(claude.auth.loginSupported, true, 'claude has an account login command')
    assert.equal(qwen.auth.state, 'signed-out')
    assert.equal(qwen.auth.method, 'file')
    assert.equal(qwen.auth.loginSupported, false, 'qwen retired its account login flow')
  })

  it('GET /omnimux/agents never probes an agent that is not installed', async () => {
    const authProbe = fakeAuthProbe({ claude: { state: 'signed-in', method: 'command' } })
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude' }), agentRow({ id: 'codex', installed: false, version: '' })],
      authProbe,
    })
    const res = fakeRes()
    await handlers['/omnimux/agents'](fakeReq('GET'), res)
    assert.equal(res.status, 200)
    const codex = res.body().agents.find((row) => row.id === 'codex')
    assert.equal(codex.auth.state, 'unknown')
    assert.equal(codex.auth.method, 'none')
    assert.equal(authProbe.seen.includes('codex'), false, 'a missing CLI has no sign-in state to ask about')
  })

  it('GET /omnimux/agents reports unknown instead of guessing when the probe fails', async () => {
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude' })],
      authProbe: async () => {
        throw new Error('probe exploded')
      },
    })
    const res = fakeRes()
    await handlers['/omnimux/agents'](fakeReq('GET'), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().agents[0].auth.state, 'unknown')
    assert.notEqual(res.body().agents[0].auth.state, 'signed-out')
  })
})

describe('agent routes · update state', () => {
  it('GET /omnimux/agents/updates returns the checker payload', async () => {
    const payload = {
      checkedAt: 1_760_000_000_000,
      updates: {
        claude: {
          state: 'available',
          current: '2.1.223',
          latest: '2.1.289',
          channel: 'npm',
          installShape: 'npm',
          supported: true,
        },
      },
    }
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude' })],
      updateCheck: async () => payload,
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/updates'](
      withUrl(fakeReq('GET'), '/omnimux/agents/updates'),
      res,
    )
    assert.equal(res.status, 200)
    assert.equal(res.body().checkedAt, payload.checkedAt)
    assert.equal(res.body().updates.claude.state, 'available')
    assert.equal(res.body().updates.claude.latest, '2.1.289')
    assert.equal(res.body().updates.claude.supported, true)
  })

  it('GET /omnimux/agents/updates forwards ?refresh=1 and only then', async () => {
    const seen = []
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude' })],
      updateCheck: async (...args) => {
        seen.push(args)
        return { checkedAt: 1, updates: {} }
      },
    })
    const askedForRefresh = (args) => args.some((arg) => (
      arg && typeof arg === 'object' && Boolean(arg.refresh)
    ))

    const plain = fakeRes()
    await handlers['/omnimux/agents/updates'](withUrl(fakeReq('GET'), '/omnimux/agents/updates'), plain)
    assert.equal(seen.length, 1)
    assert.equal(askedForRefresh(seen[0]), false, 'a plain read must not force a refresh')

    const refreshed = fakeRes()
    await handlers['/omnimux/agents/updates'](
      withUrl(fakeReq('GET'), '/omnimux/agents/updates?refresh=1'),
      refreshed,
    )
    assert.equal(seen.length, 2)
    assert.equal(askedForRefresh(seen[1]), true, '?refresh=1 must reach the checker')
  })
})

describe('agent routes · login', () => {
  it('POST /omnimux/agents/login rejects an unknown agent id', async () => {
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude' })],
      probe: installedProbe(),
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/login'](fakeReq('POST', { id: 'nope' }), res)
    assert.equal(res.status, 400)
    assert.equal(res.body().ok, false)
    assert.equal(res.body().error, 'unknown-agent')
  })

  it('POST /omnimux/agents/login reports a missing install', async () => {
    let launched = false
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude', installed: false, version: '' })],
      probe: async () => ({ installed: false, version: '' }),
      login: async () => {
        launched = true
        return { ok: true, launched: true, mode: 'terminal' }
      },
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/login'](fakeReq('POST', { id: 'claude' }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, false)
    assert.equal(res.body().error, 'not-installed')
    assert.equal(launched, false, 'a CLI that is not installed has nothing to launch')
  })

  it('POST /omnimux/agents/login launches the CLI login', async () => {
    const launched = []
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude' })],
      probe: installedProbe(),
      login: async (target) => {
        launched.push(typeof target === 'string' ? target : target?.id)
        return { ok: true, launched: true, mode: 'terminal' }
      },
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/login'](fakeReq('POST', { id: 'claude' }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, true)
    assert.equal(res.body().launched, true)
    assert.deepEqual(launched, ['claude'])
  })
})

describe('agent routes · update', () => {
  it('POST /omnimux/agents/update rejects an unknown agent id', async () => {
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude' })],
      probe: installedProbe(),
      installShape: () => 'npm',
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/update'](fakeReq('POST', { id: 'nope' }), res)
    assert.equal(res.status, 400)
    assert.equal(res.body().ok, false)
  })

  it('POST /omnimux/agents/update reports a missing install', async () => {
    let ran = false
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude', installed: false, version: '' })],
      probe: async () => ({ installed: false, version: '' }),
      installShape: () => 'npm',
      update: async () => {
        ran = true
        return { ok: true, version: '2.1.289' }
      },
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/update'](fakeReq('POST', { id: 'claude' }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, false)
    assert.equal(res.body().error, 'not-installed')
    assert.equal(ran, false, 'a CLI that is not installed has nothing to upgrade')
  })

  it('POST /omnimux/agents/update returns the re-probed version', async () => {
    const calls = []
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude' })],
      probe: installedProbe(),
      installShape: () => 'npm',
      update: async (target, options) => {
        calls.push({ id: typeof target === 'string' ? target : target?.id, options })
        return { ok: true, version: '2.1.289 (Claude Code)' }
      },
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/update'](fakeReq('POST', { id: 'claude' }), res)
    assert.equal(res.status, 200)
    assert.equal(res.body().ok, true)
    assert.equal(res.body().version, '2.1.289 (Claude Code)')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].id, 'claude')
    assert.equal(calls[0].options.shape, 'npm', 'the route must hand over the detected install shape')
  })

  it('POST /omnimux/agents/update refuses a concurrent second call for the same id', async () => {
    let release = null
    let started = null
    const startedPromise = new Promise((resolve) => { started = resolve })
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude' })],
      probe: installedProbe(),
      installShape: () => 'npm',
      update: async () => {
        started()
        await new Promise((resolve) => { release = resolve })
        return { ok: true, version: '2.1.289' }
      },
    })

    const first = fakeRes()
    const pending = handlers['/omnimux/agents/update'](fakeReq('POST', { id: 'claude' }), first)
    await Promise.race([
      startedPromise,
      deadline(2000, 'the update route never reached the injected update seam'),
    ])

    const second = fakeRes()
    await handlers['/omnimux/agents/update'](fakeReq('POST', { id: 'claude' }), second)
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
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude' })],
    })
    const res = fakeRes()
    await handlers['/omnimux/agents'](fakeReq('GET', undefined, CROSS_ORIGIN), res)
    assert.equal(res.status, 403)
    assert.equal(res.body().error, 'not-local')
  })

  it('GET /omnimux/agents/updates refuses a cross-origin read', async () => {
    const handlers = register({
      settings: fakeSettings({}),
      scan: async () => [agentRow({ id: 'claude' })],
      updateCheck: async () => ({ checkedAt: 1, updates: {} }),
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/updates'](
      withUrl(fakeReq('GET', undefined, CROSS_ORIGIN), '/omnimux/agents/updates'),
      res,
    )
    assert.equal(res.status, 403)
    assert.equal(res.body().error, 'not-local')
  })

  it('POST /omnimux/agents/login refuses a cross-origin write', async () => {
    const handlers = register({
      settings: fakeSettings({}),
      probe: installedProbe(),
      login: async () => ({ ok: true, launched: true, mode: 'terminal' }),
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/login'](fakeReq('POST', { id: 'claude' }, CROSS_ORIGIN), res)
    assert.equal(res.status, 403)
    assert.equal(res.body().error, 'not-local')
  })

  it('POST /omnimux/agents/update refuses a cross-origin write', async () => {
    const handlers = register({
      settings: fakeSettings({}),
      probe: installedProbe(),
      installShape: () => 'npm',
      update: async () => ({ ok: true, version: '2.1.289' }),
    })
    const res = fakeRes()
    await handlers['/omnimux/agents/update'](fakeReq('POST', { id: 'claude' }, CROSS_ORIGIN), res)
    assert.equal(res.status, 403)
    assert.equal(res.body().error, 'not-local')
  })
})
