import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { restartDevApp, verifiedDevAppPids, verifiedDevMainPids } from './reload-dev-app.mjs'

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

// ---------------------------------------------------------------------------
// 合并后刷新一致性（Issue #1981）：宿主侧变更受控重启，纯 Client 变更刷新页面
// ---------------------------------------------------------------------------

const DEV_BUNDLE = '/Applications/OmniMux Dev.app'
const PROD_BUNDLE = '/Applications/OmniMux.app'
const DEV_MAIN_CMD = `${DEV_BUNDLE}/Contents/MacOS/OmniMux --expose-internals`
const DEV_HELPER_CMD = `${DEV_BUNDLE}/Contents/Frameworks/OmniMux Helper.app/Contents/MacOS/OmniMux Helper --type=renderer`

/**
 * 进程探针。quitEffect 决定优雅退出的结果：exits=退出成功，hangs=请求被接受但不退出，
 * rejected=请求未被接受。
 */
function probe({ processes = [], listeners = [], quitEffect = 'exits' } = {}) {
  const calls = []
  let alive = [...processes]
  const run = (command, args) => {
    calls.push([command, ...args].join(' '))
    if (command === 'pgrep') {
      return alive.length
        ? { status: 0, stdout: `${alive.map((entry) => entry.pid).join('\n')}\n` }
        : { status: 1, stdout: '' }
    }
    if (command === 'ps') {
      const found = alive.find((entry) => entry.pid === args[1])
      if (!found) return { status: 1, stdout: '' }
      return { status: 0, stdout: args[3] === 'command=' ? `${found.command}\n` : `${found.pid}\n` }
    }
    if (command === 'lsof') {
      return listeners.length ? { status: 0, stdout: `${listeners.join('\n')}\n` } : { status: 1, stdout: '' }
    }
    if (command === 'osascript') {
      if (quitEffect === 'rejected') return { status: 1, stdout: '' }
      if (quitEffect === 'exits') alive = []
      return { status: 0, stdout: '' }
    }
    return { status: 0, stdout: '' }
  }
  return { run, calls }
}

const noQuitNoLaunch = (calls) => !calls.some((call) => call.startsWith('osascript') || call.startsWith('open '))

test('restartDevApp: 开发版未运行时不做任何动作（AC-4）', async () => {
  const { run, calls } = probe()
  const result = await restartDevApp({ run, sleep: async () => {} })
  assert.equal(result.restarted, false)
  assert.equal(result.reason, 'not-running')
  assert.deepEqual(calls, [`pgrep -f ${DEV_BUNDLE}`], '未运行时不得发出退出或拉起调用')
})

test('restartDevApp: 只认已核实的开发版实例（AC-5）', async () => {
  // 正式版进程、只在命令行里提到该路径的 shell 都不算开发版实例；渲染子进程也不算实例
  const outsiders = probe({
    processes: [
      { pid: '111', command: `${PROD_BUNDLE}/Contents/MacOS/OmniMux` },
      { pid: '222', command: `bash -c open ${DEV_BUNDLE}` },
      { pid: '333', command: DEV_HELPER_CMD },
    ],
  })
  assert.deepEqual(verifiedDevAppPids(outsiders.run), ['333'], '只保留确属 App 包内部的进程')
  assert.deepEqual(verifiedDevMainPids(outsiders.run), [], '渲染子进程不是实例')

  const skipped = await restartDevApp({ run: outsiders.run, sleep: async () => {} })
  assert.equal(skipped.reason, 'not-running')
  assert.ok(!outsiders.calls.some((call) => call.startsWith('open ')), '核实不通过时不得拉起任何进程')
})

test('restartDevApp: 端口上没有已核实实例时不动作（AC-8）', async () => {
  const { run, calls } = probe({ processes: [{ pid: '4242', command: DEV_MAIN_CMD }] })
  const result = await restartDevApp({ run, sleep: async () => {} })
  assert.equal(result.restarted, false)
  assert.equal(result.reason, 'no-target')
  assert.ok(noQuitNoLaunch(calls), '没有目标时不得退出或拉起')
})

test('restartDevApp: 检测到并发实例时放弃重启（AC-9）', async () => {
  const { run, calls } = probe({
    processes: [
      { pid: '4242', command: DEV_MAIN_CMD },
      { pid: '5150', command: `${DEV_BUNDLE}/Contents/MacOS/OmniMux --expose-internals --user-data-dir=/tmp/qa-run` },
    ],
    listeners: ['4242'],
  })
  const result = await restartDevApp({ run, sleep: async () => {} })
  assert.equal(result.restarted, false)
  assert.equal(result.reason, 'shared-instance')
  assert.ok(noQuitNoLaunch(calls), '存在并发实例时不得动任何进程')
})

