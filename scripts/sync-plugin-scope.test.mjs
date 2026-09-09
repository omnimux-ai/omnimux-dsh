import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fakeGitPath } from './sync-fixtures.test.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceSync = readFileSync(join(root, 'scripts', 'sync-to-app.sh'), 'utf8')
const sourceProfileResolver = readFileSync(join(root, 'scripts', 'resolve-omnimux-profile.sh'), 'utf8')
const temporaryRoots = []

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function writeExecutable(file, contents) {
  writeFileSync(file, contents, 'utf8')
  chmodSync(file, 0o755)
}

function setupFixture({
  kitSource = 'current-kit',
  kitTarget = kitSource,
  selectedBuild = 'process.exit(0)',
  homeSegment = '',
  targetRelative = 'target',
} = {}) {
  const fixture = mkdtempSync(join(tmpdir(), 'omnimux-plugin-scope-'))
  temporaryRoots.push(fixture)

  const scripts = join(fixture, 'scripts')
  const plugin = join(fixture, 'plugins', 'omnimux-assets')
  const kit = join(fixture, 'kit')
  const home = homeSegment ? join(fixture, homeSegment) : fixture
  const targetHome = join(home, targetRelative)
  const profile = join(targetHome, 'profiles', 'omnimux')
  const managedKit = join(profile, '.materialize-snapshots', 'plugins', 'dsh-ui-kit')
  const events = join(fixture, 'events.log')
  const bin = join(fixture, 'bin')

  mkdirSync(scripts, { recursive: true })
  mkdirSync(join(plugin, 'scripts'), { recursive: true })
  mkdirSync(join(kit, 'lib'), { recursive: true })
  mkdirSync(join(kit, 'node_modules', 'excluded-dependency'), { recursive: true })
  mkdirSync(join(managedKit, 'lib'), { recursive: true })
  mkdirSync(join(profile, 'node_modules', 'dsh-ui-kit', 'lib'), { recursive: true })
  mkdirSync(join(profile, 'node_modules', 'omnimux-workflow'), { recursive: true })
  mkdirSync(bin, { recursive: true })

  for (const name of ['managed-tarball-archive.py', 'plugin-lifecycle.mjs', 'sync-main.sh']) {
    writeFileSync(join(scripts, name), readFileSync(join(root, 'scripts', name)))
  }
  mkdirSync(join(fixture, 'plugins/omnimux/src'), { recursive: true })
  writeFileSync(join(fixture, 'plugins/omnimux/src/plugin-lifecycle.json'), readFileSync(join(root, 'plugins/omnimux/src/plugin-lifecycle.json')))
  writeFileSync(join(scripts, 'sync-to-app.sh'), sourceSync, 'utf8')
  chmodSync(join(scripts, 'sync-to-app.sh'), 0o755)
  writeFileSync(join(scripts, 'resolve-omnimux-profile.sh'), sourceProfileResolver, 'utf8')
  chmodSync(join(scripts, 'resolve-omnimux-profile.sh'), 0o755)
  writeExecutable(join(scripts, 'sync-stable.sh'), [
    '#!/bin/bash',
    'set -euo pipefail',
    'printf "stable:%s\\n" "$*" >> "$SYNC_EVENTS"',
    'exit "${SYNC_STABLE_STATUS:-0}"',
    '',
  ].join('\n'))
  writeExecutable(join(scripts, 'sync-agent-presets.sh'), [
    '#!/bin/bash',
    'set -euo pipefail',
    'printf "presets:%s\\n" "$*" >> "$SYNC_EVENTS"',
    '',
  ].join('\n'))
  writeExecutable(join(bin, 'corepack'), [
    '#!/bin/bash',
    'set -euo pipefail',
    'printf "kit-build:%s\\n" "$*" >> "$SYNC_EVENTS"',
    '',
  ].join('\n'))
  writeExecutable(join(bin, 'mktemp'), [
    '#!/bin/bash',
    'set -euo pipefail',
    'if [ "${FAIL_KIT_MKTEMP:-0}" = "1" ]; then exit 73; fi',
    'exec /usr/bin/mktemp "$@"',
    '',
  ].join('\n'))
  writeExecutable(join(bin, 'rsync'), [
    '#!/bin/bash',
    'set -euo pipefail',
    'if [ "${FAIL_KIT_MKTEMP:-0}" = "1" ]; then',
    '  printf "rsync:%s\\n" "$*" >> "$SYNC_EVENTS"',
    '  exit 99',
    'fi',
    'exec /usr/bin/rsync "$@"',
    '',
  ].join('\n'))
  writeExecutable(join(bin, 'mv'), [
    '#!/bin/bash',
    'set -euo pipefail',
    'if [ "${FAIL_FIRST_KIT_MOVE:-0}" = "1" ] && [[ "$1" == */.materialize-snapshots/plugins/dsh-ui-kit ]] && [[ "$2" == */.dsh-ui-kit.previous.* ]]; then',
    '  exit 74',
    'fi',
    'exec /bin/mv "$@"',
    '',
  ].join('\n'))

  writeFileSync(join(plugin, 'package.json'), JSON.stringify({
    name: 'omnimux-assets',
    dependencies: { 'dsh-ui-kit': 'file:../../../../personal/dsh-ui-kit' },
  }), 'utf8')
  writeFileSync(join(plugin, 'scripts', 'build-client.mjs'), `${selectedBuild}\n`, 'utf8')
  writeFileSync(join(kit, 'package.json'), JSON.stringify({ name: 'dsh-ui-kit', version: '1.0.0' }), 'utf8')
  writeFileSync(join(kit, 'lib', 'index.js'), kitSource, 'utf8')
  writeFileSync(join(kit, 'source-marker.txt'), 'complete package', 'utf8')
  writeFileSync(join(kit, 'node_modules', 'excluded-dependency', 'sentinel.txt'), 'must not copy', 'utf8')
  writeFileSync(join(managedKit, 'package.json'), JSON.stringify({ name: 'dsh-ui-kit', version: '0.0.0' }), 'utf8')
  writeFileSync(join(managedKit, 'lib', 'index.js'), kitTarget, 'utf8')
  writeFileSync(join(profile, 'node_modules', 'dsh-ui-kit', 'lib', 'index.js'), 'pnpm output sentinel', 'utf8')
  writeFileSync(join(profile, 'node_modules', 'omnimux-workflow', 'sentinel.txt'), 'unselected plugin', 'utf8')
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'fixture-profile' }), 'utf8')

  const preset = join(fixture, 'preset-sentinel.yml')
  const asar = join(fixture, 'app.asar')
  const infoPlist = join(fixture, 'Info.plist')
  writeFileSync(preset, 'preset sentinel', 'utf8')
  writeFileSync(asar, 'asar sentinel', 'utf8')
  writeFileSync(infoPlist, 'plist sentinel', 'utf8')

  // These tests mutate synthetic profiles and kit fixtures, not the tracked wrapper.
  writeFileSync(join(fixture, '.gitignore'), '*\n')
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: fixture, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  git('init', '-b', 'main')
  git('config', 'user.name', 'Scope Fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('add', '-f', 'scripts/sync-to-app.sh', '.gitignore')
  git('commit', '-m', 'fixture source')
  git('init', '--bare', join(fixture, 'remote.git'))
  git('remote', 'add', 'origin', join(fixture, 'remote.git'))
  git('push', 'origin', 'main')

  return { fixture, home, targetHome, profile, managedKit, kit, events, bin, preset, asar, infoPlist }
}

