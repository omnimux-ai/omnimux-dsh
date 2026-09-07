import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBrowserQa } from './auto-pipeline-qa.mjs'
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
  return { dir, request, report, options: { browserRequired: true, browserRunId: request.runId, browserStage: request.stage, browserTarget: request.target } }
}

test('split QA consumer accepts only the current ego request and matching task/tab receipts', () => {
  const { dir, report, options } = fixture()
  assert.equal(runBrowserQa(root, 702, 'omnimux-assets', options, dir).pass, true)
  for (const patch of [{ tool: 'codex-iab' }, { taskSpaceId: null }, { browserIdentity: {} }, { runId: 'old' }]) {
    writeFileSync(join(dir, 'live-qa-report.json'), JSON.stringify({ ...report, ...patch }))
    assert.throws(() => runBrowserQa(root, 702, 'omnimux-assets', options, dir), /BLOCKED.*不能伪造或回退到 IAB/)
  }
})

test('split QA consumer requires explicit pipeline run, stage and target expectations', () => {
  const { dir, options } = fixture()
  for (const key of ['browserRunId', 'browserStage', 'browserTarget']) {
    assert.throws(() => runBrowserQa(root, 702, 'omnimux-assets', { ...options, [key]: '' }, dir), /ego-browser evidence requires/)
  }
  assert.throws(() => runBrowserQa(root, 702, 'omnimux-assets', { ...options, browserRunId: 'other' }, dir), /ego-browser 验收/)
  assert.deepEqual(runBrowserQa(root, 702, 'omnimux-assets', { browserRequired: false }, dir), { required: false, pass: true })
})
