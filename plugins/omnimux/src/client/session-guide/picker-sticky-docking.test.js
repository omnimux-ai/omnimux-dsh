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
  const attachedSelectors = new Set()

  const body = {
    appendChild: (el) => {
      if (el?.selector) attachedSelectors.add(el.selector)
    },
    removeChild: () => {},
  }

  const doc = {
    body,
    documentElement: {
      hasAttribute: (attr) => false,
    },
    querySelector(sel) {
      if (sel.includes('starter-guide') && attachedSelectors.has('starter-guide')) {
        return { tagName: 'SECTION' }
      }
      return null
    },
    createElement(tag) {
      return {
        tagName: tag,
        selector: tag === 'section' ? 'starter-guide' : tag,
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

test('全屏与分栏自适应：宽栏大屏就地滚动跳转 Tab，窄栏分栏统一唤起素材工作台', async () => {
  const env = withDom()
  try {
    let wbOpened = false
    let openedTabId = null
    let openedMode = null
    const fakeWorkbench = {
      openWorkbench: async ({ tabId, focus }) => {
        wbOpened = true
        openedTabId = tabId
        openedMode = focus
      },
    }

    env.win.__omnimuxWorkbench = fakeWorkbench
    fakeWorkbench.getSnapshot = () => ({ state: { panelOpen: false } }) // 右栏未开

    // 1. 宽栏全屏新会话场景：DOM 中挂载了完整的探索专区货架
    const starterGuide = env.doc.createElement('section')
    starterGuide.setAttribute('data-omnimux-starter-guide', '')
    env.doc.body.appendChild(starterGuide)

    const controller = createComposerAddController({
      t: (k) => k,
      store: { getSnapshot: () => [] },
      getCurrentSessionId: () => 'sess_blank',
      subscribeCurrentSession: () => () => {},
      notify: () => {},
      renderLibrary: () => {},
      workbench: fakeWorkbench,
    })

    // 宽栏大屏下点击加号「从灵感库选择」
    await controller.openInspiration('sess_blank')

    // 契约一：宽栏全屏新会话优先就地滚动跳转 Tab，不粗暴挤压开分栏
    assert.equal(wbOpened, false, '宽栏大屏新会话下无需额外打开右栏 split')
    const scrollEvent = env.customEvents.find(e => e.type === 'omnimux:explore:scroll-to-tab')
    assert.ok(scrollEvent, '必须派发 omnimux:explore:scroll-to-tab 事件供大屏跳转')
    assert.equal(scrollEvent.detail.tab, 'inspiration', '必须切换到灵感库 Tab')

    // 2. 窄栏场景（右栏已开或被挤窄）：切换到右栏展开状态
    fakeWorkbench.getSnapshot = () => ({ state: { panelOpen: true } })
    await controller.openLibrary('sess_blank')
    assert.equal(wbOpened, true, '窄栏状态下统一通过 openWorkbench 联动')
    assert.equal(openedTabId, 'omnimux:asset-hub', '必须打开 asset-hub 工作台')
    assert.equal(openedMode, 'split', '必须以 split 形式打开')
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

test('抗竞态与意图防御测试：无真实实体载荷的外部 dock-intent 被坚决拦截保持 inline 态，仅合法实体载荷允许切换为 docked', async () => {
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

    // 1. 空载/无 id 的幽灵意图在 dock() 入口即被守卫拒收（dock-intent 事件通道已移除，唯一入口为 dock()）
    await act(async () => {
      hookApi.dock({ tab: 'inspiration' }, { force: true })
    })
    assert.equal(hookApi.placement, 'inline', '无真实实体 id 的空载意图严禁触发吸底')
    assert.equal(hookApi.isDocked, false)
    await act(async () => {
      hookApi.dock({ id: 'jump_dock_active' }, { force: true })
    })
    assert.equal(hookApi.isDocked, false, 'jump_dock_active 幽灵标记一律拒收')

    // 2. 携带真实合法卡片 Payload 的调用，正常切换为 docked
    await act(async () => {
      hookApi.dock({ id: 'card_real_template_123', prompt: '真实复刻内容' }, { force: true })
    })
    assert.equal(hookApi.placement, 'docked', '真实业务卡片实体允许进入 docked 态')
    assert.equal(hookApi.isDocked, true)
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    dom.window.close()
  }
})

test('样式契约验证：.omnimux-explore-grid-view-wrap 视口上限内滚，.omnimux-explore-shelves-view 视口撑开', () => {
  const stylesSource = readFileSync(new URL('./styles.js', import.meta.url), 'utf8')

  // 卡片网格容器：严禁硬 min-height，采用 max-height + 内部滚动（卡片少则内容撑开不进 Tab 背后，多则内部滚动）
  assert.match(stylesSource, /\.omnimux-explore-grid-view-wrap\s*\{[^}]*max-height:\s*calc\(100vh\s*-\s*120px\)[^}]*overflow-y:\s*auto/i, '网格容器必须配置 max-height: calc(100vh - 120px) 与 overflow-y: auto')
  assert.doesNotMatch(stylesSource, /\.omnimux-explore-grid-view-wrap\s*\{[^}]*min-height/i, '网格容器严禁硬编码 min-height')
  assert.match(stylesSource, /\.omnimux-explore-grid-view-wrap\s*\{[^}]*box-sizing:\s*border-box/i, '网格容器必须配置 box-sizing: border-box')

  // 货架视图保持视口撑开与底部安全避让
  assert.match(stylesSource, /\.omnimux-explore-shelves-view\s*\{[^}]*min-height:\s*calc\(100vh/i, '货架视图必须配置视口 min-height')
  assert.match(stylesSource, /\.omnimux-explore-shelves-view\s*\{[^}]*box-sizing:\s*border-box/i, '货架视图必须配置 box-sizing: border-box')

  // 空态与状态指示器 .omnimux-library-stage-status
  assert.match(stylesSource, /\.omnimux-library-stage-status\s*\{[^}]*margin:\s*40px\s+auto\s+0/i, '状态提示必须水平居中')
  assert.match(stylesSource, /\.omnimux-library-stage-status\s*\{[^}]*min-height:\s*120px/i, '状态提示必须保证 min-height: 120px 优雅留白')
  assert.match(stylesSource, /\.omnimux-library-stage-status\s*\{[^}]*justify-content:\s*center/i, '状态提示内容必须垂直水平居中')
})

test('探索专区解耦契约验证：ExploreTemplatesSection 彻底消除全局标记，支持平滑滚动但严禁空载强制吸底', () => {
  const exploreSource = readFileSync(new URL('./templates/ExploreTemplatesSection.jsx', import.meta.url), 'utf8')
  
  // 必须彻底剔除全屏全局标记
  assert.doesNotMatch(exploreSource, /__omnimuxFullscreenExploreActive/i, '严禁包含全局污染变量 __omnimuxFullscreenExploreActive')
  
  // 必须支持监听平滑滚动事件
  assert.match(exploreSource, /omnimux:explore:scroll-to-tab/i, '必须监听 omnimux:explore:scroll-to-tab 以响应大屏跳转')
  
  // 关键：绝对禁止在跳转时派发 dock-intent 强制吸底事件！
  assert.doesNotMatch(exploreSource, /omnimux:composer:dock-intent/i, '严禁在跳转 Tab 时盲目派发 dock-intent 强制吸底')
})

test('视口几何仿真断言：网格容器上限 100vh-120px 内部滚动，少卡不超额撑高、多卡内部可滚', () => {
  // 仿真新会话探索区几何模型（max-height: calc(100vh - 120px); overflow-y: auto）
  const viewportHeight = 800 // clientHeight = 800px (100vh)
  const wrapMaxHeight = viewportHeight - 120 // 680px

  function simulateGridWrap(cardCount, cardHeightPerItem = 220) {
    // 真实内容自然高度
    let naturalContentHeight = 0
    if (cardCount === 0) {
      naturalContentHeight = 120 // 空态 min-height: 120px
    } else if (cardCount <= 5) {
      naturalContentHeight = cardHeightPerItem // 首行卡片
    } else {
      const rows = Math.ceil(cardCount / 5)
      naturalContentHeight = rows * cardHeightPerItem // 多行展开
    }

    // CSS max-height 生效机制：容器高度 = min(natural, maxHeight)，超出部分转入内部滚动
    const containerHeight = Math.min(naturalContentHeight, wrapMaxHeight)
    const innerScrollable = Math.max(0, naturalContentHeight - wrapMaxHeight)

    return {
      naturalContentHeight,
      containerHeight,
      innerScrollable,
    }
  }

  // 1. 0 张卡片场景（空数据 / 加载态）：高度由空态内容撑开，不产生冗余滚动空间
  const zeroCards = simulateGridWrap(0)
  assert.equal(zeroCards.containerHeight, 120, '0 张卡片下容器高度必须等于空态 120px')
  assert.equal(zeroCards.innerScrollable, 0, '0 张卡片下内部不可滚动')

  // 2. 5 张卡片场景（少量数据，核心痛点场景）：内容自然撑开，绝不制造把 Tab 栏顶到背后的超额滚动
  const fiveCards = simulateGridWrap(5)
  assert.equal(fiveCards.containerHeight, 220, '5 张单行卡片下容器高度必须等于内容 220px')
  assert.equal(fiveCards.innerScrollable, 0, '5 张单行卡片下内部不可滚动，页面无法过度滚动')

  // 3. 50 张卡片场景（海量瀑布流）：封顶视口上限并内部滚动
  const fiftyCards = simulateGridWrap(50)
  assert.equal(fiftyCards.containerHeight, wrapMaxHeight, '50 张卡片下容器必须封顶 100vh - 120px')
  assert.ok(fiftyCards.innerScrollable > 0, '50 张卡片下容器内部必须具备滚动余量')
})