test('restartDevApp: 退出超时放弃重启且不发送强杀信号（AC-6）', async () => {
  const { run, calls } = probe({
    processes: [{ pid: '4242', command: DEV_MAIN_CMD }],
    listeners: ['4242'],
    quitEffect: 'hangs',
  })
  const result = await restartDevApp({ run, sleep: async () => {}, quitTimeoutMs: 20, pollMs: 1 })
  assert.equal(result.restarted, false)
  assert.equal(result.reason, 'quit-timeout')
  assert.ok(!calls.some((call) => /(^|\s)(pkill|kill)(\s|$)/.test(call)), '超时后不得补发任何强杀信号')
  assert.ok(!calls.some((call) => call.startsWith('open ')), '未确认退出前不得重新拉起')
})

test('restartDevApp: 就绪前不声明成功，就绪后才报告重启（AC-7）', async () => {
  const notReady = await restartDevApp({
    run: probe({
      processes: [{ pid: '4242', command: DEV_MAIN_CMD }],
      listeners: ['4242'],
    }).run,
    sleep: async () => {},
    probePort: async () => null,
    quitTimeoutMs: 50,
    readyTimeoutMs: 10,
    pollMs: 1,
  })
  assert.equal(notReady.restarted, false)
  assert.equal(notReady.reason, 'not-ready')

  const ready = await restartDevApp({
    run: probe({
      processes: [{ pid: '4242', command: DEV_MAIN_CMD }],
      listeners: ['4242'],
    }).run,
    sleep: async () => {},
    probePort: async () => [{ type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:9229/devtools/page/x' }],
    quitTimeoutMs: 50,
    pollMs: 1,
  })
  assert.equal(ready.restarted, true)
})

/**
 * 收尾动作必须与变更面匹配。fixture 里的 reload-dev-app.mjs 只记录收到的参数，
 * 因此这里断言的是 worktree.sh 的分支决策，不触碰真实桌面应用。
 */
for (const [label, changedFile, expectRestart] of [
  ['宿主侧文件走受控重启（AC-2）', 'plugins/omnimux-workflow/src/http-routes.ts', true],
  ['纯 Client 文件只刷新页面（AC-1）', 'plugins/omnimux-workflow/src/client/Card.jsx', false],
]) {
  test(`worktree ship auto-materialize: ${label}`, () => {
    const fixture = mkdtempSync(join(tmpdir(), 'omnimux-ship-reload-'))
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
      writeFileSync(join(repo, 'scripts/sync-to-app.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
      writeFileSync(
        join(repo, 'scripts/reload-dev-app.mjs'),
        "import { writeFileSync } from 'node:fs'\nwriteFileSync('reload_receipt.txt', process.argv.slice(2).join(' '))\n",
      )
      git('add', '.')
      git('commit', '-m', 'seed')
      git('remote', 'add', 'origin', remote)
      git('push', '-u', 'origin', 'main')

      const worktree = join(repo, '.worktrees/plugin-feature')
      git('worktree', 'add', '-b', 'agent/plugin-feature', worktree)
      mkdirSync(dirname(join(worktree, changedFile)), { recursive: true })
      writeFileSync(join(worktree, changedFile), 'export const changed = true\n')
      git('-C', worktree, 'add', '.')
      git('-C', worktree, 'commit', '-m', 'feat: change')
      const head = git('-C', worktree, 'rev-parse', 'HEAD')
      git('push', 'origin', 'agent/plugin-feature:main')

      writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncase "$*" in\n  *'--json state -q .state'*) echo 'MERGED' ;;\n  *) printf 'MERGED\\tagent/plugin-feature\\t${head}\\tmain\\n' ;;\nesac\n`, { mode: 0o755 })

      const result = spawnSync('bash', ['scripts/worktree.sh', 'ship', 'plugin-feature', '--pr', '1001'], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }
      })
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
      const receipt = readFileSync(join(repo, 'reload_receipt.txt'), 'utf8')
      assert.equal(receipt.includes('--restart'), expectRestart, `reload 参数不符合预期: ${receipt}`)
    } finally { rmSync(fixture, { recursive: true, force: true }) }
  })
}

// ---------------------------------------------------------------------------
// 合并成功后必装开发版（Issue #2539）
// 昨天的漏装：正式版本已经拉齐，删除临时工作区时安装被跳过。
// ---------------------------------------------------------------------------

/**
 * 建一个只含种子提交的仓库，并放上记录参数的安装脚本。
 */
function mergedRepo(label) {
  const fixture = mkdtempSync(join(tmpdir(), `omnimux-${label}-`))
  const repo = join(fixture, 'repo')
  const remote = join(fixture, 'origin.git')
  const bin = join(fixture, 'bin')
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  mkdirSync(repo)
  mkdirSync(bin)
  git('init', '--bare', '-b', 'main', remote)
  git('init', '-b', 'main')
  git('config', 'user.name', 'delivery-test')
  git('config', 'user.email', 'delivery@example.test')
  mkdirSync(join(repo, 'scripts'))
  copyFileSync(join(root, 'scripts/worktree.sh'), join(repo, 'scripts/worktree.sh'))
  writeFileSync(join(repo, '.gitignore'), '.worktrees/\n')
  writeFileSync(
    join(repo, 'scripts/sync-to-app.sh'),
    '#!/bin/sh\necho "$*" >> sync_receipt.txt\n',
    { mode: 0o755 },
  )
  git('add', '.')
  git('commit', '-m', 'seed')
  git('remote', 'add', 'origin', remote)
  git('push', '-u', 'origin', 'main')
  return { fixture, repo, bin, git }
}

test('remove 在正式版本已拉齐时仍把本次合并的插件装进开发版', () => {
  const { fixture, repo, bin, git } = mergedRepo('remove-caught-up')
  try {
    const worktree = join(repo, '.worktrees/plugin-feature')
    git('worktree', 'add', '-b', 'agent/plugin-feature', worktree)
    mkdirSync(join(worktree, 'plugins/omnimux/src'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux/src/panel.jsx'), 'export const panel = 2\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'feat: panel')
    const head = git('-C', worktree, 'rev-parse', 'HEAD')
    git('push', 'origin', 'agent/plugin-feature:main')
    git('pull', '--ff-only', 'origin', 'main')
    assert.equal(git('rev-parse', 'HEAD'), git('rev-parse', 'origin/main'))
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho MERGED\n', { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'remove', 'plugin-feature', '--pr', '2539'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OMNIMUX_DEV_SNAPSHOT: join(fixture, 'absent-dev') },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(git('rev-parse', 'HEAD'), head)
    assert.equal(readFileSync(join(repo, 'sync_receipt.txt'), 'utf8').trim(), 'omnimux')
    assert.equal(existsSync(worktree), false)
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('开发版已经和这次提交一致时不重复安装', () => {
  const { fixture, repo, bin, git } = mergedRepo('already-installed')
  try {
    const worktree = join(repo, '.worktrees/plugin-feature')
    git('worktree', 'add', '-b', 'agent/plugin-feature', worktree)
    mkdirSync(join(worktree, 'plugins/omnimux/src'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux/src/panel.jsx'), 'export const panel = 2\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'feat: panel')
    const head = git('-C', worktree, 'rev-parse', 'HEAD')
    git('push', 'origin', 'agent/plugin-feature:main')
    git('pull', '--ff-only', 'origin', 'main')

    const snapshot = join(fixture, 'dev-snapshot/omnimux')
    mkdirSync(join(snapshot, 'src'), { recursive: true })
    writeFileSync(join(snapshot, 'src/panel.jsx'), 'export const panel = 2\n')
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho MERGED\n', { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'remove', 'plugin-feature', '--pr', '2539'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OMNIMUX_DEV_SNAPSHOT: snapshot },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /无需重复安装/)
    assert.equal(existsSync(join(repo, 'sync_receipt.txt')), false)
    assert.equal(git('rev-parse', 'HEAD'), head)
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('双父合并提交在正式版本已拉齐时也会装进开发版', () => {
  const { fixture, repo, bin, git } = mergedRepo('merge-commit')
  try {
    const worktree = join(repo, '.worktrees/plugin-feature')
    git('worktree', 'add', '-b', 'agent/plugin-feature', worktree)
    mkdirSync(join(worktree, 'plugins/omnimux/src'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux/src/panel.jsx'), 'export const panel = 2\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'feat: panel')
    git('fetch', 'origin')
    git('merge', '--no-ff', '--no-edit', 'agent/plugin-feature')
    const head = git('rev-parse', 'HEAD')
    assert.equal(git('rev-parse', `${head}^2`), git('-C', worktree, 'rev-parse', 'HEAD'))
    git('push', 'origin', 'main')
    assert.equal(git('rev-parse', 'HEAD'), git('rev-parse', 'origin/main'))
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho MERGED\n', { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'remove', 'plugin-feature', '--pr', '2539'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OMNIMUX_DEV_SNAPSHOT: join(fixture, 'absent-dev') },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(readFileSync(join(repo, 'sync_receipt.txt'), 'utf8').trim(), 'omnimux')
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('一次落后多次提交时，最新提交没改插件也会补装更早的插件改动', () => {
  const { fixture, repo, bin, git } = mergedRepo('behind-several')
  try {
    const worktree = join(repo, '.worktrees/plugin-feature')
    git('worktree', 'add', '-b', 'agent/plugin-feature', worktree)
    const base = git('rev-parse', 'HEAD')
    mkdirSync(join(worktree, 'plugins/omnimux/src'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux/src/panel.jsx'), 'export const panel = 2\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'feat: panel')
    mkdirSync(join(worktree, 'docs'), { recursive: true })
    writeFileSync(join(worktree, 'docs/later.md'), '后面的提交只改文档\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'docs: later')
    git('push', 'origin', 'agent/plugin-feature:main')
    assert.notEqual(git('rev-parse', 'HEAD'), git('rev-parse', 'origin/main'))
    // 开发版停在更早的内容：目录存在，但文件不是最终内容。
    // 这样才会真正走进整段比较，而不是因为目录不存在直接安装。
    const snapshot = join(fixture, 'dev/omnimux')
    mkdirSync(join(snapshot, 'src'), { recursive: true })
    writeFileSync(join(snapshot, 'src/panel.jsx'), 'export const panel = 1\n')
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho MERGED\n', { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'remove', 'plugin-feature', '--pr', '2539'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OMNIMUX_DEV_SNAPSHOT: snapshot },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(git('rev-parse', 'HEAD'), git('rev-parse', 'origin/main'))
    assert.notEqual(git('rev-parse', 'HEAD'), base)
    assert.equal(readFileSync(join(repo, 'sync_receipt.txt'), 'utf8').trim(), 'omnimux')
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('范围内删除了插件文件且开发版还留着旧文件时会补装', () => {
  const { fixture, repo, bin, git } = mergedRepo('deleted-file')
  try {
    const worktree = join(repo, '.worktrees/plugin-feature')
    git('worktree', 'add', '-b', 'agent/plugin-feature', worktree)
    mkdirSync(join(worktree, 'plugins/omnimux/src'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux/src/panel.jsx'), 'export const panel = 2\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'feat: panel')
    git('-C', worktree, 'rm', 'plugins/omnimux/src/panel.jsx')
    git('-C', worktree, 'commit', '-m', 'chore: drop panel')
    git('push', 'origin', 'agent/plugin-feature:main')
    const snapshot = join(fixture, 'dev/omnimux')
    mkdirSync(join(snapshot, 'src'), { recursive: true })
    writeFileSync(join(snapshot, 'src/panel.jsx'), 'export const panel = 2\n')
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho MERGED\n', { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'remove', 'plugin-feature', '--pr', '2539'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OMNIMUX_DEV_SNAPSHOT: snapshot },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(readFileSync(join(repo, 'sync_receipt.txt'), 'utf8').trim(), 'omnimux')
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('只有文档改动时不安装开发版', () => {
  const { fixture, repo, bin, git } = mergedRepo('docs-only')
  try {
    const worktree = join(repo, '.worktrees/docs-feature')
    git('worktree', 'add', '-b', 'agent/docs-feature', worktree)
    mkdirSync(join(worktree, 'docs'), { recursive: true })
    writeFileSync(join(worktree, 'docs/note.md'), '只改说明\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'docs: note')
    git('push', 'origin', 'agent/docs-feature:main')
    git('pull', '--ff-only', 'origin', 'main')
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho MERGED\n', { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'remove', 'docs-feature', '--pr', '2539'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OMNIMUX_DEV_SNAPSHOT: join(fixture, 'absent-dev') },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /无需物化/)
    assert.equal(existsSync(join(repo, 'sync_receipt.txt')), false)
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})