function run(fixture, args, extraEnv = {}) {
  return spawnSync('bash', [join(fixture.fixture, 'scripts', 'sync-to-app.sh'), ...args], {
    cwd: fixture.fixture,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: fixture.home,
      ...extraEnv,
      OMNIMUX_DSH_UI_KIT_DIR: fixture.kit,
      SYNC_EVENTS: fixture.events,
      PATH: fakeGitPath(fixture.fixture, fixture.fixture, `${fixture.bin}:${process.env.PATH}`),
    },
  })
}

function events(fixture) {
  try {
    return readFileSync(fixture.events, 'utf8')
  } catch {
    return ''
  }
}

describe('sync-to-app named-plugin scope', () => {
  it('only materializes the named plugin and leaves kit, presets, and installer sentinels untouched', () => {
    const fixture = setupFixture()
    const result = run(fixture, ['--skip-build', `--target=${fixture.targetHome}`, 'omnimux-assets'])

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /跳过 Agent Presets/)
    assert.match(result.stdout, /本次命名插件同步未更新预设或应用包/)
    assert.match(events(fixture), /stable:.*omnimux-assets/)
    assert.doesNotMatch(events(fixture), /kit-build|presets:/)
    assert.equal(readFileSync(join(fixture.managedKit, 'lib', 'index.js'), 'utf8'), 'current-kit')
    assert.equal(readFileSync(join(fixture.profile, 'node_modules', 'dsh-ui-kit', 'lib', 'index.js'), 'utf8'), 'pnpm output sentinel')
    assert.equal(readFileSync(join(fixture.profile, 'node_modules', 'omnimux-workflow', 'sentinel.txt'), 'utf8'), 'unselected plugin')
    assert.equal(readFileSync(fixture.preset, 'utf8'), 'preset sentinel')
    assert.equal(readFileSync(fixture.asar, 'utf8'), 'asar sentinel')
    assert.equal(readFileSync(fixture.infoPlist, 'utf8'), 'plist sentinel')
  })

  it('fails before materialization when a named plugin sees kit drift', () => {
    const fixture = setupFixture({ kitTarget: 'stale-kit' })
    const result = run(fixture, ['--skip-build', `--target=${fixture.targetHome}`, 'omnimux-assets'])

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /dsh-ui-kit 漂移/)
    assert.match(result.stderr, /完整 yarn omnimux:sync/)
    assert.equal(events(fixture), '')
    assert.equal(readFileSync(join(fixture.managedKit, 'lib', 'index.js'), 'utf8'), 'stale-kit')
  })

  it('uses the standard profile name for a case-sensitive target home', () => {
    const fixture = setupFixture({ homeSegment: 'Case Sensitive Home' })
    const result = run(fixture, ['--skip-build', `--target=${fixture.targetHome}`, 'omnimux-assets'])

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(events(fixture), /stable:.*omnimux-assets/)
    assert.equal(existsSync(join(fixture.targetHome, 'profiles', 'omnimux')), true)
  })

  it('preserves a ~/ target with case and spaces through the wrapper', () => {
    const fixture = setupFixture({ targetRelative: 'Case Sensitive/Task' })
    const result = run(fixture, ['--skip-build', '--target=~/Case Sensitive/Task', 'omnimux-assets'])

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(events(fixture), /stable:.*omnimux-assets/)
  })

  it('rejects a missing managed kit before any named-plugin materialization', () => {
    const fixture = setupFixture()
    rmSync(fixture.managedKit, { recursive: true, force: true })
    const result = run(fixture, ['--skip-build', `--target=${fixture.targetHome}`, 'omnimux-assets'])

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /缺少受管 dsh-ui-kit/)
    assert.match(result.stderr, /官方完整 profile rebuild/)
    assert.equal(events(fixture), '')
  })

  it('keeps selected-plugin build and materialization failures nonzero', () => {
    const buildFixture = setupFixture({ selectedBuild: 'process.exit(23)' })
    const build = run(buildFixture, [`--target=${buildFixture.targetHome}`, 'omnimux-assets'])
    assert.equal(build.status, 23)
    assert.equal(events(buildFixture), '')

    const materializeFixture = setupFixture()
    const materialize = run(materializeFixture, ['--skip-build', `--target=${materializeFixture.targetHome}`, 'omnimux-assets'], {
      SYNC_STABLE_STATUS: '29',
    })
    assert.equal(materialize.status, 29)
    assert.match(events(materializeFixture), /stable:.*omnimux-assets/)
    assert.doesNotMatch(events(materializeFixture), /presets:/)
  })

  it('keeps the existing full operation explicit when no plugin is named', () => {
    const fixture = setupFixture()
    const fullHome = join(fixture.fixture, 'home')
    const fullProfile = join(fullHome, '.omnimux-dev', 'profiles', 'omnimux')
    const fullManagedKit = join(fullProfile, '.materialize-snapshots', 'plugins', 'dsh-ui-kit')
    mkdirSync(join(fullProfile, 'node_modules', 'dsh-ui-kit', 'lib'), { recursive: true })
    mkdirSync(join(fullManagedKit, 'lib'), { recursive: true })
    writeFileSync(join(fullManagedKit, 'package.json'), JSON.stringify({ name: 'dsh-ui-kit', version: '0.0.0' }), 'utf8')
    writeFileSync(join(fullManagedKit, 'lib', 'index.js'), 'stale-kit', 'utf8')
    writeFileSync(join(fullProfile, 'node_modules', 'dsh-ui-kit', 'lib', 'index.js'), 'pnpm output sentinel', 'utf8')

    const result = run(fixture, ['--skip-build'], { HOME: fullHome })

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(events(fixture), /kit-build:pnpm build/)
    assert.match(events(fixture), /stable:/)
    assert.match(events(fixture), /presets:/)
    assert.match(result.stdout, /会话预设下拉：已同步/)
    assert.equal(readFileSync(join(fullManagedKit, 'lib', 'index.js'), 'utf8'), 'current-kit')
    assert.equal(readFileSync(join(fullManagedKit, 'source-marker.txt'), 'utf8'), 'complete package')
    assert.equal(existsSync(join(fullManagedKit, 'node_modules')), false)
    assert.equal(readFileSync(join(fullProfile, 'node_modules', 'dsh-ui-kit', 'lib', 'index.js'), 'utf8'), 'pnpm output sentinel')
  })

  it('rejects a missing managed kit before full-sync build or profile writes', () => {
    const fixture = setupFixture()
    rmSync(fixture.managedKit, { recursive: true, force: true })
    const result = run(fixture, ['--skip-build', `--target=${fixture.targetHome}`])

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /缺少受管 dsh-ui-kit/)
    assert.match(result.stderr, /官方完整 profile rebuild/)
    assert.equal(events(fixture), '')
  })

  it('does not invoke rsync when creating the managed-kit temporary directory fails', () => {
    const fixture = setupFixture({ kitTarget: 'old-kit' })
    const result = run(fixture, ['--skip-build', `--target=${fixture.targetHome}`], { FAIL_KIT_MKTEMP: '1' })

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /无法创建受管 dsh-ui-kit 临时目录/)
    assert.match(events(fixture), /kit-build:pnpm build/)
    assert.doesNotMatch(events(fixture), /rsync:|stable:|presets:/)
    assert.equal(readFileSync(join(fixture.managedKit, 'lib', 'index.js'), 'utf8'), 'old-kit')
  })

  it('preserves the managed kit and does not continue when its backup move fails', () => {
    const fixture = setupFixture({ kitTarget: 'old-kit' })
    const result = run(fixture, ['--skip-build', `--target=${fixture.targetHome}`], { FAIL_FIRST_KIT_MOVE: '1' })

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /无法备份受管 dsh-ui-kit/)
    assert.match(events(fixture), /kit-build:pnpm build/)
    assert.doesNotMatch(events(fixture), /stable:|presets:/)
    assert.equal(readFileSync(join(fixture.managedKit, 'lib', 'index.js'), 'utf8'), 'old-kit')
    assert.equal(existsSync(join(fixture.managedKit, 'source-marker.txt')), false)
  })
})
