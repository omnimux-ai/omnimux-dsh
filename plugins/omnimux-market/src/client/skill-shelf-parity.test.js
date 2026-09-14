import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  PICKER_TABS,
  PLAZA_HIDDEN_TABS,
  PLAZA_TABS,
  SKILL_SHELF_TAGS,
  SKILL_SHELF_TAXONOMY,
  SUITE_SHELF_TAG,
  filterPickerItems,
  filterPlazaShelf,
  isLocalOnlyShelfTag,
  matchesDomainTag,
} from './skill-picker-logic.js'
import { WORKSHOP_DOMAIN_ORDER } from './plaza/plazaUtils.js'

/**
 * 单一真源守卫（Issue #504）：UI 片段经 concat 拼为单 factory，
 * 由 boot.js 的 SkillShelf 命名空间消费 skill-picker-logic.js。
 * skill-picker.js / skill-plaza.js 严禁再内联货架规则副本；漂移即失败。
 */
const here = dirname(fileURLToPath(import.meta.url))
const bootSrc = readFileSync(join(here, 'boot.js'), 'utf8')
const pickerSrc = readFileSync(join(here, 'skill-picker.js'), 'utf8')
const plazaSrc = readFileSync(join(here, 'skill-plaza.js'), 'utf8')

/** 九标签字面量数组（任意片段内出现即视为副本）。 */
const SHELF_ARRAY_LITERAL = /\[\s*"电商",\s*"商业广告",\s*"短剧漫剧"/

describe('skill shelf single source of truth', () => {
  it('boot.js injects the logic module as a single namespace binding', () => {
    assert.match(bootSrc, /const SkillShelf = require\("\.\/skill-picker-logic\.js"\)/)
    // 严禁顶层解构（与后续 fragment 的 const 冲突）
    assert.doesNotMatch(bootSrc, /const \{[^}]*\} = require\("\.\/skill-picker-logic\.js"\)/)
  })

  it('picker and plaza declare no hardcoded shelf tag arrays', () => {
    for (const [src, name] of [[pickerSrc, 'skill-picker.js'], [plazaSrc, 'skill-plaza.js']]) {
      assert.doesNotMatch(src, /const SKILL_SHELF_TAGS = \[/, `${name} must not inline SKILL_SHELF_TAGS`)
      assert.doesNotMatch(src, /const PLAZA_SHELF_TAGS = \[/, `${name} must not inline PLAZA_SHELF_TAGS`)
      assert.doesNotMatch(src, SHELF_ARRAY_LITERAL, `${name} must not inline the shelf tag literal`)
      assert.doesNotMatch(src, /const PICKER_TAB_LABELS = \{/, `${name} must not inline PICKER_TAB_LABELS`)
      assert.doesNotMatch(src, /const SKILL_SHELF_LABELS = \{/, `${name} must not inline SKILL_SHELF_LABELS`)
    }
  })

  it('picker and plaza declare no duplicated rule functions', () => {
    for (const [src, name] of [[pickerSrc, 'skill-picker.js'], [plazaSrc, 'skill-plaza.js']]) {
      for (const fn of [
        'pickerMatchesTag', 'pickerInShelf', 'pickerFilterItems', 'pickerSearchPayload',
        'pickerSkillToken', 'pickerSkillGesture', 'pickerAppendGesture',
        'plazaShelfItem', 'plazaFilterShelf',
      ]) {
        assert.doesNotMatch(src, new RegExp(`function ${fn}\\b`), `${name} must not re-declare ${fn}`)
      }
    }
  })

  it('picker and plaza consume the shared SkillShelf module', () => {
    for (const needle of [
      'SkillShelf.buildSearchPayload',
      'SkillShelf.filterPickerItems',
      'SkillShelf.PICKER_TABS',
      'SkillShelf.installPayload',
      'SkillShelf.loadPickerSearch',
    ]) {
      assert.ok(pickerSrc.includes(needle), `skill-picker.js must consume ${needle}`)
    }
    for (const needle of [
      'SkillShelf.SKILL_SHELF_TAXONOMY',
      'SkillShelf.plazaDiscoverySections',
      'SkillShelf.buildPlazaSearchPayload',
    ]) {
      assert.ok(plazaSrc.includes(needle), `skill-plaza.js must consume ${needle}`)
    }
  })

  it('picker and plaza filtering are the same implementation (behavioral parity)', () => {
    const fixture = [
      { slug: 'a', tags: ['电商'] },
      { slug: 'b', name: 'Shopify 独立站搭建', tags: [] },
      { slug: 'c', tags: ['动画'] },
      { slug: 'd', name: 'plain', tags: [] },
    ]
    for (const tag of ['电商', ...SKILL_SHELF_TAGS, '未知分类', '']) {
      const viaPlaza = filterPlazaShelf(fixture, tag)
      // 本地目录专属分类（套件）只在货架存在：选择器数据源是远端结果，没有对应页签，
      // 未知页签会回落「全部」，双向对拍在这一项上不成立。只断言货架侧的过滤语义。
      if (isLocalOnlyShelfTag(tag)) {
        assert.deepEqual(viaPlaza.map((it) => it.slug), [], `tag=${tag}`)
        assert.equal(PICKER_TABS.some((row) => row.id === tag), false, `${tag} must not become a picker tab`)
        continue
      }
      const viaPicker = tag && SKILL_SHELF_TAGS.includes(tag)
        ? filterPickerItems(fixture, tag)
        : filterPickerItems(fixture, 'all').filter((it) => !tag || filterPlazaShelf([it], tag).length)
      assert.deepEqual(viaPlaza.map((it) => it.slug), viaPicker.map((it) => it.slug), `tag=${tag}`)
    }
    assert.ok(SKILL_SHELF_TAXONOMY.length > 0)
  })

  it('suite tag stays local-only and never leaks into skill domains', () => {
    assert.ok(SKILL_SHELF_TAGS.includes(SUITE_SHELF_TAG))
    assert.equal(isLocalOnlyShelfTag(SUITE_SHELF_TAG), true)
    const suite = { slug: 'suite-a', kind: 'suite', tags: ['社媒创作'] }
    const skill = { slug: 'skill-anim', kind: 'skill', tags: ['动画'] }
    assert.equal(matchesDomainTag(suite, SUITE_SHELF_TAG), true)
    assert.equal(matchesDomainTag(suite, '动画'), false)
    assert.equal(matchesDomainTag(skill, SUITE_SHELF_TAG), false)
    assert.deepEqual(filterPlazaShelf([skill, suite], SUITE_SHELF_TAG).map((it) => it.slug), ['suite-a'])
    assert.deepEqual(filterPlazaShelf([skill, suite], '动画').map((it) => it.slug), ['skill-anim'])
    assert.deepEqual(filterPickerItems([skill, suite], '动画').map((it) => it.slug), ['skill-anim'])
  })

  it('plaza domain contract comment matches both classification sources', () => {
    const match = plazaSrc.match(/\/\/ 领域契约：(.+)/)
    assert.ok(match, 'skill-plaza.js must declare the domain contract line')
    const declared = match[1].split(',').map((id) => id.trim()).filter(Boolean)
    assert.deepEqual(declared, [...WORKSHOP_DOMAIN_ORDER])
    assert.deepEqual([...declared].sort(), SKILL_SHELF_TAXONOMY.map((row) => row.id).sort())
  })
})

describe('plaza tab visibility parity', () => {
  const shellSrc = readFileSync(join(here, 'plaza-shell.js'), 'utf8')

  function parseInlineStringArray(src, constName) {
    const re = new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\];`)
    const match = src.match(re)
    assert.ok(match, `${constName} not found in fragment source`)
    return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
  }

  it('plaza-shell inline PLAZA_TABS matches the canonical visible tabs', () => {
    assert.deepEqual(parseInlineStringArray(shellSrc, 'PLAZA_TABS'), [...PLAZA_TABS])
  })

  it('plaza-shell inline PLAZA_HIDDEN_TABS matches the canonical hidden tabs', () => {
    assert.deepEqual(parseInlineStringArray(shellSrc, 'PLAZA_HIDDEN_TABS'), [...PLAZA_HIDDEN_TABS])
  })

  it('hidden tabs are excluded from visible tabs and guarded in the tab bar', () => {
    for (const tab of PLAZA_HIDDEN_TABS) {
      assert.ok(!PLAZA_TABS.includes(tab), `${tab} must not be a visible tab`)
      assert.ok(shellSrc.includes(`PLAZA_HIDDEN_TABS.includes("${tab}")`), `tab bar guard for ${tab}`)
    }
  })
})
