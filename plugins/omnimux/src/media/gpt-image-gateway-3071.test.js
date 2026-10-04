import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { clearGatewayUploadCache } from './gateway-upload.js'
assert.equal(typeof clearGatewayUploadCache, 'function')
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { guardSubmit } from '../catalog/contract/submit-guard/guard.js'
import { executeOmnimuxMedia } from './execute.js'
import { resolveMediaRoute, parseMediaConfig } from './route.js'
import { pickMediaUrl } from './vendors/omnimux.js'

const model = 'gpt-image-2.5'
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const input = (t, extra = {}) => {
  const home = mkdtempSync(join(tmpdir(), 'gpt-image-3071-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; rmSync(home, { recursive: true, force: true }) })
  return { model, prompt: 'a cat at a window', dest: join(home, 'out.png'), env: { OMNIMUX_API_KEY: 'sk-fixture' }, ...extra }
}

test('standard and economy are distinct routes and explicit selection cannot widen', () => {
  for (const [group, wire] of [['standard', 'default'], ['economy', 'gpt-image-2.5-economy'], ['pro', 'gpt-image-2.5-pro']]) {
    const route = resolveMediaRoute('image', { model, group }, parseMediaConfig())
    assert.deepEqual(route.candidates, [`${model}@${wire}`])
  }
  assert.deepEqual(resolveMediaRoute('image', { model }, parseMediaConfig()).candidates, [`${model}@default`])
})

test('per-line remapping keeps public hosted references instead of reintroducing local paths', async (t) => {
  clearGatewayUploadCache()
  const req = input(t, { group: 'economy', operation: 'multi_reference', requireListed: false, resolution: '1K', uploadLocalAssets: true, wait: false })
  const image = join(process.env.DSH_HOME, 'reference.png')
  writeFileSync(image, Buffer.from('iVBORw0KGgoAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))
  let captured
  let uploads = 0
  req.image = image
  req.fetcher = async (url) => {
    if (String(url).endsWith('/files/upload/presign')) return json({}, 501)
    if (String(url).endsWith('/files/upload/stream')) { uploads++; return json({ data: { file_url: 'https://assets.example.test/reference.png' } }) }
    throw new Error(`unexpected fixture URL: ${url}`)
  }
  req.runtime = { execute: async call => { captured = call.input; return { status: 'submitted', taskId: 'fixture-reference', outputs: [] } } }
  await executeOmnimuxMedia('image', req)
  assert.equal(uploads, 1)
  assert.equal(captured.image, 'https://assets.example.test/reference.png')
  assert.equal(JSON.stringify(captured).includes(image), false)
})

test('mixed pool remaps each line and refuses high resolution on standard without posting', async (t) => {
  for (const resolution of ['1K', '4K']) {
    const calls = []
    const req = input(t, { group: 'economy', allowedGroups: ['economy', 'standard'], aspectRatio: '16:9', resolution,
      fetcher: async (_url, init) => {
        const group = new Headers(init.headers).get('X-Omnimux-Group')
        calls.push({ group, body: JSON.parse(init.body) })
        return group === 'gpt-image-2.5-economy'
          ? json({ error: { code: 'get_channel_failed', message: 'temporarily unavailable' } }, 503)
          : json({ data: [{ b64_json: 'cG5n' }] })
      },
    })
    if (resolution === '4K') {
      await assert.rejects(executeOmnimuxMedia('image', req), { code: 'omnimux-invalid-request' })
      assert.equal(calls.length, 1)
    } else {
      await executeOmnimuxMedia('image', req)
      assert.equal(calls.length, 2)
      assert.deepEqual(calls[1], { group: 'default', body: { model, prompt: req.prompt, size: '16:9', resolution: '1K', n: 1 } })
    }
    assert.equal(calls[0].group, 'gpt-image-2.5-economy')
    assert.match(calls[0].body.size, /x/)
  }
})

test('standard sends every published ratio verbatim and never pixel size or quality', () => {
  for (const aspectRatio of ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']) {
    const plan = guardSubmit({ model, group: 'default', operation: 'text_to_image', prompt: 'cat', aspectRatio, resolution: '1K' }, { seam: 'imageGenerate' })
    assert.equal(plan.ok, true, plan.message)
    assert.deepEqual(plan.vendorPayload, { prompt: 'cat', size: aspectRatio, ...(aspectRatio !== 'auto' ? { resolution: '1K' } : {}), n: 1 })
  }
})

test('standard rejects stale high resolution, batches and explicit quality before HTTP', async (t) => {
  let requests = 0
  for (const extra of [{ resolution: '2K' }, { resolution: '4K' }, { n: 2 }, { quality: 'hd' }]) {
    await assert.rejects(executeOmnimuxMedia('image', input(t, { group: 'standard', ...extra, fetcher: async () => { requests++; throw new Error('HTTP must not run') } })), { code: 'omnimux-invalid-request' })
  }
  assert.equal(requests, 0)
})

test('default execute uses beta-compatible request once and stores synchronous result', async (t) => {
  const calls = []
  const req = input(t, { aspectRatio: 'auto', fetcher: async (url, init) => {
    calls.push({ method: init.method, group: new Headers(init.headers).get('X-Omnimux-Group'), body: JSON.parse(init.body) })
    return json({ data: [{ b64_json: 'cG5n' }] })
  } })
  const result = await executeOmnimuxMedia('image', req)
  assert.equal(result.mode, 'live')
  assert.match(result.taskRef, /^mtask_/)
  assert.deepEqual(calls, [{ method: 'POST', group: 'default', body: { model, prompt: req.prompt, size: 'auto', n: 1 } }])
  assert.equal(readFileSync(req.dest, 'utf8'), 'png')
})

test('EvoLink nested result bypasses gateway content proxy without resubmission', async (t) => {
  const url = 'https://files.evolink.ai/current.png'
  const envelope = { code: 'success', data: { status: 'SUCCESS', result_url: 'https://omnimux.ai/v1/images/task/content', data: { results: [url], result_data: [{ url }] } } }
  assert.equal(pickMediaUrl(envelope), url)
  const calls = []
  const req = input(t, { taskId: 'original-task', fetcher: async (target, init) => {
    calls.push({ url: String(target), method: init?.method ?? 'GET' })
    if (String(target) === url) return new Response(Buffer.from('png'), { headers: { 'content-type': 'image/png' } })
    return json(envelope)
  } })
  const result = await executeOmnimuxMedia('image', req)
  assert.equal(result.mode, 'live')
  assert.equal(result.taskId, 'original-task')
  assert.equal(readFileSync(req.dest, 'utf8'), 'png')
  assert.deepEqual(calls, [{ url: 'https://api.omnimux.ai/v1/images/generations/original-task', method: 'GET' }, { url, method: 'GET' }])
})
