import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

for (const scenario of ['missing-pr', 'open-pr', 'wrong-head', 'merged-pr']) {
  test(`worktree ship ${scenario}: require the matching merged PR and retain acceptance workspace`, () => {
    const fixture = mkdtempSync(join(tmpdir(), 'omnimux-ship-'))
    const repo = join(fixture, 'repo')
    const remote = join(fixture, 'origin.git')
    const bin = join(fixture, 'bin')
    const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    try {
      mkdirSync(repo)
      mkdirSync(bin)
      git('init', '--bare', '-b', 'main', remote)
      git('init', '-b', 'main')
      git('config', 'user.name', 'delivery-test')
      git('config', 'user.email', 'delivery@example.test')
      mkdirSync(join(repo, 'scripts'))
      copyFileSync(join(root, 'scripts/worktree.sh'), join(repo, 'scripts/worktree.sh'))
      writeFileSync(join(repo, '.gitignore'), '.worktrees/\n')
      git('add', '.')
      git('commit', '-m', 'seed')
      git('remote', 'add', 'origin', remote)
      git('push', '-u', 'origin', 'main')
      const before = git('rev-parse', 'HEAD')
      const worktree = join(repo, '.worktrees/common-feature')
      git('worktree', 'add', '-b', 'agent/common-feature', worktree)
      writeFileSync(join(worktree, 'feature.txt'), 'pending acceptance\n')
      git('-C', worktree, 'add', 'feature.txt')
      git('-C', worktree, 'commit', '-m', 'feature')
      const head = git('-C', worktree, 'rev-parse', 'HEAD')
      if (scenario === 'merged-pr') git('push', 'origin', 'agent/common-feature:main')
      const state = scenario === 'open-pr' ? 'OPEN' : 'MERGED'
      writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncase "$*" in\n  *'--json state -q .state'*) echo '${state}' ;;\n  *) printf '%s\\t%s\\t%s\\t%s\\n' '${state}' 'agent/common-feature' '${scenario === 'wrong-head' ? before : head}' 'main' ;;\nesac\n`, { mode: 0o755 })
      const args = ['scripts/worktree.sh', 'ship', 'common-feature']
      if (scenario !== 'missing-pr') args.push('--pr', '864')
      const result = spawnSync('bash', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
      assert.equal(result.status, scenario === 'merged-pr' ? 0 : 1, `${result.stdout}\n${result.stderr}`)
      assert.equal(git('rev-parse', 'HEAD'), scenario === 'merged-pr' ? head : before)
      assert.equal(git('--git-dir', remote, 'rev-parse', 'main'), scenario === 'merged-pr' ? head : before, 'ship must never push main')
      assert.ok(existsSync(join(worktree, 'feature.txt')), 'retain worktree through post-merge acceptance')
      if (scenario === 'merged-pr') assert.match(result.stdout, /acceptance.*pending/i)
    } finally { rmSync(fixture, { recursive: true, force: true }) }
  })
}

test('worktree ship auto-triggers materialization when plugins are modified', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'omnimux-ship-auto-mat-'))
  const repo = join(fixture, 'repo')
  const remote = join(fixture, 'origin.git')
  const bin = join(fixture, 'bin')
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    mkdirSync(repo)
    mkdirSync(bin)
    git('init', '--bare', '-b', 'main', remote)
    git('init', '-b', 'main')
    git('config', 'user.name', 'delivery-test')
    git('config', 'user.email', 'delivery@example.test')
    mkdirSync(join(repo, 'scripts'))
    copyFileSync(join(root, 'scripts/worktree.sh'), join(repo, 'scripts/worktree.sh'))
    writeFileSync(join(repo, '.gitignore'), '.worktrees/\n')
    // 模拟一个 sync-to-app.sh 脚本，用于断言是否被正确调用
    writeFileSync(join(repo, 'scripts/sync-to-app.sh'), '#!/bin/sh\necho "SYNC_CALLED: $*" > sync_receipt.txt\n', { mode: 0o755 })
    git('add', '.')
    git('commit', '-m', 'seed')
    git('remote', 'add', 'origin', remote)
    git('push', '-u', 'origin', 'main')

    const worktree = join(repo, '.worktrees/plugin-feature')
    git('worktree', 'add', '-b', 'agent/plugin-feature', worktree)
    mkdirSync(join(worktree, 'plugins/omnimux-workflow/src'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux-workflow/src/index.ts'), 'export const a = 1;\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'feat(workflow): test')
    const head = git('-C', worktree, 'rev-parse', 'HEAD')
    git('push', 'origin', 'agent/plugin-feature:main')

    writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncase "$*" in\n  *'--json state -q .state'*) echo 'MERGED' ;;\n  *) printf 'MERGED\\tagent/plugin-feature\\t${head}\\tmain\\n' ;;\nesac\n`, { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'ship', 'plugin-feature', '--pr', '999'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /自动物化.*omnimux-workflow/)
    assert.ok(existsSync(join(repo, 'sync_receipt.txt')), 'sync-to-app.sh must be automatically executed')
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})
