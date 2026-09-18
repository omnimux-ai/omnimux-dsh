import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountAudioVoices, VOICES_TOOL_NAME } from './voices-mount.js'
import { searchVoices } from './voices.js'
import { JSON_TOOL_OUTPUT } from '../tools/schema.js'

test('searchVoices returns all 509 voices by default with hot voices ranked first', () => {
  const result = searchVoices()
  assert.equal(result.model, 'seed-audio-1.0')
  assert.equal(result.total, 509)
  assert.equal(result.count, 20)
  assert.equal(result.offset, 0)
  assert.equal(result.limit, 20)
  assert.equal(result.voices.length, 20)
  assert.equal(result.voices[0].voice_type, 'zh_male_guanggaojieshuo_uranus_bigtts')
  assert.equal(result.voices[0].display_name, '广告解说 2.0')
})

test('searchVoices filters accurately by keyword query', () => {
  const result = searchVoices({ query: '顾姐' })
  assert.ok(result.total >= 1)
  const gujie = result.voices.find((v) => v.voice_type === 'zh_female_gujie_uranus_bigtts')
  assert.ok(gujie, 'Should find 顾姐 2.0')
  assert.equal(gujie.display_name, '顾姐 2.0')
  assert.equal(gujie.gender, 'female')
})

test('searchVoices filters by category, gender, and tags', () => {
  const result = searchVoices({
    category: '通用场景',
    gender: 'male',
    tag: '剪映同款',
  })
  assert.ok(result.total >= 1)
  for (const voice of result.voices) {
    assert.equal(voice.gender, 'male')
    assert.ok(voice.category.includes('通用场景'))
    assert.ok(voice.tags.includes('剪映同款'))
  }
})

test('searchVoices supports pagination with limit and offset', () => {
  const page1 = searchVoices({ limit: 5, offset: 0 })
  const page2 = searchVoices({ limit: 5, offset: 5 })
  assert.equal(page1.count, 5)
  assert.equal(page2.count, 5)
  assert.notEqual(page1.voices[0].voice_type, page2.voices[0].voice_type)
})

test('searchVoices safely rejects unsupported models', () => {
  const result = searchVoices({ model: 'unknown-audio-model' })
  assert.equal(result.total, 0)
  assert.equal(result.voices.length, 0)
  assert.ok(result.error)
})

test('mountAudioVoices registers omnimux_audio_voices tool correctly', async () => {
  const tools = []
  mountAudioVoices(
    { tools: { register(tool) { tools.push(tool) } } },
    { gate: { enabled: true, media: { audio: true }, tools: { omnimux_audio_voices: true } }, jsonOut: JSON_TOOL_OUTPUT },
  )
  assert.equal(tools.length, 1)
  const tool = tools[0]
  assert.equal(tool.name, VOICES_TOOL_NAME)
  assert.ok(tool.parameters.properties.query)
  assert.ok(tool.parameters.properties.category)
  assert.ok(tool.parameters.properties.gender)
  assert.ok(tool.parameters.properties.tag)

  const executed = await tool.execute({ query: '解说小明' })
  assert.ok(executed.total >= 1)
  assert.ok(executed.voices.some((v) => v.display_name === '解说小明'))
})

test('mountAudioVoices respects gate disabled state', () => {
  const tools = []
  mountAudioVoices(
    { tools: { register(tool) { tools.push(tool) } } },
    { gate: { enabled: true, media: { audio: false } }, jsonOut: JSON_TOOL_OUTPUT },
  )
  assert.equal(tools.length, 0, 'Tool should not register when audio media is disabled')
})
