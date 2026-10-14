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
