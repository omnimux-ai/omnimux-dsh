import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const syncToAppScript = join(root, 'scripts/sync-to-app.sh')
const syncStableScript = join(root, 'scripts/sync-stable.sh')
const presetFixture = join(tmpdir(), `sync-presets-fixture-${process.pid}`)
const syncPresetsScript = join(presetFixture, 'scripts/sync-agent-presets.sh')

describe('OmniMux Profile Target Selection Matrix', () => {
  const fakeHome = join(tmpdir(), 'test-fake-home-omnimux-' + Date.now())
  const fixturePlugins = join(fakeHome, 'fixture-plugins')

  function syncEnv(extra = {}) {
    return {
      ...process.env,
      OMNIMUX_SYNC_VIA: 'internal',
      OMNIMUX_PLUGINS_DIR: fixturePlugins,
      HOME: fakeHome,
      COREPACK_HOME: process.env.COREPACK_HOME,
      COREPACK_DEFAULT_TO_LATEST: '0',
      COREPACK_ENABLE_AUTO_PIN: '0',
      CI: 'true',
      npm_config_offline: 'true',
      ...extra,
    }
  }

  function writeFixturePlugin(name, version = '1.0.0', revision = version, extra = {}) {
    const plugin = join(fixturePlugins, name)
    mkdirSync(plugin, { recursive: true })
    writeFileSync(join(plugin, 'package.json'), JSON.stringify({
      name,
      version,
      main: 'index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
      ...extra,
    }, null, 2) + '\n')
    writeFileSync(join(plugin, 'index.js'), `module.exports = { name: ${JSON.stringify(name)}, revision: ${JSON.stringify(revision)} }\n`)
    writeFileSync(join(plugin, 'cordis.patch.yml'), '[]\n')
  }

  before(() => {
    // Keep the real preset implementation, but never address installed Apps.
    mkdirSync(join(presetFixture, 'scripts'), { recursive: true })
    cpSync(join(root, 'presets'), join(presetFixture, 'presets'), { recursive: true })
    cpSync(join(root, 'scripts/resolve-omnimux-profile.sh'), join(presetFixture, 'scripts/resolve-omnimux-profile.sh'))
    writeFileSync(syncPresetsScript, readFileSync(join(root, 'scripts/sync-agent-presets.sh'), 'utf8')
      .replaceAll('/Applications/', `${presetFixture}/Applications/`))
    for (const name of [
      'omnimux', 'omnimux-accounts', 'omnimux-assets', 'omnimux-products', 'omnimux-forms',
      'omnimux-workflow', 'omnimux-market', 'omnimux-inspiration', 'omnimux-clip',
      'omnimux-video', 'omnimux-analytics', 'omnimux-publish',
    ]) writeFixturePlugin(name, '1.0.0')
    writeFixturePlugin('dsh-ui-kit', '1.0.0')
    // 创建包含 profiles/omnimux/package.json 的测试环境
    for (const sub of ['.omnimux-dev', '.omnimux', '.dsh']) {
      const p = join(fakeHome, sub, 'profiles', 'omnimux')
      mkdirSync(p, { recursive: true })
      writeFileSync(join(p, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
      writeFileSync(join(p, 'package.json'), JSON.stringify({
        name: 'omnimux-profile-mock',
        dependencies: {},
        dsh: { profile: { bundles: [] } }
      }, null, 2))
    }
  })

  after(() => {
    try {
      rmSync(fakeHome, { recursive: true, force: true })
      rmSync(presetFixture, { recursive: true, force: true })
    } catch {}
  })

  it('sync-to-app.sh help shows target parameter options', () => {
    const res = spawnSync('bash', [
      syncToAppScript,
      '--help'
    ], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.equal(res.status, 1)
    assert.match(res.stdout, /默认：构建并同步全部清单插件到 ~\/\.omnimux-dev/)
    assert.match(res.stdout, /--prod/)
    assert.match(res.stdout, /--dsh/)
    assert.match(res.stdout, /--all/)
  })

  it('sync-stable.sh targets only ~/.omnimux-dev by default', () => {
    const res = spawnSync('bash', [
      syncStableScript,
      'omnimux-video'
    ], {
      cwd: root,
      env: syncEnv(),
      encoding: 'utf8',
    })
    assert.equal(res.status, 0, res.stdout + res.stderr)
    assert.match(res.stdout, /\.omnimux-dev\/profiles\/omnimux/)
    assert.doesNotMatch(res.stdout, new RegExp(fakeHome + '/\\.omnimux/profiles'))
    assert.doesNotMatch(res.stdout, new RegExp(fakeHome + '/\\.dsh/profiles'))
  })

  it('sync-stable.sh targets ~/.omnimux when --prod is passed', () => {
    const res = spawnSync('bash', [
      syncStableScript,
      '--prod',
      'omnimux-video'
    ], {
      cwd: root,
      env: syncEnv(),
      encoding: 'utf8',
    })
    assert.equal(res.status, 0)
    assert.match(res.stdout, /\.omnimux\/profiles\/omnimux/)
    assert.doesNotMatch(res.stdout, new RegExp(fakeHome + '/\\.omnimux-dev/profiles'))
    assert.doesNotMatch(res.stdout, new RegExp(fakeHome + '/\\.dsh/profiles'))
  })

  it('sync-stable.sh targets ~/.dsh when --dsh is passed', () => {
    const res = spawnSync('bash', [
      syncStableScript,
      '--dsh',
      'omnimux-video'
    ], {
      cwd: root,
      env: syncEnv(),
      encoding: 'utf8',
    })
    assert.equal(res.status, 0)
    assert.match(res.stdout, /\.dsh\/profiles\/omnimux/)
    assert.doesNotMatch(res.stdout, new RegExp(fakeHome + '/\\.omnimux-dev/profiles'))
    assert.doesNotMatch(res.stdout, new RegExp(fakeHome + '/\\.omnimux/profiles'))
  })

  it('sync-stable.sh broadcasts to all profiles when --all is passed', () => {
    const res = spawnSync('bash', [
      syncStableScript,
      '--all',
      'omnimux-video'
    ], {
      cwd: root,
      env: syncEnv(),
      encoding: 'utf8',
    })
    assert.equal(res.status, 0, res.stdout + res.stderr)
    assert.match(res.stdout, /\.omnimux-dev\/profiles\/omnimux/)
    assert.match(res.stdout, /\.omnimux\/profiles\/omnimux/)
    assert.match(res.stdout, /\.dsh\/profiles\/omnimux/)
  })

  it('sync-stable.sh supports --target=dev,prod multi-selection', () => {
    const res = spawnSync('bash', [
      syncStableScript,
      '--target=dev,prod',
      'omnimux-video'
    ], {
      cwd: root,
      env: syncEnv(),
      encoding: 'utf8',
    })
    assert.equal(res.status, 0, res.stdout + res.stderr)
    assert.match(res.stdout, /\.omnimux-dev\/profiles\/omnimux/)
    assert.match(res.stdout, /\.omnimux\/profiles\/omnimux/)
    assert.doesNotMatch(res.stdout, new RegExp(fakeHome + '/\\.dsh/profiles'))
  })

  it('sync-stable.sh puts @deepseek-ai/dsh-base before omnimux in bundles', () => {
    const profile = join(fakeHome, '.omnimux-dev', 'profiles', 'omnimux')
    rmSync(join(profile, 'node_modules'), { recursive: true, force: true })
    rmSync(join(profile, '.materialize-snapshots'), { recursive: true, force: true })
    rmSync(join(profile, 'pnpm-lock.yaml'), { force: true })
    // Seed the wrong order that produced: patch: entry llm-pi-ai not found
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'omnimux-profile-mock',
      dependencies: {},
      dsh: {
        profile: {
          bundles: [
            'omnimux',
            'omnimux-workflow',
            '@deepseek-ai/dsh-base',
            '@deepseek-ai/dsh-web-app',
            'dsh-better-sidebar',
          ],
        },
      },
    }, null, 2) + '\n')
    // Declare dsh.bundle so omnimux stays on the load list after sync.
    mkdirSync(join(profile, 'node_modules', 'omnimux'), { recursive: true })
    writeFileSync(join(profile, 'node_modules', 'omnimux', 'package.json'), JSON.stringify({
      name: 'omnimux',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, null, 2) + '\n')

    const res = spawnSync('bash', [
      syncStableScript,
      'omnimux',
    ], {
      cwd: root,
      env: syncEnv(),
      encoding: 'utf8',
    })
    assert.equal(res.status, 0)
    assert.match(res.stdout, /纠正 bundles 顺序/)

    const next = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
    const bundles = next.dsh.profile.bundles
    const baseAt = bundles.indexOf('@deepseek-ai/dsh-base')
    const omnimuxAt = bundles.indexOf('omnimux')
    assert.ok(baseAt >= 0, 'dsh-base must remain listed')
    assert.ok(omnimuxAt >= 0, 'omnimux must remain listed')
    assert.ok(baseAt < omnimuxAt, `expected dsh-base before omnimux, got ${JSON.stringify(bundles)}`)
    assert.equal(bundles[0], '@deepseek-ai/dsh-base')
    assert.equal(bundles[1], '@deepseek-ai/dsh-web-app')
  })

  it('requires old self-references to be selected, then keeps all managed entries loadable after a repeated pnpm sync', () => {
    const migrationHome = join(tmpdir(), 'test-managed-materialization-' + Date.now())
    const profile = join(migrationHome, '.omnimux-dev', 'profiles', 'omnimux')
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\n')
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'managed-materialization-profile',
      private: true,
      dependencies: {
        'omnimux-assets': 'file:node_modules/omnimux-assets',
        'dsh-ui-kit': 'file:./node_modules/dsh-ui-kit',
      },
      dsh: { profile: { bundles: [] } },
    }, null, 2) + '\n')
    const managedKit = join(profile, '.materialize-snapshots', 'plugins', 'dsh-ui-kit')
    mkdirSync(managedKit, { recursive: true })
    writeFileSync(join(managedKit, 'package.json'), readFileSync(join(fixturePlugins, 'dsh-ui-kit', 'package.json')))
    writeFileSync(join(managedKit, 'index.js'), "module.exports = { revision: 'managed-kit' }\n")
    writeFileSync(join(managedKit, 'cordis.patch.yml'), readFileSync(join(fixturePlugins, 'dsh-ui-kit', 'cordis.patch.yml')))
    const managedKitEntry = readFileSync(join(managedKit, 'index.js'), 'utf8')
    writeFixturePlugin('omnimux-video', '1.0.0', 'first')
    writeFixturePlugin('omnimux-assets', '1.0.0', 'assets', {
      dependencies: { 'dsh-ui-kit': 'file:../../../../personal/dsh-ui-kit' },
    })

    try {
      const manifestBeforeRejectedSingle = readFileSync(join(profile, 'package.json'), 'utf8')
      const kitBeforeRejectedSingle = readFileSync(join(managedKit, 'index.js'), 'utf8')
      const single = spawnSync('bash', [syncStableScript, 'omnimux-video'], {
        cwd: root,
        env: syncEnv({ HOME: migrationHome }),
        encoding: 'utf8',
      })
      assert.notEqual(single.status, 0)
      assert.match(single.stderr, /未选中的旧物化依赖 omnimux-assets/)
      assert.ok(!existsSync(join(profile, '.materialize-snapshots', 'plugins', 'omnimux-video')))
      assert.equal(readFileSync(join(profile, 'package.json'), 'utf8'), manifestBeforeRejectedSingle)
      assert.equal(readFileSync(join(managedKit, 'index.js'), 'utf8'), kitBeforeRejectedSingle)

      const first = spawnSync('bash', [syncStableScript], {
        cwd: root,
        env: syncEnv({ HOME: migrationHome }),
        encoding: 'utf8',
      })
      assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`)

      const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
      for (const name of ['omnimux-video', 'omnimux-assets']) {
        assert.equal(manifest.dependencies[name], `file:.materialize-snapshots/plugins/${name}`)
        assert.ok(existsSync(join(profile, '.materialize-snapshots', 'plugins', name, 'package.json')))
      }
      assert.equal(manifest.dependencies['dsh-ui-kit'], 'file:.materialize-snapshots/plugins/dsh-ui-kit')
      const stagedAssets = JSON.parse(readFileSync(join(profile, '.materialize-snapshots', 'plugins', 'omnimux-assets', 'package.json'), 'utf8'))
      assert.equal(stagedAssets.dependencies['dsh-ui-kit'], 'file:../dsh-ui-kit')
      assert.ok(existsSync(join(profile, '.materialize-snapshots', 'plugins', 'dsh-ui-kit', 'package.json')))
      assert.equal(
        readFileSync(join(profile, '.materialize-snapshots', 'plugins', 'dsh-ui-kit', 'index.js'), 'utf8'),
        managedKitEntry,
        'sync-stable reads the managed kit source without overwriting it from node_modules',
      )
      const requireFromProfile = createRequire(join(profile, 'package.json'))
      assert.equal(requireFromProfile('omnimux-video').revision, 'first')
      assert.equal(requireFromProfile('omnimux-assets').revision, 'assets')

      const nextVideoEntry = join(fixturePlugins, 'omnimux-video', 'index.js.next')
      writeFileSync(nextVideoEntry, "module.exports = { name: 'omnimux-video', revision: 'second' }\n")
      renameSync(nextVideoEntry, join(fixturePlugins, 'omnimux-video', 'index.js'))
      const second = spawnSync('bash', [syncStableScript, 'omnimux-video'], {
        cwd: root,
        env: syncEnv({ HOME: migrationHome }),
        encoding: 'utf8',
      })
      assert.equal(second.status, 0, second.stderr)
      delete requireFromProfile.cache[requireFromProfile.resolve('omnimux-video')]
      assert.equal(requireFromProfile('omnimux-video').revision, 'second')
      assert.equal(requireFromProfile('omnimux-assets').revision, 'assets')
      assert.match(second.stdout, /刷新本轮受管 file: 入口 \(omnimux-video\)/)
      assert.match(second.stdout, /已核验 omnimux-video@1\.0\.0 index\.js \+ \d+ 个打包文件/)
      assert.match(second.stdout, /已核验 omnimux-assets@1\.0\.0 index\.js \+ \d+ 个打包文件/)
    } finally {
      rmSync(migrationHome, { recursive: true, force: true })
    }
  })

  it('refreshes the managed kit on full sync when its same-version source changes', () => {
    const fullHome = join(tmpdir(), 'test-managed-full-kit-refresh-' + Date.now())
    const profile = join(fullHome, '.omnimux-dev', 'profiles', 'omnimux')
    const snapshotPlugins = join(profile, '.materialize-snapshots', 'plugins')
    const kit = join(snapshotPlugins, 'dsh-ui-kit')
    const installedKit = join(profile, 'node_modules', 'dsh-ui-kit', 'index.js')
    mkdirSync(kit, { recursive: true })
    writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\n')
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'managed-full-kit-refresh', private: true,
      dependencies: Object.fromEntries([
        ...['omnimux', 'omnimux-accounts', 'omnimux-assets', 'omnimux-products', 'omnimux-forms', 'omnimux-workflow', 'omnimux-market', 'omnimux-inspiration', 'omnimux-clip', 'omnimux-video', 'omnimux-analytics', 'omnimux-publish'],
        'dsh-ui-kit',
      ].map(name => [name, `file:.materialize-snapshots/plugins/${name}`])),
      dsh: { profile: { bundles: [] } },
    }, null, 2) + '\n')
    for (const name of ['omnimux', 'omnimux-accounts', 'omnimux-assets', 'omnimux-products', 'omnimux-forms', 'omnimux-workflow', 'omnimux-market', 'omnimux-inspiration', 'omnimux-clip', 'omnimux-video', 'omnimux-analytics', 'omnimux-publish', 'dsh-ui-kit']) {
      cpSync(join(fixturePlugins, name), join(snapshotPlugins, name), { recursive: true })
    }
    const assetManifestPath = join(snapshotPlugins, 'omnimux-assets', 'package.json')
    const assetManifest = JSON.parse(readFileSync(assetManifestPath, 'utf8'))
    assetManifest.dependencies = { 'dsh-ui-kit': 'file:../dsh-ui-kit' }
    writeFileSync(assetManifestPath, JSON.stringify(assetManifest, null, 2) + '\n')
    writeFileSync(join(kit, 'index.js'), "module.exports = { revision: 'before' }\n")

    try {
      const initial = spawnSync('corepack', ['pnpm', 'install'], { cwd: profile, env: syncEnv({ HOME: fullHome }), encoding: 'utf8' })
      assert.equal(initial.status, 0, `${initial.stdout}\n${initial.stderr}`)
      assert.match(readFileSync(installedKit, 'utf8'), /before/)
      const nextKitEntry = join(kit, 'index.js.next')
      writeFileSync(nextKitEntry, "module.exports = { revision: 'after' }\n")
      renameSync(nextKitEntry, join(kit, 'index.js'))

      const result = spawnSync('bash', [syncStableScript], { cwd: root, env: syncEnv({ HOME: fullHome }), encoding: 'utf8' })
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
      assert.match(result.stdout, /刷新本轮受管 file: 入口 .*dsh-ui-kit/)
      assert.match(readFileSync(installedKit, 'utf8'), /after/)
    } finally {
      rmSync(fullHome, { recursive: true, force: true })
    }
  })

  it('restores a selected managed file package when its pnpm install fails', () => {
    const failureHome = join(tmpdir(), 'test-managed-file-refresh-restore-' + Date.now())
    const profile = join(failureHome, '.omnimux-dev', 'profiles', 'omnimux')
    const bin = join(failureHome, 'bin')
    const plugin = join(fixturePlugins, 'omnimux-refresh-restore')
    const installedEntry = join(profile, 'node_modules', 'omnimux-refresh-restore', 'index.js')
    mkdirSync(profile, { recursive: true })
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\n')
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'managed-file-refresh-restore', private: true, dependencies: {}, dsh: { profile: { bundles: [] } } }, null, 2) + '\n')
    writeFixturePlugin('omnimux-refresh-restore', '1.0.0', 'before')

    try {
      const initial = spawnSync('bash', [syncStableScript, 'omnimux-refresh-restore'], { cwd: root, env: syncEnv({ HOME: failureHome }), encoding: 'utf8' })
      assert.equal(initial.status, 0, initial.stderr)
      assert.match(readFileSync(installedEntry, 'utf8'), /before/)
      const nextEntry = join(plugin, 'index.js.next')
      writeFileSync(nextEntry, "module.exports = { name: 'omnimux-refresh-restore', revision: 'after' }\n")
      renameSync(nextEntry, join(plugin, 'index.js'))
      const failLog = join(failureHome, 'pnpm.log')
      const realCorepack = join(dirname(process.execPath), 'corepack')
      const fakeCorepack = join(bin, 'corepack')
      writeFileSync(fakeCorepack, `#!/bin/bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(failLog)}\nif [ "$1" = pnpm ] && [ "$2" = install ]; then exit 79; fi\n${JSON.stringify(realCorepack)} "$@"\n`)
      chmodSync(fakeCorepack, 0o755)

      const failed = spawnSync('bash', [syncStableScript, 'omnimux-refresh-restore'], {
        cwd: root,
        env: syncEnv({ HOME: failureHome, PATH: `${bin}:${process.env.PATH}` }),
        encoding: 'utf8',
      })
      assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`)
      assert.match(failed.stderr, /已恢复本轮暂存的 file: 安装入口/)
      assert.match(readFileSync(installedEntry, 'utf8'), /before/)
      assert.match(readFileSync(failLog, 'utf8'), /^pnpm install$/m)
      assert.equal(readdirSync(profile).filter(name => name.startsWith('.pnpm-file-refresh.')).length, 0)
    } finally {
      rmSync(failureHome, { recursive: true, force: true })
    }
  })

  it('restores a selected managed file package when post-install fingerprint verification fails', () => {
    const failureHome = join(tmpdir(), 'test-managed-file-refresh-fingerprint-restore-' + Date.now())
    const profile = join(failureHome, '.omnimux-dev', 'profiles', 'omnimux')
    const bin = join(failureHome, 'bin')
    const plugin = join(fixturePlugins, 'omnimux-fingerprint-restore')
    const installedEntry = join(profile, 'node_modules', 'omnimux-fingerprint-restore', 'index.js')
    mkdirSync(profile, { recursive: true })
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\n')
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'managed-file-refresh-fingerprint-restore', private: true, dependencies: {}, dsh: { profile: { bundles: [] } } }, null, 2) + '\n')
    writeFixturePlugin('omnimux-fingerprint-restore', '1.0.0', 'before')

    try {
      const initial = spawnSync('bash', [syncStableScript, 'omnimux-fingerprint-restore'], { cwd: root, env: syncEnv({ HOME: failureHome }), encoding: 'utf8' })
      assert.equal(initial.status, 0, initial.stderr)
      const nextEntry = join(plugin, 'index.js.next')
      writeFileSync(nextEntry, "module.exports = { name: 'omnimux-fingerprint-restore', revision: 'after' }\n")
      renameSync(nextEntry, join(plugin, 'index.js'))
      const realCorepack = join(dirname(process.execPath), 'corepack')
      const fakeCorepack = join(bin, 'corepack')
      writeFileSync(fakeCorepack, `#!/bin/bash\n${JSON.stringify(realCorepack)} "$@"\nresult=$?\nif [ "$result" -eq 0 ] && [ "$1" = pnpm ] && [ "$2" = install ]; then rm -f ${JSON.stringify(installedEntry)}; fi\nexit "$result"\n`)
      chmodSync(fakeCorepack, 0o755)

      const failed = spawnSync('bash', [syncStableScript, 'omnimux-fingerprint-restore'], {
        cwd: root,
        env: syncEnv({ HOME: failureHome, PATH: `${bin}:${process.env.PATH}` }),
        encoding: 'utf8',
      })
      assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`)
      assert.match(failed.stderr, /已安装包入口缺失: omnimux-fingerprint-restore → index\.js/)
      assert.match(failed.stderr, /物化核验失败；已恢复本轮暂存的 file: 安装入口/)
      assert.match(readFileSync(installedEntry, 'utf8'), /before/)
      assert.equal(readdirSync(profile).filter(name => name.startsWith('.pnpm-file-refresh.')).length, 0)
    } finally {
      rmSync(failureHome, { recursive: true, force: true })
    }
  })

  it('keeps the one current-worktree L2 plugin link while refreshing another managed package', () => {
    const testHome = join(tmpdir(), 'test-l2-in-progress-link-' + Date.now())
    const l2Home = join(testHome, '.dsh-dev', 'tasks', 'refresh-hub')
    const profile = join(l2Home, 'profiles', 'omnimux-dev-refresh-hub')
    const snapshots = join(profile, '.materialize-snapshots', 'plugins')
    const linkedWorkflow = join(profile, 'node_modules', 'omnimux-workflow')
    mkdirSync(snapshots, { recursive: true })
    writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\n')
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'l2-in-progress-link-profile',
      private: true,
      dependencies: {
        omnimux: 'file:.materialize-snapshots/plugins/omnimux',
        'omnimux-workflow': 'file:.materialize-snapshots/plugins/omnimux-workflow',
      },
      dsh: { profile: { bundles: [] } },
    }, null, 2) + '\n')
    cpSync(join(fixturePlugins, 'omnimux'), join(snapshots, 'omnimux'), { recursive: true })
    cpSync(join(fixturePlugins, 'omnimux-workflow'), join(snapshots, 'omnimux-workflow'), { recursive: true })

    try {
      const initial = spawnSync('corepack', ['pnpm', 'install'], { cwd: profile, env: syncEnv({ HOME: testHome }), encoding: 'utf8' })
      assert.equal(initial.status, 0, `${initial.stdout}\n${initial.stderr}`)
      const workflowSource = join(fixturePlugins, 'omnimux-workflow')
      const linkedDependency = join(fixturePlugins, 'fixture-link-dependency')
      mkdirSync(linkedDependency, { recursive: true })
      writeFileSync(join(linkedDependency, 'package.json'), JSON.stringify({ name: 'fixture-link-dependency', version: '1.0.0', main: 'index.js' }) + '\n')
      writeFileSync(join(linkedDependency, 'index.js'), 'module.exports = {}\n')
      const workflowManifestPath = join(workflowSource, 'package.json')
      const workflowManifest = JSON.parse(readFileSync(workflowManifestPath, 'utf8'))
      workflowManifest.dependencies = { 'fixture-link-dependency': 'file:../fixture-link-dependency' }
      writeFileSync(workflowManifestPath, JSON.stringify(workflowManifest, null, 2) + '\n')
      rmSync(linkedWorkflow, { recursive: true, force: true })
      symlinkSync(workflowSource, linkedWorkflow)

      const result = spawnSync('bash', [syncStableScript, `--target=${l2Home}`, 'omnimux'], {
        cwd: root,
        env: syncEnv({ HOME: testHome }),
        encoding: 'utf8',
      })
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
      assert.ok(lstatSync(linkedWorkflow).isSymbolicLink())
      assert.match(result.stdout, /保留 L2 在研 link: omnimux-workflow/)
      assert.equal(existsSync(join(workflowSource, 'node_modules')), false)

      rmSync(linkedWorkflow, { recursive: true, force: true })
      const wrongLinkTarget = join(fixturePlugins, 'omnimux')
      symlinkSync(wrongLinkTarget, linkedWorkflow)
      const blockBin = join(testHome, 'blocked-bin')
      const blockedCalls = join(testHome, 'blocked-calls.log')
      mkdirSync(blockBin, { recursive: true })
      for (const command of ['corepack', 'mv']) {
        const file = join(blockBin, command)
        writeFileSync(file, `#!/bin/bash\nprintf '${command} %s\\n' "$*" >> ${JSON.stringify(blockedCalls)}\nexit 91\n`)
        chmodSync(file, 0o755)
      }
      const blockedEnv = syncEnv({ HOME: testHome, PATH: `${blockBin}:${process.env.PATH}` })
      const blockedOther = spawnSync('bash', [syncStableScript, `--target=${l2Home}`, 'omnimux'], {
        cwd: root,
        env: blockedEnv,
        encoding: 'utf8',
      })
      assert.equal(blockedOther.status, 1, `${blockedOther.stdout}\n${blockedOther.stderr}`)
      assert.match(blockedOther.stderr, /非法 L2 在研 link: omnimux-workflow 未指向当前 worktree source/)
      assert.ok(lstatSync(linkedWorkflow).isSymbolicLink())
      assert.equal(readlinkSync(linkedWorkflow), wrongLinkTarget)

      const blockedSelected = spawnSync('bash', [syncStableScript, `--target=${l2Home}`, 'omnimux-workflow'], {
        cwd: root,
        env: blockedEnv,
        encoding: 'utf8',
      })
      assert.equal(blockedSelected.status, 1, `${blockedSelected.stdout}\n${blockedSelected.stderr}`)
      assert.match(blockedSelected.stderr, /非法 L2 在研 link: omnimux-workflow 未指向当前 worktree source/)
      assert.ok(lstatSync(linkedWorkflow).isSymbolicLink())
      assert.equal(readlinkSync(linkedWorkflow), wrongLinkTarget)
      assert.equal(existsSync(blockedCalls), false)
    } finally {
      rmSync(testHome, { recursive: true, force: true })
    }
  })

  it('fails closed when pnpm leaves a managed package without its declared entry', () => {
    const validationHome = join(tmpdir(), 'test-managed-validation-' + Date.now())
    const profile = join(validationHome, '.omnimux-dev', 'profiles', 'omnimux')
    mkdirSync(profile, { recursive: true })
    if (!existsSync(join(profile, 'pnpm-workspace.yaml'))) {
      writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    }
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'managed-validation-profile', private: true, dependencies: {}, dsh: { profile: { bundles: [] } },
    }, null, 2) + '\n')
    writeFixturePlugin('omnimux-broken', '1.0.0', 'broken', { main: 'missing.js' })

    try {
      const result = spawnSync('bash', [syncStableScript, 'omnimux-broken'], {
        cwd: root,
        env: syncEnv({ HOME: validationHome }),
        encoding: 'utf8',
      })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /已安装包入口缺失: omnimux-broken → missing\.js/)
    } finally {
      rmSync(validationHome, { recursive: true, force: true })
    }
  })

  it('requires the managed kit source before writing a selected kit-dependent plugin', () => {
    const kitHome = join(tmpdir(), 'test-managed-kit-source-' + Date.now())
    const profile = join(kitHome, '.omnimux-dev', 'profiles', 'omnimux')
    mkdirSync(join(profile, 'node_modules', 'dsh-ui-kit'), { recursive: true })
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'managed-kit-source-profile', private: true, dependencies: {}, dsh: { profile: { bundles: [] } },
    }, null, 2) + '\n')
    writeFileSync(join(profile, 'node_modules', 'dsh-ui-kit', 'package.json'), JSON.stringify({ name: 'dsh-ui-kit', version: '1.0.0', main: 'index.js' }) + '\n')
    writeFileSync(join(profile, 'node_modules', 'dsh-ui-kit', 'index.js'), "module.exports = { revision: 'node-modules-only' }\n")
    writeFixturePlugin('omnimux-assets', '1.0.0', 'assets', {
      dependencies: { 'dsh-ui-kit': 'file:../../../../personal/dsh-ui-kit' },
    })

    try {
      const manifestBefore = readFileSync(join(profile, 'package.json'), 'utf8')
      const installedKitBefore = readFileSync(join(profile, 'node_modules', 'dsh-ui-kit', 'index.js'), 'utf8')
      const result = spawnSync('bash', [syncStableScript], {
        cwd: root,
        env: syncEnv({ HOME: kitHome }),
        encoding: 'utf8',
      })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /缺少受管 dsh-ui-kit/)
      assert.equal(readFileSync(join(profile, 'package.json'), 'utf8'), manifestBefore)
      assert.equal(readFileSync(join(profile, 'node_modules', 'dsh-ui-kit', 'index.js'), 'utf8'), installedKitBefore)
      assert.ok(!existsSync(join(profile, '.materialize-snapshots', 'plugins', 'omnimux-assets')))
      assert.ok(!existsSync(join(profile, '.materialize-snapshots', 'plugins', 'omnimux')))
    } finally {
      rmSync(kitHome, { recursive: true, force: true })
    }
  })

  it('requires a missing kit before a named non-kit sync can retain a kit-dependent plugin', () => {
    const retainedHome = join(tmpdir(), 'test-retained-managed-kit-source-' + Date.now())
    const profile = join(retainedHome, '.omnimux-dev', 'profiles', 'omnimux')
    const retainedAssets = join(profile, '.materialize-snapshots', 'plugins', 'omnimux-assets')
    mkdirSync(retainedAssets, { recursive: true })
    writeFileSync(join(retainedAssets, 'package.json'), JSON.stringify({
      name: 'omnimux-assets', version: '1.0.0', main: 'index.js', dependencies: { 'dsh-ui-kit': 'file:../dsh-ui-kit' },
    }, null, 2) + '\n')
    writeFileSync(join(retainedAssets, 'index.js'), "module.exports = { revision: 'retained-assets' }\n")
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'retained-managed-kit-profile',
      private: true,
      dependencies: {
        'omnimux-assets': 'file:.materialize-snapshots/plugins/omnimux-assets',
        'dsh-ui-kit': 'file:.materialize-snapshots/plugins/dsh-ui-kit',
      },
      dsh: { profile: { bundles: [] } },
    }, null, 2) + '\n')
    writeFixturePlugin('omnimux-video', '1.0.0', 'named-video')

    try {
      const manifestBefore = readFileSync(join(profile, 'package.json'), 'utf8')
      const retainedBefore = readFileSync(join(retainedAssets, 'index.js'), 'utf8')
      const result = spawnSync('bash', [syncStableScript, 'omnimux-video'], {
        cwd: root,
        env: syncEnv({ HOME: retainedHome }),
        encoding: 'utf8',
      })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /缺少受管 dsh-ui-kit/)
      assert.equal(readFileSync(join(profile, 'package.json'), 'utf8'), manifestBefore)
      assert.equal(readFileSync(join(retainedAssets, 'index.js'), 'utf8'), retainedBefore)
      assert.ok(!existsSync(join(profile, '.materialize-snapshots', 'plugins', 'omnimux-video')))
    } finally {
      rmSync(retainedHome, { recursive: true, force: true })
    }
  })

  it('rejects an unowned node_modules self-reference before it can be moved to .ignored', () => {
    const legacyHome = join(tmpdir(), 'test-managed-unowned-self-reference-' + Date.now())
    const profile = join(legacyHome, '.omnimux-dev', 'profiles', 'omnimux')
    const sidebar = join(profile, 'node_modules', 'dsh-better-sidebar')
    mkdirSync(sidebar, { recursive: true })
    const manifest = {
      name: 'managed-unowned-self-reference-profile',
      private: true,
      dependencies: { 'dsh-better-sidebar': 'file:./node_modules/dsh-better-sidebar' },
      dsh: { profile: { bundles: [] } },
    }
    writeFileSync(join(profile, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
    writeFileSync(join(sidebar, 'package.json'), JSON.stringify({ name: 'dsh-better-sidebar', version: '1.0.0', main: 'index.js' }) + '\n')
    writeFileSync(join(sidebar, 'index.js'), "module.exports = { revision: 'profile-sidebar' }\n")

    try {
      const manifestBefore = readFileSync(join(profile, 'package.json'), 'utf8')
      const sidebarBefore = readFileSync(join(sidebar, 'index.js'), 'utf8')
      const result = spawnSync('bash', [syncStableScript, 'omnimux-video'], {
        cwd: root,
        env: syncEnv({ HOME: legacyHome }),
        encoding: 'utf8',
      })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /非产品旧自引用 dsh-better-sidebar = file:\.\/node_modules\/dsh-better-sidebar/)
      assert.equal(readFileSync(join(profile, 'package.json'), 'utf8'), manifestBefore)
      assert.equal(readFileSync(join(sidebar, 'index.js'), 'utf8'), sidebarBefore)
      assert.ok(!existsSync(join(profile, '.materialize-snapshots', 'plugins', 'omnimux-video')))
      assert.ok(!existsSync(join(profile, 'node_modules', '.ignored')))
    } finally {
      rmSync(legacyHome, { recursive: true, force: true })
    }
  })

  it('fails closed when pnpm returns a stale packed helper despite an unchanged main entry', () => {
    const validationHome = join(tmpdir(), 'test-managed-stale-helper-' + Date.now())
    const profile = join(validationHome, '.omnimux-dev', 'profiles', 'omnimux')
    const bin = join(validationHome, 'bin')
    const plugin = join(fixturePlugins, 'omnimux-stale-helper')
    const staleHelper = join(profile, 'node_modules', 'omnimux-stale-helper', 'helper.js')
    mkdirSync(profile, { recursive: true })
    if (!existsSync(join(profile, 'pnpm-workspace.yaml'))) {
      writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    }
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'managed-stale-helper-profile', private: true, dependencies: {}, dsh: { profile: { bundles: [] } },
    }, null, 2) + '\n')
    writeFixturePlugin('omnimux-stale-helper', '1.0.0', 'stable-main', { files: ['index.js', 'helper.js', 'cordis.patch.yml'] })
    writeFileSync(join(plugin, 'index.js'), "module.exports = require('./helper.js')\n")
    writeFileSync(join(plugin, 'helper.js'), "module.exports = { revision: 'fresh-helper' }\n")
    const realCorepack = join(dirname(process.execPath), 'corepack')
    const corepack = join(bin, 'corepack')
    writeFileSync(corepack, `#!/bin/bash\n${JSON.stringify(realCorepack)} "$@"\nresult=$?\nif [ "$result" -eq 0 ] && [ -n "$OMNIMUX_TEST_STALE_FILE" ]; then\n  printf '%s\\n' "module.exports = { revision: 'stale-helper' }" > "$OMNIMUX_TEST_STALE_FILE.stale"\n  mv "$OMNIMUX_TEST_STALE_FILE.stale" "$OMNIMUX_TEST_STALE_FILE"\nfi\nexit "$result"\n`)
    chmodSync(corepack, 0o755)

    try {
      const result = spawnSync('bash', [syncStableScript, 'omnimux-stale-helper'], {
        cwd: root,
        env: syncEnv({
          HOME: validationHome,
          PATH: `${bin}:${process.env.PATH}`,
          OMNIMUX_TEST_STALE_FILE: staleHelper,
        }),
        encoding: 'utf8',
      })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /已安装包打包文件指纹不匹配: omnimux-stale-helper → helper\.js/)
    } finally {
      rmSync(validationHome, { recursive: true, force: true })
    }
  })

  it('fails closed when a matching installed package resolves outside the profile', () => {
    const validationHome = join(tmpdir(), 'test-managed-external-package-' + Date.now())
    const profile = join(validationHome, '.omnimux-dev', 'profiles', 'omnimux')
    const bin = join(validationHome, 'bin')
    const plugin = join(fixturePlugins, 'omnimux-external-package')
    const installedPlugin = join(profile, 'node_modules', 'omnimux-external-package')
    mkdirSync(profile, { recursive: true })
    if (!existsSync(join(profile, 'pnpm-workspace.yaml'))) {
      writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    }
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'managed-external-package-profile', private: true, dependencies: {}, dsh: { profile: { bundles: [] } },
    }, null, 2) + '\n')
    writeFixturePlugin('omnimux-external-package', '1.0.0', 'same-content')
    const realCorepack = join(dirname(process.execPath), 'corepack')
    const corepack = join(bin, 'corepack')
    writeFileSync(corepack, `#!/bin/bash\n${JSON.stringify(realCorepack)} "$@"\nresult=$?\nif [ "$result" -eq 0 ] && [ -n "$OMNIMUX_TEST_EXTERNAL_PACKAGE" ]; then\n  rm -rf "$OMNIMUX_TEST_INSTALLED_PACKAGE"\n  ln -s "$OMNIMUX_TEST_EXTERNAL_PACKAGE" "$OMNIMUX_TEST_INSTALLED_PACKAGE"\nfi\nexit "$result"\n`)
    chmodSync(corepack, 0o755)

    try {
      const result = spawnSync('bash', [syncStableScript, 'omnimux-external-package'], {
        cwd: root,
        env: syncEnv({
          HOME: validationHome,
          PATH: `${bin}:${process.env.PATH}`,
          OMNIMUX_TEST_INSTALLED_PACKAGE: installedPlugin,
          OMNIMUX_TEST_EXTERNAL_PACKAGE: plugin,
        }),
        encoding: 'utf8',
      })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /已安装包解析到 profile 外部: omnimux-external-package/)
    } finally {
      rmSync(validationHome, { recursive: true, force: true })
    }
  })

  it('restores pnpm links and transitive package resolution after a failed materialization', () => {
    const rollbackHome = join(tmpdir(), 'test-managed-rollback-' + Date.now())
    const rollbackRepo = join(rollbackHome, 'rollback-repo')
    const rollbackScripts = join(rollbackRepo, 'scripts')
    const profile = join(rollbackHome, '.omnimux-dev', 'profiles', 'omnimux')
    const stage = join(profile, '.materialize-snapshots', 'plugins')
    const plugin = join(stage, 'rollback-plugin')
    const dependency = join(stage, 'rollback-dependency')
    const rollbackScript = join(rollbackScripts, 'materialize-with-rollback.sh')
    mkdirSync(rollbackScripts, { recursive: true })
    mkdirSync(plugin, { recursive: true })
    mkdirSync(dependency, { recursive: true })
    cpSync(join(root, 'scripts', 'materialize-with-rollback.sh'), rollbackScript)
    writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: 'rollback-dependency', version: '1.0.0', main: 'index.js' }) + '\n')
    writeFileSync(join(dependency, 'index.js'), "module.exports = { revision: 'old-dependency' }\n")
    writeFileSync(join(plugin, 'package.json'), JSON.stringify({
      name: 'rollback-plugin', version: '1.0.0', main: 'index.js', dependencies: { 'rollback-dependency': 'file:../rollback-dependency' },
    }) + '\n')
    writeFileSync(join(plugin, 'index.js'), "module.exports = require('rollback-dependency')\n")
    mkdirSync(profile, { recursive: true })
    if (!existsSync(join(profile, 'pnpm-workspace.yaml'))) {
      writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    }
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'rollback-profile', private: true, dependencies: { 'rollback-plugin': 'file:.materialize-snapshots/plugins/rollback-plugin' },
    }, null, 2) + '\n')
    const initialInstall = spawnSync('corepack', ['pnpm', 'install'], {
      cwd: profile,
      env: syncEnv({ HOME: rollbackHome }),
      encoding: 'utf8',
    })
    assert.equal(initialInstall.status, 0, initialInstall.stderr)
    const originalRequire = createRequire(join(profile, 'package.json'))
    assert.equal(originalRequire('rollback-plugin').revision, 'old-dependency')
    writeFileSync(join(rollbackScripts, 'sync-to-app.sh'), `#!/usr/bin/env bash\nset -euo pipefail\nprofile="$HOME/.omnimux-dev/profiles/omnimux"\nprintf '%s\\n' "module.exports = { revision: 'new-dependency' }" > "$profile/.materialize-snapshots/plugins/rollback-dependency/index.js"\n(cd "$profile" && corepack pnpm install)\nexit 42\n`)
    chmodSync(join(rollbackScripts, 'sync-to-app.sh'), 0o755)

    try {
      const result = spawnSync('bash', [rollbackScript, 'rollback-plugin'], {
        cwd: rollbackRepo,
        env: syncEnv({ HOME: rollbackHome, OMNIMUX_MERGE_CONFIRMED: '1' }),
        encoding: 'utf8',
      })
      assert.equal(result.status, 42, result.stderr)
      assert.match(result.stderr, /已恢复 pnpm 受管依赖拓扑/)
      assert.ok(lstatSync(join(profile, 'node_modules', 'rollback-plugin')).isSymbolicLink())
      const restored = spawnSync(process.execPath, ['-e', [
        "const { createRequire } = require('node:module')",
        "const requireFromProfile = createRequire(process.argv[1])",
        "process.stdout.write(requireFromProfile('rollback-plugin').revision)",
      ].join('; '), join(profile, 'package.json')], { encoding: 'utf8' })
      assert.equal(restored.status, 0, restored.stderr)
      assert.equal(restored.stdout, 'old-dependency')
    } finally {
      rmSync(rollbackHome, { recursive: true, force: true })
    }
  })

  it('refreshes without changing the lock or installing platform-incompatible optional dependencies', () => {
    const testHome = join(tmpdir(), `test-refresh-platform-${process.pid}`)
    const excludedOs = process.platform === 'win32' ? 'darwin' : 'win32'
    try {
      for (const linker of ['hoisted', 'isolated']) {
        const profile = join(testHome, linker, '.omnimux-dev/profiles/omnimux')
        const snapshots = join(profile, '.materialize-snapshots/plugins')
        const name = 'omnimux-platform-fixture'
        const optional = 'fixture-other-platform'
        writeFixturePlugin(name, '1.0.0', 'platform-stable', {
          optionalDependencies: { [optional]: 'file:../fixture-other-platform' },
        })
        mkdirSync(snapshots, { recursive: true })
        cpSync(join(fixturePlugins, name), join(snapshots, name), { recursive: true })
        mkdirSync(join(snapshots, optional), { recursive: true })
        writeFileSync(join(snapshots, optional, 'package.json'), JSON.stringify({
          name: optional, version: '1.0.0', os: [excludedOs],
          scripts: { install: 'node -e "require(\'fs\').writeFileSync(\'SCRIPT-RAN\',\'bad\')"' },
        }) + '\n')
        writeFileSync(join(profile, 'package.json'), JSON.stringify({
          name: 'platform-refresh-profile', private: true, packageManager: 'pnpm@11.7.0',
          dependencies: { [name]: `file:.materialize-snapshots/plugins/${name}` },
          dsh: { profile: { bundles: [name] } },
        }) + '\n')
        writeFileSync(join(profile, 'pnpm-workspace.yaml'), `packages:\n  - .\nnodeLinker: ${linker}\nignoredBuiltDependencies:\n  - ${optional}\n`)
        const env = syncEnv({ HOME: join(testHome, linker), npm_config_ignore_scripts: 'true',
          npm_config_store_dir: join(testHome, linker, 'store') })
        const initial = spawnSync('corepack', ['pnpm@11.7.0', 'install', '--offline', '--ignore-scripts', '--ignore-pnpmfile', '--package-import-method=copy'], { cwd: profile, env, encoding: 'utf8' })
        assert.equal(initial.status, 0, initial.stdout + initial.stderr)
        const beforeLock = readFileSync(join(profile, 'pnpm-lock.yaml'), 'utf8')
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = spawnSync('bash', [syncStableScript, name], { cwd: root, env, encoding: 'utf8' })
          assert.equal(result.status, 0, result.stdout + result.stderr)
          assert.equal(readFileSync(join(profile, 'pnpm-lock.yaml'), 'utf8'), beforeLock)
          assert.equal(existsSync(join(profile, 'node_modules', optional)), false)
          assert.equal(existsSync(join(snapshots, optional, 'SCRIPT-RAN')), false)
          assert.match(readFileSync(join(profile, 'node_modules', name, 'index.js'), 'utf8'), /platform-stable/)
        }
      }
    } finally {
      rmSync(testHome, { recursive: true, force: true })
    }
  })

  it('sync-agent-presets.sh targets only ~/.omnimux-dev by default', () => {
    const res = spawnSync('bash', [
      syncPresetsScript,
    ], {
      cwd: root,
      env: {
        ...process.env,
        HOME: fakeHome,
      },
      encoding: 'utf8',
    })
    assert.equal(res.status, 0)
    assert.match(res.stdout, /Agent Presets 物化完成/)
    assert.match(res.stdout, /OmniMux Dev\.app/)
    assert.doesNotMatch(res.stdout, /OmniMux\.app\/Contents/)
    assert.doesNotMatch(res.stdout, /DSH Desktop\.app/)
    assert.doesNotMatch(res.stdout, /\.agent-presets/)
  })

  it('sync-agent-presets.sh --dsh skips desktop/web and never retires user presets', () => {
    const userRoot = join(fakeHome, '.dsh', '.agent-presets')
    mkdirSync(join(userRoot, 'dsh-plugin-team'), { recursive: true })
    writeFileSync(join(userRoot, 'dsh-plugin-team', 'preset.yml'), 'name: keep-me\n')
    mkdirSync(join(fakeHome, '.dsh', 'profiles', 'desktop'), { recursive: true })
    mkdirSync(join(fakeHome, '.dsh', 'profiles', 'web'), { recursive: true })
    mkdirSync(join(fakeHome, '.dsh', 'profiles', 'omnimux'), { recursive: true })

    const res = spawnSync('bash', [
      syncPresetsScript,
      '--dsh',
    ], {
      cwd: root,
      env: {
        ...process.env,
        HOME: fakeHome,
      },
      encoding: 'utf8',
    })
    assert.equal(res.status, 0)
    assert.match(res.stdout, /skip non-omnimux profile/)
    assert.doesNotMatch(res.stdout, /==> 物化 Agent Presets → .*DSH Desktop/)
    assert.doesNotMatch(res.stdout, /清理旧用户预设/)
    assert.doesNotMatch(res.stdout, /- retired /)
    assert.ok(existsSync(join(userRoot, 'dsh-plugin-team', 'preset.yml')))
    assert.equal(
      readFileSync(join(userRoot, 'dsh-plugin-team', 'preset.yml'), 'utf8'),
      'name: keep-me\n',
    )
  })

  it('sync-agent-presets.sh --all never writes DSH Desktop.app or user preset root', () => {
    const userRoot = join(fakeHome, '.dsh', '.agent-presets', 'software-company')
    mkdirSync(userRoot, { recursive: true })
    writeFileSync(join(userRoot, 'preset.yml'), 'name: software\n')

    const res = spawnSync('bash', [
      syncPresetsScript,
      '--all',
    ], {
      cwd: root,
      env: {
        ...process.env,
        HOME: fakeHome,
      },
      encoding: 'utf8',
    })
    assert.equal(res.status, 0)
    assert.match(res.stdout, /OmniMux Dev\.app/)
    assert.match(res.stdout, /OmniMux\.app\/Contents/)
    assert.doesNotMatch(res.stdout, /==> 物化 Agent Presets → .*DSH Desktop/)
    assert.doesNotMatch(res.stdout, /清理旧用户预设/)
    assert.doesNotMatch(res.stdout, /- retired /)
    assert.ok(existsSync(join(userRoot, 'preset.yml')))
  })
})
