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

function parameterPlan(parameters, request = {}, modelParameters = {}) {
  const original = index.get('gpt-image-2.5')
  const operation = { ...original.operations.find((op) => op.id === 'text_to_image'), parameters }
  const model = { ...original, parameters: modelParameters, operations: [operation] }
  return guardSubmit({ model: model.id, operation: operation.id, prompt: 'hello', ...request }, {
    index: { get: (id) => id === model.id ? model : undefined, all: () => [model] },
    profiles, dispositions: { models: [] }, skipVendorMap: true,
  })
}

it('parameter options and stepped range are alternative members through the original guard', () => {
  const definition = { duration: { options: [-1, 5], range: { min: 4, max: 30, step: 2 } } }
  const plan = parameterPlan(definition, { duration: 5 })
  assert.equal(plan.ok, true, JSON.stringify(plan))
  assert.equal(plan.extras.duration, 5)
})

describe('SubmitGuard listed profile coverage (#468)', () => {
  it('strict listedOperations is exactly 37 and every key has a ready profile payload contract', () => {
    const report = verifyContracts({ strict: true })
    assert.equal(report.ok, true)
    assert.equal(report.listedOperations.length, 37) // #3209 google-vids-omni 下线 −4 → 37（#3152 为 37）
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

    const ttsHit = admitModel(index, 'tts')
    assert.equal(ttsHit.ok, true)
    assert.equal(ttsHit.modelId, 'seed-audio-1.0')
    assert.equal(ttsHit.aliased, true)
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

  it('rejects unlisted first_last_frame even if profile supports the op id', () => {
    const model = index.get('kling-v3')
    assert.ok(model)
    const hit = admitOperation(model, 'first_last_frame', profiles)
    assert.equal(hit.ok, false)
  })

  it('admits seedance-2-5#text_to_video', () => {
    const model = index.get('seedance-2-5')
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
  it('infers text_to_image uniquely on gpt-image-2.5 (single listed op)', () => {
    const model = index.get('gpt-image-2.5')
    const hit = inferUniqueOperation(model, [], { prompt: 'hi', seam: 'imageGenerate', profiles })
    assert.equal(hit.ok, true)
    assert.equal(hit.operationId, 'text_to_image')
  })

  it('infers chat on gemini-3.8-flash when no media (chat more specific than vision_chat)', () => {
    const model = index.get('gemini-3.8-flash')
    const hit = inferUniqueOperation(model, [], { prompt: 'hi', seam: 'textComplete', profiles })
    assert.equal(hit.ok, true)
    assert.equal(hit.operationId, 'chat')
  })

  it('infers vision_chat when an image asset is present', () => {
    const model = index.get('gemini-3.8-flash')
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
      { model: 'gpt-image-2.5', prompt: 'hello' },
      { index, profiles, seam: 'imageGenerate', outputType: 'image' },
    )
    assert.equal(plan.ok, true)
    assert.equal(plan.operationInferred, true)
    assert.equal(plan.operationId, 'text_to_image')
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

it('parameter guard retains original shape, order, messages and legacy default extraction', () => {
  const parameters = {
    duration: { options: [-1, 5], range: { min: 4, max: 30, step: 2 } },
    sound: { supported: true, defaultValue: true }, watermark: { supported: false, defaultValue: false },
    n: { type: 'integer', defaultValue: 1 }, text: { type: 'string', defaultValue: 'default' },
  }
  for (const duration of [-1, 5, 6]) {
    const plan = parameterPlan(parameters, { duration, sound: false, n: 0, text: null, transport: 99 })
    assert.equal(plan.ok, true)
    assert.deepEqual(plan.extras, { duration, sound: false, watermark: false, n: 0, text: 'default' })
    assert.deepEqual(Object.keys(plan.extras), ['duration', 'sound', 'watermark', 'n', 'text'])
    assert.deepEqual(Object.keys(plan), ['ok', 'modelId', 'requestedModelId', 'operationId', 'operationInferred', 'operation', 'model', 'profile', 'profileId', 'seam', 'prompt', 'assets', 'bindings', 'bySlot', 'vendorPayload', 'logicalPayload', 'extras', 'diagnostics', 'disposition', 'payloadContract'])
  }
  for (const [definition, value, message] of [
    [{ options: [5] }, 6, 'does not accept 6'],
    [{ supported: true }, 0, 'must be boolean'],
    [{ supported: false }, false, 'is not supported'],
    [{ type: 'integer' }, 1.5, 'must be an integer'],
    [{ range: {} }, '5', 'must be numeric'],
    [{ range: { min: 4, step: 2 } }, 7, 'is outside its documented range'],
    [{ minLength: 2 }, 'a', 'is shorter than 2 characters'],
    [{ maxLength: 1 }, 'ab', 'exceeds 1 characters'],
  ]) assert.deepEqual(parameterPlan({ duration: definition }, { duration: value }), {
    ok: false, code: 'parameter_unsupported', message: `parameter "duration" ${message}`,
    diagnostics: [], details: { modelId: 'gpt-image-2.5', operationId: 'text_to_image', field: 'duration' },
  })
  const badDefault = parameterPlan({ duration: { range: { min: 4, step: 2 }, defaultValue: 7 } })
  assert.equal(badDefault.code, 'catalog_malformed')
  assert.equal(badDefault.message, 'parameter "duration" has an invalid or unresolved defaultValue')
  assert.equal(parameterPlan({ duration: { range: { min: .1, step: .1 } } }, { duration: .3 }).ok, true)
  assert.equal(parameterPlan({ duration: { range: { min: 0, step: 1 } } }, { duration: 2 ** 48 + .25 }).code, 'catalog_malformed')
  assert.deepEqual(parameterPlan({ n: { type: 'integer' } }, {}, { n: { defaultValue: 9 } }).extras, {})
})

it('parameter guard preserves literal options-first compound errors without weakening outer constraints', () => {
  for (const [definition, value, message] of [
    [{ type: 'integer', options: [1, 2] }, 1.5, 'does not accept 1.5'],
    [{ supported: true, options: [false] }, 'x', 'does not accept "x"'],
    [{ options: ['ab'], minLength: 2 }, 'a', 'does not accept "a"'],
    [{ type: 'integer', options: [1.5] }, 1.5, 'must be an integer'],
    [{ type: 'integer', options: [1, 2], range: { min: 0, max: 2 } }, 1.5, 'must be an integer'],
    [{ type: 'integer', options: [1, 2], range: { min: 0, max: 1 } }, 1.5, 'does not accept 1.5'],
  ]) assert.deepEqual(parameterPlan({ f: definition }, { f: value }), {
    ok: false, code: 'parameter_unsupported', message: `parameter "f" ${message}`,
    diagnostics: [], details: { modelId: 'gpt-image-2.5', operationId: 'text_to_image', field: 'f' },
  })
})

it('parameter guard retains the option-domain message when no option or range-bound witness exists', () => {
  const result = parameterPlan({ duration: { options: [-1, 5], range: { min: 4, max: 30, step: 2 } } }, { duration: 3 })
  assert.equal(result.message, 'parameter "duration" does not accept 3')
})
