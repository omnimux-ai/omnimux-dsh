/** SubmitGuard admission and listed profile coverage. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_PROFILE_PAYLOADS,
  GUARD_CODES,
  admitModel,
  admitOperation,
  guardSubmit,
  inferUniqueOperation,
  normalizeLogicalRequest,
  resolveProfilePayloadContract,
} from './index.js'
import { getContractIndex, loadAdapterProfiles, verifyContracts } from '../index.js'

const index = getContractIndex()
const profiles = loadAdapterProfiles()

describe('SubmitGuard listed profile coverage (#468)', () => {
  it('strict listedOperations is exactly 56 and every key has a ready profile payload contract', () => {
    const report = verifyContracts({ strict: true })
    assert.equal(report.ok, true)
    assert.equal(report.listedOperations.length, 56)
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
      // Guard admits each listed key with a minimal legal request.
      const mediaSlots = (op.inputs ?? []).filter((s) => s.type && s.type !== 'text' && s.role !== 'prompt')
      /** @type {object} */
      const req = { model: modelId, operation: opId, prompt: 'hello from coverage' }
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
      const plan = guardSubmit(req, { index, profiles, seam: profile.seam, outputType: op.output.type })
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
    const bad = { get() { return undefined }, all() { return [] }, parseErrors: ['broken yaml'] }
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

describe('normalizeLogicalRequest', () => {
  it('lifts image/references/audioTrack/image_tail', () => {
    const n = normalizeLogicalRequest({
      prompt: 'p', image: 'https://a.png', image_tail: 'https://b.png',
      references: [{ role: 'reference', type: 'image', pathOrUrl: 'https://c.png' }],
      audioTrack: { type: 'audio', pathOrUrl: '/t.mp3' }, capability: 'video',
    })
    assert.ok(n.assets.some((a) => a.role === 'first_frame' && a.pathOrUrl === 'https://a.png'))
    assert.ok(n.assets.some((a) => a.role === 'last_frame'))
    assert.ok(n.assets.some((a) => a.role === 'reference'))
    assert.ok(n.assets.some((a) => a.role === 'audio_track'))
  })
})
