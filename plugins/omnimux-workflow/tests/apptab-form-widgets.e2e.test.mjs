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
 *
 * Environment isolation:
 * - Teardown restores globalThis variables and calls dom.window.close() to prevent memory leaks (M-08)
 * - Self-contained fixtures decouple tests from cross-plugin relative file paths (M-10)
 * - Semantic assertions guard against brittle index/count bindings (M-11)
 */

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(here, '..')

// 自包含测试夹具，避免直接跨插件读取私有路径 (M-10)
const CHASING_PRODUCT_APP = {
  appId: 'app-creatify-chasing-product',
  metadata: {
    name: '主体追踪与多机位展示',
    description: '围绕特定核心商品进行主体视觉锁定与多视角运镜渲染',
    version: '1.2.0',
    official: true,
  },
  formSchema: {
    type: 'object',
    properties: {
      product_image: {
        type: 'string',
        title: '商品主图',
        widget: 'product-link',
        description: '粘贴商品链接、从商品库选择或本地上传',
        default: '/assets/sample-shoe.webp',
        placeholder: '粘贴商品链接，或从商品库选择',
      },
      aspect_ratio: {
        type: 'string',
        title: '视频比例',
        enum: ['9:16', '16:9', '1:1'],
        default: '9:16',
      },
      voice: {
        type: 'string',
        title: '解说音色',
        options: [
          { label: '活力女声（电商促销爆款）', value: 'zh_female_energetic' },
          { label: '沉稳男声（数码科技大片）', value: 'zh_male_calm' },
          { label: '甜美解说（美妆护肤首选）', value: 'zh_female_sweet' },
          { label: '磁性男声（轻奢格调推荐）', value: 'zh_male_magnetic' },
        ],
        default: 'zh_female_energetic',
      },
    },
  },
  fieldMappings: {
    product_image: { widget: 'product-link' },
    aspect_ratio: { widget: 'ratio-cards' },
    voice: { widget: 'select-single' },
  },
  demoSnapshot: {
    product_image: '/assets/sample-shoe.webp',
    aspect_ratio: '9:16',
    voice: 'zh_female_energetic',
  },
}

const PRODUCT_VIDEO_APP = {
  appId: 'app-builtin-product-video',
  metadata: {
    name: '商品营销视频生成',
    description: '快速生成多平台带货视频',
    version: '1.0.0',
  },
  formSchema: {
    type: 'object',
    properties: {
      video_type: {
        type: 'string',
        title: '视频类型',
        widget: 'segmented-tabs',
        options: [
          { label: '预设视频', value: 'preset' },
          { label: '自定义视频', value: 'custom' },
        ],
        default: 'preset',
      },
      platforms: {
        type: 'array',
        title: '发布平台',
        widget: 'multi-tags',
        options: [
          { label: 'TikTok', value: 'tiktok' },
          { label: 'YouTube Shorts', value: 'youtube' },
          { label: 'Instagram Reels', value: 'instagram' },
          { label: '小红书', value: 'xiaohongshu' },
        ],
        maxItems: 3,
        default: ['tiktok'],
      },
    },
  },
  fieldMappings: {
    video_type: { widget: 'segmented-tabs' },
    platforms: { widget: 'multi-tags' },
  },
  demoSnapshot: {
    video_type: 'preset',
    platforms: ['tiktok'],
  },
}

const TEST_MANIFEST = {
  appId: 'app-creatify-app-demo',
  metadata: {
    name: '手机与网页交互实机演示',
    description: '测试商品主图三合一与下拉透视穿透防卫',
  },
  formSchema: {
    type: 'object',
    properties: {
      voice: {
        type: 'string',
        title: '解说音色',
        widget: 'select-single',
        options: [
          { label: '活力女声', value: 'zh_female_energetic' },
          { label: '沉稳男声', value: 'zh_male_calm' },
        ],
        default: 'zh_female_energetic',
      },
      product_image: {
        type: 'string',
        title: '商品主图',
        widget: 'product-link',
        placeholder: '粘贴商品链接，或从商品库选择',
      },
    },
  },
  fieldMappings: {
    voice: { widget: 'select-single' },
    product_image: { widget: 'product-link' },
  },
}

// 预设目录非空防御断言 (M-09)
assert.ok(CHASING_PRODUCT_APP, '预设 CHASING_PRODUCT_APP 必须存在')
assert.ok(PRODUCT_VIDEO_APP, '预设 PRODUCT_VIDEO_APP 必须存在')
assert.ok(TEST_MANIFEST, '预设 TEST_MANIFEST 必须存在')

let AppTabComponent = null
let dom = null
let doc = null

// 保存原始 globalThis 变量以便 teardown 还原 (M-08)
const originalGlobals = {
  window: globalThis.window,
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  HTMLInputElement: globalThis.HTMLInputElement,
  Event: globalThis.Event,
  MouseEvent: globalThis.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
}

