import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveImpactMatrix, requiresBrowser } from './impact-matrix.mjs'

const script = fileURLToPath(new URL('./impact-matrix.mjs', import.meta.url))

describe('impact matrix', () => {
  for (const file of [
    'plugins/a/client/index.js', 'plugins/a/src/client/View.js', 'apps/desktop/main.js',
    'web/index.js', 'plugins/a/Stage.js', 'Stage.ts', 'view.jsx', 'view.tsx', 'view.vue',
    'view.svelte', 'view.html', 'theme.css', 'theme.scss', 'plugins\\a\\client\\View.js',
  ]) it(`requires IAB for ${file}`, () => {
    const matrix = deriveImpactMatrix([file])
    assert.equal(matrix.isUiChange, true)
    assert.equal(matrix.dimensions.iab.required, true)
    assert.equal(matrix.dimensions.l0.required, true)
    assert.equal(requiresBrowser([file]), true)
  })

  for (const files of [
    [], ['docs/guide.md'], ['scripts/server.mjs', 'docs/contracts/plugin-qa.md'],
    ['plugins/a/src/service.js', '.github/workflows/quality-gate.yml'],
    ['contracts/api.json', 'package.json', 'clients/readme.md', 'website/backend.js'],
  ]) it(`marks non-UI changes not applicable: ${JSON.stringify(files)}`, () => {
    const matrix = deriveImpactMatrix(files)
    assert.equal(matrix.isUiChange, false)
    assert.equal(matrix.dimensions.iab.required, false)
    assert.match(matrix.dimensions.iab.reason, /无客户端\/UI文件变更/)
    assert.match(matrix.summary, /not-applicable/)
    assert.equal(matrix.dimensions.l0.required, true)
  })

  it('is deterministic and does not mutate frozen input', () => {
    const files = Object.freeze(['docs/guide.md', 'plugins/a/client/index.js'])
    assert.deepEqual(deriveImpactMatrix(files), deriveImpactMatrix([...files]))
    assert.equal(deriveImpactMatrix(files).isUiChange, true)
    assert.equal(deriveImpactMatrix().isUiChange, false)
    for (const bad of [null, 'x.js', [null], ['']]) assert.throws(() => deriveImpactMatrix(bad), TypeError)
  })

  it('CLI prints JSON and strictly rejects unresolved git bases in an isolated cwd', () => {
    const root = mkdtempSync(join(tmpdir(), 'impact-matrix-'))
    try {
      const run = args => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' })
      const explicit = run(['--files', 'docs/guide.md,view.css'])
      assert.equal(explicit.status, 0, explicit.stderr)
      assert.equal(JSON.parse(explicit.stdout).isUiChange, true)
      execFileSync('git', ['init', '-q'], { cwd: root })
      writeFileSync(join(root, 'README.md'), 'fixture\n')
      execFileSync('git', ['add', '.'], { cwd: root })
      execFileSync('git', ['-c', 'user.name=QA', '-c', 'user.email=qa@localhost', 'commit', '-qm', 'fixture'], { cwd: root })
      writeFileSync(join(root, 'view.vue'), '<template />\n')
      const diff = run(['--git-diff', '--base', 'HEAD'])
      assert.equal(diff.status, 0, diff.stderr)
      assert.equal(JSON.parse(diff.stdout).isUiChange, true)
      assert.equal(run(['--git-diff', '--base', 'missing-ref']).status, 1)
      assert.equal(run(['--git-diff', '--files', 'x.js']).status, 1)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
