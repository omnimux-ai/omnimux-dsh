import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { COMPOSER_COMPACT_ATTR } from './composer-compact.js'
import { GUIDE_CSS } from './session-guide/styles.js'
import {
  RIGHT_SIDEBAR_MIN_VISIBLE_PX,
  SPLIT_COMPACT_ATTR,
  SPLIT_COMPACT_MAX_COLUMN_PX,
  elementWidth,
  findRightSidebarRoot,
  getSplitCompactSnapshot,
  isRightSidebarExpanded,
  isSplitOrCompactLayout,
  readConversationColumnWidth,
  readSplitCompactSignals,
  resetSplitCompactLayoutForTests,
  subscribeSplitCompactLayout,
} from './split-compact-layout.js'

const previous = {
  window: globalThis.window,
  document: globalThis.document,
  ResizeObserver: globalThis.ResizeObserver,
}

/** 记录观测目标，便于手动触发一次布局变化。 */
class FakeResizeObserver {
  static instances = []
  constructor(callback) {
    this.callback = callback
    this.observed = new Set()
    this.disconnected = false
    FakeResizeObserver.instances.push(this)
  }
  observe(node) { this.observed.add(node) }
  unobserve(node) { this.observed.delete(node) }
  disconnect() { this.disconnected = true; this.observed.clear() }
  trigger() { this.callback() }
}

/** @type {JSDOM | undefined} */
let dom

afterEach(() => {
  resetSplitCompactLayoutForTests()
  dom?.window.close()
  dom = undefined
  FakeResizeObserver.instances = []
  if (previous.ResizeObserver === undefined) delete globalThis.ResizeObserver
  else globalThis.ResizeObserver = previous.ResizeObserver
  if (previous.window === undefined) delete globalThis.window
  else globalThis.window = previous.window
  if (previous.document === undefined) delete globalThis.document
  else globalThis.document = previous.document
})

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

/**
 * 复刻宿主外框：左轨 + 会话中列 + 右侧侧栏。
 * @returns {{ frame: Element, rightbar: Element, column: Element, widths: { rightbar: number, column: number } }}
 */
