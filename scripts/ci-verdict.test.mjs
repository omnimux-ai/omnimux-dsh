import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateVerdict, applyVerdictLabel } from './ci-verdict.mjs'
import { deriveImpactMatrix } from './impact-matrix.mjs'
import { liveEvidence, tinyPng } from './test-fixtures/live-evidence.mjs'

const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'ci-verdict-'))
  roots.push(root)
  execFileSync('git', ['init', '-q'], { cwd: root })
  writeFileSync(join(root, 'README.md'), 'fixture\n')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=QA', '-c', 'user.email=qa@localhost', 'commit', '-qm', 'fixture'], { cwd: root })
  return root
}
const uiFiles = ['plugins/a/src/client/View.tsx']
const docsFiles = ['docs/guide.md']
const qa = files => ({ pass: true, summary: 'L0 passed', changedFiles: files })

test('requires impact context and rejects malformed or contradictory matrices', () => {
  assert.equal(evaluateVerdict({ pass: true }, null).pass, false)
  assert.equal(evaluateVerdict({ pass: true }, null, { requireBrowser: false }).pass, false)
  for (const impactMatrix of [{}, { dimensions: {} }, { ...deriveImpactMatrix([]), isUiChange: true }]) {
    assert.equal(evaluateVerdict(qa([]), null, { impactMatrix }).pass, false)
  }
  assert.equal(evaluateVerdict(qa(uiFiles), null, { impactMatrix: deriveImpactMatrix(docsFiles) }).pass, false)
  assert.equal(evaluateVerdict({ pass: true }, null, { impactMatrix: deriveImpactMatrix(docsFiles) }).pass, true)
})

test('non-UI and empty changes explicitly mark IAB not applicable, even with stale evidence', () => {
  for (const files of [[], docsFiles, ['scripts/server.mjs', 'docs/contracts/plugin-qa.md']]) {
    const verdict = evaluateVerdict(qa(files), { pass: false, tool: 'stale' })
    assert.equal(verdict.pass, true)
    assert.equal(verdict.dimensions.iab.pass, true)
    assert.equal(verdict.dimensions.iab.status, 'not-applicable')
    assert.match(verdict.summary, /无客户端\/UI文件变更/)
  }
})

test('UI and mixed changes require IAB; requireBrowser:false cannot downgrade the matrix', () => {
  for (const files of [uiFiles, [...uiFiles, ...docsFiles], ['theme.scss']]) {
    const verdict = evaluateVerdict(qa(files), null, { requireBrowser: false })
    assert.equal(verdict.pass, false)
    assert.match(verdict.errors.join(';'), /缺少 Codex IAB/)
    assert.equal(verdict.dimensions.iab.required, true)
  }
})

test('missing, false or truthy non-boolean L0 reports and prior CI failure are rejected', () => {
  for (const report of [null, { pass: false }, { pass: 'true' }]) {
    assert.equal(evaluateVerdict(report, null, { changedFiles: docsFiles }).pass, false)
  }
  assert.equal(evaluateVerdict(qa(docsFiles), null, { ciStatus: 'failure' }).pass, false)
})

test('current valid IAB receipts pass and stale identity, invalid proof and expired windows fail', () => {
  const root = sandbox()
  const { request, report } = liveEvidence(root, root)
  writeFileSync(join(root, 'assets.png'), tinyPng())
  const options = { browserRequest: request, browserRoot: root, browserRunId: request.runId, browserStage: request.stage, browserTarget: request.target }
  assert.equal(evaluateVerdict(qa(uiFiles), report, options).pass, true)
  for (const mutation of [
    { pass: false }, { tool: 'ego-browser' }, { status: 'pending' }, { commitSha: 'stale' },
    { runId: 'old' }, { target: null }, { stage: 'other' }, { actualUrl: 'http://127.0.0.1:44202/' },
    { completedAt: '2000-01-01T00:00:00Z' }, { runtimeProof: {} }, { screenshots: [] },
  ]) {
    const verdict = evaluateVerdict(qa(uiFiles), { ...report, ...mutation }, options)
    assert.equal(verdict.pass, false, JSON.stringify(mutation))
    assert.match(verdict.errors.join(';'), /证据无效/)
  }
  const oldRequest = { ...request, commitSha: '0'.repeat(40) }
  assert.equal(evaluateVerdict(qa(uiFiles), { ...report, commitSha: oldRequest.commitSha }, { ...options, browserRequest: oldRequest }).pass, false)
  for (const browserRequest of [null, { ...request, consumedAt: null }, { ...request, expiresAt: request.createdAt }]) {
    assert.equal(evaluateVerdict(qa(uiFiles), report, { ...options, browserRequest }).pass, false)
  }
  assert.equal(evaluateVerdict(qa(uiFiles), report, { ...options, browserRunId: '' }).pass, false)
})

