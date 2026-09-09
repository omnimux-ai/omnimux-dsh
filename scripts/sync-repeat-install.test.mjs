import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fakeGitPath, copySyncScripts } from './sync-fixtures.test.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Create an offline profile with its own workspace and package store. */
function createFixture(t, linker) {
  const home = mkdtempSync(join(tmpdir(), `sync-repeat-${linker}-`))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  copySyncScripts(home)
  const syncScript = join(home, 'scripts/sync-stable.sh')
  const profile = join(home, '.omnimux-dev/profiles/omnimux')
  const plugins = join(home, 'plugins')
  const snapshots = join(profile, '.materialize-snapshots/plugins')
  const name = 'omnimux-repeat-fixture'
  const optional = 'fixture-other-platform'
  const entry = "module.exports = { revision: 'stable' }\n"
  for (const directory of [join(plugins, name), join(snapshots, name)]) {
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({
      name, version: '1.0.0', main: 'index.js',
      optionalDependencies: { [optional]: `file:../${optional}` },
    }) + '\n')
    writeFileSync(join(directory, 'index.js'), entry)
  }
  mkdirSync(join(snapshots, optional), { recursive: true })
  writeFileSync(join(snapshots, optional, 'package.json'), JSON.stringify({
    name: optional, version: '1.0.0', main: 'index.js',
    os: [process.platform === 'win32' ? 'darwin' : 'win32'],
  }) + '\n')
  writeFileSync(join(snapshots, optional, 'index.js'), "throw new Error('incompatible platform')\n")
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    name: 'repeat-install-profile', private: true, packageManager: 'pnpm@11.7.0',
    dependencies: { [name]: `file:.materialize-snapshots/plugins/${name}` },
    dsh: { profile: { bundles: [] } },
  }) + '\n')
  writeFileSync(join(profile, 'pnpm-workspace.yaml'), `packages:\n  - .\nnodeLinker: ${linker}\n`)
  const env = {
    ...process.env, HOME: home, OMNIMUX_SYNC_VIA: 'internal', OMNIMUX_PLUGINS_DIR: plugins,
    PATH: fakeGitPath(home, home),
    COREPACK_ENABLE_NETWORK: '0', COREPACK_ENABLE_AUTO_PIN: '0', COREPACK_DEFAULT_TO_LATEST: '0',
    npm_config_offline: 'true', npm_config_ignore_scripts: 'true', npm_config_ignore_pnpmfile: 'true',
    npm_config_verify_deps_before_run: 'false', npm_config_manage_package_manager_versions: 'false',
    npm_config_store_dir: join(home, 'store'), npm_config_cache: join(home, 'cache'),
    npm_config_userconfig: join(home, 'user.npmrc'), npm_config_globalconfig: join(home, 'global.npmrc'),
    npm_config_package_import_method: 'copy', CI: 'true',
  }
  for (const key of Object.keys(env)) {
    if (/optimistic_repeat_install|frozen_lockfile|force$/i.test(key) || key === 'OMNIMUX_SYNC_TARGETS') delete env[key]
  }
  writeFileSync(env.npm_config_userconfig, '')
  writeFileSync(env.npm_config_globalconfig, '')
  const run = (command, args, extra = {}) => {
    const result = spawnSync(command, args, {
      cwd: profile, env: { ...env, ...extra }, encoding: 'utf8', timeout: 60_000,
    })
    assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`)
    return result
  }
  assert.equal(run('corepack', ['pnpm', '--version']).stdout.trim(), '11.7.0')
  run('corepack', ['pnpm', 'install', '--offline', '--ignore-scripts'])
  const lock = readFileSync(join(profile, 'pnpm-lock.yaml'), 'utf8')
  const installed = join(profile, 'node_modules', name)
  const verify = () => {
    assert.equal(readFileSync(join(installed, 'index.js'), 'utf8'), entry)
    assert.equal(readFileSync(join(profile, 'pnpm-lock.yaml'), 'utf8'), lock)
    assert.equal(existsSync(join(profile, 'node_modules', optional)), false)
    const resolution = spawnSync(process.execPath, ['-e',
      "try { require.resolve(process.argv[1], { paths: [process.argv[2]] }); process.exit(1) } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error }",
      optional, installed], { cwd: profile, encoding: 'utf8' })
    assert.equal(resolution.status, 0, resolution.stderr)
  }
  verify()
  return { home, installed, run, verify, syncScript }
}

for (const linker of ['hoisted', 'isolated']) {
  test(`${linker}: sync restores staged entries on consecutive normal refreshes without changing lock or platform optionals`, t => {
    const fixture = createFixture(t, linker)
    for (let attempt = 0; attempt < 2; attempt++) {
      fixture.run('bash', [fixture.syncScript, 'omnimux-repeat-fixture'])
      fixture.verify()
    }
  })

  test(`${linker}: non-optimistic frozen install restores missing entry without resolving or installing incompatible optionals`, t => {
    const fixture = createFixture(t, linker)
    renameSync(fixture.installed, join(fixture.home, 'staged-entry'))
    const result = fixture.run('corepack', ['pnpm', 'install', '--offline', '--frozen-lockfile'], {
      pnpm_config_optimistic_repeat_install: 'false',
    })
    assert.match(result.stdout, /resolution step is skipped/)
    fixture.verify()
  })
}
