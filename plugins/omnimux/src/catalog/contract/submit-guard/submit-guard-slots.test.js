import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GUARD_CODES, assignAndValidateSlots } from './index.js'
import { getContractIndex } from '../index.js'

const index = getContractIndex()

describe('SubmitGuard slots', () => {
  const t2i = index.get('gpt-image-2').operations.find((o) => o.id === 'text_to_image')
  const vision = index.get('gemini-3.7-flash').operations.find((o) => o.id === 'vision_chat')

  it('requires prompt when min>=1', () => {
    const r = assignAndValidateSlots(t2i, [], { prompt: '' })
    assert.equal(r.ok, false)
    assert.equal(r.rejections[0].code, GUARD_CODES.PROMPT_REQUIRED)
  })

  it('accepts prompt-only text_to_image', () => {
    const r = assignAndValidateSlots(t2i, [], { prompt: 'lamp' })
    assert.equal(r.ok, true)
  })

  it('rejects MIME not in allow list', () => {
    const r = assignAndValidateSlots(
      vision,
      [{ type: 'image', role: 'reference', pathOrUrl: 'https://x/a.gif', mime: 'image/gif', sizeBytes: 100 }],
      { prompt: 'see' },
    )
    assert.equal(r.ok, false)
    assert.equal(r.rejections[0].code, GUARD_CODES.MIME_UNSUPPORTED)
  })

  it('size boundary: equal to max passes, over max rejects', () => {
    const maxMb = vision.inputs.find((s) => s.slot === 'reference_images').maxSizeMb
    const maxBytes = maxMb * 1024 * 1024
    const ok = assignAndValidateSlots(
      vision,
      [{ type: 'image', role: 'reference', pathOrUrl: 'https://x/a.png', mime: 'image/png', sizeBytes: maxBytes }],
      { prompt: 'see' },
    )
    assert.equal(ok.ok, true)
    const bad = assignAndValidateSlots(
      vision,
      [{ type: 'image', role: 'reference', pathOrUrl: 'https://x/a.png', mime: 'image/png', sizeBytes: maxBytes + 1 }],
      { prompt: 'see' },
    )
    assert.equal(bad.ok, false)
    assert.equal(bad.rejections[0].code, GUARD_CODES.SIZE_EXCEEDED)
  })

  it('strict size boundary rejects equality when official docs say less than', () => {
    const op = index.get('seedance-2-5').operations.find((candidate) => candidate.id === 'first_frame')
    const slot = op.inputs.find((candidate) => candidate.slot === 'first_frame')
    assert.equal(slot.maxSizeExclusive, true)
    const result = assignAndValidateSlots(op, [{
      type: 'image',
      role: 'first_frame',
      pathOrUrl: 'https://x/frame.png',
      mime: 'image/png',
      sizeBytes: slot.maxSizeMb * 1024 * 1024,
    }], { prompt: 'start here' })
    assert.equal(result.ok, false)
    assert.equal(result.rejections[0].code, GUARD_CODES.SIZE_EXCEEDED)
  })

  it('metadata_unknown when maxSizeMb set but sizeBytes missing', () => {
    const r = assignAndValidateSlots(
      vision,
      [{ type: 'image', role: 'reference', pathOrUrl: 'https://x/a.png', mime: 'image/png' }],
      { prompt: 'see' },
    )
    assert.equal(r.ok, false)
    assert.equal(r.rejections[0].code, GUARD_CODES.METADATA_UNKNOWN)
  })

  it('duration boundary and metadata_unknown on audio_track style slots', () => {
    const avatarOp = index.get('kling-avatar').operations.find((o) => o.id === 'digital_human')
    const maxDur = avatarOp.inputs.find((s) => s.slot === 'audio_track').maxDurationSec
    const assets = [
      { type: 'image', role: 'reference', pathOrUrl: 'https://x/face.png', mime: 'image/png', sizeBytes: 100 },
      { type: 'audio', role: 'audio_track', pathOrUrl: '/a.mp3', mime: 'audio/mp3', sizeBytes: 100, durationSec: maxDur },
    ]
    // research draft — still validate slots in isolation
    const ok = assignAndValidateSlots(avatarOp, assets, { prompt: '' })
    assert.equal(ok.ok, true)
    const over = assignAndValidateSlots(
      avatarOp,
      [assets[0], { ...assets[1], durationSec: maxDur + 0.01 }],
      { prompt: '' },
    )
    assert.equal(over.ok, false)
    assert.equal(over.rejections[0].code, GUARD_CODES.DURATION_EXCEEDED)
    const unknownDur = assignAndValidateSlots(
      avatarOp,
      [assets[0], { type: 'audio', role: 'audio_track', pathOrUrl: '/a.mp3', mime: 'audio/mp3', sizeBytes: 100 }],
      { prompt: '' },
    )
    assert.equal(unknownDur.ok, false)
    assert.equal(unknownDur.rejections[0].code, GUARD_CODES.METADATA_UNKNOWN)
  })

  it('slot capacity rejects over max', () => {
    const slot = vision.inputs.find((s) => s.slot === 'reference_images')
    const assets = []
    for (let i = 0; i < slot.max + 1; i++) {
      assets.push({
        type: 'image', role: 'reference', pathOrUrl: `https://x/${i}.png`, mime: 'image/png', sizeBytes: 10,
      })
    }
    const r = assignAndValidateSlots(vision, assets, { prompt: 'see' })
    assert.equal(r.ok, false)
    assert.equal(r.rejections[0].code, GUARD_CODES.SLOT_CAPACITY)
  })

  it('Wan reference limits use the published image and combined-duration boundaries', () => {
    const op = index.get('wan-3.0').operations.find((candidate) => candidate.id === 'video_multi_ref')
    const images = Array.from({ length: 10 }, (_, index) => ({
      type: 'image', role: 'reference', targetSlot: 'reference_images',
      pathOrUrl: `https://x/${index}.png`, mime: 'image/png', sizeBytes: 100,
    }))
    assert.equal(assignAndValidateSlots(op, images, { prompt: '', duration: 5 }).ok, true)
    const overImages = assignAndValidateSlots(op, [
      ...images, { ...images[0], pathOrUrl: 'https://x/10.png' },
    ], { prompt: '', duration: 5 })
    assert.equal(overImages.ok, false)
    assert.equal(overImages.rejections[0].code, GUARD_CODES.SLOT_CAPACITY)

    const video = [{
      type: 'video', role: 'reference', targetSlot: 'reference_videos',
      pathOrUrl: 'https://x/reference.mp4', mime: 'video/mp4', sizeBytes: 100, durationSec: 15,
    }]
    assert.equal(assignAndValidateSlots(op, video, { prompt: '', duration: 15 }).ok, true)
    const overDuration = assignAndValidateSlots(op, video, { prompt: '', duration: 16 })
    assert.equal(overDuration.ok, false)
    assert.equal(overDuration.rejections[0].code, GUARD_CODES.DURATION_EXCEEDED)
  })
})
