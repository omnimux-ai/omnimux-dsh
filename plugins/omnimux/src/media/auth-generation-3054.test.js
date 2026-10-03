import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import { resolveExecutionPlan } from './execution-plan.js'
import { mountMedia } from './mount.js'
import { executeOmnimuxMedia } from './execute.js'
import { parseMediaConfig, resolveMediaAuth, resolveMediaRoute } from './route.js'
import { downloadMediaFile, getJson } from './job.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

async function withServerEnv(values, run) {
  const keys = ['OMNIMUX_API_KEY', 'OMNIMUX_TOKEN', 'OMNIMUX_BASE_URL', 'DSH_HOME']
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'omnimux-auth-3054-'))
  try {
    for (const key of keys) delete process.env[key]
    process.env.DSH_HOME = dir
    Object.assign(process.env, values)
    return await run(dir)
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function mountedApi(kind, settings, credentials, extra = {}) {
  let api
  mountMedia({
    get: (name) => name === 'settings' ? { get: () => settings } : name === 'credentials' ? credentials : undefined,
    provide: (name, value) => { if (name === `${kind}Generate`) api = value },
    tools: { register() {} },
  }, {
    kind,
    execute: (req) => executeOmnimuxMedia(kind, { ...req, ...extra }),
    media: parseMediaConfig(),
    gate: { capabilities: { media: true } },
    jsonOut: {},
  })
  assert.ok(api)
  return api
}

describe('Issue #3054 current-operation media API credentials', () => {
  it('planning never reads profile credentials or canonical secrets outside node:test isolation', () => {
    const moduleUrl = new URL('./execution-plan.js', import.meta.url).href
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict'
      import fs from 'node:fs'
      import os from 'node:os'
      import { syncBuiltinESMExports } from 'node:module'
      const exists = fs.existsSync
      const read = fs.readFileSync
      let credentialReads = 0
      os.homedir = () => '/isolated-auth-fixture'
      fs.existsSync = (p) => String(p).endsWith('.credentials.yaml') ? false : String(p).endsWith('/.config/omnimux/secrets.json') ? true : exists(p)
      fs.readFileSync = (p, ...args) => String(p).endsWith('/.config/omnimux/secrets.json')
        ? (credentialReads++, '{"access_token":"pat-isolated-fixture"}')
        : String(p).endsWith('.credentials.yaml') ? (credentialReads++, '') : read(p, ...args)
      syncBuiltinESMExports()
      delete process.env.NODE_ENV
      delete process.env.NODE_TEST_CONTEXT
      delete process.env.OMNIMUX_API_KEY
      delete process.env.OMNIMUX_TOKEN
      process.env.DSH_HOME = '/isolated-auth-fixture/current-profile'
      const { resolveExecutionPlan } = await import(${JSON.stringify(moduleUrl)})
      const plan = resolveExecutionPlan({ kind: 'video', req: { model: 'seedance-2-5' }, current: { runtimeMode: 'agent' } })
      assert.deepEqual(plan.finalReq.env, {})
      assert.equal(credentialReads, 0)
    `], { encoding: 'utf8' })
    assert.equal(child.status, 0, child.stderr || child.stdout)
  })

  it('official catalog models bypass unrelated runtime readiness without trusting client env', async () => {
    await withServerEnv({}, async () => {
      for (const [kind, model] of [['image', 'gpt-image-2.5'], ['video', 'seedance-2-5']]) {
        for (const task of [{}, { taskId: 'task-fixture' }, { taskRef: 'mtask_fixture' }]) {
          const plan = resolveExecutionPlan({ kind, req: { model, ...task, env: { OMNIMUX_API_KEY: 'forged-client', OMNIMUX_BASE_URL: 'https://attacker.invalid' } }, current: { runtimeMode: 'agent' } })
          assert.equal(plan.isOfficialBypass, true)
          assert.deepEqual(plan.finalReq.env, {})
        }
      }
      assert.throws(() => resolveExecutionPlan({ kind: 'image', req: { model: 'gpt-image-2.5@seedance-2-0-task-pro' }, current: { runtimeMode: 'agent' } }), /尚未配置/)
    })
  })

  it('explicit server API override wins and strips all client env including collect requests', async () => {
    await withServerEnv({ OMNIMUX_API_KEY: 'sk-server-fixture' }, async () => {
      for (const task of [{}, { taskId: 'task-fixture' }]) {
        const plan = resolveExecutionPlan({ kind: 'image', req: { model: 'gpt-image-2.5', ...task, env: { OMNIMUX_API_KEY: 'forged-client', OMNIMUX_BASE_URL: 'https://attacker.invalid', OTHER: 'untrusted' } }, current: { runtimeMode: 'agent' } })
        assert.deepEqual(plan.finalReq.env, { OMNIMUX_API_KEY: 'sk-server-fixture' })
        const auth = await resolveMediaAuth(resolveMediaRoute('image', plan.finalReq, parseMediaConfig(), plan.finalReq.env), {
          env: plan.finalReq.env,
          credentials: { resolve: async () => ({ value: 'sk-current-profile-fixture' }) },
        })
        assert.equal(auth.apiKey, 'sk-server-fixture')
      }
    })
  })

  it('PAT env, inline and API-ref values never shadow current API keys or invoke login stores', async () => {
    await withServerEnv({ OMNIMUX_API_KEY: 'pat-server-fixture' }, async () => {
      const plan = resolveExecutionPlan({ kind: 'video', req: { model: 'seedance-2-5' }, current: { runtimeMode: 'agent' } })
      assert.deepEqual(plan.finalReq.env, {})
      const route = resolveMediaRoute('video', {}, parseMediaConfig(), { OMNIMUX_API_KEY: 'pat-inline-fixture' })
      const seen = []
      const auth = await resolveMediaAuth(route, {
        env: { OMNIMUX_API_KEY: 'pat-env-fixture' },
        credentials: { resolve: async (ref) => {
          seen.push(ref)
          return { value: ref === 'OMNIMUX_API_KEY' ? 'pat-api-ref-fixture' : 'sk-current-profile-fixture' }
        } },
        store: { resolve: async () => { throw new Error('login store must not be read') } },
      })
      assert.deepEqual(auth, { apiKey: 'sk-current-profile-fixture', authType: 'api-key' })
      assert.deepEqual(seen, ['OMNIMUX_API_KEY', 'OMNIMUX_TOKEN'])
      await assert.rejects(() => resolveMediaAuth(route, {
        env: {},
        credentials: { resolve: async (ref) => { assert.notEqual(ref, 'OMNIMUX_ACCESS_TOKEN'); return { value: 'pat-only-fixture' } } },
        store: { resolve: async () => { throw new Error('login store must not be read') } },
      }), (err) => err.code === 'needs-omnimux' && /API 密钥/.test(err.message) && !/请先.*登录/.test(err.message))
    })
  })

  it('current credential service errors remain visible and custom vendor keys are not prefix-guessed', async () => {
    const official = resolveMediaRoute('image', {}, parseMediaConfig(), {})
    const cause = new Error('credential service unavailable')
    await assert.rejects(() => resolveMediaAuth(official, { env: {}, credentials: { resolve: async () => { throw cause } } }), (err) => err.code === 'needs-omnimux' && err.cause === cause)
    const media = parseMediaConfig({ defaultProvider: 'vendor', providers: { vendor: { protocol: 'openai-media', baseUrl: 'https://vendor.invalid/v1', apiKeyEnv: 'VENDOR_KEY', models: { image: 'vendor-image' } } } })
    const route = resolveMediaRoute('image', {}, media, { VENDOR_KEY: 'vendor-secret-without-sk-prefix' })
    assert.deepEqual(await resolveMediaAuth(route, { env: { VENDOR_KEY: 'vendor-secret-without-sk-prefix' } }), { apiKey: 'vendor-secret-without-sk-prefix', authType: 'api-key' })
  })

  it('real mount→submit→poll→download code uses the current credential at every operation with fake fetch only', async () => {
    await withServerEnv({}, async (dir) => {
      const calls = []
      let key = 'sk-submit-fixture'
      const credentials = { resolve: async (ref) => ref === 'OMNIMUX_API_KEY' ? { value: key } : undefined }
      const api = mountedApi('video', { runtimeMode: 'agent' }, credentials)
      const fetcher = async (url, init) => {
        calls.push({ url: String(url), method: init.method || 'GET', authorization: init.headers.authorization })
        if (init.method === 'POST') return json({ task_id: 'task-auth-3054-fixture' })
        if (String(url).endsWith('/content')) return new Response('video-fixture-bytes', { headers: { 'content-type': 'video/mp4' } })
        return json({ status: 'succeeded', url: 'https://api.omnimux.ai/v1/videos/task-auth-3054-fixture/content' })
      }
      const submitted = await api.execute({ model: 'seedance-2-5', operation: 'text_to_video', prompt: 'fixture video', duration: 5, dest: join(dir, 'video.mp4'), wait: false, fetcher })
      assert.equal(submitted.mode, 'submitted')
      assert.equal(calls.length, 1)
      assert.equal(calls[0].authorization, 'Bearer sk-submit-fixture')
      key = 'sk-collect-fixture'
      const collected = await api.execute({ taskRef: submitted.taskRef, dest: join(dir, 'video.mp4'), fetcher, sleep: async () => {} })
      assert.equal(collected.mode, 'live')
      assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
      assert.ok(calls.slice(1).every((call) => call.authorization === 'Bearer sk-collect-fixture'))
      assert.equal(fs.readFileSync(join(dir, 'video.mp4'), 'utf8'), 'video-fixture-bytes')
    })
  })

  it('real image mount→submit→download resolves current profile API key despite login PAT', async () => {
    await withServerEnv({}, async (dir) => {
      const calls = []
      const api = mountedApi('image', { runtimeMode: 'agent' }, { resolve: async (ref) => ({ value: ref === 'OMNIMUX_API_KEY' ? 'sk-image-fixture' : 'pat-login-fixture' }) })
      const result = await api.execute({ model: 'gpt-image-2.5', operation: 'text_to_image', prompt: 'fixture image', dest: join(dir, 'image.png'), fetcher: async (url, init) => {
        calls.push({ url: String(url), authorization: new Headers(init.headers).get('authorization') })
        if (init.method === 'POST') return json({ data: [{ url: 'https://api.omnimux.ai/v1/images/image-fixture/content' }] })
        return new Response('image-fixture-bytes', { headers: { 'content-type': 'image/png' } })
      } })
      assert.equal(result.mode, 'live')
      assert.equal(calls.length, 2)
      assert.ok(calls.every((call) => call.authorization === 'Bearer sk-image-fixture'))
    })
  })

  it('only exact official HTTPS download hostnames receive credentials', async () => {
    await withServerEnv({}, async (dir) => {
      for (const url of [
        'https://api.omnimux.ai/v1/videos/task-fixture/content',
        'https://omnimux.ai/v1/videos/task-fixture/content',
        'https://api.omnimux.ai.attacker.invalid/content',
        'https://attacker.invalid/omnimux.ai/content',
        'https://attacker.invalid/?target=omnimux.ai',
        'https://omnimux.ai@attacker.invalid/content',
        'http://api.omnimux.ai/content',
        '//attacker.invalid/omnimux.ai/content',
        '/omnimux.ai/content',
      ]) {
        let headers
        await downloadMediaFile({ url, dest: join(dir, 'download.mp4'), apiKey: 'sk-download-fixture', capability: 'video', maxRetries: 0, fetcher: async (_url, init) => { headers = init.headers; return new Response('fixture', { headers: { 'content-type': 'video/mp4' } }) } })
        const official = url.startsWith('https://api.omnimux.ai/') || url.startsWith('https://omnimux.ai/')
        assert.equal(headers.authorization, official ? 'Bearer sk-download-fixture' : undefined, url)
      }
    })
  })

  it('official download and poll 401s retain the rejected credential reason rather than asking to log in', async () => {
    const rejected = () => json({ error: { message: 'invalid token' } }, 401)
    for (const key of ['sk-rejected-fixture', 'pat-rejected-fixture']) {
      const validate = (err) => err.code === 'needs-omnimux' && err.status === 401 && !/请先登录/.test(err.message) && (key.startsWith('sk-') ? /拒绝.*API 密钥/.test(err.message) : /不接受登录凭证/.test(err.message))
      await assert.rejects(() => getJson(rejected, 'https://api.omnimux.ai/v1/videos/task-fixture', key), validate)
      await assert.rejects(() => downloadMediaFile({ dest: '/never-written-fixture', url: 'https://api.omnimux.ai/v1/videos/task-fixture/content', apiKey: key, maxRetries: 0, fetcher: rejected }), validate)
    }
  })
})
