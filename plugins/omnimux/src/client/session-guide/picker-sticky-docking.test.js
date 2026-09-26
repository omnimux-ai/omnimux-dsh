import test from 'node:test'
import assert from 'node:assert/strict'
import React, { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { createComposerAddController } from '../composer-add/controller.js'
import { useComposerDocking, DOCK_OPEN_ATTR } from './useComposerDocking.js'
import { readFileSync } from 'node:fs'

function withDom() {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document

  // 创建模拟 DOM
  const listeners = new Map()
  const customEvents = []

  const doc = {
    createElement(tag) {
      return {
        tagName: tag,
        style: {},
        setAttribute: () => {},
        removeAttribute: () => {},
        appendChild: () => {},
        remove: () => {},
      }
    },
  }

  const win = {
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(fn)
    },
    removeEventListener(name, fn) {
      listeners.get(name)?.delete(fn)
    },
    dispatchEvent(event) {
      customEvents.push(event)
      listeners.get(event.type)?.forEach(fn => fn(event))
      return true
    },
    CustomEvent: class {
      constructor(type, options = {}) {
        this.type = type
        this.detail = options.detail
      }
    },
    document: doc,
    __omnimuxFullscreenExploreActive: false,
    __omnimuxWorkbench: null,
  }

  globalThis.window = win
  globalThis.document = doc
  return {
    win,
    doc,
    customEvents,
    cleanup() {
      globalThis.window = previousWindow
      globalThis.document = previousDocument
    },
  }
}

test('全屏状态守卫：新会话全屏下点击加号绝不打开 split 右栏，派发平滑置顶与 Tab 切换事件', async () => {
  const env = withDom()
  try {
    let wbOpened = false
    const fakeWorkbench = {
      openWorkbench: async () => {
        wbOpened = true
      },
    }

    env.win.__omnimuxFullscreenExploreActive = true // 标记处于全屏新会话
    env.win.__omnimuxWorkbench = fakeWorkbench
    fakeWorkbench.getSnapshot = () => ({ state: { panelOpen: false } }) // 右栏未开

    const controller = createComposerAddController({
      t: (k) => k,
      store: { getSnapshot: () => [] },
      getCurrentSessionId: () => 'sess_blank',
      subscribeCurrentSession: () => () => {},
      notify: () => {},
      renderLibrary: () => {},
      workbench: fakeWorkbench,
    })

    // 用户在全屏新会话中点击加号的「从灵感库选择」
    await controller.openInspiration('sess_blank')

    // 契约一：绝不唤起右栏 split
    assert.equal(wbOpened, false, '全屏状态下严禁唤起右栏 split 模式')

    // 契约二：成功派发置顶与切 Tab 事件
    const scrollEvent = env.customEvents.find(e => e.type === 'omnimux:explore:scroll-to-tab')
    assert.ok(scrollEvent, '必须派发 omnimux:explore:scroll-to-tab 事件')
    assert.equal(scrollEvent.detail.tab, 'inspiration', '必须切换到灵感库 Tab')

    // 切换到三栏状态：右栏已打开
    fakeWorkbench.getSnapshot = () => ({ state: { panelOpen: true } })

    await controller.openLibrary('sess_blank')
    assert.equal(wbOpened, true, '右栏已打开时正常通过 openWorkbench 联动')
  } finally {
    env.cleanup()
  }
})

test('Tab 栏吸顶固定样式契约验证：.omnimux-explore-filter-bar 包含 position: sticky 与 top: 0 并消费原生底色自适应毛玻璃', () => {
  const stylesSource = readFileSync(new URL('./styles.js', import.meta.url), 'utf8')
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*position:\s*sticky/i, '必须设置 position: sticky')
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*top:\s*0/i, '必须设置 top: 0 吸顶固定')
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*z-index:\s*80/i, '必须具备合适的 z-index 保证吸顶层级')
  // 背景色自适应与防穿透断言：严禁包含死黑 #0d0d0f，必须基于 --dsw-alias-bg-base 混合并带有 backdrop-filter
  assert.doesNotMatch(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*#0d0d0f/i, '严禁硬编码死黑色值 #0d0d0f')
  assert.doesNotMatch(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*--dsw-alias-bg-layer-0/i, '严禁引用不存在的 Token --dsw-alias-bg-layer-0')
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*--dsw-alias-bg-base/i, '必须基于原生 --dsw-alias-bg-base 进行底色自适应')
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*(?:^|;)\s*backdrop-filter:\s*blur/m, '必须设置 backdrop-filter 高斯模糊实现高级遮罩')
})

import { JSDOM } from 'jsdom'

test('抗竞态测试：顶部输入框点击添加触发 dock(force: true)，即使 scrollTop 为 0 也立即进入 docked 态', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const dom = new JSDOM('<div data-omnimux-starter-host><div class="scrollBody"><div data-composer-card></div><div id="seat"></div></div></div>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let hookApi = null

  function TestHarness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef }, 'RaceTest')
  }

  try {
    const root = createRoot(dom.window.document.querySelector('#seat'))
    await act(async () => {
      root.render(React.createElement(TestHarness))
    })

    // 初始状态处于顶部 (scrollTop = 0)
    assert.equal(hookApi.placement, 'inline')

    // 模拟顶部加号菜单派发 dock-intent，携带 force: true
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.CustomEvent('omnimux:composer:dock-intent', {
        detail: { tab: 'inspiration', force: true }
      }))
    })

    // 核心断言：必须突破 isTopVisible 阻断，立即切换为 docked！
    assert.equal(hookApi.placement, 'docked', '带 force:true 必须无视顶部位置立即切换为 docked')
    assert.equal(hookApi.isDocked, true)
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    dom.window.close()
  }
})
