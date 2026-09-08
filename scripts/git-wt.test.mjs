import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const scriptPath = join(here, 'git-wt.sh')

describe('scripts/git-wt.sh worktree helper', () => {
  it('exists and is executable', () => {
    assert.ok(existsSync(scriptPath), 'scripts/git-wt.sh must exist')
    const content = readFileSync(scriptPath, 'utf8')
    assert.ok(content.startsWith('#!/usr/bin/env bash'), 'must have bash shebang')
    assert.ok(content.includes('agent/${plugin}-${topic}'), 'follows branch naming contract')
    assert.ok(content.includes('omnimux-dsh-wt-'), 'follows sibling directory naming contract')
    assert.ok(content.includes('clean_issue'), 'supports Issue ID binding')
    assert.ok(content.includes('cmd_finish'), 'includes finish command implementation')
  })

  it('prints usage on invalid / empty arguments and documents finish subcommand', () => {
    try {
      execSync(`"${scriptPath}"`, { encoding: 'utf8' })
      assert.fail('should fail on empty args')
    } catch (err) {
      assert.ok(err.stdout.includes('OmniMux 多 Agent Worktree 隔离与管理工具'))
      assert.ok(err.stdout.includes('start <plugin> <topic> [issue_id]'))
      assert.ok(err.stdout.includes('finish <topic> [issue_id] [flags]'))
      assert.ok(err.stdout.includes('clean <topic> [issue_id]'))
      assert.ok(err.stdout.includes('--skip-test'))
      assert.ok(err.stdout.includes('--skip-sync'))
      assert.ok(err.stdout.includes('--skip-push'))
    }
  })

  it('runs doctor successfully and includes remote sync status', () => {
    const out = execSync(`"${scriptPath}" doctor`, { encoding: 'utf8' })
    assert.ok(out.includes('检查主仓库纯净度'))
    assert.ok(out.includes('检查主仓库与远端同步状态'))
    assert.ok(out.includes('origin/main'))
    assert.ok(out.includes('活跃 Worktree 数量'))
  })

  it('runs list successfully', () => {
    const out = execSync(`"${scriptPath}" list`, { encoding: 'utf8' })
    assert.ok(out.includes('OmniMux 活跃 Worktree 清单'))
    assert.ok(out.includes('omnimux-dsh'))
  })

  it('fails finish when topic argument is missing', () => {
    try {
      execSync(`"${scriptPath}" finish`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      assert.fail('should have failed with missing topic')
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : ''
      assert.ok(stderr.includes('必须提供 <topic>'), 'should report missing topic')
    }
  })

  it('fails finish when worktree directory does not exist', () => {
    try {
      execSync(`"${scriptPath}" finish nonexistent-test-topic-xyz999`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      assert.fail('should have failed with nonexistent worktree')
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : ''
      assert.ok(stderr.includes('未找到 Worktree 目录'), 'should report nonexistent worktree directory')
    }
  })
})

describe('scripts/git-wt.sh finish lifecycle in isolated environment', () => {
  let testRoot
  let remoteRepo
  let mainRepo
  let scriptCopy

  const setupSandbox = () => {
    const runId = Math.random().toString(36).substring(2, 9)
    testRoot = join(tmpdir(), `omnimux-wt-test-${runId}`)
    remoteRepo = join(testRoot, 'origin-remote.git')
    mainRepo = join(testRoot, 'omnimux-dsh')

    mkdirSync(testRoot, { recursive: true })

    // 1. 创建裸仓作为 origin
    execSync(`git init --bare "${remoteRepo}" -b main`, { stdio: 'ignore' })

    // 2. 初始化主仓
    mkdirSync(mainRepo, { recursive: true })
    execSync(`git init -b main "${mainRepo}"`, { stdio: 'ignore' })
    execSync(`git -C "${mainRepo}" config user.name "Test Agent"`, { stdio: 'ignore' })
    execSync(`git -C "${mainRepo}" config user.email "agent@omnimux.test"`, { stdio: 'ignore' })

    // 3. 构造必要目录结构 (scripts, plugins/omnimux-workflow)
    mkdirSync(join(mainRepo, 'scripts'), { recursive: true })
    mkdirSync(join(mainRepo, 'plugins', 'omnimux-workflow'), { recursive: true })

    // 复制 git-wt.sh 到主仓 scripts 目录
    scriptCopy = join(mainRepo, 'scripts', 'git-wt.sh')
    const originalScript = readFileSync(scriptPath, 'utf8')
    writeFileSync(scriptCopy, originalScript, { mode: 0o755 })

    // 创建 package.json
    writeFileSync(join(mainRepo, 'package.json'), JSON.stringify({
      name: 'omnimux-dsh',
      private: true,
      scripts: {
        wt: 'bash scripts/git-wt.sh',
        'wt:finish': 'bash scripts/git-wt.sh finish',
        test: 'echo "common test pass"'
      }
    }, null, 2))

    // 隔离嵌套 TMPDIR 中的父 workspace；派生 worktree 继承此边界。
    writeFileSync(join(mainRepo, 'pnpm-workspace.yaml'), 'packages:\n  - "plugins/*"\n')

    // 创建 plugins/omnimux-workflow/package.json
    writeFileSync(join(mainRepo, 'plugins', 'omnimux-workflow', 'package.json'), JSON.stringify({
      name: 'omnimux-workflow',
      version: '1.0.0',
      scripts: {
        test: 'echo "omnimux-workflow test pass"'
      }
    }, null, 2))

    // 创建 sync-to-app.sh 模拟脚本
    const syncScript = join(mainRepo, 'scripts', 'sync-to-app.sh')
    writeFileSync(syncScript, `#!/usr/bin/env bash\necho "MOCK SYNC: $1 synced"\nexit 0\n`, { mode: 0o755 })

    // 创建 dev-env.sh 模拟脚本（L2 独立环境：start 打印 port/URL，ls/rm 可驱动）
    // 供 wt dev / finish L2 门禁 / clean 回收测试使用。
    const devEnvScript = join(mainRepo, 'scripts', 'dev-env.sh')
    writeFileSync(devEnvScript, `#!/usr/bin/env bash
cmd="\$1"; name="\${2:-}"
case "\$cmd" in
  start)
    plugin="\${3:-}"
    echo "✓ dev 环境已启动: omnimux-dev-\$name"
    echo "  URL:   http://127.0.0.1:44201"
    echo "  port:  44201"
    echo "  link:  \$plugin"
    echo "  source: \${OMNIMUX_PLUGINS_DIR:-<default>}"
    ;;
  ls)
    if [ -n "\${MOCK_LS_TASKS_FILE}" ] && [ -f "\${MOCK_LS_TASKS_FILE}" ]; then cat "\${MOCK_LS_TASKS_FILE}"; fi
    ;;
  rm)
    echo "✓ 已删除环境 omnimux-dev-\$name"
    ;;
esac
exit 0
`, { mode: 0o755 })

    // 提交主干并推送到 remote
    execSync(`git -C "${mainRepo}" add .`, { stdio: 'ignore' })
    execSync(`git -C "${mainRepo}" commit -m "chore: initial main commit"`, { stdio: 'ignore' })
    execSync(`git -C "${mainRepo}" remote add origin "${remoteRepo}"`, { stdio: 'ignore' })
    execSync(`git -C "${mainRepo}" push -u origin main`, { stdio: 'ignore' })
  }

  const cleanupSandbox = () => {
    if (testRoot && existsSync(testRoot)) {
      try {
        rmSync(testRoot, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
      }
    }
  }

  it('aborts finish when worktree has uncommitted dirty changes', () => {
    setupSandbox()
    try {
      // 1. 从主仓切出 worktree
      const startOut = execSync(`bash "${scriptCopy}" start workflow demo-node 101`, {
        cwd: mainRepo,
        encoding: 'utf8'
      })
      assert.ok(startOut.includes('Worktree 已就绪'))

      const wtDir = join(testRoot, 'omnimux-dsh-wt-demo-node-101')
      assert.ok(existsSync(wtDir), 'Worktree directory must exist')

      // 2. 在 worktree 中写入未暂存/未提交文件
      writeFileSync(join(wtDir, 'dirty-file.txt'), 'uncommitted content')

      // 3. 执行 finish，预期因未提交改动被守卫拦截
      try {
        execSync(`bash "${scriptCopy}" finish demo-node 101 --skip-test --skip-sync --skip-push`, {
          cwd: mainRepo,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        })
        assert.fail('should have aborted on dirty worktree')
      } catch (err) {
        const stderr = err.stderr ? err.stderr.toString() : ''
        assert.ok(stderr.includes('Worktree 存在未提交的改动') || stderr.includes('未提交文件清单'))
      }

      // 4. 确认 Worktree 现场完好保留
      assert.ok(existsSync(wtDir), 'Worktree must be preserved for debugging on dirty error')
    } finally {
      cleanupSandbox()
    }
  })

  it('aborts finish when gate test fails, keeping worktree intact for debugging', () => {
    setupSandbox()
    try {
      // 1. 切出 worktree
      execSync(`bash "${scriptCopy}" start workflow failing-gate 102`, {
        cwd: mainRepo,
        stdio: 'ignore'
      })
      const wtDir = join(testRoot, 'omnimux-dsh-wt-failing-gate-102')

      // 2. 在 worktree 中引入一个会令单测失败的改动
      const failPkgJson = {
        name: 'omnimux-workflow',
        version: '1.0.0',
        scripts: {
          test: 'echo "TEST_FAIL_REASON" >&2 && exit 1'
        }
      }
      writeFileSync(join(wtDir, 'plugins', 'omnimux-workflow', 'package.json'), JSON.stringify(failPkgJson, null, 2))
      execSync(`git -C "${wtDir}" add .`, { stdio: 'ignore' })
      execSync(`git -C "${wtDir}" commit -m "feat(workflow): breaking change"`, { stdio: 'ignore' })

      // 3. 执行 finish (不带 --skip-test)
      try {
        execSync(`bash "${scriptCopy}" finish failing-gate 102 --skip-sync --skip-push`, {
          cwd: mainRepo,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        })
        assert.fail('should have aborted on test failure')
      } catch (err) {
        const stderr = err.stderr ? err.stderr.toString() : ''
        assert.ok(stderr.includes('门禁测试失败') || stderr.includes('已阻断主干合并'))
      }

      // 4. 确认现场保留，主仓未被污染
      assert.ok(existsSync(wtDir), 'Worktree must be preserved when gate test fails')
      const mainLog = execSync(`git -C "${mainRepo}" log -n 1 --oneline`, { encoding: 'utf8' })
      assert.ok(!mainLog.includes('breaking change'), 'Main branch must not contain failing commits')
    } finally {
      cleanupSandbox()
    }
  })

  it('pushes the feature branch only — never merges into local main or deletes the worktree before MERGED', () => {
    setupSandbox()
    try {
      const startOut = execSync(`bash "${scriptCopy}" start workflow table-action 103`, {
        cwd: mainRepo,
        encoding: 'utf8'
      })
      assert.ok(startOut.includes('Worktree 已就绪'))

      const wtDir = join(testRoot, 'omnimux-dsh-wt-table-action-103')
      assert.ok(existsSync(wtDir))

      writeFileSync(join(wtDir, 'plugins', 'omnimux-workflow', 'table-feature.js'), 'export const action = "done";')
      execSync(`git -C "${wtDir}" add .`, { stdio: 'ignore' })
      execSync(`git -C "${wtDir}" commit -m "feat(workflow): implement table action"`, { stdio: 'ignore' })

      const finishOut = execSync(`bash "${scriptCopy}" finish table-action 103 --skip-sync --skip-l2`, {
        cwd: mainRepo,
        encoding: 'utf8'
      })

      assert.ok(finishOut.includes('步骤 1: 检查 Worktree 状态'))
      assert.ok(finishOut.includes('识别对应插件模块: [omnimux-workflow]'))
      assert.ok(finishOut.includes('步骤 4: 推送特性分支'))
      assert.ok(finishOut.includes('禁止直推 main'))
      assert.ok(!finishOut.includes('合入主仓 main'))
      assert.ok(!finishOut.includes('推送主仓 main 到远端 origin/main'))
      assert.ok(finishOut.includes('未完成') || finishOut.includes('Worktree 与特性分支已保留'))
      assert.ok(finishOut.includes('任务交付透明看板') || finishOut.includes('Delivery Board'))
      assert.ok(!finishOut.includes('🎯 交付状态:      ✅ 100% 完成'))

      assert.ok(existsSync(wtDir), 'Worktree must stay until PR is MERGED')
      assert.ok(!existsSync(join(mainRepo, 'plugins', 'omnimux-workflow', 'table-feature.js')), 'Local main must not receive the feature via finish')
      const mainLog = execSync(`git -C "${mainRepo}" log -n 1 --oneline`, { encoding: 'utf8' })
      assert.ok(!mainLog.includes('implement table action'), 'Local main must stay on the previous tip')
      const remoteBranches = execSync(`git -C "${remoteRepo}" branch`, { encoding: 'utf8' })
      assert.ok(remoteBranches.includes('agent/workflow-table-action-issue-103'), 'Feature branch must be on origin')
    } finally {
      cleanupSandbox()
    }
  })

  it('supports finish flags (--skip-test, --skip-sync, --skip-push) without merging or destroying the sandbox', () => {
    setupSandbox()
    try {
      execSync(`bash "${scriptCopy}" start common quick-fix 104`, {
        cwd: mainRepo,
        stdio: 'ignore'
      })
      const wtDir = join(testRoot, 'omnimux-dsh-wt-quick-fix-104')

      writeFileSync(join(wtDir, 'quick-fix.txt'), 'fixed')
      execSync(`git -C "${wtDir}" add .`, { stdio: 'ignore' })
      execSync(`git -C "${wtDir}" commit -m "fix(common): quick fix issue 104"`, { stdio: 'ignore' })

      const finishOut = execSync(`bash "${scriptCopy}" finish quick-fix 104 --skip-test --skip-sync --skip-push --skip-l2`, {
        cwd: mainRepo,
        encoding: 'utf8'
      })

      assert.ok(finishOut.includes('跳过本地门禁测试 (--skip-test)'))
      assert.ok(finishOut.includes('--skip-push'))
      assert.ok(finishOut.includes('未完成') || finishOut.includes('Worktree 与特性分支已保留'))
      assert.ok(existsSync(wtDir), 'Worktree must be preserved when not MERGED')
      assert.ok(!existsSync(join(mainRepo, 'quick-fix.txt')), 'Local main must not absorb unpushed work')
    } finally {
      cleanupSandbox()
    }
  })

  it('finish blocks when L2 evidence is missing, unless --skip-l2 is explicit', () => {
    setupSandbox()
    try {
      execSync(`bash "${scriptCopy}" start common l2missing 105`, {
        cwd: mainRepo,
        stdio: 'ignore'
      })
      const wtDir = join(testRoot, 'omnimux-dsh-wt-l2missing-105')
      writeFileSync(join(wtDir, 'l2-feature.txt'), 'needs independent env')
      execSync(`git -C "${wtDir}" add .`, { stdio: 'ignore' })
      execSync(`git -C "${wtDir}" commit -m "feat(common): l2 gate test"`, { stdio: 'ignore' })

      // 1. 无 .l2-dev.env → 阻断
      try {
        execSync(`bash "${scriptCopy}" finish l2missing 105 --skip-test --skip-sync --skip-push`, {
          cwd: mainRepo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
        })
        assert.fail('should have blocked on missing L2 evidence')
      } catch (err) {
        const msg = `${err.stdout || ''}${err.stderr || ''}`
        assert.ok(msg.includes('缺少 L2 独立环境验证记录'), `expected L2 gate block, got: ${msg}`)
      }
      assert.ok(existsSync(wtDir), 'Worktree preserved after L2 gate block')

      // 2. --skip-l2 显式放行
      const skipOut = execSync(`bash "${scriptCopy}" finish l2missing 105 --skip-test --skip-sync --skip-push --skip-l2`, {
        cwd: mainRepo, encoding: 'utf8'
      })
      assert.ok(skipOut.includes('L2 验证门禁跳过 (--skip-l2)'))
    } finally {
      cleanupSandbox()
    }
  })

  it('dev subcommand starts an L2 environment from the worktree source and writes .l2-dev.env', () => {
    setupSandbox()
    try {
      execSync(`bash "${scriptCopy}" start workflow l2dev 106`, {
        cwd: mainRepo,
        stdio: 'ignore'
      })
      const wtDir = join(testRoot, 'omnimux-dsh-wt-l2dev-106')

      const devOut = execSync(`bash "${scriptCopy}" dev l2dev 106`, {
        cwd: mainRepo,
        encoding: 'utf8'
      })
      assert.ok(devOut.includes('omnimux-dev-l2dev'), 'should start the L2 task env')
      assert.ok(devOut.includes('44201'), 'should report the independent L2 port')
      assert.ok(devOut.includes(wtDir), 'should point source into the worktree')

      const envFile = join(wtDir, '.l2-dev.env')
      assert.ok(existsSync(envFile), '.l2-dev.env must be written')
      const env = readFileSync(envFile, 'utf8')
      assert.ok(env.includes('PLUGIN=omnimux-workflow'))
      assert.ok(env.includes('PORT=44201'))
      assert.ok(env.includes('SOURCE='), 'must record the source path')
    } finally {
      cleanupSandbox()
    }
  })

  it('clean recycles the matching L2 task environment', () => {
    setupSandbox()
    try {
      execSync(`bash "${scriptCopy}" start common l2clean 107`, {
        cwd: mainRepo,
        stdio: 'ignore'
      })
      const wtDir = join(testRoot, 'omnimux-dsh-wt-l2clean-107')
      writeFileSync(join(wtDir, 'l2-clean.txt'), 'recycle me')
      execSync(`git -C "${wtDir}" add .`, { stdio: 'ignore' })
      execSync(`git -C "${wtDir}" commit -m "feat(common): l2 clean test"`, { stdio: 'ignore' })

      // 模拟存在 L2 任务环境
      const tasksFile = join(testRoot, 'l2-tasks.txt')
      writeFileSync(tasksFile, 'omnimux-dev-l2clean  [running]  port:44201\n')

      // --force 跳过 MERGED 校验，专注回收逻辑
      const cleanOut = execSync(
        `bash "${scriptCopy}" clean l2clean 107 --force`,
        { cwd: mainRepo, encoding: 'utf8', env: { ...process.env, MOCK_LS_TASKS_FILE: tasksFile } },
      )
      assert.ok(cleanOut.includes('L2 任务环境 omnimux-dev-l2clean 已回收'), `expected recycle, got: ${cleanOut}`)
    } finally {
      cleanupSandbox()
    }
  })

  it('clean honors --force even without an issue_id (arg parsing regression)', () => {
    setupSandbox()
    try {
      execSync(`bash "${scriptCopy}" start common cleanforce 108`, {
        cwd: mainRepo,
        stdio: 'ignore'
      })
      const wtDir = join(testRoot, 'omnimux-dsh-wt-cleanforce-108')
      writeFileSync(join(wtDir, 'clean-force.txt'), 'remove me')
      execSync(`git -C "${wtDir}" add .`, { stdio: 'ignore' })
      execSync(`git -C "${wtDir}" commit -m "feat(common): clean force test"`, { stdio: 'ignore' })

      // 无 issue_id，--force 必须被正确识别（不能被吞成 issue_id）
      const cleanOut = execSync(`bash "${scriptCopy}" clean cleanforce --force`, {
        cwd: mainRepo,
        encoding: 'utf8',
      })
      assert.ok(!cleanOut.includes('未声明 --pr / --force'), '--force must be recognized without issue_id')
      assert.ok(cleanOut.includes('Worktree 与分支清理完成'), 'should finish the clean')
      assert.ok(!existsSync(wtDir), 'worktree must be removed')
    } finally {
      cleanupSandbox()
    }
  })
})
