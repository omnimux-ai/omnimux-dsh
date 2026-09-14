import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getContractIndex, loadAdapterProfiles, resolveModelId } from '../index.js'
import { loadDispositions, resolveDisposition } from '../dispositions.js'
import { GUARD_CODES, assertGuardSubmit, guardSubmit } from './index.js'

const model = 'doubao-asr-bigmodel'
const audio = 'https://example.com/audio.mp3'
const request = { model, audio, operation: 'speech_to_text' }
const options = { seam: 'speechToText', capability: 'stt', outputType: 'text' }

test('Doubao ASR canonical is admitted with text output and no prompt', () => {
  const index = getContractIndex()
  const contract = index.get(model)
  assert.deepEqual(contract.listedOperations, [`${model}#speech_to_text`])
  // #1789: `doubao-asr-bigmodel` and `seedasr-auc` are two independent models. Neither one
  // declares the other as an alias, and no disposition row unifies them either way.
  assert.deepEqual(contract.aliases ?? [], [])
  assert.equal(contract.research.status, 'verified')
  assert.equal(contract.execution.status, 'live')
  assert.equal(contract.operations[0].output.type, 'text')
  const dispositions = loadDispositions()
  assert.equal(resolveDisposition(dispositions, model).disposition, 'canonical')
  assert.equal(resolveDisposition(dispositions, model).target, undefined)
  assert.equal(resolveDisposition(dispositions, 'seedasr-auc').disposition, 'canonical')
  assert.equal(resolveDisposition(dispositions, 'seedasr-auc').target, undefined)
  const other = index.get('seedasr-auc')
  assert.deepEqual(other.aliases ?? [], [])
  assert.deepEqual(other.listedOperations, ['seedasr-auc#speech_to_text'])
  // Bidirectional non-unification: neither id resolves onto the other.
  assert.notEqual(resolveModelId(index, 'seedasr-auc'), model)
  assert.notEqual(resolveModelId(index, model), 'seedasr-auc')
  const plan = assertGuardSubmit({ ...request, model }, options)
  assert.equal(plan.modelId, model)
  assert.equal(plan.profileId, 'speechToText')
  assert.deepEqual(plan.vendorPayload, { model, file: audio, url: audio, audio_url: audio, response_format: 'json' })
  assert.deepEqual(plan.logicalPayload, { model, audio, response_format: 'json' })
  // The sibling ASR model is admitted under its own id — never归一 onto doubao-asr-bigmodel.
  const sibling = assertGuardSubmit({ ...request, model: 'seedasr-auc' }, options)
  assert.equal(sibling.modelId, 'seedasr-auc')
  assert.notEqual(sibling.modelId, model)
  assert.equal(sibling.vendorPayload.model, 'seedasr-auc')
})

test('Doubao ASR maps every admitted response format without speech-generation fields', () => {
  const profile = loadAdapterProfiles().profiles.find((row) => row.id === 'speechToText')
  for (const field of ['model', 'audio', 'response_format']) assert.ok(profile.logicalFields.includes(field))
  for (const response_format of ['json', 'text', 'verbose_json', 'srt', 'vtt']) {
    const plan = assertGuardSubmit({ ...request, response_format, prompt: 'not required' }, options)
    assert.deepEqual(plan.vendorPayload, { model, file: audio, url: audio, audio_url: audio, response_format })
  }
})

test('Doubao ASR rejects unsupported formats, absent audio and wrong operation', () => {
  for (const invalid of [
    { response_format: 'xml' }, { response_format: 1 }, { response_format: {} },
    { audio: '' }, { operation: 'text_to_speech' }, { model: 'whisper-1' },
  ]) {
    assert.equal(guardSubmit({ ...request, ...invalid }, options).ok, false, JSON.stringify(invalid))
  }
})
