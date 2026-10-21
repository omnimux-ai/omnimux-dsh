import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { buildModelCatalog } from '../catalog/list.js'
import { executeOmnimuxText } from '../text/execute.js'
import { executeOmnimuxMedia } from '../media/execute.js'

const imageData = 'data:image/png;base64,cG5n'
const videoData = 'data:video/mp4;base64,AAAAEGZ0eXBpc29t'

async function isolated(run) {
  const home = mkdtempSync(join(tmpdir(), 'omitted-model-defaults-3312-'))
  const previousEnv = process.env
  const previousFetch = globalThis.fetch
  process.env = Object.assign({}, previousEnv, { HOME: home, DSH_HOME: home })
  delete process.env.OMNIMUX_API_KEY
  delete process.env.OMNIMUX_TOKEN
  delete process.env.OMNIMUX_BASE_URL
  delete process.env.OMNIMUX_TEXT_DEFAULT_MODEL
  delete process.env.OMNIMUX_IMAGE_MODEL
  delete process.env.OMNIMUX_VIDEO_MODEL
  delete process.env.OMNIMUX_AUDIO_MODEL
  globalThis.fetch = async () => { throw new Error('Real network access is forbidden in this fixture') }
  try { await run(home) } finally {
    process.env = previousEnv
    globalThis.fetch = previousFetch
    assert.ok(isAbsolute(home))
    assert.equal(dirname(resolve(home)), resolve(tmpdir()))
    assert.ok(home.startsWith(join(tmpdir(), 'omitted-model-defaults-3312-')))
    rmSync(home, { recursive: true, force: true })
  }
}

function officialSettings() {
  return {
    scenarioBindings: { text: { channel: 'official' }, analysis: { channel: 'official' },
      image: { channel: 'official' }, video: { channel: 'official' }, audio: { channel: 'official' } },
    defaultTextModel: 'claude-sonnet-4-6', defaultImageModel: 'gpt-image-2.5-flare',
    defaultVideoModel: 'minimax-h3', defaultAudioModel: 'gemini-3.8-flash-tts',
  }
}

function getter(value, seen) {
  return { get(section) { seen.push(section); assert.equal(section, 'omnimux'); return value } }
}

function stream(seen) {
  return { async * stream(options) {
    seen.push(options)
    yield { type: 'text-delta', text: 'synthetic reply' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } }
}

function completedImage() {
  return new Response(JSON.stringify({ data: [{ b64_json: 'cG5n' }] }),
    { headers: { 'content-type': 'application/json' } })
}

function runtime(seen, type, url) {
  return { async execute(request) {
    seen.push(request)
    return { status: 'completed', outputs: [{ type, url }] }
  } }
}

function officialCredentials() {
  return { async resolve(ref) {
    assert.equal(ref, 'OMNIMUX_API_KEY')
    return { value: 'sk-synthetic-omitted-defaults' }
  } }
}

async function runtimeImage(home, current, model, expected, filename) {
  const seen = []
  const input = { prompt: 'synthetic image', dest: join(home, filename), runtimeSettings: current,
    env: {}, credentials: officialCredentials(), runtime: runtime(seen, 'image', imageData) }
  if (model !== undefined) input.model = model
  const result = await executeOmnimuxMedia('image', input)
  assert.equal(result.mode, 'live')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].providerId, 'omnimux')
  assert.equal(seen[0].input.model, expected)
  assert.equal(readFileSync(input.dest, 'utf8'), 'png')
}

async function runtimeVideo(home, current, model, expected, filename) {
  const seen = []
  const input = { prompt: 'synthetic video', dest: join(home, filename), runtimeSettings: current,
    operation: 'text_to_video', env: {}, credentials: officialCredentials(),
    runtime: runtime(seen, 'video', videoData) }
  if (model !== undefined) input.model = model
  const result = await executeOmnimuxMedia('video', input)
  assert.equal(result.mode, 'live')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].providerId, 'omnimux')
  assert.equal(seen[0].input.model, expected)
  assert.deepEqual(readFileSync(input.dest), Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109]))
}

