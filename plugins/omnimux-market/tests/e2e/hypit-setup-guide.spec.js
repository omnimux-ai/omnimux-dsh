/**
 * E2E：session-guide 技能「发现 → 会话引导」契约（Issue 2160 谱系；
 * 013fcb898 后 hypit-setup 下架，断言以当前目录中的 session-guide 条目为准）。
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import catalog from '../../catalog/index.json' with { type: 'json' }
import { catalogItemToCard, findCatalogSkill } from '../../lib/skill-aggregate.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')

const guideItems = catalog.items.filter((row) => row.kind === 'skill' && row.installFlow === 'session-guide')
const item = guideItems.find((row) => row.id === 'sk-omx-ugc-confessional') || guideItems[0]
const SLUG = item && item.skill

const sessionCreateSrc = readFileSync(join(root, 'src/client/session-create.js'), 'utf8')
const skillsUiSrc = readFileSync(join(root, 'src/client/skills-ui.js'), 'utf8')

test('E2E 发现：技能货架包含 session-guide 引导卡且字段完整', () => {
  assert.ok(guideItems.length > 0, 'catalog must list session-guide cards')
  assert.equal(item.installFlow, 'session-guide')
  assert.equal(item.kind, 'skill')
  assert.equal(item.source?.type, 'bundled')
  assert.ok(item.titleZh && item.titleEn && item.summaryZh && item.summaryEn)
  assert.ok(String(item.sessionPrefill || '').includes(`/${SLUG}`), 'sessionPrefill must start from the skill slash gesture')
})

test('E2E 卡片投影：catalogItemToCard 带出 installFlow 与 sessionPrefill', () => {
  const found = findCatalogSkill(SLUG, item.id)
  assert.ok(found)
  const card = catalogItemToCard(found, 'custom', { webBase: 'https://example.test', skillsDir: '/tmp' })
  assert.equal(card.installFlow, 'session-guide')
  assert.ok(String(card.sessionPrefill || '').length > 0)
  assert.equal(card.slug, SLUG)
  assert.equal(card.catalogId, item.id)
})

test('E2E 安装旅程：点安装走会话预填 + 共享工具，禁止 auto-send', () => {
  assert.match(skillsUiSrc, /installFlow === ["']session-guide["']/)
  assert.match(skillsUiSrc, /trySkillInSession\(/)
  assert.match(sessionCreateSrc, /activateSharedToolSkill/)
  assert.match(sessionCreateSrc, /__omnimuxActiveSkill/)
  assert.match(sessionCreateSrc, /sessionPrefill/)
  assert.doesNotMatch(sessionCreateSrc, /composer\.submit/)
  assert.doesNotMatch(sessionCreateSrc, /KeyboardEvent\(['"]keydown['"]/)
  // 引导包正文存在且不含本机绝对路径
  const mdPath = join(root, String(item.source.path), 'SKILL.md')
  assert.ok(existsSync(mdPath), 'bundled SKILL.md must exist')
  const body = readFileSync(mdPath, 'utf8')
  assert.doesNotMatch(body, /\/Users\//)
})

test('E2E 试用回访：已装后 try 路径仍使用 session-guide 预填合同', () => {
  assert.match(sessionCreateSrc, /installFlow === ["']session-guide["']/)
  assert.match(sessionCreateSrc, /sessionGuidePrefillText/)
  assert.ok(String(item.sessionPrefill || '').includes(`/${SLUG}`))
})
