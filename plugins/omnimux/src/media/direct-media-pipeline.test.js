import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { executeOmnimuxMedia } from './execute.js'
import { registerDirectMediaRoutes, DIRECT_MEDIA_GENERATE_ROUTE } from './direct-http.js'

let fixtureHome, previousHome
before(() => { previousHome = process.env.DSH_HOME; fixtureHome = mkdtempSync(join(tmpdir(), 'direct-media-home-')); process.env.DSH_HOME = fixtureHome })
after(() => { if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome; rmSync(fixtureHome, { recursive: true, force: true }) })

describe('直连媒体生成路由与官方独立用途', () => {
  it('直连路由透传明确选择的渠道，不把文字渠道当成媒体渠道', async () => {
    let route, capturedReq, responseData, status
    registerDirectMediaRoutes({ register(value) { route = value; return () => {} } }, {
      executeImage: async (req) => { capturedReq = req; return { mode: 'live', url: 'https://cdn.test/cat.png' } }, executeVideo: async () => {},
    })
    assert.equal(route.path, DIRECT_MEDIA_GENERATE_ROUTE)
    const req = Readable.from([Buffer.from(JSON.stringify({ prompt: '画一只猫', kind: 'image', model: 'gpt-image-2.5', channel: 'standard' }))])
    req.method = 'POST'
    await route.handler(req, { writeHead(value) { status = value }, end(payload) { responseData = JSON.parse(payload) } })
    assert.equal(status, 200); assert.equal(responseData.ok, true); assert.ok(capturedReq); assert.equal(capturedReq.group, 'standard')
  })
  it('本机文字助手不阻止官方图片，确切提交成功且不触碰真实服务', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'direct-media-fixture-')); t.after(() => rmSync(dir, { recursive: true, force: true }))
    const refs = [], requests = [], dest = join(dir, 'image.png')
    const result = await executeOmnimuxMedia('image', {
      dest, prompt: 'a white cat', model: 'gpt-image-2.5', env: {},
      runtimeSettings: { runtimeMode: 'agent', scenarioBindings: { text: { channel: 'agent' }, image: { channel: 'official' } } },
      credentials: { async resolve(ref) { refs.push(ref); assert.equal(ref, 'OMNIMUX_API_KEY'); return { value: 'sk-official-fixture' } } },
      fetcher: async (url, init) => {
        requests.push({ url: String(url), method: init.method, authorization: new Headers(init.headers).get('authorization'), body: JSON.parse(init.body) })
        return new Response(JSON.stringify({ data: [{ b64_json: 'cG5n' }] }), { headers: { 'content-type': 'application/json' } })
      },
    })
    assert.equal(result.mode, 'live'); assert.deepEqual(refs, ['OMNIMUX_API_KEY']); assert.equal(requests.length, 1)
    assert.equal(requests[0].url, 'https://api.omnimux.ai/v1/images/generations'); assert.equal(requests[0].method, 'POST')
    assert.equal(requests[0].authorization, 'Bearer sk-official-fixture'); assert.equal(requests[0].body.model, 'gpt-image-2.5'); assert.equal(readFileSync(dest, 'utf8'), 'png')
  })
})
