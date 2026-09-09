import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoots = []

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) rmSync(directory, { recursive: true, force: true })
})

test('sync-agent-presets preserves a case-sensitive custom ~/ target', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'omnimux-preset-target-'))
  temporaryRoots.push(fixture)
  const scripts = join(fixture, 'scripts')
  const target = join(fixture, 'Custom Targets', 'Full Layout')
  const profile = join(target, 'profiles', 'omnimux')
  const destination = join(profile, 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets')

  mkdirSync(scripts, { recursive: true })
  mkdirSync(destination, { recursive: true })
  copyFileSync(join(root, 'scripts', 'sync-agent-presets.sh'), join(scripts, 'sync-agent-presets.sh'))
  copyFileSync(join(root, 'scripts', 'resolve-omnimux-profile.sh'), join(scripts, 'resolve-omnimux-profile.sh'))
  chmodSync(join(scripts, 'sync-agent-presets.sh'), 0o755)
  cpSync(join(root, 'presets'), join(fixture, 'presets'), { recursive: true })

  const previousTargets = process.env.OMNIMUX_SYNC_TARGETS
  process.env.OMNIMUX_SYNC_TARGETS = 'fixture-inherited-target'
  let result
  try {
    result = spawnSync('bash', [join(scripts, 'sync-agent-presets.sh'), '--target=~/Custom Targets/Full Layout'], {
      cwd: fixture,
      encoding: 'utf8',
      env: { ...process.env, HOME: fixture, OMNIMUX_SYNC_TARGETS: '' },
    })
  } finally {
    if (previousTargets === undefined) delete process.env.OMNIMUX_SYNC_TARGETS
    else process.env.OMNIMUX_SYNC_TARGETS = previousTargets
  }

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /Full Layout/)
  assert.doesNotMatch(result.stderr, /layout: command not found/)
  assert.equal(existsSync(join(destination, 'standard')), true)
  assert.equal(readFileSync(join(scripts, 'sync-agent-presets.sh'), 'utf8').includes('eval expanded_path'), false)
})
