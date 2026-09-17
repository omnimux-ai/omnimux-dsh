/**
 * E2E：Hypit 可选技能「发现 → 会话引导安装」完整旅程（Issue 2160）。
 * 数据真源：catalog/index.json + 真实 session-create / catalogItemToCard 实现。
 * 不启动浏览器：用节点断言覆盖用户可见合同（可发现、session-guide、预填、不 auto-send、不捆绑引擎）。
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import catalog from '../../catalog/index.json' with { type: 'json' }
import { catalogItemToCard, findCatalogSkill } from '../../lib/skill-aggregate.js'
import { filterPlazaShelf } from '../../src/client/skill-picker-logic.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const ENTRY_ID = 'sk-omx-hypit-setup'
const SLUG = 'hypit-setup'

const item = catalog.items.find((row) => row.id === ENTRY_ID)
const sessionCreateSrc = readFileSync(join(root, 'src/client/session-create.js'), 'utf8')
const skillsUiSrc = readFileSync(join(root, 'src/client/skills-ui.js'), 'utf8')
const skillMd = readFileSync(join(root, 'catalog/skills/hypit-setup/SKILL.md'), 'utf8')

test('E2E 发现：技能货架可按 hypit 命中官方引导卡，且为 session-guide', () => {
  assert.ok(item, 'catalog must list Hypit setup card')
  assert.equal(item.installFlow, 'session-guide')
  assert.equal(item.skill, SLUG)
  assert.equal(item.source?.type, 'bundled')
  const shelf = catalog.items
    .filter((it) => it.kind === 'skill' && (it.tab || 'skills') === 'skills')
    .map((it) => ({
      slug: it.skill,
      name: it.title,
      title: it.title,
      tags: it.tags || [],
      kind: it.kind,
      summary: it.summary,
      titleZh: it.titleZh,
      titleEn: it.titleEn,
    }))
  const hay = shelf.filter((row) => {
    const blob = [row.slug, row.name, row.title, row.summary, row.titleZh, row.titleEn, ...(row.tags || [])]
      .join(' ')
      .toLowerCase()
    return blob.includes('hypit')
  })
  assert.ok(hay.some((row) => row.slug === SLUG), 'search/filter surface must discover hypit-setup')
  // 视觉与视频类仍可浏览到（标签含短剧/广告）
  const visualHits = filterPlazaShelf(
    shelf.map((row) => ({ ...row, tags: row.tags })),
    '短剧漫剧',
  )
  assert.ok(
    visualHits.some((row) => row.slug === SLUG) || (item.tags || []).includes('短剧漫剧'),
    'card should remain browsable under visual domains via tags',
  )
})

test('E2E 卡片投影：catalogItemToCard 带出 installFlow 与 sessionPrefill', () => {
  const found = findCatalogSkill(SLUG, ENTRY_ID)
  assert.ok(found)
  const card = catalogItemToCard(found, 'custom', { webBase: 'https://example.test', skillsDir: '/tmp' })
  assert.equal(card.installFlow, 'session-guide')
  assert.match(String(card.sessionPrefill || ''), /npx skills add hypit-ai\/hypit -g/)
  assert.match(String(card.sessionPrefill || ''), /@hypit\/hypit/)
  assert.equal(card.slug, SLUG)
  assert.equal(card.catalogId, ENTRY_ID)
})

test('E2E 安装旅程：点安装走会话预填 + 共享工具，禁止 auto-send 与引擎捆绑', () => {
  assert.match(skillsUiSrc, /installFlow === ["']session-guide["']/)
  assert.match(skillsUiSrc, /trySkillInSession\(/)
  assert.match(sessionCreateSrc, /activateSharedToolSkill/)
  assert.match(sessionCreateSrc, /__omnimuxActiveSkill/)
  assert.match(sessionCreateSrc, /sessionPrefill/)
  assert.doesNotMatch(sessionCreateSrc, /composer\.submit/)
  assert.doesNotMatch(sessionCreateSrc, /KeyboardEvent\(['"]keydown['"]/)
  assert.match(skillMd, /不捆绑/)
  assert.doesNotMatch(skillMd, /\/Users\//)
  assert.ok(existsSync(join(root, 'catalog/skills/hypit-setup/SKILL.md')))
  // bundled 引导包不得夹带 hypit 二进制或 handbook 树
  const only = readFileSync(join(root, 'catalog/skills/hypit-setup/SKILL.md'), 'utf8')
  assert.ok(!only.includes('hypit studio binary'))
  assert.ok(!existsSync(join(root, 'catalog/skills/hypit-setup/bin')))
  assert.ok(!existsSync(join(root, 'catalog/skills/hypit-setup/references')))
})

test('E2E 试用回访：已装后 try 路径仍使用 session-guide 预填合同', () => {
  assert.match(sessionCreateSrc, /installFlow === ["']session-guide["']/)
  assert.match(sessionCreateSrc, /sessionGuidePrefillText/)
  assert.match(String(item.sessionPrefill || ''), /\/hypit-setup/)
})
