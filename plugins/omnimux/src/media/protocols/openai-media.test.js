import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { executeOmnimuxMedia } from '../execute.js'
import { withRoutingGroup } from './openai-media.js'
import { resolveMediaRoute, parseMediaConfig } from '../route.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

function inputFor(t, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-group-header-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return {
    prompt: 'a lamp',
    dest: join(dir, 'out.png'),
    model: 'gpt-image-2.5',
    env: { OMNIMUX_API_KEY: 'fixture-key' },
    ...extra,
  }
}

test('withRoutingGroup sets the gateway routing header and nothing else', async () => {
  const seen = []
  const routed = withRoutingGroup(async (input, init) => {
    seen.push({ url: String(input), headers: new Headers(init?.headers) })
    return json({ data: [{ b64_json: 'cG5n' }] })
  }, ' gpt-image-2.5-economy ')

  await routed.fetcher('https://api.omnimux.ai/v1/images/generations', { method: 'POST' })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].headers.get('X-Omnimux-Group'), 'gpt-image-2.5-economy')
})

test('withRoutingGroup leaves the request untouched when no group is resolved', async () => {
  const seen = []
  const routed = withRoutingGroup(async (input, init) => {
    seen.push(new Headers(init?.headers))
    return json({ data: [{ b64_json: 'cG5n' }] })
  }, undefined)

  await routed.fetcher('https://api.omnimux.ai/v1/images/generations', { method: 'POST' })
  assert.equal(seen[0].has('X-Omnimux-Group'), false)
})

test('withRoutingGroup preserves caller headers alongside the routing group', async () => {
  let captured
  const routed = withRoutingGroup(async (_input, init) => {
    captured = new Headers(init?.headers)
    return json({ data: [{ b64_json: 'cG5n' }] })
  }, 'default')

  await routed.fetcher('https://api.omnimux.ai/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  })
  assert.equal(captured.get('content-type'), 'application/json')
  assert.equal(captured.get('X-Omnimux-Group'), 'default')
})

test('a routing group reaches the wire as a header while the body keeps the bare model id', async (t) => {
  const bodies = []
  let groupHeader = null
  const input = inputFor(t, {
    group: 'gpt-image-2.5-economy',
    fetcher: async (url, init) => {
      assert.match(String(url), /images\/generations$/)
      groupHeader = new Headers(init.headers).get('X-Omnimux-Group')
      bodies.push(JSON.parse(init.body))
      return json({ data: [{ b64_json: 'cG5n' }] })
    },
  })

  const result = await executeOmnimuxMedia('image', input)
  assert.equal(result.mode, 'live')
  assert.equal(groupHeader, 'gpt-image-2.5-economy')
  // The candidate string `model@group` must never surface as the upstream model.
  assert.deepEqual(bodies, [
    { prompt: 'a lamp', size: '1792x1024', quality: 'standard', n: 1, model: 'gpt-image-2.5' },
  ])
  assert.equal(readFileSync(input.dest, 'utf8'), 'png')
})

test('without a routing group no X-Omnimux-Group header is sent', async (t) => {
  let headerValue = 'unset'
  const input = inputFor(t, {
    fetcher: async (_url, init) => {
      headerValue = new Headers(init.headers).get('X-Omnimux-Group')
      return json({ data: [{ b64_json: 'cG5n' }] })
    },
  })

  await executeOmnimuxMedia('image', input)
  assert.equal(headerValue, null)
})

test('the routing plan hands the executor model@group candidates for a pinned group', () => {
  const route = resolveMediaRoute('image', { group: 'gpt-image-2.5-economy' }, parseMediaConfig(undefined), {
    OMNIMUX_API_KEY: 'sk-fixture',
  })
  assert.equal(route.group, 'gpt-image-2.5-economy')
  assert.equal(route.candidates[0], 'gpt-image-2.5@gpt-image-2.5-economy')
  assert.ok(route.candidates[0].includes('@'), 'candidate carries the group for the executor to split')
})

test('each failing candidate re-pins the wire group and keeps the bare model id', async (t) => {
  const seen = []
  const input = inputFor(t, {
    group: 'cheap',
    fetcher: async (_url, init) => {
      seen.push({ model: JSON.parse(init.body).model, group: new Headers(init.headers).get('X-Omnimux-Group') })
      if (seen.length === 1) {
        return json({ error: { message: '分组 cheap 下模型无可用渠道 (distributor)' } }, 503)
      }
      return json({ data: [{ b64_json: 'cG5n' }] })
    },
  })

  const result = await executeOmnimuxMedia('image', input)
  assert.equal(result.mode, 'live')
  assert.ok(seen.length >= 2, 'failover visits at least two candidates')
  // The model never carries the group; the group never sticks to the wrong attempt.
  assert.deepEqual(seen.map((row) => row.model), ['gpt-image-2.5', 'gpt-image-2.5'])
  assert.equal(seen[0].group, 'cheap')
  assert.notEqual(seen[1].group, undefined)
})
