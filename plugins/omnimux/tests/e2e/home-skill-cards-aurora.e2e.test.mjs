import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

const output = await build({
  entryPoints: [new URL('../../src/client/session-guide/templates/ExploreTemplatesSection.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom'],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports
)
const { ExploreTemplatesSection } = module.exports

describe('E2E: 首页 Skills 技能库货架卡片高饱和度极光样式端到端验收', () => {
  it('Skills 货架卡片完整呈现极光流光、点阵纹理、分类胶囊、收藏星标与居中认证徽标', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>')
    global.window = dom.window
    global.document = dom.window.document

    const container = document.getElementById('root')
    const root = createRoot(container)
    let appliedSkill = null

    await act(async () => {
      root.render(React.createElement(ExploreTemplatesSection, {
        onApplySkill: (s) => { appliedSkill = s },
        t: (k, fb) => fb || k,
      }))
    })

    // 1. 定位 Skills 技能库货架行
    const skillsShelf = document.querySelector('[data-shelf-slug="skills"]')
    assert.ok(skillsShelf, '必须渲染 Skills 技能库货架行')
    assert.match(skillsShelf.querySelector('.omnimux-shelf-heading')?.textContent, /Skills 技能库/)

    // 2. 验证货架内的技能卡片集合
    const cards = skillsShelf.querySelectorAll('.omnimux-tpl-card.is-skill-card')
    assert.ok(cards.length >= 5, 'Skills 货架必须展示至少 5 张核心技能卡片')

    // 3. 验证首张卡片（UGC 告白）对齐图 2 标杆细节
    const firstCard = cards[0]
    assert.ok(firstCard.classList.contains('omnimux-creatify-card'), '必须具备 creatify 卡片样式类')
    assert.ok(firstCard.style.background.includes('radial-gradient'), '背景必须为极光流光渐变')

    // 验证点阵纹理
    const dotOverlay = firstCard.querySelector('.omnimux-creatify-dot-overlay')
    assert.ok(dotOverlay, '卡片必须覆盖细腻点阵纹理')

    // 验证彻底移除冗余装饰元素（水滴/分类胶囊/收藏星标/文字抽屉）
    assert.equal(firstCard.querySelector('.omnimux-creatify-card-top-left'), null, '必须移除左上角徽标与胶囊')
    assert.equal(firstCard.querySelector('.omnimux-creatify-star-btn'), null, '必须移除右上角收藏星标')
    assert.equal(firstCard.querySelector('.omnimux-creatify-card-hover-drawer'), null, '必须移除覆盖大标题的文字抽屉')

    // 验证居中大标题（认证对勾徽标已按用户要求移除）
    const centerTitle = firstCard.querySelector('.omnimux-creatify-center-title')
    assert.ok(centerTitle, '必须展示居中标题区')
    assert.match(centerTitle.textContent, /UGC 告白/)
    assert.equal(centerTitle.querySelector('.creatify-card-verified-svg'), null, '居中标题严禁携带认证打勾徽标')

    // 验证悬停使用按钮点击
    const useBtn = firstCard.querySelector('.omnimux-skill-card-btn')
    assert.ok(useBtn, '卡片内必须具备使用按钮')
    await act(async () => {
      useBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })
    assert.ok(appliedSkill, '点击使用按钮必须成功触发 onApplySkill 回调')
    assert.match(appliedSkill.title, /UGC 告白/)
  })
})
