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
  // 用例名逐字静态化（原为循环内模板字面量）：动态用例名会被 test-authoring 门禁判为
  // dynamic-test-options-needs-review 且该原因不可声明放行，因此改为显式 it() + 共享断言体，
  // 名称与断言内容与静态化前完全一致。
  const assertUiFile = file => {
    const matrix = deriveImpactMatrix([file])
    assert.equal(matrix.isUiChange, true)
    assert.equal(matrix.dimensions.browser.required, true)
    assert.equal(matrix.dimensions.browser.phase, 'post-merge')
    assert.equal(matrix.dimensions.browser.target, 'worktree')
    assert.match(matrix.dimensions.browser.reason, /独立工作树内完成真实浏览器 Web 验证/)
    assert.match(matrix.summary, /工作树 Web 验证: required/)
    assert.equal(matrix.dimensions.dev.required, false)
    assert.equal(matrix.dimensions.dev.target, 'human')
    assert.match(matrix.summary, /开发版真机验收: 桌面端 Bot 负责/)
    assert.equal(matrix.dimensions.l0.required, true)
    assert.equal(requiresBrowser([file]), true)
  }
  it('requires ego-browser for plugins/a/client/index.js', () => assertUiFile('plugins/a/client/index.js'))
  it('requires ego-browser for plugins/a/src/client/View.js', () => assertUiFile('plugins/a/src/client/View.js'))
  it('requires ego-browser for apps/desktop/main.js', () => assertUiFile('apps/desktop/main.js'))
  it('requires ego-browser for web/index.js', () => assertUiFile('web/index.js'))
  it('requires ego-browser for plugins/a/Stage.js', () => assertUiFile('plugins/a/Stage.js'))
  it('requires ego-browser for Stage.ts', () => assertUiFile('Stage.ts'))
  it('requires ego-browser for view.jsx', () => assertUiFile('view.jsx'))
  it('requires ego-browser for view.tsx', () => assertUiFile('view.tsx'))
  it('requires ego-browser for view.vue', () => assertUiFile('view.vue'))
  it('requires ego-browser for view.svelte', () => assertUiFile('view.svelte'))
  it('requires ego-browser for view.html', () => assertUiFile('view.html'))
  it('requires ego-browser for theme.css', () => assertUiFile('theme.css'))
  it('requires ego-browser for theme.scss', () => assertUiFile('theme.scss'))
  it('requires ego-browser for plugins\\a\\client\\View.js', () => assertUiFile('plugins\\a\\client\\View.js'))

  const assertNonUi = files => {
    const matrix = deriveImpactMatrix(files)
    assert.equal(matrix.isUiChange, false)
    assert.equal(matrix.dimensions.browser.required, false)
    assert.equal(matrix.dimensions.browser.target, 'worktree')
    assert.match(matrix.dimensions.browser.reason, /无客户端\/UI文件变更/)
    assert.equal(matrix.dimensions.dev.required, false)
    assert.equal(matrix.dimensions.dev.target, 'human')
    assert.match(matrix.summary, /not-applicable/)
    assert.equal(matrix.dimensions.l0.required, true)
  }
  it('marks non-UI changes not applicable: []', () => assertNonUi([]))
  it('marks non-UI changes not applicable: ["docs/guide.md"]', () => assertNonUi(['docs/guide.md']))
  it('marks non-UI changes not applicable: ["scripts/server.mjs","docs/contracts/plugin-qa.md"]', () => assertNonUi(['scripts/server.mjs', 'docs/contracts/plugin-qa.md']))
  it('marks non-UI changes not applicable: ["plugins/a/src/service.js",".github/workflows/quality-gate.yml"]', () => assertNonUi(['plugins/a/src/service.js', '.github/workflows/quality-gate.yml']))
  it('marks non-UI changes not applicable: ["contracts/api.json","package.json","clients/readme.md","website/backend.js"]', () => assertNonUi(['contracts/api.json', 'package.json', 'clients/readme.md', 'website/backend.js']))

  it('runtime-only changes never require post-merge Dev acceptance, while docs and test fixtures stay not applicable', () => {
    for (const file of ['plugins/a/src/service.js', 'plugins/a/dsh.manifest.json', 'package.json', 'pnpm-lock.yaml', 'packages/host/index.ts']) {
      assert.equal(requiresDev([file]), true, file)
      assert.equal(requiresBrowser([file]), false, file)
      const matrix = deriveImpactMatrix([file])
      const pending = postMergeAcceptance(matrix)
      assert.equal(matrix.dimensions.dev.required, false, file)
      assert.equal(pending.dev.status, 'not-applicable')
      assert.equal(pending.dev.pass, null)
      assert.match(pending.dev.reason, /桌面端 Bot 负责/)
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
