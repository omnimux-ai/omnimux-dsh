/**
 * SubmitGuard (#468) — admission, slots, mapper, output, listed profile coverage.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  DEFAULT_PROFILE_PAYLOADS,
  GUARD_CODES,
  admitModel,
  admitOperation,
  assertGuardOutput,
  assertGuardSubmit,
  assignAndValidateSlots,
  guardSubmit,
  inferUniqueOperation,
  mapValidatedPlanToVendor,
  normalizeLogicalRequest,
  resolveProfilePayloadContract,
  validateVendorResult,
} from './index.js'
import {
  getContractIndex,
  loadAdapterProfiles,
  verifyContracts,
} from '../index.js'
import { executeOmnimuxVideo } from '../../../media/video.js'
import { executeOmnimuxImage } from '../../../media/image.js'
import { executeOmnimuxText } from '../../../text/execute.js'
import { OmnimuxError } from '../../../media/errors.js'
import { mapOmnimuxInput } from '../../../media/vendors/omnimux.js'

const index = getContractIndex()
const profiles = loadAdapterProfiles()

describe('SubmitGuard listed profile coverage (#468)', () => {
  it('strict listedOperations is exactly 55 and every key has a ready profile payload contract', () => {
    const report = verifyContracts({ strict: true })
    assert.equal(report.ok, true)
    assert.equal(report.listedOperations.length, 55)
    const profileById = new Map((profiles.profiles ?? []).map((p) => [p.id, p]))
    for (const key of report.listedOperations) {
      const [modelId, opId] = key.split('#')
      const model = index.get(modelId)
      assert.ok(model, `model ${modelId}`)
      const op = model.operations.find((o) => o.id === opId)
      assert.ok(op?.listed, key)
      const profileId = op.implementation?.profileId
      assert.ok(profileId, `${key} profileId`)
      const profile = profileById.get(profileId)
      assert.ok(profile && profile.status === 'live', `${key} live profile`)
      assert.ok(profile.operations.includes(opId), `${key} in profile.operations`)
      assert.ok(profile.outputTypes.includes(op.output.type), `${key} outputTypes`)
      const contract = resolveProfilePayloadContract(profile)
      assert.ok(Array.isArray(contract.vendorFields) && contract.vendorFields.length > 0, `${key} vendorFields`)
      assert.equal(contract.unknownFieldPolicy, 'reject')
      // Guard admits each listed key with a minimal legal request
      const mediaSlots = (op.inputs ?? []).filter((s) => s.type && s.type !== 'text' && s.role !== 'prompt')
      /** @type {object} */
      const req = {
        model: modelId,
        operation: opId,
        prompt: 'hello from coverage',
      }
      const selectedCounts = new Map()
      const appendSlotAssets = (slot, count) => {
        const current = selectedCounts.get(slot.slot) ?? 0
        const extension = { image: 'png', video: 'mp4', audio: 'mp3', document: 'txt' }[slot.type] ?? 'bin'
        for (let offset = 0; offset < count; offset += 1) {
          const index = current + offset
          const durationFloor = Math.max(
            1,
            slot.minDurationSec ?? 0,
            (slot.totalMinDurationSec ?? 0) + (slot.totalMinExclusive ? 1 : 0),
          )
          req.assets = [...(req.assets ?? []), {
            role: slot.role,
            targetSlot: slot.slot,
            type: slot.type,
            pathOrUrl: `https://example.com/cov-${modelId}-${slot.slot}-${index}.${extension}`,
            mime: slot.allowedMimes?.[0],
            sizeBytes: 100,
            durationSec: durationFloor,
          }]
        }
        selectedCounts.set(slot.slot, current + count)
      }
      for (const slot of mediaSlots) {
        const count = Number.isFinite(slot.min) ? slot.min : 0
        if (count > 0) appendSlotAssets(slot, count)
      }
      for (const group of op.inputGroups ?? []) {
        const count = group.slots.reduce((sum, name) => sum + (selectedCounts.get(name) ?? 0), 0)
        if (count < group.min) {
          const slot = mediaSlots.find((candidate) => group.slots.includes(candidate.slot))
          assert.ok(slot, `${key} input group slot`)
          appendSlotAssets(slot, group.min - count)
        }
      }
      const plan = guardSubmit(req, {
        index,
        profiles,
        seam: profile.seam,
        outputType: op.output.type,
      })
      assert.equal(plan.ok, true, `${key} should admit: ${plan.ok === false ? plan.message : ''}`)
      assert.equal(plan.operationId, opId)
      assert.equal(plan.profileId, profileId)
    }
  })

  it('DEFAULT_PROFILE_PAYLOADS covers every registered profile id', () => {
    for (const p of profiles.profiles ?? []) {
      assert.ok(DEFAULT_PROFILE_PAYLOADS[p.id], `default payload for ${p.id}`)
    }
  })
})

