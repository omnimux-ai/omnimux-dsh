import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { assertPng, PROBE_ASSERTIONS, STAGE_ASSERTIONS } from './live-stage-probe.mjs'
import { assertRuntimeProofStable } from './live-runtime-proof.mjs'

const tabPlugin = target => String(target.tabId).split(':', 1)[0]
const RUNTIME_HASH_FIELDS = [
  'bundleSha256',
  'bundleRegistrationSha256',
  'bundleCodeSha256',
  'loadedScriptSha256',
  'loadedScriptCodeSha256',
  'loadedRegistrationSha256',
  'loadedRegistrationCodeSha256',
]
const RUNTIME_MATCHES = new Set(['raw-registration', 'normalized-registration'])

function validateRuntimeBundle(bundle) {
  for (const field of RUNTIME_HASH_FIELDS) {
    assert.match(bundle?.[field] || '', /^[a-f0-9]{64}$/, `Runtime proof has invalid ${field} for ${bundle?.plugin || 'unknown plugin'}`)
  }
  assert.ok(bundle.bundleCodeSha256 === bundle.loadedRegistrationCodeSha256, `Runtime proof registration code differs for ${bundle.plugin}`)
  assert.ok(RUNTIME_MATCHES.has(bundle.match), `Runtime proof has invalid match mode for ${bundle.plugin}`)
  assert.equal(bundle.matchingRegistrationCount, 1, `Runtime proof must have exactly one registration for ${bundle.plugin}`)
  if (bundle.match === 'raw-registration') {
    assert.ok(bundle.bundleRegistrationSha256 === bundle.loadedRegistrationSha256, `Runtime proof raw registration differs for ${bundle.plugin}`)
  }
}

export function validateLiveQaReport(report, request, expected = {}) {
  assert.ok(request?.runId && request.commitSha && request.url, 'Missing prepared request identity')
  assert.ok(Array.isArray(request.targets) && request.targets.length > 0, 'Prepared request has zero Stage targets')
  if (expected.root) {
    assert.equal(resolve(request.root), resolve(expected.root), 'Prepared request belongs to another worktree')
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: expected.root, encoding: 'utf8' }).trim()
    assert.equal(request.commitSha, head, 'Prepared request SHA is not the current worktree HEAD')
  }
  for (const key of ['runId', 'commitSha', 'stage', 'target']) if (expected[key]) assert.equal(request[key], expected[key], `Prepared request ${key} is not the current expected value`)
  assert.ok(request.consumedAt && Date.parse(request.consumedAt) >= Date.parse(request.createdAt) && Date.parse(request.consumedAt) < Date.parse(request.expiresAt), 'Prepared request was not consumed inside its validity window')
  assert.equal(report.tool, 'codex-iab', 'Wrong browser evidence tool')
  assert.equal(report.status, 'completed', 'Live QA did not complete')
  assert.equal(report.pass, true, 'Live QA did not pass')
  for (const key of ['runId', 'commitSha', 'target', 'profile', 'url', 'stage']) assert.deepEqual(report[key], request[key], `Report ${key} does not match prepared request`)
  assert.deepEqual(report.targets, request.targets, 'Report target set does not match prepared request')
  assert.ok(typeof report.tabId === 'string' && report.tabId.length > 0, 'Missing real IAB tab id')
  const actual = new URL(report.actualUrl); const expectedUrl = new URL(request.url)
  assert.equal(actual.origin, expectedUrl.origin, 'Reported IAB origin does not match request')
  assert.equal(actual.pathname, expectedUrl.pathname, 'Reported IAB path does not match request')
  assert.ok(!actual.username && !actual.password && !actual.search, 'Reported IAB URL contains credentials or query data')
  assertRuntimeProofStable(report.runtimeProof?.before, report.runtimeProof?.after)
  const expectedPlugins = new Set(['omnimux', ...request.targets.map(tabPlugin)])
  for (const proof of [report.runtimeProof.before, report.runtimeProof.after]) {
    assert.equal(proof.requestedOrigin, expected.origin || expectedUrl.origin, 'Runtime proof origin does not match request')
    assert.equal(proof.target, request.target, 'Runtime proof target does not match request')
    assert.deepEqual(proof.allocation, request.allocation || null, 'Runtime proof allocation does not match request')
    assert.ok(Array.isArray(proof?.bundles) && proof.bundles.length === expectedPlugins.size, 'Runtime proof has incomplete bundle coverage')
    assert.deepEqual(new Set(proof.bundles.map(bundle => bundle.plugin)), expectedPlugins, 'Runtime proof plugins do not match Stage targets')
    for (const bundle of proof.bundles) validateRuntimeBundle(bundle)
  }
  assert.equal(report.probe?.targets?.length, request.targets.length, 'Missing Stage coverage')
  assert.ok(report.probe.assertions.length && report.probe.assertions.every(item => item.pass), 'Stage assertions failed')
  const expectedShots = request.targets.map(target => join(request.evidenceDir, `${target.stage}.png`)).sort()
  assert.deepEqual([...report.screenshots].sort(), expectedShots, 'Report screenshot set does not match Stage targets')
  assert.deepEqual([...report.probe.screenshots].sort(), expectedShots, 'Probe screenshot set does not match Stage targets')
  for (const target of request.targets) {
    assert.ok(report.probe.targets.some(entry => entry.stage === target.stage && entry.tabId === target.tabId), `Missing coverage for ${target.stage}`)
    for (const suffix of STAGE_ASSERTIONS) assert.ok(report.probe.assertions.some(item => item.name === `${target.stage}:${suffix}` && item.pass), `Missing assertion ${target.stage}:${suffix}`)
  }
  for (const assertion of PROBE_ASSERTIONS) assert.ok(report.probe.assertions.some(item => item.name === assertion && item.pass), `Missing assertion ${assertion}`)
  for (const image of expectedShots) assertPng(readFileSync(image))
  assert.ok(report.completedAt && Date.parse(report.completedAt) >= Date.parse(request.consumedAt) && Date.parse(report.completedAt) < Date.parse(request.expiresAt), 'Report completed outside request validity window')
  return true
}
