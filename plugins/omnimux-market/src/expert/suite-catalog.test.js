/**
 * 「套件」货架条目契约：结构化清单解析、计数与分类落地，以及非法输入的拒绝口径。
 * 只覆盖数据层；客户端渲染与安装编排各自另有测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { invalidateCatalogMemos, loadCatalog, parseCatalog } from './catalog.js'

const SUITE_IDS = [
  'suite-social-content-team',
  'suite-content-distribution-team',
  'suite-social-engagement-team',
  'suite-ai-content-creator-team',
  'suite-marketing-campaign-team',
  'suite-content-monetization-team',
  'suite-amazon-skills',
]

/** 平铺多技能仓库（技能直接躺在仓库根、无 `skills/` 中间层）。 */
const FLAT_SUITE_ID = 'suite-amazon-skills'
const FLAT_SUITE_SKILLS = 52
const FLAT_SUITE_CLONE = '/Users/x/Desktop/Project/Github/Amazon-Skills'

test('shelf exposes the seven suites with structured manifests', () => {
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
      // content 是条目的完整源文本；规则有正文，技能与 Agent 缺省空串。
      assert.equal(typeof entry.content, 'string')
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
    // git 包可以是仓库内的子目录（experts/…），也可以是仓库根（`.`）
    else assert.ok(source.path === '.' || /^experts\//.test(source.path), `${id} git path ${source.path}`)
  }
})

/* ------------------------------------------------- 平铺多技能仓库（Issue #1685） */

test('flat suite declares 52 skills whose path names their own directory', () => {
  invalidateCatalogMemos()
  const doc = loadCatalog()
  const suite = doc.items.find((row) => row.id === FLAT_SUITE_ID)
  assert.ok(suite, `${FLAT_SUITE_ID} missing from the shelf`)
  assert.equal(suite.kind, 'suite')
  assert.equal(suite.category, 'sk-suite')
  assert.equal(suite.skill, 'amazon-skills')
  assert.deepEqual(suite.source, { type: 'git', repo: 'nexscope-ai/Amazon-Skills', path: '.', ref: 'main' })

  const { skills, rules, agents } = suite.suite
  assert.equal(skills.length, FLAT_SUITE_SKILLS)
  assert.equal(rules.length, 0)
  assert.equal(agents.length, 0)

  // 平铺仓库：path 就是技能目录名，且必须唯一——装载靠它定位
  assert.deepEqual(new Set(skills.map((entry) => entry.path)).size, FLAT_SUITE_SKILLS)
  for (const entry of skills) {
    assert.equal(entry.path, entry.name, `${entry.name} path must name its own directory`)
    assert.ok(entry.title, `${entry.name} without a Chinese title`)
    assert.ok(entry.desc, `${entry.name} without a Chinese description`)
    assert.match(entry.name, /^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  }
})

test('legacy suites carry an empty path and rules/agents stay path-free', () => {
  invalidateCatalogMemos()
  const doc = loadCatalog()
  const byId = new Map(doc.items.map((row) => [row.id, row]))
  for (const id of SUITE_IDS) {
    const { skills, rules, agents } = byId.get(id).suite
    for (const entry of skills) {
      assert.equal(entry.path, id === FLAT_SUITE_ID ? entry.name : '', `${id} ${entry.name} path`)
    }
    // 旧语义不因本次新增能力而改变形状：规则与 Agent 项不得多出 path 键
    for (const entry of [...rules, ...agents]) {
      assert.equal(Object.hasOwn(entry, 'path'), false, `${id} ${entry.name} must not carry path`)
    }
  }
})

/** 本机克隆在场时顺带核对目录白名单；CI 无该克隆则只保留上面的结构断言。 */
test('flat suite paths match the local clone directory whitelist', { skip: !existsSync(FLAT_SUITE_CLONE) }, () => {
  const dirs = readdirSync(FLAT_SUITE_CLONE)
    .filter((name) => statSync(join(FLAT_SUITE_CLONE, name)).isDirectory())
    .filter((name) => existsSync(join(FLAT_SUITE_CLONE, name, 'SKILL.md')))
  invalidateCatalogMemos()
  const skills = loadCatalog().items.find((row) => row.id === FLAT_SUITE_ID).suite.skills
  assert.deepEqual(skills.map((entry) => entry.path).sort(), [...dirs].sort())
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
    rules: [{ name: 'r', title: 'R', desc: '', content: '' }],
    agents: [],
  })
})