describe('SubmitGuard admission', () => {
  it('resolves aliases to canonical model ids', () => {
    // Use a model that has aliases if any; otherwise identity
    const sample = index.all().find((m) => (m.aliases ?? []).length > 0)
    if (!sample) {
      const hit = admitModel(index, 'seedance-2-0-fast')
      assert.equal(hit.ok, true)
      assert.equal(hit.modelId, 'seedance-2-0-fast')
      return
    }
    const alias = sample.aliases[0]
    const hit = admitModel(index, alias)
    assert.equal(hit.ok, true)
    assert.equal(hit.modelId, sample.id)
    assert.equal(hit.aliased, true)
  })

  it('rejects unknown models', () => {
    const hit = admitModel(index, 'definitely-not-a-model-xyz')
    assert.equal(hit.ok, false)
    assert.equal(hit.code, GUARD_CODES.UNKNOWN_MODEL)
  })

  it('rejects whisper-1 speech_to_text as not listed / research draft', () => {
    const model = index.get('whisper-1')
    assert.ok(model)
    const hit = admitOperation(model, 'speech_to_text', profiles)
    assert.equal(hit.ok, false)
    assert.ok(
      hit.code === GUARD_CODES.RESEARCH_NOT_VERIFIED ||
        hit.code === GUARD_CODES.EXECUTION_UNAVAILABLE ||
        hit.code === GUARD_CODES.NOT_LISTED,
    )
  })

  it('rejects kling-avatar digital_human as not listed', () => {
    const model = index.get('kling-avatar')
    const hit = admitOperation(model, 'digital_human', profiles)
    assert.equal(hit.ok, false)
  })

  it('rejects unlisted first_last_frame even if profile supports the op id', () => {
    const model = index.get('kling-v3')
    assert.ok(model)
    const hit = admitOperation(model, 'first_last_frame', profiles)
    assert.equal(hit.ok, false)
  })

  it('admits seedance-2-0-fast#text_to_video', () => {
    const model = index.get('seedance-2-0-fast')
    const hit = admitOperation(model, 'text_to_video', profiles)
    assert.equal(hit.ok, true)
    assert.equal(hit.profileId, 'videoGenerate')
  })

  it('malformed catalog index fails closed', () => {
    const bad = {
      get() { return undefined },
      all() { return [] },
      parseErrors: ['broken yaml'],
    }
    const hit = admitModel(bad, 'x')
    assert.equal(hit.ok, false)
    assert.equal(hit.code, GUARD_CODES.CATALOG_MALFORMED)
  })
})

