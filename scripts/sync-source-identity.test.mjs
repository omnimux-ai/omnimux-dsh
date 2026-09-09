import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const scripts = dirname(fileURLToPath(import.meta.url))

/** Real local remote and linked tree; only the downstream materializer is stubbed. */
function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'sync-source-'))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const primary = join(temp, 'primary')
  const remote = join(temp, 'remote.git')
  const linked = join(primary, '.worktrees/task')
  const home = join(temp, 'home')
  const env = { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CEILING_DIRECTORIES: temp }
  for (const key of Object.keys(env)) {
    if (key.startsWith('OMNIMUX_') || key.startsWith('GIT_DIR') || key.startsWith('GIT_WORK_TREE')) delete env[key]
  }
  function git(cwd, ...args) {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' })
    assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}`)
    return result.stdout.trim()
  }
  mkdirSync(primary, { recursive: true })
  mkdirSync(home, { recursive: true })
  git(primary, 'init', '-b', 'main')
  git(primary, 'config', 'user.name', 'Source Fixture')
  git(primary, 'config', 'user.email', 'fixture@example.invalid')
  mkdirSync(join(primary, 'scripts'))
  for (const name of ['sync-to-app.sh', 'resolve-omnimux-profile.sh', 'plugin-lifecycle.mjs', 'sync-main.sh']) {
    copyFileSync(join(scripts, name), join(primary, 'scripts', name))
  }
  mkdirSync(join(primary, 'plugins/omnimux/src'), { recursive: true })
  copyFileSync(join(scripts, '../plugins/omnimux/src/plugin-lifecycle.json'), join(primary, 'plugins/omnimux/src/plugin-lifecycle.json'))
  writeFileSync(join(primary, '.gitignore'), '.worktrees/\n')
  writeFileSync(join(primary, 'tracked'), 'base\n')
  writeFileSync(join(primary, 'scripts/sync-stable.sh'), '#!/bin/bash\necho DOWNSTREAM_REACHED\n', { mode: 0o755 })
  git(primary, 'add', '.')
  git(primary, 'commit', '-m', 'fixture base')
  git(temp, 'init', '--bare', remote)
  git(primary, 'remote', 'add', 'origin', remote)
  git(primary, 'push', 'origin', 'main')
  git(primary, 'worktree', 'add', '-b', 'agent/task', linked, 'HEAD')
  function run(root = linked, extra = {}, args = []) {
    return spawnSync('bash', [join(root, 'scripts/sync-to-app.sh'), '--skip-build', 'omnimux-fixture', ...args], {
      cwd: root, env: { ...env, ...extra }, encoding: 'utf8', timeout: 15000,
    })
  }
  function check(result, allowed, message) {
    assert.equal(result.status, allowed ? 0 : 1, `${result.stdout}\n${result.stderr}`)
    assert.equal(result.stdout.includes('DOWNSTREAM_REACHED'), allowed)
    if (message) assert.match(result.stderr, message)
  }
  function commit(root, text) {
    writeFileSync(join(root, 'tracked'), text)
    git(root, 'add', 'tracked')
    git(root, 'commit', '-m', text)
  }
  return { temp, primary, linked, remote, home, git, run, check, commit }
}

test('clean main, linked branch and detached fetched-main pass; primary dirty is isolated', t => {
  const f = fixture(t)
  f.check(f.run(f.primary), true)
  writeFileSync(join(f.primary, 'tracked'), 'other task dirty\n')
  f.check(f.run(), true)
  assert.equal(readFileSync(join(f.primary, 'tracked'), 'utf8'), 'other task dirty\n')
  f.git(f.linked, 'checkout', '--detach')
  f.check(f.run(), true)
})

for (const kind of ['unstaged', 'staged', 'untracked']) {
  test(`${kind} local source fails before downstream`, t => {
    const f = fixture(t)
    writeFileSync(join(f.linked, kind === 'untracked' ? 'new-file' : 'tracked'), 'dirty\n')
    if (kind === 'staged') f.git(f.linked, 'add', 'tracked')
    f.check(f.run(), false, /未提交改动/)
  })
}

test('local ahead and divergent unmerged branch tip fail', t => {
  const f = fixture(t)
  f.commit(f.linked, 'unmerged feature\n')
  f.check(f.run(), false, /不等于最新 origin\/main/)
  f.commit(f.primary, 'remote change\n')
  f.git(f.primary, 'push', 'origin', 'main')
  f.check(f.run(), false, /不等于最新 origin\/main/)
})

test('stale cached ref cannot admit behind source; explicit fetch refreshes narrow configuration', t => {
  const f = fixture(t)
  f.commit(f.primary, 'remote new main\n')
  // Push without updating the primary repository tracking ref.
  f.git(f.primary, 'push', f.remote, 'main')
  assert.equal(f.git(f.linked, 'rev-parse', 'HEAD'), f.git(f.linked, 'rev-parse', 'origin/main'))
  f.git(f.linked, 'config', 'remote.origin.fetch', '+refs/heads/other:refs/remotes/origin/other')
  f.check(f.run(), false, /不等于最新 origin\/main/)
  assert.equal(f.git(f.linked, 'rev-parse', 'origin/main'), f.git(f.primary, 'rev-parse', 'HEAD'))
})

for (const kind of ['missing remote', 'failed fetch', 'missing remote main']) {
  test(`${kind} fails closed despite cached tracking identity`, t => {
    const f = fixture(t)
    if (kind === 'missing remote') f.git(f.linked, 'remote', 'remove', 'origin')
    if (kind === 'failed fetch') f.git(f.linked, 'remote', 'set-url', 'origin', join(f.temp, 'absent.git'))
    if (kind === 'missing remote main') f.git(f.remote, 'update-ref', '-d', 'refs/heads/main')
    f.check(f.run(), false, /无法 fetch 最新 origin\/main/)
  })
}

test('non-Git source fails closed', t => {
  const f = fixture(t)
  rmSync(join(f.primary, '.git'), { recursive: true, force: true })
  f.check(f.run(f.primary), false, /非 git 工作区/)
})

test('unmerged index conflicts fail before downstream', t => {
  const f = fixture(t)
  f.commit(f.linked, 'feature conflict\n')
  f.commit(f.primary, 'main conflict\n')
  const merge = spawnSync('git', ['merge', 'main'], { cwd: f.linked, encoding: 'utf8' })
  assert.equal(merge.status, 1, merge.stderr)
  f.check(f.run(), false, /未提交改动/)
})

test('unreadable index status fails closed before downstream', t => {
  const f = fixture(t)
  const index = f.git(f.linked, 'rev-parse', '--git-path', 'index')
  writeFileSync(index, 'corrupt index\n')
  f.check(f.run(), false, /无法读取工作区状态/)
})

test('fetch admits current detached tip even when cached tracking ref is older', t => {
  const f = fixture(t)
  f.commit(f.primary, 'new merged main\n')
  f.git(f.primary, 'push', f.remote, 'main')
  const latest = f.git(f.primary, 'rev-parse', 'HEAD')
  f.git(f.linked, 'checkout', '--detach', latest)
  assert.notEqual(f.git(f.linked, 'rev-parse', 'origin/main'), latest)
  f.check(f.run(), true)
  assert.equal(f.git(f.linked, 'rev-parse', 'origin/main'), latest)
})

test('managed arguments retain independent dispatch before ordinary source gate', t => {
  const f = fixture(t)
  writeFileSync(join(f.linked, 'tracked'), 'dirty ordinary source\n')
  f.check(f.run(f.linked, {}, ['--managed-tarball=fixture.tgz']), true)
})

test('legacy and target-boundary refusals remain before downstream', t => {
  const f = fixture(t)
  f.check(f.run(f.linked, { OMNIMUX_ALLOW_UNMERGED_MATERIALIZE: '1' }), false, /已废弃/)
  f.check(f.run(f.linked, { OMNIMUX_ALLOW_UNMERGED_TARGET: join(f.home, '.omnimux-dev') }), false, /必须以/)
  f.check(f.run(f.linked, { OMNIMUX_ALLOW_UNMERGED_TARGET: join(f.home, '.dsh-dev/tasks/task') }), false, /不在允许前缀/)
})
