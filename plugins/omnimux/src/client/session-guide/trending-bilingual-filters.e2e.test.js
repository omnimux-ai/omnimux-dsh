import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { guideZh, guideEn } from './catalog.js'

const require = createRequire(import.meta.url)

async function loadComponent(entry) {
  const output = await build({
    entryPoints: [new URL(entry, import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react', 'react-dom'],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, module, module.exports)
  return module.exports
}

function withDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
  })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return {
    dom,
    restore() {
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
      dom.window.close()
    },
  }
}

describe('e2e: 爆款对标地区与类目筛选栏代码级中英文双语适配端到端验证', () => {
  const sampleRegionOptions = [
    { value: '', labelKey: 'trending.region.all' },
    { value: 'CA', label: 'CA' },
    { value: 'DE', label: 'DE' },
    { value: 'GB', label: 'GB' },
    { value: 'TH', label: 'TH' },
    { value: 'US', label: 'US' },
  ]

  const sampleIndustryOptions = [
    { value: '', labelKey: 'trending.industry.all' },
    { value: 'digital', label: 'digital' },
    { value: 'Education & Knowledge', label: 'Education & Knowledge' },
    { value: 'Fitness', label: 'Fitness' },
    { value: '电脑和办公设备', label: '电脑和办公设备' },
    { value: '家居装修', label: '家居装修' },
  ]

  it('中文模式下：触发器显示纯实体名词，下拉首项收敛为「全部」，二字码与混杂类目转译为专业标准中文', async () => {
    const { TrendingFilterBar } = await loadComponent('./trending/TrendingFilterBar.jsx')
    const env = withDom()
    const host = document.getElementById('root')
    const root = createRoot(host)

    const zhT = (key) => guideZh[key] || key
    let currentFilters = { region: '', industry: '' }

    await act(async () => {
      root.render(
        React.createElement(TrendingFilterBar, {
          filters: currentFilters,
          t: zhT,
          dimensions: { region: true, industry: true },
          regionOptions: sampleRegionOptions,
          industryOptions: sampleIndustryOptions,
          onChange: (patch) => {
            currentFilters = { ...currentFilters, ...patch }
          },
        })
      )
    })

    // 1. 验证触发按钮在未选择状态下展示纯实体名词
    const triggers = host.querySelectorAll('.omnimux-trending-select-trigger')
    assert.ok(triggers.length >= 2)
    assert.equal(triggers[0].textContent.trim(), '地区', '地区触发器未选时显示纯实体名词「地区」')
    assert.equal(triggers[1].textContent.trim(), '类目', '类目触发器未选时显示纯实体名词「类目」')

    // 2. 点击展开地区下拉菜单
    await act(async () => {
      triggers[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    const regionMenuOptions = Array.from(host.querySelectorAll('.omnimux-trending-select-option'))
    const regionLabels = regionMenuOptions.map((el) => el.textContent.trim())

    // 验证地区首项收敛为「全部」，其余选项转译为中文国名
    assert.equal(regionLabels[0], '全部', '菜单首项去除「全部地区」冗余定语，收敛为「全部」')
    assert.ok(regionLabels.includes('加拿大'))
    assert.ok(regionLabels.includes('德国'))
    assert.ok(regionLabels.includes('英国'))
    assert.ok(regionLabels.includes('泰国'))
    assert.ok(regionLabels.includes('美国'))
    assert.ok(!regionLabels.includes('US'), '严禁裸露英文二字代码 US')

    // 3. 点击选择「美国」，验证触发器展示选中国名，且回调传参保持原始二字码 'US'
    const usOption = regionMenuOptions.find((el) => el.getAttribute('data-value') === 'US')
    assert.ok(usOption, '选项必须携带稳定的 data-value="US"')
    await act(async () => {
      usOption.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(currentFilters.region, 'US', '网络请求与服务端过滤必须接收原始代码 US，保障 100% 兼容')

    // 4. 点击展开类目下拉菜单
    await act(async () => {
      triggers[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    const industryMenuOptions = Array.from(host.querySelectorAll('.omnimux-trending-select-option'))
    const industryLabels = industryMenuOptions.map((el) => el.textContent.trim())

    // 验证类目首项收敛为「全部」，中英文混杂原始类目统一归一为规范中文
    assert.equal(industryLabels[0], '全部', '类目菜单首项去除「全部类目」冗余定语，收敛为「全部」')
    assert.ok(industryLabels.includes('数码家电'), '英文 digital 转译为数码家电')
    assert.ok(industryLabels.includes('教育培训'), '英文 Education & Knowledge 转译为教育培训')
    assert.ok(industryLabels.includes('运动健身'), '英文 Fitness 转译为运动健身')
    assert.ok(industryLabels.includes('电脑办公'), '电脑和办公设备 规整为 电脑办公')
    assert.ok(industryLabels.includes('家居生活'), '家居装修 规整为 家居生活')
    assert.ok(!industryLabels.includes('digital'), '严禁在中文菜单出现未翻译英文')

    // 清理
    await act(async () => root.unmount())
    env.restore()
  })

  it('英文模式下：触发器显示纯实体名词，下拉首项收敛为「All」，呈现标准商业英文术语', async () => {
    const { TrendingFilterBar } = await loadComponent('./trending/TrendingFilterBar.jsx')
    const env = withDom()
    const host = document.getElementById('root')
    const root = createRoot(host)

    const enT = (key) => guideEn[key] || key
    let currentFilters = { region: '', industry: '' }

    await act(async () => {
      root.render(
        React.createElement(TrendingFilterBar, {
          filters: currentFilters,
          t: enT,
          dimensions: { region: true, industry: true },
          regionOptions: sampleRegionOptions,
          industryOptions: sampleIndustryOptions,
          onChange: (patch) => {
            currentFilters = { ...currentFilters, ...patch }
          },
        })
      )
    })

    // 1. 验证触发按钮在未选择状态下展示英文纯实体名词
    const triggers = host.querySelectorAll('.omnimux-trending-select-trigger')
    assert.equal(triggers[0].textContent.trim(), 'Region', '英文未选时显示 Region')
    assert.equal(triggers[1].textContent.trim(), 'Category', '英文未选时显示 Category')

    // 2. 点击展开地区下拉菜单
    await act(async () => {
      triggers[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    const regionMenuOptions = Array.from(host.querySelectorAll('.omnimux-trending-select-option'))
    const regionLabels = regionMenuOptions.map((el) => el.textContent.trim())

    assert.equal(regionLabels[0], 'All', '首项收敛为 All')
    assert.ok(regionLabels.includes('Canada'))
    assert.ok(regionLabels.includes('Germany'))
    assert.ok(regionLabels.includes('United Kingdom'))
    assert.ok(regionLabels.includes('Thailand'))
    assert.ok(regionLabels.includes('United States'))

    // 3. 点击展开类目下拉菜单
    await act(async () => {
      triggers[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    const industryMenuOptions = Array.from(host.querySelectorAll('.omnimux-trending-select-option'))
    const industryLabels = industryMenuOptions.map((el) => el.textContent.trim())

    assert.equal(industryLabels[0], 'All', '首项收敛为 All')
    assert.ok(industryLabels.includes('Consumer Electronics'))
    assert.ok(industryLabels.includes('Education & Learning'))
    assert.ok(industryLabels.includes('Sports & Fitness'))
    assert.ok(industryLabels.includes('Computers & Office'))
    assert.ok(industryLabels.includes('Home & Living'))

    await act(async () => root.unmount())
    env.restore()
  })
})