describe('SubmitGuard legacy operation inference', () => {
  it('infers chat uniquely on claude-opus-5 (single listed op)', () => {
    const model = index.get('claude-opus-5')
    const hit = inferUniqueOperation(model, [], { prompt: 'hi', seam: 'textComplete', profiles })
    assert.equal(hit.ok, true)
    assert.equal(hit.operationId, 'chat')
  })

  it('infers chat on gemini-3.7-flash when no media (chat more specific than vision_chat)', () => {
    const model = index.get('gemini-3.7-flash')
    const hit = inferUniqueOperation(model, [], { prompt: 'hi', seam: 'textComplete', profiles })
    assert.equal(hit.ok, true)
    assert.equal(hit.operationId, 'chat')
  })

  it('infers vision_chat when an image asset is present', () => {
    const model = index.get('gemini-3.7-flash')
    const hit = inferUniqueOperation(
      model,
      [{ type: 'image', role: 'reference', pathOrUrl: 'https://example.com/a.png', mime: 'image/png', sizeBytes: 10 }],
      { prompt: 'hi', seam: 'textComplete', profiles },
    )
    assert.equal(hit.ok, true)
    assert.equal(hit.operationId, 'vision_chat')
  })

  it('returns operation_required when inputs are empty and no listed op for seam', () => {
    // audio model suno has listed=false only
    const model = index.get('suno')
    const hit = inferUniqueOperation(model, [], { prompt: 'song', seam: 'audioGenerate', profiles })
    assert.equal(hit.ok, false)
    assert.equal(hit.code, GUARD_CODES.OPERATION_REQUIRED)
  })

  it('guardSubmit records deprecation diagnostic only when the operation is unique', () => {
    const plan = guardSubmit(
      { model: 'claude-opus-5', prompt: 'hello' },
      { index, profiles, seam: 'textComplete', outputType: 'text' },
    )
    assert.equal(plan.ok, true)
    assert.equal(plan.operationInferred, true)
    assert.equal(plan.operationId, 'chat')
    assert.ok(plan.diagnostics.some((d) => d.code === 'legacy_operation_inferred'))
  })

  it('requires an explicit operation for a multi-mode phase-one model', () => {
    const plan = guardSubmit(
      { model: 'seedance-2-0-fast', prompt: 'a cat runs' },
      { index, profiles, seam: 'videoGenerate', outputType: 'video' },
    )
    assert.equal(plan.ok, false)
    assert.equal(plan.code, GUARD_CODES.OPERATION_REQUIRED)
  })
})

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
      [
        assets[0],
        { ...assets[1], durationSec: maxDur + 0.01 },
      ],
      { prompt: '' },
    )
    assert.equal(over.ok, false)
    assert.equal(over.rejections[0].code, GUARD_CODES.DURATION_EXCEEDED)
    const unknownDur = assignAndValidateSlots(
      avatarOp,
      [
        assets[0],
        { type: 'audio', role: 'audio_track', pathOrUrl: '/a.mp3', mime: 'audio/mp3', sizeBytes: 100 },
      ],
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
        type: 'image',
        role: 'reference',
        pathOrUrl: `https://x/${i}.png`,
        mime: 'image/png',
        sizeBytes: 10,
      })
    }
    const r = assignAndValidateSlots(vision, assets, { prompt: 'see' })
    assert.equal(r.ok, false)
    assert.equal(r.rejections[0].code, GUARD_CODES.SLOT_CAPACITY)
  })

  it('Wan reference limits use the published image and combined-duration boundaries', () => {
    const op = index.get('wan-3.0').operations.find((candidate) => candidate.id === 'video_multi_ref')
    const images = Array.from({ length: 10 }, (_, index) => ({
      type: 'image',
      role: 'reference',
      targetSlot: 'reference_images',
      pathOrUrl: `https://x/${index}.png`,
      mime: 'image/png',
      sizeBytes: 100,
    }))
    assert.equal(assignAndValidateSlots(op, images, { prompt: '', duration: 5 }).ok, true)
    const overImages = assignAndValidateSlots(op, [
      ...images,
      { ...images[0], pathOrUrl: 'https://x/10.png' },
    ], { prompt: '', duration: 5 })
    assert.equal(overImages.ok, false)
    assert.equal(overImages.rejections[0].code, GUARD_CODES.SLOT_CAPACITY)

    const video = [{
      type: 'video',
      role: 'reference',
      targetSlot: 'reference_videos',
      pathOrUrl: 'https://x/reference.mp4',
      mime: 'video/mp4',
      sizeBytes: 100,
      durationSec: 15,
    }]
    assert.equal(assignAndValidateSlots(op, video, { prompt: '', duration: 15 }).ok, true)
    const overDuration = assignAndValidateSlots(op, video, { prompt: '', duration: 16 })
    assert.equal(overDuration.ok, false)
    assert.equal(overDuration.rejections[0].code, GUARD_CODES.DURATION_EXCEEDED)
  })
})

