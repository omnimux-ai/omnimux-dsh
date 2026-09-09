import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { copySyncScripts } from './sync-fixtures.test.mjs'

const here = dirname(fileURLToPath(import.meta.url))
function fixture(t, state = 'aligned') {
  const home = mkdtempSync(join(tmpdir(), 'omnimux-sync-main-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const repo = join(home, 'repo')
  copySyncScripts(repo)
  const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
  for (const key of Object.keys(gitEnv)) if (key.startsWith('GIT_') && !['GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL'].includes(key)) delete gitEnv[key]
  const git = (...args) => {
    const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: gitEnv })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git('init', '-b', 'main')
  git('config', 'user.name', 'Test Agent')
  git('config', 'user.email', 'agent@omnimux.test')
  git('add', '.')
  git('commit', '-m', 'fixture: clean main')
  const remote = join(home, 'remote.git')
  spawnSync('git', ['init', '--bare', remote], { encoding: 'utf8', env: gitEnv })
  git('remote', 'add', 'origin', remote)
  git('push', 'origin', 'main')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  if (state === 'feature' || state === 'master') git('switch', '-c', state)
  if (state === 'detached') git('checkout', '--detach')
  if (state === 'dirty') writeFileSync(join(repo, 'scripts/sync-main.sh'), readFileSync(join(repo, 'scripts/sync-main.sh'), 'utf8') + '\n')
  if (state === 'untracked') writeFileSync(join(repo, 'untracked'), 'dirty')
  if (state === 'missing-ref') { git('update-ref', '-d', 'refs/remotes/origin/main'); git('remote', 'remove', 'origin'); }
  if (state === 'non-git') rmSync(join(repo, '.git'), { recursive: true })
  if (state === 'ahead' || state === 'behind') {
    git('commit', '--allow-empty', '-m', 'fixture: next main')
    if (state === 'behind') { git('push', 'origin', 'main'); git('checkout', 'HEAD~1', '-B', 'main') }
  }
  const target = join(home, 'target')
  const profile = join(target, 'profiles/omnimux')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{"sentinel":"unchanged"}\n')
  return { repo, home, target, profile, gitEnv }
}

for (const state of ['feature', 'master', 'detached', 'dirty', 'untracked', 'ahead', 'behind', 'missing-ref', 'non-git']) {
  test(`both sync entrypoints reject ${state}, regardless of obsolete bypass variables`, t => {
    const f = fixture(t, state)
    for (const entry of ['sync-to-app.sh', 'sync-stable.sh']) {
      const result = spawnSync('bash', [join(f.repo, 'scripts', entry), '--skip-build', `--target=${f.target}`, 'missing-plugin'], {
        encoding: 'utf8', env: { ...f.gitEnv, HOME: f.home, OMNIMUX_SYNC_VIA: 'internal',
          OMNIMUX_SYNC_TARGETS: '', OMNIMUX_ALLOW_UNMERGED_MATERIALIZE: '1',
          OMNIMUX_ALLOW_UNMERGED_TARGET: f.target },
      })
      assert.notEqual(result.status, 0, `${entry}/${state}`)
      assert.match(result.stderr, /sync:.*(main|Git|未提交)/, result.stderr)
      assert.equal(readFileSync(join(f.profile, 'package.json'), 'utf8'), '{"sentinel":"unchanged"}\n')
      assert.doesNotMatch(result.stdout, /物化完成|已物化进/)
    }
  })
}

test('clean main must match origin/main exactly; inherited Git overrides cannot attest another checkout', t => {
  const aligned = fixture(t)
  const dirty = fixture(t, 'untracked')
  const gate = (f, extra = {}) => spawnSync('bash', [join(here, 'sync-main.sh'), f.repo], {
    encoding: 'utf8', env: { ...f.gitEnv, ...extra },
  })
  assert.equal(gate(aligned).status, 0)
  const spoofed = gate(dirty, { GIT_DIR: join(aligned.repo, '.git'), GIT_WORK_TREE: aligned.repo })
  assert.equal(spoofed.status, 1)
  assert.match(spoofed.stderr, /未提交/)
})

test('both entrypoints reject external plugin roots even from clean aligned main', t => {
  const f = fixture(t)
  const external = join(f.home, 'external-plugins')
  mkdirSync(external)
  for (const entry of ['sync-to-app.sh', 'sync-stable.sh']) {
    const result = spawnSync('bash', [join(f.repo, 'scripts', entry), '--skip-build', `--target=${f.target}`, 'missing-plugin'], {
      encoding: 'utf8', env: { ...f.gitEnv, HOME: f.home, OMNIMUX_PLUGINS_DIR: external, OMNIMUX_SYNC_TARGETS: '' },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /ROOT\/plugins/)
  }
  const alias = join(f.home, 'plugins-alias')
  symlinkSync(join(f.repo, 'plugins'), alias)
  const result = spawnSync('bash', ['-c', 'source "$1"; assert_omnimux_sync_plugins "$2" "$3"', 'check', join(here, 'sync-main.sh'), f.repo, alias], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

test('rollback wrapper does not accept the obsolete unmerged flag instead of merge confirmation', t => {
  const f = fixture(t)
  copyFileSync(join(here, 'materialize-with-rollback.sh'), join(f.repo, 'scripts/materialize-with-rollback.sh'))
  const result = spawnSync('bash', [join(f.repo, 'scripts/materialize-with-rollback.sh'), 'omnimux'], {
    encoding: 'utf8', env: { ...f.gitEnv, HOME: f.home, OMNIMUX_MERGE_CONFIRMED: '0', OMNIMUX_ALLOW_UNMERGED_MATERIALIZE: '1' },
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /OMNIMUX_MERGE_CONFIRMED/)
})
