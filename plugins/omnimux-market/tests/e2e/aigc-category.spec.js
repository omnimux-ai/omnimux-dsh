/**
 * @file plugins/omnimux-market/tests/e2e/aigc-category.spec.js
 * E2E：技能工坊新增「AIGC 创作」分类的完整旅程（分类可见 → 选中过滤 → 其他分类不受影响）。
 *
 * - 数据真源：`plugins/omnimux-market/catalog/index.json`（直接读文件，不另造 fixture）。
 * - 文案真源：`src/client/i18n.js` 的真实字典（断言用户可见中文/英文，不是 key）。
 * - 规则真源：`src/client/skill-picker-logic.js` 与 `src/client/plaza/usePlazaFilter.js` 的真实实现，
 *   不复制第二份过滤逻辑。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { filterPlazaShelf, SKILL_SHELF_TAXONOMY } from '../../src/client/skill-picker-logic.js'
import { buildWorkshopCategories } from '../../src/client/plaza/usePlazaFilter.js'
import { WORKSHOP_DOMAINS } from '../../lib/workshop-query.js'

const DOMAIN = 'AIGC 创作'
const NEW_SLUGS = [
  'ai-image-gen', 'image-editing', 'image-enhance', 'remove-bg', 'ai-video-gen', 'auto-short-video',
  'baoyu-image-gen', 'baoyu-cover-image', 'baoyu-comic', 'flux-best-practices', 'ltx2',
  'seedance-prompt', 'seedance-characters', 'seedance-camera', 'seedance-examples-zh',
  'seedance2-skill-zh', 'editorial-collage-motion', 'generate-grid',
]

const catalog = JSON.parse(readFileSync(new URL('../../catalog/index.json', import.meta.url), 'utf8'))
const i18nSrc = readFileSync(new URL('../../src/client/i18n.js', import.meta.url), 'utf8')

function label(locale, key) {
  const hits = [...i18nSrc.matchAll(new RegExp('"' + key + '":\\s*"([^"]+)"', 'g'))].map((m) => m[1])
  return locale === 'zh' ? hits[0] : hits[1]
}

function tr(locale) {
  return (key) => (key === 'locale' ? locale : (label(locale, key) || key))
}

const items = catalog.items
  .filter((it) => it.kind === 'skill' && (it.tab || 'skills') === 'skills')
  .map((it) => ({ slug: it.skill, name: it.title, tags: it.tags || [], kind: it.kind }))

test('E2E 分类栏：中英文界面都出现「AIGC 创作」，位置在「套件」之后、「精选」与各领域之间', () => {
  const zh = buildWorkshopCategories(null, tr('zh'))
  const en = buildWorkshopCategories(null, tr('en'))
  assert.deepEqual(zh.slice(0, 5).map((c) => c.id), ['', '套件', 'featured', DOMAIN, '短剧漫剧'])
  assert.equal(zh.find((c) => c.id === DOMAIN).label, 'AIGC 创作')
  assert.equal(en.find((c) => c.id === DOMAIN).label, 'AIGC Creation')
  assert.ok(SKILL_SHELF_TAXONOMY.some((row) => row.id === DOMAIN), 'taxonomy must own the new category')
  assert.ok(WORKSHOP_DOMAINS.includes(DOMAIN), 'server-side domain mirror must include the new category')
})

test('E2E 选中「AIGC 创作」：只列出归入该分类的 27 项技能（原有 9 + 新入库 18）', () => {
  const shown = filterPlazaShelf(items, DOMAIN)
  assert.equal(shown.length, 27)
  assert.deepEqual([...new Set(shown.map((it) => it.kind))], ['skill'])
  const slugs = shown.map((it) => it.slug)
  for (const slug of NEW_SLUGS) assert.ok(slugs.includes(slug), `missing new AIGC skill ${slug}`)
  for (const slug of ['gunpla-poster', 'portrait-clone', 'video-storyboard']) {
    assert.ok(slugs.includes(slug), `missing existing AIGC skill ${slug}`)
  }
  for (const old of ['专业影视', '商业广告', '创意实验']) {
    const hits = filterPlazaShelf(items, old).filter((it) => it.tags.includes(DOMAIN))
    assert.equal(hits.length, 0, `${old} must not keep AIGC 创作 members`)
  }
})

test('E2E 其他分类不受影响：既有领域仍有成员，且不含 AIGC 创作条目', () => {
  for (const domain of ['短剧漫剧', '专业影视', '动画', '商业广告', '电商']) {
    const shown = filterPlazaShelf(items, domain)
    assert.ok(shown.length > 0, `${domain} must keep its members`)
    assert.equal(shown.filter((it) => it.tags.includes(DOMAIN)).length, 0, `${domain} must exclude AIGC 创作`)
  }
})

test('E2E 安装源：18 条新条目均为公开仓库 git 源，正文不在本仓复制', () => {
  const bySlug = new Map(catalog.items.map((it) => [it.skill, it]))
  const repos = new Set()
  for (const slug of NEW_SLUGS) {
    const item = bySlug.get(slug)
    assert.ok(item, `${slug} must exist in catalog`)
    assert.equal(item.tags.includes(DOMAIN), true)
    assert.equal(item.source.type, 'git')
    assert.match(item.source.repo, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
    assert.ok(item.source.path && !item.source.path.includes('..') && !item.source.path.startsWith('/'))
    assert.equal(item.source.ref, 'main')
    repos.add(item.source.repo)
  }
  assert.equal(repos.size, 7, 'seven upstream repositories supply the new AIGC skills')
})
