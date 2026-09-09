import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const resolver = join(root, 'scripts', 'resolve-omnimux-profile.sh')
const temporaryRoots = []

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'omnimux-profile-resolver-'))
  temporaryRoots.push(home)
  return home
}

function resolve(home, target) {
  return spawnSync('bash', ['-c', 'source "$1"; resolve_omnimux_profile_dir "$2"', 'resolver', resolver, target], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
  })
}

describe('resolve_omnimux_profile_dir', () => {
  it('only normalizes symbolic aliases and preserves case-sensitive absolute paths with spaces', () => {
    const home = fixture()
    const target = join(home, 'Case Sensitive Target', 'Custom Profile')
    const result = spawnSync('bash', ['-c', [
      'source "$1"',
      'normalize_omnimux_sync_target "$2"',
      'expand_omnimux_sync_target_home "$2"',
      'normalize_omnimux_sync_target "DEV"',
    ].join('\n'), 'resolver', resolver, target], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    })

    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.stdout.trim().split('\n'), [target, target, 'dev'])
  })

  it('expands only a leading ~/ without eval', () => {
    const home = fixture()
    const result = spawnSync('bash', ['-c', 'source "$1"; expand_omnimux_sync_target_home "~/Case Sensitive Target"', 'resolver', resolver], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    })

    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), join(home, 'Case Sensitive Target'))
  })

  it('preserves a case-sensitive ~/ target through normalization and expansion', () => {
    const home = fixture()
    const result = spawnSync('bash', ['-c', [
      'source "$1"',
      'target=$(normalize_omnimux_sync_target "$2")',
      'expand_omnimux_sync_target_home "$target"',
    ].join('\n'), 'resolver', resolver, '~/Case Sensitive/Task'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    })

    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), join(home, 'Case Sensitive', 'Task'))
  })

  it('uses the conventional profile for regular target homes', () => {
    const home = fixture()
    const target = join(home, '.omnimux-dev')
    const result = resolve(home, target)

    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), join(target, 'profiles', 'omnimux'))
  })

  it('uses the standard profile even for a legacy task-shaped target', () => {
    const home = fixture()
    const target = join(home, '.dsh-dev', 'tasks', 'client-action')
    mkdirSync(join(target, 'profiles', 'omnimux-dev-client-action'), { recursive: true })
    mkdirSync(join(target, 'profiles', 'omnimux'), { recursive: true })
    const result = resolve(home, target)

    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), join(target, 'profiles', 'omnimux'))
  })

  it('does not derive a profile name from nested custom target paths', () => {
    const home = fixture()
    const target = join(home, 'Custom Targets', 'nested', 'Target')
    const result = resolve(home, target)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), join(target, 'profiles', 'omnimux'))
  })
})
