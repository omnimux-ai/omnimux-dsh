/**
 * scripts/guard-quality-loop.test.mjs
 * Unit test suite for the hardened Quality Loop gate (task-scoped spec / verify / completeness).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, utimesSync, lstatSync, symlinkSync, linkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { captureCandidate, sealEvidence } from './evidence-contract.mjs'
import { newSilentCatchHits } from './lib/silent-catch-delta.mjs'
import {
  isBusinessSourceFile,
  isE2ETestFile,
  hasStrongOracleSignal,
  isSpecPath,
  isE2EPath,
  isUiSourcePath,
  isTestScaffoldingPath,
  bashWritesSource,
  isDeliveryCommand,
  taskChangeSet,
  taskSpecs,
  hasEvidenceAfterSpec,
  inspectSpecContract,
  readSpecSections,
  inspectDeliveryGovernance,
  inspectTaskVerification,
  findRepoRoot,
  decideQualityGate,
  handle,
  verificationCommand,
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


function repoRootForSpawn() {
  return findRepoRoot(fileURLToPath(new URL('.', import.meta.url)))
}

const SPEC_BODY =
  '# 任务规格\n\n## 用户操作旅程\n1. 打开页面\n2. 点击按钮\n3. 期望出现结果\n\n## 假设\n这条改动依赖的关键假设：状态同步只在主进程完成，渲染层不缓存副本。\n\n## 证伪方式\n什么可观测结果会证明假设是错的：并行修改同一文件时出现覆盖写入，即证伪。\n\n## 验收用例\n- 用例一：可点击\n- 用例二：几何尺寸大于零\n'

test('bash hook uses workdir without weakening source and delivery gates', () => {
  const root = makeRepo('workdir')
  const task = join(root, '.worktrees/task')
  try {
    assert.equal(gitIn(root, ['worktree', 'add', '-b', 'agent/task', task]).status, 0)
    const check = (command, workdir) => handle(JSON.stringify({ cwd: root, tool_name: 'bash', tool_input: { command, workdir } })).hookSpecificOutput.permissionDecision
    const source = 'echo x > plugins/omnimux/src/client/x.js'
    assert.equal(check(source, task), 'deny')
    writeFileAt(task, 'specs/workdir.spec.md', SPEC_BODY)
    assert.equal(check(source, task), 'allow')
    assert.equal(check(source, '.worktrees/task'), 'allow')
    assert.equal(check(source, root), 'deny')
    const reportCommand = "node --input-type=module <<'EOF'\nimport {build} from 'esbuild';import fs from 'node:fs';import crypto from 'node:crypto';const files=['plugins/omnimux/src/client/attachments/useCommentAttachment.ts','plugins/omnimux/src/client/media-viewer/media-viewer-store.js'];const hashes=Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));await build({entryPoints:['.agent-reports/comment-only-send/hook-logic-entry.ts'],outfile:'.agent-reports/comment-only-send/hook-logic-run.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});fs.writeFileSync('.agent-reports/comment-only-send/hook-logic-source-hashes.json',JSON.stringify(hashes,null,2));\nEOF\nnode .agent-reports/comment-only-send/hook-logic-run.mjs"
    assert.equal(bashWritesSource(reportCommand), true)
    assert.equal(check(reportCommand, task), 'allow')
    assert.equal(check(reportCommand, root), 'deny')
    writeFileAt(task, 'plugins/omnimux/src/client/x.js', 'export const x = 1')
    assert.equal(check('git commit -m example', task), 'deny')
  } finally { cleanup(root) }
})

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
  // 测试脚手架不是界面源码：/test-fixtures/ 与 /tests/ 同口径，避免测试基础设施
  // 修复被要求附带 e2e（2026-10-21 harness 内存安全任务踩到的互锁）。
  assert.equal(isTestScaffoldingPath('plugins/a/src/client/test-fixtures/harness.mjs'), true)
  assert.equal(isUiSourcePath('plugins/a/src/client/test-fixtures/harness.mjs'), false)
  assert.equal(isUiSourcePath('plugins/a/src/client/test-fixtures/stage.jsx'), false)
  assert.equal(isUiSourcePath('plugins/a/tests/fixtures/stage.jsx'), false)
})

test('bashWritesSource detects terminal writes to business source', () => {
  assert.equal(bashWritesSource("echo x > plugins/omnimux/src/client/a.js"), true)
  assert.equal(bashWritesSource("sed -i 's/a/b/' plugins/omnimux/src/client/a.js"), true)
  assert.equal(bashWritesSource("python3 -c \"open('plugins/x/src/a.js','w').write('y')\""), true)
  assert.equal(bashWritesSource('ls -la plugins/omnimux/src/'), false)
  assert.equal(bashWritesSource('grep -rn foo plugins/omnimux/src/'), false)
  assert.equal(bashWritesSource('echo hi > /tmp/notes.txt'), false)
})

/**
 * CONVERGENCE: cwd-scoped bashWritesSource only counts writes that resolve inside the repo root.
 * Dev profile 物化目录（~/.omnimux-dev 等）同样带 plugins/<pkg>/src/ 字样但不在仓库内，
 * ship 收尾时同步这类文件不应被规格门禁拦（Issue #3855）。
 */
test('CONVERGENCE: bashWritesSource ignores out-of-repo write targets when cwd given', () => {
  // gitleaks absolute-home-path 规则把 /Users/<name>/ 当泄露面拦；用豁免名单里的 test 名。
  const outside = '/Users/test/.omnimux-dev/profiles/omnimux/node_modules/dsh-ui-kit/src/icons/fixtures/x.txt'
  const outsideSrc = '/Users/test/.omnimux-dev/profiles/omnimux/.materialize-snapshots/plugins/dsh-ui-kit/src/icons/fixtures/x.txt'
  const repo = '/repo'

  // 仓库外绝对路径 → false（不修门禁）
  assert.equal(bashWritesSource(`cp ${outsideSrc} ${outside}`, repo), false)
  assert.equal(bashWritesSource(`echo x > ${outside}`, repo), false)
  assert.equal(bashWritesSource(`sed -i s/a/b/ ${outside}`, repo), false)
  assert.equal(bashWritesSource(`ln -s src ${outside}`, repo), false)

  // 仓库内绝对路径 → true（仍拦）
  assert.equal(bashWritesSource(`echo x > ${repo}/plugins/omnimux/src/client/a.js`, repo), true)
  assert.equal(bashWritesSource(`sed -i s/a/b/ ${repo}/plugins/omnimux/src/client/a.js`, repo), true)
  assert.equal(bashWritesSource(`cp /tmp/x ${repo}/plugins/omnimux/src/client/a.js`, repo), true)

  // 仓库内相对路径 → true（旧行为不变）
  assert.equal(bashWritesSource('echo x > plugins/omnimux/src/client/a.js', repo), true)
  assert.equal(bashWritesSource("python3 -c \"open('plugins/x/src/a.js','w').write('y')\"", repo), true)

  // 提取不到目标的形态（eval/管道）→ 兜底 true，不误放
  assert.equal(bashWritesSource('node -e "require(\'fs\').writeFileSync(\'plugins/x/src/a.js\',\'y\')"', repo), true)

  // 混合：一条命令既有仓库内又有仓库外目标 → true（从严）
  assert.equal(bashWritesSource(`cp ${outside} ${repo}/plugins/omnimux/src/client/a.js`, repo), true)
})