// #3516：TTS 型号（seed-audio-1.0 / gemini-3.8-flash-tts）全部上游渠道停用，
// 音频默认改为在架的 suno（text_to_music），因此默认分辨率验证改走音乐任务通道。
async function musicTask(home, current, model, filename, expected = 'suno') {
  const seen = []
  const input = { prompt: 'synthetic music', dest: join(home, filename), runtimeSettings: current,
    env: {}, operation: 'text_to_music', credentials: officialCredentials(),
    runtime: { async execute(request) {
      seen.push(request)
      return { status: 'completed', outputs: [{ type: 'audio', url: 'data:audio/mpeg;base64,SUQz' }] }
    } } }
  if (model !== undefined) input.model = model
  const result = await executeOmnimuxMedia('audio', input)
  assert.equal(result.mode, 'live')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].providerId, 'omnimux')
  assert.equal(seen[0].input.model, expected)
  assert.equal(seen[0].input.prompt, 'synthetic music')
}

test('3312: saved defaults pointing at delisted models resolve only to the fixed real published catalog', async () => isolated(async () => {
  const catalog = buildModelCatalog({ env: {}, settingsDefaults: officialSettings() })
  // 2026-10-21 网关对账 #3516：四个保存默认分别指向 Claude / Flare / H3 / Gemini-TTS，
  // 其上游渠道全部停用 → 目录桶中不再出现，默认回落到合法在架型号。
  assert.deepEqual(catalog.text.map(row => row.id), ['gemini-3.8-flash'])
  assert.deepEqual(catalog.image.map(row => row.id), ['gpt-image-2.5', 'seedream-5-0-pro'])
  assert.deepEqual(catalog.video.map(row => row.id), ['seedance-2-0', 'seedance-2-0-fast', 'seedance-2-0-mini', 'seedance-2-5'])
  assert.deepEqual(catalog.audio.map(row => row.id), ['suno'])
  assert.deepEqual(catalog.defaults, { text: 'gemini-3.8-flash', image: 'gpt-image-2.5', video: 'seedance-2-5', audio: 'suno' })
}))

test('3312: omitted official text refuses delisted saved Sonnet while explicit model and text gate retain priority', async () => isolated(async () => {
  const seen = [], reads = []
  const input = { prompt: 'synthetic text', env: {}, settings: getter(officialSettings(), reads), llm: stream(seen) }
  const saved = await executeOmnimuxText(input)
  // claude-sonnet-4-6 仅登记不上架 → 保存默认被拒绝，回落到在架 gemini-3.8-flash。
  assert.equal(saved.model, 'gemini-3.8-flash')
  assert.equal(saved.text, 'synthetic reply')
  assert.equal(seen[0].provider, 'omnimux')
  assert.equal(seen[0].model, 'gemini-3.8-flash')
  assert.ok(reads.length > 0)
  const explicit = await executeOmnimuxText(Object.assign({}, input, { model: 'gemini-3.8-flash' }))
  assert.equal(explicit.model, 'gemini-3.8-flash')
  assert.equal(seen[1].model, 'gemini-3.8-flash')
  const gated = await executeOmnimuxText(Object.assign({}, input, { gate: { models: { textComplete: { 'claude-sonnet-4-6': false } } } }))
  assert.equal(gated.model, 'gemini-3.8-flash')
  assert.equal(seen[2].model, 'gemini-3.8-flash')
  const envSelected = await executeOmnimuxText(Object.assign({}, input, { env: { OMNIMUX_TEXT_DEFAULT_MODEL: 'gemini-3.8-flash' } }))
  assert.equal(envSelected.model, 'gemini-3.8-flash')
  assert.equal(seen[3].model, 'gemini-3.8-flash')
}))

test('3312: omitted official image refuses delisted saved Flare and routes the listed default without overriding an explicit image model', async () => isolated(async (home) => {
  const calls = [], current = officialSettings(), dest = join(home, 'http.png')
  const result = await executeOmnimuxMedia('image', { prompt: 'synthetic image', dest, runtimeSettings: current,
    aspectRatio: '1:1', resolution: '1K', env: {}, credentials: officialCredentials(),
    fetcher: async (url, init) => {
      calls.push({ url: String(url), method: init.method, group: new Headers(init.headers).get('X-Omnimux-Group'), body: JSON.parse(init.body) })
      return completedImage()
    } })
  assert.equal(result.mode, 'live')
  // #3516：flare 渠道停用 → 默认图片型号回落 gpt-image-2.5，分组头为现役 default。
  assert.deepEqual(calls, [{ url: 'https://api.omnimux.ai/v1/images/generations', method: 'POST',
    group: 'default', body: { model: 'gpt-image-2.5', prompt: 'synthetic image', size: '1:1', resolution: '1K', n: 1 } }])
  assert.equal(readFileSync(dest, 'utf8'), 'png')
  await runtimeImage(home, current, undefined, 'gpt-image-2.5', 'runtime.png')
  await runtimeImage(home, current, 'gpt-image-2.5', 'gpt-image-2.5', 'explicit.png')
}))

