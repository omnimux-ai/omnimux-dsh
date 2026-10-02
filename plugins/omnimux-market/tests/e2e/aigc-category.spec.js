/**
 * @file plugins/omnimux-market/tests/e2e/aigc-category.spec.js
 * E2E：技能工坊分类栏旅程（分类可见 → 目录成员 → 安装源）。
 *
 * 013fcb898（#2377/#2379）把货架收敛为「全部」+ 7 个营销分类（Creatify），
 * 原「AIGC 创作」领域下架；本 spec 随之以当前目录真源断言。
 *
 * - 数据真源：`plugins/omnimux-market/catalog/index.json`（直接读文件，不另造 fixture）。
 * - 文案真源：`src/client/i18n.js` 的真实字典（断言用户可见中文/英文，不是 key）。
 * - 规则真源：`src/client/plaza/usePlazaFilter.js` 的真实实现，不复制第二份过滤逻辑。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildWorkshopCategories } from '../../src/client/plaza/usePlazaFilter.js'

const catalog = JSON.parse(readFileSync(new URL('../../catalog/index.json', import.meta.url), 'utf8'))
const i18nSrc = readFileSync(new URL('../../src/client/i18n.js', import.meta.url), 'utf8')

function label(locale, key) {
  const hits = [...i18nSrc.matchAll(new RegExp('"' + key + '":\\s*"([^"]+)"', 'g'))].map((m) => m[1])
  return locale === 'zh' ? hits[0] : hits[1]
}

function tr(locale) {
  return (key) => (key === 'locale' ? locale : (label(locale, key) || key))
}

const skillCategories = catalog.categories.filter((row) => row.tab === 'skills')
const skills = catalog.items.filter((it) => it.kind === 'skill' && (it.tab || 'skills') === 'skills')

test('E2E 分类栏：中英文界面与目录声明的营销分类一致', () => {
  const zh = buildWorkshopCategories(null, tr('zh'))
  const en = buildWorkshopCategories(null, tr('en'))
  assert.deepEqual(zh.map((c) => c.id), ['', ...skillCategories.map((c) => c.id)])
  assert.equal(zh.length, 8)
  for (const cat of skillCategories) {
    assert.ok(zh.find((c) => c.id === cat.id).label, `zh label missing for ${cat.id}`)
    assert.ok(en.find((c) => c.id === cat.id).label, `en label missing for ${cat.id}`)
  }
})

test('E2E 目录数据：每个营销分类都真实拥有技能成员', () => {
  const members = (id) => skills.filter((it) => it.category === id)
  for (const cat of skillCategories) {
    assert.ok(members(cat.id).length > 0, `${cat.id} must have members`)
  }
  // 全部技能只落在声明过的分类内，不漂移
  const declared = new Set(skillCategories.map((c) => c.id))
  const orphans = skills.filter((it) => !declared.has(it.category)).map((it) => it.id)
  assert.deepEqual(orphans, [], 'skills must belong to a declared marketing category')
})

test('E2E 安装源：营销技能全部为内置 bundled 源', () => {
  for (const item of skills) {
    assert.equal(item.source?.type, 'bundled', `${item.id} must be bundled`)
    assert.ok(String(item.source.path || '').startsWith('catalog/skills/'), `${item.id} bad bundled path`)
  }
})
