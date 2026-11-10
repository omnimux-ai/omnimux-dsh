/**
 * 引导页（starter host）工作区行 vs 通用 Hero 行：级联胜出契约。
 *
 * 两份样式来自不同插件的 <style>：GUIDE_CSS 由 omnimux-inspiration 在 mount 时注入，
 * COMPOSER_COMPACT_CSS 由 hub 的 chrome effect 注入，跨包注入顺序无保证。
 * 两条规则同为 !important，若特异性相同就变成「谁后注入谁赢」——Issue #3868 实测
 * 通用规则赢，引导页工作区行被撑到原生内容宽 920px、相对输入框卡片左移约 120px。
 *
 * 这里静态锁定：引导页工作区行的每条尺寸规则，特异性必须严格高于通用 Hero 规则中
 * 直接对应的那条。删掉 [data-phase] 复合条件后本测试必须失败。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { COMPOSER_COMPACT_CSS } from './composer-compact.js'
import { GUIDE_CSS } from './session-guide/styles.js'

/** 把 CSS 文本拆成顶层 `{ selector, body }`；at-rule 块整块跳过（本文件对比的规则都在顶层）。 */
function parseRules(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  let cursor = 0
  while (cursor < stripped.length) {
    const open = stripped.indexOf('{', cursor)
    if (open === -1) break
    const selector = stripped.slice(cursor, open).trim()
    let depth = 1
    let end = open + 1
    while (end < stripped.length && depth > 0) {
      const char = stripped.charAt(end)
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      end += 1
    }
    assert.ok(depth === 0, `unbalanced braces after selector: ${selector.slice(0, 80)}`)
    if (!selector.startsWith('@')) rules.push({ selector, body: stripped.slice(open + 1, end - 1) })
    cursor = end
  }
  return rules
}

/** 选择器列表拆成单条选择器。 */
function splitSelectors(selector) {
  return selector.split(',').map((part) => part.trim()).filter((part) => part !== '')
}

/**
 * CSS 特异性（不含 id，本仓选择器没有 id）：按 Selectors 三元组打分。
 * 属性/类/伪类计数足够区分本文件对比的两组选择器，不追求完整 Selectors 规范。
 */
