import test from 'node:test'
import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { captureCandidate, sealEvidence, validateEvidence } from './evidence-contract.mjs'

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)))

function rejected(action, code) {
  assert.throws(action, { code, message: code })
}

function captureRequest(options) {
  return Object.assign({ root, base: 'HEAD', head: 'HEAD', taskId: 'task', runId: 'run' }, options)
}

function sealRequest(options) {
  return Object.assign({ taskId: 'task', runId: 'run', producer: 'controlled-runner', scope: 'task' }, options)
}

test('candidate capture requires an explicit repository and references', () => {
  assert.throws(() => captureCandidate({}), /EXPLICIT_ROOT_REQUIRED/)
  assert.throws(() => captureCandidate({ root: 'relative', base: 'HEAD', head: 'HEAD' }), /EXPLICIT_ROOT_REQUIRED/)
})

test('candidate capture rejects null and missing references with classified public reasons', () => {
  rejected(() => captureCandidate(null), 'INVALID_SHAPE')
  rejected(() => captureCandidate(captureRequest({ base: undefined })), 'EXPLICIT_REF_REQUIRED')
  rejected(() => captureCandidate(captureRequest({ head: undefined })), 'EXPLICIT_REF_REQUIRED')
  rejected(() => captureCandidate(captureRequest({ base: '-unsafe' })), 'EXPLICIT_REF_REQUIRED')
})

test('sealing rejects malformed identities before accepting a candidate', () => {
  rejected(() => sealEvidence(sealRequest({ taskId: '../escape' })), 'INVALID_RUN_ID')
  rejected(() => sealEvidence(sealRequest({ runId: ' ' })), 'INVALID_RUN_ID')
  rejected(() => sealEvidence(sealRequest({ producer: 'trusted' })), 'INVALID_SCOPE_OR_PRODUCER')
  rejected(() => sealEvidence(sealRequest({ scope: 'current-runtime' })), 'INVALID_SCOPE_OR_PRODUCER')
})

test('null evidence never grants runtime or pre-e2e authority', () => {
  const runtime = validateEvidence(null, { purpose: 'current-runtime' })
  const preflight = validateEvidence(null, { purpose: 'pre-e2e' })
  for (const result of [runtime, preflight]) {
    assert.equal(result.valid, false)
    assert.equal(result.applicable, false)
    assert.equal(result.pass, false)
    assert.equal(result.authorization, 'not-granted')
    assert.equal(result.provenance, 'unknown')
    assert.deepEqual(result.errors, ['INVALID_SHAPE'])
  }
})

test('sealing a null request rejects with a stable public reason', () => {
  assert.throws(() => sealEvidence(null), { code: 'INVALID_SHAPE' })
})

test('malformed evidence never grants permissions or claims a passing result', () => {
  const rejected = validateEvidence({}, {})
  assert.equal(rejected.valid, false)
  assert.equal(rejected.pass, false)
  assert.equal(rejected.authorization, 'not-granted')
  assert.equal(rejected.provenance, 'unknown')
})
