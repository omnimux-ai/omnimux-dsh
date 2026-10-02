import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCatalog } from './catalog.js'
import { summonItem } from './summon.js'

const PACKAGE_ROOT = join(import.meta.dirname, '..', '..')

function env() {
  const home = mkdtempSync(join(tmpdir(), 'omx-sum-'))
  const profileDir = join(home, 'profiles', 'omnimux')
  mkdirSync(profileDir, { recursive: true })
  return { home, profileDir, packageRoot: PACKAGE_ROOT }
}

test('summon installs then returns a slash gesture', () => {
  const roots = env()
  const result = summonItem({
    catalog: loadCatalog(),
    id: 'sk-omx-ugc-confessional',
    sessionState: 'locked',
    ...roots,
  })
  assert.equal(result.gesture, '/ugc-confessional')
  assert.equal(result.stagePreset, null)
})

test('blank session stages expert-mode when the preset exists', () => {
  const roots = env()
  mkdirSync(join(roots.home, '.agent-presets', 'expert-mode'), { recursive: true })
  writeFileSync(join(roots.home, '.agent-presets', 'expert-mode', 'agent.cordis.yml'), '- []\n')
  const result = summonItem({
    catalog: loadCatalog(),
    id: 'sk-omx-ugc-confessional',
    sessionState: 'blank',
    ...roots,
  })
  assert.equal(result.stagePreset, 'expert-mode')
  assert.equal(result.gesture, '/ugc-confessional')
})

test('summons the social-engagement-team agent pack from bundled catalog', () => {
  const roots = env()
  const result = summonItem({
    catalog: loadCatalog(),
    id: 'exp-social-engagement-team',
    sessionState: 'locked',
    ...roots,
  })
  assert.equal(result.id, 'exp-social-engagement-team')
  assert.equal(result.skill, 'social-engagement-team')
  assert.equal(result.gesture, '/social-engagement-team')
  assert.equal(existsSync(join(roots.home, 'skills', 'social-engagement-team', 'agents', 'social-engagement-team-lead.md')), true)
  assert.equal(existsSync(join(roots.home, 'skills', 'social-engagement-ops', 'SKILL.md')), true)
})

test('summons the social-content-team agent pack from bundled catalog', () => {
  const roots = env()
  const result = summonItem({
    catalog: loadCatalog(),
    id: 'exp-social-content-team',
    sessionState: 'locked',
    ...roots,
  })
  assert.equal(result.id, 'exp-social-content-team')
  assert.equal(result.skill, 'social-content-team')
  assert.equal(result.gesture, '/social-content-team')
  assert.equal(existsSync(join(roots.home, 'skills', 'social-content-team', 'agents', 'social-content-team-lead.md')), true)
  assert.equal(existsSync(join(roots.home, 'skills', 'social-content-team', 'agents', 'content-copywriter.md')), true)
  assert.equal(existsSync(join(roots.home, 'skills', 'social-content-team', 'agents', 'editing-agent.md')), true)
  assert.equal(existsSync(join(roots.home, 'skills', 'social-content-team', 'contracts', 'editing-defaults.md')), true)
})

test('connectors cannot be summoned', () => {
  const roots = env()
  assert.throws(() => summonItem({
    catalog: loadCatalog(),
    id: 'cn-tencent-docs',
    sessionState: 'blank',
    ...roots,
  }), /not summoned/)
})
