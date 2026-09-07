import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assignAndValidateSlots, mapValidatedPlanToVendor } from './index.js'
import { getContractIndex, loadAdapterProfiles } from '../index.js'
import { mapOmnimuxInput } from '../../../media/vendors/omnimux.js'

const index = getContractIndex()
const profiles = loadAdapterProfiles()

describe('SubmitGuard vendor mapper exclusivity', () => {
  const videoProfile = profiles.profiles.find((p) => p.id === 'videoGenerate')
  const dhProfile = profiles.profiles.find((p) => p.id === 'videoDigitalHuman')

  function bindings(rows) {
    return rows.map((r) => ({
      slot: r.slot || r.role, role: r.role, type: r.type, pathOrUrl: r.pathOrUrl, asset: r,
    }))
  }

  it('first_frame maps one role-tagged APIMart frame', () => {
    const op = { id: 'first_frame', output: { type: 'video' }, inputs: [] }
    const mapped = mapValidatedPlanToVendor({
      operation: op, profile: videoProfile, modelId: 'x', prompt: 'go',
      bindings: bindings([
        { role: 'first_frame', type: 'image', pathOrUrl: 'https://f.png' },
        { role: 'reference', type: 'image', pathOrUrl: 'https://r.png' },
      ]),
      bySlot: new Map(),
    })
    assert.equal(mapped.ok, true)
    assert.deepEqual(mapped.vendorPayload.image_with_roles, [{ url: 'https://f.png', role: 'first_frame' }])
    assert.equal('image_urls' in mapped.vendorPayload, false)
    assert.equal('audioTrack' in mapped.vendorPayload, false)
    assert.equal('metadata' in mapped.vendorPayload, false)
  })

  it('video_multi_ref preserves ordered APIMart image_urls', () => {
    const op = { id: 'video_multi_ref', output: { type: 'video' }, inputs: [] }
    const mapped = mapValidatedPlanToVendor({
      operation: op, profile: videoProfile, modelId: 'x', prompt: 'go',
      bindings: bindings([
        { role: 'reference', type: 'image', pathOrUrl: 'https://a.png' },
        { role: 'reference', type: 'image', pathOrUrl: 'https://b.png' },
      ]),
      bySlot: new Map(),
    })
    assert.equal(mapped.ok, true)
    assert.deepEqual(mapped.vendorPayload.image_urls, ['https://a.png', 'https://b.png'])
    assert.equal('image_with_roles' in mapped.vendorPayload, false)
  })

  it('video_extend keeps supplemental image and audio references with the required source video', () => {
    const op = index.get('seedance-2-5').operations.find((candidate) => candidate.id === 'video_extend')
    const assigned = assignAndValidateSlots(op, [
      { role: 'source', type: 'video', pathOrUrl: 'https://source.mp4', mime: 'video/mp4', sizeBytes: 100, durationSec: 10 },
      { role: 'reference', type: 'image', pathOrUrl: 'https://look.png', mime: 'image/png', sizeBytes: 100 },
      { role: 'reference', type: 'audio', pathOrUrl: 'https://sound.mp3', mime: 'audio/mp3', sizeBytes: 100, durationSec: 3 },
    ], { prompt: 'continue', duration: 8, aspectRatio: 'adaptive' })
    assert.equal(assigned.ok, true)
    const mapped = mapValidatedPlanToVendor({
      operation: op, profile: videoProfile, modelId: 'seedance-2-5', prompt: 'continue',
      bindings: assigned.bindings, bySlot: assigned.bySlot,
      logical: { duration: 8, aspectRatio: 'adaptive' },
    })
    assert.equal(mapped.ok, true)
    assert.deepEqual(mapped.vendorPayload.video_urls, ['https://source.mp4'])
    assert.deepEqual(mapped.vendorPayload.image_urls, ['https://look.png'])
    assert.deepEqual(mapped.vendorPayload.audio_urls, ['https://sound.mp3'])
  })

  it('first_last_frame maps ordered role-tagged APIMart frames', () => {
    const op = { id: 'first_last_frame', output: { type: 'video' }, inputs: [] }
    const mapped = mapValidatedPlanToVendor({
      operation: op, profile: videoProfile, modelId: 'x', prompt: 'go',
      bindings: bindings([
        { role: 'first_frame', type: 'image', pathOrUrl: 'https://f.png' },
        { role: 'last_frame', type: 'image', pathOrUrl: 'https://l.png' },
      ]),
      bySlot: new Map(),
    })
    assert.equal(mapped.ok, true)
    assert.deepEqual(mapped.vendorPayload.image_with_roles, [
      { url: 'https://f.png', role: 'first_frame' }, { url: 'https://l.png', role: 'last_frame' },
    ])
    assert.equal('image_urls' in mapped.vendorPayload, false)
  })

  it('end_frame maps the canonical H3 last frame role only', () => {
    const op = index.get('minimax-h3').operations.find((candidate) => candidate.id === 'end_frame')
    const assigned = assignAndValidateSlots(op, [
      { type: 'image', role: 'last_frame', targetSlot: 'last_frame', pathOrUrl: 'https://end.png', mime: 'image/png', sizeBytes: 100 },
    ], { prompt: 'end here' })
    assert.equal(assigned.ok, true)
    assert.deepEqual(assigned.bindings.map(({ slot, role }) => ({ slot, role })), [{ slot: 'last_frame', role: 'last_frame' }])
    const mapped = mapValidatedPlanToVendor({
      operation: op, profile: videoProfile, modelId: 'minimax-h3', prompt: 'end here',
      bindings: assigned.bindings, bySlot: assigned.bySlot,
    })
    assert.equal(mapped.ok, true)
    assert.deepEqual(mapped.vendorPayload.image_with_roles, [{ url: 'https://end.png', role: 'last_frame' }])
    assert.equal('image_urls' in mapped.vendorPayload, false)
  })

  it('digital_human maps image + audioTrack only', () => {
    const op = { id: 'digital_human', output: { type: 'video' }, inputs: [] }
    const mapped = mapValidatedPlanToVendor({
      operation: op, profile: dhProfile, modelId: 'kling-avatar', prompt: 'talk',
      bindings: bindings([
        { role: 'reference', type: 'image', pathOrUrl: 'https://face.png' },
        { role: 'audio_track', type: 'audio', pathOrUrl: '/v.mp3' },
      ]),
      bySlot: new Map(),
    })
    assert.equal(mapped.ok, true)
    assert.equal(mapped.vendorPayload.image, 'https://face.png')
    assert.equal(mapped.vendorPayload.audioTrack.pathOrUrl, '/v.mp3')
    assert.equal('metadata' in mapped.vendorPayload, false)
    assert.equal('reference_images' in mapped.vendorPayload, false)
  })

  it('rejects forbidden vendor fields fail-closed', () => {
    const op = { id: 'text_to_video', output: { type: 'video' }, inputs: [] }
    const mapped = mapValidatedPlanToVendor({
      operation: op, profile: videoProfile, modelId: 'seedance-2-0-fast', prompt: 'x',
      bindings: [], bySlot: new Map(), extras: { voice: 'alloy' },
    })
    assert.equal(mapped.ok, true)
    assert.equal('voice' in mapped.vendorPayload, false)
    assert.equal('metadata' in mapped.vendorPayload, false)
  })

  it('mapOmnimuxInput prefers guardPlan.vendorPayload', () => {
    const body = mapOmnimuxInput('video', {
      prompt: 'ignored', guardPlan: { vendorPayload: { prompt: 'from-guard', image: 'https://only.png' } },
    })
    assert.deepEqual(body, { prompt: 'from-guard', image: 'https://only.png' })
  })
})
