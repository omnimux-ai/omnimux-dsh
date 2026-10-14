import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { executeOmnimuxMedia } from '../execute.js'
import { withRoutingGroup } from './openai-media.js'
import { resolveMediaRoute, parseMediaConfig } from '../route.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
function inputFor(t, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-group-header-'))
  const originalHome = process.env.DSH_HOME
  process.env.DSH_HOME = dir
  t.after(() => {
    if (originalHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = originalHome
    rmSync(dir, { recursive: true, force: true })
  })
  return Object.assign({ prompt: 'a lamp', dest: join(dir, 'out.png'), model: 'gpt-image-2.5', env: { OMNIMUX_API_KEY: 'sk-fixture' } }, extra)
}

test('withRoutingGroup sets the gateway routing header and nothing else', async () => {
  const seen = []
  const routed = withRoutingGroup(async (input, init) => {
    seen.push({ url: String(input), headers: new Headers(init.headers) })
    return json({ data: [{ b64_json: 'cG5n' }] })
  }, ' gpt-image-2.5-economy ')
  await routed.fetcher('https://api.omnimux.ai/v1/images/generations', { method: 'POST' })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].headers.get('X-Omnimux-Group'), 'gpt-image-2.5-economy')
})

test('withRoutingGroup leaves the request untouched when no group is resolved', async () => {
  const seen = []
  const routed = withRoutingGroup(async (input, init) => { seen.push(new Headers(init.headers)); return json({ data: [{ b64_json: 'cG5n' }] }) }, undefined)
  await routed.fetcher('https://api.omnimux.ai/v1/images/generations', { method: 'POST' })
  assert.equal(seen[0].has('X-Omnimux-Group'), false)
})

test('withRoutingGroup preserves caller headers alongside the routing group', async () => {
  let captured
  const routed = withRoutingGroup(async (input, init) => { captured = new Headers(init.headers); return json({ data: [{ b64_json: 'cG5n' }] }) }, 'default')
  await routed.fetcher('https://api.omnimux.ai/v1/images/generations', { method: 'POST', headers: { 'content-type': 'application/json' } })
  assert.equal(captured.get('content-type'), 'application/json')
  assert.equal(captured.get('X-Omnimux-Group'), 'default')
})

test('a routing group reaches the wire as a header while the body keeps the bare model id', async (t) => {
  const bodies = []
  let groupHeader = null
  const input = inputFor(t, { group: 'gpt-image-2.5-economy', fetcher: async (url, init) => {
    assert.match(String(url), /images\/generations$/)
    groupHeader = new Headers(init.headers).get('X-Omnimux-Group')
    bodies.push(JSON.parse(init.body))
    return json({ data: [{ b64_json: 'cG5n' }] })
  } })
  const result = await executeOmnimuxMedia('image', input)
  assert.equal(result.mode, 'live')
  assert.equal(groupHeader, 'gpt-image-2.5-economy')
  assert.deepEqual(bodies, [{ prompt: 'a lamp', size: '1792x1024', quality: 'standard', n: 1, model: 'gpt-image-2.5' }])
  assert.equal(readFileSync(input.dest, 'utf8'), 'png')
})

test('without a routing group no X-Omnimux-Group header is sent', async (t) => {
  let headerValue = 'unset'
  const input = inputFor(t, { model: 'custom-image-model', provider: 'custom', media: { defaultProvider: 'custom', providers: { custom: {
    protocol: 'openai-media', baseUrl: 'https://custom.example/v1', apiKey: 'none', models: { image: 'custom-image-model' },
  } } }, fetcher: async (url, init) => { headerValue = new Headers(init.headers).get('X-Omnimux-Group'); return json({ data: [{ b64_json: 'cG5n' }] }) } })
  await executeOmnimuxMedia('image', input)
  assert.equal(headerValue, null)
})

test('the routing plan hands the executor model@group candidates for a pinned group', () => {
  const route = resolveMediaRoute('image', { group: 'gpt-image-2.5-economy' }, parseMediaConfig(undefined), { OMNIMUX_API_KEY: 'sk-fixture' })
  assert.equal(route.group, 'gpt-image-2.5-economy')
  assert.equal(route.candidates[0], 'gpt-image-2.5@gpt-image-2.5-economy')
  assert.ok(route.candidates[0].includes('@'))
})

test('each failing candidate re-pins the wire group and keeps the bare model id', async (t) => {
  const seen = []
  const input = inputFor(t, { group: 'economy', allowedGroups: ['economy', 'pro'], fetcher: async (url, init) => {
    seen.push({ model: JSON.parse(init.body).model, group: new Headers(init.headers).get('X-Omnimux-Group') })
    if (seen.length === 1) return json({ error: { message: '分组 economy 下模型无可用渠道 (distributor)' } }, 503)
    return json({ data: [{ b64_json: 'cG5n' }] })
  } })
  const result = await executeOmnimuxMedia('image', input)
  assert.equal(result.mode, 'live')
  assert.equal(seen.length, 2)
  assert.deepEqual(seen.map((row) => row.model), ['gpt-image-2.5', 'gpt-image-2.5'])
  assert.equal(seen[0].group, 'gpt-image-2.5-economy')
  assert.equal(seen[1].group, 'gpt-image-2.5-pro')
})

test('an unregistered cheap line cannot become an implicit failover pool', async (t) => {
  let calls = 0
  const input = inputFor(t, { group: 'cheap', fetcher: async () => { calls += 1; return json({ data: [{ b64_json: 'cG5n' }] }) } })
  await assert.rejects(() => executeOmnimuxMedia('image', input), { code: 'unknown-group' })
  assert.equal(calls, 0)
})
