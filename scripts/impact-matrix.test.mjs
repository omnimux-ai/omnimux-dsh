import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveImpactMatrix, requiresBrowser, requiresDev, postMergeAcceptance } from './impact-matrix.mjs'

const script = fileURLToPath(new URL('./impact-matrix.mjs', import.meta.url))

describe('impact matrix', () => {
  for (const file of [
    'plugins/a/client/index.js', 'plugins/a/src/client/View.js', 'apps/desktop/main.js',
    'web/index.js', 'plugins/a/Stage.js', 'Stage.ts', 'view.jsx', 'view.tsx', 'view.vue',
    'view.svelte', 'view.html', 'theme.css', 'theme.scss', 'plugins\\a\\client\\View.js',
  ]) it(`requires ego-browser for ${file}`, () => {
    const matrix = deriveImpactMatrix([file])
    assert.equal(matrix.isUiChange, true)
    assert.equal(matrix.dimensions.browser.required, true)
    assert.equal(matrix.dimensions.browser.phase, 'post-merge')
    assert.equal(matrix.dimensions.browser.target, 'worktree')
    assert.match(matrix.dimensions.browser.reason, /独立工作树内完成真实浏览器 Web 验证/)
    assert.match(matrix.summary, /工作树 Web 验证: required/)
    assert.equal(matrix.dimensions.dev.required, false)
    assert.equal(matrix.dimensions.dev.target, 'human')
    assert.match(matrix.summary, /开发版真机验收: 人工职责、非 Agent 卡点/)
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
    assert.equal(matrix.dimensions.browser.required, false)
    assert.equal(matrix.dimensions.browser.target, 'worktree')
    assert.match(matrix.dimensions.browser.reason, /无客户端\/UI文件变更/)
    assert.equal(matrix.dimensions.dev.required, false)
    assert.equal(matrix.dimensions.dev.target, 'human')
    assert.match(matrix.summary, /not-applicable/)
    assert.equal(matrix.dimensions.l0.required, true)
  })

  it('runtime-only changes never require post-merge Dev acceptance, while docs and test fixtures stay not applicable', () => {
    for (const file of ['plugins/a/src/service.js', 'plugins/a/dsh.manifest.json', 'package.json', 'pnpm-lock.yaml', 'packages/host/index.ts']) {
      assert.equal(requiresDev([file]), true, file)
      assert.equal(requiresBrowser([file]), false, file)
      const matrix = deriveImpactMatrix([file])
      const pending = postMergeAcceptance(matrix)
      assert.equal(matrix.dimensions.dev.required, false, file)
      assert.equal(pending.dev.status, 'not-applicable')
      assert.equal(pending.dev.pass, null)
      assert.match(pending.dev.reason, /人工职责/)
      assert.equal(pending.browser.required, false)
      assert.equal(pending.browser.status, 'not-applicable')
      assert.equal(pending.browser.pass, null)
    }
    for (const file of ['plugins/a/src/client/View.tsx', 'theme.scss']) {
      const pending = postMergeAcceptance(deriveImpactMatrix([file]))
      assert.equal(pending.browser.required, true, file)
      assert.equal(pending.browser.status, 'pending', file)
      assert.equal(pending.browser.pass, null, file)
      assert.equal(pending.dev.required, false, file)
      assert.equal(pending.dev.status, 'not-applicable', file)
      assert.equal(pending.dev.pass, null, file)
    }
    for (const file of ['plugins/a/src/client/View.test.tsx', 'plugins/a/tests/client.js', 'scripts/test-fixtures/page.html', 'plugins/a/README.md']) {
      assert.equal(requiresDev([file]), false, file)
      assert.equal(requiresBrowser([file]), false, file)
    }
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
      const explicitMatrix = JSON.parse(explicit.stdout)
      assert.equal(explicitMatrix.isUiChange, true)
      assert.equal(explicitMatrix.dimensions.browser.target, 'worktree')
      assert.equal(explicitMatrix.dimensions.dev.required, false)
      assert.equal(explicitMatrix.dimensions.dev.target, 'human')
      execFileSync('git', ['init', '-q'], { cwd: root })
      writeFileSync(join(root, 'README.md'), 'fixture\n')
      execFileSync('git', ['add', '.'], { cwd: root })
      execFileSync('git', ['-c', 'user.name=QA', '-c', 'user.email=qa@localhost', 'commit', '-qm', 'fixture'], { cwd: root })
      writeFileSync(join(root, 'view.vue'), '<template />\n')
      const diff = run(['--git-diff', '--base', 'HEAD'])
      assert.equal(diff.status, 0, diff.stderr)
      const diffMatrix = JSON.parse(diff.stdout)
      assert.equal(diffMatrix.isUiChange, true)
      assert.equal(diffMatrix.dimensions.browser.target, 'worktree')
      assert.equal(diffMatrix.dimensions.dev.required, false)
      assert.equal(run(['--git-diff', '--base', 'missing-ref']).status, 1)
      assert.equal(run(['--git-diff', '--files', 'x.js']).status, 1)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
