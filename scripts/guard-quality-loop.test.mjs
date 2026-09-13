/**
 * scripts/guard-quality-loop.test.mjs
 * Unit test suite for the hardened Quality Loop gate (task-scoped spec / verify / completeness).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import {
  isBusinessSourceFile,
  isE2ETestFile,
  isSpecPath,
  isE2EPath,
  isUiSourcePath,
  bashWritesSource,
  isDeliveryCommand,
  taskChangeSet,
  taskSpecs,
  hasEvidenceAfterSpec,
  decideQualityGate,
} from './guard-quality-loop.mjs'

/* ------------------------------------------------------------------ helpers */

function gitIn(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Gate Test',
      GIT_AUTHOR_EMAIL: 'gate@example.invalid',
      GIT_COMMITTER_NAME: 'Gate Test',
      GIT_COMMITTER_EMAIL: 'gate@example.invalid',
    },
  })
}

function writeFileAt(root, rel, content) {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
  return abs
}

/** 造一个 omnimux-dsh 夹具仓库，并把当前 HEAD 记录为 origin/main。 */
function makeRepo(name) {
  const root = mkdtempSync(join(tmpdir(), `quality-gate-${name}-`))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'omnimux-dsh' }))
  writeFileSync(join(root, 'README.md'), '# fixture\n')
  gitIn(root, ['init', '-b', 'main'])
  gitIn(root, ['add', '.'])
  gitIn(root, ['commit', '-m', 'base'])
  const head = String(gitIn(root, ['rev-parse', 'HEAD']).stdout).trim()
  gitIn(root, ['update-ref', 'refs/remotes/origin/main', head])
  return root
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true })
}

const SPEC_BODY =
  '# 任务规格\n\n## 用户操作旅程\n1. 打开页面\n2. 点击按钮\n3. 期望出现结果\n\n## 验收用例\n- 用例一：可点击\n- 用例二：几何尺寸大于零\n'

/* ------------------------------------------------------------- 路径判定 */

test('isBusinessSourceFile identifies business source vs exemptions', () => {
  const root = '/repo'
  assert.equal(isBusinessSourceFile('/repo/plugins/omnimux/src/client/x.js', root), true)
  assert.equal(isBusinessSourceFile('/repo/packages/form-contract/src/index.js', root), true)
  assert.equal(isBusinessSourceFile('/repo/specs/a.spec.md', root), false)
  assert.equal(isBusinessSourceFile('/repo/scripts/a.mjs', root), false)
  assert.equal(isBusinessSourceFile('/repo/plugins/omnimux/tests/a.test.js', root), false)
  assert.equal(isBusinessSourceFile('/repo/docs/a.md', root), false)
})

test('isE2ETestFile only matches end-to-end style paths', () => {
  const root = '/repo'
  assert.equal(isE2ETestFile('/repo/tests/e2e/login.spec.ts', root), true)
  assert.equal(isE2ETestFile('/repo/plugins/x/tests/e2e/run.js', root), true)
  assert.equal(isE2ETestFile('/repo/plugins/x/tests/login.e2e.test.js', root), true)
  assert.equal(isE2ETestFile('/repo/plugins/x/src/client/a.test.js', root), false)
  assert.equal(isE2ETestFile('/repo/specs/feature.spec.md', root), false)
})

test('path classifiers for change-set analysis', () => {
  assert.equal(isSpecPath('specs/a.spec.md'), true)
  assert.equal(isSpecPath('docs/a.md'), false)
  assert.equal(isE2EPath('plugins/x/tests/e2e/a.spec.ts'), true)
  assert.equal(isE2EPath('plugins/x/src/client/a.test.js'), false)
  assert.equal(isUiSourcePath('plugins/omnimux/src/client/a.js'), true)
  assert.equal(isUiSourcePath('plugins/x/style.css'), true)
  assert.equal(isUiSourcePath('plugins/omnimux/src/server/a.js'), false)
  assert.equal(isUiSourcePath('scripts/a.mjs'), false)
})

test('bashWritesSource detects terminal writes to business source', () => {
  assert.equal(bashWritesSource("echo x > plugins/omnimux/src/client/a.js"), true)
  assert.equal(bashWritesSource("sed -i 's/a/b/' plugins/omnimux/src/client/a.js"), true)
  assert.equal(bashWritesSource("python3 -c \"open('plugins/x/src/a.js','w').write('y')\""), true)
  assert.equal(bashWritesSource('ls -la plugins/omnimux/src/'), false)
  assert.equal(bashWritesSource('grep -rn foo plugins/omnimux/src/'), false)
  assert.equal(bashWritesSource('echo hi > /tmp/notes.txt'), false)
})

