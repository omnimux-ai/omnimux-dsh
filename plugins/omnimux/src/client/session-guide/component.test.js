import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createGuideStore } from './state.js'
import { guideZh, guideEn } from './catalog.js'

const output = await build({ entryPoints: [new URL('./SessionGuide.jsx', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] })
const module = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const { SessionGuide } = module.exports

test('session guide switches drafts without a reference panel or send interception', async () => {
  const dom = new JSDOM('<div id="root" data-phase="hero"><div id="guide"></div><div data-composer-input="true" contenteditable="true"></div><button data-send-button>Send</button></div>', { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const store = createGuideStore()
  const root = createRoot(document.querySelector('#guide'))
  let owner = 'A'
  let draft = ''
  let phase = 'plain'
  let blank = true
  let writes = 0
  let sends = 0
  let workbenchSnapshot = { sessionId: 'A', state: { panelOpen: false } }
  const listeners = new Set()
  const workbench = { subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) }, getSnapshot: () => workbenchSnapshot }
  const setPanel = (sessionId, panelOpen) => act(async () => {
    workbenchSnapshot = { sessionId, state: { panelOpen } }
    for (const listener of listeners) listener()
  })
  const props = () => ({ sessionId: owner, useSession: selector => selector({ blank }), useConversation: selector => selector({ activeTargets: new Set() }),
    useInput: selector => selector({ draft, phase }), inputActions: { setDraft(value) { draft = value; writes++ } },
    getCurrentSessionId: () => owner, store, workbench, t: key => key,
  })
  const render = () => act(async () => root.render(React.createElement(SessionGuide, props())))
  const click = async selector => act(async () => document.querySelector(selector).click())
  document.querySelector('[data-send-button]').addEventListener('click', () => sends++)
  try {
    await render()
    assert.equal(document.querySelectorAll('[data-starter-id]').length, 10)
    const first = document.querySelector('[data-starter-id]').dataset.starterId
    await click(`[data-starter-id="${first}"]`)
    await render()
    assert.equal(writes, 1)
    await click(`[data-starter-id="${first}"]`)
    assert.equal(writes, 1)
    draft += '\nuser edit'
    await render()
    const second = document.querySelectorAll('[data-starter-id]')[4].dataset.starterId
    await click(`[data-starter-id="${second}"]`)
    assert.equal(document.querySelector('.omnimux-starter-confirm'), null)
    assert.equal(draft, `guide.${second}.prompt`)
    assert.equal(store.get(owner).selectedId, second)
    assert.equal(sends, 0, 'choosing a task never submits')
    for (const button of document.querySelectorAll('[data-starter-id]')) {
      await click(`[data-starter-id="${button.dataset.starterId}"]`)
      await render()
      assert.equal(document.querySelector('.omnimux-starter-materials'), null)
    }
    draft += '\nkeep this edit'
    await render()
    const savedDraft = draft
    const savedState = store.get(owner)
    const savedWrites = writes
    await setPanel(owner, true)
    assert.equal(document.querySelector('[data-omnimux-starter-guide]'), null)
    assert.equal(document.querySelector('[data-omnimux-starter-host]'), null)
    await setPanel(owner, false)
    assert.equal(document.querySelectorAll('[data-starter-id]').length, 10)
    assert.ok(document.querySelector('[data-omnimux-starter-host]'))
    assert.equal(draft, savedDraft)
    assert.equal(store.get(owner), savedState)
    assert.equal(writes, savedWrites)
    await setPanel('another-session', true)
    assert.equal(document.querySelectorAll('[data-starter-id]').length, 10)
    await click('[data-send-button]')
    assert.equal(sends, 1, 'normal send needs no extra synchronization gesture')
    owner = 'B'
    draft = ''
    await render()
    assert.equal(document.querySelector('.omnimux-starter-materials'), null)
    assert.equal(store.get('B').selectedId, null)
    blank = false
    await render()
    assert.equal(document.querySelector('[data-omnimux-starter-guide]'), null)
    assert.equal(document.querySelector('[data-omnimux-starter-host]'), null)
  } finally {
    await act(async () => root.unmount())
    store.dispose()
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})

test('popular starters render 4 cards and marketing insight modal flows draft into input', async () => {
  const dom = new JSDOM('<div id="root" data-phase="hero"><div id="guide"></div><div data-composer-input="true" contenteditable="true"></div></div>', { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const store = createGuideStore()
  const root = createRoot(document.querySelector('#guide'))
  let draft = ''
  let writes = 0
  const workbenchSnapshot = { sessionId: 'A', state: { panelOpen: false } }
  const workbench = { subscribe: () => () => {}, getSnapshot: () => workbenchSnapshot }
  const props = (localeMap = guideZh) => ({
    sessionId: 'A', useSession: s => s({ blank: true }), useConversation: s => s({ activeTargets: new Set() }),
    useInput: s => s({ draft, phase: 'plain' }), inputActions: { setDraft(v) { draft = v; writes++ } },
    getCurrentSessionId: () => 'A', store, workbench, t: key => localeMap[key] || key,
  })
  const render = (localeMap = guideZh) => act(async () => root.render(React.createElement(SessionGuide, props(localeMap))))
  const click = async sel => act(async () => document.querySelector(sel).click())

  try {
    // 1. 中文环境渲染与验证
    await render(guideZh)
    // 验证 4 个卡片均已呈现
    const popularCards = document.querySelectorAll('[data-popular-starter-id]')
    assert.equal(popularCards.length, 4)
    assert.equal(popularCards[0].dataset.popularStarterId, 'marketing-insight')
    assert.equal(popularCards[1].dataset.popularStarterId, 'url-to-video')
    assert.equal(popularCards[2].dataset.popularStarterId, 'recreate-viral-ads')
    assert.equal(popularCards[3].dataset.popularStarterId, 'creative-presets')

    // 2. 点击创意营销预设卡片打开全功能模态框
    await click('[data-popular-starter-id="creative-presets"]')
    await render(guideZh)
    assert.ok(document.querySelector('.omnimux-creative-presets-modal'))
    // 点击模态框提交按钮回填草稿
    await click('.omnimux-preset-card')
    await click('.omnimux-presets-submit-btn')
    await render(guideZh)
    assert.equal(document.querySelector('.omnimux-creative-presets-modal'), null)
    assert.ok(draft.includes('营销视频创意指令'))
    assert.equal(writes, 1)

    // 3. 点击营销洞察卡片打开模态框，验证中文 Prompt 预填
    await click('[data-popular-starter-id="marketing-insight"]')
    await render(guideZh)
    const modal = document.querySelector('.omnimux-insight-modal')
    assert.ok(modal, 'modal should open')
    const items = document.querySelectorAll('[data-insight-id]')
    assert.equal(items.length, 6)
    const initialTextarea = document.querySelector('.omnimux-insight-textarea')
    assert.ok(initialTextarea.value.includes('请为[目标市场]中的[产品/品牌]寻找并筛选候选 TikTok 创作者'))

    // 4. 切换到第2项（广告ROAS分析），验证中文 Prompt 动态切换
    await click(`[data-insight-id="${items[1].dataset.insightId}"]`)
    await render(guideZh)
    const textarea = document.querySelector('.omnimux-insight-textarea')
    assert.ok(textarea.value.includes('结合[归因窗口]和[产品利润率]，按照[目标 ROAS/CPA]'))

    // 5. 点击“开始洞察 ->”按钮，提交草稿
    await click('.omnimux-insight-submit')
    await render(guideZh)
    assert.equal(document.querySelector('.omnimux-insight-modal'), null, 'modal should close')
    assert.ok(draft.includes('结合[归因窗口]和[产品利润率]，按照[目标 ROAS/CPA]'))
    assert.equal(writes, 2)

    // 6. 英文语言环境自适应验证
    await render(guideEn)
    await click('[data-popular-starter-id="marketing-insight"]')
    await render(guideEn)
    await click('[data-insight-id="tiktok-creators"]')
    await render(guideEn)
    const enTextarea = document.querySelector('.omnimux-insight-textarea')
    assert.ok(enTextarea.value.includes('Find and shortlist TikTok creators for [product/brand] in [target market]'))
    await click('.omnimux-insight-close')
    await render(guideEn)
  } finally {
    await act(async () => root.unmount())
    store.dispose()
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})

test('url to video modal renders carousel and submits video ad prompt', async () => {
  const dom = new JSDOM('<div id="root" data-phase="hero"><div id="guide"></div><div data-composer-input="true" contenteditable="true"></div></div>', { url: 'http://localhost/' })
  dom.window.HTMLInputElement.prototype.attachEvent = () => {}
  dom.window.HTMLTextAreaElement.prototype.attachEvent = () => {}
  dom.window.HTMLElement.prototype.attachEvent = () => {}
  dom.window.Element.prototype.attachEvent = () => {}
  dom.window.Element.prototype.detachEvent = () => {}
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const store = createGuideStore()
  const root = createRoot(document.querySelector('#guide'))
  let draft = ''
  let writes = 0
  const workbenchSnapshot = { sessionId: 'A', state: { panelOpen: false } }
  const workbench = { subscribe: () => () => {}, getSnapshot: () => workbenchSnapshot }
  const props = (localeMap = guideZh) => ({
    sessionId: 'A', useSession: s => s({ blank: true }), useConversation: s => s({ activeTargets: new Set() }),
    useInput: s => s({ draft, phase: 'plain' }), inputActions: { setDraft(v) { draft = v; writes++ } },
    getCurrentSessionId: () => 'A', store, workbench, t: key => localeMap[key] || key,
  })
  const render = (localeMap = guideZh) => act(async () => root.render(React.createElement(SessionGuide, props(localeMap))))
  const click = async sel => act(async () => document.querySelector(sel).click())

  try {
    await render(guideZh)
    // 1. 点击“视频网址”卡片打开弹窗
    await click('[data-popular-starter-id="url-to-video"]')
    await render(guideZh)
    const modal = document.querySelector('.omnimux-u2v-modal')
    assert.ok(modal, 'url-to-video modal should open')

    // 2. 验证左侧轮播卡片与右侧表单输入项
    const cards = document.querySelectorAll('.omnimux-u2v-card')
    assert.ok(cards.length >= 1)

    // 3. 未输入 URL 点击提交，触发错误提示
    await click('.omnimux-u2v-submit')
    await render(guideZh)
    assert.ok(document.querySelector('.omnimux-u2v-error'))
    assert.equal(writes, 0)

    // 4. 输入 URL 并切换风格与画幅
    const input = document.querySelector('.omnimux-u2v-input')
    await act(async () => {
      const propKey = Object.keys(input).find(k => k.startsWith('__reactProps$'))
      if (propKey && input[propKey]?.onChange) {
        input[propKey].onChange({ target: { value: 'https://www.amazon.com/dp/B09XYZ1234' } })
      }
    })

    // 选择 UGC 风格
    const styleBtns = document.querySelectorAll('.omnimux-u2v-style-btn')
    assert.equal(styleBtns.length, 9)
    await click('.omnimux-u2v-style-btn:nth-child(7)')

    // 选择 16:9 比例
    const ratioBtns = document.querySelectorAll('.omnimux-u2v-ratio-btn')
    assert.equal(ratioBtns.length, 6)
    await click('.omnimux-u2v-ratio-btn:nth-child(2)')

    // 5. 点击提交
    await click('.omnimux-u2v-submit')
    await render(guideZh)
    assert.equal(document.querySelector('.omnimux-u2v-modal'), null, 'modal should close')
    assert.ok(draft.includes('https://www.amazon.com/dp/B09XYZ1234'))
    assert.ok(draft.includes('16:9'))
    assert.equal(writes, 1)
  } finally {
    await act(async () => root.unmount())
    store.dispose()
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})

test('recreate viral ads modal allows mode selection, handles file selection and submits prompt', async () => {
  const dom = new JSDOM('<div id="root" data-phase="hero"><div id="guide"></div><div data-composer-input="true" contenteditable="true"></div></div>', { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const store = createGuideStore()
  const root = createRoot(document.querySelector('#guide'))
  let draft = ''
  let writes = 0
  const workbenchSnapshot = { sessionId: 'A', state: { panelOpen: false } }
  const workbench = { subscribe: () => () => {}, getSnapshot: () => workbenchSnapshot }
  const props = (localeMap = guideZh) => ({
    sessionId: 'A', useSession: s => s({ blank: true }), useConversation: s => s({ activeTargets: new Set() }),
    useInput: s => s({ draft, phase: 'plain' }), inputActions: { setDraft(v) { draft = v; writes++ } },
    getCurrentSessionId: () => 'A', store, workbench, t: key => localeMap[key] || key,
  })
  const render = (localeMap = guideZh) => act(async () => root.render(React.createElement(SessionGuide, props(localeMap))))
  const click = async sel => act(async () => document.querySelector(sel).click())

  try {
    await render(guideZh)
    // 1. 点击“重现病毒式广告”卡片打开弹窗
    await click('[data-popular-starter-id="recreate-viral-ads"]')
    await render(guideZh)
    const modal = document.querySelector('.omnimux-recreate-modal')
    assert.ok(modal, 'recreate viral ads modal should open')

    // 2. 验证弹窗外侧独立右上角关闭按钮存在，点击可关闭
    const closeBtn = document.querySelector('.omnimux-split-modal-close')
    assert.ok(closeBtn, 'external close button should be present')
    await click('.omnimux-split-modal-close')
    await render(guideZh)
    assert.equal(document.querySelector('.omnimux-recreate-modal'), null, 'modal should close on close button click')

    // 3. 再次打开弹窗并测试交互流程
    await click('[data-popular-starter-id="recreate-viral-ads"]')
    await render(guideZh)

    // 4. 轮播切换测试
    const navDown = document.querySelector('.omnimux-recreate-nav-down')
    assert.ok(navDown)
    await click('.omnimux-recreate-nav-down')
    await render(guideZh)

    // 5. 克隆模式切换测试
    const modeCards = document.querySelectorAll('.omnimux-clone-mode-card')
    assert.equal(modeCards.length, 2)
    // 切换到“重现结构”
    await click('.omnimux-clone-mode-card:nth-child(1)')
    await render(guideZh)
    assert.ok(document.querySelector('.omnimux-clone-mode-card:nth-child(1)').classList.contains('active'))

    // 6. 未选视频点击提交，被拦截并提示
    await click('.omnimux-recreate-submit-btn')
    await render(guideZh)
    assert.ok(document.querySelector('.omnimux-recreate-error-msg'))
    assert.equal(writes, 0)

    // 7. 模拟目标视频文件选择
    const videoInput = document.querySelector('input[type="file"][accept*="video"]')
    assert.ok(videoInput)
    const fakeVideoFile = new dom.window.File(['video bytes'], 'viral-hook-sample.mp4', { type: 'video/mp4' })
    await act(async () => {
      const propKey = Object.keys(videoInput).find(k => k.startsWith('__reactProps$'))
      if (propKey && videoInput[propKey]?.onChange) {
        videoInput[propKey].onChange({ target: { files: [fakeVideoFile], value: '' } })
      }
    })
    await render(guideZh)
    assert.ok(document.querySelector('.omnimux-recreate-selected-file-card'))
    assert.ok(document.querySelector('.omnimux-recreate-file-name').textContent.includes('viral-hook-sample.mp4'))

    // 8. 输入新视频内容描述
    const textarea = document.querySelector('.omnimux-recreate-textarea')
    assert.ok(textarea)
    await act(async () => {
      const propKey = Object.keys(textarea).find(k => k.startsWith('__reactProps$'))
      if (propKey && textarea[propKey]?.onChange) {
        textarea[propKey].onChange({ target: { value: '替换为轻奢女装产品展示，突出优雅剪裁与面料垂坠感' } })
      }
    })
    await render(guideZh)

    // 9. 模拟添加参考素材文件
    const refInput = document.querySelectorAll('input[type="file"]')[1]
    assert.ok(refInput)
    const fakeImageFile = new dom.window.File(['img bytes'], 'dress-ref-1.jpg', { type: 'image/jpeg' })
    await act(async () => {
      const propKey = Object.keys(refInput).find(k => k.startsWith('__reactProps$'))
      if (propKey && refInput[propKey]?.onChange) {
        refInput[propKey].onChange({ target: { files: [fakeImageFile], value: '' } })
      }
    })
    await render(guideZh)
    assert.equal(document.querySelectorAll('.omnimux-recreate-ref-pill').length, 1)

    // 10. 点击提交按钮
    await click('.omnimux-recreate-submit-btn')
    await render(guideZh)
    assert.equal(document.querySelector('.omnimux-recreate-modal'), null, 'modal should close')
    assert.ok(draft.includes('viral-hook-sample.mp4'))
    assert.ok(draft.includes('重现结构'))
    assert.ok(draft.includes('替换为轻奢女装产品展示'))
    assert.ok(draft.includes('dress-ref-1.jpg'))
    assert.equal(writes, 1)
  } finally {
    await act(async () => root.unmount())
    store.dispose()
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})
