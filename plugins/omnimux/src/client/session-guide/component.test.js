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

/** 加载会话附件 Store：复刻板块写入的就是这个全局单例，断言看到的是真实挂载结果。 */
async function loadAttachmentStore() {
  const output = await build({ entryPoints: [new URL('../attachments/store.ts', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] })
  const attachments = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), attachments, attachments.exports)
  return attachments.exports
}

/** 刷新微任务队列，让真源拉取的 promise 与 React 提交都落地。 */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
  })
}

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
    // 面板打开 ⇒ 分栏紧凑态：卡片流撤场，但简洁模式宿主仍在（#1591 契约）。
    assert.equal(document.querySelectorAll('[data-starter-id]').length, 0, '面板打开时收回完整卡片流')
    assert.ok(
      Boolean(document.querySelector('[data-omnimux-starter-guide].is-compact')),
      '面板打开时必须保留会话栏简洁模式宿主',
    )
    assert.ok(
      Boolean(document.querySelector('[data-omnimux-starter-host]')),
      '简洁模式仍要挂 starter-host，输入框才能贴底',
    )
    await setPanel(owner, false)
    assert.equal(document.querySelectorAll('[data-starter-id]').length, 10)
    assert.ok(document.querySelector('[data-omnimux-starter-host]'))
    assert.equal(draft, savedDraft)
    assert.equal(store.get(owner), savedState)
    assert.equal(writes, savedWrites)
    await setPanel('another-session', true)
    assert.equal(document.querySelectorAll('[data-starter-id]').length, 0, 'workbench 全局分栏打开时不渲染完整卡片')
    assert.ok(
      document.querySelector('[data-omnimux-starter-guide].is-compact'),
      '分栏紧凑态下必须保留会话栏简洁模式宿主与输入框',
    )
    await setPanel('another-session', false)
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
    assert.equal(popularCards[3].dataset.popularStarterId, 'bulk-create-ads')

    // 2. 点击批量创建广告卡片打开全功能模态框
    await click('[data-popular-starter-id="bulk-create-ads"]')
    await render(guideZh)
    assert.ok(document.querySelector('.omnimux-bulk-modal'))
    // 输入简报并提交
    const briefInput = document.querySelector('.omnimux-bulk-textarea')
    await act(async () => {
      const propKey = Object.keys(briefInput).find(k => k.startsWith('__reactProps$'))
      if (propKey && briefInput[propKey]?.onChange) {
        briefInput[propKey].onChange({ target: { value: '智能发光降噪耳机快速开箱测评' } })
      }
    })
    await click('.omnimux-bulk-submit-btn')
    await render(guideZh)
    assert.equal(document.querySelector('.omnimux-bulk-modal'), null)
    assert.ok(draft.includes('智能发光降噪耳机快速开箱测评'))
    assert.equal(writes, 1)

    // 3. 点击营销洞察卡片打开模态框，验证结构化表单与必填/选填标识
    await click('[data-popular-starter-id="marketing-insight"]')
    await render(guideZh)
    const modal = document.querySelector('.omnimux-insight-modal')
    assert.ok(modal, 'modal should open')
    const items = document.querySelectorAll('[data-insight-id]')
    assert.equal(items.length, 6)
    
    // 验证当前选中的 TikTok 创作者场景表单渲染
    assert.ok(document.querySelector('.omnimux-insight-form-container'))
    const productField = document.querySelector('[data-insight-field="product"]')
    assert.ok(productField, 'product input field should be present')
    const reqTags = document.querySelectorAll('.omnimux-insight-required-tag')
    assert.ok(reqTags.length >= 1, 'required tags should be rendered')
    const optTags = document.querySelectorAll('.omnimux-insight-optional-tag')
    assert.ok(optTags.length >= 1, 'optional tags should be rendered')

    // 4. 未填必填项直接提交，触发校验提示
    await click('.omnimux-insight-submit')
    await render(guideZh)
    assert.ok(document.querySelector('.omnimux-insight-error-banner'), 'validation error banner should be visible')
    assert.equal(writes, 1, 'no draft write should happen on validation failure')

    // 5. 填写必填项并提交
    await act(async () => {
      const prodProps = Object.keys(productField).find(k => k.startsWith('__reactProps$'))
      if (prodProps && productField[prodProps]?.onChange) {
        productField[prodProps].onChange({ target: { value: '智能骨传导运动耳机' } })
      }
      const marketField = document.querySelector('[data-insight-field="market"]')
      const mktProps = Object.keys(marketField).find(k => k.startsWith('__reactProps$'))
      if (mktProps && marketField[mktProps]?.onChange) {
        marketField[mktProps].onChange({ target: { value: '欧美市场' } })
      }
    })
    await click('.omnimux-insight-submit')
    await render(guideZh)
    assert.equal(document.querySelector('.omnimux-insight-modal'), null, 'modal should close')
    assert.ok(draft.includes('智能骨传导运动耳机'), 'draft should contain entered product')
    assert.ok(draft.includes('欧美市场'), 'draft should contain entered market')
    assert.equal(writes, 2)

    // 6. 再次打开并切换到第2项（广告ROAS分析），验证场景表单字段联动切换
    await click('[data-popular-starter-id="marketing-insight"]')
    await render(guideZh)
    await click(`[data-insight-id="${items[1].dataset.insightId}"]`)
    await render(guideZh)
    const platformField = document.querySelector('[data-insight-field="platform"]')
    assert.ok(platformField, 'platform input should be present for ads-roas')
    await click('.omnimux-insight-close')
    await render(guideZh)
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

    // 4. 输入 URL 并切换风格、画幅与时长
    const input = document.querySelector('.omnimux-u2v-input')
    await act(async () => {
      const propKey = Object.keys(input).find(k => k.startsWith('__reactProps$'))
      if (propKey && input[propKey]?.onChange) {
        input[propKey].onChange({ target: { value: 'https://www.amazon.com/dp/B09XYZ1234' } })
      }
    })

    // 验证目标时长滑块默认不处于禁用态，可直接拖动并自动解除自动状态
    const autoBtn = document.querySelector('.omnimux-u2v-auto-btn')
    const slider = document.querySelector('.omnimux-u2v-slider')
    const durationLabel = document.querySelector('.omnimux-u2v-duration-label')
    assert.equal(slider.disabled, false, 'slider must never be disabled in auto mode')
    assert.equal(autoBtn.getAttribute('aria-pressed'), 'true')
    assert.equal(durationLabel.textContent.trim(), '自动')

    // 模拟用户直接拖拽滑块至 30 秒
    await act(async () => {
      const sliderProps = Object.keys(slider).find(k => k.startsWith('__reactProps$'))
      if (sliderProps && slider[sliderProps]?.onChange) {
        slider[sliderProps].onChange({ target: { value: '30' } })
      }
    })
    await render(guideZh)
    assert.equal(autoBtn.getAttribute('aria-pressed'), 'false', 'auto mode should be toggled off after dragging slider')
    assert.equal(durationLabel.textContent.trim(), '30s', 'duration label should update to 30s')

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