test('isDeliveryCommand recognises commit / push / PR commands', () => {
  assert.equal(isDeliveryCommand('git commit -m "x"'), true)
  assert.equal(isDeliveryCommand('git push -u origin agent/x'), true)
  assert.equal(isDeliveryCommand('gh pr create --base main'), true)
  assert.equal(isDeliveryCommand('bash scripts/git-wt.sh finish topic 1'), true)
  assert.equal(isDeliveryCommand('node --test scripts/x.test.mjs'), false)
})

/* ------------------------------------------- 门禁一：任务级规格（核心回归） */

test('REGRESSION: historical specs in the repo must NOT satisfy the gate', () => {
  const root = makeRepo('historical-spec')
  try {
    for (let i = 0; i < 8; i++) writeFileAt(root, `specs/history-${i}.spec.md`, SPEC_BODY)
    gitIn(root, ['add', '.'])
    gitIn(root, ['commit', '-m', 'historical specs'])
    const head = String(gitIn(root, ['rev-parse', 'HEAD']).stdout).trim()
    gitIn(root, ['update-ref', 'refs/remotes/origin/main', head])

    assert.equal(taskSpecs(root).length, 0, '历史规格不应被算作本任务规格')

    const res = decideQualityGate({
      toolName: 'default_api:edit',
      toolInput: { file_path: join(root, 'plugins/omnimux/src/client/a.js') },
      cwd: root,
    })
    assert.equal(res.decision, 'deny')
    assert.equal(res.reason, 'missing-spec-for-source-code')
  } finally {
    cleanup(root)
  }
})

test('gate allows business source once the task produced its own spec', () => {
  const root = makeRepo('task-spec')
  try {
    writeFileAt(root, 'specs/this-task.spec.md', SPEC_BODY)
    assert.equal(taskSpecs(root).length, 1)

    const res = decideQualityGate({
      toolName: 'default_api:edit',
      toolInput: { file_path: join(root, 'plugins/omnimux/src/client/a.js') },
      cwd: root,
    })
    assert.equal(res.decision, 'allow')
  } finally {
    cleanup(root)
  }
})

test('task spec committed ahead of origin/main also counts', () => {
  const root = makeRepo('committed-spec')
  try {
    writeFileAt(root, 'specs/branch.spec.md', SPEC_BODY)
    gitIn(root, ['add', '.'])
    gitIn(root, ['commit', '-m', 'spec only'])
    assert.equal(taskSpecs(root).length, 1)
  } finally {
    cleanup(root)
  }
})

test('writing the spec itself and non-source files stays exempt', () => {
  const root = makeRepo('exempt')
  try {
    for (const rel of ['specs/new.spec.md', 'scripts/tool.mjs', 'docs/note.md', 'README.md']) {
      const res = decideQualityGate({
        toolName: 'default_api:write',
        toolInput: { file_path: join(root, rel) },
        cwd: root,
      })
      assert.equal(res.decision, 'allow', `${rel} 应放行`)
    }
  } finally {
    cleanup(root)
  }
})

/* ------------------------------------------- 门禁二：验证证据（任务级） */

test('REGRESSION: historical evidence must NOT satisfy the verify gate', () => {
  const root = makeRepo('historical-evidence')
  try {
    writeFileAt(root, 'specs/task.spec.md', SPEC_BODY)
    const old = writeFileAt(root, '.workbuddy/evidence/old-run.json', '{"ok":true}')
    const past = (Date.now() - 3 * 60 * 60 * 1000) / 1000
    utimesSync(old, past, past)
    const specAbs = join(root, 'specs/task.spec.md')
    const specPast = (Date.now() - 60 * 60 * 1000) / 1000
    utimesSync(specAbs, specPast, specPast)

    assert.equal(hasEvidenceAfterSpec(root), false)

    const res = decideQualityGate({
      toolName: 'default_api:write',
      toolInput: { file_path: join(root, 'plugins/x/tests/e2e/login.spec.ts') },
      cwd: root,
    })
    assert.equal(res.decision, 'deny')
    assert.equal(res.reason, 'missing-verify-evidence-for-e2e')
  } finally {
    cleanup(root)
  }
})

test('fresh evidence produced after the spec satisfies the verify gate', () => {
  const root = makeRepo('fresh-evidence')
  try {
    writeFileAt(root, 'specs/task.spec.md', SPEC_BODY)
    const specAbs = join(root, 'specs/task.spec.md')
    const specPast = (Date.now() - 10 * 60 * 1000) / 1000
    utimesSync(specAbs, specPast, specPast)
    writeFileAt(root, '.workbuddy/evidence/run.json', '{"ok":true}')

    assert.equal(hasEvidenceAfterSpec(root), true)

    const res = decideQualityGate({
      toolName: 'default_api:write',
      toolInput: { file_path: join(root, 'plugins/x/tests/e2e/login.spec.ts') },
      cwd: root,
    })
    assert.equal(res.decision, 'allow')
  } finally {
    cleanup(root)
  }
})