test('3312: omitted official video refuses delisted saved MiniMax while explicit Seedance remains unchanged', async () => isolated(async (home) => {
  const current = officialSettings()
  // #3516：minimax-h3 仅登记不上架 → 默认视频型号回落 seedance-2-5；显式选择保持。
  await runtimeVideo(home, current, undefined, 'seedance-2-5', 'saved.mp4')
  await runtimeVideo(home, current, 'seedance-2-5', 'seedance-2-5', 'explicit.mp4')
}))

test('3312: omitted official audio refuses delisted saved TTS and uses the listed music default; explicit delisted Seed Audio stays blocked', async () => isolated(async (home) => {
  const current = officialSettings()
  // #3516：gemini-3.8-flash-tts 渠道停用 → 默认音频型号回落 suno（text_to_music）。
  await musicTask(home, current, undefined, 'saved.mp3')
  await musicTask(home, current, 'suno', 'explicit.mp3', 'suno')
  // 显式点名仅登记不上架的 Seed Audio 仍必须在 HTTP 之前 fail-closed。
  let httpCalls = 0
  await assert.rejects(() => executeOmnimuxMedia('audio', {
    prompt: 'synthetic speech', dest: join(home, 'explicit-seed.wav'), runtimeSettings: current, env: {},
    model: 'seed-audio-1.0', credentials: officialCredentials(), operation: 'text_to_speech',
    fetcher: async () => { httpCalls += 1; return new Response('x') },
  }), (error) => error.code === 'omnimux-invalid-request' && error.details?.guardCode === 'implementation_unavailable')
  assert.equal(httpCalls, 0)
}))

test('3312: invalid saved defaults fall back to legal fixed catalog models and all four public executors remain usable', async () => isolated(async (home) => {
  const current = Object.assign(officialSettings(), { defaultTextModel: 'invalid-default', defaultImageModel: 'invalid-default',
    defaultVideoModel: 'invalid-default', defaultAudioModel: 'invalid-default' })
  const catalog = buildModelCatalog({ env: {}, settingsDefaults: current })
  assert.deepEqual(catalog.defaults, { text: 'gemini-3.8-flash', image: 'gpt-image-2.5', video: 'seedance-2-5', audio: 'suno' })
  const seen = []
  const text = await executeOmnimuxText({ prompt: 'synthetic text', settings: getter(current, []), env: {}, llm: stream(seen) })
  assert.equal(text.model, 'gemini-3.8-flash')
  assert.equal(seen[0].model, 'gemini-3.8-flash')
  await runtimeImage(home, current, undefined, 'gpt-image-2.5', 'fallback.png')
  await runtimeVideo(home, current, undefined, 'seedance-2-5', 'fallback.mp4')
  await musicTask(home, current, undefined, 'fallback.mp3')
}))

test('3312: omitted image model keeps legal environment and current Config priority over saved or invalid defaults', async () => isolated(async (home) => {
  const media = { defaultProvider: 'omnimux', providers: { omnimux: { protocol: 'openai-media',
    baseUrl: 'https://api.omnimux.ai/v1', apiKeyEnv: 'OMNIMUX_API_KEY', models: { image: 'gpt-image-2.5-flare' } } } }
  const current = officialSettings()
  current.defaultImageModel = 'invalid-default'
  const seen = []
  // #3516：Config 里保存的 flare 同样已下架 → 拒绝并回落 gpt-image-2.5。
  const input = { prompt: 'synthetic image', dest: join(home, 'config-priority.png'), runtimeSettings: current,
    media, env: {}, credentials: officialCredentials(), operation: 'text_to_image', runtime: runtime(seen, 'image', imageData) }
  await executeOmnimuxMedia('image', input)
  assert.equal(seen[0].input.model, 'gpt-image-2.5')
  // 已下架的环境值不采纳（仍回落 gpt-image-2.5），合法环境值则优先。
  input.env = { OMNIMUX_IMAGE_MODEL: 'gpt-image-2.5-sunburst' }
  input.dest = join(home, 'env-delisted.png')
  await executeOmnimuxMedia('image', input)
  assert.equal(seen[1].input.model, 'gpt-image-2.5')
  input.env = { OMNIMUX_IMAGE_MODEL: 'seedream-5-0-pro' }
  input.dest = join(home, 'env-priority.png')
  await executeOmnimuxMedia('image', input)
  assert.equal(seen[2].input.model, 'seedream-5-0-pro')
}))

