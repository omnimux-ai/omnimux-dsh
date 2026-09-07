import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyQuotaFailure, hasQuotaEvidence } from './quota-classifier.js'

test('classifies quota evidence and preserves auth priority', () => {
  assert.equal(classifyQuotaFailure({ status: 402 }).kind, 'quota-exceeded')
  assert.equal(classifyQuotaFailure({ status: 403, body: { error: { code: 'insufficient_user_quota' } } }).kind, 'quota-exceeded')
  assert.equal(classifyQuotaFailure({ status: 401, message: 'quota exceeded' }).kind, 'needs-omnimux')
  assert.equal(classifyQuotaFailure({ status: 403 }).kind, 'other')
  assert.equal(classifyQuotaFailure({ status: 429 }).kind, 'other')
  assert.equal(hasQuotaEvidence({ cause: new Error('预扣费额度失败') }), true)
  assert.equal(hasQuotaEvidence({ code: 'QUOTA' }), true)
})

test('never exposes secret-bearing text', () => {
  const result = classifyQuotaFailure({ status: 402, message: 'sk-secret token prompt quota exceeded' })
  assert.equal(result.message, '当前操作需要更多额度，充值后即可继续使用 OmniMux。')
  assert.equal(result.message.includes('sk-'), false)
})

test('channel failures are sanitized while explicit auth and quota retain priority', () => {
  const message = '分组 auto 下模型 grok 无可用渠道 (distributor) (request id: secret)'
  const classified = classifyQuotaFailure({ status: 503, body: { error: { message } } })
  assert.equal(classified.kind, 'channel-unavailable')
  assert.equal(classified.code, 'CHANNEL_UNAVAILABLE')
  assert.equal(classified.message, '该模型当前不可用，请换一个试试')
  assert.doesNotMatch(JSON.stringify(classified), /distributor|request id|分组 auto|secret/)
  assert.equal(classifyQuotaFailure({ status: 401, message }).kind, 'needs-omnimux')
  assert.equal(classifyQuotaFailure({ status: 402, message }).kind, 'quota-exceeded')
  assert.equal(classifyQuotaFailure({ message, code: 'quota-exceeded' }).kind, 'quota-exceeded')
  assert.equal(classifyQuotaFailure({ error: new Error('Adapter failed', { cause: Object.assign(new Error(message), { status: 401 }) }) }).kind, 'needs-omnimux')
  assert.equal(classifyQuotaFailure({ error: Object.assign(new Error(message), { code: 'needs-omnimux' }) }).kind, 'needs-omnimux')
})

test('requires explicit quota evidence', () => {
  assert.equal(classifyQuotaFailure({ reason: 'quota-exceeded' }).kind, 'other')
  assert.equal(classifyQuotaFailure({ data: { code: 'insufficient_user_quota' } }).kind, 'quota-exceeded')
  assert.equal(classifyQuotaFailure({ status: 403, message: '预扣费额度失败' }).kind, 'quota-exceeded')
  assert.equal(classifyQuotaFailure({ code: 'QUOTA_PER_USD' }).kind, 'other')
  assert.equal(classifyQuotaFailure({ status: 403, message: 'quota' }).kind, 'other')
  assert.equal(hasQuotaEvidence({ code: 'ADAPTER_FAILED', cause: new Error('预扣费额度失败') }), true)
})