test('legacy label API delegates removal and conditional addition', () => {
  for (const pass of [true, false]) {
    const calls = []
    const result = applyVerdictLabel(605, pass, false, { repo: 'owner/repo', execCommand: (_cmd, args) => { calls.push(args.at(-2)); return { status: 0 } } })
    assert.equal(result.ok, true)
    assert.deepEqual(calls, pass ? ['--remove-label', '--add-label'] : ['--remove-label'])
  }
})

test('CLI derives impact from explicit files or strict git diff and clears failure labels', () => {
  const root = sandbox()
  const script = fileURLToPath(new URL('./ci-verdict.mjs', import.meta.url))
  writeFileSync(join(root, 'qa.json'), JSON.stringify({ pass: true }))
  writeFileSync(join(root, 'gh'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$LABEL_LOG"\n')
  chmodSync(join(root, 'gh'), 0o755)
  const log = join(root, 'labels.log')
  const env = { ...process.env, PATH: `${root}:${process.env.PATH}`, LABEL_LOG: log, GITHUB_REPOSITORY: 'owner/repo' }
  const run = args => spawnSync(process.execPath, [script, '--report', 'qa.json', '--pr', '605', '--json', ...args], { cwd: root, env, encoding: 'utf8' })
  const passed = run(['--changed-files', 'docs/guide.md'])
  assert.equal(passed.status, 0, passed.stderr)
  assert.match(readFileSync(log, 'utf8'), /--remove-label qa:pass\n.*--add-label qa:pass/)
  for (const args of [[], ['--changed-files', 'x.tsx'], ['--files-from-git', '--base', 'missing-ref'], ['--unknown']]) {
    writeFileSync(log, '')
    const failed = run(args)
    assert.equal(failed.status, 1)
    assert.match(readFileSync(log, 'utf8'), /--remove-label qa:pass/)
    assert.doesNotMatch(readFileSync(log, 'utf8'), /--add-label/)
  }
  writeFileSync(join(root, 'x.tsx'), 'export default null\n')
  const ui = run(['--files-from-git', '--base', 'HEAD'])
  assert.equal(ui.status, 1)
  assert.equal(JSON.parse(ui.stdout).impactMatrix.isUiChange, true)
  assert.equal(existsSync(join(root, 'docs/evidence')), false)
})

test('CLI accepts a SHA-bound IAB receipt and rejects a changed expected run', () => {
  const root = sandbox()
  const { request, report } = liveEvidence(root, root)
  writeFileSync(join(root, 'qa.json'), JSON.stringify(qa(uiFiles)))
  writeFileSync(join(root, 'live-qa-report.json'), JSON.stringify(report))
  writeFileSync(join(root, 'codex-browser-qa-request.json'), JSON.stringify(request))
  writeFileSync(join(root, 'assets.png'), tinyPng())
  const script = fileURLToPath(new URL('./ci-verdict.mjs', import.meta.url))
  const run = runId => spawnSync(process.execPath, [script, '--report', 'qa.json', '--browser-report', 'live-qa-report.json',
    '--browser-root', root, '--browser-stage', 'assets', '--browser-target', 'l2', '--browser-run-id', runId, '--dry-run', '--json'],
  { cwd: root, encoding: 'utf8' })
  const valid = run(request.runId)
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).dimensions.iab.status, 'passed')
  assert.equal(run('different-run').status, 1)
})

test('workflow passes event-specific diff context and always evaluates failures', () => {
  const workflow = readFileSync(new URL('../.github/workflows/quality-gate.yml', import.meta.url), 'utf8')
  assert.match(workflow, /QA_BASE:.*pull_request\.base\.sha.*merge_group\.base_sha/)
  assert.match(workflow, /Evaluate CI verdict\n\s+if:.*always\(\)/)
  assert.match(workflow, /--files-from-git --base "\$QA_BASE"/)
  assert.match(workflow, /--ci-status "\$CI_STATUS"/)
  assert.match(workflow, /syncQaPassLabel\(\{ prNumber: process\.env\.PR_NUMBER, pass: false \}\)/)
})
