import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  copyFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { alphaPluginIds, alphaToolPrefixes } from './plugin-lifecycle.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const syncStable = join(root, 'scripts/sync-stable.sh')
const allPlugins = [
  'omnimux',
  'omnimux-accounts',
  'omnimux-assets',
  'omnimux-products',
  'omnimux-workflow',
  'omnimux-market',
  'omnimux-inspiration',
  'omnimux-clip',
  'omnimux-video',
  'omnimux-analytics',
  'omnimux-publish',
]

describe('Alpha release materialization policy', { concurrency: false }, () => {
  let fixtureRoot
  let fixturePlugins

  const profileDir = (home, target) => join(home, target, 'profiles', 'omnimux')
  const manifestPath = (home, target) => join(profileDir(home, target), 'package.json')
  const readManifest = (home, target) => JSON.parse(readFileSync(manifestPath(home, target), 'utf8'))
  const markerPath = (home, target) => join(profileDir(home, target), '.materialize-snapshots/plugins/omnimux/src/release-channel.json')
  const readChannel = (home, target) => JSON.parse(readFileSync(markerPath(home, target), 'utf8')).channel

  function writePackage(dir, name) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      main: 'index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, null, 2) + '\n')
    writeFileSync(join(dir, 'index.js'), `module.exports = ${JSON.stringify(name)}\n`)
    writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
    if (name === 'omnimux') {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src/release-channel.json'), '{\n  "channel": "development"\n}\n')
    }
  }

  function seedProfile(home, target) {
    const profile = profileDir(home, target)
    const managed = join(profile, '.materialize-snapshots/plugins')
    const dependencies = {}
    mkdirSync(join(profile, 'node_modules/.pnpm'), { recursive: true })
    writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    for (const name of allPlugins) {
      writePackage(join(managed, name), name)
      dependencies[name] = `file:.materialize-snapshots/plugins/${name}`
    }
    for (const name of alphaPluginIds) {
      writePackage(join(profile, 'node_modules', name), name)
      mkdirSync(join(profile, 'node_modules/.pnpm', `${name}@file+fixture`), { recursive: true })
    }
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'omnimux-profile-fixture',
      private: true,
      dependencies,
      dsh: { profile: { bundles: [...allPlugins] } },
    }, null, 2) + '\n')
  }

  function initCleanMainRepo(dir) {
    const runGit = (args) => {
      const res = spawnSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
        },
      })
      assert.equal(res.status, 0, res.stderr || res.stdout)
    }
    runGit(['init', '-b', 'main'])
    runGit(['config', 'user.email', 'qa@example.com'])
    runGit(['config', 'user.name', 'QA Fixture'])
    runGit(['add', '-A'])
    runGit(['commit', '-m', 'fixture: clean main'])
    runGit(['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  }

  function run(home, args = []) {
    return spawnSync('bash', [syncStable, ...args], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        CI: 'true',
        npm_config_offline: 'true',
        OMNIMUX_SYNC_VIA: 'internal',
        OMNIMUX_PLUGINS_DIR: fixturePlugins,
      },
    })
  }

  before(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'omnimux-alpha-release-'))
    fixturePlugins = join(fixtureRoot, 'fixture-plugins')
    for (const name of allPlugins) writePackage(join(fixturePlugins, name), name)
    for (const target of ['.omnimux-dev', '.omnimux', '.dsh']) seedProfile(fixtureRoot, target)
  })

  after(() => rmSync(fixtureRoot, { recursive: true, force: true }))

  it('uses the lifecycle registry as the exact Alpha plugin and tool-prefix source', () => {
    assert.deepEqual(alphaPluginIds, [
      'omnimux-accounts',
      'omnimux-publish',
      'omnimux-analytics',
    ])
    assert.deepEqual(alphaToolPrefixes, [
      'omnimux_accounts_',
      'omnimux_publish_',
      'omnimux_analytics_',
    ])
  })

  it('keeps profile dependency discovery inside its own workspace boundary', () => {
    const ancestor = join(fixtureRoot, 'workspace-ancestor')
    const home = join(ancestor, 'home')
    mkdirSync(ancestor, { recursive: true })
    writeFileSync(join(ancestor, 'pnpm-workspace.yaml'), 'packages:\n  - unrelated/*\n')
    seedProfile(home, '.omnimux-dev')
    const profile = profileDir(home, '.omnimux-dev')
    const result = spawnSync('corepack', ['pnpm', 'root', '--workspace-root'], {
      cwd: profile,
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(realpathSync(result.stdout.trim()), realpathSync(join(profile, 'node_modules')))
  })

  it('keeps every Alpha plugin and a development marker in the default Dev target', () => {
    const result = run(fixtureRoot)
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const manifest = readManifest(fixtureRoot, '.omnimux-dev')
    for (const name of alphaPluginIds) {
      assert.equal(manifest.dependencies[name], `file:.materialize-snapshots/plugins/${name}`)
      assert.ok(manifest.dsh.profile.bundles.includes(name))
      assert.ok(existsSync(join(profileDir(fixtureRoot, '.omnimux-dev'), '.materialize-snapshots/plugins', name)))
      assert.ok(existsSync(join(profileDir(fixtureRoot, '.omnimux-dev'), 'node_modules', name)))
    }
    assert.equal(readChannel(fixtureRoot, '.omnimux-dev'), 'development')
  })

  it('filters every Alpha remnant from Prod even when an Alpha plugin is explicitly selected', () => {
    const devManifestBefore = readFileSync(manifestPath(fixtureRoot, '.omnimux-dev'), 'utf8')
    const devMarkerBefore = readFileSync(markerPath(fixtureRoot, '.omnimux-dev'), 'utf8')
    const result = run(fixtureRoot, ['--prod', 'omnimux-accounts'])
    assert.equal(result.status, 0, result.stderr || result.stdout)

    const profile = profileDir(fixtureRoot, '.omnimux')
    const manifest = readManifest(fixtureRoot, '.omnimux')
    const virtualEntries = readdirSync(join(profile, 'node_modules/.pnpm'))
    for (const name of alphaPluginIds) {
      assert.equal(manifest.dependencies[name], undefined)
      assert.equal(manifest.dsh.profile.bundles.includes(name), false)
      assert.equal(existsSync(join(profile, '.materialize-snapshots/plugins', name)), false)
      assert.equal(existsSync(join(profile, 'node_modules', name)), false)
      assert.equal(virtualEntries.some(entry => entry === name || entry.startsWith(`${name}@`)), false)
    }
    assert.ok(manifest.dependencies['omnimux-workflow'])
    assert.ok(manifest.dsh.profile.bundles.includes('omnimux-workflow'))
    assert.ok(existsSync(join(profile, '.materialize-snapshots/plugins/omnimux-workflow')))
    assert.ok(existsSync(join(profile, 'node_modules/omnimux-workflow')))
    assert.equal(readChannel(fixtureRoot, '.omnimux'), 'production')
    assert.equal(readFileSync(manifestPath(fixtureRoot, '.omnimux-dev'), 'utf8'), devManifestBefore)
    assert.equal(readFileSync(markerPath(fixtureRoot, '.omnimux-dev'), 'utf8'), devMarkerBefore)
  })

  it('keeps Alpha in non-production profiles during a mixed-target sync', () => {
    const result = run(fixtureRoot, ['--all', 'omnimux-accounts'])
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    for (const target of ['.omnimux-dev', '.dsh']) {
      const manifest = readManifest(fixtureRoot, target)
      assert.ok(manifest.dependencies['omnimux-accounts'])
      assert.ok(manifest.dsh.profile.bundles.includes('omnimux-accounts'))
    }
    const prodManifest = readManifest(fixtureRoot, '.omnimux')
    assert.equal(prodManifest.dependencies['omnimux-accounts'], undefined)
    assert.equal(readChannel(fixtureRoot, '.omnimux'), 'production')
    assert.equal(readChannel(fixtureRoot, '.omnimux-dev'), 'development')
  })

  it('applies production policy to equivalent paths through both sync entrypoints', () => {
    const runner = join(fixtureRoot, 'alias-runner')
    mkdirSync(join(runner, 'scripts'), { recursive: true })
    mkdirSync(join(runner, 'plugins/omnimux/src'), { recursive: true })
    for (const name of ['sync-stable.sh', 'sync-to-app.sh', 'resolve-omnimux-profile.sh', 'plugin-lifecycle.mjs', 'managed-tarball-archive.py']) {
      copyFileSync(join(root, 'scripts', name), join(runner, 'scripts', name))
    }
    copyFileSync(join(root, 'plugins/omnimux/src/plugin-lifecycle.json'), join(runner, 'plugins/omnimux/src/plugin-lifecycle.json'))
    initCleanMainRepo(runner)
    for (const entrypoint of ['sync-stable.sh', 'sync-to-app.sh']) {
      for (const alias of ['trailing-slash', 'dot', 'symlink']) {
        const home = join(fixtureRoot, `${entrypoint}-${alias}`)
        seedProfile(home, '.omnimux')
        const target = alias === 'trailing-slash' ? `${home}/.omnimux/`
          : alias === 'dot' ? `${home}/./.omnimux` : join(home, 'production-alias')
        if (alias === 'symlink') symlinkSync(join(home, '.omnimux'), target, 'dir')
        const result = spawnSync('bash', [join(runner, 'scripts', entrypoint), `--target=${target}`, '--skip-build', 'omnimux-accounts'], {
          cwd: runner,
          encoding: 'utf8',
          env: { ...process.env, HOME: home, CI: 'true', npm_config_offline: 'true', OMNIMUX_SYNC_VIA: 'internal', OMNIMUX_PLUGINS_DIR: fixturePlugins },
        })
        assert.equal(result.status, 0, `${entrypoint}/${alias}: ${result.stderr || result.stdout}`)
        assert.equal(readChannel(home, '.omnimux'), 'production')
        const manifest = readManifest(home, '.omnimux')
        for (const name of alphaPluginIds) {
          assert.equal(manifest.dependencies[name], undefined)
          assert.equal(manifest.dsh.profile.bundles.includes(name), false)
          assert.equal(existsSync(join(profileDir(home, '.omnimux'), 'node_modules', name)), false)
        }
        assert.ok(manifest.dsh.profile.bundles.includes('omnimux-workflow'))
      }
    }
  })

  it('preserves the named plugin scope when sync-to-app targets Dev and Prod together', () => {
    const isolatedRoot = join(fixtureRoot, 'mixed-wrapper-runner')
    const isolatedScripts = join(isolatedRoot, 'scripts')
    const isolatedRegistry = join(isolatedRoot, 'plugins/omnimux/src')
    const isolatedPlugins = join(isolatedRoot, 'fixture-plugins')
    const isolatedHome = join(fixtureRoot, 'mixed-wrapper-home')
    const argsFile = join(isolatedRoot, 'stable-args.txt')
    mkdirSync(isolatedScripts, { recursive: true })
    mkdirSync(isolatedRegistry, { recursive: true })
    mkdirSync(join(isolatedHome, '.omnimux-dev'), { recursive: true })
    mkdirSync(join(isolatedHome, '.omnimux'), { recursive: true })
    writePackage(join(isolatedPlugins, 'omnimux-accounts'), 'omnimux-accounts')
    writePackage(join(isolatedPlugins, 'omnimux'), 'omnimux')
    for (const name of ['sync-to-app.sh', 'resolve-omnimux-profile.sh', 'plugin-lifecycle.mjs', 'managed-tarball-archive.py']) {
      copyFileSync(join(root, 'scripts', name), join(isolatedScripts, name))
    }
    copyFileSync(join(root, 'plugins/omnimux/src/plugin-lifecycle.json'), join(isolatedRegistry, 'plugin-lifecycle.json'))
    writeFileSync(join(isolatedScripts, 'sync-stable.sh'), '#!/bin/bash\nprintf "%s\\n" "$@" > "$ARGS_FILE"\n')
    chmodSync(join(isolatedScripts, 'sync-stable.sh'), 0o755)
    initCleanMainRepo(isolatedRoot)

    const result = spawnSync('bash', [
      join(isolatedScripts, 'sync-to-app.sh'),
      '--target=dev,prod',
      '--skip-build',
      'omnimux-accounts',
    ], {
      cwd: isolatedRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: isolatedHome,
        ARGS_FILE: argsFile,
        OMNIMUX_PLUGINS_DIR: isolatedPlugins,
      },
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.deepEqual(readFileSync(argsFile, 'utf8').trim().split('\n'), [
      '--target=dev,prod',
      'omnimux-accounts',
    ])
  })

  it('fails before writing when a selected production source is missing', () => {
    const before = readFileSync(manifestPath(fixtureRoot, '.omnimux'), 'utf8')
    const result = run(fixtureRoot, ['--prod', 'missing-plugin'])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /源码缺失/)
    assert.equal(readFileSync(manifestPath(fixtureRoot, '.omnimux'), 'utf8'), before)
    assert.equal(readChannel(fixtureRoot, '.omnimux'), 'production')
  })

  it('rejects a malformed lifecycle registry before touching a target', () => {
    const isolatedRoot = join(fixtureRoot, 'malformed-registry-runner')
    const isolatedScripts = join(isolatedRoot, 'scripts')
    const isolatedRegistry = join(isolatedRoot, 'plugins/omnimux/src')
    const isolatedHome = join(fixtureRoot, 'malformed-registry-home')
    const isolatedProfile = profileDir(isolatedHome, '.omnimux')
    mkdirSync(isolatedScripts, { recursive: true })
    mkdirSync(isolatedRegistry, { recursive: true })
    mkdirSync(isolatedProfile, { recursive: true })
    for (const name of ['sync-stable.sh', 'sync-to-app.sh', 'resolve-omnimux-profile.sh', 'plugin-lifecycle.mjs', 'managed-tarball-archive.py']) {
      copyFileSync(join(root, 'scripts', name), join(isolatedScripts, name))
    }
    writeFileSync(join(isolatedRegistry, 'plugin-lifecycle.json'), '{ malformed\n')
    const sentinel = '{"sentinel":"unchanged"}\n'
    writeFileSync(join(isolatedProfile, 'package.json'), sentinel)

    const result = spawnSync('bash', [join(isolatedScripts, 'sync-stable.sh'), '--prod'], {
      cwd: isolatedRoot,
      encoding: 'utf8',
      env: { ...process.env, HOME: isolatedHome, OMNIMUX_SYNC_VIA: 'internal' },
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /无法读取 Alpha 插件生命周期注册表/)
    assert.equal(readFileSync(join(isolatedProfile, 'package.json'), 'utf8'), sentinel)

    const wrapperResult = spawnSync('bash', [join(isolatedScripts, 'sync-to-app.sh'), '--prod', '--skip-build'], {
      cwd: isolatedRoot,
      encoding: 'utf8',
      env: { ...process.env, HOME: isolatedHome },
    })
    assert.notEqual(wrapperResult.status, 0)
    assert.match(wrapperResult.stderr, /无法读取 Alpha 插件生命周期注册表/)
    assert.equal(readFileSync(join(isolatedProfile, 'package.json'), 'utf8'), sentinel)
  })
})
