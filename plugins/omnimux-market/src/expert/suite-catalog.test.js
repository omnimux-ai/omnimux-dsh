/**
 * 「套件」货架条目契约：结构化清单解析、计数与分类落地，以及非法输入的拒绝口径。
 * 只覆盖数据层；客户端渲染与安装编排各自另有测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { invalidateCatalogMemos, loadCatalog, parseCatalog } from './catalog.js'

const SUITE_IDS = [
  'suite-social-content-team',
  'suite-content-distribution-team',
  'suite-social-engagement-team',
  'suite-ai-content-creator-team',
  'suite-marketing-campaign-team',
  'suite-content-monetization-team',
]

test('shelf exposes the six suites with structured manifests', () => {
  invalidateCatalogMemos()
  const doc = loadCatalog()
  const suites = doc.items.filter((row) => row.kind === 'suite')
  assert.deepEqual(suites.map((row) => row.id).sort(), [...SUITE_IDS].sort())

  for (const suite of suites) {
    assert.equal(suite.tab, 'skills')
    assert.equal(suite.category, 'sk-suite')
    assert.ok(suite.skill, `${suite.id} must carry a pack slug`)
    const { skills, rules, agents } = suite.suite
    const entries = [...skills, ...rules, ...agents]
    assert.ok(entries.length > 0, `${suite.id} must expose at least one entry`)
    for (const entry of entries) {
      assert.ok(entry.name, `${suite.id} entry without name`)
      assert.ok(entry.title, `${suite.id} entry ${entry.name} without title`)
      assert.equal(typeof entry.desc, 'string')
    }
  }

  // 单个 skill 仍不进套件集合，避免把普通技能误判成套件
  assert.ok(suites.every((row) => row.kind === 'suite'))
})

test('suite counts match the packaged content', () => {
  invalidateCatalogMemos()
  const doc = loadCatalog()
  const byId = new Map(doc.items.map((row) => [row.id, row]))
  const counts = (id) => {
    const { skills, rules, agents } = byId.get(id).suite
    return { skills: skills.length, rules: rules.length, agents: agents.length }
  }
  assert.deepEqual(counts('suite-social-content-team'), { skills: 0, rules: 5, agents: 7 })
  assert.deepEqual(counts('suite-content-distribution-team'), { skills: 6, rules: 0, agents: 5 })
  assert.deepEqual(counts('suite-social-engagement-team'), { skills: 1, rules: 0, agents: 5 })
})

test('shelf declares the suite category on the skills tab', () => {
  invalidateCatalogMemos()
  const doc = loadCatalog()
  const category = doc.categories.find((row) => row.id === 'sk-suite')
  assert.deepEqual(category, { id: 'sk-suite', title: '套件', tab: 'skills' })
})

test('suite entries keep their declared source shape', () => {
  invalidateCatalogMemos()
  const doc = loadCatalog()
  const byId = new Map(doc.items.map((row) => [row.id, row]))
  for (const id of SUITE_IDS) {
    const { source } = byId.get(id)
    assert.ok(source.type === 'bundled' || source.type === 'git')
    if (source.type === 'bundled') assert.match(source.path, /^catalog\/experts\//)
    else assert.match(source.path, /^experts\//)
  }
})

const docOf = (items) => ({ schema: 1, generated_at: '2026-09-14T00:00:00.000Z', items })

const baseSuite = {
  id: 'suite-demo',
  tab: 'skills',
  kind: 'suite',
  title: '演示套件',
  summary: '用于校验解析口径的演示条目。',
  category: 'sk-suite',
  skill: 'demo-pack',
  source: { type: 'bundled', path: 'catalog/experts/demo-pack' },
}

test('suite manifest entries require a name', () => {
  assert.throws(
    () => parseCatalog(docOf([{ ...baseSuite, suite: { skills: [{ title: '缺名' }] } }])),
    /suite skills entry missing name/,
  )
})

test('suite items require a pack slug', () => {
  const { skill, ...withoutSkill } = baseSuite
  assert.throws(
    () => parseCatalog(docOf([{ ...withoutSkill, suite: { agents: [{ name: 'a', title: 'A' }] } }])),
    /missing skill/,
  )
})

test('empty or absent manifest groups parse as empty arrays', () => {
  const doc = parseCatalog(docOf([{ ...baseSuite, suite: { rules: [{ name: 'r', title: 'R' }] } }]))
  assert.deepEqual(doc.items[0].suite, {
    skills: [],
    rules: [{ name: 'r', title: 'R', desc: '' }],
    agents: [],
  })
})
