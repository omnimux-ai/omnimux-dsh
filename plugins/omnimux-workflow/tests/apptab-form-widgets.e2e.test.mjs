/**
 * plugins/omnimux-workflow/tests/apptab-form-widgets.e2e.test.mjs
 *
 * E2E (jsdom real-DOM) tests for AppTab form widgets (Issue #2607).
 * Drives the real AppTab component inside JSDOM:
 * - Classic renovated apps (app-creatify-chasing-product) render real ratio-cards and custom dropdowns
 * - Aspect ratio clicking toggles .is-active and updates form state
 * - Select-single dropdown opening and option selection
 * - Segmented-tabs and multi-tags interaction and limit locking
 * - Library-picker picked card rendering and clearing
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'

const require = createRequire(import.meta.url)
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(here, '..')

// Read the renovated builtin-apps.json
const catalogApps = JSON.parse(
  fs.readFileSync(resolve(pluginRoot, '../omnimux-apps/catalog/builtin-apps.json'), 'utf8'),
)
const CHASING_PRODUCT_APP = catalogApps.find((a) => a.appId === 'app-creatify-chasing-product')
const PRODUCT_VIDEO_APP = catalogApps.find((a) => a.appId === 'app-builtin-product-video')

let AppTabComponent = null
let dom = null
let doc = null

async function loadAppTab() {
  if (AppTabComponent) return AppTabComponent

  const result = await build({
    stdin: {
      contents: `
        export { AppTab } from './src/client/projects/AppTab.jsx';
      `,
      resolveDir: pluginRoot,
      sourcefile: 'e2e-entry.js',
      loader: 'js',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    plugins: [
      {
        name: 'stub-externals',
        setup(b) {
          b.onResolve({ filter: /\.(css|less|scss)$/ }, () => ({
            path: 'stub-css',
            namespace: 'stub-css',
          }))
          b.onLoad({ filter: /.*/, namespace: 'stub-css' }, () => ({
            contents: 'module.exports = {};',
            loader: 'js',
          }))
        },
      },
    ],
    external: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      'dsh-ui-kit',
      '@deepseek-ai/dsh-client-ui-primitives',
    ],
  })

  const code = result.outputFiles[0].text
  const mod = { exports: {} }
  const fn = new Function('require', 'module', 'exports', code)
  fn(require, mod, mod.exports)
  AppTabComponent = mod.exports.AppTab
  return AppTabComponent
}

function initDom() {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  doc = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.MouseEvent = dom.window.MouseEvent
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
}

