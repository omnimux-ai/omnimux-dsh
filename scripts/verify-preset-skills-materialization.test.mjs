import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, copyFileSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Gate for issue #3130.
 *
 * A packaged agent preset lives inside the app archive. The filesystem skill
 * provider stats a directory with `{ bigint: true }` and Electron's asar `stat`
 * ignores that option, so listing a preset's own `skills/` throws and the whole
 * provider is skipped — a skill bundled with the preset never reaches the
 * catalog. The preset therefore must not point at its own directory, and the
 * materializer must copy those skills into the Harness Home's real skill root.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoots = []

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) rmSync(directory, { recursive: true, force: true })
})

test('no shipped preset registers its own skill directory', () => {
  const presetsRoot = join(root, 'presets')
  const offenders = []
  for (const entry of readdirSync(presetsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const composition = join(presetsRoot, entry.name, 'agent.cordis.yml')
    if (!existsSync(composition)) continue
    if (readFileSync(composition, 'utf8').includes('customSkillDirs')) offenders.push(entry.name)
  }
  assert.deepEqual(offenders, [], `these presets still register a skill root the packaged copy cannot list: ${offenders.join(', ')}`)
})

test('the cordis preset still ships both composition-authoring skills', () => {
  for (const id of ['editing-cordis-compositions', 'cordis-plugin-development']) {
    const skill = join(root, 'presets', 'cordis', 'skills', id, 'SKILL.md')
    assert.equal(existsSync(skill), true, `missing ${skill}`)
    assert.match(readFileSync(skill, 'utf8'), new RegExp(`name:\\s*${id}`), `${id}/SKILL.md must declare its own name`)
  }
})

test('materialization stages preset-bundled skills into the real skill root without clobbering', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'omnimux-preset-skills-'))
  temporaryRoots.push(fixture)
  const scripts = join(fixture, 'scripts')
  const home = join(fixture, 'harness-home')
  mkdirSync(scripts, { recursive: true })
  mkdirSync(home, { recursive: true })
  copyFileSync(join(root, 'scripts', 'sync-agent-presets.sh'), join(scripts, 'sync-agent-presets.sh'))
  copyFileSync(join(root, 'scripts', 'resolve-omnimux-profile.sh'), join(scripts, 'resolve-omnimux-profile.sh'))
  chmodSync(join(scripts, 'sync-agent-presets.sh'), 0o755)
  cpSync(join(root, 'presets'), join(fixture, 'presets'), { recursive: true })

  // A skill the user already owns at the same name must survive untouched.
  const owned = join(home, 'skills', 'sopilot-social-agents')
  mkdirSync(owned, { recursive: true })
  writeFileSync(join(owned, 'SKILL.md'), 'user-owned\n')

  const result = spawnSync('bash', [join(scripts, 'sync-agent-presets.sh'), `--target=${home}`], {
    cwd: fixture,
    encoding: 'utf8',
    env: { ...process.env, HOME: fixture, OMNIMUX_SYNC_TARGETS: '' },
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

  for (const id of ['editing-cordis-compositions', 'cordis-plugin-development']) {
    const staged = join(home, 'skills', id, 'SKILL.md')
    assert.equal(existsSync(staged), true, `${id} was not staged into the real skill root:\n${result.stdout}`)
    assert.ok(readFileSync(staged, 'utf8').length > 0, `${id}/SKILL.md is empty`)
  }
  assert.equal(readFileSync(join(owned, 'SKILL.md'), 'utf8'), 'user-owned\n', 'an existing skill was overwritten')
})
