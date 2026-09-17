/**
 * E2E: 探索模板 (Explore templates) 首页组件全流程端到端测试
 *
 * 覆盖关键用户旅程：
 * 1. 探索模板 7 大分类胶囊渲染与高亮
 * 2. 货架行 (Section Shelf) 渲染、横滑与「查看全部 (View all) →」切分类联动
 * 3. 单分类全量大网格展开与一键退回全部分组
 * 4. 点击「一键复刻」装配提示词与自适应插槽回传
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

  it('7 大分类胶囊完整渲染且包含软件应用 (Apps & Software) 与标红 NEW 徽标', async () => {
    act(() => {
      reactRoot.render(React.createElement(ExploreTemplatesSection))
    })

    const pills = rootContainer.querySelectorAll('.omnimux-explore-pill-btn')
    assert.equal(pills.length, 8, '应包含全部货架与 7 大核心分类共 8 个胶囊')

    const appsPill = rootContainer.querySelector('[data-category-slug="apps-software"]')
    assert.ok(appsPill, '必须存在软件应用分类胶囊')
    assert.ok(appsPill.textContent.includes('软件应用'))
    assert.ok(appsPill.textContent.includes('NEW'), '软件应用分类必须带有 NEW 徽标')
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

    // 4. 点击「返回全部货架」恢复视图
    const backBtn = gridWrap.querySelector('.omnimux-tpl-btn-back')
    assert.ok(backBtn, '大网格顶部必须提供返回全部货架按钮')

    act(() => {
      backBtn.click()
    })

    assert.ok(rootContainer.querySelector('.omnimux-explore-shelves-view'), '必须恢复多行货架视图')
  })

  it('点击卡片「一键复刻」成功触发装配回调，回传分镜提示词与插槽类型', async () => {
    let receivedPayload = null

    act(() => {
      reactRoot.render(
        React.createElement(ExploreTemplatesSection, {
          onApplyTemplate: (payload) => {
            receivedPayload = payload
          },
        })
      )
    })

    const firstRecreateBtn = rootContainer.querySelector('.omnimux-tpl-btn-recreate')
    assert.ok(firstRecreateBtn, '卡片上必须包含一键复刻按钮')

    act(() => {
      firstRecreateBtn.click()
    })

    assert.ok(receivedPayload, '必须成功触发 onApplyTemplate 回调')
    assert.ok(receivedPayload.prompt, '回传必须包含有效的分镜提示词')
    assert.ok(receivedPayload.title, '回传必须包含模板标题')
    assert.ok(receivedPayload.slotType, '回传必须明确插槽类型 (software 或 product)')
  })
})