function fireClick(el) {
  act(() => {
    el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

test('E2E: 经典旧应用在工作区 AppTab 中打开，音色与比例生效为卡片和下拉 (Issue #2607)', async () => {
  initDom()
  const AppTab = await loadAppTab()

  const host = doc.createElement('div')
  doc.body.appendChild(host)
  const root = createRoot(host)

  act(() => {
    root.render(
      React.createElement(AppTab, {
        seed: {
          id: 'app_app-creatify-chasing-product',
          extra: { manifest: CHASING_PRODUCT_APP },
        },
      }),
    )
  })

  // 1. 验证视频比例字段不再是普通 input，而是标准比例卡片组 (.omx-apptab-ratio-grid)
  const ratioGrid = host.querySelector('.omx-apptab-ratio-grid')
  assert.ok(ratioGrid, '比例字段必须渲染为 .omx-apptab-ratio-grid 比例卡片组')

  const ratioCards = Array.from(ratioGrid.querySelectorAll('.omx-apptab-ratio-card'))
  assert.equal(ratioCards.length, 3, '必须渲染 9:16、16:9、1:1 三个比例卡片')

  // 默认值为 9:16，处于 is-active 状态
  const defaultActive = ratioCards.find((c) => c.classList.contains('is-active'))
  assert.ok(defaultActive, '必须有一个默认激活的比例卡片')
  assert.equal(defaultActive.textContent.trim(), '9:16', '默认激活的比例卡片为 9:16')

  // 点击 16:9 卡片
  const card16x9 = ratioCards.find((c) => c.textContent.trim().startsWith('16:9'))
  assert.ok(card16x9, '必须包含 16:9 比例卡片')
  fireClick(card16x9)

  // 激活状态切换
  assert.ok(card16x9.classList.contains('is-active'), '点击后 16:9 卡片变为 is-active')
  assert.equal(defaultActive.classList.contains('is-active'), false, '原 9:16 卡片失去 is-active')

  // 2. 验证解说音色字段不再是普通 input，而是定制单选下拉 (.omx-apptab-select-single)
  const selectBox = host.querySelector('.omx-apptab-select-single')
  assert.ok(selectBox, '音色字段必须渲染为 .omx-apptab-select-single 单选下拉')

  const trigger = selectBox.querySelector('.omx-apptab-select-trigger')
  assert.ok(trigger, '必须包含下拉触发器')
  assert.equal(trigger.textContent.trim(), '活力女声（电商促销爆款）', '默认选中活力女声')

  // 点击展开下拉菜单
  fireClick(trigger)
  const optionsPanel = selectBox.querySelector('.omx-apptab-select-options')
  assert.ok(optionsPanel, '展开后必须呈现 .omx-apptab-select-options 菜单面板')

  const optionItems = Array.from(optionsPanel.querySelectorAll('.omx-apptab-select-option'))
  assert.equal(optionItems.length, 4, '音色下拉选项必须有 4 个')

  // 选中「沉稳男声（数码科技大片）」
  const maleOption = optionItems.find((opt) => opt.textContent.includes('沉稳男声'))
  assert.ok(maleOption, '必须包含沉稳男声选项')
  fireClick(maleOption)

  // 验证下拉面板关闭且触发器文案更新
  assert.equal(selectBox.querySelector('.omx-apptab-select-options'), null, '选择后下拉面板必须自动收起')
  assert.equal(trigger.textContent.trim(), '沉稳男声（数码科技大片）', '触发器展示已选中的沉稳男声音色')

  // 3. 验证商品主图字段已升级为资产库选择并卡片化呈现 (.omx-apptab-picked)
  const pickedCard = host.querySelector('.omx-apptab-picked')
  assert.ok(pickedCard, '因自带默认样例图，商品主图必须卡片化展示')

  const clearBtn = pickedCard.querySelector('.omx-apptab-picked-clear')
  assert.ok(clearBtn, '已选卡片必须提供移除按钮')

  // 点击移除，退回为从资产库选择触发按钮
  fireClick(clearBtn)
  const libTrigger = host.querySelector('.omx-apptab-library-trigger')
  assert.ok(libTrigger, '清空后呈现「从资产库选择…」触发行')

  act(() => {
    root.unmount()
  })
})

test('E2E: 复合控件分段选项卡 (segmented-tabs) 与多选胶囊 (multi-tags) 交互 (Issue #2607)', async () => {
  initDom()
  const AppTab = await loadAppTab()

  const host = doc.createElement('div')
  doc.body.appendChild(host)
  const root = createRoot(host)

  act(() => {
    root.render(
      React.createElement(AppTab, {
        seed: {
          id: 'app_app-builtin-product-video',
          extra: { manifest: PRODUCT_VIDEO_APP },
        },
      }),
    )
  })

  // 1. segmented-tabs 切换测试
  const segTabs = host.querySelector('.omx-apptab-seg-tabs')
  assert.ok(segTabs, '视频内容字段必须渲染为 segmented-tabs')

  const tabs = Array.from(segTabs.querySelectorAll('.omx-apptab-seg-tab'))
  assert.equal(tabs.length, 2, '必须有 2 项分段选项卡')
  assert.ok(tabs[0].classList.contains('is-on'), '默认预设视频类型为 is-on')

  // 点击切换到第二个 tab
  fireClick(tabs[1])
  assert.ok(tabs[1].classList.contains('is-on'), '点击后第二项变为 is-on')
  assert.equal(tabs[0].classList.contains('is-on'), false, '原第一项失去 is-on')

  // 2. multi-tags 多选与上限锁定测试 (maxItems = 3，默认包含 tiktok)
  const multiBox = host.querySelector('.omx-apptab-multi-box')
  assert.ok(multiBox, '发布平台必须渲染为 multi-tags 胶囊多选')

  const tagButtons = Array.from(multiBox.querySelectorAll('.omx-apptab-mtag'))
  assert.ok(tagButtons.length >= 4, '候选平台标签至少 4 个')

  // 第 1 项默认即为 tiktok，应处于 is-on
  assert.ok(tagButtons[0].classList.contains('is-on'), '默认包含的项应为 is-on')

  // 继续选中第 2、第 3 项，使已选数量达到上限 3
  fireClick(tagButtons[1])
  fireClick(tagButtons[2])

  assert.ok(tagButtons[0].classList.contains('is-on'))
  assert.ok(tagButtons[1].classList.contains('is-on'))
  assert.ok(tagButtons[2].classList.contains('is-on'))

  // 第 4 个未被选中的标签应被锁定 (disabled + is-locked)
  const unselectedTag = tagButtons[3]
  assert.ok(unselectedTag.classList.contains('is-locked'), '达到上限后未选中的标签必须带有 is-locked')
  assert.equal(unselectedTag.disabled, true, '达到上限后未选中的标签必须处于 disabled 状态')

  // 取消一个已选标签
  fireClick(tagButtons[1])
  assert.equal(tagButtons[1].classList.contains('is-on'), false)
  assert.equal(unselectedTag.classList.contains('is-locked'), false, '释放后恢复可用')
  assert.equal(unselectedTag.disabled, false, '释放后 disabled 解除')

  act(() => {
    root.unmount()
  })
})
