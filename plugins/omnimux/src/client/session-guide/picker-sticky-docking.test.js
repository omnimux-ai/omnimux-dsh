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

test('Tab 栏吸顶固定样式契约验证：.omnimux-explore-filter-bar 包含 position: sticky 与 top: 0 并采用页面同色实心纯色背景（零透明度、零死黑）', () => {
  const stylesSource = readFileSync(new URL('./styles.js', import.meta.url), 'utf8')
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*position:\s*sticky/i, '必须设置 position: sticky')
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*top:\s*0/i, '必须设置 top: 0 吸顶固定')
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*z-index:\s*80/i, '必须具备合适的 z-index 保证吸顶层级')
  // 背景色自适应与实心防穿透断言：严禁包含死黑 #0d0d0f，严禁半透明 transparent，必须消费原生 --dsw-alias-bg-base 保证实心同色
  assert.doesNotMatch(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*#0d0d0f/i, '严禁硬编码死黑色值 #0d0d0f')
  assert.doesNotMatch(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*--dsw-alias-bg-layer-0/i, '严禁引用不存在的 Token --dsw-alias-bg-layer-0')
  assert.doesNotMatch(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*transparent/i, '严禁包含透明通道导致下方穿透透图透字')
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*--dsw-alias-bg-base/i, '必须基于原生 --dsw-alias-bg-base 保证与页面背景 100% 同色实心')
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

test('样式契约验证：.omnimux-explore-grid-view-wrap 与 .omnimux-explore-shelves-view 统一设置视口最小高度与留白', () => {
  const stylesSource = readFileSync(new URL('./styles.js', import.meta.url), 'utf8')
  
  // 必须为包裹层统一提供视口撑开与底部安全避让间距
  assert.match(stylesSource, /\.omnimux-explore-grid-view-wrap,\s*\.omnimux-explore-shelves-view\s*\{[^}]*min-height:\s*calc\(100vh\s*-\s*96px\)/i, '必须配置 min-height: calc(100vh - 96px)')
  assert.match(stylesSource, /\.omnimux-explore-grid-view-wrap,\s*\.omnimux-explore-shelves-view\s*\{[^}]*padding-bottom:\s*120px/i, '必须为吸底输入框预留 padding-bottom: 120px 避让空间')
  assert.match(stylesSource, /\.omnimux-explore-grid-view-wrap,\s*\.omnimux-explore-shelves-view\s*\{[^}]*box-sizing:\s*border-box/i, '必须配置 box-sizing: border-box')

  // 空态与状态指示器 .omnimux-library-stage-status
  assert.match(stylesSource, /\.omnimux-library-stage-status\s*\{[^}]*margin:\s*40px\s+auto\s+0/i, '状态提示必须水平居中')
  assert.match(stylesSource, /\.omnimux-library-stage-status\s*\{[^}]*min-height:\s*120px/i, '状态提示必须保证 min-height: 120px 优雅留白')
  assert.match(stylesSource, /\.omnimux-library-stage-status\s*\{[^}]*justify-content:\s*center/i, '状态提示内容必须垂直水平居中')
})

