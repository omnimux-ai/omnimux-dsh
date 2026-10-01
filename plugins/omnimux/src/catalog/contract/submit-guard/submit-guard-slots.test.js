import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GUARD_CODES, assignAndValidateSlots } from './index.js'
import { getContractIndex } from '../index.js'

const index = getContractIndex()

describe('SubmitGuard slots', () => {
  const t2i = index.get('gpt-image-2.5').operations.find((o) => o.id === 'text_to_image')
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

  it('duration boundary and metadata_unknown on duration-bearing reference slots', () => {
    // `kling-avatar`/`digital_human` left the contract universe; `minimax-h3` #video_multi_ref
    // is the shelf operation that still carries a min/max-bounded audio reference slot.
    const multiRefOp = index.get('minimax-h3').operations.find((o) => o.id === 'video_multi_ref')
    const maxDur = multiRefOp.inputs.find((s) => s.slot === 'reference_audios').maxDurationSec
    const image = { type: 'image', role: 'reference', targetSlot: 'reference_images', pathOrUrl: 'https://x/face.png', mime: 'image/png', sizeBytes: 100 }
    const audio = { type: 'audio', role: 'reference', targetSlot: 'reference_audios', pathOrUrl: '/a.mp3', mime: 'audio/mp3', sizeBytes: 100, durationSec: maxDur }
    const ok = assignAndValidateSlots(multiRefOp, [image, audio], { prompt: 'reference' })
    assert.equal(ok.ok, true)
    const over = assignAndValidateSlots(
      multiRefOp,
      [image, { ...audio, durationSec: maxDur + 0.01 }],
      { prompt: 'reference' },
    )
    assert.equal(over.ok, false)
    assert.equal(over.rejections[0].code, GUARD_CODES.DURATION_EXCEEDED)
    const unknownDur = assignAndValidateSlots(
      multiRefOp,
      [image, { type: 'audio', role: 'reference', targetSlot: 'reference_audios', pathOrUrl: '/a.mp3', mime: 'audio/mp3', sizeBytes: 100 }],
      { prompt: 'reference' },
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

  it('heals singular/plural and frame alias targetSlot mismatches', () => {
    // 1. reference_image -> reference_images (e.g. gemini vision_chat)
    const refSingleToPlural = assignAndValidateSlots(
      vision,
      [{ type: 'image', role: 'reference', targetSlot: 'reference_image', pathOrUrl: 'https://x/ref.png', mime: 'image/png', sizeBytes: 100 }],
      { prompt: 'see' },
    )
    assert.equal(refSingleToPlural.ok, true)
    assert.equal(refSingleToPlural.bindings[0].slot, 'reference_images')
    assert.equal(refSingleToPlural.bySlot.get('reference_images')?.length, 1)

    // 2. reference_images -> reference_image (e.g. gpt-image-2.5 multi_reference)
    const gptMultiRef = index.get('gpt-image-2.5').operations.find((o) => o.id === 'multi_reference')
    const refPluralToSingle = assignAndValidateSlots(
      gptMultiRef,
      [{ type: 'image', role: 'reference', targetSlot: 'reference_images', pathOrUrl: 'https://x/ref.png', mime: 'image/png', sizeBytes: 100 }],
      { prompt: 'see' },
    )
    assert.equal(refPluralToSingle.ok, true)
    assert.equal(refPluralToSingle.bindings[0].slot, 'reference_image')
    assert.equal(refPluralToSingle.bySlot.get('reference_image')?.length, 1)

    // 3. first_frame_image -> first_frame (e.g. seedance-2-5 first_frame)
    const seedanceFirstFrame = index.get('seedance-2-5').operations.find((o) => o.id === 'first_frame')
    const ffAliasToSlot = assignAndValidateSlots(
      seedanceFirstFrame,
      [{ type: 'image', role: 'first_frame', targetSlot: 'first_frame_image', pathOrUrl: 'https://x/ff.png', mime: 'image/png', sizeBytes: 100 }],
      { prompt: 'start' },
    )
    assert.equal(ffAliasToSlot.ok, true)
    assert.equal(ffAliasToSlot.bindings[0].slot, 'first_frame')
    assert.equal(ffAliasToSlot.bySlot.get('first_frame')?.length, 1)

    // 4. first_frame -> first_frame_image
    const opWithFirstFrameImage = {
      id: 'custom_i2v',
      inputs: [{ slot: 'first_frame_image', role: 'first_frame', type: 'image', min: 1, max: 1 }],
    }
    const ffSlotToAlias = assignAndValidateSlots(
      opWithFirstFrameImage,
      [{ type: 'image', role: 'first_frame', targetSlot: 'first_frame', pathOrUrl: 'https://x/ff.png' }],
      { prompt: 'start' },
    )
    assert.equal(ffSlotToAlias.ok, true)
    assert.equal(ffSlotToAlias.bindings[0].slot, 'first_frame_image')
    assert.equal(ffSlotToAlias.bySlot.get('first_frame_image')?.length, 1)

    // 5. last_frame_image -> last_frame (e.g. minimax-h3 end_frame)
    const minimaxEndFrame = index.get('minimax-h3').operations.find((o) => o.id === 'end_frame')
    const lfAliasToSlot = assignAndValidateSlots(
      minimaxEndFrame,
      [{ type: 'image', role: 'last_frame', targetSlot: 'last_frame_image', pathOrUrl: 'https://x/lf.png', mime: 'image/png', sizeBytes: 100 }],
      { prompt: 'end' },
    )
    assert.equal(lfAliasToSlot.ok, true)
    assert.equal(lfAliasToSlot.bindings[0].slot, 'last_frame')
    assert.equal(lfAliasToSlot.bySlot.get('last_frame')?.length, 1)

    // 6. last_frame -> last_frame_image
    const opWithLastFrameImage = {
      id: 'custom_end_frame',
      inputs: [{ slot: 'last_frame_image', role: 'last_frame', type: 'image', min: 1, max: 1 }],
    }
    const lfSlotToAlias = assignAndValidateSlots(
      opWithLastFrameImage,
      [{ type: 'image', role: 'last_frame', targetSlot: 'last_frame', pathOrUrl: 'https://x/lf.png' }],
      { prompt: 'end' },
    )
    assert.equal(lfSlotToAlias.ok, true)
    assert.equal(lfSlotToAlias.bindings[0].slot, 'last_frame_image')
    assert.equal(lfSlotToAlias.bySlot.get('last_frame_image')?.length, 1)

    // 7. Unknown slot still fails closed with role_conflict
    const unknownSlot = assignAndValidateSlots(
      vision,
      [{ type: 'image', role: 'reference', targetSlot: 'nonexistent_slot', pathOrUrl: 'https://x/a.png' }],
      { prompt: 'see' },
    )
    assert.equal(unknownSlot.ok, false)
    assert.equal(unknownSlot.rejections[0].code, GUARD_CODES.ROLE_CONFLICT)
    assert.match(unknownSlot.rejections[0].message, /explicit targetSlot nonexistent_slot not found/)
  })
})