test('rule entries keep the raw source text and default to an empty string', () => {
  const body = '# 契约标题\n\n1. 第一条约束。\n2. 第二条约束。'
  const doc = parseCatalog(docOf([{
    ...baseSuite,
    suite: {
      rules: [
        { name: 'with-content', title: '有正文', desc: '一句摘要', content: body },
        { name: 'without-content', title: '无正文', desc: '一句摘要' },
      ],
    },
  }]))
  const [withContent, withoutContent] = doc.items[0].suite.rules
  // 详情页直接展示 content，所以解析必须原样保留正文（含换行），不得压缩或截断。
  assert.equal(withContent.content, body)
  assert.notEqual(withContent.content, withContent.desc)
  assert.equal(withoutContent.content, '')
})

test('packaged suites expose rule content identical to the packaged source text', () => {
  invalidateCatalogMemos()
  const doc = loadCatalog()
  const suite = doc.items.find((row) => row.id === 'suite-social-content-team')
  assert.equal(suite.suite.rules.length, 5)
  for (const rule of suite.suite.rules) {
    assert.ok(rule.content.length > 0, `rule ${rule.name} must carry its source text`)
    assert.ok(rule.content.includes('\n'), `rule ${rule.name} must keep its line breaks`)
    // 页面所见即安装后写进 AGENTS.md 的原文，因此不携带 YAML frontmatter。
    assert.equal(rule.content.startsWith('---'), false, `rule ${rule.name} must not carry frontmatter`)
    assert.notEqual(rule.content, rule.desc)
  }
})

test('skill entries project an optional path and default it to empty', () => {
  const doc = parseCatalog(docOf([{
    ...baseSuite,
    suite: {
      skills: [
        { name: 'flat', title: '平铺', desc: '仓库根下的技能', path: 'flat' },
        { name: 'nested', title: '嵌套', desc: '没有 path 的技能' },
        { name: 'blank', title: '空白', desc: '空串 path', path: '' },
        { name: 'padded', title: '带空白', desc: '两侧空白被 trim', path: '  deep/nested  ' },
      ],
    },
  }]))
  assert.deepEqual(doc.items[0].suite.skills, [
    { name: 'flat', title: '平铺', desc: '仓库根下的技能', path: 'flat', content: '' },
    { name: 'nested', title: '嵌套', desc: '没有 path 的技能', path: '', content: '' },
    { name: 'blank', title: '空白', desc: '空串 path', path: '', content: '' },
    { name: 'padded', title: '带空白', desc: '两侧空白被 trim', path: 'deep/nested', content: '' },
  ])
})

test('non-string skill path degrades to empty instead of throwing', () => {
  const doc = parseCatalog(docOf([{
    ...baseSuite,
    suite: { skills: [{ name: 'k', title: 'K', path: 42 }] },
  }]))
  assert.equal(doc.items[0].suite.skills[0].path, '')
})

test('rules and agents never gain a path key', () => {
  const doc = parseCatalog(docOf([{
    ...baseSuite,
    suite: {
      rules: [{ name: 'r', title: 'R', path: 'ignored' }],
      agents: [{ name: 'a', title: 'A', path: 'ignored' }],
    },
  }]))
  assert.deepEqual(doc.items[0].suite.rules, [{ name: 'r', title: 'R', desc: '', content: '' }])
  assert.deepEqual(doc.items[0].suite.agents, [{ name: 'a', title: 'A', desc: '', content: '' }])
})
