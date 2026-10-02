/**
 * E2E：官方精选置顶与封面契约（Issue 2165 谱系；013fcb898 后 Hypit 下架，
 * 断言改为当前目录的首位置顶技能与快照一致性）。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import catalog from '../../catalog/index.json' with { type: 'json' }
import recommendations from '../../catalog/skill-recommendations.json' with { type: 'json' }
import snapshot from '../../../omnimux/src/client/session-guide/skills/featured-skills.json' with { type: 'json' }
import { PINNED_TOP_SKILL_IDS, buildSnapshot, readCatalog } from '../../../../scripts/generate-featured-skills.mjs'

const TOP = PINNED_TOP_SKILL_IDS[0]

test('E2E 精选配置首位与生成器置顶序列一致', () => {
  assert.equal(PINNED_TOP_SKILL_IDS[0], TOP)
  assert.ok(recommendations.featuredSkills.includes(TOP))
  assert.ok(snapshot.skills.length > 0)
})

test('E2E 首位置顶技能在目录中存在且带专属封面', () => {
  const item = catalog.items.find((row) => row.id === TOP)
  assert.ok(item, `${TOP} must exist in catalog`)
  assert.equal(item.recommended, true)
  assert.ok(item.cover?.asset, 'top skill must carry a cover asset')
})

test('E2E 会话精选快照与目录推荐集合一致且双语齐备', () => {
  const recommendedIds = catalog.items.filter((row) => row.kind === 'skill' && row.recommended === true).map((row) => row.id)
  assert.deepEqual([...snapshot.skills.map((s) => s.id)].sort(), [...recommendedIds].sort())
  const rebuilt = buildSnapshot(readCatalog())
  assert.deepEqual(snapshot.skills.map((s) => s.id), rebuilt.skills.map((s) => s.id))
  for (const s of snapshot.skills) {
    assert.ok(s.titleZh && s.titleEn && s.summaryZh && s.summaryEn, `${s.id} must carry bilingual fields`)
  }
})
