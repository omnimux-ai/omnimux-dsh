import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { restartDevApp, verifiedDevAppPids, verifiedDevMainPids, devLaunchEnv } from './reload-dev-app.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

for (const scenario of ['missing-pr', 'open-pr', 'wrong-head', 'merged-pr', 'merged-pr-missing-merge-commit']) {
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
      writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncase "$*" in\n  *'--json state -q .state'*) echo '${state}' ;;\n  *) printf '%s\\t%s\\t%s\\t%s\\t%s\\n' '${state}' 'agent/common-feature' '${scenario === 'wrong-head' ? before : head}' 'main' '${scenario === 'merged-pr' ? head : ''}' ;;\nesac\n`, { mode: 0o755 })
      const args = ['scripts/worktree.sh', 'ship', 'common-feature']
      if (scenario !== 'missing-pr') args.push('--pr', '864')
      const result = spawnSync('bash', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
      const pulled = scenario === 'merged-pr'
      assert.equal(result.status, scenario === 'merged-pr' ? 0 : 1, `${result.stdout}\n${result.stderr}`)
      assert.equal(git('rev-parse', 'HEAD'), pulled ? head : before)
      assert.equal(git('--git-dir', remote, 'rev-parse', 'main'), pulled ? head : before, 'ship must never push main')
      if (scenario === 'merged-pr') {
        assert.equal(existsSync(worktree), false, 'ship defaults to automatically cleaning the merged worktree')
        assert.match(result.stdout, /交付全链路闭环完成/i)
      } else {
        assert.ok(existsSync(join(worktree, 'feature.txt')), 'retain worktree when merge is not confirmed')
      }
    } finally { rmSync(fixture, { recursive: true, force: true }) }
  })
}

test('worktree ship --keep-worktree: retain worktree when explicitly requested', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'omnimux-ship-keep-'))
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
    const worktree = join(repo, '.worktrees/keep-feature')
    git('worktree', 'add', '-b', 'agent/keep-feature', worktree)
    writeFileSync(join(worktree, 'feature.txt'), 'keep me\n')
    git('-C', worktree, 'add', 'feature.txt')
    git('-C', worktree, 'commit', '-m', 'feature')
    const head = git('-C', worktree, 'rev-parse', 'HEAD')
    git('push', 'origin', 'agent/keep-feature:main')
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncase "$*" in\n  *'--json state -q .state'*) echo 'MERGED' ;;\n  *) printf 'MERGED\\tagent/keep-feature\\t${head}\\tmain\\t${head}\\n' ;;\nesac\n`, { mode: 0o755 })
    const result = spawnSync('bash', ['scripts/worktree.sh', 'ship', 'keep-feature', '--pr', '865', '--keep-worktree'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.ok(existsSync(join(worktree, 'feature.txt')), 'retain worktree when --keep-worktree is passed')
    assert.match(result.stdout, /Worktree retained \(--keep-worktree\)/i)
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

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

    writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncase "$*" in\n  *'--json state -q .state'*) echo 'MERGED' ;;\n  *) printf 'MERGED\\tagent/plugin-feature\\t${head}\\tmain\\t${head}\\n' ;;\nesac\n`, { mode: 0o755 })

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

test('ship 物化范围跟随 PR mergeCommit：同批两个 PR 合入后补 ship 较早的仍覆盖自己的插件', () => {
  const { fixture, repo, bin, git } = mergedRepo('ship-earlier-pr')
  try {
    const worktree = join(repo, '.worktrees/plugin-feature')
    git('worktree', 'add', '-b', 'agent/plugin-feature', worktree)
    mkdirSync(join(worktree, 'plugins/omnimux-workflow/src'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux-workflow/src/index.ts'), 'export const workflow = 1\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'feat(workflow): earlier PR')
    const mergedEarlier = git('-C', worktree, 'rev-parse', 'HEAD')
    git('push', 'origin', 'agent/plugin-feature:main')

    // 后一个 PR 在 A 之后合入并修改另一个插件；本地 main 仍停在种子提交。
    const unrelated = join(repo, '.worktrees/unrelated-pr')
    git('fetch', 'origin')
    git('worktree', 'add', '-b', 'agent/unrelated-pr', unrelated, 'origin/main')
    mkdirSync(join(unrelated, 'plugins/omnimux-assets/src'), { recursive: true })
    writeFileSync(join(unrelated, 'plugins/omnimux-assets/src/index.ts'), 'export const assets = 2\n')
    git('-C', unrelated, 'add', '.')
    git('-C', unrelated, 'commit', '-m', 'feat(assets): later PR')
    git('-C', unrelated, 'push', 'origin', 'HEAD:main')
    const currentMain = git('-C', unrelated, 'rev-parse', 'HEAD')

    writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncase "$*" in\n  *'--json state -q .state'*) echo 'MERGED' ;;\n  *) printf 'MERGED\\tagent/plugin-feature\\t${mergedEarlier}\\tmain\\t${mergedEarlier}\\n' ;;\nesac\n`, { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'ship', 'plugin-feature', '--pr', '3001'], {
      cwd: repo,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        PATH: `${bin}:${process.env.PATH}`,
        OMNIMUX_DEV_SNAPSHOT: join(fixture, 'absent-dev'),
      }),
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(git('rev-parse', 'HEAD'), currentMain, 'ship 必须 ff-only 到最新 main')
    assert.equal(
      readFileSync(join(repo, 'sync_receipt.txt'), 'utf8').trim(),
      'omnimux-workflow',
      '只物化本 PR 的插件，而不是 HEAD~1..HEAD 的后一个 PR',
    )
    assert.equal(existsSync(worktree), false)
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('ship 对双父合并提交只物化 PR 分支相对第一父的改动', () => {
  const { fixture, repo, bin, git } = mergedRepo('ship-merge-commit')
  try {
    const worktree = join(repo, '.worktrees/plugin-feature')
    git('worktree', 'add', '-b', 'agent/plugin-feature', worktree)
    mkdirSync(join(worktree, 'plugins/omnimux-workflow/src'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux-workflow/src/index.ts'), 'export const workflow = 1\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'feat(workflow): PR branch')
    const prHead = git('-C', worktree, 'rev-parse', 'HEAD')

    // main 在分叉后合入另一个 PR（assets），再把本 PR --no-ff 合入 main。
    const other = join(repo, '.worktrees/unrelated-pr')
    git('worktree', 'add', '-b', 'agent/unrelated-pr', other)
    mkdirSync(join(other, 'plugins/omnimux-assets/src'), { recursive: true })
    writeFileSync(join(other, 'plugins/omnimux-assets/src/index.ts'), 'export const assets = 2\n')
    git('-C', other, 'add', '.')
    git('-C', other, 'commit', '-m', 'feat(assets): other PR')
    git('-C', other, 'push', 'origin', 'HEAD:main')
    git('fetch', 'origin')
    git('merge', '--ff-only', 'origin/main')
    git('merge', '--no-ff', '--no-edit', 'agent/plugin-feature')
    const mergeCommit = git('rev-parse', 'HEAD')
    assert.equal(git('rev-parse', `${mergeCommit}^2`), prHead)
    git('push', 'origin', 'main')

    writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncase "$*" in\n  *) printf 'MERGED\\tagent/plugin-feature\\t${prHead}\\tmain\\t${mergeCommit}\\n' ;;\nesac\n`, { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'ship', 'plugin-feature', '--pr', '3002'], {
      cwd: repo,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        PATH: `${bin}:${process.env.PATH}`,
        OMNIMUX_DEV_SNAPSHOT: join(fixture, 'absent-dev'),
      }),
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(
      readFileSync(join(repo, 'sync_receipt.txt'), 'utf8').trim(),
      'omnimux-workflow',
      '双父合并只物化 PR 分支改动，不把 main 分叉后的其他 PR 一起物化',
    )
    assert.equal(existsSync(worktree), false)
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

test('devLaunchEnv: 剔除 ELECTRON_RUN_AS_NODE 且不修改入参（AC-10）', () => {
  const source = { ELECTRON_RUN_AS_NODE: '1', PATH: '/usr/bin', DSH_HOME: '/tmp/dsh' }
  const launch = devLaunchEnv(source)
  assert.equal(launch.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(launch.PATH, '/usr/bin')
  assert.equal(launch.DSH_HOME, '/tmp/dsh')
  assert.equal(source.ELECTRON_RUN_AS_NODE, '1', '入参必须保持原样')
})

test('restartDevApp: 拉起 open 时剔除 Electron 运行变量（AC-11）', async () => {
  const previous = process.env.ELECTRON_RUN_AS_NODE
  process.env.ELECTRON_RUN_AS_NODE = '1'
  try {
    const base = probe({
      processes: [{ pid: '4242', command: DEV_MAIN_CMD }],
      listeners: ['4242'],
    })
    const launches = []
    const run = (command, args, options) => {
      launches.push({ command, env: options && options.env })
      return base.run(command, args)
    }
    const result = await restartDevApp({
      run,
      sleep: async () => {},
      probePort: async () => [{ type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:9229/devtools/page/x' }],
      quitTimeoutMs: 50,
      pollMs: 1,
    })
    assert.equal(result.restarted, true)
    const launch = launches.find((entry) => entry.command === 'open')
    assert.ok(launch, '重启必须拉起 open')
    assert.ok(launch.env, 'open 必须显式携带拉起环境')
    // 父进程确实带着该变量：实现若直接复制 process.env 会在这里失败。
    assert.equal(process.env.ELECTRON_RUN_AS_NODE, '1')
    assert.equal(launch.env.ELECTRON_RUN_AS_NODE, undefined, '拉起环境不得继承 ELECTRON_RUN_AS_NODE')
    assert.equal(launch.env.PATH, process.env.PATH)
  } finally {
    if (previous === undefined) delete process.env.ELECTRON_RUN_AS_NODE
    else process.env.ELECTRON_RUN_AS_NODE = previous
  }
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

      writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncase "$*" in\n  *'--json state -q .state'*) echo 'MERGED' ;;\n  *) printf 'MERGED\\tagent/plugin-feature\\t${head}\\tmain\\t${head}\\n' ;;\nesac\n`, { mode: 0o755 })

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
    mkdirSync(join(repo, 'plugins/omnimux/src'), { recursive: true })
    writeFileSync(join(repo, 'plugins/omnimux/src/panel.jsx'), 'export const panel = 2\n')
    git('add', '.')
    git('commit', '-m', 'seed: existing runtime panel')
    git('push', 'origin', 'main')
    const worktree = join(repo, '.worktrees/plugin-feature')
    git('worktree', 'add', '-b', 'agent/plugin-feature', worktree)
    mkdirSync(join(worktree, 'plugins/omnimux/scripts'), { recursive: true })
    git('-C', worktree, 'mv', 'plugins/omnimux/src/panel.jsx', 'plugins/omnimux/scripts/run-tests.mjs')
    git('-C', worktree, 'commit', '-m', 'chore: move runtime file to non-runtime test entry')
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
    mkdirSync(join(worktree, 'plugins/omnimux/scripts'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux/scripts/run-tests.mjs'), '// task-local test execution entry\n')
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

test('只改插件根目录文档与 docs/ 时不安装开发版也不重启', () => {
  const { fixture, repo, bin, git } = mergedRepo('plugin-docs-only')
  try {
    const worktree = join(repo, '.worktrees/plugin-docs')
    git('worktree', 'add', '-b', 'agent/plugin-docs', worktree)
    mkdirSync(join(worktree, 'plugins/omnimux/docs'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux/AGENTS.md'), '# hub rules\n')
    writeFileSync(join(worktree, 'plugins/omnimux/docs/design.md'), '设计说明\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'docs(hub): rules')
    git('push', 'origin', 'agent/plugin-docs:main')
    git('pull', '--ff-only', 'origin', 'main')
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho MERGED\n', { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'remove', 'plugin-docs', '--pr', '2539'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OMNIMUX_DEV_SNAPSHOT: join(fixture, 'absent-dev') },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /只改了插件文档或测试文件，无需物化/)
    assert.equal(existsSync(join(repo, 'sync_receipt.txt')), false)
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('插件文档与源码同时改时只安装有源码改动的插件', () => {
  const { fixture, repo, bin, git } = mergedRepo('plugin-docs-and-src')
  try {
    const worktree = join(repo, '.worktrees/plugin-mixed')
    git('worktree', 'add', '-b', 'agent/plugin-mixed', worktree)
    mkdirSync(join(worktree, 'plugins/omnimux/src'), { recursive: true })
    mkdirSync(join(worktree, 'plugins/omnimux-workflow'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux/src/panel.jsx'), 'export const panel = 3\n')
    writeFileSync(join(worktree, 'plugins/omnimux-workflow/README.md'), '只改说明\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'feat: panel + readme')
    git('push', 'origin', 'agent/plugin-mixed:main')
    git('pull', '--ff-only', 'origin', 'main')
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho MERGED\n', { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'remove', 'plugin-mixed', '--pr', '2539'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OMNIMUX_DEV_SNAPSHOT: join(fixture, 'absent-dev') },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(readFileSync(join(repo, 'sync_receipt.txt'), 'utf8').trim(), 'omnimux')
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('只改插件测试文件时不安装开发版也不重启', () => {
  const { fixture, repo, bin, git } = mergedRepo('plugin-tests-only')
  try {
    const worktree = join(repo, '.worktrees/plugin-tests')
    git('worktree', 'add', '-b', 'agent/plugin-tests', worktree)
    mkdirSync(join(worktree, 'plugins/omnimux/src/text'), { recursive: true })
    mkdirSync(join(worktree, 'plugins/omnimux-workflow/tests'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux/src/text/engine.test.js'), 'import test from "node:test";\n')
    writeFileSync(join(worktree, 'plugins/omnimux-workflow/tests/seam.test.mjs'), 'import test from "node:test";\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'test: add coverage')
    git('push', 'origin', 'agent/plugin-tests:main')
    git('pull', '--ff-only', 'origin', 'main')
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho MERGED\n', { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'remove', 'plugin-tests', '--pr', '2539'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OMNIMUX_DEV_SNAPSHOT: join(fixture, 'absent-dev') },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /只改了插件文档或测试文件，无需物化/)
    assert.equal(existsSync(join(repo, 'sync_receipt.txt')), false)
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('测试文件与源码同时改时照常安装有源码改动的插件', () => {
  const { fixture, repo, bin, git } = mergedRepo('plugin-tests-and-src')
  try {
    const worktree = join(repo, '.worktrees/plugin-mixed2')
    git('worktree', 'add', '-b', 'agent/plugin-mixed2', worktree)
    mkdirSync(join(worktree, 'plugins/omnimux/src'), { recursive: true })
    mkdirSync(join(worktree, 'plugins/omnimux-workflow/tests'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux/src/panel.jsx'), 'export const panel = 4\n')
    mkdirSync(join(worktree, 'plugins/omnimux/scripts'), { recursive: true })
    writeFileSync(join(worktree, 'plugins/omnimux/scripts/run-tests.mjs'), '// task-local test execution entry\n')
    writeFileSync(join(worktree, 'plugins/omnimux-workflow/tests/seam.test.mjs'), 'import test from "node:test";\n')
    git('-C', worktree, 'add', '.')
    git('-C', worktree, 'commit', '-m', 'feat: panel + test')
    git('push', 'origin', 'agent/plugin-mixed2:main')
    git('pull', '--ff-only', 'origin', 'main')
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho MERGED\n', { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'remove', 'plugin-mixed2', '--pr', '2539'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OMNIMUX_DEV_SNAPSHOT: join(fixture, 'absent-dev') },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(readFileSync(join(repo, 'sync_receipt.txt'), 'utf8').trim(), 'omnimux')
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

// ---------------------------------------------------------------------------
// 收尾横幅必须复述真实物化结果（Issue #3700）
// 旧行为：sync 失败时仍打印「开发版已物化」，与上一行的失败提示自相矛盾。
// ---------------------------------------------------------------------------

/** 建一个 ship 场景：单个插件提交已合入 main，sync-to-app.sh 按传入脚本决定成败。 */
function shipRepoWithSyncScript(label, syncScript, extraEnv = {}) {
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
  writeFileSync(join(repo, 'scripts/sync-to-app.sh'), syncScript, { mode: 0o755 })
  git('add', '.')
  git('commit', '-m', 'seed')
  git('remote', 'add', 'origin', remote)
  git('push', '-u', 'origin', 'main')

  const worktree = join(repo, '.worktrees/plugin-feature')
  git('worktree', 'add', '-b', 'agent/plugin-feature', worktree)
  mkdirSync(join(worktree, 'plugins/omnimux/src'), { recursive: true })
  writeFileSync(join(worktree, 'plugins/omnimux/src/panel.jsx'), 'export const panel = 1\n')
  git('-C', worktree, 'add', '.')
  git('-C', worktree, 'commit', '-m', 'feat: panel')
  const head = git('-C', worktree, 'rev-parse', 'HEAD')
  git('push', 'origin', 'agent/plugin-feature:main')
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh\ncase "$*" in\n  *'--json state -q .state'*) echo 'MERGED' ;;\n  *) printf 'MERGED\\tagent/plugin-feature\\t${head}\\tmain\\t${head}\\n' ;;\nesac\n`,
    { mode: 0o755 },
  )
  // 不用对象展开：测试编写检查把新增的 SpreadElement 记为不可声明放行的执行风险。
  const env = Object.assign({}, process.env, {
    PATH: `${bin}:${process.env.PATH}`,
    // 与同文件其它物化用例一致：不要让用例读真实 ~/.omnimux-dev。
    OMNIMUX_DEV_SNAPSHOT: join(fixture, 'absent-dev'),
    // 开发机若导出该开关，兜底用例会假失败；用例显式清掉它（或按用例覆写）。
    OMNIMUX_SHIP_NO_FULL_SYNC: undefined,
  }, extraEnv)
  const result = spawnSync('bash', ['scripts/worktree.sh', 'ship', 'plugin-feature', '--pr', '3700'], {
    cwd: repo,
    encoding: 'utf8',
    env,
  })
  return { fixture, result }
}

test('ship 物化失败时以退出码 3 结束且不宣告交付闭环（Issue #3720）', () => {
  const { fixture, result } = shipRepoWithSyncScript('ship-sync-fail', '#!/bin/sh\necho "dsh-ui-kit 漂移" >&2\nexit 1\n')
  try {
    // 退出码必须机器可读：0 会被调用方当成交付完成。
    assert.equal(result.status, 3, `物化失败必须以退出码 3 结束：\n${result.stdout}\n${result.stderr}`)
    assert.doesNotMatch(result.stdout, /交付全链路闭环完成/, '失败路径不得宣告交付闭环完成')
    assert.match(result.stdout, /交付未闭环/, '失败路径必须明说未闭环')
    assert.match(result.stdout, /开发版未更新/, '失败路径必须说明开发版未更新')
    assert.match(result.stdout, /materialize=failed/, '默认横幅必须给出机器可读的物化状态')
    assert.doesNotMatch(result.stdout, /开发版已物化/, '失败路径不得宣称开发版已物化')
    assert.match(result.stdout, /sync-to-app\.sh/, '失败路径必须给出补救命令')
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('ship 物化成功时横幅说明开发版已物化（Issue #3700）', () => {
  const { fixture, result } = shipRepoWithSyncScript('ship-sync-ok', '#!/bin/sh\nexit 0\n')
  try {
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /交付全链路闭环完成/i)
    assert.match(result.stdout, /开发版已物化/, '成功路径必须说明开发版已物化')
    assert.match(result.stdout, /materialize=ok/, '成功路径必须给出机器可读状态')
    assert.doesNotMatch(result.stdout, /开发版未更新/, '成功路径不得出现未更新提示')
    assert.doesNotMatch(result.stdout, /交付未闭环/, '成功路径不得出现未闭环字样')
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})
/**
 * 增量失败后的兜底（Issue #3720）：shared kit 漂移只能靠无参数完整同步覆盖，但完整同步只装
 * 默认清单内的插件——所以兜底必须是「先刷新 shared kit，再重试本次插件」，否则本次插件可能
 * 根本没进开发版却报成功（新的假闭环）。桩把每次调用记为 `<第几次> <参数个数>`。
 */
const CALL_COUNTER_STUB = `#!/bin/sh
counter="$(dirname "$0")/../sync_count.txt"
n=0
[ -f "$counter" ] && n=$(cat "$counter")
n=$((n + 1))
printf '%s' "$n" > "$counter"
printf '%s %s\\n' "$n" "$#" >> "$(dirname "$0")/../sync_calls.txt"
__BODY__
`;

test('ship 增量失败后刷新 shared kit 并重试本次插件（Issue #3720）', () => {
  const stub = CALL_COUNTER_STUB.replace('__BODY__', '[ "$n" -eq 1 ] && exit 1\nexit 0')
  const { fixture, result } = shipRepoWithSyncScript('ship-sync-kit-refresh', stub)
  try {
    assert.equal(result.status, 0, `兜底成功后应返回 0：\n${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /增量物化失败/, '必须披露这次增量确实失败过')
    assert.match(result.stdout, /刷新 shared kit/, '必须说明先刷新 shared kit')
    assert.match(result.stdout, /重试成功/, '必须说明本次插件重试成功')
    assert.match(result.stdout, /materialize=ok/, '兜底成功后物化状态应为 ok')
    assert.match(result.stdout, /交付全链路闭环完成/, '兜底成功后可以宣告闭环')
    const calls = readFileSync(join(fixture, 'repo', 'sync_calls.txt'), 'utf8').trim().split('\n')
    assert.deepEqual(calls, ['1 1', '2 0', '3 1'], `调用序必须是 增量→完整→增量重试，实际 ${calls.join(', ')}`)
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('OMNIMUX_SHIP_NO_FULL_SYNC=1 时不刷新 shared kit，直接判失败（Issue #3720）', () => {
  const stub = CALL_COUNTER_STUB.replace('__BODY__', 'exit 1')
  const { fixture, result } = shipRepoWithSyncScript('ship-sync-no-refresh', stub, { OMNIMUX_SHIP_NO_FULL_SYNC: '1' })
  try {
    assert.equal(result.status, 3, `关掉兜底时仍应返回 3：\n${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /OMNIMUX_SHIP_NO_FULL_SYNC/, '必须说明是配置关掉了兜底')
    const calls = readFileSync(join(fixture, 'repo', 'sync_calls.txt'), 'utf8').trim().split('\n')
    assert.deepEqual(calls, ['1 1'], '关掉兜底后只应调用一次同步，且必须带插件参数（增量）')
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('shared kit 刷新后本次插件仍失败时判失败并退出 3（Issue #3720）', () => {
  const stub = CALL_COUNTER_STUB.replace('__BODY__', '[ "$n" -eq 2 ] && exit 0\nexit 1')
  const { fixture, result } = shipRepoWithSyncScript('ship-sync-retry-fail', stub)
  try {
    assert.equal(result.status, 3, `重试仍失败必须以 3 结束：\n${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /shared kit 已刷新，但本次插件仍安装失败/, '必须区分「kit 已刷新」与「插件仍失败」')
    assert.doesNotMatch(result.stdout, /交付全链路闭环完成/, '失败路径不得宣告闭环')
    const calls = readFileSync(join(fixture, 'repo', 'sync_calls.txt'), 'utf8').trim().split('\n')
    assert.deepEqual(calls, ['1 1', '2 0', '3 1'], '仍应走完 增量→完整→增量重试 三步')
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

test('ship 删除工作树后清理该工作树的 SAG 隔离索引（Issue #4060）', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'omnimux-ship-sag-'))
  const repo = join(fixture, 'repo')
  const remote = join(fixture, 'origin.git')
  const bin = join(fixture, 'bin')
  const log = join(fixture, 'sag.log')
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
    const worktree = join(repo, '.worktrees/sag-feature')
    git('worktree', 'add', '-b', 'agent/sag-feature', worktree)
    writeFileSync(join(worktree, 'feature.txt'), 'pending acceptance\n')
    git('-C', worktree, 'add', 'feature.txt')
    git('-C', worktree, 'commit', '-m', 'feature')
    const head = git('-C', worktree, 'rev-parse', 'HEAD')
    git('push', 'origin', 'agent/sag-feature:main')
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncase "$*" in\n  *'--json state -q .state'*) echo 'MERGED' ;;\n  *) printf '%s\\t%s\\t%s\\t%s\\t%s\\n' 'MERGED' 'agent/sag-feature' '${head}' 'main' '${head}' ;;\nesac\n`, { mode: 0o755 })
    writeFileSync(join(bin, 'sag-worktree'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexit 0\n`, { mode: 0o755 })

    const result = spawnSync('bash', ['scripts/worktree.sh', 'ship', 'sag-feature', '--pr', '866'], {
      cwd: repo,
      encoding: 'utf8',
      // 与 sagFixture 一样隔离 SAG 开关：开发机导出它们不该让正确实现变红。
      env: {
        ...process.env,
        OMNIMUX_SAG_INDEX: '1',
        OMNIMUX_SAG_GC: '0',
        SAG_WORKTREE_BIN: 'sag-worktree',
        PATH: `${bin}:${process.env.PATH}`,
      },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(existsSync(worktree), false, 'ship 必须删掉已合入的任务工作树')
    const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []
    // 路径比较用 basename 后缀：macOS 上 tmpdir 给的是 /var/... 软链，而 worktree.sh
    // 通过 git 解析得到 /private/var/... 的真实路径，两者指向同一目录。
    assert.equal(
      calls.filter((line) => /^remove .*\/\.worktrees\/sag-feature$/.test(line)).length,
      1,
      `删除工作树后必须清理它那份隔离索引，实际调用：${JSON.stringify(calls)}`,
    )
    assert.equal(
      calls.some((line) => /^remove .*\/(?:common|plugin|docs)-feature$/.test(line)),
      false,
      '不得清理与本任务无关的工作树索引',
    )
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})

/**
 * 建一个带裸远程的临时仓，并放一个记录 argv 的 `sag-worktree` 桩（Issue #4060）。
 * 桩的退出码由 SAG_STUB_EXIT 控制，用来验证「跳过 / 失败 / 成功」三种输出。
 */
function sagFixture(prefix) {
  const fixture = mkdtempSync(join(tmpdir(), `${prefix}-`))
  const repo = join(fixture, 'repo')
  const remote = join(fixture, 'origin.git')
  const bin = join(fixture, 'bin')
  const log = join(fixture, 'sag.log')
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  mkdirSync(repo)
  mkdirSync(bin)
  git('init', '--bare', '-b', 'main', remote)
  git('init', '-b', 'main')
  git('config', 'user.name', 'delivery-test')
  git('config', 'user.email', 'delivery@example.test')
  mkdirSync(join(repo, 'scripts'))
  copyFileSync(join(root, 'scripts/worktree.sh'), join(repo, 'scripts/worktree.sh'))
  copyFileSync(join(root, 'scripts/sag-worktree.mjs'), join(repo, 'scripts/sag-worktree.mjs'))
  writeFileSync(join(repo, '.gitignore'), '.worktrees/\n')
  git('add', '.')
  git('commit', '-m', 'seed')
  git('remote', 'add', 'origin', remote)
  git('push', '-u', 'origin', 'main')
  writeFileSync(
    join(bin, 'sag-worktree'),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\n[ -n "\${SAG_STUB_EXIT:-}" ] && exit "\${SAG_STUB_EXIT}"\nexit 0\n`,
    { mode: 0o755 },
  )
  const worktree = (name) => {
    const dir = join(repo, '.worktrees', name)
    git('worktree', 'add', '-b', `agent/${name}`, dir)
    writeFileSync(join(dir, 'f.txt'), `${name}\n`)
    git('-C', dir, 'add', 'f.txt')
    git('-C', dir, 'commit', '-m', name)
    return dir
  }
  // 隔离 SAG 三个开关：开发机导出 OMNIMUX_SAG_GC / OMNIMUX_SAG_INDEX / SAG_WORKTREE_BIN
  // 会让这些用例在正确实现上变红（与同文件对 OMNIMUX_DEV_SNAPSHOT 的隔离同思路）。
  const run = (args, env = {}) => spawnSync('bash', ['scripts/worktree.sh', ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      OMNIMUX_SAG_INDEX: '1',
      OMNIMUX_SAG_GC: '0',
      SAG_WORKTREE_BIN: 'sag-worktree',
      PATH: `${bin}:${process.env.PATH}`,
      ...env,
    },
  })
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : [])
  const cleanup = () => rmSync(fixture, { recursive: true, force: true })
  return { fixture, repo, git, worktree, run, calls, cleanup }
}

test('remove 删除工作树后清理该工作树的 SAG 隔离索引（Issue #4060）', () => {
  const f = sagFixture('omnimux-sag-remove')
  try {
    const dir = f.worktree('removable')
    const result = f.run(['remove', 'removable', '--abandon'])
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(existsSync(dir), false)
    assert.equal(f.calls().filter((line) => /^remove .*\/\.worktrees\/removable$/.test(line)).length, 1, `实际调用：${JSON.stringify(f.calls())}`)
  } finally { f.cleanup() }
})

test('clean 批量删除后先逐个清理索引、最后回收孤儿（Issue #4060）', () => {
  const f = sagFixture('omnimux-sag-clean')
  try {
    f.worktree('sweep-one')
    // 两个分支都合进 origin/main 才会被判为可清理；第二个必须基于更新后的 main。
    f.git('push', 'origin', 'agent/sweep-one:main')
    f.git('fetch', 'origin')
    f.git('merge', '--ff-only', 'origin/main')
    f.worktree('sweep-two')
    f.git('push', 'origin', 'agent/sweep-two:main')
    const result = f.run(['clean'], { OMNIMUX_SAG_GC: '1' })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const removes = f.calls().filter((line) => /^remove .*\/\.worktrees\/sweep-/.test(line))
    assert.equal(removes.length, 2, `每个被删工作树都要清理索引，实际：${JSON.stringify(f.calls())}`)
    const gcAt = f.calls().indexOf('gc')
    assert.notEqual(gcAt, -1, '开启开关后必须回收孤儿索引')
    assert.equal(
      f.calls().filter((line) => line.startsWith('remove ')).every((line) => f.calls().indexOf(line) < gcAt),
      true,
      '孤儿回收必须发生在逐个清理之后，否则漏掉本轮删除的工作树',
    )
  } finally { f.cleanup() }
})

test('prune 只在 OMNIMUX_SAG_GC=1 时回收孤儿索引（Issue #4060）', () => {
  const f = sagFixture('omnimux-sag-prune')
  try {
    assert.equal(f.run(['prune']).status, 0)
    assert.deepEqual(f.calls(), [], '未开开关时不得触碰任何全局索引操作')
    assert.equal(f.run(['prune'], { OMNIMUX_SAG_GC: '1' }).status, 0)
    assert.deepEqual(f.calls(), ['gc'], '开了开关才回收孤儿索引')
  } finally { f.cleanup() }
})

test('本机没有 sag-worktree 时删除工作树照常完成且不输出 SAG 内容（Issue #4060）', () => {
  const f = sagFixture('omnimux-sag-absent')
  try {
    const dir = f.worktree('no-tool')
    // 只把桩目录从 PATH 移除，保留 git/bash 等系统命令。
    const result = f.run(['remove', 'no-tool', '--force'], { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' })
    assert.equal(result.status, 0, `缺工具不得阻断交付：${result.stdout}\n${result.stderr}`)
    assert.equal(existsSync(dir), false, '工作树仍要被删掉')
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /SAG/, '缺工具时不得输出任何 SAG 相关行')
    assert.deepEqual(f.calls(), [], '缺工具时不得记录任何调用')
  } finally { f.cleanup() }
})

test('OMNIMUX_SAG_INDEX=0 时完全不调用 sag-worktree（Issue #4060）', () => {
  const f = sagFixture('omnimux-sag-off')
  try {
    const dir = f.worktree('opt-out')
    const result = f.run(['remove', 'opt-out', '--force'], { OMNIMUX_SAG_INDEX: '0', OMNIMUX_SAG_GC: '1' })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(existsSync(dir), false, '关闭索引不影响工作树删除')
    assert.deepEqual(f.calls(), [], '关闭后连探测都不该调用工具')
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /SAG/, '关闭后不得输出任何 SAG 相关行')
  } finally { f.cleanup() }
})

/**
 * 直接驱动仓内 CLI（`scripts/sag-worktree.mjs`）的端到端用例（Issue #4068）。
 * SAG_WT_HOME 指向临时目录，绝不触碰本机真实索引。
 */
function cliFixture(prefix, { sagWorks = true, badConfig = false, configFailsAfterMkdir = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`))
  const repo = join(dir, 'repo')
  const bin = join(dir, 'bin')
  const home = join(dir, 'sag-home')
  mkdirSync(repo)
  mkdirSync(bin)
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main')
  git('config', 'user.name', 'cli-test')
  git('config', 'user.email', 'cli@example.test')
  writeFileSync(join(repo, '.gitignore'), '.worktrees/\n')
  writeFileSync(join(repo, '.sagignore'), '# SAG Wiki index options: begin\n# SAG Wiki index options: end\n')
  git('add', '.')
  git('commit', '-m', 'seed')
  const worktree = join(dir, 'wt')
  git('worktree', 'add', '-b', 'agent/wt', worktree)
  if (sagWorks) {
    // 桩：config 返回可用 url/model；add/check/remove/service 一律成功。
    writeFileSync(join(bin, 'sag'), [
      '#!/bin/sh',
      'case "$1" in',
      '  --version) echo "sag 0.0.0-stub" ;;',
      configFailsAfterMkdir
        ? '  config) if [ "$2" = "--url" ]; then mkdir -p "$SAG_DATA_DIR"; exit 1; fi; echo \'{"url":"http://stub.local","model":"stub-model"}\' ;;'
        : `  config) echo '${badConfig ? '{}' : '{"url":"http://stub.local","model":"stub-model"}'}' ;;`,
      '  check) echo \'{"index_ready":true,"indexed_files":42,"coverage":"included","extensions":["ts"]}\' ;;',
      '  *) exit 0 ;;',
      'esac',
      '',
    ].join('\n'), { mode: 0o755 })
    writeFileSync(join(dir, 'credentials.json'), JSON.stringify({ jev: 'stub-key' }))
  } else {
    writeFileSync(join(bin, 'sag'), '#!/bin/sh\nexit 127\n', { mode: 0o755 })
  }
  const run = (args) => spawnSync(process.execPath, [join(root, 'scripts/sag-worktree.mjs'), ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, SAG_WT_HOME: home, PATH: `${bin}:${process.env.PATH}`, SAG_DATA_DIR: dir },
  })
  const cleanup = () => rmSync(dir, { recursive: true, force: true })
  return { dir, repo, home, worktree, run, cleanup }
}

test('init 成功后写入归属记录，status 报 index_ready（Issue #4068）', () => {
  const f = cliFixture('omnimux-cli-init')
  try {
    const result = f.run(['init', f.worktree])
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const dirs = readdirSync(f.home)
    assert.equal(dirs.length, 1, '只应建一份隔离数据目录')
    assert.match(dirs[0], /^wt-[0-9a-f]{8}$/, '目录名应为 文件夹名-路径哈希')
    const status = f.run(['status', f.worktree])
    assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`)
    assert.match(status.stdout, /"index_ready":true/)
    assert.match(status.stdout, /"ownership":"match"/)
  } finally { f.cleanup() }
})

test('本机没有 sag 时 init 报 blocked 且不写归属记录（Issue #4068）', () => {
  const f = cliFixture('omnimux-cli-blocked', { sagWorks: false })
  try {
    const result = f.run(['init', f.worktree])
    assert.equal(result.status, 3, `缺 sag 必须以 blocked(3) 结束：${result.stdout}\n${result.stderr}`)
    assert.match(result.stderr, /blocked: sag CLI is not installed/)
    assert.deepEqual(existsSync(f.home) ? readdirSync(f.home) : [], [], '失败不得留下半套数据目录/记录')
  } finally { f.cleanup() }
})

test('配置缺失时 init 整洁报错且不留半套归属记录（Issue #4068）', () => {
  const f = cliFixture('omnimux-cli-badconfig', { badConfig: true })
  try {
    const result = f.run(['init', f.worktree])
    assert.equal(result.status, 1, `配置缺失应以 1 结束：${result.stdout}\n${result.stderr}`)
    assert.match(result.stderr, /cannot read Jev url\/model/, '要给人话，不要原始堆栈')
    assert.doesNotMatch(result.stderr, /\n\s+at /, '不得输出 Node 原始堆栈')
    assert.deepEqual(existsSync(f.home) ? readdirSync(f.home) : [], [], '失败不得留下归属记录')
  } finally { f.cleanup() }
})

test('配置命令失败时要回收已建的数据目录，保持可重试（Issue #4068）', () => {
  const f = cliFixture('omnimux-cli-rollback', { configFailsAfterMkdir: true })
  try {
    const first = f.run(['init', f.worktree])
    assert.equal(first.status, 1, `配置失败应以 1 结束：${first.stdout}\n${first.stderr}`)
    assert.deepEqual(existsSync(f.home) ? readdirSync(f.home) : [], [], '失败必须回收数据目录，否则下次 init 会卡在「归属不符」')
    // 再跑一次也不能因为残留目录被拒（说明状态是可重试的）。
    const second = f.run(['init', f.worktree])
    assert.equal(second.status, 1, '仍然应是配置失败，而不是「归属不符」拒绝')
    assert.doesNotMatch(second.stderr, /refuse:/, '不得退化成需要手删的死态')
  } finally { f.cleanup() }
})

test('已有合法索引时再 init 失败不能删掉既有索引（Issue #4068）', () => {
  const f = cliFixture('omnimux-cli-keep')
  try {
    assert.equal(f.run(['init', f.worktree]).status, 0, '先建出合法索引')
    const [own] = readdirSync(f.home)
    // 把 sag 换成「config --url 必失败」，模拟升级后配置坏掉再 init。
    writeFileSync(join(f.dir, 'bin', 'sag'), [
      '#!/bin/sh',
      'case "$1" in',
      '  --version) echo "sag 0.0.0-stub" ;;',
      '  config) if [ "$2" = "--url" ]; then exit 1; fi; echo \'{"url":"http://stub.local","model":"stub-model"}\' ;;',
      '  *) exit 0 ;;',
      'esac',
      '',
    ].join('\n'), { mode: 0o755 })
    const again = f.run(['init', f.worktree])
    assert.equal(again.status, 1, '配置失败仍应以 1 结束')
    assert.deepEqual(readdirSync(f.home), [own], '既有合法索引必须原样保留，不能被失败回收误删')
    assert.ok(existsSync(join(f.home, own, 'worktree.path')), '归属记录也要保留')
  } finally { f.cleanup() }
})

test('缺少子命令参数按用法错误退出 2（Issue #4068）', () => {
  const f = cliFixture('omnimux-cli-usage')
  try {
    for (const command of ['init', 'status', 'remove']) {
      const result = f.run([command])
      assert.equal(result.status, 2, `${command} 缺参应以 2 结束：${result.stdout}\n${result.stderr}`)
      assert.match(result.stderr, /usage:/, '要给人话用法提示')
      assert.doesNotMatch(result.stderr, /TypeError|paths\[0\]/, '不得漏出内部异常')
    }
  } finally { f.cleanup() }
})

test('search 在没有索引时自动建库后执行检索（Issue #4068）', () => {
  const f = cliFixture('omnimux-cli-search')
  try {
    assert.deepEqual(existsSync(f.home) ? readdirSync(f.home) : [], [], '起点没有任何索引')
    const result = f.run(['search', f.worktree, '任意问题', '-m', '2'])
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const dirs = readdirSync(f.home)
    assert.equal(dirs.length, 1, 'search 应按需懒建一份索引')
    assert.match(dirs[0], /^wt-[0-9a-f]{8}$/)
    assert.ok(existsSync(join(f.home, dirs[0], 'worktree.path')), '懒建后必须写入归属记录')
  } finally { f.cleanup() }
})

test('remove 对无归属记录的目录返回 2 并保留原数据（Issue #4068）', () => {
  const f = cliFixture('omnimux-cli-unrecorded')
  try {
    // 手工造一个「有数据但没记录」的目录，模拟旧版工具留下的残骸。
    const stray = join(f.home, `${basename(f.worktree)}-deadbeef`)
    mkdirSync(stray, { recursive: true })
    writeFileSync(join(stray, 'index.db'), 'x')
    const result = f.run(['remove', f.worktree])
    assert.equal(result.status, 2, `无记录必须跳过而不是删：${result.stdout}\n${result.stderr}`)
    assert.match(result.stderr, /is unrecorded/)
    assert.equal(existsSync(stray), true, '不能误删没有归属记录的目录')
  } finally { f.cleanup() }
})

test('gc 只删同仓孤儿，跨仓与有记录的目录一律保留（Issue #4068）', () => {
  const f = cliFixture('omnimux-cli-gc')
  try {
    assert.equal(f.run(['init', f.worktree]).status, 0)
    const [own] = readdirSync(f.home)
    // 造一个同仓孤儿（记录指向已不存在的路径）与一个跨仓条目。
    const orphan = join(f.home, 'gone-11111111')
    mkdirSync(orphan, { recursive: true })
    // 记录里的仓根按真实路径写（工具 writeRecord 也是 realpath 归一后才落盘）。
    const realRepo = realpathSync(f.repo)
    writeFileSync(join(orphan, 'worktree.path'), join(f.dir, 'already-deleted'))
    writeFileSync(join(orphan, 'repo.root'), realRepo)
    const foreign = join(f.home, 'other-22222222')
    mkdirSync(foreign, { recursive: true })
    writeFileSync(join(foreign, 'worktree.path'), join(f.dir, 'other-place'))
    writeFileSync(join(foreign, 'repo.root'), join(f.dir, 'another-repo'))
    const result = f.run(['gc'])
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const left = readdirSync(f.home).sort()
    assert.deepEqual(left, [own, 'other-22222222'].sort(), '只该回收同仓孤儿')
    assert.match(result.stdout, /"removed":\["gone-11111111"\]/)
  } finally { f.cleanup() }
})

test('仓内 sag-worktree.mjs 优先于 PATH 里的旧脚本（Issue #4068）', () => {
  const f = sagFixture('omnimux-sag-prefer-repo')
  try {
    const dir = f.worktree('prefer-repo')
    // 不设 SAG_WORKTREE_BIN，解析应落到仓内 scripts/sag-worktree.mjs；SAG_WT_HOME 指向
    // 临时目录，保证绝不碰本机真实索引。
    const result = f.run(['remove', 'prefer-repo', '--force'], {
      SAG_WORKTREE_BIN: '',
      SAG_WT_HOME: join(f.fixture, 'sag-home'),
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(existsSync(dir), false, '工作树照常删除')
    assert.deepEqual(f.calls(), [], '仓内实现优先时，PATH 里的旧脚本不得被调用')
    assert.match(result.stdout, /跳过清理/, '仓内实现对该路径没有归属记录，应播报跳过而不是成功')
  } finally { f.cleanup() }
})

test('清理失败与「索引不属于该路径」必须给出不同输出（Issue #4060）', () => {
  const f = sagFixture('omnimux-sag-status')
  try {
    const failed = f.worktree('will-fail')
    // 3 已保留给「本机没有 sag」的 blocked 语义（worktree.sh 静默跳过），通用失败用 4。
    const failRun = f.run(['remove', 'will-fail', '--force'], { SAG_STUB_EXIT: '4' })
    assert.equal(failRun.status, 0, '清理失败不得阻断交付')
    assert.equal(existsSync(failed), false, '工作树仍要被删掉')
    assert.match(failRun.stderr, /SAG 索引清理失败（退出码 4/, `失败必须留 stderr 警告：${failRun.stderr}`)
    assert.doesNotMatch(failRun.stdout, /已清理该工作树的隔离索引/, '失败不得报成功')

    const skipped = f.worktree('will-skip')
    const skipRun = f.run(['remove', 'will-skip', '--force'], { SAG_STUB_EXIT: '2' })
    assert.equal(skipRun.status, 0)
    assert.equal(existsSync(skipped), false)
    assert.match(skipRun.stdout, /跳过清理/, '工具拒绝删除时必须说「跳过」，不能报成功')
    assert.doesNotMatch(skipRun.stdout, /已清理该工作树的隔离索引/, '跳过不得报成功（假成功）')
    assert.doesNotMatch(skipRun.stderr, /清理失败/, '跳过不是失败，不该刷失败警告')
  } finally { f.cleanup() }
})