function setupLayout({ rightbarWidth = 1028, columnWidth = 680, collapsed = false } = {}) {
  dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="dshDesktopFrame"${collapsed ? ' data-rightbar-collapsed="true"' : ''}>
      <div class="frame_centerCol"><section data-slot="conversation"></section></div>
      <div class="frame_rightbarCol" data-rightbar-col></div>
    </div>
  </body></html>`, { url: 'http://localhost' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const frame = document.querySelector('.dshDesktopFrame')
  const rightbar = document.querySelector('[data-rightbar-col]')
  const column = document.querySelector('.frame_centerCol')
  const widths = { rightbar: rightbarWidth, column: columnWidth }
  stubWidth(rightbar, () => widths.rightbar)
  stubWidth(column, () => widths.column)
  return { frame, rightbar, column, widths }
}

/** 让 MutationObserver 的微任务落地。 */
function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('elementWidth', () => {
  test('优先包围盒，无包围盒宽度时退化到 offsetWidth', () => {
    assert.equal(elementWidth(null), 0)
    assert.equal(elementWidth(undefined), 0)
    assert.equal(elementWidth({ getBoundingClientRect: () => ({ width: 120 }) }), 120)
    assert.equal(elementWidth({ getBoundingClientRect: () => ({ width: 0 }), offsetWidth: 64 }), 64)
    assert.equal(elementWidth({ getBoundingClientRect: () => ({ width: 0 }), offsetWidth: 0 }), 0)
  })
})

describe('右侧侧栏真实展开判定', () => {
  test('外框展开且右栏有宽度时判定为展开', () => {
    const { rightbar } = setupLayout()
    assert.equal(isRightSidebarExpanded(document), true)
    assert.equal(findRightSidebarRoot(document), rightbar)
  })

  test('外框带 data-rightbar-collapsed 时永远按收起处理', () => {
    setupLayout({ collapsed: true })
    assert.equal(isRightSidebarExpanded(document), false)
  })

  test('右栏实测宽度未超过可见下限时按收起处理', () => {
    const { widths } = setupLayout({ rightbarWidth: RIGHT_SIDEBAR_MIN_VISIBLE_PX })
    assert.equal(isRightSidebarExpanded(document), false)
    widths.rightbar = RIGHT_SIDEBAR_MIN_VISIBLE_PX + 1
    assert.equal(isRightSidebarExpanded(document), true)
  })

  test('左侧轨里的面板不会被误当成右侧侧栏', () => {
    dom = new JSDOM(`<!doctype html><html><head></head><body>
      <div class="dshDesktopFrame">
        <div class="frame_sidebarCol"><div class="_panel_left_dock"></div></div>
        <div class="frame_centerCol"></div>
      </div>
    </body></html>`, { url: 'http://localhost' })
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    stubWidth(document.querySelector('._panel_left_dock'), () => 300)
    assert.equal(findRightSidebarRoot(document), null)
    assert.equal(isRightSidebarExpanded(document), false)
  })

  test('宽大的底部停靠面板不会被误当成右侧侧栏', () => {
    dom = new JSDOM(`<!doctype html><html><head></head><body>
      <div class="dshDesktopFrame">
        <div class="frame_centerCol"></div>
        <div class="frame_rightbarCol" data-rightbar-col></div>
        <div class="frame_bottomPanel"><div data-dockkit-strip-chrome="true"></div></div>
      </div>
    </body></html>`, { url: 'http://localhost' })
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    stubWidth(document.querySelector('.frame_rightbarCol'), () => 40)
    stubWidth(document.querySelector('[data-dockkit-strip-chrome]'), () => 1600)
    assert.notEqual(
      findRightSidebarRoot(document),
      document.querySelector('[data-dockkit-strip-chrome]'),
      '宽大的底部停靠面板不得成为右侧侧栏根节点',
    )
    assert.equal(isRightSidebarExpanded(document), false)
  })

  test('官方右栏列可见时优先采用，不被哈希类名兜底候选带偏', () => {
    dom = new JSDOM(`<!doctype html><html><head></head><body>
      <div class="dshDesktopFrame">
        <div class="frame_centerCol"></div>
        <div data-rightbar-col></div>
        <div class="_panel_stray_dock"></div>
      </div>
    </body></html>`, { url: 'http://localhost' })
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    const official = document.querySelector('[data-rightbar-col]')
    stubWidth(official, () => 680)
    stubWidth(document.querySelector('._panel_stray_dock'), () => 1600)
    assert.equal(findRightSidebarRoot(document), official)
  })
})

describe('分栏/中间栏三路信号', () => {
  test('右侧侧栏展开即分栏', () => {
    setupLayout({ rightbarWidth: 1028, columnWidth: 680 })
    assert.equal(readSplitCompactSignals(document).sidebarExpanded, true)
    assert.equal(isSplitOrCompactLayout(document), true)
  })

  test('会话列窄于阈值即中间栏，宽于阈值则不是', () => {
    const { widths } = setupLayout({ rightbarWidth: 0, columnWidth: SPLIT_COMPACT_MAX_COLUMN_PX - 1 })
    assert.equal(readSplitCompactSignals(document).narrowColumn, true)
    assert.equal(isSplitOrCompactLayout(document), true)
    widths.column = SPLIT_COMPACT_MAX_COLUMN_PX + 1
    assert.equal(readSplitCompactSignals(document).narrowColumn, false)
    assert.equal(isSplitOrCompactLayout(document), false)
  })

  test('量不到列宽时不做窄列判定（首帧不误伤）', () => {
    const { widths } = setupLayout({ rightbarWidth: 0, columnWidth: 0 })
    assert.equal(readConversationColumnWidth(document), 0)
    assert.equal(readSplitCompactSignals(document).narrowColumn, false)
    assert.equal(isSplitOrCompactLayout(document), false)
    widths.column = 640
    assert.equal(isSplitOrCompactLayout(document), true)
  })

  test('输入框紧凑档（short / icon）即分栏紧凑态', () => {
    setupLayout({ rightbarWidth: 0, columnWidth: 1200 })
    document.documentElement.setAttribute(COMPOSER_COMPACT_ATTR, 'short')
    assert.equal(readSplitCompactSignals(document).compactDensity, true)
    assert.equal(isSplitOrCompactLayout(document), true)
    document.documentElement.setAttribute(COMPOSER_COMPACT_ATTR, 'icon')
    assert.equal(isSplitOrCompactLayout(document), true)
    document.documentElement.setAttribute(COMPOSER_COMPACT_ATTR, 'full')
    assert.equal(isSplitOrCompactLayout(document), false)
  })
})

describe('订阅与 html 镜像属性', () => {
  test('侧栏折叠/展开与列宽变化都能即时通知，并镜像 data-omnimux-split-compact', async () => {
    const { frame, widths, rightbar } = setupLayout({ rightbarWidth: 1028, columnWidth: 1200, collapsed: true })
    globalThis.ResizeObserver = FakeResizeObserver
    let notified = 0
    const unsubscribe = subscribeSplitCompactLayout(() => { notified++ })
    assert.equal(getSplitCompactSnapshot(), false)
    assert.equal(document.documentElement.hasAttribute(SPLIT_COMPACT_ATTR), false)

    // 1) 展开右侧侧栏：外框属性变化 → 通知
    frame.removeAttribute('data-rightbar-collapsed')
    await nextTick()
    assert.equal(getSplitCompactSnapshot(), true)
    assert.equal(document.documentElement.getAttribute(SPLIT_COMPACT_ATTR), 'true')
    assert.ok(notified > 0)

    // 2) 收起右侧侧栏：回到全宽，镜像属性撤掉
    frame.setAttribute('data-rightbar-collapsed', 'true')
    await nextTick()
    assert.equal(getSplitCompactSnapshot(), false)
    assert.equal(document.documentElement.hasAttribute(SPLIT_COMPACT_ATTR), false)

    // 3) 分栏拖拽只改宽度：外框属性没动，ResizeObserver 触发同样能收敛
    const before = notified
    assert.equal(getSplitCompactSnapshot(), false)
    const observer = FakeResizeObserver.instances.find((instance) => instance.observed.has(rightbar))
    assert.ok(observer, '右栏必须被 ResizeObserver 观测')
    widths.column = 520
    observer.trigger()
    assert.equal(getSplitCompactSnapshot(), true)
    assert.ok(notified > before)

    unsubscribe()
  })

  test('输入框密度切换后订阅者收到通知', async () => {
    setupLayout({ rightbarWidth: 0, columnWidth: 1400 })
    let notified = 0
    const unsubscribe = subscribeSplitCompactLayout(() => { notified++ })
    assert.equal(getSplitCompactSnapshot(), false)
    document.documentElement.setAttribute(COMPOSER_COMPACT_ATTR, 'short')
    await nextTick()
    assert.equal(getSplitCompactSnapshot(), true)
    assert.ok(notified > 0)
    unsubscribe()
  })

  test('最后一个订阅者离开后拆除监听，镜像属性一并清理', () => {
    setupLayout({ rightbarWidth: 1028, columnWidth: 680 })
    const unsubscribe = subscribeSplitCompactLayout(() => {})
    assert.equal(document.documentElement.getAttribute(SPLIT_COMPACT_ATTR), 'true')
    unsubscribe()
    assert.equal(document.documentElement.hasAttribute(SPLIT_COMPACT_ATTR), false)
  })
})

describe('分栏兜底 CSS（与 HTML 镜像属性同源）', () => {
  test('镜像属性与输入框密度档都能强制隐藏引导卡片', () => {
    assert.ok(
      GUIDE_CSS.includes(`html[${SPLIT_COMPACT_ATTR}] .omnimux-starter-guide`),
      '必须存在分栏态隐藏引导卡片的兜底规则',
    )
    assert.ok(
      GUIDE_CSS.includes("html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) .omnimux-starter-guide"),
      '必须存在输入框紧凑档隐藏引导卡片的兜底规则',
    )
    assert.match(
      GUIDE_CSS,
      new RegExp(`html\\[${SPLIT_COMPACT_ATTR}\\] \\[data-omnimux-starter-host\\] \\[data-composer-seat\\],[\\s\\S]*?\\{\\s*justify-content:flex-end!important;`),
      '分栏态输入框必须保持贴底，不被居中规则顶到中间',
    )
    assert.match(
      GUIDE_CSS,
      new RegExp(`html\\[${SPLIT_COMPACT_ATTR}\\] \\[data-omnimux-starter-host\\] \\[class\\*="composerStack"\\],[\\s\\S]*?\\{\\s*justify-content:flex-end!important;`),
      '分栏态内容栈同样收回底部',
    )
  })
})
