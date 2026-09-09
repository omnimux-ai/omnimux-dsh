import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateVerdict, applyVerdictLabel } from './ci-verdict.mjs'
import { deriveImpactMatrix } from './impact-matrix.mjs'

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
const script = fileURLToPath(new URL('./ci-verdict.mjs', import.meta.url))

test('requires impact context and rejects malformed, pre-merge browser or contradictory matrices', () => {
  assert.equal(evaluateVerdict({ pass: true }).pass, false)
  const legacy = deriveImpactMatrix([])
  legacy.dimensions.browser.phase = 'pre-merge'
  for (const impactMatrix of [{}, { dimensions: {} }, legacy, { ...deriveImpactMatrix([]), isUiChange: true }]) {
    assert.equal(evaluateVerdict(qa([]), { impactMatrix }).pass, false)
  }
  assert.equal(evaluateVerdict(qa(uiFiles), { impactMatrix: deriveImpactMatrix(docsFiles) }).pass, false)
  assert.equal(evaluateVerdict(qa(['plugins/a/src/server.js']), { impactMatrix: deriveImpactMatrix(docsFiles) }).pass, false)
  assert.equal(evaluateVerdict({ pass: true }, { impactMatrix: deriveImpactMatrix(docsFiles) }).pass, true)
})

test('non-UI changes mark browser not applicable rather than passed', () => {
  for (const files of [[], docsFiles, ['scripts/server.mjs', 'docs/contracts/plugin-qa.md']]) {
    const verdict = evaluateVerdict(qa(files))
    assert.equal(verdict.pass, true)
    assert.equal(verdict.scope, 'pre-merge-static-tests')
    assert.equal(verdict.dimensions.browser.pass, null)
    assert.equal(verdict.dimensions.browser.status, 'not-applicable')
    assert.equal(verdict.dimensions.dev.status, 'not-applicable')
    assert.match(verdict.summary, /无客户端\/UI文件变更/)
  }
})

test('UI static CI passes while Dev and browser remain post-merge pending, not accepted', () => {
  for (const files of [uiFiles, [...uiFiles, ...docsFiles], ['theme.scss']]) {
    const verdict = evaluateVerdict(qa(files))
    assert.equal(verdict.pass, true)
    assert.equal(verdict.dimensions.l0.status, 'passed')
    for (const name of ['dev', 'browser']) {
      assert.equal(verdict.dimensions[name].pass, null)
      assert.equal(verdict.dimensions[name].status, 'pending')
      assert.equal(verdict.dimensions[name].phase, 'post-merge')
      assert.equal(verdict.dimensions[name].target, 'dev')
    }
    assert.doesNotMatch(verdict.summary, /ego-browser 通过/)
  }
})

test('Host runtime changes need Dev after merge without inventing browser requirements', () => {
  const verdict = evaluateVerdict(qa(['plugins/a/src/service.js']))
  assert.equal(verdict.pass, true)
  assert.equal(verdict.dimensions.dev.status, 'pending')
  assert.equal(verdict.dimensions.browser.status, 'not-applicable')
})

test('missing, false or truthy non-boolean L0 reports and prior CI failure are rejected', () => {
  for (const report of [null, { pass: false }, { pass: 'true' }]) {
    assert.equal(evaluateVerdict(report, { changedFiles: docsFiles }).pass, false)
  }
  for (const ciStatus of ['failure', 'cancelled', 'skipped', 'pending']) {
    assert.equal(evaluateVerdict(qa(uiFiles), { ciStatus }).pass, false)
  }
})

test('environment cannot turn pending Dev into a browser pass or waive static failure', () => {
  const root = sandbox()
  for (const pass of [true, false]) {
    writeFileSync(join(root, 'qa.json'), JSON.stringify({ ...qa(uiFiles), pass }))
    const run = extraEnv => spawnSync(process.execPath, [script, '--report', 'qa.json', '--ci-status', 'success', '--dry-run', '--json'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, ...extraEnv },
    })
    const normal = run({ GITHUB_ACTIONS: '', GITHUB_RUN_ID: '', OMNIMUX_ALLOW_L0_UI_PASS: '' })
    const hosted = run({ GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '123', OMNIMUX_ALLOW_L0_UI_PASS: '1', OMNIMUX_BROWSER_TARGET: 'l2' })
    assert.equal(hosted.status, pass ? 0 : 1)
    assert.deepEqual(JSON.parse(hosted.stdout), JSON.parse(normal.stdout))
    assert.equal(JSON.parse(hosted.stdout).dimensions.browser.status, 'pending')
  }
})

