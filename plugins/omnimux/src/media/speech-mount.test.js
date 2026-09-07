import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { mountMedia } from './mount.js'
import { executeOmnimuxAudio } from './audio.js'

test('audio tool and seam send identical selected speech parameters through the real guard', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'speech-mount-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const tools = []
  const provided = {}
  const captured = []
  const signal = new AbortController().signal
  mountMedia({
    tools: { register(tool) { tools.push(tool) } },
    provide(name, api) { provided[name] = api },
  }, {
    kind: 'audio', jsonOut: {}, media: {},
    store: { async resolve() { return 'fixture-login-token' } },
    execute: (input) => executeOmnimuxAudio({ ...input, env: {}, fetcher: async (_url, request) => {
      assert.equal(request.headers.authorization, 'Bearer fixture-login-token')
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
  const toolResult = await tool.execute(args, { signal })
  const seamResult = await provided.audioGenerate.execute({ ...args, dest: join(dir, 'seam.wav'), signal })
  const expected = {
    model: 'seed-audio-1.0', input: args.prompt, voice: args.voice, speed: args.speed, response_format: args.format,
  }
  assert.deepEqual(captured, [expected, expected])
  assert.equal(toolResult.mode, 'live')
  assert.equal(seamResult.mode, 'live')
  assert.equal(toolResult.dest, args.dest)
  assert.deepEqual(readFileSync(toolResult.dest), readFileSync(seamResult.dest))
})