describe('SubmitGuard vendor mapper exclusivity', () => {
  const videoProfile = profiles.profiles.find((p) => p.id === 'videoGenerate')
  const dhProfile = profiles.profiles.find((p) => p.id === 'videoDigitalHuman')

  function bindings(rows) {
    return rows.map((r) => ({
      slot: r.slot || r.role,
      role: r.role,
      type: r.type,
      pathOrUrl: r.pathOrUrl,
      asset: r,
    }))
  }

  it('first_frame maps one role-tagged APIMart frame', () => {
    const op = { id: 'first_frame', output: { type: 'video' }, inputs: [] }
    const mapped = mapValidatedPlanToVendor({
      operation: op,
      profile: videoProfile,
      modelId: 'x',
      prompt: 'go',
      bindings: bindings([
        { role: 'first_frame', type: 'image', pathOrUrl: 'https://f.png' },
        { role: 'reference', type: 'image', pathOrUrl: 'https://r.png' },
      ]),
      bySlot: new Map(),
    })
    assert.equal(mapped.ok, true)
    assert.deepEqual(mapped.vendorPayload.image_with_roles, [
      { url: 'https://f.png', role: 'first_frame' },
    ])
    assert.equal('image_urls' in mapped.vendorPayload, false)
    assert.equal('audioTrack' in mapped.vendorPayload, false)
    assert.equal('metadata' in mapped.vendorPayload, false)
  })

  it('video_multi_ref preserves ordered APIMart image_urls', () => {
    const op = { id: 'video_multi_ref', output: { type: 'video' }, inputs: [] }
    const mapped = mapValidatedPlanToVendor({
      operation: op,
      profile: videoProfile,
      modelId: 'x',
      prompt: 'go',
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
      operation: op,
      profile: videoProfile,
      modelId: 'seedance-2-5',
      prompt: 'continue',
      bindings: assigned.bindings,
      bySlot: assigned.bySlot,
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
      operation: op,
      profile: videoProfile,
      modelId: 'x',
      prompt: 'go',
      bindings: bindings([
        { role: 'first_frame', type: 'image', pathOrUrl: 'https://f.png' },
        { role: 'last_frame', type: 'image', pathOrUrl: 'https://l.png' },
      ]),
      bySlot: new Map(),
    })
    assert.equal(mapped.ok, true)
    assert.deepEqual(mapped.vendorPayload.image_with_roles, [
      { url: 'https://f.png', role: 'first_frame' },
      { url: 'https://l.png', role: 'last_frame' },
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
      operation: op,
      profile: videoProfile,
      modelId: 'minimax-h3',
      prompt: 'end here',
      bindings: assigned.bindings,
      bySlot: assigned.bySlot,
    })
    assert.equal(mapped.ok, true)
    assert.deepEqual(mapped.vendorPayload.image_with_roles, [
      { url: 'https://end.png', role: 'last_frame' },
    ])
    assert.equal('image_urls' in mapped.vendorPayload, false)
  })

  it('digital_human maps image + audioTrack only', () => {
    const op = { id: 'digital_human', output: { type: 'video' }, inputs: [] }
    const mapped = mapValidatedPlanToVendor({
      operation: op,
      profile: dhProfile,
      modelId: 'kling-avatar',
      prompt: 'talk',
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
    // Force a bad field by mutating after map via assert path
    const mapped = mapValidatedPlanToVendor({
      operation: op,
      profile: videoProfile,
      modelId: 'seedance-2-0-fast',
      prompt: 'x',
      bindings: [],
      bySlot: new Map(),
      extras: { voice: 'alloy' },
    })
    assert.equal(mapped.ok, true)
    assert.equal('voice' in mapped.vendorPayload, false)
    assert.equal('metadata' in mapped.vendorPayload, false)
  })

  it('mapOmnimuxInput prefers guardPlan.vendorPayload', () => {
    const body = mapOmnimuxInput('video', {
      prompt: 'ignored',
      guardPlan: {
        vendorPayload: { prompt: 'from-guard', image: 'https://only.png' },
      },
    })
    assert.deepEqual(body, { prompt: 'from-guard', image: 'https://only.png' })
  })
})

describe('SubmitGuard output validation', () => {
  const t2v = index.get('seedance-2-0-fast').operations.find((o) => o.id === 'text_to_video')
  const chat = index.get('claude-opus-5').operations.find((o) => o.id === 'chat')

  it('accepts matching video outputs', () => {
    const r = validateVendorResult(
      { taskId: 't', outputs: [{ type: 'video', url: 'https://x/a.mp4' }] },
      t2v,
      { capability: 'video' },
    )
    assert.equal(r.ok, true)
  })

  it('rejects type mismatch', () => {
    const r = validateVendorResult(
      { taskId: 't', outputs: [{ type: 'image', url: 'https://x/a.png' }], mode: 'live' },
      t2v,
      { capability: 'video' },
    )
    assert.equal(r.ok, false)
    assert.equal(r.code, GUARD_CODES.OUTPUT_TYPE_MISMATCH)
  })

  it('rejects missing text', () => {
    const r = validateVendorResult({ mode: 'live', text: '  ' }, chat)
    assert.equal(r.ok, false)
    assert.equal(r.code, GUARD_CODES.INVALID_RESPONSE)
  })

  it('accepts submitted mode without outputs', () => {
    const r = validateVendorResult({ mode: 'submitted', taskId: 't1' }, t2v)
    assert.equal(r.ok, true)
  })
})

describe('SubmitGuard execute integration', () => {
  it('seedance text_to_video live path reaches vendor once', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-vid-'))
    const dest = join(dir, 'o.mp4')
    let calls = 0
    const result = await executeOmnimuxVideo({
      prompt: 'a wall at night',
      dest,
      model: 'seedance-2-0-fast',
      operation: 'text_to_video',
      duration: 4,
      resolution: '720p',
      env: { OMNIMUX_API_KEY: 'sk-test' },
      runtime: {
        async execute(req) {
          calls += 1
          assert.equal(req.input.prompt, 'a wall at night')
          assert.equal(req.input.duration, 4)
          assert.equal(req.input.resolution, '720p')
          assert.equal('audioTrack' in req.input, false)
          assert.equal('metadata' in req.input, false)
          return { taskId: 't1', outputs: [{ type: 'video', url: 'https://cdn.example/a.mp4' }] }
        },
      },
      fetcher: async () => ({
        ok: true,
        headers: { get: () => 'video/mp4' },
        arrayBuffer: async () => Buffer.from('mp4'),
      }),
    })
    assert.equal(result.mode, 'live')
    assert.equal(calls, 1)
    assert.equal(readFileSync(dest, 'utf8'), 'mp4')
    rmSync(dir, { recursive: true, force: true })
  })

  it('invalid request yields vendor call count 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-rej-'))
    const dest = join(dir, 'o.mp4')
    let calls = 0
    await assert.rejects(
      () => executeOmnimuxVideo({
        prompt: '',
        dest,
        model: 'seedance-2-0-fast',
        operation: 'text_to_video',
        env: { OMNIMUX_API_KEY: 'sk-test' },
        runtime: { async execute() { calls += 1; return { outputs: [] } } },
      }),
      (e) => e instanceof OmnimuxError,
    )
    assert.equal(calls, 0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects unsupported declared parameters before vendor execution', async () => {
    let calls = 0
    await assert.rejects(
      () => executeOmnimuxVideo({
        prompt: 'a wall at night',
        dest: '/tmp/sg-unsupported-parameter.mp4',
        model: 'seedance-2-0-fast',
        operation: 'text_to_video',
        duration: 3,
        resolution: 'bogus',
        env: { OMNIMUX_API_KEY: 'sk-test' },
        runtime: { async execute() { calls += 1; return { outputs: [] } } },
      }),
      (error) => error instanceof OmnimuxError && error.code === 'omnimux-invalid-request',
    )
    assert.equal(calls, 0)
  })

  it('taskId poll path does not require prompt or assets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-poll-'))
    const dest = join(dir, 'o.mp4')
    let submitCalls = 0
    const result = await executeOmnimuxVideo({
      dest,
      taskId: 'existing-task',
      env: { OMNIMUX_API_KEY: 'sk-test' },
      // no prompt
      runtime: {
        async execute() {
          submitCalls += 1
          return { outputs: [] }
        },
      },
      fetcher: async (url) => {
        // poll GET
        if (String(url).includes('existing-task')) {
          return {
            ok: true,
            json: async () => ({ status: 'completed', url: 'https://cdn.example/done.mp4' }),
          }
        }
        return {
          ok: true,
          headers: { get: () => 'video/mp4' },
          arrayBuffer: async () => Buffer.from('done'),
        }
      },
    })
    assert.equal(result.mode, 'live')
    assert.equal(submitCalls, 0)
    assert.equal(readFileSync(dest, 'utf8'), 'done')
    rmSync(dir, { recursive: true, force: true })
  })

  it('gpt-image-2 text_to_image passes guard', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-img-'))
    const dest = join(dir, 'o.png')
    const result = await executeOmnimuxImage({
      prompt: 'a lamp',
      dest,
      model: 'gpt-image-2',
      operation: 'text_to_image',
      env: { OMNIMUX_API_KEY: 'sk-test' },
      runtime: {
        async execute() {
          return { taskId: 'i1', outputs: [{ type: 'image', url: 'https://cdn.example/i.png' }] }
        },
      },
      fetcher: async () => ({
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => Buffer.from('png'),
      }),
    })
    assert.equal(result.mode, 'live')
    rmSync(dir, { recursive: true, force: true })
  })

  it('text chat listed path passes through guard', async () => {
    async function* stream() {
      yield { type: 'text-delta', text: 'hello' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const result = await executeOmnimuxText({
      prompt: 'hi',
      model: 'claude-opus-5',
      operation: 'chat',
      llm: { stream: () => stream() },
    })
    assert.equal(result.text, 'hello')
  })

  it('text vision path with image meta passes', async () => {
    async function* stream() {
      yield { type: 'text-delta', text: 'cat' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const dataUri = 'data:image/png;base64,iVBORw0KGgo='
    const result = await executeOmnimuxText({
      prompt: 'what',
      model: 'gemini-3.7-flash',
      operation: 'vision_chat',
      image: dataUri,
      assetMeta: { [dataUri]: { mime: 'image/png', sizeBytes: 12 } },
      llm: { stream: () => stream() },
      attachments: {
        saveImage: async () => ({ id: 'att-1' }),
      },
    })
    assert.equal(result.text, 'cat')
  })

  it('assertGuardOutput throws typed invalid_response on mismatch', () => {
    const plan = assertGuardSubmit(
      { model: 'seedance-2-0-fast', operation: 'text_to_video', prompt: 'x' },
      { index, profiles, seam: 'videoGenerate', outputType: 'video' },
    )
    assert.throws(
      () => assertGuardOutput(plan, { mode: 'live', outputs: [{ type: 'image', url: 'https://x' }] }, { capability: 'video' }),
      (e) => e instanceof OmnimuxError && e.code === 'omnimux-invalid-response',
    )
  })
})

describe('normalizeLogicalRequest', () => {
  it('lifts image/references/audioTrack/image_tail', () => {
    const n = normalizeLogicalRequest({
      prompt: 'p',
      image: 'https://a.png',
      image_tail: 'https://b.png',
      references: [{ role: 'reference', type: 'image', pathOrUrl: 'https://c.png' }],
      audioTrack: { type: 'audio', pathOrUrl: '/t.mp3' },
      capability: 'video',
    })
    assert.ok(n.assets.some((a) => a.role === 'first_frame' && a.pathOrUrl === 'https://a.png'))
    assert.ok(n.assets.some((a) => a.role === 'last_frame'))
    assert.ok(n.assets.some((a) => a.role === 'reference'))
    assert.ok(n.assets.some((a) => a.role === 'audio_track'))
  })
})
