import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  ALL_CREATIVE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  SHELVES_CONFIG,
  selectTemplatesByCategory,
  findTemplateById,
  selectShelfItems,
} from './templates-data.js'

test('模版总表规模与数据完整性验证', () => {
  assert.ok(ALL_CREATIVE_TEMPLATES.length >= 390, `模版总数应不少于390套，当前: ${ALL_CREATIVE_TEMPLATES.length}`)

  for (const item of ALL_CREATIVE_TEMPLATES) {
    assert.ok(item.id, '每项模版必须有 id')
    assert.ok(item.title, `模版 [${item.id}] 必须有标题`)
    assert.ok(item.categorySlug, `模版 [${item.id}] 必须有 categorySlug`)
    assert.ok(typeof item.prompt === 'string' && item.prompt.trim().length > 0, `模版 [${item.id}] 必须有有效提示词`)
  }
})

test('10 大核心分类枚举完整性与顺序验证', () => {
  const slugs = TEMPLATE_CATEGORIES.map((c) => c.slug)
  assert.ok(slugs.includes('all'))
  assert.ok(slugs.includes('tiktok'), '必须包含融合的 TikTok热门分类')
  assert.ok(slugs.includes('skills'), '必须包含融合的 Skills 技能库分类')
  assert.ok(slugs.includes('apps-software'), '必须包含新增的软件应用分类')
  assert.ok(slugs.includes('hook-intro'))
  assert.ok(slugs.includes('ugc-review'))
  assert.ok(slugs.includes('cinematic-vfx'))
  assert.ok(slugs.includes('fashion-try-on'))
  assert.ok(slugs.includes('industry-packs'))
  assert.ok(slugs.includes('durability-test'))
  assert.equal(TEMPLATE_CATEGORIES.length, 10, '包含 all 在内应恰好为 10 个分类项')

  // 严格校验用户指定的排列顺序：全部 -> TikTok热门 -> Skills -> 软件应用...
  assert.equal(slugs[0], 'all')
  assert.equal(slugs[1], 'tiktok')
  assert.equal(slugs[2], 'skills')
  assert.equal(slugs[3], 'apps-software')
})

test('分类筛选与 ID 检索功能验证', () => {
  const apps = selectTemplatesByCategory('apps-software')
  assert.ok(apps.length >= 15, `软件应用分类模版数应不少于15套，当前: ${apps.length}`)

  const first = apps[0]
  const found = findTemplateById(first.id)
  assert.equal(found?.id, first.id)

  const allItems = selectTemplatesByCategory('all')
  assert.equal(allItems.length, ALL_CREATIVE_TEMPLATES.length)
})

test('货架行配置与推荐数据分流验证', () => {
  assert.ok(SHELVES_CONFIG.length >= 5, '货架行配置数量不少于5组')

  const appItems = selectShelfItems('apps-software', 6)
  assert.ok(appItems.length > 0)
  for (const it of appItems) {
    assert.equal(it.categorySlug, 'apps-software')
  }
})