test('bulk create ads modal allows brief, references, ratio, duration, stepper and submits prompt', async () => {
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
    // 1. 点击卡片打开批量创建广告模态框
    await click('[data-popular-starter-id="bulk-create-ads"]')
    await render(guideZh)
    const modal = document.querySelector('.omnimux-bulk-modal')
    assert.ok(modal, 'bulk create ads modal should open')

    // 2. 验证右上角外侧关闭按钮并测试点击关闭
    const closeBtn = document.querySelector('.omnimux-split-modal-close')
    assert.ok(closeBtn)
    await click('.omnimux-split-modal-close')
    await render(guideZh)
    assert.equal(document.querySelector('.omnimux-bulk-modal'), null)

    // 3. 再次打开
    await click('[data-popular-starter-id="bulk-create-ads"]')
    await render(guideZh)

    // 4. 扇形轮播切换
    await click('.omnimux-bulk-nav-next')
    await render(guideZh)

    // 5. 空简报提交应被阻断
    await click('.omnimux-bulk-submit-btn')
    await render(guideZh)
    assert.ok(document.querySelector('.omnimux-bulk-error-msg'))
    assert.equal(writes, 0)

    // 6. 填写创意简报
    const textarea = document.querySelector('.omnimux-bulk-textarea')
    assert.ok(textarea)
    await act(async () => {
      const propKey = Object.keys(textarea).find(k => k.startsWith('__reactProps$'))
      if (propKey && textarea[propKey]?.onChange) {
        textarea[propKey].onChange({ target: { value: '智能温感保温杯，突出长效锁温与极简外观' } })
      }
    })
    await render(guideZh)

    // 7. 模拟添加参考素材
    const fileInput = document.querySelector('input[type="file"]')
    assert.ok(fileInput)
    const fakeFile = new dom.window.File(['ref'], 'cup-spec.png', { type: 'image/png' })
    await act(async () => {
      const propKey = Object.keys(fileInput).find(k => k.startsWith('__reactProps$'))
      if (propKey && fileInput[propKey]?.onChange) {
        fileInput[propKey].onChange({ target: { files: [fakeFile], value: '' } })
      }
    })
    await render(guideZh)
    assert.equal(document.querySelectorAll('.omnimux-bulk-ref-pill').length, 1)

    // 8. 切换画幅比例为 16:9
    const ratioBtns = document.querySelectorAll('.omnimux-bulk-ratio-btn')
    assert.equal(ratioBtns.length, 5)
    await click('.omnimux-bulk-ratio-btn:nth-child(1)')
    await render(guideZh)

    // 9. 操作步进器增加视频生成数量至 5
    const stepperPlus = document.querySelectorAll('.omnimux-bulk-stepper-btn')[1]
    assert.ok(stepperPlus)
    await click('.omnimux-bulk-stepper-btn:nth-child(3)')
    await render(guideZh)
    assert.equal(document.querySelector('.omnimux-bulk-stepper-value').textContent, '5')

    // 10. 点击生成批量创意方案
    await click('.omnimux-bulk-submit-btn')
    await render(guideZh)
    assert.equal(document.querySelector('.omnimux-bulk-modal'), null, 'modal should close')
    assert.ok(draft.includes('智能温感保温杯'))
    assert.ok(draft.includes('16:9'))
    assert.ok(draft.includes('5 条独立创意变体'))
    assert.ok(draft.includes('cup-spec.png'))
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

// ─────────────────────────────────────────────────────────────
// 复刻吸底：回执交给界面本体（附件缩略图 + 技能药丸），不再叠弹窗
// ─────────────────────────────────────────────────────────────

/** 灵感库真实行：复刻对象要能从真源映射出封面、标题与时长。 */
const REPLICATE_TRENDING_ROWS = [
  {
    id: 'insp_us_beauty',
    title: 'US beauty hook',
    country_code: 'US',
    category: 'beauty',
    cover_url: '/omnimux/inspiration/local/media/covers/us-beauty.jpg',
    source_url: '/omnimux/inspiration/local/media/videos/us-beauty.mp4',
    stats: { likes: 300000, comments: 20000, shares: 5000, views: 12000000 },
    deconstruction: { hook_highlight: '开场 3 秒反差' },
  },
]

test('复刻吸底：写入输入框不再弹「已填入」提示，回执由附件与技能药丸承担', async () => {
  const dom = new JSDOM(
    '<div id="root" data-phase="hero"><div id="guide"></div><div data-composer-card><div data-composer-input="true" contenteditable="true"></div></div></div>',
    { url: 'http://localhost/' },
  )
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
    fetch: globalThis.fetch,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const attachmentStore = await loadAttachmentStore()
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: { items: REPLICATE_TRENDING_ROWS, total: REPLICATE_TRENDING_ROWS.length } }) })

  const store = createGuideStore()
  const sessionId = 'sess-replicate-toast'
  const attachmentDrafts = new Map()
  let draft = ''
  let writes = 0
  const workbenchSnapshot = { sessionId, state: { panelOpen: false } }
  const workbench = { subscribe: () => () => {}, getSnapshot: () => workbenchSnapshot }
  const props = {
    sessionId,
    useSession: (selector) => selector({ blank: true }),
    useConversation: (selector) => selector({ activeTargets: new Set() }),
    useInput: (selector) => selector({ draft, phase: 'plain' }),
    inputActions: { setDraft(value) { draft = value; writes++ } },
    getCurrentSessionId: () => sessionId,
    attachmentDrafts,
    store,
    workbench,
    t: (key) => guideZh[key] || key,
  }
  const globalStore = attachmentStore.getGlobalAttachmentStore()
  globalStore.clear(sessionId)
  globalStore.setActiveSessionId(sessionId)
  const root = createRoot(document.querySelector('#guide'))
  const render = () => act(async () => root.render(React.createElement(SessionGuide, props)))
  try {
    await render()
    await flushMicrotasks()
    const card = document.querySelector('[data-trending-id]')
    assert.ok(card, '复刻板块必须渲染出对标卡片（前置条件成立）')
    assert.equal(document.querySelector('.omnimux-toast-pill'), null, '点之前本来就没有弹窗')

    await act(async () => {
      card.querySelector('.omnimux-trending-recreate-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    await flushMicrotasks()

    assert.equal(draft, '复刻这条爆款视频', '复刻指令仍要预填进输入框')
    assert.equal(writes, 1, '只写一次，仍不代发')
    assert.equal(globalStore.getSnapshot(sessionId).length, 1, '复刻对象仍要挂进附件栏（界面回执之一）')
    assert.equal(window.__omnimuxActiveSkill?.slug, 'video-deconstruct', '技能药丸仍要点亮（界面回执之二）')
    assert.equal(
      document.querySelector('.omnimux-toast-pill'),
      null,
      '有了附件缩略图与技能药丸，不得再弹「已把复刻指令填入下方输入框，可直接发送」',
    )
    assert.ok(
      !document.body.textContent.includes('已把复刻指令填入下方输入框'),
      '弹窗文案不得出现在页面上',
    )
  } finally {
    await act(async () => root.unmount())
    globalStore.clear(sessionId)
    window.__omnimuxActiveSkill = null
    store.dispose()
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
    globalThis.fetch = previous.fetch
  }
})

// ─────────────────────────────────────────────────────────────
// 分栏（中间栏）：只保留简洁对话模式，不渲染完整引导卡片
// ─────────────────────────────────────────────────────────────

/** jsdom 没有布局，宽度只能按元素打桩。 */
function stubWidth(node, read) {
  Object.defineProperty(node, 'getBoundingClientRect', {
    configurable: true,
    value: () => {
      const width = read()
      return { width, height: 600, top: 0, left: 0, right: width, bottom: 600, x: 0, y: 0 }
    },
  })
}

test('分栏中间栏收回完整卡片：右栏展开 / 会话列挤窄 / 输入框紧凑档任一命中', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="dshDesktopFrame" data-rightbar-collapsed="true">
      <div class="frame_centerCol">
        <div id="root" data-phase="hero"><div id="guide"></div><div data-composer-input="true" contenteditable="true"></div></div>
      </div>
      <div class="frame_rightbarCol" data-rightbar-col></div>
    </div>
  </body></html>`, { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const frame = document.querySelector('.dshDesktopFrame')
  const widths = { rightbar: 1028, column: 1200 }
  stubWidth(document.querySelector('[data-rightbar-col]'), () => widths.rightbar)
  stubWidth(document.querySelector('.frame_centerCol'), () => widths.column)
  const store = createGuideStore()
  const root = createRoot(document.querySelector('#guide'))
  const workbench = { subscribe: () => () => {}, getSnapshot: () => ({ sessionId: 'A', state: { panelOpen: false } }) }
  const props = {
    sessionId: 'A', useSession: (selector) => selector({ blank: true }), useConversation: (selector) => selector({ activeTargets: new Set() }),
    useInput: (selector) => selector({ draft: '', phase: 'plain' }), inputActions: { setDraft() {} },
    getCurrentSessionId: () => 'A', store, workbench, t: (key) => key,
  }
  const render = () => act(async () => root.render(React.createElement(SessionGuide, props)))
  /** 让 MutationObserver 的微任务与 React 提交都落地。 */
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  const guideMounted = () => document.querySelectorAll('[data-starter-id]').length === 10
    && Boolean(document.querySelector('[data-omnimux-starter-host]'))
  const guideCompact = () => document.querySelectorAll('[data-starter-id]').length === 0
    && Boolean(document.querySelector('[data-omnimux-starter-guide].is-compact'))
    && Boolean(document.querySelector('[data-omnimux-starter-host]'))

  try {
    await render()
    assert.ok(guideMounted(), '全宽空白会话仍要渲染完整引导卡片（零回退基线）')
    assert.equal(document.documentElement.hasAttribute('data-omnimux-split-compact'), false)

    // 1) 右侧侧栏真实展开（内存 panelOpen 仍是 false）
    await act(async () => { frame.removeAttribute('data-rightbar-collapsed') })
    await settle()
    assert.ok(guideCompact(), '右侧侧栏展开时必须正常展示会话栏简洁模式')
    assert.equal(
      document.documentElement.getAttribute('data-omnimux-split-compact'),
      'true',
      '分栏判定必须镜像到 html，供 CSS 兜底',
    )

    // 2) 收起右侧侧栏：完整卡片平滑回归
    await act(async () => { frame.setAttribute('data-rightbar-collapsed', 'true') })
    await settle()
    assert.ok(guideMounted(), '侧栏收起后必须恢复完整引导卡片')
    assert.equal(document.documentElement.hasAttribute('data-omnimux-split-compact'), false)

    // 3) 侧栏收起但会话被挤成中间栏窄列
    await act(async () => {
      widths.column = 680
      dom.window.dispatchEvent(new dom.window.Event('resize'))
    })
    await settle()
    assert.ok(guideCompact(), '中间栏窄列同样正常展示会话栏简洁模式')

    // 4) 会话列回到全宽
    await act(async () => {
      widths.column = 1200
      dom.window.dispatchEvent(new dom.window.Event('resize'))
    })
    await settle()
    assert.ok(guideMounted(), '会话列回到全宽后必须恢复完整引导卡片')

    // 5) 输入框降到紧凑档：分栏紧凑态同样收回卡片保留简洁模式
    await act(async () => { document.documentElement.setAttribute('data-omnimux-composer-density', 'icon') })
    await settle()
    assert.ok(guideCompact(), '输入框紧凑档下正常展示会话栏简洁模式')
    await act(async () => { document.documentElement.setAttribute('data-omnimux-composer-density', 'full') })
    await settle()
    assert.ok(guideMounted(), '输入框回到全档后必须恢复完整引导卡片')
  } finally {
    await act(async () => root.unmount())
    document.documentElement.removeAttribute('data-omnimux-composer-density')
    store.dispose()
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})

test('陈旧的 panelOpen 拦不住引导：官方右栏收起后必须按 DOM 实测放行', async () => {
  // 复刻 #1588 的卡死路径：右栏打开过「技能/专家」→ 工作台把 panelOpen 写成 true；
  // 官方右栏随后被原生折叠，没有任何观察者把这次折叠写回 store —— panelOpen 仍是 true。
  // 门控必须以 DOM 实测为准，否则引导与卡片会被永久挡在门外。
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="dshDesktopFrame">
      <div class="frame_centerCol">
        <div id="root" data-phase="hero"><div id="guide"></div><div data-composer-input="true" contenteditable="true"></div></div>
      </div>
      <div class="frame_rightbarCol" data-rightbar-col></div>
    </div>
  </body></html>`, { url: 'http://localhost/' })
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const frame = document.querySelector('.dshDesktopFrame')
  const widths = { rightbar: 778, column: 1448 }
  stubWidth(document.querySelector('[data-rightbar-col]'), () => widths.rightbar)
  stubWidth(document.querySelector('.frame_centerCol'), () => widths.column)
  const store = createGuideStore()
  const root = createRoot(document.querySelector('#guide'))
  let panelOpen = true
  const listeners = new Set()
  const workbench = {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => ({ sessionId: 'A', state: { panelOpen } }),
  }
  const props = {
    sessionId: 'A', useSession: (selector) => selector({ blank: true }), useConversation: (selector) => selector({ activeTargets: new Set() }),
    useInput: (selector) => selector({ draft: '', phase: 'plain' }), inputActions: { setDraft() {} },
    getCurrentSessionId: () => 'A', store, workbench, t: (key) => key,
  }
  const render = () => act(async () => root.render(React.createElement(SessionGuide, props)))
  /** 让 MutationObserver 的微任务与 React 提交都落地。 */
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  const guideMounted = () => document.querySelectorAll('[data-starter-id]').length === 10
    && Boolean(document.querySelector('[data-omnimux-starter-host]'))
  const guideCompact = () => document.querySelectorAll('[data-starter-id]').length === 0
    && Boolean(document.querySelector('[data-omnimux-starter-guide].is-compact'))

  try {
    // 1) 右栏真展开 + panelOpen=true（技能/专家已打开）：完整卡片必须让位
    await render()
    await settle()
    assert.ok(guideCompact(), '右栏展开且工作台面板打开时只保留会话栏简洁模式')
    assert.equal(document.documentElement.getAttribute('data-omnimux-split-compact'), 'true')

    // 2) 官方右栏收起，panelOpen 保持陈旧的 true：实测已折叠 → 完整卡片必须回归
    await act(async () => { frame.setAttribute('data-rightbar-collapsed', 'true') })
    await settle()
    assert.equal(panelOpen, true, '本用例固定走陈旧内存态路径：panelOpen 全程不被写回')
    assert.ok(guideMounted(), '内存残留的 panelOpen 不得覆盖 DOM 实测，引导与卡片必须回归')
    assert.equal(document.documentElement.hasAttribute('data-omnimux-split-compact'), false)

    // 3) 右栏再次展开：panelOpen 依旧 true，完整卡片必须重新让位（不许过度放行）
    await act(async () => { frame.removeAttribute('data-rightbar-collapsed') })
    await settle()
    assert.ok(guideCompact(), '右栏重新展开后必须再次收回完整卡片')

    // 4) 内存把面板关掉（新会话走 reconcile/closePanel）：收起态完整卡片回归
    await act(async () => {
      panelOpen = false
      for (const listener of listeners) listener()
      frame.setAttribute('data-rightbar-collapsed', 'true')
    })
    await settle()
    assert.ok(guideMounted(), 'panelOpen 与实测都不再打开时完整卡片必须回归')
  } finally {
    await act(async () => root.unmount())
    store.dispose()
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})
