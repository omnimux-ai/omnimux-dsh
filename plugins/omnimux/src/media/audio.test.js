import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  executeOmnimuxAudio,
  readOmnimuxAudioConfig,
} from './audio.js'
import { parseMediaConfig, resolveMediaRoute } from './route.js'
import { mapOmnimuxInput } from './vendors/omnimux.js'

describe('omnimux audio helpers', () => {
  it('defaults to Suno on the openai-media row', () => {
    const route = resolveMediaRoute('audio', {}, parseMediaConfig(undefined), {
      OMNIMUX_API_KEY: 'sk-test',
    })
    assert.equal(route.providerId, 'omnimux')
    // 2026-10-21 网关对账 #3516：Seed Audio/tts 上游渠道停用，默认音频型号改为在架 suno。
    assert.equal(route.modelId, 'suno')
    assert.equal(route.protocol, 'openai-media')
    assert.equal(route.group, 'default')
  })

  it('resolves tts alias to canonical seed-audio-1.0', () => {
    const route = resolveMediaRoute('audio', { model: 'tts' }, parseMediaConfig(undefined), {
      OMNIMUX_API_KEY: 'sk-test',
    })
    assert.equal(route.providerId, 'omnimux')
    assert.equal(route.modelId, 'seed-audio-1.0')
  })

  it('overlays OMNIMUX_AUDIO_MODEL', () => {
    const route = resolveMediaRoute('audio', {}, parseMediaConfig(undefined), {
      OMNIMUX_API_KEY: 'sk-test',
      OMNIMUX_AUDIO_MODEL: 'gpt-4o-mini-tts',
    })
    assert.equal(route.modelId, 'gpt-4o-mini-tts')
  })

  it('rejects unlisted audio before auth or vendor execution', async () => {
    let vendorCalls = 0
    await assert.rejects(
      () => executeOmnimuxAudio({
        prompt: 'synthwave track',
        // #3516：suno 已上架；改用仅登记不上架的 seed-audio-1.0 保持「未上架先拒绝」覆盖。
        model: 'seed-audio-1.0',
        dest: '/tmp/no.mp3',
        // Unknown external fields must not alter SubmitGuard admission.
        bypassSubmitGuard: true,
        env: {},
        runtime: { async execute() { vendorCalls += 1 } },
      }),
      (err) => err?.code === 'omnimux-invalid-request',
    )
    assert.equal(vendorCalls, 0)
  })

  it('keeps legacy audio wire mapping out of unchecked submit execution', () => {
    const input = mapOmnimuxInput('audio', {
      prompt: 'a piano melody',
      style: 'minimal',
    })
    assert.equal(input.prompt, 'a piano melody')
    assert.deepEqual(input.metadata, { style: 'minimal' })
  })
})
