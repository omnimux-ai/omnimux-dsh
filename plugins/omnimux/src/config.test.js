import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Config, parseHubConfig } from './config.js'

test('parseHubConfig fills brand and the OmniMux media row and default gate', () => {
  const parsed = parseHubConfig({})
  assert.equal(parsed.productName, 'OmniMux')
  assert.equal(parsed.heroHeadline, '属于你的AI社媒运营团队')
  assert.equal(parsed.heroHeadlineFit, true)
  assert.equal(parsed.heroHeadlineMaxPx, 26)
  assert.equal(parsed.heroHeadlineMinPx, 16)
  assert.equal(parsed.media.defaultProvider, 'omnimux')
  assert.equal(parsed.media.providers.omnimux.protocol, 'openai-media')
  assert.equal(parsed.media.providers.omnimux.models.video, 'seedance-2-0-fast')
  assert.equal(parsed.media.providers.omnimux.models.image, 'gpt-image-2')
  assert.equal(parsed.media.providers.omnimux.models.audio, 'seed-audio-1.0')
  assert.equal(parsed.official.mount, true)
  assert.equal(parsed.official.accountAvatars.enabled, true)
  assert.equal(parsed.official.accountAvatars.maxBytes, 204800)
  assert.equal(parsed.official.accountAvatars.fetchTimeoutMs, 8000)
  assert.equal(parsed.official.accountAvatars.concurrency, 4)
  assert.equal(parsed.apps.remote, false)
  assert.equal(parsed.apps.ttlSeconds, 21600)
  assert.equal(parsed.text.defaultProvider, 'omnimux')
  assert.equal(parsed.text.maxTokens, 4096)
  assert.equal(parsed.text.models.length, 12)
  assert.equal(parsed.text.models.every((row) => row.enabled), true)
  assert.equal(parsed.gate.enabled, true)
  assert.deepEqual(parsed.gate.tools, {})
  assert.deepEqual(parsed.gate.media, { video: true, image: true, audio: true })
  assert.deepEqual(parsed.gate.models, { textComplete: {} })
  assert.deepEqual(parsed.gate.plugins, {})
})

test('Config Standard Schema accepts empty input', () => {
  const result = Config['~standard'].validate({})
  assert.ok('value' in result)
  assert.equal(result.value.productName, 'OmniMux')
  assert.equal(result.value.media.defaultProvider, 'omnimux')
  assert.equal(result.value.gate.enabled, true)
})

test('Config Standard Schema accepts gate configuration', () => {
  const result = Config['~standard'].validate({
    gate: {
      enabled: true,
      tools: { omnimux_video_submit: false },
      media: { audio: false },
      models: { textComplete: { 'grok-4.6': false } },
    },
  })
  assert.ok('value' in result)
  assert.equal(result.value.gate.tools.omnimux_video_submit, false)
  assert.equal(result.value.gate.media.audio, false)
  assert.equal(result.value.gate.models.textComplete['grok-4.6'], false)
})

test('Config Standard Schema rejects invalid gate configuration', () => {
  const result = Config['~standard'].validate({
    gate: { tools: { omnimux_video_submit: 'off' } },
  })
  assert.ok('issues' in result)
  assert.match(result.issues[0]?.message ?? '', /gate\.tools\.omnimux_video_submit must be a boolean/)
})

test('Config Standard Schema rejects a bad media protocol', () => {
  const result = Config['~standard'].validate({
    media: { providers: { omnimux: { protocol: 'nope', baseUrl: 'https://x', apiKeyEnv: 'K' } } },
  })
  assert.ok('issues' in result)
  assert.match(result.issues[0]?.message ?? '', /protocol must be one of/)
})

test('Config Standard Schema rejects a catalog URL on another host', () => {
  const result = Config['~standard'].validate({
    siteBaseUrl: 'https://omnimux.ai',
    apps: { catalogUrl: 'https://evil.example/apps/catalog.json' },
  })
  assert.ok('issues' in result)
  assert.match(result.issues[0]?.message ?? '', /host must match/)
})

test('Config Standard Schema rejects an out-of-range accountAvatars.maxBytes', () => {
  for (const maxBytes of [0, '200k', -1, 1048577, 12.5]) {
    const result = Config['~standard'].validate({ official: { accountAvatars: { maxBytes } } })
    assert.ok('issues' in result, `expected issues for maxBytes=${JSON.stringify(maxBytes)}`)
    assert.match(result.issues[0]?.message ?? '', /accountAvatars\.maxBytes/)
  }
})

test('Config Standard Schema rejects a text model outside the chat directory', () => {
  const result = Config['~standard'].validate({
    text: { models: [{ id: 'claude-haiku-4-5' }] },
  })
  assert.ok('issues' in result)
  assert.match(result.issues[0]?.message ?? '', /not in the chat directory/)
})
