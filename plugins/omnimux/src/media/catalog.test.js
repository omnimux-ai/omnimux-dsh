import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AUDIO_MODEL_SPECS, IMAGE_MODEL_SPECS, VIDEO_MODEL_SPECS, findMediaModel, mediaModelIds } from './catalog.js'

// H2 facade: SPECS tables are projections of the YAML contracts (full
// directory semantics — contracted models, listed or not). No hardcoded rows.

describe('hub media catalog facade (contract-derived)', () => {
  it('projects the full contracted directory per kind', () => {
    assert.equal(IMAGE_MODEL_SPECS.length, 13)
    assert.equal(VIDEO_MODEL_SPECS.length, 19)
    assert.equal(AUDIO_MODEL_SPECS.length, 5)
  })

  it('GPT Image 2 lists all 8 aspect ratios + auto', () => {
    const gpt = IMAGE_MODEL_SPECS.find((m) => m.id === 'gpt-image-2')
    assert.ok(gpt)
    const ratioValues = gpt.parameters.aspectRatio?.options.map((o) => o.value)
    assert.deepEqual(ratioValues, ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'])
    assert.equal(gpt.parameters.aspectRatio?.defaultValue, '16:9')
  })

  it('Seedream 5.0 Pro includes 4:3 and 21:9', () => {
    const seedream = IMAGE_MODEL_SPECS.find((m) => m.id === 'seedream-5.0-pro')
    assert.ok(seedream)
    const ratioValues = seedream.parameters.aspectRatio?.options.map((o) => o.value)
    assert.ok(ratioValues?.includes('4:3'))
    assert.ok(ratioValues?.includes('21:9'))
    assert.ok(ratioValues?.includes('16:9'))
  })

  it('nanobanana: underscore canonical only; hyphen resolves via alias (no double row)', () => {
    assert.equal(IMAGE_MODEL_SPECS.some((row) => row.id === 'nanobanana-2'), false)
    assert.equal(IMAGE_MODEL_SPECS.some((row) => row.id === 'nanobanana-pro'), false)
    assert.ok(IMAGE_MODEL_SPECS.some((row) => row.id === 'nano_banana_2'))
    assert.ok(IMAGE_MODEL_SPECS.some((row) => row.id === 'nano_banana_pro'))
    assert.equal(findMediaModel('image', 'nanobanana-2')?.id, 'nano_banana_2')
    assert.equal(findMediaModel('image', 'nanobanana-pro')?.id, 'nano_banana_pro')
  })

  it('Kling O3 supports 5/10/15s and 4K', () => {
    const klingO3 = VIDEO_MODEL_SPECS.find((m) => m.id === 'kling-o3')
    assert.ok(klingO3)
    const durations = klingO3.parameters.duration?.options?.map((o) => o.value)
    assert.deepEqual(durations, [5, 10, 15])
    const resolutions = klingO3.parameters.resolution?.options?.map((o) => o.value)
    assert.deepEqual(resolutions, ['1080P', '4K'])
    assert.equal(klingO3.parameters.sound?.supported, true)
  })

  it('Veo 3.1 defaults to 8s', () => {
    const veo = VIDEO_MODEL_SPECS.find((m) => m.id === 'veo-3.1')
    assert.ok(veo)
    assert.equal(veo.parameters.duration?.defaultValue, 8)
  })

  it('Grok Imagine Video 1.5 is the only grok video catalog row', () => {
    const grok = VIDEO_MODEL_SPECS.find((m) => m.id === 'grok-imagine-video-1-5')
    assert.ok(grok)
    assert.equal(grok.label, 'Grok Imagine Video 1.5')
    assert.equal(grok.badge, 'xAI 官方 1.5')
    assert.equal(grok.subtitle, '480p–1080p · 1–15s')
    assert.equal(grok.family, 'grok')
    assert.equal(grok.parameters.duration?.defaultValue, 8)
    assert.equal(grok.parameters.resolution?.defaultValue, '480p')
    assert.equal(VIDEO_MODEL_SPECS.some((row) => row.id === 'grok-imagine-video'), false)
    assert.equal(VIDEO_MODEL_SPECS.some((row) => row.id === 'grok-imagine-video-1.5'), false)
    assert.equal(findMediaModel('video', 'grok-imagine-video-1-5')?.id, 'grok-imagine-video-1-5')
  })

  it('Grok video keeps the unpublished reference-image maximum unknown', () => {
    const grok = VIDEO_MODEL_SPECS.find((m) => m.id === 'grok-imagine-video-1-5')
    const multiRef = grok && findOpSlots(grok)
    assert.ok(multiRef)
    assert.equal(multiRef.max, null)
  })

  it('Seedance multi-ref uses APIMart documented image limits', () => {
    const fast = VIDEO_MODEL_SPECS.find((m) => m.id === 'seedance-2-0-fast')
    const slot = fast && findOpSlots(fast)
    assert.ok(slot)
    assert.equal(slot.max, 9)
    const s25 = VIDEO_MODEL_SPECS.find((m) => m.id === 'seedance-2-5')
    const slot25 = s25 && findOpSlots(s25)
    assert.ok(slot25)
    assert.equal(slot25.max, 30)
  })

  it('Wan 3.0 video spec and alias lookup', () => {
    const wan3 = VIDEO_MODEL_SPECS.find((m) => m.id === 'wan-3.0')
    assert.ok(wan3)
    assert.equal(wan3.label, 'Wan 3.0')
    assert.equal(wan3.family, 'wan')
    assert.equal(findMediaModel('video', 'wan-3.0')?.id, 'wan-3.0')
    assert.equal(findMediaModel('video', 'wan3.0-video')?.id, 'wan-3.0')
    assert.equal(findMediaModel('video', 'wan3.0'), null)
    assert.equal(findOpSlots(wan3)?.max, 10)
  })

  it('audio table includes suno and gpt-4o-mini-tts', () => {
    assert.ok(findMediaModel('audio', 'suno'))
    assert.ok(AUDIO_MODEL_SPECS.some((row) => row.id === 'gpt-4o-mini-tts'))
  })

  it('mediaModelIds matches the table rows', () => {
    assert.deepEqual(mediaModelIds('image'), IMAGE_MODEL_SPECS.map((row) => row.id))
    assert.deepEqual(mediaModelIds('audio'), AUDIO_MODEL_SPECS.map((row) => row.id))
  })

  it('model row labels never contain ASCII hyphen-minus', () => {
    for (const [kind, rows] of [
      ['image', IMAGE_MODEL_SPECS],
      ['video', VIDEO_MODEL_SPECS],
      ['audio', AUDIO_MODEL_SPECS],
    ]) {
      for (const row of rows) {
        if (row.id === 'doubao-asr-bigmodel') {
          assert.equal(row.label, '豆包语音识别大模型 (Doubao-ASR)')
          continue
        }
        assert.doesNotMatch(
          row.label,
          /-/,
          `${kind} model label must not contain '-': ${row.id} → ${row.label}`,
        )
      }
    }
    assert.equal(findMediaModel('audio', 'gpt-4o-mini-tts')?.label, 'GPT 4o Mini TTS')
  })
})

/** Locate the merged referenceImages capability of a projected row. */
function findOpSlots(row) {
  return row.inputCapability?.referenceImages ?? null
}