test('isDeliveryCommand recognises commit / push / PR commands', () => {
  assert.equal(isDeliveryCommand('git commit -m "x"'), true)
  assert.equal(isDeliveryCommand('git push -u origin agent/x'), true)
  assert.equal(isDeliveryCommand('gh pr create --base main'), true)
  assert.equal(isDeliveryCommand('bash scripts/git-wt.sh finish topic 1'), true)
  assert.equal(isDeliveryCommand('node --test scripts/x.test.mjs'), false)
})

/**
 * 现行标准开树入口是 worktree.sh（把树建在 <repo>/.worktrees/<task>，见 omnimux-repo-workflow skill）。
 * 门禁此前只认已废弃的 git-wt.sh finish，导致 Agent 按现行标准收尾时绕过完整性门禁。
 */
test('CONVERGENCE: current worktree.sh delivery commands are recognised', () => {
  assert.equal(isDeliveryCommand('bash scripts/worktree.sh ship test-env-flow-smooth --pr 12'), true)
  assert.equal(isDeliveryCommand('scripts/worktree.sh ship topic 12'), true)
  assert.equal(isDeliveryCommand('bash scripts/worktree.sh finish topic --pr 12'), true)
  assert.equal(isDeliveryCommand('./scripts/worktree.sh ship x --pr 1'), true)
  // 查询类子命令不是交付，绝不能因统一识别而误伤
  assert.equal(isDeliveryCommand('bash scripts/worktree.sh list'), false)
  assert.equal(isDeliveryCommand('bash scripts/worktree.sh remove topic'), false)
  assert.equal(isDeliveryCommand('bash scripts/worktree.sh prune'), false)
  assert.equal(isDeliveryCommand('bash scripts/worktree.sh new feat-topic origin/main'), false)
  assert.equal(isDeliveryCommand('bash scripts/worktree.sh help'), false)
  // 弃用入口的 start 同样不是交付
  assert.equal(isDeliveryCommand('bash scripts/git-wt.sh start common topic'), false)
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
      toolInput: {
        file_path: join(root, 'plugins/x/tests/e2e/login.spec.ts'),
        content: "import assert from 'node:assert/strict'\nassert.equal(1, 1)\n",
      },
      cwd: root,
    })
    assert.equal(res.decision, 'allow')
  } finally {
    cleanup(root)
  }
})

/* ------------------------------------------- 门禁二补充：强断言 / Fail-Closed */

test('hasStrongOracleSignal accepts value comparisons and rejects weak oracles', () => {
  assert.equal(hasStrongOracleSignal('assert.equal(a, b)'), true)
  assert.equal(hasStrongOracleSignal('expect(x).toEqual(1)'), true)
  assert.equal(hasStrongOracleSignal('t.equal(a, b)'), true)
  assert.equal(hasStrongOracleSignal('assert.ok(x)'), false)
  assert.equal(hasStrongOracleSignal('expect(x).toBeTruthy()'), false)
  assert.equal(hasStrongOracleSignal(''), false)
  assert.equal(hasStrongOracleSignal('// no asserts'), false)
})

test('E2E write with evidence but no strong oracle is denied', () => {
  const root = makeRepo('weak-oracle')
  try {
    writeFileAt(root, 'specs/task.spec.md', SPEC_BODY)
    const specAbs = join(root, 'specs/task.spec.md')
    utimesSync(specAbs, (Date.now() - 10 * 60 * 1000) / 1000, (Date.now() - 10 * 60 * 1000) / 1000)
    writeFileAt(root, '.workbuddy/evidence/run.json', '{"ok":true}')

    for (const content of [
      'test("x", () => {})\n',
      'assert.ok(true)\n',
      'expect(flag).toBeTruthy()\n',
    ]) {
      const res = decideQualityGate({
        toolName: 'write',
        toolInput: { file_path: join(root, 'plugins/x/tests/e2e/login.spec.ts'), content },
        cwd: root,
      })
      assert.equal(res.decision, 'deny', JSON.stringify(content))
      assert.equal(res.reason, 'missing-strong-oracle-for-e2e')
    }
  } finally {
    cleanup(root)
  }
})

test('E2E write with evidence and strong oracle is allowed', () => {
  const root = makeRepo('strong-oracle')
  try {
    writeFileAt(root, 'specs/task.spec.md', SPEC_BODY)
    const specAbs = join(root, 'specs/task.spec.md')
    utimesSync(specAbs, (Date.now() - 10 * 60 * 1000) / 1000, (Date.now() - 10 * 60 * 1000) / 1000)
    writeFileAt(root, '.workbuddy/evidence/run.json', '{"ok":true}')

    const res = decideQualityGate({
      toolName: 'write',
      toolInput: {
        file_path: join(root, 'plugins/x/tests/e2e/login.spec.ts'),
        content: "import assert from 'node:assert/strict'\nassert.equal(status, 200)\n",
      },
      cwd: root,
    })
    assert.equal(res.decision, 'allow')
  } finally {
    cleanup(root)
  }
})

