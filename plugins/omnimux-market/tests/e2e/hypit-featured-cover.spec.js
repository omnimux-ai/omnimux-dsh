/**
 * E2E：Hypit 官方精选置顶 + 专属封面（Issue 2165）
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import catalog from '../../catalog/index.json' with { type: 'json' }
import recommendations from '../../catalog/skill-recommendations.json' with { type: 'json' }
import snapshot from '../../../omnimux/src/client/session-guide/skills/featured-skills.json' with { type: 'json' }
import { PINNED_TOP_SKILL_IDS, buildSnapshot, readCatalog } from '../../../../scripts/generate-featured-skills.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const coverPath = join(here, '../../catalog/covers/hypit-setup.png')
const CID = 'sk-omx-hypit-setup'

test('E2E 精选配置首位为 Hypit', () => {
  assert.equal(recommendations.featuredSkills[0], CID)
  assert.equal(recommendations.homeRecommendations[0], CID)
  assert.equal(PINNED_TOP_SKILL_IDS[0], CID)
})

test('E2E 目录条目封面为专属 hypit-setup.png 且在推荐技能中排第一', () => {
  const item = catalog.items.find((row) => row.id === CID)
  assert.ok(item)
  assert.equal(item.cover?.asset, 'catalog/covers/hypit-setup.png')
  assert.ok(existsSync(coverPath))
  const buf = readFileSync(coverPath)
  assert.ok(buf.length > 1000, 'cover file should be a real PNG')
  assert.equal(buf[0], 0x89)
  const recommended = catalog.items.filter((row) => row.kind === 'skill' && row.recommended === true)
  assert.equal(recommended[0].id, CID)
})

test('E2E 会话精选快照首位为 Hypit 且封面一致', () => {
  assert.equal(snapshot.skills[0].id, CID)
  assert.equal(snapshot.skills[0].cover, 'catalog/covers/hypit-setup.png')
  const rebuilt = buildSnapshot(readCatalog())
  assert.equal(rebuilt.skills[0].id, CID)
  assert.deepEqual(snapshot.skills.map((s) => s.id), rebuilt.skills.map((s) => s.id))
})