test('obsolete browser and fallback CLI arguments fail and remove old qa:pass', () => {
  const root = sandbox()
  const log = join(root, 'labels.log')
  writeFileSync(join(root, 'qa.json'), JSON.stringify(qa(uiFiles)))
  writeFileSync(join(root, 'gh'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$LABEL_LOG"\n')
  chmodSync(join(root, 'gh'), 0o755)
  for (const args of [['--allow-l0-fallback'], ['--require-browser'], ['--browser-report', 'report.json'], ['--browser-target', 'l2']]) {
    writeFileSync(log, '')
    const result = spawnSync(process.execPath, [script, '--report', 'qa.json', '--pr', '605', '--json', ...args], {
      cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${root}:${process.env.PATH}`, LABEL_LOG: log, GITHUB_REPOSITORY: 'owner/repo' },
    })
    assert.equal(result.status, 1, result.stdout)
    assert.match(readFileSync(log, 'utf8'), /--remove-label qa:pass/)
    assert.doesNotMatch(readFileSync(log, 'utf8'), /--add-label/)
    assert.match(result.stdout, /未知或缺值参数/)
  }
})

test('label API delegates removal and conditional addition', () => {
  for (const pass of [true, false]) {
    const calls = []
    const result = applyVerdictLabel(605, pass, false, { repo: 'owner/repo', execCommand: (_cmd, args) => { calls.push(args.at(-2)); return { status: 0 } } })
    assert.equal(result.ok, true)
    assert.deepEqual(calls, pass ? ['--remove-label', '--add-label'] : ['--remove-label'])
  }
})

test('CLI derives impact from explicit files or strict git diff and clears failure labels', () => {
  const root = sandbox()
  writeFileSync(join(root, 'qa.json'), JSON.stringify({ pass: true }))
  writeFileSync(join(root, 'gh'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$LABEL_LOG"\n')
  chmodSync(join(root, 'gh'), 0o755)
  const log = join(root, 'labels.log')
  const env = { ...process.env, PATH: `${root}:${process.env.PATH}`, LABEL_LOG: log, GITHUB_REPOSITORY: 'owner/repo' }
  const run = args => spawnSync(process.execPath, [script, '--report', 'qa.json', '--pr', '605', '--json', ...args], { cwd: root, env, encoding: 'utf8' })
  const passed = run(['--changed-files', 'docs/guide.md'])
  assert.equal(passed.status, 0, passed.stderr)
  assert.match(readFileSync(log, 'utf8'), /--remove-label qa:pass\n.*--add-label qa:pass/)
  for (const args of [[], ['--files-from-git', '--base', 'missing-ref'], ['--unknown']]) {
    writeFileSync(log, '')
    const failed = run(args)
    assert.equal(failed.status, 1)
    assert.match(readFileSync(log, 'utf8'), /--remove-label qa:pass/)
    assert.doesNotMatch(readFileSync(log, 'utf8'), /--add-label/)
  }
  writeFileSync(join(root, 'x.tsx'), 'export default null\n')
  const ui = run(['--files-from-git', '--base', 'HEAD'])
  assert.equal(ui.status, 0, ui.stderr)
  assert.equal(JSON.parse(ui.stdout).impactMatrix.isUiChange, true)
  assert.equal(JSON.parse(ui.stdout).dimensions.browser.status, 'pending')
  assert.equal(existsSync(join(root, 'docs/evidence')), false)
})

test('workflow passes event-specific diff context and always evaluates failures', () => {
  const workflow = readFileSync(new URL('../.github/workflows/quality-gate.yml', import.meta.url), 'utf8')
  assert.match(workflow, /QA_BASE:.*pull_request\.base\.sha.*merge_group\.base_sha/)
  assert.match(workflow, /Evaluate CI verdict\n\s+if:.*always\(\)/)
  assert.match(workflow, /--files-from-git --base "\$QA_BASE"/)
  assert.match(workflow, /--ci-status "\$CI_STATUS"/)
  assert.doesNotMatch(workflow, /OMNIMUX_ALLOW_L0_UI_PASS|--allow-l0-fallback|--require-browser|--browser-report/)
  assert.match(workflow, /syncQaPassLabel\(\{ prNumber: process\.env\.PR_NUMBER, pass: false \}\)/)
})
