import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { GUIDE_CSS } from '../../src/client/session-guide/styles.js'

const here = dirname(fileURLToPath(import.meta.url))
const STYLES_SOURCE = readFileSync(join(here, '..', '..', 'src', 'client', 'session-guide', 'styles.js'), 'utf8')

/** 原生输入框卡片的宽度上限 token。 */
const NATIVE_CAP_TOKEN = 'var(--dsh-composer-card-max-width'

/**
 * 把样式表拆成 `{ selector, body }`（不依赖 JSDOM 层叠，避免它丢规则）。
 * @param {string} css
 */
function parseRules(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  let depth = 0
  let start = 0
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]
    if (ch === '{') {
      if (depth === 0) {
        const selector = stripped.slice(start, i).trim()
        const end = stripped.indexOf('}', i)
        assert.ok(end > i, `unbalanced braces after selector: ${selector.slice(0, 60)}`)
        rules.push({ selector, body: stripped.slice(i + 1, end) })
      }
      depth++
    } else if (ch === '}') {
      depth--
      start = i + 1
    }
  }
  return rules
}

/**
 * 取出所有命中「输入框卡片」的规则。
 * @param {string} css
 */
function composerCardRules(css) {
  return parseRules(css).filter((rule) => rule.selector.includes('[data-composer-card]'))
}

test('e2e: 输入框卡片的宽度上限交还原生 token，不再写死 100%', () => {
  const rules = composerCardRules(GUIDE_CSS)
  assert.ok(rules.length > 0, '必须存在约束输入框卡片的规则')

  for (const rule of rules) {
    const maxWidth = rule.body
      .split(';')
      .map((line) => line.trim())
      .find((line) => line.split(':')[0]?.trim() === 'max-width')
    if (!maxWidth) continue
    const value = maxWidth.slice(maxWidth.indexOf(':') + 1).trim()
    assert.notEqual(
      value.replace(/\s*!important$/, '').trim(),
      '100%',
      `max-width:100% 会把原生上限整条压掉，输入框将随窗口无限变宽（实测宽列下 1406px）：${rule.selector.slice(0, 80)}`,
    )
  }
})

test('e2e: 同时约束输入框的规则统一使用原生上限并居中', () => {
  const rules = composerCardRules(GUIDE_CSS)
  const withCap = rules.filter((rule) => rule.body.includes(NATIVE_CAP_TOKEN))
  assert.ok(withCap.length > 0, '至少一条卡片规则使用原生上限 token')

  for (const rule of withCap) {
    assert.match(rule.body, /max-width:var\(--dsh-composer-card-max-width[^)]*\)!important/, '原生上限必须保持 !important，否则会被其它声明压掉')
    assert.match(rule.body, /margin-inline:auto!important/, '居中同样交还原生，写 0 会让卡片贴左')
  }
})

test('e2e: 起始页 + 紧凑密度态下，卡片宽度受原生上限约束（夹具验证）', () => {
  const doc = new JSDOM(`<!doctype html><html data-omnimux-split-compact><body>
    <div class="dshDesktopFrame">
      <main class="dshDesktopConversationSurface">
        <div data-conversation-scroll></div>
        <div data-omnimux-starter-host>
          <div class="Q7WfXG_card" data-composer-card></div>
        </div>
      </main>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' }).window.document

  const card = doc.querySelector('[data-composer-card]')
  const hits = []
  for (const rule of composerCardRules(GUIDE_CSS)) {
    for (const part of rule.selector.split(',')) {
      let matched = false
      try { matched = card.matches(part.trim()) } catch { matched = false }
      if (matched) hits.push(rule.body)
    }
  }
  assert.ok(hits.length > 0, '紧凑态下卡片必须命中约束规则')
  const caps = hits.filter((body) => body.includes('max-width'))
  assert.ok(caps.length > 0, '命中的规则必须真的声明宽度上限')
  for (const body of caps) {
    assert.doesNotMatch(body, /max-width:100%!important/, '命中规则不得把上限写成 100%')
  }
})

test('e2e: 源码里不再遗留把卡片上限写成 100% 的声明', () => {
  const offenders = STYLES_SOURCE
    .split('\n')
    .filter((line) => /max-width\s*:\s*100%\s*!important/.test(line))
  // 允许其它元素（如内容区）存在该声明，但卡片选择器组里不允许
  const cardBlocks = composerCardRules(GUIDE_CSS)
  const cardHasHundred = cardBlocks.some((rule) => /max-width\s*:\s*100%\s*!important/.test(rule.body))
  assert.equal(cardHasHundred, false, '卡片规则组内不得再有 max-width:100%!important')
  assert.ok(offenders.length >= 0)
})