export function selectorSpecificity(selector) {
  const ids = (selector.match(/#[\w-]+/g) || []).length
  const attrs = (selector.match(/\[[^\]]*\]/g) || []).length
  const classes = (selector.match(/\.[A-Za-z_][\w-]*/g) || []).length
  const pseudos = (selector.match(/:(?!:)[A-Za-z-]+/g) || []).length
  const types = (selector.match(/(^|[\s>+~,(])([a-zA-Z][\w-]*)/g) || []).length
  return { ids, classLevel: classes + attrs + pseudos, typeLevel: types }
}

/** 字典序比较特异性：a 是否严格高于 b。 */
export function outranks(a, b) {
  if (a.ids !== b.ids) return a.ids > b.ids
  if (a.classLevel !== b.classLevel) return a.classLevel > b.classLevel
  return a.typeLevel > b.typeLevel
}

function rowSelectorParts(css, marker) {
  return parseRules(css)
    .filter((rule) => rule.selector.includes(marker))
    .flatMap((rule) => splitSelectors(rule.selector))
    .filter((selector) => selector.includes(marker))
}

const STARTER_SIZE_MARKER = 'max-width:680px'
const GUIDE_ROW_MARKER = '[class*="heroWorkspaceRow"]'
const GUIDE_STARTER_COMPOUND = '[data-phase][data-omnimux-starter-host]'
const COMPACT_NORMAL_ROW = `[data-phase='hero'] ${GUIDE_ROW_MARKER}`

describe('starter hero workspace row outranks the generic hero row rule', () => {
  const guideSizingSelectors = parseRules(GUIDE_CSS)
    .filter((rule) => rule.selector.includes(GUIDE_ROW_MARKER) && rule.body.includes(STARTER_SIZE_MARKER))
    .flatMap((rule) => splitSelectors(rule.selector))
    .filter((selector) => selector.includes(GUIDE_ROW_MARKER))

  const compactRowSelectors = rowSelectorParts(COMPOSER_COMPACT_CSS, GUIDE_ROW_MARKER)
  const compactNormal = compactRowSelectors.find((selector) => selector === COMPACT_NORMAL_ROW)

  it('keeps the 680px starter sizing rule and a normal-width generic competitor', () => {
    assert.ok(guideSizingSelectors.length >= 2, 'starter row must keep both normal and split sizing selectors')
    assert.ok(compactNormal, 'generic hero row rule must still exist (this fix must not delete it)')
    assert.match(
      COMPOSER_COMPACT_CSS,
      /\[data-phase='hero'\] \[class\*="heroWorkspaceRow"\]\{[\s\S]*?max-width:var\(--dsh-chat-content-width\)!important/,
      'generic hero row rule keeps the native width; the starter sheet must win by specificity',
    )
  })

  it('tags every starter row sizing selector with the data-phase compound', () => {
    for (const selector of guideSizingSelectors) {
      assert.ok(
        selector.includes(GUIDE_STARTER_COMPOUND),
        `starter row selector must carry ${GUIDE_STARTER_COMPOUND} to outrank the generic rule: ${selector}`,
      )
    }
  })

  it('is strictly more specific than the matching generic rule in every state', () => {
    for (const selector of guideSizingSelectors) {
      const counterpart = selector.replace(GUIDE_STARTER_COMPOUND, "[data-phase='hero']")
      const exact = compactRowSelectors.find((candidate) => candidate === counterpart)
      // 密度态（short/icon）在通用表里没有同前缀规则，退化为与通用普通态比较。
      const target = exact || compactNormal
      assert.ok(target, `no generic competitor found for ${selector}`)
      assert.ok(
        outranks(selectorSpecificity(selector), selectorSpecificity(target)),
        `starter selector must outrank the generic rule regardless of <style> order:\n  starter: ${selector}\n  generic: ${target}`,
      )
    }
  })

  it('the pre-fix selector shape (without data-phase) ties and would lose on source order', () => {
    const legacyNormal = `[data-omnimux-starter-host] ${GUIDE_ROW_MARKER}`
    assert.equal(
      outranks(selectorSpecificity(legacyNormal), selectorSpecificity(compactNormal)),
      false,
      'removing the data-phase compound must bring back the equal-specificity tie',
    )
  })

  it('the compound selectors match a real starter-host DOM tree', () => {
    const dom = new JSDOM(`<!doctype html><html data-omnimux-split-compact><body>
      <div data-phase="hero" data-omnimux-starter-host>
        <div class="uPhUma_heroWorkspaceRow"></div>
      </div>
    </body></html>`)
    const row = dom.window.document.querySelector('[class*="heroWorkspaceRow"]')
    const root = dom.window.document.querySelector('[data-phase]')

    const normalSelector = guideSizingSelectors.find((selector) => !selector.startsWith('html[') && !selector.includes('dshDesktopFrame') && !selector.includes('frame"'))
    assert.ok(normalSelector, 'normal starter row selector must exist')
    assert.equal(row.matches(normalSelector), true, 'data-phase + data-omnimux-starter-host on the same element must match')
    assert.equal(row.matches(COMPACT_NORMAL_ROW), true, 'the generic rule must also target this row (real competitor)')
    assert.equal(root.matches(GUIDE_STARTER_COMPOUND), true, 'compound marker must live on the conversation root')

    const splitSelector = guideSizingSelectors.find((selector) => selector.startsWith('html[data-omnimux-split-compact]'))
    assert.ok(splitSelector, 'split-compact starter row selector must exist')
    assert.equal(row.matches(splitSelector), true, 'starter row must match the split-compact sizing rule')
    dom.window.close()
  })
})
