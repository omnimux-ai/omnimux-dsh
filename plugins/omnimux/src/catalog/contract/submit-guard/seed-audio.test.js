import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getContractIndex, loadAdapterProfiles } from '../index.js'
import { assertGuardSubmit, assertVendorBodyAllowed, guardSubmit } from './index.js'
import { mapOmnimuxInput } from '../../../media/vendors/omnimux.js'

const model = 'seed-audio-1.0'
const defaults = {
  input: '  文本内容\n第二段  ',
  voice: 'zh_male_guanggaojieshuo_uranus_bigtts',
  speed: 1,
  response_format: 'mp3',
}
const options = { seam: 'audioGenerate', capability: 'audio', outputType: 'audio' }
const request = { model, operation: 'text_to_speech', prompt: defaults.input }

test('Seed Audio canonical and aliases share a listed speech contract and wire defaults', () => {
  const index = getContractIndex()
  const contract = index.get(model)
  assert.deepEqual(contract.listedOperations, [`${model}#text_to_speech`])
  assert.equal(contract.research.verifiedAt, '2026-09-07')
  for (const id of [model, ...contract.aliases]) {
    const plan = assertGuardSubmit({ ...request, model: id }, options)
    assert.equal(plan.modelId, model)
    assert.deepEqual(plan.vendorPayload, defaults)
    const payload = mapOmnimuxInput('audio', { prompt: request.prompt, guardPlan: plan })
    assert.deepEqual(payload, defaults)
    assert.equal('prompt' in payload, false)
    assert.equal('metadata' in payload, false)
    assert.equal(assertVendorBodyAllowed({ ...payload, model }, plan.profile, plan.operationId).ok, true)
  }
})

test('Seed Audio speech maps selected voice, speed and all supported formats at top level', () => {
  for (const format of ['mp3', 'wav', 'pcm']) {
    const plan = assertGuardSubmit({
      ...request, voice: 'ICL_uranus_en_female_charlie_tob', speed: 1.25, format,
    }, options)
    assert.deepEqual(plan.vendorPayload, {
      input: defaults.input, voice: 'ICL_uranus_en_female_charlie_tob', speed: 1.25, response_format: format,
    })
  }
})

test('all 509 catalog voices pass the exact whitelist for the canonical model and both aliases', () => {
  const index = getContractIndex()
  const contract = index.get(model)
  const voices = contract.parameters.voice.options
  assert.equal(voices.length, 509)
  for (const id of [model, ...contract.aliases]) {
    for (const { value } of voices) {
      const plan = assertGuardSubmit({ ...request, model: id, voice: value }, { ...options, index })
      assert.equal(plan.vendorPayload.voice, value)
      assert.deepEqual(Object.keys(plan.vendorPayload).sort(), ['input', 'response_format', 'speed', 'voice'])
    }
    for (const voice of ['alloy', 'unknown-voice', 'zh_male_not_official_bigtts', voices[0].value.toUpperCase()]) {
      const rejected = guardSubmit({ ...request, model: id, voice }, { ...options, index })
      assert.equal(rejected.ok, false, voice)
      assert.equal(rejected.code, 'parameter_unsupported')
    }
  }
})

test('Seed Audio rejects missing text and unsupported parameters', () => {
  for (const invalid of [
    { prompt: '' }, { prompt: '   ' }, { voice: 'alloy' }, { format: 'flac' },
    { speed: 'fast' }, { speed: NaN }, { speed: Infinity },
  ]) {
    assert.equal(guardSubmit({ ...request, ...invalid }, options).ok, false, JSON.stringify(invalid))
  }
})

test('speech mapping has a strict operation-specific body without altering legacy music mapping', () => {
  const profile = loadAdapterProfiles().profiles.find((entry) => entry.id === 'audioGenerate')
  assert.equal(assertVendorBodyAllowed({ input: 'hi', metadata: {} }, profile, 'text_to_speech').ok, false)
  assert.deepEqual(mapOmnimuxInput('audio', {
    model, operation: 'text_to_speech', prompt: 'hi', voice: defaults.voice, speed: 1.25, format: 'wav',
  }), { input: 'hi', voice: defaults.voice, speed: 1.25, response_format: 'wav' })
  assert.deepEqual(mapOmnimuxInput('audio', {
    model: 'suno', operation: 'text_to_music', prompt: 'piano', style: 'minimal',
  }), { prompt: 'piano', metadata: { style: 'minimal' } })
})