/* ------------------------------------------- 门禁三：端到端完整性（新增） */

test('REGRESSION: UI change without any e2e test blocks commit / push / PR', () => {
  const root = makeRepo('ui-no-e2e')
  try {
    writeFileAt(root, 'specs/task.spec.md', SPEC_BODY)
    writeFileAt(root, 'plugins/omnimux/src/client/a.js', 'export const a = 1\n')
    writeFileAt(root, 'plugins/omnimux/src/client/a.test.js', '// 单元测试不能替代端到端测试\n')

    for (const command of [
      'git commit -m "fix ui"',
      'git push -u origin agent/x',
      'gh pr create --base main --head agent/x',
    ]) {
      const res = decideQualityGate({ toolName: 'bash', toolInput: { command }, cwd: root })
      assert.equal(res.decision, 'deny', `${command} 应被拦截`)
      assert.equal(res.reason, 'missing-e2e-for-ui-change')
    }
  } finally {
    cleanup(root)
  }
})

test('UI change together with an e2e test passes the completeness gate', () => {
  const root = makeRepo('ui-with-e2e')
  try {
    writeFileAt(root, 'specs/task.spec.md', SPEC_BODY)
    writeFileAt(root, 'plugins/omnimux/src/client/a.js', 'export const a = 1\n')
    writeFileAt(root, 'plugins/x/tests/e2e/login.spec.ts', '// e2e\n')

    const res = decideQualityGate({
      toolName: 'bash',
      toolInput: { command: 'git commit -m "fix ui with e2e"' },
      cwd: root,
    })
    assert.equal(res.decision, 'allow')
  } finally {
    cleanup(root)
  }
})

test('non-UI change does not require an e2e test', () => {
  const root = makeRepo('server-change')
  try {
    writeFileAt(root, 'specs/task.spec.md', SPEC_BODY)
    writeFileAt(root, 'plugins/omnimux/src/server/a.js', 'export const a = 1\n')

    const res = decideQualityGate({
      toolName: 'bash',
      toolInput: { command: 'git commit -m "server only"' },
      cwd: root,
    })
    assert.equal(res.decision, 'allow')
  } finally {
    cleanup(root)
  }
})

/* ------------------------------------------- bash 绕过封堵 */

test('bash source write without a task spec is denied', () => {
  const root = makeRepo('bash-bypass')
  try {
    writeFileAt(root, 'specs/history.spec.md', SPEC_BODY)
    gitIn(root, ['add', '.'])
    gitIn(root, ['commit', '-m', 'history'])
    const head = String(gitIn(root, ['rev-parse', 'HEAD']).stdout).trim()
    gitIn(root, ['update-ref', 'refs/remotes/origin/main', head])

    const res = decideQualityGate({
      toolName: 'bash',
      toolInput: { command: "printf 'x' > plugins/omnimux/src/client/a.js" },
      cwd: root,
    })
    assert.equal(res.decision, 'deny')
    assert.equal(res.reason, 'missing-spec-for-source-code')
  } finally {
    cleanup(root)
  }
})

test('harmless bash commands stay allowed', () => {
  const root = makeRepo('harmless-bash')
  try {
    for (const command of ['ls -la', 'git status -s', 'node --test scripts/x.test.mjs', 'pnpm --filter omnimux test']) {
      const res = decideQualityGate({ toolName: 'bash', toolInput: { command }, cwd: root })
      assert.equal(res.decision, 'allow', `${command} 应放行`)
    }
  } finally {
    cleanup(root)
  }
})

/* ------------------------------------------- 改动集合基础行为 */

test('taskChangeSet merges uncommitted and branch-ahead changes', () => {
  const root = makeRepo('changeset')
  try {
    writeFileAt(root, 'plugins/omnimux/src/client/uncommitted.js', 'x\n')
    gitIn(root, ['add', '.'])
    gitIn(root, ['commit', '-m', 'ahead'])
    writeFileAt(root, 'plugins/omnimux/src/client/dirty.js', 'y\n')

    const changed = taskChangeSet(root)
    assert.ok(changed.includes('plugins/omnimux/src/client/uncommitted.js'))
    assert.ok(changed.includes('plugins/omnimux/src/client/dirty.js'))
  } finally {
    cleanup(root)
  }
})