test('CLI main fails closed on invalid JSON stdin', () => {
  const script = join(repoRootForSpawn(), 'scripts/guard-quality-loop.mjs')
  const r = spawnSync(process.execPath, [script], {
    input: '{',
    encoding: 'utf8',
    timeout: 5000,
  })
  const out = String(r.stdout || '').trim()
  assert.ok(out, 'stdout should contain deny JSON')
  const parsed = JSON.parse(out)
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(String(parsed.hookSpecificOutput.permissionDecisionReason || ''), /Fail-Closed|安全阻断/)
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

test('UI change without evidence blocks delivery even if e2e test exists', () => {
  const root = makeRepo('ui-no-evidence')
  try {
    writeFileAt(root, 'specs/task.spec.md', SPEC_BODY)
    writeFileAt(root, 'plugins/omnimux/src/client/a.js', 'export const a = 1\n')
    writeFileAt(root, 'plugins/x/tests/e2e/login.spec.ts', '// e2e\n')

    for (const command of [
      'git commit -m "fix ui with e2e but no evidence"',
      'git push -u origin agent/x',
      'gh pr create --base main --head agent/x',
    ]) {
      const res = decideQualityGate({ toolName: 'bash', toolInput: { command }, cwd: root })
      assert.equal(res.decision, 'deny', `${command} 应因缺少实测证据被拦截`)
      assert.equal(res.reason, 'missing-evidence-for-ui-delivery')
    }
  } finally {
    cleanup(root)
  }
})

test('UI change with both e2e test and task evidence passes completeness gate', () => {
  const root = makeRepo('ui-with-e2e-and-evidence')
  try {
    writeFileAt(root, 'specs/task.spec.md', SPEC_BODY)
    writeFileAt(root, 'plugins/omnimux/src/client/a.js', 'export const a = 1\n')
    writeFileAt(root, 'plugins/x/tests/e2e/login.spec.ts', '// e2e\n')
    writeFileAt(root, 'docs/evidence/task-verified.png', 'png bytes')

    const res = decideQualityGate({
      toolName: 'bash',
      toolInput: { command: 'git commit -m "fix ui with e2e and evidence"' },
      cwd: root,
    })
    assert.equal(res.decision, 'allow')
  } finally {
    cleanup(root)
  }
})

test('REGRESSION: app-home.png smoke screenshot and tmp/ are rejected as valid evidence', () => {
  const root = makeRepo('banned-evidence')
  try {
    writeFileAt(root, 'specs/task.spec.md', SPEC_BODY)
    const specAbs = join(root, 'specs/task.spec.md')
    const specPast = (Date.now() - 10 * 60 * 1000) / 1000
    utimesSync(specAbs, specPast, specPast)

    // 写入黑名单首页冒烟图
    writeFileAt(root, 'docs/evidence/app-home.png', 'png bytes')
    // 写入 tmp/ 临时目录
    writeFileAt(root, 'tmp/task-report.json', '{"ok":true}')

    // hasEvidenceAfterSpec 必须判定为 false
    assert.equal(hasEvidenceAfterSpec(root), false)

    // 写入合法专属证据后变为 true
    writeFileAt(root, 'docs/evidence/task-verified.png', 'png bytes')
    assert.equal(hasEvidenceAfterSpec(root), true)
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

/* ------------------------------- 跨仓库（工作树）判定：门禁必须落在被改文件所在仓库 */

test('CONVERGENCE: spec gate judges the repo that owns the edited file, not the session cwd', () => {
  const sessionRoot = makeRepo('session-root') // 会话工作目录：模拟主检出，无本任务规格
  const taskRoot = makeRepo('task-root') // 被改文件所在仓库：模拟工作树
  try {
    const target = join(taskRoot, 'plugins/omnimux/src/client/a.js')

    // 1. 工作树内没有本任务规格 → 必须拒绝（旧实现因路径落在会话仓库之外而误放行）
    const denied = decideQualityGate({
      toolName: 'default_api:edit',
      toolInput: { file_path: target },
      cwd: sessionRoot,
    })
    assert.equal(denied.decision, 'deny')
    assert.equal(denied.reason, 'missing-spec-for-source-code')

    // 2. 规格产出在工作树内（未提交）→ 放行，且全程无需触碰会话仓库
    writeFileAt(taskRoot, 'specs/task.spec.md', SPEC_BODY)
    const allowed = decideQualityGate({
      toolName: 'default_api:edit',
      toolInput: { file_path: target },
      cwd: sessionRoot,
    })
    assert.equal(allowed.decision, 'allow')

    // 3. 会话仓库里的规格不得替工作树背书（反向隔离）
    const otherTask = makeRepo('other-task-root')
    writeFileAt(sessionRoot, 'specs/unrelated.spec.md', SPEC_BODY)
    const stillDenied = decideQualityGate({
      toolName: 'default_api:edit',
      toolInput: { file_path: join(otherTask, 'plugins/omnimux/src/client/b.js') },
      cwd: sessionRoot,
    })
    assert.equal(stillDenied.decision, 'deny')

    cleanup(otherTask)
  } finally {
    cleanup(sessionRoot)
    cleanup(taskRoot)
  }
})

test('CONVERGENCE: delivery commands honour `git -C <task repo>` for the change set', () => {
  const sessionRoot = makeRepo('session-delivery')
  const taskRoot = makeRepo('task-delivery')
  try {
    writeFileAt(taskRoot, 'specs/task.spec.md', SPEC_BODY)
    writeFileAt(taskRoot, 'plugins/omnimux/src/client/a.js', 'export const a = 1\n')
    writeFileAt(taskRoot, 'plugins/x/tests/e2e/login.spec.ts', '// e2e\n')
    writeFileAt(taskRoot, 'docs/evidence/task-verified.png', 'png bytes')

    // -C 指向工作树：界面改动 + 端到端测试齐全 → 放行
    const allowed = decideQualityGate({
      toolName: 'bash',
      toolInput: { command: `git -C "${taskRoot}" commit -m "feat ui"` },
      cwd: sessionRoot,
    })
    assert.equal(allowed.decision, 'allow')

    // 同一批改动但在工作树里缺端到端测试 → 拒绝，证明 -C 目标确实被采用
    const missing = makeRepo('task-delivery-missing-e2e')
    writeFileAt(missing, 'specs/task.spec.md', SPEC_BODY)
    writeFileAt(missing, 'plugins/omnimux/src/client/a.js', 'export const a = 1\n')
    const denied = decideQualityGate({
      toolName: 'bash',
      toolInput: { command: `git -C ${missing} commit -m "feat ui"` },
      cwd: sessionRoot,
    })
    assert.equal(denied.decision, 'deny')
    assert.equal(denied.reason, 'missing-e2e-for-ui-change')
    cleanup(missing)
  } finally {
    cleanup(sessionRoot)
    cleanup(taskRoot)
  }
})

test('public verification command rejects absent arguments', () => {
  assert.deepEqual(verificationCommand([]), {
    exitCode: 2,
    result: { valid: false, applicable: false, pass: false,
      authorization: 'not-granted', provenance: 'unknown', reason: 'VERIFICATION_ARGUMENTS_REQUIRED',
      evidenceStatus: 'invalid', errors: ['VERIFICATION_ARGUMENTS_REQUIRED'] },
  })
})

test('public verification command classifies an ordinary absent request file', () => {
  const root = process.env.EVIDENCE_FIXTURE_ROOT
  assert.equal(typeof root, 'string', 'EVIDENCE_FIXTURE_ENV_REQUIRED')
  const requestPath = join(dirname(root), 'request-missing-' + randomUUID() + '.json')
  const command = verificationCommand(['--verify-report', requestPath])
  assert.equal(command.result.reason, 'REQUEST_MISSING')
  assert.equal(command.exitCode, 2)
  assert.equal(command.result.evidenceStatus, 'missing')
  assert.equal(command.result.authorization, 'not-granted')
})

test('public verification command rejects an ordinary malformed JSON request', () => {
  const root = process.env.EVIDENCE_FIXTURE_ROOT
  assert.equal(typeof root, 'string', 'EVIDENCE_FIXTURE_ENV_REQUIRED')
  const requestPath = join(dirname(root), 'request-corrupt-' + randomUUID() + '.json')
  writeFileSync(requestPath, '{"purpose":', { flag: 'wx' })
  const command = verificationCommand(['--verify-report', requestPath])
  assert.equal(command.exitCode, 2)
  assert.equal(command.result.reason, 'REQUEST_CORRUPT')
  assert.equal(command.result.evidenceStatus, 'corrupt')
  assert.equal(command.result.authorization, 'not-granted')
})

test('public verification command rejects an unknown request policy field', () => {
  const root = process.env.EVIDENCE_FIXTURE_ROOT
  assert.equal(typeof root, 'string', 'EVIDENCE_FIXTURE_ENV_REQUIRED')
  const taskId = 'reader-policy-' + randomUUID()
  const runId = randomUUID()
  const prefix = `.workbuddy/evidence/contract/${taskId}/${runId}/`
  const requestPath = join(dirname(root), taskId + '.json')
  writeFileSync(requestPath, JSON.stringify({ purpose: 'history', root, taskId, runId, scope: 'smoke',
    baseSha: '0'.repeat(40), headSha: '0'.repeat(40),
    requiredChecks: ['reader-check'], expectedAssertions: { 'reader-check': ['reader-assertion'] },
    reportPath: prefix + 'evidence.json', artifactPaths: [prefix + 'raw-run.json'], requestNote: 'not-a-policy-field' }), { flag: 'wx' })
  const command = verificationCommand(['--verify-report', requestPath])
  assert.equal(command.exitCode, 2)
  assert.equal(command.result.reason, 'REQUEST_INVALID')
  assert.equal(command.result.authorization, 'not-granted')
})

test('public verification command enforces the ordinary request byte limit', () => {
  const root = process.env.EVIDENCE_FIXTURE_ROOT
  assert.equal(typeof root, 'string', 'EVIDENCE_FIXTURE_ENV_REQUIRED')
  const requestPath = join(dirname(root), 'request-limit-' + randomUUID() + '.json')
  writeFileSync(requestPath, ' '.repeat(128 * 1024 + 1), { flag: 'wx' })
  const command = verificationCommand(['--verify-report', requestPath])
  assert.equal(command.exitCode, 2)
  assert.equal(command.result.reason, 'REQUEST_SIZE_UNSUPPORTED')
  assert.equal(command.result.authorization, 'not-granted')
})

test('public verification command rejects surplus path arguments', () => {
  const command = verificationCommand(['--verify-report', '/request-one.json', '/request-two.json'])
  assert.equal(command.exitCode, 2)
  assert.equal(command.result.reason, 'VERIFICATION_ARGUMENTS_INVALID')
})

test('public verification command does not turn a fresh fake envelope into historical evidence', () => {
  const root = process.env.EVIDENCE_FIXTURE_ROOT
  const sha = process.env.EVIDENCE_FIXTURE_SHA
  assert.equal(process.env.EVIDENCE_FIXTURE_REPO, root)
  assert.equal(typeof root, 'string', 'EVIDENCE_FIXTURE_ENV_REQUIRED')
  assert.match(sha, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
  const taskId = 'reader-envelope-' + randomUUID()
  const runId = randomUUID()
  const prefix = `.workbuddy/evidence/contract/${taskId}/${runId}/`
  const reportPath = prefix + 'evidence.json'
  const requestPath = join(dirname(root), taskId + '.json')
  mkdirSync(join(root, prefix), { recursive: true })
  writeFileSync(join(root, reportPath), '{"valid":true,"pass":true,"readerNote":"fresh-is-not-proof"}\n', { flag: 'wx' })
  writeFileSync(requestPath, JSON.stringify({ purpose: 'history', root, taskId, runId, scope: 'smoke',
    baseSha: sha, headSha: sha,
    requiredChecks: ['reader-check'], expectedAssertions: { 'reader-check': ['reader-assertion'] },
    reportPath, artifactPaths: [prefix + 'raw-run.json'] }), { flag: 'wx' })
  const command = verificationCommand(['--verify-report', requestPath])
  assert.equal(command.exitCode, 2)
  assert.equal(command.result.reason, 'VERIFICATION_BINDING_MISMATCH')
  assert.equal(command.result.valid, false)
  assert.equal(command.result.pass, false)
  assert.equal(command.result.authorization, 'not-granted')
})

test('public verification command requires explicit current capture and declared outputs', () => {
  const root = process.env.EVIDENCE_FIXTURE_ROOT
  assert.equal(typeof root, 'string', 'EVIDENCE_FIXTURE_ENV_REQUIRED')
  const taskId = 'reader-current-' + randomUUID()
  const runId = randomUUID()
  const prefix = `.workbuddy/evidence/contract/${taskId}/${runId}/`
  const requestPath = join(dirname(root), taskId + '.json')
  writeFileSync(requestPath, JSON.stringify({ purpose: 'candidate', root, taskId, runId, scope: 'smoke',
    baseSha: '0'.repeat(40), headSha: '0'.repeat(40),
    requiredChecks: ['reader-check'], expectedAssertions: { 'reader-check': ['reader-assertion'] },
    reportPath: prefix + 'evidence.json', artifactPaths: [prefix + 'raw-run.json'] }), { flag: 'wx' })
  assert.equal(verificationCommand(['--verify-report', requestPath]).result.reason, 'CURRENT_ARGUMENT_REQUIRED')
  const command = verificationCommand(['--verify-report', requestPath, '--current'])
  assert.equal(command.exitCode, 2)
  assert.equal(command.result.reason, 'CURRENT_OUTPUTS_REQUIRED')
  assert.equal(command.result.valid, false)
  assert.equal(command.result.authorization, 'not-granted')
})

test('public verification command classifies a current capture Git read failure without leaking the request', () => {
  const root = process.env.EVIDENCE_FIXTURE_ROOT
  const sha = process.env.EVIDENCE_FIXTURE_SHA
  assert.equal(process.env.EVIDENCE_FIXTURE_REPO, root)
  assert.equal(typeof root, 'string', 'EVIDENCE_FIXTURE_ENV_REQUIRED')
  assert.match(sha, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
  const taskId = 'current-git-' + randomUUID()
  const runId = randomUUID()
  const prefix = `.workbuddy/evidence/contract/${taskId}/${runId}/`
  const reportPath = prefix + 'evidence.json'
  const rawPath = prefix + 'raw-run.json'
  const requestPath = join(dirname(root), 'request-' + taskId + '.json')
  writeFileSync(requestPath, JSON.stringify({ purpose: 'candidate', root, taskId, runId, scope: 'smoke',
    baseSha: '0000000000000000000000000000000000000000', headSha: sha,
    requiredChecks: ['fixture-check'], expectedAssertions: { 'fixture-check': ['fixture-source-present'] },
    reportPath, artifactPaths: [rawPath], outputs: [rawPath, reportPath], extraInputs: [] }) + '\n', { flag: 'wx' })
  assert.deepEqual(verificationCommand(['--verify-report', requestPath, '--current']), {
    exitCode: 2,
    result: { valid: false, applicable: false, pass: false, authorization: 'not-granted', provenance: 'unknown',
      reason: 'GIT_READ_FAILED', evidenceStatus: 'invalid', errors: ['GIT_READ_FAILED'] },
  })
})

test('public consumer reports an absent verification request', () => {
  const result = inspectTaskVerification(undefined)
  assert.equal(result.reason, 'VERIFICATION_REQUEST_REQUIRED')
  assert.equal(result.evidenceStatus, 'missing')
  assert.equal(result.authorization, 'not-granted')
})

test('public consumer classifies an incomplete request without requiring a receipt', () => {
  const result = inspectTaskVerification({ request: { root: '/repo' } })
  assert.equal(result.reason, 'VERIFICATION_REQUEST_INVALID')
  assert.equal(result.evidenceStatus, 'invalid')
  assert.equal(result.valid, false)
  assert.equal(result.authorization, 'not-granted')
  assert.equal(isE2ETestFile('/repo/plugins/x/tests/unit/value.test.mjs', '/repo'), false)
  assert.equal(isE2ETestFile('/repo/plugins/x/tests/integration/value.test.mjs', '/repo'), false)
})

test('public consumer distinguishes invalid roots, missing reports and corrupt JSON', () => {
  const root = process.env.EVIDENCE_FIXTURE_ROOT
  const sha = process.env.EVIDENCE_FIXTURE_SHA
  assert.equal(typeof root, 'string', 'EVIDENCE_FIXTURE_ENV_REQUIRED')
  assert.match(sha, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
  const taskId = 'consumer-negative-' + randomUUID()
  const runId = randomUUID()
  const prefix = `.workbuddy/evidence/contract/${taskId}/${runId}/`
  const reportPath = prefix + 'evidence.json'
  const request = { purpose: 'history', root, taskId, runId, scope: 'smoke', baseSha: sha, headSha: sha,
    requiredChecks: ['fixture-check'], expectedAssertions: { 'fixture-check': ['fixture-source-present'] },
    reportPath, artifactPaths: [prefix + 'raw-run.json'] }
  const invalidRoot = inspectTaskVerification({ request: Object.assign({}, request, { root: join(root, taskId) }) })
  assert.equal(invalidRoot.reason, 'INVALID_GIT_ROOT')
  assert.equal(invalidRoot.evidenceStatus, 'invalid')
  const absent = inspectTaskVerification({ request })
  assert.equal(absent.reason, 'VERIFICATION_REPORT_MISSING')
  assert.equal(absent.evidenceStatus, 'missing')
  assert.equal(inspectTaskVerification({ request: Object.assign({}, request, { artifactPaths: [prefix + '../escape.json'] }) }).reason, 'VERIFICATION_REQUEST_INVALID')
  mkdirSync(join(root, prefix), { recursive: true })
  writeFileSync(join(root, reportPath), '{"valid":true,', { flag: 'wx' })
  const corrupt = inspectTaskVerification({ request })
  assert.equal(corrupt.reason, 'VERIFICATION_REPORT_CORRUPT')
  assert.equal(corrupt.evidenceStatus, 'corrupt')
  assert.equal(corrupt.authorization, 'not-granted')
  const cwd = repoRootForSpawn()
  assert.equal(decideQualityGate({ toolName: 'write', cwd, toolInput: { file_path: join(cwd, 'scripts/example.test.mjs') } }).decision, 'allow')
  assert.equal(decideQualityGate({ toolName: 'write', cwd, toolInput: { file_path: join(cwd, 'plugins/x/tests/integration/value.test.mjs') } }).decision, 'allow')
})

test('public consumer verifies real historical integrity without granting execution authority', () => {
  const root = process.env.EVIDENCE_FIXTURE_ROOT
  const sha = process.env.EVIDENCE_FIXTURE_SHA
  assert.equal(process.env.EVIDENCE_FIXTURE_REPO, root)
  assert.equal(typeof root, 'string', 'EVIDENCE_FIXTURE_ENV_REQUIRED')
  assert.match(sha, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
  const taskId = 'consumer-' + randomUUID()
  for (const scenario of [
    { name: 'passed', tests: 1, status: 'completed', reason: null, exitCode: 0, pass: true },
    { name: 'zero-tests', tests: 0, status: 'completed', reason: null, exitCode: 0, pass: false },
    { name: 'preparation-failed', tests: 0, status: 'not-run', reason: 'dependency-unavailable', exitCode: null, pass: false },
  ]) {
    const runId = randomUUID()
    const prefix = `.workbuddy/evidence/contract/${taskId}/${runId}/`
    const rawPath = prefix + 'raw-run.json'
    const reportPath = prefix + 'evidence.json'
    const options = { root, base: sha, head: sha, taskId, runId, outputs: [rawPath, reportPath], extraInputs: [] }
    const before = captureCandidate(options)
    assert.deepEqual(before.candidate.entries.map(item => item.path), ['.gitignore', 'source.txt'])
    assert.equal(before.base.resolvedSha, sha)
    assert.equal(before.head.resolvedSha, sha)
    for (const entry of before.candidate.entries) {
      assert.equal(entry.bytes, readFileSync(join(root, entry.path)).length)
      assert.equal(entry.mode, '100644')
    }
    assert.notEqual(before.candidate.entries[0].sha256, before.candidate.entries[1].sha256)
    const checks = [{ name: 'fixture-check', scope: 'smoke', required: true, status: scenario.status,
      reason: scenario.reason, exitCode: scenario.exitCode, tests: scenario.tests, skipped: 0,
      assertions: [{ name: 'fixture-source-present', pass: true }] }]
    const cleanup = [{ name: 'fixture-output', owner: 'fixture-check', status: 'not-applicable', reason: 'not-created' }]
    mkdirSync(join(root, prefix), { recursive: true })
    const rawBytes = JSON.stringify({ checks, cleanup }) + '\n'
    writeFileSync(join(root, rawPath), rawBytes, { flag: 'wx' })
    const after = captureCandidate(options)
    assert.deepEqual(after, before)
    const envelope = sealEvidence({ taskId, runId, producer: 'dependency-stub', scope: 'smoke',
      candidateBefore: before, candidateAfter: after, checks, cleanup, artifactPaths: [rawPath], reportPath })
    writeFileSync(join(root, reportPath), JSON.stringify(envelope) + '\n', { flag: 'wx' })
    const request = { purpose: 'history', root, taskId, runId, scope: 'smoke', baseSha: sha, headSha: sha,
      requiredChecks: ['fixture-check'], expectedAssertions: { 'fixture-check': ['fixture-source-present'] },
      reportPath, artifactPaths: [rawPath] }
    const requestPath = join(dirname(root), 'request-reader-' + taskId + '-' + runId + '.json')
    const commandRequest = { purpose: 'history', root, taskId, runId, scope: 'smoke',
      baseSha: sha, headSha: sha,
      requiredChecks: ['fixture-check'], expectedAssertions: { 'fixture-check': ['fixture-source-present'] },
      reportPath, artifactPaths: [rawPath] }
    writeFileSync(requestPath, JSON.stringify(commandRequest) + '\n', { flag: 'wx' })
    const command = verificationCommand(['--verify-report', requestPath])
    assert.equal(command.exitCode, scenario.pass ? 0 : 1, scenario.name)
    assert.equal(command.result.valid, true)
    assert.equal(command.result.pass, scenario.pass)
    assert.equal(command.result.reason, scenario.pass ? 'VALID_SELF_REPORTED' : 'VALID_FAILED_CHECKS')
    assert.equal(command.result.provenance, 'self-reported')
    assert.equal(command.result.authorization, 'not-granted')
    assert.equal(verificationCommand(['--verify-report', requestPath, '--current']).result.reason, 'VERIFICATION_ARGUMENTS_INVALID')
    const currentRequestPath = join(dirname(root), 'request-current-' + taskId + '-' + runId + '.json')
    const currentRequest = { purpose: 'candidate', root, taskId, runId, scope: 'smoke',
      baseSha: sha, headSha: sha, requiredChecks: ['fixture-check'],
      expectedAssertions: { 'fixture-check': ['fixture-source-present'] },
      reportPath, artifactPaths: [rawPath], outputs: [rawPath, reportPath], extraInputs: [] }
    writeFileSync(currentRequestPath, JSON.stringify(currentRequest) + '\n', { flag: 'wx' })
    const currentCommand = verificationCommand(['--verify-report', currentRequestPath, '--current'])
    assert.equal(currentCommand.result.reason, scenario.pass ? 'VALID_SELF_REPORTED' : 'VALID_FAILED_CHECKS')
    assert.equal(currentCommand.exitCode, scenario.pass ? 0 : 1)
    assert.equal(currentCommand.result.valid, true)
    assert.equal(currentCommand.result.applicable, true)
    assert.equal(currentCommand.result.pass, scenario.pass)
    assert.equal(currentCommand.result.provenance, 'self-reported')
    assert.equal(currentCommand.result.authorization, 'not-granted')
    const history = inspectTaskVerification({ request })
    assert.equal(history.valid, true, scenario.name)
    assert.equal(history.applicable, true)
    assert.equal(history.pass, scenario.pass)
    assert.equal(history.evidenceStatus, scenario.pass ? 'valid' : 'valid-failure')
    assert.equal(history.reason, scenario.pass ? 'VALID_SELF_REPORTED' : 'VALID_FAILED_CHECKS')
    assert.equal(history.provenance, 'self-reported')
    assert.equal(history.authorization, 'not-granted')
    // 非准入消费者不调用原 mtime 准入谓词。
    assert.equal(history.authorization, 'not-granted')
    const candidateRequest = Object.assign({}, request, { purpose: 'candidate' })
    assert.equal(inspectTaskVerification({ request: candidateRequest, currentCandidate: after }).valid, true)
    assert.equal(inspectTaskVerification({ request: candidateRequest }).reason, 'CURRENT_CANDIDATE_REQUIRED')
    const changed = structuredClone(after)
    changed.candidate.entries[0].bytes += 1
    assert.equal(inspectTaskVerification({ request: candidateRequest, currentCandidate: changed }).reason, 'INVALID_SNAPSHOT')
    assert.equal(inspectTaskVerification({ request: Object.assign({}, request, { purpose: 'pre-e2e' }) }).reason, 'PURPOSE_UNSUPPORTED')
    assert.equal(inspectTaskVerification({ request: Object.assign({}, request, { requiredChecks: ['other-check'] }) }).reason, 'REQUIRED_CHECKS_MISMATCH')
    assert.equal(inspectTaskVerification({ request: Object.assign({}, request, { scope: 'task' }) }).reason, 'RUN_OR_SCOPE_MISMATCH')
    if (scenario.pass) {
      const sourcePath = join(root, 'source.txt')
      const sourceMode = lstatSync(sourcePath).mode
      assert.equal(readFileSync(sourcePath, 'utf8'), 'synthetic public evidence source\n')
      try {
        writeFileSync(sourcePath, 'synthetic current capture changed source\n')
        const drifted = verificationCommand(['--verify-report', currentRequestPath, '--current'])
        assert.equal(drifted.exitCode, 2)
        assert.equal(drifted.result.reason, 'CANDIDATE_CHANGED_DURING_RUN')
        assert.equal(drifted.result.errors[0], 'CANDIDATE_CHANGED_DURING_RUN')
        assert.equal(drifted.result.valid, false)
        assert.equal(drifted.result.applicable, false)
        assert.equal(drifted.result.pass, false)
        assert.equal(drifted.result.authorization, 'not-granted')
        assert.equal(verificationCommand(['--verify-report', requestPath]).result.valid, true)
      } finally { writeFileSync(sourcePath, 'synthetic public evidence source\n') }
      assert.equal(lstatSync(sourcePath).mode, sourceMode)
      assert.equal(readFileSync(sourcePath, 'utf8'), 'synthetic public evidence source\n')
      const restored = verificationCommand(['--verify-report', currentRequestPath, '--current'])
      assert.equal(restored.exitCode, 0)
      assert.equal(restored.result.valid, true)
      assert.equal(restored.result.applicable, true)
      assert.equal(restored.result.pass, true)
      assert.equal(restored.result.reason, 'VALID_SELF_REPORTED')
      assert.equal(restored.result.authorization, 'not-granted')
      const undeclared = prefix + 'not-created.json'
      const altered = structuredClone(envelope)
      altered.artifacts[0].path = undeclared
      writeFileSync(join(root, reportPath), JSON.stringify(altered))
      const binding = inspectTaskVerification({ request })
      assert.equal(binding.reason, 'VERIFICATION_BINDING_MISMATCH')
      assert.equal(binding.evidenceStatus, 'invalid')
      const missing = inspectTaskVerification({ request: Object.assign({}, request, { artifactPaths: [undeclared] }) })
      assert.equal(missing.reason, 'VERIFICATION_ARTIFACT_MISSING')
      assert.equal(missing.evidenceStatus, 'missing')
      writeFileSync(join(root, reportPath), JSON.stringify(envelope))
      writeFileSync(join(root, rawPath), rawBytes + 'changed-bytes\n')
      const corrupt = inspectTaskVerification({ request })
      assert.equal(corrupt.reason, 'ARTIFACT_CHANGED')
      assert.equal(corrupt.evidenceStatus, 'corrupt')
      assert.equal(corrupt.pass, false)
      assert.equal(corrupt.authorization, 'not-granted')
      writeFileSync(join(root, rawPath), rawBytes)
      const brokenDigest = structuredClone(envelope)
      brokenDigest.result.pass = false
      writeFileSync(join(root, reportPath), JSON.stringify(brokenDigest))
      assert.equal(inspectTaskVerification({ request }).reason, 'REPORT_DIGEST_MISMATCH')
      writeFileSync(join(root, reportPath), '{"valid":true,"pass":true,')
      assert.equal(inspectTaskVerification({ request }).reason, 'VERIFICATION_REPORT_CORRUPT')
      writeFileSync(join(root, reportPath), JSON.stringify(envelope) + '\n')
      assert.equal(inspectTaskVerification({ request }).valid, true)
    }
  }
})

/* ------------------------------------------------------------------ 补丁治理增量 */

const PATCH_SPEC_BODY = '# 任务\n\n## 假设\n' + '这条改动依赖的关键假设写在正文里。'.repeat(3) + '\n\n## 证伪方式\n' + '什么可观测结果会证明假设是错的，写清楚命令。'.repeat(3) + '\n'

test.describe('补丁治理：规格假设/证伪 + 增量静默兜底', () => {
  test('readSpecSections 解析二级标题正文', () => {
    const sections = readSpecSections('# 标题\n\n## 假设\n假设正文\n\n### 子标题\n子正文\n\n## 证伪方式\n证伪正文\n')
    assert.equal(sections.get('假设').trim(), '假设正文\n\n### 子标题\n子正文')
    assert.equal(sections.get('证伪方式').trim(), '证伪正文')
  })

  test('inspectSpecContract：缺节与正文过短都要报', () => {
    const root = makeRepo('spec-contract')
    try {
      const spec = writeFileAt(root, 'specs/t.spec.md', '# 任务\n\n## 假设\n太短\n')
      const result = inspectSpecContract([{ path: spec }])
      assert.equal(result.ok, false)
      assert.deepEqual(result.missing.map((item) => item.section).sort(), ['假设', '证伪方式'].sort())
      writeFileAt(root, 'specs/t.spec.md', PATCH_SPEC_BODY)
      assert.equal(inspectSpecContract([{ path: spec }]).ok, true)
    } finally {
      cleanup(root)
    }
  })

  test('阻断记录被排除出验证证据（阻断 ≠ 通过）', () => {
    const root = makeRepo('blocker-not-evidence')
    try {
      const specPath = writeFileAt(root, 'specs/b.spec.md', PATCH_SPEC_BODY)
      utimesSync(specPath, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000))
      writeFileAt(root, 'docs/evidence/blockers/task.json', JSON.stringify({ kind: 'omnimux-blocker' }))
      assert.equal(hasEvidenceAfterSpec(root), false, '阻断记录不能充当验收证据')
      writeFileAt(root, 'docs/evidence/shot.png', 'png')
      assert.equal(hasEvidenceAfterSpec(root), true, '普通证据仍应被认可')
    } finally {
      cleanup(root)
    }
  })

  test('改业务源码但规格缺「证伪方式」→ deny', () => {
    const root = makeRepo('spec-deny')
    try {
      writeFileAt(root, 'specs/x.spec.md', '# 任务\n\n## 假设\n' + '只有假设没有证伪方式。'.repeat(4) + '\n')
      const decision = decideQualityGate({
        toolName: 'write',
        toolInput: { file_path: 'plugins/demo/src/a.js', content: 'export const a = 1\n' },
        cwd: root,
      })
      assert.equal(decision.decision, 'deny')
      assert.equal(decision.reason, 'spec-missing-falsifier')
    } finally {
      cleanup(root)
    }
  })

  test('交付时新增空 catch → deny new-silent-catch', () => {
    const root = makeRepo('delta-deny')
    try {
      writeFileAt(root, 'specs/y.spec.md', PATCH_SPEC_BODY)
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch {}\n}\n')
      const decision = decideQualityGate({
        toolName: 'bash',
        toolInput: { command: 'git commit -m "demo"' },
        cwd: root,
      })
      assert.equal(decision.decision, 'deny')
      assert.equal(decision.reason, 'new-silent-catch')
      assert.ok(Array.isArray(decision.hits) && decision.hits.length === 1)
      assert.equal(decision.hits[0].path, 'plugins/demo/src/a.js')
    } finally {
      cleanup(root)
    }
  })

  test('既有空 catch 仅行号漂移不误报', () => {
    const root = makeRepo('delta-shift')
    try {
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch {}\n}\n')
      gitIn(root, ['add', '.'])
      gitIn(root, ['commit', '-m', 'base plugin'])
      const base = String(gitIn(root, ['rev-parse', 'HEAD']).stdout).trim()
      gitIn(root, ['update-ref', 'refs/remotes/origin/main', base])
      writeFileAt(root, 'plugins/demo/src/a.js', '\n\n\nexport function a() {\n  try { run() } catch {}\n}\n')
      const result = newSilentCatchHits(root, { changedFiles: ['plugins/demo/src/a.js'] })
      assert.equal(result.error, null)
      assert.deepEqual(result.hits, [])
    } finally {
      cleanup(root)
    }
  })

  test('基线 ref 不可解析 → 返回 error（由调用方 fail-open）', () => {
    const root = makeRepo('delta-bad-ref')
    try {
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch {}\n}\n')
      const result = newSilentCatchHits(root, { baseRef: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', changedFiles: ['plugins/demo/src/a.js'] })
      assert.equal(result.error, 'invalid-base-ref')
      assert.deepEqual(result.hits, [])
    } finally {
      cleanup(root)
    }
  })

  test('非扫描范围文件不参与增量', () => {
    const root = makeRepo('delta-scope')
    try {
      writeFileAt(root, 'docs/demo.js', 'try { x() } catch {}\n')
      const result = newSilentCatchHits(root, { changedFiles: ['docs/demo.js'] })
      assert.equal(result.scanned, 0)
      assert.deepEqual(result.hits, [])
    } finally {
      cleanup(root)
    }
  })

  /* ---------------------------------------------- 批量基线读取（Issue #3510） */

  test('已跟踪文件新增空 catch 被检出（批量基线路径）', () => {
    const root = makeRepo('delta-tracked-add')
    try {
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch (error) { throw error }\n}\n')
      gitIn(root, ['add', '.'])
      gitIn(root, ['commit', '-m', 'base'])
      const base = String(gitIn(root, ['rev-parse', 'HEAD']).stdout).trim()
      gitIn(root, ['update-ref', 'refs/remotes/origin/main', base])
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch (error) { throw error }\n  try { run2() } catch {}\n}\n')
      const result = newSilentCatchHits(root, { changedFiles: ['plugins/demo/src/a.js'] })
      assert.equal(result.error, null)
      assert.equal(result.scanned, 1)
      assert.equal(result.hits.length, 1)
      assert.equal(result.hits[0].rule, 'SC1')
      assert.equal(result.hits[0].path, 'plugins/demo/src/a.js')
    } finally {
      cleanup(root)
    }
  })

  test('已跟踪文件只做无关改动不误报', () => {
    const root = makeRepo('delta-tracked-noise')
    try {
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch {}\n}\n')
      gitIn(root, ['add', '.'])
      gitIn(root, ['commit', '-m', 'base'])
      const base = String(gitIn(root, ['rev-parse', 'HEAD']).stdout).trim()
      gitIn(root, ['update-ref', 'refs/remotes/origin/main', base])
      writeFileAt(root, 'plugins/demo/src/a.js', '// 只改注释\nexport function a() {\n  try { run() } catch {}\n}\n')
      const result = newSilentCatchHits(root, { changedFiles: ['plugins/demo/src/a.js'] })
      assert.equal(result.error, null)
      assert.deepEqual(result.hits, [])
    } finally {
      cleanup(root)
    }
  })

  test('把 catch 体内的日志删掉（SC3 → SC1）被检出', () => {
    const root = makeRepo('delta-trace-removed')
    try {
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch (error) { logger.warn(error) }\n}\n')
      gitIn(root, ['add', '.'])
      gitIn(root, ['commit', '-m', 'base'])
      const base = String(gitIn(root, ['rev-parse', 'HEAD']).stdout).trim()
      gitIn(root, ['update-ref', 'refs/remotes/origin/main', base])
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch (error) {}\n}\n')
      const result = newSilentCatchHits(root, { changedFiles: ['plugins/demo/src/a.js'] })
      assert.equal(result.error, null)
      assert.equal(result.hits.length, 1)
      assert.equal(result.hits[0].rule, 'SC1')
    } finally {
      cleanup(root)
    }
  })

  test('当前文件已无 catch 时跳过基线读取', () => {
    const root = makeRepo('delta-no-catch')
    try {
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch {}\n}\n')
      gitIn(root, ['add', '.'])
      gitIn(root, ['commit', '-m', 'base'])
      const base = String(gitIn(root, ['rev-parse', 'HEAD']).stdout).trim()
      gitIn(root, ['update-ref', 'refs/remotes/origin/main', base])
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  return run()\n}\n')
      const result = newSilentCatchHits(root, { changedFiles: ['plugins/demo/src/a.js'] })
      assert.equal(result.error, null)
      assert.deepEqual(result.hits, [])
    } finally {
      cleanup(root)
    }
  })

  // #3838：门禁提示说「写进 allowlist 可豁免」，但增量路径此前不读 allowlist。
  test('allowlist 命中 → 该条不进 hits（增量路径真正豁免）', () => {
    const root = makeRepo('delta-allow-hit')
    try {
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch {}\n}\n')
      gitIn(root, ['add', '.'])
      gitIn(root, ['commit', '-m', 'base plugin'])
      const base = String(gitIn(root, ['rev-parse', 'HEAD']).stdout).trim()
      gitIn(root, ['update-ref', 'refs/remotes/origin/main', base])
      // 新增一处空 catch（SC1）
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch {}\n  try { run2() } catch {}\n}\n')
      const before = newSilentCatchHits(root, { changedFiles: ['plugins/demo/src/a.js'] })
      assert.equal(before.hits.length, 1, '无 allowlist 时必须阻断')
      const hitLine = before.hits[0].line
      // 按提示写入 allowlist
      writeFileAt(root, 'scripts/silent-catch-allowlist.json', JSON.stringify({
        entries: [{
          path: 'plugins/demo/src/a.js',
          rule: before.hits[0].rule,
          line: hitLine,
          reason: '测试用：刻意吞错，验证增量路径读取 allowlist',
        }],
      }, null, 2))
      const after = newSilentCatchHits(root, { changedFiles: ['plugins/demo/src/a.js'] })
      assert.equal(after.error, null)
      assert.deepEqual(after.hits, [], 'allowlist 命中后不得再阻断')
    } finally {
      cleanup(root)
    }
  })

  test('allowlist 存在但未命中（行号不同）→ 仍然阻断', () => {
    const root = makeRepo('delta-allow-miss')
    try {
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch {}\n}\n')
      gitIn(root, ['add', '.'])
      gitIn(root, ['commit', '-m', 'base plugin'])
      const base = String(gitIn(root, ['rev-parse', 'HEAD']).stdout).trim()
      gitIn(root, ['update-ref', 'refs/remotes/origin/main', base])
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch {}\n  try { run2() } catch {}\n}\n')
      writeFileAt(root, 'scripts/silent-catch-allowlist.json', JSON.stringify({
        entries: [{ path: 'plugins/demo/src/a.js', rule: 'SC1', line: 999, reason: '行号不匹配，不应豁免这一条' }],
      }, null, 2))
      const result = newSilentCatchHits(root, { changedFiles: ['plugins/demo/src/a.js'] })
      assert.equal(result.hits.length, 1, '行号不匹配时仍须阻断')
    } finally {
      cleanup(root)
    }
  })

  test('allowlist 非法 → 返回 error，不放行全部', () => {
    const root = makeRepo('delta-allow-bad')
    try {
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch {}\n}\n')
      gitIn(root, ['add', '.'])
      gitIn(root, ['commit', '-m', 'base plugin'])
      const base = String(gitIn(root, ['rev-parse', 'HEAD']).stdout).trim()
      gitIn(root, ['update-ref', 'refs/remotes/origin/main', base])
      writeFileAt(root, 'plugins/demo/src/a.js', 'export function a() {\n  try { run() } catch {}\n  try { run2() } catch {}\n}\n')
      // 缺 line 字段 → loadAllowlist 会报错
      writeFileAt(root, 'scripts/silent-catch-allowlist.json', JSON.stringify({
        entries: [{ path: 'plugins/demo/src/a.js', rule: 'SC1', reason: '缺 line 字段的非法条目' }],
      }, null, 2))
      const result = newSilentCatchHits(root, { changedFiles: ['plugins/demo/src/a.js'] })
      assert.match(String(result.error), /allowlist-invalid/, '非法 allowlist 必须显式报错')
    } finally {
      cleanup(root)
    }
  })
})
