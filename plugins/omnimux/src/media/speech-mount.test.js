import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { mountMedia } from './mount.js'
import { executeOmnimuxAudio } from './audio.js'

async function captureRejection(run) {
  try {
    await run()
    assert.fail('expected the submit to be rejected')
  } catch (error) {
    return error
  }
}

test('audio tool and seam fail closed identically for the delisted speech contract', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'speech-mount-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const tools = []
  const provided = {}
  const captured = []
  const signal = new AbortController().signal
  mountMedia({
    tools: { register(tool) { tools.push(tool) } },
    provide(name, api) { provided[name] = api },
    get(name) { return name === 'credentials' ? { async resolve(ref) { return ref === 'OMNIMUX_API_KEY' ? { value: 'sk-fixture' } : undefined } } : undefined },
  }, {
    kind: 'audio', jsonOut: {}, media: {},
    execute: (input) => executeOmnimuxAudio({ ...input, env: {}, fetcher: async (_url, request) => {
      assert.equal(request.headers.authorization, 'Bearer sk-fixture')
      captured.push(JSON.parse(request.body))
      return new Response(Buffer.from('RIFF fixture bytes'), { headers: { 'content-type': 'audio/wav' } })
    } }),
  })
  const tool = tools[0]
  assert.equal(tool.name, 'omnimux_audio_submit')
  assert.ok(tool.parameters.properties.format)
  const args = {
    prompt: '这是需要朗读的完整正文。', dest: join(dir, 'tool.wav'), operation: 'text_to_speech',
    model: 'seed-audio', voice: 'zh_female_gujie_uranus_bigtts', speed: 1.25, format: 'wav',
  }
  // 2026-10-21 网关对账 #3516：Seed Audio 上游渠道停用 → 仅登记不上架；官方 TTS 提交
  // 在 tool 与 seam 两条入口上都必须经同一个 SubmitGuard 以同一结果 fail-closed，
  // 不得落到 HTTP/落盘（发写映射一致性由 speech.test.js 的传输层断言锁定）。
  const toolError = await captureRejection(() => tool.execute(args, { signal }))
  const seamError = await captureRejection(() => provided.audioGenerate.execute({ ...args, dest: join(dir, 'seam.wav'), signal }))
  assert.equal(toolError.code, 'omnimux-invalid-request')
  assert.equal(seamError.code, toolError.code)
  assert.equal(toolError.details?.guardCode, 'implementation_unavailable')
  assert.deepEqual(toolError.details, seamError.details)
  assert.equal(toolError.message, seamError.message)
  assert.match(toolError.message, /seed-audio-1\.0#text_to_speech implementation is none/)
  assert.deepEqual(captured, [], 'no vendor HTTP body may be produced')
  assert.equal(existsSync(args.dest), false)
  assert.equal(existsSync(join(dir, 'seam.wav')), false)
})
