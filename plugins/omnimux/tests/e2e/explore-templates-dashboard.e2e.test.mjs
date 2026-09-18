/**
 * E2E: 探索模板 (Explore templates) 首页组件全流程端到端测试
 *
 * 覆盖关键用户旅程：
 * 1. 10 大分类胶囊渲染与顺序严格对齐 (全部 -> TikTok热门 -> Skills -> 软件应用...)
 * 2. 货架行 (Section Shelf) 渲染、横滑与「查看全部」切分类联动
 * 3. 单分类全量大网格展开与一键退回全部分组
 * 4. 三大复刻模式（模板复刻、TikTok 热门复刻、Skill 复刻）回调与数据契约
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

const SECTION_ENTRY = new URL(
  '../../src/client/session-guide/templates/ExploreTemplatesSection.jsx',
  import.meta.url
).pathname

async function compileAndLoadComponent() {
  const output = await build({
    entryPoints: [SECTION_ENTRY],
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
  return compiled.exports.ExploreTemplatesSection
}

describe('E2E: 探索模板 (Explore templates) 首页交互与全流程', () => {
  let dom
  let rootContainer
  let reactRoot
  let ExploreTemplatesSection

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'http://127.0.0.1:43128/',
    })
    globalThis.window = dom.window
    globalThis.document = dom.window.document

    rootContainer = dom.window.document.getElementById('root')
    reactRoot = createRoot(rootContainer)
    ExploreTemplatesSection = await compileAndLoadComponent()
  })

  afterEach(() => {
    act(() => {
      reactRoot.unmount()
    })
    delete globalThis.window
    delete globalThis.document
  })

  it('10 大分类胶囊完整渲染，且严格对齐全部 -> TikTok热门 -> Skills -> 软件应用顺序', async () => {
    act(() => {
      reactRoot.render(React.createElement(ExploreTemplatesSection))
    })

    const pills = rootContainer.querySelectorAll('.omnimux-explore-pill-btn')
    assert.equal(pills.length, 10, '应包含全部货架与 9 个细分分类共 10 个胶囊')

    const slugs = Array.from(pills).map((p) => p.getAttribute('data-category-slug'))
    assert.equal(slugs[0], 'all')
    assert.equal(slugs[1], 'tiktok', '第 2 项必须为 TikTok 热门')
    assert.equal(slugs[2], 'skills', '第 3 项必须为 Skills 技能库')
    assert.equal(slugs[3], 'apps-software', '第 4 项必须为软件应用')

    const appsPill = rootContainer.querySelector('[data-category-slug="apps-software"]')
    assert.ok(appsPill, '必须存在软件应用分类胶囊')
    assert.ok(appsPill.textContent.includes('软件应用'))
    assert.equal(appsPill.querySelector('.omnimux-explore-badge-new'), null, '软件应用分类胶囊右侧不得带有任何角标或图标')
  })

  it('默认呈现多行货架视图，点击「查看全部」无缝切分类并展开全量大网格', async () => {
    act(() => {
      reactRoot.render(React.createElement(ExploreTemplatesSection))
    })

    // 1. 默认全部状态：货架容器可见，网格容器不存在
    const shelvesView = rootContainer.querySelector('.omnimux-explore-shelves-view')
    assert.ok(shelvesView, '默认必须展现多行货架视图')
    assert.equal(rootContainer.querySelector('.omnimux-explore-grid-view-wrap'), null)

    // 2. 点击「软件应用」货架的查看全部按钮
    const appShelf = rootContainer.querySelector('[data-shelf-slug="apps-software"]')
    assert.ok(appShelf, '软件应用货架行必须存在')

    const viewAllBtn = appShelf.querySelector('.omnimux-shelf-btn-view-all')
    assert.ok(viewAllBtn, '货架行必须包含查看全部按钮')

    act(() => {
      viewAllBtn.click()
    })

    // 3. 展开为全量大网格，货架行隐去
    assert.equal(rootContainer.querySelector('.omnimux-explore-shelves-view'), null)
    const gridWrap = rootContainer.querySelector('.omnimux-explore-grid-view-wrap')
    assert.ok(gridWrap, '必须展开单分类全量网格')

    // 验证上方胶囊已同步切换为 active
    const activePill = rootContainer.querySelector('.omnimux-explore-pill-btn.active')
    assert.equal(activePill?.getAttribute('data-category-slug'), 'apps-software')

    // 4. 点击「返回全部」恢复视图
    const backBtn = gridWrap.querySelector('.omnimux-tpl-btn-back')
    assert.ok(backBtn, '大网格顶部必须提供返回全部按钮')

    act(() => {
      backBtn.click()
    })

    assert.ok(rootContainer.querySelector('.omnimux-explore-shelves-view'), '必须恢复多行货架视图')
  })

  it('三大复刻模式（模板、TikTok热门、Skill）分别准确触发各自业务回调', async () => {
    let templatePayload = null
    let trendingPayload = null
    let skillPayload = null

    act(() => {
      reactRoot.render(
        React.createElement(ExploreTemplatesSection, {
          onApplyTemplate: (payload) => {
            templatePayload = payload
          },
          onApplyTrending: (payload) => {
            trendingPayload = payload
          },
          onApplySkill: (payload) => {
            skillPayload = payload
          },
        })
      )
    })

    // 1. 测试 TikTok 热门卡片复刻
    const tiktokShelf = rootContainer.querySelector('[data-shelf-slug="tiktok"]')
    assert.ok(tiktokShelf, '必须存在 TikTok 热门货架')
    const tiktokBtn = tiktokShelf.querySelector('.omnimux-trending-recreate-btn')
    assert.ok(tiktokBtn, 'TikTok 卡片必须具备深灰毛玻璃复刻按键')

    act(() => {
      tiktokBtn.click()
    })
    assert.ok(trendingPayload, '点击 TikTok 卡片复刻必须触发 onApplyTrending')
    assert.ok(trendingPayload.id, '必须回传灵感 ID')

    // 2. 测试 Skills 技能卡片复刻/使用
    const skillShelf = rootContainer.querySelector('[data-shelf-slug="skills"]')
    assert.ok(skillShelf, '必须存在 Skills 货架')
    const skillBtn = skillShelf.querySelector('.omnimux-trending-recreate-btn')
    assert.ok(skillBtn, 'Skill 卡片必须具备深灰毛玻璃操作按键')
    assert.equal(skillBtn.textContent.trim(), '使用', 'Skill 卡片操作按钮文案必须为「使用」')

    act(() => {
      skillBtn.click()
    })
    assert.ok(skillPayload, '点击 Skill 卡片必须触发 onApplySkill')
    assert.ok(skillPayload.id || skillPayload.skill, '必须回传技能标识')

    // 3. 测试常规模板卡片复刻
    const appShelf = rootContainer.querySelector('[data-shelf-slug="apps-software"]')
    const tplBtn = appShelf.querySelector('.omnimux-trending-recreate-btn')
    assert.ok(tplBtn, '模板卡片必须具备深灰毛玻璃复刻按键')

    act(() => {
      tplBtn.click()
    })
    assert.ok(templatePayload, '点击模板复刻必须触发 onApplyTemplate')
    assert.ok(templatePayload.prompt, '回传必须包含提示词')
  })

  it('点击查看全部进入全量网格：首批渲染 16 项，触底追加加载直至全部展示', async () => {
    act(() => {
      reactRoot.render(React.createElement(ExploreTemplatesSection))
    })

    // 点击进入「视效大片」分类（包含 139 套全量模板）
    const vfxPill = rootContainer.querySelector('[data-category-slug="cinematic-vfx"]')
    assert.ok(vfxPill, '必须存在视效大片分类胶囊')

    act(() => {
      vfxPill.click()
    })

    const grid = rootContainer.querySelector('.omnimux-tpl-full-grid')
    assert.ok(grid, '必须展开大网格视图')

    // 验证首批只切片渲染 16 项（避免首屏 139 个卡片 DOM 并发卡死）
    const cardsFirstBatch = grid.querySelectorAll('.omnimux-tpl-card')
    assert.equal(cardsFirstBatch.length, 16, '首批切片必须精准渲染 16 张卡片')

    // 验证底部加载更多按键存在并模拟点击追加
    const loadMoreBtn = rootContainer.querySelector('.omnimux-tpl-btn-loadmore')
    assert.ok(loadMoreBtn, '项目未全部加载时必须存在加载更多按键')

    act(() => {
      loadMoreBtn.click()
    })

    const cardsSecondBatch = grid.querySelectorAll('.omnimux-tpl-card')
    assert.equal(cardsSecondBatch.length, 32, '追加后必须平滑扩充至 32 张卡片')
  })
})
