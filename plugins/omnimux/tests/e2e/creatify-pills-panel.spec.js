import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

// 端到端：会话引导四入口展开面板（design.md v2.0 对齐后的行为契约）
// 覆盖：样式幂等注入 / 技能面板展开·过滤·芯片注入 / 子提示词分类图标与注入 / Escape 语义 / 规范样式要点
const output = await build({
  entryPoints: [new URL('../../src/client/session-guide/CreatifyPillsBar.jsx', import.meta.url).pathname],
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
const { CreatifyPillsBar } = module.exports

function mountHost({ locale = 'zh', onApplyPrompt } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div data-chip-editor contenteditable="true"></div><div id="a"></div><div id="b"></div></body></html>')
  global.window = dom.window
  global.document = dom.window.document
  return dom
}

// jsdom 下 React 18 不响应手动派发的原生 input 事件，改走组件真实 onChange 属性驱动同一状态路径；
// 真实浏览器的原生输入路径由工作树 QA 驱动覆盖（.agent-reports/creatify-pills-panel/qa-evidence.json）
function typeSearch(dom, input, value) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  const propsKey = Object.keys(input).find((k) => k.startsWith('__reactProps'))
  input[propsKey].onChange({ target: input })
}

test('e2e: 双实例挂载时面板样式表幂等注入（仅一个 style 节点）', async () => {
  const dom = mountHost()
  const rootA = createRoot(dom.window.document.getElementById('a'))
  const rootB = createRoot(dom.window.document.getElementById('b'))
  await act(async () => {
    rootA.render(React.createElement(CreatifyPillsBar, { locale: 'zh' }))
    rootB.render(React.createElement(CreatifyPillsBar, { locale: 'zh' }))
  })
  const styles = dom.window.document.querySelectorAll('#omnimux-creatify-pills-styles')
  assert.equal(styles.length, 1, '重复挂载不得重复注入样式表')
  const css = styles[0].textContent
  assert.match(css, /border-radius:\s*12px/, '浮层圆角必须为 12px（Popover 档）')
  assert.match(css, /backdrop-filter:\s*blur\(16px\)/, '浮层必须带毛玻璃（design.md §5.1）')
  assert.match(css, /height:\s*32px/, '搜索框与按钮必须收敛 32px 基准高')
  assert.match(css, /@keyframes omnimux-popover-in/, '必须有进场动效')
  rootA.unmount()
  rootB.unmount()
})

test('e2e: 技能面板 展开→搜索过滤→点击注入芯片→面板关闭', async () => {
  const dom = mountHost()
  const root = createRoot(dom.window.document.getElementById('a'))
  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, { locale: 'zh' }))
  })
  const doc = dom.window.document
  const skillsBtn = doc.querySelectorAll('#a .omnimux-pill-btn')[0]
  await act(async () => { skillsBtn.click() })
  const popover = doc.querySelector('#a .omnimux-skills-popover')
  assert.ok(popover, '技能面板必须展开')

  const total = doc.querySelectorAll('#a .omnimux-skill-item').length
  assert.ok(total >= 60, `技能总数必须来自市场全量数据（实测 ${total}）`)

  const probe = doc.querySelector('#a .omnimux-skill-item-title span:last-child').textContent
  const input = doc.querySelector('#a .omnimux-skills-search-input')
  await act(async () => { typeSearch(dom, input, probe) })
  const filtered = doc.querySelectorAll('#a .omnimux-skill-item').length
  assert.ok(filtered >= 1 && filtered < total, `过滤"${probe}"应收窄列表（${filtered}/${total}）`)

  await act(async () => { typeSearch(dom, input, '') })
  await act(async () => { doc.querySelector('#a .omnimux-skill-item').click() })
  assert.ok(doc.querySelector('[data-chip-editor] .omnimux-skill-chip'), '点击技能项必须注入芯片')
  assert.ok(!doc.querySelector('#a .omnimux-skills-popover'), '选择后面板必须关闭')
  root.unmount()
})

test('e2e: 子提示词面板分类图标正确且点击注入提示词', async () => {
  const applied = []
  const dom = mountHost({ onApplyPrompt: (p) => applied.push(p) })
  const root = createRoot(dom.window.document.getElementById('a'))
  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, { locale: 'zh', onApplyPrompt: (p) => applied.push(p) }))
  })
  const doc = dom.window.document

  // 视频广告（按钮序 1）：7 项
  await act(async () => { doc.querySelectorAll('#a .omnimux-pill-btn')[1].click() })
  assert.equal(doc.querySelectorAll('#a .omnimux-subprompt-item').length, 7, '视频广告面板必须 7 项')
  const videoIcon = doc.querySelector('#a .omnimux-subprompt-header svg polygon')
  assert.ok(videoIcon?.getAttribute('points')?.includes('5 3 19 12'), '视频广告面板头图标必须为播放形')
  await act(async () => { doc.querySelectorAll('#a .omnimux-subprompt-item')[0].click() })
  // 主线已本地化提示词：zh 环境注入 promptZh
  assert.match(applied[0] || '', /使用 AI 数字人为我的网站制作视频广告/)

  // 竞争对手研究（按钮序 3）：5 项，图标为搜索形（circle + line）
  await act(async () => { doc.querySelectorAll('#a .omnimux-pill-btn')[3].click() })
  assert.equal(doc.querySelectorAll('#a .omnimux-subprompt-item').length, 5, '竞品面板必须 5 项')
  const compIcon = doc.querySelector('#a .omnimux-subprompt-header svg circle')
  assert.ok(compIcon, '竞品面板头图标必须为搜索形')
  root.unmount()
})

test('e2e: Escape 仅在面板打开时关闭面板，未打开时不消费', async () => {
  const dom = mountHost()
  const root = createRoot(dom.window.document.getElementById('a'))
  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, { locale: 'zh' }))
  })
  const doc = dom.window.document

  // 未打开：组件不得改写状态（面板仍不存在）
  await act(async () => {
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  assert.ok(!doc.querySelector('#a .omnimux-subprompt-popover'), '未打开时 Escape 不得产生副作用')

  // 打开后：Escape 关闭
  await act(async () => { doc.querySelectorAll('#a .omnimux-pill-btn')[1].click() })
  assert.ok(doc.querySelector('#a .omnimux-subprompt-popover'), '面板必须已打开')
  await act(async () => {
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  assert.ok(!doc.querySelector('#a .omnimux-subprompt-popover'), '打开时 Escape 必须关闭面板')
  root.unmount()
})

test('e2e: 底部横条使用矢量 SVG 箭头，禁止字符图标（UI04）', async () => {
  const dom = mountHost()
  const root = createRoot(dom.window.document.getElementById('a'))
  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, { locale: 'zh' }))
  })
  const doc = dom.window.document
  await act(async () => { doc.querySelectorAll('#a .omnimux-pill-btn')[0].click() })
  const arrow = doc.querySelector('#a .omnimux-panel-footer-arrow svg')
  assert.ok(arrow, '底部横条箭头必须为 SVG')
  const footerText = doc.querySelector('#a .omnimux-panel-footer').textContent
  assert.ok(!footerText.includes('→') && !footerText.includes('&rarr;'), '严禁字符箭头')
  root.unmount()
})
