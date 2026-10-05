import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCorepackOnPath, fakeGitPath, copySyncScripts } from './sync-fixtures.test.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// #3157：核验遍历 MANAGED_PLUGINS（profile 清单里全部受管 file: 依赖，且限于
// ALL_PLUGINS），而刷新只覆盖本轮请求的插件。pnpm 对同版本 file: 依赖会保留现有
// 安装入口，于是一旦某个受管包的快照比它的已装副本新（上一轮写了快照但没能装上，
// 或安装被回滚），后续任何「不请求该包」的物化都会在核验处以指纹不匹配中止整批。
// 本用例构造该状态，并要求未请求的受管包同样被刷新。
describe('OmniMux managed file: refresh scope (#3157)', () => {
  const requested = 'omnimux-video'
  const unrequested = 'omnimux-analytics'
  let syncStableScript
  let gitPath
  let fakeHome
  let fixturePlugins
  let profile

  function writeFixturePlugin(name, revision) {
    const plugin = join(fixturePlugins, name)
    mkdirSync(plugin, { recursive: true })
    writeFileSync(join(plugin, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      main: 'index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, null, 2) + '\n')
    writeFileSync(join(plugin, 'index.js'), `module.exports = { name: ${JSON.stringify(name)}, revision: ${JSON.stringify(revision)} }\n`)
    writeFileSync(join(plugin, 'cordis.patch.yml'), '[]\n')
  }

  function syncEnv() {
    return {
      ...process.env,
      OMNIMUX_SYNC_VIA: 'internal',
      OMNIMUX_PLUGINS_DIR: fixturePlugins,
      HOME: fakeHome,
      COREPACK_HOME: process.env.COREPACK_HOME,
      COREPACK_DEFAULT_TO_LATEST: '0',
      COREPACK_ENABLE_AUTO_PIN: '0',
      CI: 'true',
      PATH: `${gitPath}:${process.env.PATH}`,
    }
  }

  function sync(...args) {
    return spawnSync('bash', [syncStableScript, ...args], { cwd: root, env: syncEnv(), encoding: 'utf8' })
  }

  const installed = (name) => join(profile, 'node_modules', name)
  const installedRevision = (name) => readFileSync(join(installed(name), 'index.js'), 'utf8').trim()

  before(() => {
    assertCorepackOnPath()
    fakeHome = join(tmpdir(), `sync-refresh-scope-${Date.now()}`)
    fixturePlugins = join(fakeHome, 'plugins')
    copySyncScripts(fakeHome)
    syncStableScript = join(fakeHome, 'scripts', 'sync-stable.sh')
    gitPath = fakeGitPath(fakeHome, fakeHome, '')
    profile = join(fakeHome, '.omnimux-dev', 'profiles', 'omnimux')
    mkdirSync(profile, { recursive: true })
    // 与真实 profile 一致：hoisted 布局把受管 file: 依赖拷贝成实体目录。
    writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'refresh-scope-profile', private: true, dependencies: {}, dsh: { profile: { bundles: [] } },
    }, null, 2) + '\n')
  })

  after(() => {
    rmSync(fakeHome, { recursive: true, force: true })
  })

  it('refreshes a managed package the run did not request but the verification checks', () => {
    const staleCopy = join(fakeHome, 'stale-analytics')

    writeFixturePlugin(requested, 'requested-v1')
    writeFixturePlugin(unrequested, 'unrequested-v1')
    const first = sync(requested, unrequested)
    assert.equal(first.status, 0, first.stderr || first.stdout)
    assert.match(installedRevision(unrequested), /unrequested-v1/)
    cpSync(installed(unrequested), staleCopy, { recursive: true })

    // 内容已变、版本号不变：快照前进到 v2，而已装副本仍是 v1。
    writeFixturePlugin(unrequested, 'unrequested-v2')
    const second = sync(requested, unrequested)
    assert.equal(second.status, 0, second.stderr || second.stdout)
    assert.match(installedRevision(unrequested), /unrequested-v2/)

    // 复现 pnpm 的同版本保留：把已装副本还原成旧内容，此时快照(v2) 比已装(v1) 新。
    rmSync(installed(unrequested), { recursive: true, force: true })
    cpSync(staleCopy, installed(unrequested), { recursive: true })
    assert.match(installedRevision(unrequested), /unrequested-v1/)

    const third = sync(requested)

    // 刷新范围必须覆盖核验范围：未请求的受管包也要被移开重装。
    const refreshLine = (third.stdout || '').split('\n').find((line) => line.includes('刷新本轮受管 file: 入口'))
    assert.ok(refreshLine, `应输出刷新清单；stdout=${third.stdout}`)
    assert.ok(refreshLine.includes(unrequested), `刷新清单应含未请求的受管包 ${unrequested}；实际=${refreshLine}`)
    assert.equal(third.status, 0, third.stderr || third.stdout)
    assert.match(
      installedRevision(unrequested),
      /unrequested-v2/,
      '未请求的受管包应装上本轮快照的内容，而不是上一轮的旧副本',
    )
  })
})
