import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBrowserQa, runStaticQa } from './auto-pipeline-qa.mjs'
import { parseArgs, runGate } from './auto-qa-gate.mjs'
import { liveEvidence, tinyPng } from './test-fixtures/live-evidence.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const dirs = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-ego-'))
  dirs.push(dir)
  const { request, report } = liveEvidence(root, dir)
  writeFileSync(join(dir, 'assets.png'), tinyPng())
  writeFileSync(join(dir, 'ego-browser-qa-request.json'), JSON.stringify(request))
  writeFileSync(join(dir, 'live-qa-report.json'), JSON.stringify(report))
  return { dir, request, report, expected: { runId: request.runId, stage: request.stage } }
}

test('post-merge Dev consumer accepts only the current ego request and matching task/tab receipts', () => {
  const { dir, report, expected } = fixture()
  const result = runBrowserQa(root, expected, dir)
  assert.equal(result.pass, true)
  assert.equal(result.phase, 'post-merge')
  assert.equal(result.target, 'dev')
  for (const patch of [{ tool: 'codex-iab' }, { taskSpaceId: null }, { browserIdentity: {} }, { runId: 'old' }, { target: 'l2' }, { profile: 'other-profile' }]) {
    writeFileSync(join(dir, 'live-qa-report.json'), JSON.stringify({ ...report, ...patch }))
    assert.throws(() => runBrowserQa(root, expected, dir), /BLOCKED.*不能伪造或回退到 IAB/)
  }
})

test('post-merge browser consumer requires current run/stage and never accepts missing evidence or dry-run', () => {
  const { dir, expected } = fixture()
  for (const key of ['runId', 'stage']) {
    assert.throws(() => runBrowserQa(root, { ...expected, [key]: '' }, dir), /Dev.*ego-browser/)
  }
  assert.throws(() => runBrowserQa(root, { ...expected, runId: 'other' }, dir), /ego-browser 验收/)
  assert.throws(() => runBrowserQa(root, { ...expected, dryRun: true }), /ego-browser 验收/)
})

test('stale, expired, malformed and incomplete Dev evidence fails at the browser acceptance layer', () => {
  const { dir, report, request, expected } = fixture()
  for (const patch of [{ pass: false }, { status: 'pending' }, { commitSha: 'stale' }, { stage: 'other' },
    { actualUrl: 'http://127.0.0.1:45121/' }, { completedAt: '2000-01-01T00:00:00Z' }, { runtimeProof: {} }, { screenshots: [] }]) {
    writeFileSync(join(dir, 'live-qa-report.json'), JSON.stringify({ ...report, ...patch }))
    assert.throws(() => runBrowserQa(root, expected, dir), /Dev.*ego-browser/)
  }
  for (const loadedScriptUrl of ['https://example.com/plugins/all.js', 'http://127.0.0.1:45121/plugins/all.js', '/not-a-plugin.js', 'http://secret@127.0.0.1:45120/plugins/all.js']) {
    const tampered = structuredClone(report)
    for (const proof of Object.values(tampered.runtimeProof)) proof.bundles[0].loadedScriptUrl = loadedScriptUrl
    writeFileSync(join(dir, 'live-qa-report.json'), JSON.stringify(tampered))
    assert.throws(() => runBrowserQa(root, expected, dir), /Dev.*ego-browser/)
  }
  writeFileSync(join(dir, 'live-qa-report.json'), JSON.stringify(report))
  for (const patch of [{ root: dir }, { commitSha: '0'.repeat(40) }, { consumedAt: null }, { expiresAt: request.createdAt }]) {
    writeFileSync(join(dir, 'ego-browser-qa-request.json'), JSON.stringify({ ...request, ...patch }))
    assert.throws(() => runBrowserQa(root, expected, dir), /Dev.*ego-browser/)
  }
})

test('explicit Dev evidence CLI fails when evidence is missing, while static-only scanning stays separate', () => {
  const { dir, expected } = fixture()
  const staticOnly = runGate(parseArgs([dir, '--json']))
  assert.equal(staticOnly.pass, true)
  assert.equal(staticOnly.browser.pass, null)
  assert.equal(staticOnly.browser.status, 'not-requested')
  const options = parseArgs([dir, '--require-browser', '--browser-root', root, '--browser-run-id', expected.runId, '--browser-stage', expected.stage])
  const missing = runGate(options)
  assert.equal(missing.pass, false)
  assert.equal(missing.browser.status, 'failed')
  const valid = runGate({ ...options, evidenceDir: dir })
  assert.equal(valid.pass, true)
  assert.equal(valid.browser.phase, 'post-merge')
  assert.equal(valid.browser.target, 'dev')
  assert.equal(valid.browser.status, 'passed')
  for (const option of ['--l2-url', '--browser-target']) assert.throws(() => parseArgs([dir, option, 'value']), /未知或缺值参数/)
})

test('static QA does not ask for browser evidence and dry-run never claims a pass', () => {
  const { dir } = fixture()
  const result = runStaticQa(root, 'common', 'HEAD', { dryRun: true }, dir)
  assert.equal(result.pass, null)
  assert.equal(result.status, 'simulated')
  assert.equal(Object.hasOwn(result, 'browserRequired'), false)
})