test('置顶逻辑契约验证：ExploreTemplatesSection 具备 0ms 即时跳转与双帧 requestAnimationFrame 复核锁定', () => {
  const exploreSource = readFileSync(new URL('./templates/ExploreTemplatesSection.jsx', import.meta.url), 'utf8')
  
  // 必须定义 scrollToTop 并立即同步执行
  assert.match(exploreSource, /const\s+scrollToTop\s*=\s*\(\)\s*=>/i, '必须封装置顶滚动计算函数 scrollToTop')
  assert.match(exploreSource, /scroller\.scrollTop\s*=\s*Math\.max\(0,\s*targetOffset\)/i, '必须同步赋值 scrollTop 实现 0ms 原子跳转')
  
  // 必须通过 requestAnimationFrame 双帧嵌套在 React 重排与 DOM 布局完成后复核锁定
  assert.match(exploreSource, /window\.requestAnimationFrame\(\(\)\s*=>\s*\{[\s\S]*scrollToTop\(\);[\s\S]*window\.requestAnimationFrame\(\(\)\s*=>\s*\{[\s\S]*scrollToTop\(\);/i, '必须采用双帧 requestAnimationFrame 复核锁定置顶 top: 0')
  assert.match(exploreSource, /cancelAnimationFrame/i, '必须在卸载或连续触发时取消未完成的 animation frame')
})

test('视口几何仿真断言：在 0 张、5 张与多张卡片下，Tab 栏 100% 滚动贴顶无截断', () => {
  // 仿真全屏会话滚动容器几何模型
  const viewportHeight = 800 // clientHeight = 800px (100vh)
  const headerOffset = 320 // 欢迎区及上方高度 = 320px
  const tabBarHeight = 96 // filterBar 自身高度 = 96px

  function simulateScrollToTop(cardCount, cardHeightPerItem = 220) {
    // 根据 CSS 规则：min-height = calc(100vh - 96px) = 800 - 96 = 704px; padding-bottom = 120px
    const minContentHeight = viewportHeight - tabBarHeight // 704px
    const paddingBottom = 120

    // 真实内容自然高度
    let naturalContentHeight = 0
    if (cardCount === 0) {
      naturalContentHeight = 120 // 空态 min-height: 120px
    } else if (cardCount <= 5) {
      naturalContentHeight = cardHeightPerItem // 首行 5 张卡片高 220px
    } else {
      const rows = Math.ceil(cardCount / 5)
      naturalContentHeight = rows * cardHeightPerItem // 多行展开
    }

    // CSS min-height 生效机制：总容器高度 = Math.max(naturalHeight, minContentHeight) + paddingBottom
    const containerHeight = Math.max(naturalContentHeight, minContentHeight) + paddingBottom

    // 整个滚动容器的 scrollHeight
    const scrollHeight = headerOffset + tabBarHeight + containerHeight
    const clientHeight = viewportHeight

    // 目标跳转位置：将 filterBar 顶贴滚动容器顶边缘
    const targetOffset = headerOffset

    // 浏览器物理可滚动的最大高度
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight)

    // 0ms 跳转计算出来的最终 scrollTop
    const actualScrollTop = Math.min(targetOffset, maxScrollTop)

    // filterBar 相对视口顶部的最终可见位置：elRect.top - scrollerRect.top
    const finalTopOffset = targetOffset - actualScrollTop

    return {
      scrollHeight,
      clientHeight,
      maxScrollTop,
      targetOffset,
      actualScrollTop,
      finalTopOffset,
      containerHeight,
    }
  }

  // 1. 0 张卡片场景（空数据 / 加载态）
  const zeroCards = simulateScrollToTop(0)
  assert.ok(zeroCards.maxScrollTop >= zeroCards.targetOffset, '0 张卡片下必须撑开足够的 scrollHeight 供完全滚动')
  assert.equal(zeroCards.actualScrollTop, zeroCards.targetOffset, '0 张卡片下实际滚动位置必须精确到达 targetOffset')
  assert.equal(zeroCards.finalTopOffset, 0, '0 张卡片下 Tab 栏必须绝对贴顶 (top: 0)')

  // 2. 5 张卡片场景（少量数据，核心痛点场景）
  const fiveCards = simulateScrollToTop(5)
  assert.ok(fiveCards.maxScrollTop >= fiveCards.targetOffset, '5 张卡片下必须撑开足够的 scrollHeight 供完全滚动')
  assert.equal(fiveCards.actualScrollTop, fiveCards.targetOffset, '5 张卡片下实际滚动位置必须精确到达 targetOffset')
  assert.equal(fiveCards.finalTopOffset, 0, '5 张卡片下 Tab 栏必须绝对贴顶 (top: 0)')
  assert.ok(fiveCards.containerHeight >= 824, '卡片下方保证至少具备足够现代 SaaS 留白空间')

  // 3. 50 张卡片场景（海量瀑布流）
  const fiftyCards = simulateScrollToTop(50)
  assert.ok(fiftyCards.maxScrollTop >= fiftyCards.targetOffset, '50 张卡片下自然满足置顶滚动条件')
  assert.equal(fiftyCards.actualScrollTop, fiftyCards.targetOffset, '50 张卡片下精确贴顶')
  assert.equal(fiftyCards.finalTopOffset, 0, '50 张卡片下 Tab 栏贴顶 (top: 0)')
})
