import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  assert.equal(existsSync(join(destination, 'omni-agent')), true)
  assert.equal(readFileSync(join(scripts, 'sync-agent-presets.sh'), 'utf8').includes('eval expanded_path'), false)
})

test('sync-agent-presets keeps preset directories it does not own', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'omnimux-preset-preserve-'))
  temporaryRoots.push(fixture)
  const scripts = join(fixture, 'scripts')
  const target = join(fixture, 'Custom Targets', 'Full Layout')
  const profile = join(target, 'profiles', 'omnimux')
  const destination = join(profile, 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets')

  mkdirSync(scripts, { recursive: true })
  // Upstream ships its own presets in that directory; the script only owns KEEP.
  mkdirSync(join(destination, 'minimal'), { recursive: true })
  mkdirSync(join(destination, 'ptc'), { recursive: true })
  mkdirSync(join(destination, 'ad-creative-agent'), { recursive: true })
  writeFileSync(join(destination, 'minimal', 'preset.yml'), 'name: minimal\n')
  writeFileSync(join(destination, 'ptc', 'preset.yml'), 'name: ptc\n')
  writeFileSync(join(destination, 'ad-creative-agent', 'preset.yml'), 'name: stale\n')
  copyFileSync(join(root, 'scripts', 'sync-agent-presets.sh'), join(scripts, 'sync-agent-presets.sh'))
  copyFileSync(join(root, 'scripts', 'resolve-omnimux-profile.sh'), join(scripts, 'resolve-omnimux-profile.sh'))
  chmodSync(join(scripts, 'sync-agent-presets.sh'), 0o755)
  cpSync(join(root, 'presets'), join(fixture, 'presets'), { recursive: true })

  const result = spawnSync('bash', [join(scripts, 'sync-agent-presets.sh'), '--target=~/Custom Targets/Full Layout'], {
    cwd: fixture,
    encoding: 'utf8',
    env: { ...process.env, HOME: fixture, OMNIMUX_SYNC_TARGETS: '' },
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.equal(readFileSync(join(destination, 'minimal', 'preset.yml'), 'utf8'), 'name: minimal\n')
  assert.equal(readFileSync(join(destination, 'ptc', 'preset.yml'), 'utf8'), 'name: ptc\n')
  assert.match(result.stdout, /kept minimal/)
  assert.match(result.stdout, /kept ptc/)
  assert.doesNotMatch(result.stdout, /removed minimal/)
  // Owned entries are still refreshed from the product source.
  assert.equal(existsSync(join(destination, 'ad-creative-agent', 'preset.yml')), true)
  assert.notEqual(readFileSync(join(destination, 'ad-creative-agent', 'preset.yml'), 'utf8'), 'name: stale\n')
  assert.equal(existsSync(join(destination, 'omni-agent')), true)
  // 新增出厂预设必须随 KEEP 一起物化，且三个文件齐备。
  const adDir = join(destination, 'ad-creative-agent')
  assert.equal(existsSync(join(adDir, 'preset.yml')), true)
  assert.equal(existsSync(join(adDir, 'agent.cordis.yml')), true)
  assert.equal(existsSync(join(adDir, 'skills.json')), true)
  assert.match(readFileSync(join(adDir, 'preset.yml'), 'utf8'), /name:\s*出海广告创意投放操盘手/)
  // 同一份产物也必须落到 profile 级 shipped 目录（应用读取位）。
  const shipped = join(profile, 'agent-presets-shipped')
  assert.equal(existsSync(join(shipped, 'ad-creative-agent', 'agent.cordis.yml')), true)
})
