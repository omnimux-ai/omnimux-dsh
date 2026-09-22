/**
 * E2E: 新会话封面卡悬停时整卡变暗
 *
 * 覆盖关键用户旅程：新会话页探索模板货架里的封面卡（黄金开场等竖版短视频卡、
 * 王牌应用卡），鼠标移上去后整张卡片盖一层半透明黑，标题与说明保持纯白高亮，
 * 文字不再自带阴影；技能卡是浅色极光底，不套这层。
 *
 * 断言分两层，缺一不可：
 * 1. 真实渲染：esbuild 打包 TemplateCardItem → jsdom → React，核对真实 DOM 结构
 *    （封面层 / 底部文字层 / 悬停操作层 / 技能卡标记）。
 * 2. 真实 CSS 契约：自解析 GUIDE_CSS，不用 jsdom 的 CSSOM（后者遇到 :not() 与
 *    ::after 会整段丢规则），按选择器分别还原「平时」与「悬停」两个状态下的胜出声明。
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

const CARD_ENTRY = new URL(
  '../../src/client/session-guide/templates/TemplateCardItem.jsx',
  import.meta.url
).pathname

function extractTemplate(source, anchor) {
  const start = source.indexOf(anchor)
  assert.ok(start >= 0, `生产源码中未找到样式常量锚点：${anchor}`)
  const bodyStart = start + anchor.length
  const end = source.indexOf('\n`', bodyStart)
  assert.ok(end > bodyStart, `生产源码中的样式模板字面量未闭合：${anchor}`)
  return source.slice(bodyStart, end)
}

const stylesSource = readFileSync(
  new URL('../../src/client/session-guide/styles.js', import.meta.url),
  'utf8'
)
const GUIDE_CSS = extractTemplate(stylesSource, 'export const GUIDE_CSS = `').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
)

function parseRules(css) {
  const rules = []
  const stack = []
  let buf = ''
  let order = 0
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i]
    if (ch === '{') {
      stack.push({ prelude: buf.trim(), decls: '' })
      buf = ''
    } else if (ch === '}') {
      const frame = stack.pop()
      if (!frame) continue
      if (!frame.prelude.startsWith('@') && frame.prelude) {
        rules.push({
          selector: frame.prelude,
          decls: frame.decls,
          order: order++,
        })
      }
    } else if (stack.length) {
      stack[stack.length - 1].decls += ch
    } else {
      buf += ch
    }
  }
  return rules
}

function declarationsOf(decls) {
  const out = new Map()
  for (const chunk of decls.split(';')) {
    const at = chunk.indexOf(':')
    if (at < 0) continue
    out.set(chunk.slice(0, at).trim(), chunk.slice(at + 1).trim())
  }
  return out
}

function selectorBranches(selector) {
  return selector
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

const CARD_IDENTITY = /^\.omnimux-tpl-card(?::not\(\.is-skill-card\))?$/
const CARD_HOVER_IDENTITY = /^\.omnimux-tpl-card(?::not\(\.is-skill-card\))?:hover$/
const CARD_FOCUS_IDENTITY = /^\.omnimux-tpl-card(?::not\(\.is-skill-card\))?:focus-within$/

function findCardRootAfterRules(state) {
  const out = []
  for (const rule of parseRules(GUIDE_CSS)) {
    for (const branch of selectorBranches(rule.selector)) {
      if (!branch.endsWith('::after')) continue
      const head = branch.slice(0, -'::after'.length).trim()
      const matches =
        (state === 'base' && CARD_IDENTITY.test(head)) ||
        (state === 'hover' && CARD_HOVER_IDENTITY.test(head)) ||
        (state === 'focus' && CARD_FOCUS_IDENTITY.test(head))
      if (matches) out.push(rule)
    }
  }
  return out
}

function findCardHoverBaselineRules() {
  return parseRules(GUIDE_CSS).filter((rule) =>
    selectorBranches(rule.selector).some(
      (branch) => branch === '.omnimux-tpl-card:hover' || branch === '.omnimux-tpl-card:focus-within'
    )
  )
}

function findHoveredTextRules(state, descendantClass) {
  const matcher = state === 'hover' ? CARD_HOVER_IDENTITY : CARD_FOCUS_IDENTITY
  const out = []
  for (const rule of parseRules(GUIDE_CSS)) {
    for (const branch of selectorBranches(rule.selector)) {
      const tokens = branch.split(/\s+/)
      if (tokens.length < 2) continue
      if (tokens[tokens.length - 1] !== descendantClass) continue
      if (matcher.test(tokens[0])) out.push(rule)
    }
  }
  return out
}

function findBaseRule(descendantClass) {
  return parseRules(GUIDE_CSS).find((rule) =>
    selectorBranches(rule.selector).some((branch) => branch === descendantClass)
  )
}

function lastDeclared(rules, property) {
  let value
  for (const rule of rules || []) {
    if (!rule) continue
    const decls = declarationsOf(rule.decls || '')
    if (decls.has(property)) value = decls.get(property)
  }
  return value
}

async function compileCard() {
  const output = await build({
    entryPoints: [CARD_ENTRY],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react', 'react-dom'],
  })
  const compiled = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(
    createRequire(import.meta.url),
    compiled,
    compiled.exports
  )
  return compiled.exports.TemplateCardItem
}

const NORMAL_CARD = {
  id: 'tpl-hook-1',
  type: 'template',
  name: '巨型商品撞屏与荒诞追逐',
  titleZh: '巨型商品撞屏与荒诞追逐',
  promptZh: '专治前3秒滑走：巨型商品撞屏、路人惊呼追逐与戏剧性反差',
  cover: 'https://example.com/cover.webp',
  thumbnailUrl: 'https://example.com/cover.webp',
}

const SKILL_CARD = {
  id: 'sk-hook-1',
  type: 'skill',
  name: '黄金Hook提取',
  titleZh: '黄金Hook提取',
}

describe('E2E: 新会话封面卡悬停整卡变暗', () => {
  let dom
  let container
  let root
  let TemplateCardItem

  before(async () => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'http://127.0.0.1:43128/',
    })
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    container = dom.window.document.getElementById('root')
    root = createRoot(container)
    TemplateCardItem = await compileCard()
  })

  after(() => {
    if (root) act(() => root.unmount())
    delete globalThis.window
    delete globalThis.document
  })

  it('封面卡渲染出封面层、文字层与悬停操作层，技能卡带专属标记', () => {
    act(() => {
      root.render(
        React.createElement(
          'div',
          null,
          React.createElement(TemplateCardItem, { template: NORMAL_CARD, locale: 'zh' }),
          React.createElement(TemplateCardItem, { template: SKILL_CARD, locale: 'zh' })
        )
      )
    })

    const cards = container.querySelectorAll('.omnimux-tpl-card')
    assert.equal(cards.length, 2, '必须渲染普通封面卡与技能卡各一张')

    const normal = container.querySelector('[data-template-id="tpl-hook-1"]')
    assert.ok(normal, '普通封面卡必须带模板标识')
    assert.ok(!normal.classList.contains('is-skill-card'), '普通封面卡不得带技能卡标记')
    assert.ok(normal.querySelector('.omnimux-tpl-media-box'), '普通封面卡必须有封面层')
    assert.ok(normal.querySelector('.omnimux-tpl-bottom-bar'), '普通封面卡必须有底部文字层')
    assert.ok(normal.querySelector('.omnimux-tpl-hover-action'), '普通封面卡必须有悬停操作层')
    assert.match(normal.querySelector('.omnimux-tpl-title').textContent, /巨型商品撞屏与荒诞追逐/)

    const skill = container.querySelector('[data-template-id="sk-hook-1"]')
    assert.ok(skill?.classList.contains('is-skill-card'), '技能卡必须带专属标记，以排除压暗层')
  })

  it('悬停时整张卡片铺一层半透明黑，平时完全透明', () => {
    const base = findCardRootAfterRules('base')
    const hover = findCardRootAfterRules('hover')
    const focus = findCardRootAfterRules('focus')

    assert.ok(base.length > 0, '必须存在卡片暗层的基础规则')
    assert.ok(hover.length > 0, '必须存在卡片暗层的悬停规则')
    assert.ok(focus.length > 0, '必须存在卡片暗层的键盘聚焦规则')

    assert.equal(lastDeclared(base, 'opacity'), '0', '平时暗层必须完全透明')
    assert.equal(lastDeclared(hover, 'opacity'), '1', '悬停时暗层必须完全显现')
    assert.equal(lastDeclared(focus, 'opacity'), '1', '聚焦时暗层必须完全显现')

    const background = lastDeclared(base, 'background')
    assert.ok(background, '暗层必须声明背景色')
    assert.match(background, /var\(--omnimux-tpl-dim\)/, '暗层底色必须取卡片自身的变量')

    const dimDefinition = parseRules(GUIDE_CSS).find((rule) => {
      const hasDim = declarationsOf(rule.decls).has('--omnimux-tpl-dim')
      const onCard = selectorBranches(rule.selector).some((branch) => CARD_IDENTITY.test(branch))
      return hasDim && onCard
    })
    assert.ok(dimDefinition, '必须在卡片自身上定义暗层颜色变量')
    const dimValue = declarationsOf(dimDefinition.decls).get('--omnimux-tpl-dim')
    assert.ok(dimValue, '卡片必须定义 --omnimux-tpl-dim')
    assert.match(dimValue, /color-mix\(in srgb/, '暗层颜色必须是显式混色')
    assert.match(dimValue, /transparent/, '暗层颜色必须带透明度')
    assert.match(dimValue, /--dsw-static-neutral-1000/, '暗层必须是黑色系，不得是亮色')

    assert.ok(lastDeclared(base, 'content'), '暗层必须声明 content，伪元素才能生成')
    assert.equal(lastDeclared(base, 'position'), 'absolute', '暗层必须绝对定位，inset:0 才有效')
    assert.equal(lastDeclared(base, 'inset'), '0', '暗层必须铺满整张卡片')
    assert.equal(lastDeclared(base, 'pointer-events'), 'none', '暗层不得拦截点击')
  })

  it('文字压在暗层之上，悬停时纯白且不带阴影', () => {
    const dimZ = Number(lastDeclared(findCardRootAfterRules('base'), 'z-index'))
    const barZ = Number(lastDeclared([findBaseRule('.omnimux-tpl-bottom-bar')], 'z-index'))
    const actionZ = Number(lastDeclared([findBaseRule('.omnimux-tpl-hover-action')], 'z-index'))

    assert.ok(Number.isFinite(dimZ), '暗层必须有层级')
    assert.ok(barZ > dimZ, `底部文字层（${barZ}）必须压在暗层（${dimZ}）之上`)
    assert.ok(actionZ > dimZ, `悬停操作层（${actionZ}）必须压在暗层（${dimZ}）之上`)

    const titleBase = findBaseRule('.omnimux-tpl-title')
    assert.ok(titleBase, '必须存在标题基础规则')
    assert.ok(
      !declarationsOf(titleBase.decls).has('text-shadow'),
      '标题默认样式不得再带文字阴影'
    )

    for (const klass of ['.omnimux-tpl-title', '.omnimux-tpl-prompt-preview', '.omnimux-tpl-metric-value']) {
      for (const state of ['hover', 'focus']) {
        const rules = findHoveredTextRules(state, klass)
        assert.ok(rules.length > 0, `${klass} 必须有${state === 'hover' ? '悬停' : '聚焦'}态规则`)
        assert.equal(
          lastDeclared(rules, 'text-shadow'),
          'none',
          `${klass} 在 ${state} 态必须显式去掉文字阴影`
        )
        assert.equal(
          lastDeclared(rules, 'color'),
          'var(--dsw-static-neutral-00)',
          `${klass} 在 ${state} 态必须保持纯白`
        )
      }
    }
  })

  it('技能卡不被压暗，且卡片悬停时不再位移离开光标', () => {
    for (const state of ['base', 'hover', 'focus']) {
      for (const rule of findCardRootAfterRules(state)) {
        assert.match(
          rule.selector,
          /:not\(\.is-skill-card\)/,
          '暗层规则必须显式排除技能卡，避免盖住浅色极光底'
        )
      }
    }

    for (const rule of findCardHoverBaselineRules()) {
      const decls = declarationsOf(rule.decls)
      assert.ok(
        !/translateY\(-/.test(decls.get('transform') || ''),
        '卡片自身悬停不得整体上移，否则暗层会在光标下消失'
      )
    }
  })
})
