import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { PLAZA_HIDDEN_TABS, PLAZA_TABS, SKILL_SHELF_TAGS, SKILL_SHELF_TAXONOMY } from './skill-picker-logic.js'

/**
 * 对拍守卫：client 片段经 concat 拼为单 factory，UI 片段无法 import 本模块，
 * skill-picker.js 的 SKILL_SHELF_TAGS 与 skill-plaza.js 的 PLAZA_SHELF_TAGS
 * 是真源的内联副本。本测试直接解析片段源码，漂移即失败（设计文档 §1.3 / §3）。
 */
const here = dirname(fileURLToPath(import.meta.url))
const pickerSrc = readFileSync(join(here, 'skill-picker.js'), 'utf8')
const plazaSrc = readFileSync(join(here, 'skill-plaza.js'), 'utf8')

function parseInlineStringArray(src, constName) {
  const re = new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\];`)
  const match = src.match(re)
  assert.ok(match, `${constName} not found in fragment source`)
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
}

function parseLabelMapKeys(src, constName) {
  const re = new RegExp(`const ${constName} = \\{([\\s\\S]*?)\\};`)
  const match = src.match(re)
  assert.ok(match, `${constName} not found in fragment source`)
  return [...match[1].matchAll(/"([^"]+)":/g)].map((m) => m[1])
}

function parseKeywordMap(src, constName) {
  const re = new RegExp(`const ${constName} = \\{([\\s\\S]*?)\\};`)
  const match = src.match(re)
  assert.ok(match, `${constName} not found in fragment source`)
  const map = {}
  for (const line of match[1].split('\n')) {
    const keyMatch = line.match(/"([^"]+)":\s*\[(.*?)\]/)
    if (keyMatch) {
      const tag = keyMatch[1]
      const kws = [...keyMatch[2].matchAll(/"([^"]+)"/g)].map((m) => m[1])
      map[tag] = kws
    }
  }
  return map
}

describe('skill shelf taxonomy parity', () => {
  it('picker UI inline SKILL_SHELF_TAGS matches the canonical order exactly', () => {
    assert.deepEqual(parseInlineStringArray(pickerSrc, 'SKILL_SHELF_TAGS'), [...SKILL_SHELF_TAGS])
  })

  it('plaza UI inline PLAZA_SHELF_TAGS matches the canonical order exactly', () => {
    assert.deepEqual(parseInlineStringArray(plazaSrc, 'PLAZA_SHELF_TAGS'), [...SKILL_SHELF_TAGS])
  })

  it('both fragments map every shelf tag to a label key', () => {
    for (const [src, name] of [[pickerSrc, 'PICKER_TAB_LABELS'], [plazaSrc, 'SKILL_SHELF_LABELS']]) {
      const keys = parseLabelMapKeys(src, name)
      assert.deepEqual(new Set(keys), new Set(SKILL_SHELF_TAGS), `${name} must cover every shelf tag`)
    }
    for (const row of SKILL_SHELF_TAXONOMY) {
      assert.ok(pickerSrc.includes(`"${row.id}": "${row.labelKey}"`), `picker label for ${row.id}`)
      assert.ok(plazaSrc.includes(`"${row.id}": "${row.labelKey}"`), `plaza label for ${row.id}`)
    }
  })

  it('both fragments fall back to the same haystack fields', () => {
    const fields = ['category', 'categoryLabel', 'name', 'title', 'description', 'summary']
    for (const src of [pickerSrc, plazaSrc]) {
      for (const field of fields) {
        assert.ok(src.includes(`.${field}`), `fragment must include ${field} in fallback haystack`)
      }
    }
  })

  it('both fragments inline shelf keywords match the canonical taxonomy', () => {
    for (const [src, name] of [[pickerSrc, 'PICKER_SHELF_KEYWORDS'], [plazaSrc, 'PLAZA_SHELF_KEYWORDS']]) {
      const map = parseKeywordMap(src, name)
      for (const row of SKILL_SHELF_TAXONOMY) {
        assert.deepEqual(map[row.id], [...row.keywords], `${name} keywords for ${row.id}`)
      }
    }
  })
})

describe('plaza tab visibility parity', () => {
  const shellSrc = readFileSync(join(here, 'plaza-shell.js'), 'utf8')

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