afterEach(() => {
  if (dom?.window) {
    try {
      dom.window.close()
    } catch {
      // ignore
    }
  }
  dom = null
  doc = null
  globalThis.window = originalGlobals.window
  globalThis.document = originalGlobals.document
  globalThis.HTMLElement = originalGlobals.HTMLElement
  globalThis.HTMLInputElement = originalGlobals.HTMLInputElement
  globalThis.Event = originalGlobals.Event
  globalThis.MouseEvent = originalGlobals.MouseEvent
  globalThis.IS_REACT_ACT_ENVIRONMENT = originalGlobals.IS_REACT_ACT_ENVIRONMENT
})

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
  globalThis.HTMLInputElement = dom.window.HTMLInputElement
  globalThis.Event = dom.window.Event
  globalThis.MouseEvent = dom.window.MouseEvent
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  if (dom.window.HTMLInputElement?.prototype) {
    dom.window.HTMLInputElement.prototype.attachEvent = () => {}
    dom.window.HTMLInputElement.prototype.detachEvent = () => {}
  }
}

function fireClick(el) {
  act(() => {
    el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function fireChange(el, value) {
  act(() => {
    const propKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'))
    if (propKey && typeof el[propKey]?.onChange === 'function') {
      el[propKey].onChange({ target: { value } })
    }
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

  // 0. 验证表单首部渲染生成模型选择器，默认展示纯净模型名 Seedance 2.0 (Issue #2631, #2647)
  const modelSelectGroup = Array.from(host.querySelectorAll('.omx-apptab-field-group')).find((fg) => {
    return fg.textContent.includes('生成模型')
  })
  assert.ok(modelSelectGroup, '表单首部必须包含生成模型选择器')
  const modelTrigger = modelSelectGroup.querySelector('.omx-apptab-select-trigger')
  assert.ok(modelTrigger, '生成模型选择器必须包含触发器')
  assert.equal(modelTrigger.textContent.trim(), 'Seedance 2.0', '生成模型默认展示纯净模型名 Seedance 2.0')
  assert.doesNotMatch(modelTrigger.textContent, /工程默认|作者推荐|智能推荐/, '绝不包含任何工程默认后缀或智能推荐字样')

  // 1. 验证视频比例字段不再是普通 input，而是标准比例卡片组 (.omx-apptab-ratio-grid)
  const ratioGrid = host.querySelector('.omx-apptab-ratio-grid')
  assert.ok(ratioGrid, '比例字段必须渲染为 .omx-apptab-ratio-grid 比例卡片组')

  const ratioCards = Array.from(ratioGrid.querySelectorAll('.omx-apptab-ratio-card'))
  assert.ok(ratioCards.length >= 2, '必须渲染多个比例卡片')

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
  const selectBox = Array.from(host.querySelectorAll('.omx-apptab-select-single')).find((el) => {
    return el.closest('.omx-apptab-field-group')?.textContent.includes('音色')
  }) || host.querySelector('.omx-apptab-select-single')
  assert.ok(selectBox, '音色字段必须渲染为 .omx-apptab-select-single 单选下拉')

  const trigger = selectBox.querySelector('.omx-apptab-select-trigger')
  assert.ok(trigger, '必须包含下拉触发器')
  assert.equal(trigger.textContent.trim(), '活力女声（电商促销爆款）', '默认选中活力女声')

  // 点击展开下拉菜单，验证防透视穿透样式类名挂载（Issue #2622 Task 1）
  fireClick(trigger)
  assert.ok(selectBox.classList.contains('is-open'), '展开时 select-single 必须带有 is-open')
  const fieldGroup = selectBox.closest('.omx-apptab-field-group')
  assert.ok(fieldGroup.classList.contains('is-dropdown-open'), '展开时父级 field-group 必须带有 is-dropdown-open')

  const optionsPanel = selectBox.querySelector('.omx-apptab-select-options')
  assert.ok(optionsPanel, '展开后必须呈现 .omx-apptab-select-options 菜单面板')

  const optionItems = Array.from(optionsPanel.querySelectorAll('.omx-apptab-select-option'))
  assert.ok(optionItems.length >= 2, '音色下拉选项必须包含多个候选音色 (M-11)')

  // 语义化选中「沉稳男声（数码科技大片）」(M-11)
  const maleOption = optionItems.find((opt) => opt.textContent.includes('沉稳男声'))
  assert.ok(maleOption, '必须包含沉稳男声选项')
  fireClick(maleOption)

  // 验证下拉面板关闭且触发器文案更新
  assert.equal(selectBox.querySelector('.omx-apptab-select-options'), null, '选择后下拉面板必须自动收起')
  assert.equal(trigger.textContent.trim(), '沉稳男声（数码科技大片）', '触发器展示已选中的沉稳男声音色')

  // 3. 验证商品主图字段已升级为三合一复合控件，默认卡片化呈现 (.omx-apptab-picked)（Issue #2622 Task 2）
  const pickedCard = host.querySelector('.omx-apptab-picked')
  assert.ok(pickedCard, '因自带默认样例图，商品主图必须卡片化展示')

  const clearBtn = pickedCard.querySelector('.omx-apptab-picked-clear')
  assert.ok(clearBtn, '已选卡片必须提供移除按钮')

  // 点击移除，无缝恢复为 40px 单行紧凑复合输入条
  fireClick(clearBtn)
  const productWidget = host.querySelector('.omx-apptab-product-widget')
  assert.ok(productWidget, '清空后无缝恢复为 40px 单行紧凑输入条')
  const storeBtn = productWidget.querySelector('button[aria-label="从商品库选择"]')
  assert.ok(storeBtn, '输入条必须包含「从商品库选择」按钮')
  const uploadBtn = productWidget.querySelector('button[aria-label="本地上传"]')
  assert.ok(uploadBtn, '输入条必须包含「本地上传」按钮')
  const linkInput = productWidget.querySelector('.omx-apptab-extractor-input')
  assert.ok(linkInput, '输入条必须包含链接输入框')

  // 点击从商品库选择按钮，唤起商品库选择交互弹窗
  fireClick(storeBtn)
  const modal = doc.querySelector('.omx-apptab-modal')
  assert.ok(modal, '点击商品库按钮必须弹出从商品库选择的交互弹窗')
  const productItems = Array.from(modal.querySelectorAll('.omx-apptab-product-item'))
  assert.ok(productItems.length > 0, '商品库弹窗中必须列出已有可选商品卡片')

  // 点击第一款已有商品进行回填
  fireClick(productItems[0])
  assert.equal(doc.querySelector('.omx-apptab-modal'), null, '选择商品后弹窗自动关闭')
  const repickedCard = host.querySelector('.omx-apptab-picked')
  assert.ok(repickedCard, '挑选商品后重新渲染为已选卡片')

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
  assert.ok(tabs.length >= 2, '必须至少有 2 项分段选项卡')
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

test('E2E: 下拉菜单防透视穿透与商品主图三合一紧凑复合控件全交互 (Issue #2622)', async () => {
  initDom()
  const AppTab = await loadAppTab()

  const host = doc.createElement('div')
  doc.body.appendChild(host)
  const root = createRoot(host)

  act(() => {
    root.render(
      React.createElement(AppTab, {
        seed: {
          id: 'app_app-creatify-app-demo',
          extra: { manifest: TEST_MANIFEST },
        },
      }),
    )
  })

  // 1. 测试任务 1：音色下拉菜单防透视穿透
  const selectBox = host.querySelector('.omx-apptab-select-single')
  assert.ok(selectBox, '音色字段渲染为定制下拉单选')
  assert.equal(selectBox.classList.contains('is-open'), false, '未展开时无 is-open')

  const trigger = selectBox.querySelector('.omx-apptab-select-trigger')
  assert.ok(trigger, '触发器存在')

  // 点击展开
  fireClick(trigger)
  assert.ok(selectBox.classList.contains('is-open'), '展开后容器拥有 is-open 赋予 z-index: 50')
  const group = selectBox.closest('.omx-apptab-field-group')
  assert.ok(group.classList.contains('is-dropdown-open'), '父级字段组拥有 is-dropdown-open 赋予高 z-index')
  const options = selectBox.querySelector('.omx-apptab-select-options')
  assert.ok(options, '下拉菜单面板展开')

  // 2. 测试任务 2：商品主图未回填时为 40px 紧凑单行复合输入条
  const productWidget = host.querySelector('.omx-apptab-product-widget')
  assert.ok(productWidget, '商品主图未回填时呈现为紧凑单行条')
  assert.ok(productWidget.classList.contains('omx-apptab-extractor'), '复用 40px 高度 extractor 布局')

  const linkInput = productWidget.querySelector('.omx-apptab-extractor-input')
  assert.ok(linkInput, '包含商品链接输入框')

  const storeBtn = productWidget.querySelector('button[aria-label="从商品库选择"]')
  assert.ok(storeBtn, '包含从商品库选择功能按钮')

  const uploadBtn = productWidget.querySelector('button[aria-label="本地上传"]')
  assert.ok(uploadBtn, '包含本地上传功能按钮')

  // 点击「从商品库选择」，验证弹窗交互并回填已有商品
  fireClick(storeBtn)
  const modal = doc.querySelector('.omx-apptab-modal')
  assert.ok(modal, '点击从商品库选择唤起交互弹窗')
  const items = Array.from(modal.querySelectorAll('.omx-apptab-product-item'))
  assert.ok(items.length >= 1, '商品库弹窗中提供已有商品列表')

  // 点击挑选第一款商品
  fireClick(items[0])
  assert.equal(doc.querySelector('.omx-apptab-modal'), null, '选择商品后弹窗自动关闭')

  // 验证回填后统一渲染为带缩略图与移除按键的高质感卡片
  const pickedCard = host.querySelector('.omx-apptab-picked')
  assert.ok(pickedCard, '挑选商品后回填为统一精美卡片')
  assert.ok(pickedCard.querySelector('.omx-apptab-picked-thumb'), '包含商品缩略图')
  assert.ok(pickedCard.querySelector('.omx-apptab-picked-title'), '包含商品标题')

  const removeBtn = pickedCard.querySelector('.omx-apptab-picked-clear')
  assert.ok(removeBtn, '包含一键移除按钮')

  // 点击移除，无缝恢复为 40px 紧凑输入条
  fireClick(removeBtn)
  assert.equal(host.querySelector('.omx-apptab-picked'), null, '移除后卡片消失')
  assert.ok(host.querySelector('.omx-apptab-product-widget'), '无缝恢复为 40px 单行输入条')

  act(() => {
    root.unmount()
  })
})

test('E2E: 商品库弹窗链接安全协议清洗与非法协议拦截 (Issue #2622 Review Fix)', async () => {
  initDom()
  const AppTab = await loadAppTab()

  const host = doc.createElement('div')
  doc.body.appendChild(host)
  const root = createRoot(host)

  act(() => {
    root.render(
      React.createElement(AppTab, {
        seed: {
          id: 'app_app-creatify-app-demo',
          extra: { manifest: TEST_MANIFEST },
        },
      }),
    )
  })

  const productWidget = host.querySelector('.omx-apptab-product-widget')
  assert.ok(productWidget, '商品主图复合条渲染')

  const storeBtn = productWidget.querySelector('button[aria-label="从商品库选择"]')
  assert.ok(storeBtn, '从商品库选择按钮存在')
  fireClick(storeBtn)

  const modal = doc.querySelector('.omx-apptab-modal')
  assert.ok(modal, '点击唤起弹窗')

  const modalInput = modal.querySelector('.omx-apptab-input')
  assert.ok(modalInput, '弹窗搜索/链接输入框存在')

  const submitBtn = modal.querySelector('.omx-apptab-btn-primary')
  assert.ok(submitBtn, '弹窗确定按钮存在')

  // 1. 模拟输入危险协议 javascript:alert(1)
  fireChange(modalInput, 'javascript:alert(1)')

  // 点击确定
  fireClick(submitBtn)

  // 验证弹窗依然存在（未被关闭），并且展示了安全拦截错误提示
  assert.ok(doc.querySelector('.omx-apptab-modal'), '非法协议被拦截，弹窗不关闭')
  let errorText = doc.querySelector('.omx-apptab-modal .omx-apptab-error-text')
  assert.ok(errorText, '弹窗内展示错误提示')
  assert.match(errorText.textContent, /链接协议不支持/)

  // 1b. 模拟输入文件伪协议 file:///etc/passwd
  fireChange(modalInput, 'file:///etc/passwd')
  fireClick(submitBtn)
  assert.ok(doc.querySelector('.omx-apptab-modal'), 'file协议被拦截，弹窗不关闭')
  errorText = doc.querySelector('.omx-apptab-modal .omx-apptab-error-text')
  assert.ok(errorText)
  assert.match(errorText.textContent, /链接协议不支持/)

  // 2. 模拟输入合法链接 https://example.com/item.png
  fireChange(modalInput, 'https://example.com/item.png')

  // 再次点击确定
  fireClick(submitBtn)

  // 验证弹窗成功关闭并回填为已选卡片
  assert.equal(doc.querySelector('.omx-apptab-modal'), null, '合法链接提交后弹窗关闭')
  const pickedCard = host.querySelector('.omx-apptab-picked')
  assert.ok(pickedCard, '合法链接成功回填为已选卡片')
  assert.match(pickedCard.textContent, /item\.png/)

  act(() => {
    root.unmount()
  })
})

test('E2E: 表单首部生成模型切换、画幅比例动态契约驱动与提交模型穿透 (Issue 2631)', async () => {
  initDom()
  const AppTab = await loadAppTab()

  const host = doc.createElement('div')
  doc.body.appendChild(host)
  const root = createRoot(host)

  let submittedPayload = null
  const win = doc.defaultView
  win.__OMNIMUX_APPS_EXECUTE__ = async (manifest, formValues) => {
    submittedPayload = { manifest, formValues }
    return {
      executionId: 'exec_test_model_123',
      mediaUrl: 'https://cdn.omnimux.com/out.mp4',
    }
  }

  act(() => {
    root.render(
      React.createElement(AppTab, {
        seed: {
          id: 'app_app-creatify-chasing-product',
          title: '测试模型联动应用',
          extra: { manifest: CHASING_PRODUCT_APP },
        },
      }),
    )
  })

  // 1. 验证表单首部生成模型选择器存在
  const modelSelectGroup = Array.from(host.querySelectorAll('.omx-apptab-field-group')).find((fg) => {
    return fg.textContent.includes('生成模型')
  })
  assert.ok(modelSelectGroup, '表单首部必须包含生成模型选择器')

  const modelTrigger = modelSelectGroup.querySelector('.omx-apptab-select-trigger')
  assert.ok(modelTrigger, '触发器必须存在')
  assert.equal(modelTrigger.textContent.trim(), 'Seedance 2.0', '初始默认展示纯净模型名 Seedance 2.0')
  assert.doesNotMatch(modelTrigger.textContent, /工程默认|作者推荐|智能推荐/, '绝不包含任何工程默认后缀或智能推荐字样')

  // 2. 点击展开模型下拉列表
  fireClick(modelTrigger)
  const optionsPanel = modelSelectGroup.querySelector('.omx-apptab-select-options')
  assert.ok(optionsPanel, '展开后必须呈现模型下拉面板')

  const modelOptions = Array.from(optionsPanel.querySelectorAll('.omx-apptab-select-option'))
  assert.ok(modelOptions.length >= 3, '模型列表必须包含保底模型（如 Seedance 2.0, MiniMax H3, Kling 等）')

  // 3. 选中可灵模型 (kling-v1-6)
  const klingOption = modelOptions.find((opt) => opt.textContent.includes('Kling v1.6') || opt.textContent.includes('kling'))
  assert.ok(klingOption, '列表中必须包含 Kling 模型选项')
  fireClick(klingOption)

  // 验证选择后面板关闭，触发器显示 Kling
  assert.equal(modelSelectGroup.querySelector('.omx-apptab-select-options'), null, '选择后面板自动关闭')
  assert.match(modelTrigger.textContent, /Kling/, '触发器文案更新为 Kling 模型')

  // 4. 验证画幅比例由模型动态驱动
  const ratioGrid = host.querySelector('.omx-apptab-ratio-grid')
  assert.ok(ratioGrid, '比例卡片组存在')
  const ratioCards = Array.from(ratioGrid.querySelectorAll('.omx-apptab-ratio-card'))
  const ratioTexts = ratioCards.map((c) => c.textContent.trim())
  assert.ok(ratioTexts.includes('9:16'), 'Kling 模型支持 9:16')
  assert.ok(ratioTexts.includes('16:9'), 'Kling 模型支持 16:9')
  assert.ok(ratioTexts.includes('1:1'), 'Kling 模型支持 1:1')

  // 5. 点击提交「立即生成」，验证 payload 携带 __model__
  const form = host.querySelector('.omx-apptab-form')
  assert.ok(form, '表单存在')
  await act(async () => {
    const submitBtn = host.querySelector('.omx-apptab-cta-btn')
    fireClick(submitBtn)
  })

  assert.ok(submittedPayload, '必须成功调用执行中枢接口')
  assert.equal(submittedPayload.formValues.__model__, 'kling-v1-6', '提交参数必须携带 __model__ 专用通道为用户选中的模型')
  assert.equal(submittedPayload.formValues.model, undefined, '严禁直接赋值 model 字段避免污染业务字段 (Issue #2631 Review)')

  act(() => {
    root.unmount()
  })
})

test('E2E: 初始默认智能推荐状态下完整保护应用 Schema 声明的原生画幅比例 (Issue #2631 Review Fix)', async () => {
  initDom()
  const AppTab = await loadAppTab()

  const customAppManifest = JSON.parse(JSON.stringify(CHASING_PRODUCT_APP))
  // 为该应用声明一个合法的特殊初始比例 '21:9'
  customAppManifest.demoSnapshot = {
    ...customAppManifest.demoSnapshot,
    aspect_ratio: '21:9',
  }
  if (customAppManifest.formSchema?.properties?.aspect_ratio) {
    customAppManifest.formSchema.properties.aspect_ratio.default = '21:9'
  }

  const host = doc.createElement('div')
  doc.body.appendChild(host)
  const root = createRoot(host)

  let submittedPayload = null
  const win = doc.defaultView
  win.__OMNIMUX_APPS_EXECUTE__ = async (manifest, formValues) => {
    submittedPayload = { manifest, formValues }
    return {
      executionId: 'exec_test_preserve_ratio_456',
      mediaUrl: 'https://cdn.omnimux.com/out2.mp4',
    }
  }

  act(() => {
    root.render(
      React.createElement(AppTab, {
        seed: {
          id: 'app_custom_ratio_app',
          title: '原生比例保护测试应用',
          extra: { manifest: customAppManifest },
        },
      }),
    )
  })

  // 1. 在未显式选择模型（智能推荐状态）下，原生默认比例 '21:9' 绝不被兜底模型洗刷
  await act(async () => {
    const submitBtn = host.querySelector('.omx-apptab-cta-btn')
    fireClick(submitBtn)
  })

  assert.ok(submittedPayload, '必须成功调用执行中枢接口')
  assert.equal(
    submittedPayload.formValues.aspect_ratio,
    '21:9',
    '默认智能推荐状态下必须完整尊重应用原生声明的默认比例，绝不被兜底模型静默洗刷',
  )
  assert.equal(submittedPayload.formValues.__model__, undefined, '未显式选择模型时不注入 __model__')

  // 2. 当用户显式选择特定模型时（如 Kling，不支持 21:9），才自愈收敛为新模型默认比例
  const modelSelectGroup = Array.from(host.querySelectorAll('.omx-apptab-field-group')).find((fg) => {
    return fg.textContent.includes('生成模型')
  })
  const modelTrigger = modelSelectGroup.querySelector('.omx-apptab-select-trigger')
  fireClick(modelTrigger)
  const optionsPanel = modelSelectGroup.querySelector('.omx-apptab-select-options')
  const klingOption = Array.from(optionsPanel.querySelectorAll('.omx-apptab-select-option')).find(
    (opt) => opt.textContent.includes('Kling v1.6') || opt.textContent.includes('kling'),
  )
  assert.ok(klingOption)
  await act(async () => {
    fireClick(klingOption)
  })

  // 提交再次断言，此时因显式选中 Kling，21:9 被合法自愈为 Kling 默认比例（9:16 或 16:9）
  await act(async () => {
    const submitBtn = host.querySelector('.omx-apptab-cta-btn')
    fireClick(submitBtn)
  })
  assert.equal(submittedPayload.formValues.__model__, 'kling-v1-6')
  assert.notEqual(submittedPayload.formValues.aspect_ratio, '21:9', '显式选定模型后非法比例必须被收敛')

  act(() => {
    root.unmount()
  })
})

test('E2E: 表单首部生成模型默认项显式绑定工程作者模型 (Issue #2642)', async () => {
  initDom()
  const AppTab = await loadAppTab()

  const manifestWithModel = JSON.parse(JSON.stringify(CHASING_PRODUCT_APP))
  // 工程主节点预设为 seedance-2.0
  manifestWithModel.workflowBinding = {
    workspaceId: 'ws_test_seedance',
    snapshot: {
      nodes: [
        {
          id: 'node_gen_video',
          type: 'material',
          data: {
            tool: 'omnimux_video_submit',
            materialType: 'video',
            model: 'seedance-2.0',
            params: {
              model: 'seedance-2.0',
            },
          },
        },
      ],
      edges: [],
    },
  }

  const host = doc.createElement('div')
  doc.body.appendChild(host)
  const root = createRoot(host)

  act(() => {
    root.render(
      React.createElement(AppTab, {
        seed: {
          id: 'app_seedance_preset_app',
          title: '预设模型显式绑定测试应用',
          extra: { manifest: manifestWithModel },
        },
      }),
    )
  })

  const modelSelectGroup = Array.from(host.querySelectorAll('.omx-apptab-field-group')).find((fg) => {
    return fg.textContent.includes('生成模型')
  })
  assert.ok(modelSelectGroup, '生成模型控件组存在')

  // 1. 验证默认收起态：展示纯净工程默认模型名称，绝无 (工程默认 · 作者推荐) 括号后缀 (Issue #2647)
  const modelTrigger = modelSelectGroup.querySelector('.omx-apptab-select-trigger')
  assert.ok(modelTrigger)
  assert.equal(
    modelTrigger.textContent.trim(),
    'Seedance 2.0',
    '默认态收起按钮文本必须显式展示纯净模型名称',
  )
  assert.doesNotMatch(modelTrigger.textContent, /工程默认 · 作者推荐/, '绝不包含任何 (工程默认 · 作者推荐) 括号后缀')

  // 2. 展开下拉菜单，核查第一项默认选项的文案与说明 (Issue #2647)
  fireClick(modelTrigger)
  const optionsPanel = modelSelectGroup.querySelector('.omx-apptab-select-options')
  assert.ok(optionsPanel)

  const defaultOption = optionsPanel.querySelector('.omx-apptab-select-option')
  assert.ok(defaultOption)
  const nameSpan = defaultOption.querySelector('.omx-apptab-model-name')
  const subSpan = defaultOption.querySelector('.omx-apptab-model-sub')
  assert.equal(nameSpan.textContent.trim(), 'Seedance 2.0', '首项主标题直接展示纯净模型名称')
  assert.doesNotMatch(nameSpan.textContent, /工程默认 · 作者推荐/, '主标题绝无冗长后缀括号')
  assert.equal(subSpan.textContent.trim(), '工程预设推荐模型', '副标题极简展示工程预设推荐模型')

  // 3. 验证无模型工程节点时的健全推导呈现：彻底杜绝回退为「智能推荐 (默认)」(Issue #2647)
  const manifestWithoutModel = JSON.parse(JSON.stringify(CHASING_PRODUCT_APP))
  manifestWithoutModel.workflowBinding = {
    workspaceId: 'ws_test_no_model',
    snapshot: {
      nodes: [
        {
          id: 'node_pure_text',
          type: 'text',
          data: { content: '普通文本' },
        },
      ],
      edges: [],
    },
  }

  const host2 = doc.createElement('div')
  doc.body.appendChild(host2)
  const root2 = createRoot(host2)

  act(() => {
    root2.render(
      React.createElement(AppTab, {
        seed: {
          id: 'app_no_model_app',
          title: '无模型应用',
          extra: { manifest: manifestWithoutModel },
        },
      }),
    )
  })

  const modelSelectGroup2 = Array.from(host2.querySelectorAll('.omx-apptab-field-group')).find((fg) =>
    fg.textContent.includes('生成模型'),
  )
  const modelTrigger2 = modelSelectGroup2.querySelector('.omx-apptab-select-trigger')
  assert.equal(modelTrigger2.textContent.trim(), 'Seedance 2.0', '无生成节点时健全推导为 Seedance 2.0，彻底杜绝智能推荐')
  assert.doesNotMatch(modelTrigger2.textContent, /智能推荐/, '绝不回退为智能推荐')

  // 4. 验证复杂多节点拓扑（含 slot 节点、import 节点、LLM 节点与主生成节点）下的排他精确寻址 (Issue #2642 Review #13)
  const manifestMultiNodes = JSON.parse(JSON.stringify(CHASING_PRODUCT_APP))
  manifestMultiNodes.workflowBinding = {
    workspaceId: 'ws_test_multi_nodes_exclusive',
    snapshot: {
      nodes: [
        {
          id: 'node-slot-1',
          type: 'input',
          data: {
            isSlot: true,
            slotRole: 'product_image',
            model: 'fake-slot-model',
            params: { model: 'fake-slot-model' },
          },
        },
        {
          id: 'node_import_video',
          type: 'video',
          data: {
            nodeKind: 'import',
            tool: 'omnimux_video_submit',
            materialType: 'video',
            model: 'fake-import-model',
          },
        },
        {
          id: 'node_llm_prompt',
          type: 'text',
          data: {
            tool: 'llm_generate',
            model: 'deepseek-chat',
            params: { model: 'deepseek-chat' },
          },
        },
        {
          id: 'node_real_video_gen',
          type: 'video',
          data: {
            tool: 'omnimux_video_submit',
            materialType: 'video',
            model: 'kling-o3',
            params: { model: 'kling-o3' },
          },
        },
      ],
      edges: [],
    },
  }

  const host3 = doc.createElement('div')
  doc.body.appendChild(host3)
  const root3 = createRoot(host3)

  act(() => {
    root3.render(
      React.createElement(AppTab, {
        seed: {
          id: 'app_multi_nodes_app',
          title: '多节点排他寻址测试应用',
          extra: { manifest: manifestMultiNodes },
        },
      }),
    )
  })

  const modelSelectGroup3 = Array.from(host3.querySelectorAll('.omx-apptab-field-group')).find((fg) =>
    fg.textContent.includes('生成模型'),
  )
  const modelTrigger3 = modelSelectGroup3.querySelector('.omx-apptab-select-trigger')
  assert.equal(
    modelTrigger3.textContent.trim(),
    '可灵 Kling O3',
    '在含 slot、import 和 LLM 节点的复杂拓扑中必须排他锁定真实主生成节点纯净模型名',
  )
  assert.doesNotMatch(modelTrigger3.textContent, /工程默认 · 作者推荐/, '绝不包含任何括号后缀')

  // 5. 补充验证历史缓存仅存有 workspaceId 且 snapshot.nodes 为空时的推导 (Issue #2647)
  const manifestEmptyNodesHistory = {
    appId: 'app-creatify-quick-promo',
    category: 'video',
    workflowBinding: {
      workspaceId: 'ws-app-creatify-app-demo',
      // snapshot.nodes 缺失
    },
    formSchema: { type: 'object', properties: {} },
  }
  const host4 = doc.createElement('div')
  doc.body.appendChild(host4)
  const root4 = createRoot(host4)
  act(() => {
    root4.render(
      React.createElement(AppTab, {
        seed: {
          id: 'app_history_cache',
          extra: { manifest: manifestEmptyNodesHistory },
        },
      }),
    )
  })
  const modelTrigger4 = host4.querySelector('.omx-apptab-select-trigger')
  assert.equal(modelTrigger4.textContent.trim(), 'Seedance 2.0', '历史缓存无 nodes 时推导为 Seedance 2.0')
  assert.doesNotMatch(modelTrigger4.textContent, /智能推荐|工程默认/)

  // 6. 补充验证图片类应用且无 nodes 时的推导为 GPT Image 2.5 (Issue #2647)
  const manifestImageApp = {
    appId: 'app-product-photo-gen',
    category: 'image',
    formSchema: { type: 'object', properties: {} },
  }
  const host5 = doc.createElement('div')
  doc.body.appendChild(host5)
  const root5 = createRoot(host5)
  act(() => {
    root5.render(
      React.createElement(AppTab, {
        seed: {
          id: 'app_image_gen',
          extra: { manifest: manifestImageApp },
        },
      }),
    )
  })
  const modelTrigger5 = host5.querySelector('.omx-apptab-select-trigger')
  assert.equal(modelTrigger5.textContent.trim(), 'GPT Image 2.5', '图片类应用推导为 GPT Image 2.5')
  assert.doesNotMatch(modelTrigger5.textContent, /智能推荐|工程默认/)

  act(() => {
    root.unmount()
    root2.unmount()
    root3.unmount()
    root4.unmount()
    root5.unmount()
  })
})

test('E2E: 表单多参数（比例、时长、分辨率）跟随模型契约自适应并平滑收敛，且保护独立 quality 字段 (Issue #2642)', async () => {
  initDom()
  const AppTab = await loadAppTab()

  const multiParamManifest = JSON.parse(JSON.stringify(CHASING_PRODUCT_APP))
  // 增加时长、分辨率与独立画质 quality 表单属性
  multiParamManifest.formSchema.properties.duration = {
    type: 'integer',
    title: '成片时长',
    minimum: 4,
    maximum: 20,
    default: 20,
  }
  multiParamManifest.formSchema.properties.resolution = {
    type: 'string',
    title: '输出分辨率',
    options: ['480p', '720p', '1080p'],
    default: '480p',
  }
  multiParamManifest.formSchema.properties.quality = {
    type: 'string',
    title: '生成画质',
    options: ['standard', 'hd'],
    default: 'hd',
  }
  multiParamManifest.demoSnapshot = {
    ...multiParamManifest.demoSnapshot,
    aspect_ratio: '21:9',
    duration: 20,
    resolution: '480p',
    quality: 'hd',
  }

  const host = doc.createElement('div')
  doc.body.appendChild(host)
  const root = createRoot(host)

  let submittedPayload = null
  const win = doc.defaultView
  win.__OMNIMUX_APPS_EXECUTE__ = async (manifest, formValues) => {
    submittedPayload = { manifest, formValues }
    return {
      executionId: 'exec_multi_param_sync_123',
      mediaUrl: 'https://cdn.omnimux.com/sync.mp4',
    }
  }

  act(() => {
    root.render(
      React.createElement(AppTab, {
        seed: {
          id: 'app_multi_param_app',
          title: '多参数联动测试应用',
          extra: { manifest: multiParamManifest },
        },
      }),
    )
  })

  // 1. 默认状态下保护应用原生参数
  await act(async () => {
    const submitBtn = host.querySelector('.omx-apptab-cta-btn')
    fireClick(submitBtn)
  })
  assert.equal(submittedPayload.formValues.aspect_ratio, '21:9')
  assert.equal(submittedPayload.formValues.duration, 20)
  assert.equal(submittedPayload.formValues.resolution, '480p')
  assert.equal(submittedPayload.formValues.quality, 'hd')

  // 2. 显式切换到 MiniMax H3（权威契约：4–15s，分辨率 2K/768P，比例 16:9/9:16/1:1/4:3/3:4/21:9）
  const modelSelectGroup = Array.from(host.querySelectorAll('.omx-apptab-field-group')).find((fg) => {
    return fg.textContent.includes('生成模型')
  })
  const modelTrigger = modelSelectGroup.querySelector('.omx-apptab-select-trigger')
  fireClick(modelTrigger)
  const optionsPanel = modelSelectGroup.querySelector('.omx-apptab-select-options')
  const minimaxOption = Array.from(optionsPanel.querySelectorAll('.omx-apptab-select-option')).find((opt) =>
    opt.textContent.includes('MiniMax H3'),
  )
  assert.ok(minimaxOption)
  await act(async () => {
    fireClick(minimaxOption)
  })

  // 再次提交：时长 20s 超出 MiniMax H3 连续范围上限 (15s)，安全截断为 15s；
  // 分辨率 480p 不在 MiniMax H3 支持范围 (2K/768P)，安全重置为默认分辨率 (2K)；
  // 独立画质参数 quality ('hd') 绝不被误归类改写为分辨率！
  await act(async () => {
    const submitBtn = host.querySelector('.omx-apptab-cta-btn')
    fireClick(submitBtn)
  })

  assert.equal(submittedPayload.formValues.__model__, 'minimax-h3')
  assert.equal(submittedPayload.formValues.duration, 15, '时长 20s 超过 MiniMax H3 上限 15s，平滑收敛为 15s')
  assert.equal(submittedPayload.formValues.resolution, '2K', '分辨率 480p 不被 MiniMax H3 支持，平滑重置为默认 2K')
  assert.equal(submittedPayload.formValues.aspect_ratio, '21:9', 'MiniMax H3 支持 21:9，故保留')
  assert.equal(submittedPayload.formValues.quality, 'hd', '独立 quality 画质参数严禁被误当成 resolution 覆写')

  // 3. 验证在区间模型 (MiniMax H3: 4–15s) 下，用户在时长数字输入框逐字符输入 '1' 再输入 '0' 组成 '10' 时，不会在输入 '1' 时被强制 clamp 为 4
  const numInput = host.querySelector('input[type="number"]')
  assert.ok(numInput, '应存在时长数字输入框')
  await act(async () => {
    const nativeSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set
    if (nativeSetter) {
      nativeSetter.call(numInput, '1')
    } else {
      numInput.value = '1'
    }
    numInput.dispatchEvent(new win.Event('input', { bubbles: true }))
    numInput.dispatchEvent(new win.Event('change', { bubbles: true }))
  })
  assert.equal(String(numInput.value), '1', '键入首字符 1 时不得被 useEffect 抢跑 clamp 为 4')

  await act(async () => {
    const nativeSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set
    if (nativeSetter) {
      nativeSetter.call(numInput, '10')
    } else {
      numInput.value = '10'
    }
    numInput.dispatchEvent(new win.Event('input', { bubbles: true }))
    numInput.dispatchEvent(new win.Event('change', { bubbles: true }))
  })
  assert.equal(String(numInput.value), '10', '继续键入 0 后正常形成两位数 10')

  act(() => {
    root.unmount()
  })
})