test('3312: saved official defaults cannot steal BYOK or agent selections and trusted custom media config keeps its positive route', async () => isolated(async (home) => {
  const current = officialSettings()
  current.runtimeAgentId = 'synthetic-agent'
  current.runtimeAgentVerified = true
  current.runtimeAgentModel = 'synthetic-agent-model'
  current.byokProviders = [{ provider: 'custom', endpoint: 'https://custom.fixture.invalid/v1',
    models: { text: 'synthetic-byok-text', image: 'gpt-image-2.5' }, capabilities: ['text', 'image'] }]
  const textCalls = [], agentCalls = [], streamCalls = []
  const dependencies = { prompt: 'synthetic text', settings: getter(current, []), env: {}, llm: stream(streamCalls),
    credentials: { async resolve(ref) { assert.equal(ref, 'OMNIMUX_MEDIA_KEY_CUSTOM'); return { value: 'synthetic-custom-key' } } },
    fetcher: async (url, init) => {
      textCalls.push({ url: String(url), body: JSON.parse(init.body) })
      return new Response(JSON.stringify({ choices: [{ message: { content: 'synthetic custom reply' } }] }), { headers: { 'content-type': 'application/json' } })
    }, agentRun: async request => { agentCalls.push(request); return 'synthetic agent reply' } }
  const byok = await executeOmnimuxText(Object.assign({}, dependencies, { group: 'byok-custom' }))
  assert.equal(byok.model, 'synthetic-byok-text')
  assert.equal(textCalls[0].url, 'https://custom.fixture.invalid/v1/chat/completions')
  assert.equal(textCalls[0].body.model, 'synthetic-byok-text')
  const agent = await executeOmnimuxText(Object.assign({}, dependencies, { group: 'agent' }))
  assert.equal(agent.agentModel, 'synthetic-agent-model')
  assert.equal(agentCalls[0].model, 'synthetic-agent-model')
  assert.equal(streamCalls.length, 0)
  const media = { defaultProvider: 'custom', providers: { custom: { protocol: 'openai-media',
    baseUrl: 'https://custom.fixture.invalid/v1', apiKeyEnv: 'OMNIMUX_MEDIA_KEY_CUSTOM', models: { image: 'gpt-image-2.5' } } } }
  const mediaCalls = []
  const imageInput = { prompt: 'synthetic image', dest: join(home, 'byok.png'), runtimeSettings: current, group: 'byok-custom',
    media, env: {}, credentials: dependencies.credentials, fetcher: async (url, init) => {
      mediaCalls.push({ url: String(url), body: JSON.parse(init.body) }); return completedImage()
    } }
  assert.equal((await executeOmnimuxMedia('image', imageInput)).mode, 'live')
  assert.equal(mediaCalls[0].url, 'https://custom.fixture.invalid/v1/images/generations')
  assert.equal(mediaCalls[0].body.model, 'gpt-image-2.5')
  const trusted = Object.assign({}, imageInput, { dest: join(home, 'trusted.png'), env: { OMNIMUX_MEDIA_KEY_CUSTOM: 'synthetic-trusted-key' } })
  delete trusted.runtimeSettings
  delete trusted.group
  assert.equal((await executeOmnimuxMedia('image', trusted)).mode, 'live')
  assert.equal(mediaCalls[1].url, 'https://custom.fixture.invalid/v1/images/generations')
  assert.equal(mediaCalls[1].body.model, 'gpt-image-2.5')
  assert.equal(readFileSync(trusted.dest, 'utf8'), 'png')
}))

test('3312: saved Sonnet never sends incompatible video references to a paid text-only model', async () => isolated(async () => {
  const calls = [], seen = []
  const result = await executeOmnimuxText({ prompt: 'synthetic video analysis', settings: getter(officialSettings(), []),
    operation: 'vision_chat', references: [{ type: 'video', role: 'reference', pathOrUrl: videoData }],
    env: { OMNIMUX_API_KEY: 'sk-synthetic-analysis' }, llm: stream(seen), fetcher: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) })
      return new Response(JSON.stringify({ choices: [{ message: { content: 'synthetic analysis' } }] }), { headers: { 'content-type': 'application/json' } })
    } })
  assert.equal(result.model, 'gemini-3.8-flash')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.model, 'gemini-3.8-flash')
  assert.equal(calls[0].body.messages[0].content[1].image_url.url, videoData)
  assert.equal(seen.length, 0)
}))
