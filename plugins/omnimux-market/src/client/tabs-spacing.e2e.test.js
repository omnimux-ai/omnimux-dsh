import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'

const source = readFileSync(new URL('./css.js', import.meta.url), 'utf8')
const match = /const CSS = `([\s\S]*?)`;/.exec(source)
assert.ok(match, '市场样式源必须包含 CSS 模板')

test('技能市场真实页面上下文保持全圆角胶囊与 14~16px 双层间距', () => {
  const result = runStyleDomProbe({
    name: 'market-tabs',
    styles: match[1],
    html: `
      <div class="sh-plaza-body">
        <div class="sh-mkt" style="width:1200px">
          <div class="nav-bar"><div class="nav-tabs"><button class="nav-tab active" style="height:36px">Skill</button></div></div>
          <div class="category-bar"><button class="cat-btn active">全部</button><button class="cat-btn">选品</button></div>
        </div>
      </div>`,
    measure: () => {
      const root = document.querySelector('.sh-plaza-body .sh-mkt')
      const tab = document.querySelector('.nav-tab.active')
      const chip = document.querySelector('.cat-btn.active')
      const nav = document.querySelector('.nav-bar')
      return {
        rootGap: getComputedStyle(root).rowGap,
        borderRadius: getComputedStyle(chip).borderRadius,
        height: getComputedStyle(chip).height,
        navMarginBottom: getComputedStyle(nav).marginBottom,
        gap: Math.round(chip.getBoundingClientRect().top - tab.getBoundingClientRect().bottom),
      }
    },
  })
  assert.equal(result.rootGap, '0px')
  assert.equal(result.borderRadius, '999px')
  assert.equal(result.height, '28px')
  assert.equal(result.navMarginBottom, '14px')
  assert.ok(result.gap >= 14 && result.gap <= 16, `两层标签净空 ${result.gap}px 越界`)
})
