import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execSync, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  decideBashCommand,
  decideWrite,
  isDestructiveResetCommand,
} from './guard-worktree.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const rawRoot = join(here, '..')
const repoRoot = rawRoot.includes('-wt-') ? '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh' : rawRoot
const scriptPath = join(here, 'guard-worktree.mjs')
const gitWtPath = join(here, 'git-wt.sh')

function runHook(payload, cwd = repoRoot) {
  const res = spawnSync('node', [scriptPath], {
    cwd,
    encoding: 'utf8',
    input: JSON.stringify(payload),
  })
  assert.equal(res.status, 0, `guard exited ${res.status}: ${res.stderr}`)
  return JSON.parse(res.stdout)
}

function makeUnpushedRepo() {
  const root = join(tmpdir(), `omnimux-sim-${Math.random().toString(36).slice(2, 9)}`)
  mkdirSync(root, { recursive: true })
  const remote = join(root, 'origin.git')
  const local = join(root, 'repo')
  mkdirSync(local)
  execSync(`git init --bare "${remote}" -b main`, { stdio: 'ignore' })
  execSync(`git init -b main "${local}"`, { stdio: 'ignore' })
  execSync(`git -C "${local}" config user.name "sim"`, { stdio: 'ignore' })
  execSync(`git -C "${local}" config user.email "sim@test"`, { stdio: 'ignore' })
  writeFileSync(join(local, 'seed.txt'), 'seed')
  execSync(`git -C "${local}" add seed.txt`, { stdio: 'ignore' })
  execSync(`git -C "${local}" commit -m "seed"`, { stdio: 'ignore' })
  execSync(`git -C "${local}" remote add origin "${remote}"`, { stdio: 'ignore' })
  execSync(`git -C "${local}" push -u origin main`, { stdio: 'ignore' })
  writeFileSync(join(local, 'local-only.txt'), 'must-not-be-wiped')
  execSync(`git -C "${local}" add local-only.txt`, { stdio: 'ignore' })
  execSync(`git -C "${local}" commit -m "unpushed local work"`, { stdio: 'ignore' })
  return { root, local }
}

describe('Multi-Agent Automated Lifecycle & Destructive Incident Simulation', () => {
  it('Phase 1: Agent 1 (许清楚) & Agent 2 (高见远) Worktree Isolation Enforced', () => {
    const primary = join(here, `.lifecycle-fixture-${process.pid}`)
    mkdirSync(primary)
    try {
      execSync('git init -b main', { cwd: primary, stdio: 'ignore' })
      writeFileSync(join(primary, 'package.json'), '{}\n')
      execSync('git add package.json && git -c user.name=sim -c user.email=sim@test commit -m seed', { cwd: primary, stdio: 'ignore' })
      const linked = join(primary, '.worktrees', 'agent')
      execSync(`git worktree add -b agent "${linked}"`, { cwd: primary, stdio: 'ignore' })
      const mainWriteResult = decideWrite({ toolName: 'edit', cwd: primary, filePath: 'package.json' })
      assert.equal(mainWriteResult.decision, 'deny')
      assert.equal(mainWriteResult.reason, 'tracked-file')
      const wtWriteResult = decideWrite({ toolName: 'edit', cwd: linked, filePath: 'package.json' })
      assert.equal(wtWriteResult.decision, 'allow')
    } finally {
      rmSync(primary, { recursive: true, force: true })
    }
  })

  it('Phase 2: unpushed commits make git -C reset --hard deny, and the commit stays', () => {
    const { root, local } = makeUnpushedRepo()
    try {
      const sha = execSync(`git -C "${local}" rev-parse HEAD`, { encoding: 'utf8' }).trim()
      const variants = [
        'git reset --hard origin/main',
        `git -C "${local}" reset --hard origin/main`,
        'gh pr merge && git reset --hard origin/main',
      ]
      for (const command of variants) {
        assert.equal(isDestructiveResetCommand(command), true, command)
        const decision = decideBashCommand({ command, cwd: local })
        assert.equal(decision.decision, 'deny', command)
        assert.equal(decision.reason, 'unpushed-commits-at-risk')
        const hook = runHook(
          {
            hook_event_name: 'PreToolUse',
            tool_name: 'bash',
            tool_input: { command },
            cwd: local,
          },
          local,
        )
        assert.equal(hook.hookSpecificOutput.permissionDecision, 'deny')
      }
      const still = execSync(`git -C "${local}" rev-parse HEAD`, { encoding: 'utf8' }).trim()
      assert.equal(still, sha)
      assert.ok(existsSync(join(local, 'local-only.txt')))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('Phase 3: finish 契约禁止本地合 main / 直推 main，看板禁止假阳性 100%', () => {
    const src = readFileSync(gitWtPath, 'utf8')
    assert.equal(/\bgit(?:\s+-C\s+\S+)?\s+push\s+origin\s+main\b/.test(src), false)
    assert.equal(/\bmerge\s+--no-ff\b/.test(src), false)
    assert.ok(src.includes('禁止直推 main') || src.includes('推送特性分支'))
    assert.ok(src.includes('未完成') || src.includes('禁止宣称 100% 完成'))
    assert.ok(!src.includes('🎯 交付状态:      ✅ 100% 完成'))

    const hooksConfig = JSON.parse(readFileSync(join(here, '..', '.dsh/hooks.json'), 'utf8'))
    const matchers = hooksConfig.PreToolUse.map((h) => h.matcher)
    assert.ok(matchers.some((m) => m.includes('edit') && m.includes('write') && m.includes('bash')))

    const syncSrc = readFileSync(join(here, 'sync-to-app.sh'), 'utf8')
    assert.ok(syncSrc.includes('assert_origin_main_aligned'))
    assert.ok(!syncSrc.includes('放行 L2 任务目录'))
  })
})
