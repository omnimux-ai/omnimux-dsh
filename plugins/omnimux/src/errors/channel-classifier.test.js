import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import { test } from 'node:test'
import { classifyChannelFailure, hasChannelEvidence, hasGroupFailoverEvidence, SAFE_CHANNEL_MESSAGE } from './channel-classifier.js'
import { OmnimuxError, unwrapAdapterError } from '../media/errors.js'

const raw = '[omnimux:ADAPTER_FAILED] Adapter openai-compatible failed: 分组 auto 下模型 grok-imagine-image-2 无可用渠道 (distributor) (request id: secret-id)'
const forbidden = /ADAPTER_FAILED|openai-compatible|distributor|分组 auto|request id|secret-id/i

for (const message of ['无可用渠道', '可用渠道不存在', 'GET_CHANNEL_FAILED', '(distributor)', '分组 vip 下模型 grok', raw]) {
  test(`classifies channel evidence: ${message}`, () => {
    const classified = classifyChannelFailure({ message })
    assert.equal(classified.kind, 'channel-unavailable')
    assert.equal(classified.code, 'CHANNEL_UNAVAILABLE')
    assert.equal(classified.message, SAFE_CHANNEL_MESSAGE)
    assert.equal(classified.hideFromPicker, true)
    assert.doesNotMatch(JSON.stringify(classified), forbidden)
  })
}

test('accepts structured, JSON, Error cause and cyclic envelopes without leaking diagnostics', () => {
  const coded = Object.assign(new Error('opaque error'), { code: 'get_channel_failed' })
  const cycle = { message: 'wrapper' }
  cycle.cause = cycle
  cycle.body = JSON.stringify({ data: [{ error: { code: 'get_channel_failed' } }] })
  for (const error of [coded, cycle, new Error('wrapper', { cause: new Error(raw) }), { error: { code: 'CHANNEL_UNAVAILABLE' } }]) {
    assert.equal(hasChannelEvidence(error), true)
    assert.equal(classifyChannelFailure(error).message, SAFE_CHANNEL_MESSAGE)
  }
  const noEvidence = {}
  noEvidence.cause = noEvidence
  assert.equal(classifyChannelFailure(noEvidence), null)
})

test('does not classify unrelated failures, status codes or user prompt content', () => {
  for (const error of [null, undefined, '', 503, { status: 503 }, { status: 429 }, new Error('network timeout'), new Error('quota exceeded'), new Error('Invalid token'), { code: 'ADAPTER_FAILED' }, { prompt: raw }, { message: 'model not found' }]) {
    assert.equal(classifyChannelFailure(error), null)
  }
})

test('group failover evidence covers permission and unknown-model wording a routing plan can outlive', () => {
  for (const message of ['无权访问该分组', 'model_not_found', 'Model not found', '无可用渠道']) {
    assert.equal(hasGroupFailoverEvidence({ message }), true, message)
    assert.equal(hasGroupFailoverEvidence({ error: { body: JSON.stringify({ error: { code: message } }) } }), true, message)
  }
  // Without these wordings the callers must not widen a plan (status codes stay evidence-free).
  for (const error of [null, undefined, '', { status: 503 }, { status: 429 }, new Error('Invalid token'), new Error('quota exceeded')]) {
    assert.equal(hasGroupFailoverEvidence(error), false)
  }
})

test('the narrow channel classifier is unaffected by group failover wording', () => {
  for (const message of ['无权访问该分组', 'model_not_found']) {
    assert.equal(hasChannelEvidence({ message }), false, message)
    assert.equal(classifyChannelFailure({ message }), null, message)
  }
})

test('unwrap returns a sanitized OmnimuxError with no raw cause or details', () => {
  const wrapped = Object.assign(new Error('Adapter openai-compatible failed'), {
    code: 'ADAPTER_FAILED', cause: Object.assign(new Error(raw), { status: 503 }),
  })
  for (const source of [wrapped, raw, new Error(raw), { error: { code: 'get_channel_failed' } }]) {
    const error = unwrapAdapterError(source)
    assert.ok(error instanceof OmnimuxError)
    assert.equal(error.code, 'CHANNEL_UNAVAILABLE')
    assert.equal(error.message, SAFE_CHANNEL_MESSAGE)
    assert.equal(error.cause, undefined)
    assert.doesNotMatch(JSON.stringify(error), forbidden)
    assert.doesNotMatch(inspect(error), forbidden)
    assert.equal(unwrapAdapterError(error).message, SAFE_CHANNEL_MESSAGE)
  }
})

test('unrelated errors retain their existing identity and adapter details', () => {
  const timeout = new Error('timeout')
  assert.equal(unwrapAdapterError(timeout), timeout)
  const adapter = Object.assign(new Error('Adapter failed'), { code: 'ADAPTER_FAILED', cause: timeout })
  assert.equal(unwrapAdapterError(adapter).code, 'ADAPTER_FAILED')
  assert.match(unwrapAdapterError(adapter).message, /timeout/)
})
