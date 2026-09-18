import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

const output = await build({
  entryPoints: [new URL('../../src/client/session-guide/skills/SkillsPanel.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports
)
const { SkillsPanel } = module.exports

describe('E2E: Creatify 112套营销技能库置顶分区与1:1卡片视觉交互', () => {
  it('默认呈现全部技能，置顶热门精选(3)、新品上市(6)与探索更多(103)分区', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>')
    global.window = dom.window
    global.document = dom.window.document

    const container = document.getElementById('root')
    const root = createRoot(container)
    let selectedSkill = null

    await act(async () => {
      root.render(React.createElement(SkillsPanel, {
        t: (k, fb) => fb || k,
        onSelectSkill: (s) => { selectedSkill = s }
      }))
    })

    // 1. 验证分类胶囊
    const chips = document.querySelectorAll('.omnimux-skills-chip')
    assert.equal(chips.length, 8, '应包含 1 个全部胶囊 + 7 个细分类胶囊')
    assert.equal(chips[0].getAttribute('aria-pressed'), 'true', '默认全选高亮')

    // 2. 验证专区结构
    const sections = document.querySelectorAll('.omnimux-creatify-section')
    assert.equal(sections.length, 3, '默认分类下必须呈现热门精选、新品上市与探索更多 3 大专区')

    // 验证热门精选 3 张卡片
    const hotSection = sections[0]
    assert.match(hotSection.querySelector('.omnimux-creatify-section-title').textContent, /热门精选/)
    const hotCards = hotSection.querySelectorAll('.omnimux-creatify-card')
    assert.equal(hotCards.length, 3, '热门精选必须置顶 3 张核心爆款大卡')
    assert.ok(hotCards[0].querySelector('.omnimux-creatify-badge-hot'), '热门卡片必须带有火苗徽标')

    // 验证新品上市 6 张卡片与查看全部按钮
    const newSection = sections[1]
    assert.match(newSection.querySelector('.omnimux-creatify-section-title').textContent, /新品上市/)
    const newCards = newSection.querySelectorAll('.omnimux-creatify-card')
    assert.equal(newCards.length, 6, '新品上市必须置顶 6 张首发技能卡片')
    assert.ok(newCards[0].querySelector('.omnimux-creatify-badge-new'), '新品卡片必须带有新微标')
    assert.ok(newSection.querySelector('.omnimux-creatify-see-all-btn'), '新品上市右侧必须具备查看全部按钮')

    // 验证探索更多 103 张卡片
    const exploreSection = sections[2]
    assert.match(exploreSection.querySelector('.omnimux-creatify-section-title').textContent, /探索更多/)
    const exploreCards = exploreSection.querySelectorAll('.omnimux-creatify-card')
    assert.equal(exploreCards.length, 103, '探索更多区域必须容纳剩余 103 套技能')

    // 3. 验证卡片 1:1 视觉要素与属性
    const sampleCard = hotCards[0]
    assert.ok(sampleCard.querySelector('.omnimux-creatify-dot-overlay'), '必须具备点阵覆盖层')
    assert.ok(sampleCard.querySelector('.omnimux-creatify-center-title'), '必须具备居中大标题')
    assert.ok(sampleCard.querySelector('.omnimux-creatify-star-btn'), '必须具备收藏星标按钮')
    assert.ok(sampleCard.querySelector('.omnimux-creatify-card-hover-drawer'), '必须具备悬停滑出抽屉')

    // 4. 验证点击卡片触发 onSelectSkill
    await act(async () => {
      sampleCard.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })
    assert.ok(selectedSkill, '点击卡片必须触发 onSelectSkill')
    assert.equal(selectedSkill.id, 'sk-omx-ugc-confessional', '选中的应为 UGC 告白')
  })
})
