import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const output = await build({
  entryPoints: [new URL('./CreativePresetsModal.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom', '../components/SplitModalDialog.jsx']
})

const module = { exports: {} }
// 模拟 SplitModalDialog 避免依赖完整客户端外壳
const req = createRequire(import.meta.url)
const customReq = (id) => {
  if (id.includes('SplitModalDialog.jsx')) {
    return {
      SplitModalDialog: ({ isOpen, onClose, leftContent, children, footer, leftTitle }) => {
        if (!isOpen) return null
        return React.createElement('div', { 'data-modal-open': 'true', className: 'split-modal-mock' },
          React.createElement('div', { className: 'mock-left' },
            React.createElement('h2', null, leftTitle),
            leftContent
          ),
          React.createElement('div', { className: 'mock-right' }, children),
          React.createElement('div', { className: 'mock-footer' }, footer)
        )
      }
    }
  }
  return req(id)
}

new Function('require', 'module', 'exports', output.outputFiles[0].text)(customReq, module, module.exports)
const { CreativePresetsModal } = module.exports

test('CreativePresetsModal: renders tabs, selects preset, and compiles draft on submit', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  let submittedPrompt = null
  let closed = false

  const root = createRoot(document.querySelector('#root'))
  await act(async () => {
    root.render(
      React.createElement(CreativePresetsModal, {
        isOpen: true,
        onClose: () => { closed = true },
        t: (k) => k,
        onSubmitDraft: (p) => { submittedPrompt = p }
      })
    )
  })

  // 1. 验证基础渲染
  const modalEl = document.querySelector('[data-modal-open="true"]')
  assert.ok(modalEl, 'Modal should be rendered')

  // 验证 Tab 数量
  const tabs = document.querySelectorAll('.omnimux-presets-tab')
  assert.equal(tabs.length, 3, 'Should have 3 main tabs (hooks, styles, formats)')

  // 2. 初始默认在 Hooks tab，验证卡片渲染
  const cards = document.querySelectorAll('.omnimux-preset-card')
  assert.ok(cards.length > 0, 'Should render hook cards')

  // 3. 点击选中第一个 Hook 卡片
  await act(async () => {
    cards[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })

  assert.ok(cards[0].classList.contains('is-selected'), 'First card should have is-selected class')

  // 验证左栏槽位已激活
  const activeSlot = document.querySelector('.omnimux-presets-slot-value.is-active')
  assert.ok(activeSlot, 'Blueprint slot should be active with selected item')

  // 4. 输入目标产品卖点 (通过 React Props 或 Event 触发)
  const textarea = document.querySelector('#creative-presets-user-query')
  assert.ok(textarea, 'Textarea should exist')
  await act(async () => {
    const propsKey = Object.keys(textarea).find((k) => k.startsWith('__reactProps$'))
    if (propsKey && textarea[propsKey]?.onChange) {
      textarea[propsKey].onChange({ target: { value: '超薄智能降噪耳机' } })
    }
  })

  // 5. 点击提交按钮
  const submitBtn = document.querySelector('.omnimux-presets-submit-btn')
  assert.ok(submitBtn, 'Submit button should exist')
  await act(async () => {
    submitBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })

  assert.ok(submittedPrompt, 'onSubmitDraft should be called with compiled prompt')
  assert.ok(submittedPrompt.includes('超薄智能降噪耳机'), 'Prompt should include user product query')
  assert.ok(submittedPrompt.includes('黄金前 3 秒吸睛抓手'), 'Prompt should include hook section')
  assert.equal(closed, true, 'Modal should be closed on submit')

  // 还原环境
  globalThis.window = previous.window
  globalThis.document = previous.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
})
