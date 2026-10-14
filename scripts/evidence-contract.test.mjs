import test from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
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

test('public small-repository evidence binds raw bytes, candidate and failed execution outcomes', () => {
  if (!process.env.EVIDENCE_FIXTURE_REPO || !process.env.EVIDENCE_FIXTURE_ROOT || !process.env.EVIDENCE_FIXTURE_SHA) {
    throw Object.assign(new Error('EVIDENCE_FIXTURE_ENV_REQUIRED'), { code: 'EVIDENCE_FIXTURE_ENV_REQUIRED' })
  }
  const fixtureRepo = realpathSync(process.env.EVIDENCE_FIXTURE_REPO)
  const fixtureRoot = realpathSync(process.env.EVIDENCE_FIXTURE_ROOT)
  const sha = process.env.EVIDENCE_FIXTURE_SHA
  assert.equal(fixtureRepo, process.env.EVIDENCE_FIXTURE_REPO)
  assert.equal(fixtureRoot, process.env.EVIDENCE_FIXTURE_ROOT)
  const taskId = 'core-' + randomUUID()
  for (const scenario of [
    { name: 'passed', tests: 1, skipped: 0, cleanupFailed: false, pass: true },
    { name: 'zero-tests', tests: 0, skipped: 0, cleanupFailed: false, pass: false },
    { name: 'skipped-tests', tests: 1, skipped: 1, cleanupFailed: false, pass: false },
    { name: 'cleanup-failed', tests: 1, skipped: 0, cleanupFailed: true, pass: false },
  ]) {
    const runId = randomUUID()
    const prefix = `.workbuddy/evidence/contract/${taskId}/${runId}/`
    const rawPath = prefix + 'raw-run.json'
    const reportPath = prefix + 'evidence.json'
    const options = { root: fixtureRoot, base: sha, head: sha, taskId, runId, outputs: [rawPath, reportPath] }
    const before = captureCandidate(options)
    assert.equal(before.repo.realRoot, fixtureRoot)
    assert.equal(before.base.resolvedSha, sha)
    assert.equal(before.head.resolvedSha, sha)
    assert.deepEqual(before.candidate.entries.map(item => item.path), ['.gitignore', 'source.txt'])
    assert.deepEqual(before.exclusions.outputPaths, [reportPath, rawPath])
    const checks = [{ name: 'fixture-check', scope: 'smoke', required: true, status: 'completed', reason: null,
      exitCode: 0, tests: scenario.tests, skipped: scenario.skipped, assertions: [{ name: 'fixture-source-present', pass: true }] }]
    const cleanup = [{ name: 'fixture-output', owner: 'fixture-check',
      status: scenario.cleanupFailed ? 'failed' : 'not-applicable', reason: scenario.cleanupFailed ? 'owned-cleanup-failed' : 'not-created' }]
    mkdirSync(fixtureRoot + '/' + prefix, { recursive: true })
    writeFileSync(fixtureRoot + '/' + rawPath, JSON.stringify({ checks, cleanup }) + '\n', { flag: 'wx' })
    const after = captureCandidate(options)
    assert.deepEqual(after, before)
    const input = { taskId, runId, producer: 'dependency-stub', scope: 'smoke', candidateBefore: before,
      candidateAfter: after, checks, cleanup, artifactPaths: [rawPath], reportPath }
    const envelope = sealEvidence(input)
    writeFileSync(fixtureRoot + '/' + reportPath, JSON.stringify(envelope) + '\n', { flag: 'wx' })
    const retained = JSON.parse(readFileSync(fixtureRoot + '/' + reportPath, 'utf8'))
    const expected = { purpose: 'candidate', root: fixtureRoot, taskId, runId, scope: 'smoke',
      requiredChecks: ['fixture-check'], expectedAssertions: { 'fixture-check': ['fixture-source-present'] }, currentCandidate: after }
    const validation = validateEvidence(retained, expected)
    assert.equal(validation.valid, true, scenario.name)
    assert.equal(validation.applicable, true)
    assert.equal(validation.pass, scenario.pass)
    assert.equal(validation.scope, 'smoke')
    assert.equal(validation.authorization, 'not-granted')
    assert.equal(validation.provenance, 'self-reported')
    assert.deepEqual(validation.errors, [])
    assert.deepEqual(retained.cleanup, cleanup)
    assert.deepEqual(retained.artifacts.map(item => item.path), [rawPath])
    if (scenario.pass) {
      const history = validateEvidence(retained, Object.assign({}, expected, { purpose: 'history', currentCandidate: undefined }))
      assert.equal(history.valid, true)
      assert.equal(history.pass, true)
      for (const purpose of ['current-runtime', 'pre-e2e']) {
        const unsupported = validateEvidence(retained, Object.assign({}, expected, { purpose }))
        assert.equal(unsupported.valid, false)
        assert.equal(unsupported.pass, false)
        assert.equal(unsupported.authorization, 'not-granted')
        assert.deepEqual(unsupported.errors, ['PURPOSE_UNSUPPORTED'])
      }
      const changedSnapshot = structuredClone(after)
      changedSnapshot.candidate.entries[0].bytes += 1
      rejected(() => sealEvidence(Object.assign({}, input, { candidateAfter: changedSnapshot })), 'INVALID_SNAPSHOT')
      rejected(() => captureCandidate(Object.assign({}, options, { outputs: [rawPath, reportPath, 'source.txt'] })), 'OUTPUT_EXCLUSION_DENIED')
      appendFileSync(fixtureRoot + '/' + rawPath, 'changed-bytes\n')
      const changedArtifact = validateEvidence(retained, expected)
      assert.equal(changedArtifact.valid, false)
      assert.equal(changedArtifact.pass, false)
      assert.equal(changedArtifact.authorization, 'not-granted')
      assert.deepEqual(changedArtifact.errors, ['ARTIFACT_CHANGED'])
    }
  }
})
