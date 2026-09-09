import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'scripts/omnimux.mjs')
const run = (args, env = process.env) => spawnSync(process.execPath, [cli, ...args], { cwd: root, env, encoding: 'utf8' })

test('CLI help exposes sync/build/doctor without a task environment launcher', () => {
  const result = run(['help'])
  assert.equal(result.status, 0)
  assert.match(result.stdout, /build:all/)
  assert.match(result.stdout, /sync/)
  assert.match(result.stdout, /doctor/)
  assert.doesNotMatch(result.stdout, /L2|restart-host|dev <start/)
})

test('retired environment commands fail rather than launching a Host', () => {
  const result = run(['dev', 'start', 'removed-task', 'omnimux-assets'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /未知命令: dev/)
  for (const script of ['worktree.sh', 'git-wt.sh']) {
    const legacy = spawnSync('bash', [join(root, 'scripts', script), 'dev', 'removed-task'], { cwd: root, encoding: 'utf8' })
    assert.equal(legacy.status, 1, `${script}: ${legacy.stderr}`)
  }
})

test('retired delivery flags are rejected rather than silently accepted', () => {
  const result = spawnSync('bash', [join(root, 'scripts/git-wt.sh'), 'finish', 'removed-task', '--skip-l2'], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /未知参数: --skip-l2/)
})

test('Agent cannot use the bulk App kill/restart shortcut', () => {
  const result = run(['restart', 'dev'], { ...process.env, DSH_AGENT_SESSION: '1' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Agent 严禁通过此批量命令强杀或重启/)
})

test('active hooks preserve worktree and UI guards without the removed guard', () => {
  const hooks = JSON.parse(readFileSync(join(root, '.dsh/hooks.json'), 'utf8'))
  assert.deepEqual(hooks.PreToolUse.flatMap(row => row.hooks.map(hook => hook.command)), [
    'node scripts/guard-worktree.mjs',
    'node scripts/guard-ui-design.mjs',
  ])
  const { scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(scripts.dev, undefined)
  assert.equal(scripts['dev:env'], undefined)
  assert.ok(scripts['test:gates'])
  assert.ok(scripts['verify:live'])
})

for (const code of [0, 1]) {
  test(`build-all propagates plugin build exit ${code} using an isolated fixture`, () => {
    const fixture = mkdtempSync(join(tmpdir(), 'omnimux-dx-'))
    try {
      mkdirSync(join(fixture, 'scripts'), { recursive: true })
      const plugin = join(fixture, 'plugins/example')
      mkdirSync(join(plugin, 'scripts'), { recursive: true })
      copyFileSync(join(root, 'scripts/build-all.mjs'), join(fixture, 'scripts/build-all.mjs'))
      writeFileSync(join(plugin, 'package.json'), '{"name":"example","type":"module"}\n')
      writeFileSync(join(plugin, 'scripts/build-client.mjs'), `process.exit(${code})\n`)
      const result = spawnSync(process.execPath, [join(fixture, 'scripts/build-all.mjs')], { encoding: 'utf8' })
      assert.equal(result.status, code, result.stderr)
      if (code === 0) assert.match(result.stdout, /全量构建成功/)
      else assert.match(result.stderr, /构建失败/)
    } finally { rmSync(fixture, { recursive: true, force: true }) }
  })
}

test('standalone build watcher rejects an unknown plugin without starting a process', () => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/watch-plugin.mjs'), 'non-existent-plugin-xyz'], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /插件源码不存在/)
})
