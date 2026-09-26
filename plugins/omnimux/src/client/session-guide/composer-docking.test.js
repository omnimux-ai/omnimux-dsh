import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React, { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import {
  useComposerDocking,
  dockGeometry,
  resolveConversationColumn,
  DOCK_OPEN_ATTR,
  DOCK_BOTTOM,
  DOCK_MAX_WIDTH,
  readPageScrollTop,
  getComposerScrollThresholds,
  READ_TOP_MAX,
  DOCK_LEAVE_MAX,
} from './useComposerDocking.js'

function withDom(html = '<div id="root"><div data-phase="conversation" data-omnimux-starter-host=""><div class="hero-band"><div data-composer-card="" style="height: 120px;"></div></div><div class="scrollBody" style="height: 600px; overflow-y: auto;"></div><div id="seat"></div></div></div>') {
  const dom = new JSDOM(html, { url: 'http://localhost/' })
  dom.window.Element.prototype.getBoundingClientRect = function stub() {
    return {
      x: 394, y: 100, left: 394, top: 100, width: 1200, height: 166,
      right: 1594, bottom: 266, toJSON() { return this },
    }
  }
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return {
    dom,
    restore() {
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
      dom.window.close()
    },
  }
}

function flush() {
  return act(async () => {
    await Promise.resolve()
  })
}

test('useComposerDocking: 初始状态为 inline，且宿主未打上 dock-open 标记', async () => {
  const env = withDom()
  const host = document.querySelector('[data-omnimux-starter-host]')
  const root = createRoot(document.querySelector('#seat'))
  let hookApi = null

  function TestHarness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef }, 'Test')
  }

  try {
    await act(async () => {
      root.render(React.createElement(TestHarness))
    })
    await flush()

    assert.equal(hookApi.placement, 'inline')
    assert.equal(hookApi.isDocked, false)
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false)
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
})

test('useComposerDocking: 顶部输入框可见时触发业务事件保持 inline，滚出视口后自动吸底设置几何变量', async () => {
  const env = withDom()
  const host = document.querySelector('[data-omnimux-starter-host]')
  const scroller = host.querySelector('.scrollBody')
  const root = createRoot(document.querySelector('#seat'))
  let hookApi = null

  function TestHarness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef }, 'Test')
  }

  try {
    await act(async () => {
      root.render(React.createElement(TestHarness))
    })
    await flush()

    // 1. 顶部可见状态下（scrollTop = 0 <= revealThreshold）：触发 dock 保持在顶部 inline，不吸底
    await act(async () => {
      const res = hookApi.dock({ id: 'sk-test-skill', title: '测试技能' })
      assert.equal(res, true)
    })
    await flush()

    assert.equal(hookApi.placement, 'inline', '顶部可见时点击业务事件优先保持在顶部 inline 显示')
    assert.equal(hookApi.isDocked, false)
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '顶部可见时宿主绝不打上停靠标记')

    // 2. 向下滚动离开顶部槽位（> leaveThreshold 196px）：自动触发吸底并写入停靠几何
    scroller.scrollTop = 280
    await act(async () => {
      scroller.dispatchEvent(new window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    await flush()

    assert.equal(hookApi.placement, 'docked', '滚出顶部不可见时自动迁移到底部 fixed')
    assert.equal(hookApi.isDocked, true)
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true, '滚出顶部后宿主打上停靠标记')
    assert.equal(host.style.getPropertyValue('--omnimux-dock-bottom'), `${DOCK_BOTTOM}px`)
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
})

test('dock owner expands for inline demand, clamps to column and restores default after removal', async () => {
  const env = withDom()
  const host = document.querySelector('[data-omnimux-starter-host]')
  const card = host.querySelector('[data-composer-card]')
  host.classList.add('centerCol')
  let availableWidth = 1200
  host.getBoundingClientRect = () => ({ left: 394, right: 394 + availableWidth, width: availableWidth })
  card.innerHTML = '<div class="row" style="display:flex"><div class="tools"><div data-omx-quick-shortcut-controls><button>Model</button></div></div></div>'
  for (const node of [card, ...card.querySelectorAll('*')]) {
    node.style.padding = '0px'
    node.style.border = '0px'
  }
  card.querySelector('button').getBoundingClientRect = () => ({ width: 960 })
  const root = createRoot(document.querySelector('#seat'))
  let hookApi
  function TestHarness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef })
  }
  try {
    await act(async () => root.render(React.createElement(TestHarness)))
    await act(async () => hookApi.pin({ id: 'inline-demand' }))
    assert.equal(host.style.getPropertyValue('--omnimux-dock-width'), '960px')
    availableWidth = 900
    await act(async () => window.dispatchEvent(new window.Event('resize')))
    assert.equal(host.style.getPropertyValue('--omnimux-dock-width'), '876px')
    assert.equal(host.style.getPropertyValue('--omnimux-dock-left'), '406px')
    await act(async () => {
      card.querySelector('[data-omx-quick-shortcut-controls]').remove()
      await Promise.resolve()
    })
    // 移除需求后，此时 availableWidth 仍为 900（available 为 900 - 24 = 876px），输入框自适应可用宽度 876px
    assert.equal(host.style.getPropertyValue('--omnimux-dock-width'), '876px')
    assert.equal(card.style.width, '')

    // 视口再次展开至宽屏 1200px 时，恢复至原生上限 952px 且居中对齐
    availableWidth = 1200
    await act(async () => window.dispatchEvent(new window.Event('resize')))
    assert.equal(host.style.getPropertyValue('--omnimux-dock-width'), '952px')
    assert.equal(host.style.getPropertyValue('--omnimux-dock-left'), '518px')
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
})

test('useComposerDocking: 调用 undock() 解除吸底并清除标记', async () => {
  const env = withDom()
  const host = document.querySelector('[data-omnimux-starter-host]')
  const root = createRoot(document.querySelector('#seat'))
  let hookApi = null

  function TestHarness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef }, 'Test')
  }

  try {
    await act(async () => {
      root.render(React.createElement(TestHarness))
    })
    await flush()

    await act(async () => {
      hookApi.pin({ id: 'sk-test-skill', title: '测试技能' })
    })
    await flush()
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true)

    await act(async () => {
      hookApi.undock()
    })
    await flush()

    assert.equal(hookApi.placement, 'inline')
    assert.equal(hookApi.isDocked, false)
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, 'undock 必须移除停靠标记')
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
})

test('useComposerDocking: 再次点击同一卡片触发反悔收起', async () => {
  const env = withDom()
  const host = document.querySelector('[data-omnimux-starter-host]')
  const root = createRoot(document.querySelector('#seat'))
  let hookApi = null

  function TestHarness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef }, 'Test')
  }

  try {
    await act(async () => {
      root.render(React.createElement(TestHarness))
    })
    await flush()

    // 第一次点击：登记激活
    await act(async () => {
      const res = hookApi.dock({ id: 'sk-skill-1', title: '技能1' })
      assert.equal(res, true)
    })
    await flush()
    assert.equal(hookApi.dockedItem?.id, 'sk-skill-1')

    // 第二次点击同一卡片：反悔解除并清空
    await act(async () => {
      const res = hookApi.dock({ id: 'sk-skill-1', title: '技能1' })
      assert.equal(res, false, '再次点击同一卡片应返回 false')
    })
    await flush()
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '反悔后必须解除停靠')
    assert.equal(hookApi.isDocked, false)
    assert.equal(hookApi.dockedItem, null, '反悔后已选卡片必须清空')
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
})

test('useComposerDocking: 滚动迟滞判定：滑离顶部吸底，滑回最顶部自动归还原位', async () => {
  const env = withDom()
  const host = document.querySelector('[data-omnimux-starter-host]')
  const scroller = host.querySelector('.scrollBody')
  const root = createRoot(document.querySelector('#seat'))
  let hookApi = null

  function TestHarness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef }, 'Test')
  }

  try {
    await act(async () => {
      root.render(React.createElement(TestHarness))
    })
    await flush()

    await act(async () => {
      hookApi.dock({ id: 'sk-skill-1', title: '技能1' })
    })
    await flush()
    assert.equal(hookApi.placement, 'inline', '在顶部可见时点击业务事件优先保持 inline')

    // 模拟向下滚动离开顶部 (>leaveThreshold 196px)
    scroller.scrollTop = 250
    await act(async () => {
      scroller.dispatchEvent(new window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    await flush()
    assert.equal(hookApi.placement, 'docked', '向下滚动离开顶部槽位后自动吸底')

    // 模拟向上滚动至顶部槽位露头阈值内 (<=revealThreshold 166px)，无需滑到 0px 即可解除吸底
    scroller.scrollTop = 100
    await act(async () => {
      scroller.dispatchEvent(new window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    await flush()
    assert.equal(hookApi.placement, 'inline', '滑回露头阈值内必须自动切回 inline 归还原位')

    // 模拟向上滚动滑回最顶部 (0px)，保持 inline
    scroller.scrollTop = 0
    await act(async () => {
      scroller.dispatchEvent(new window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    await flush()
    assert.equal(hookApi.placement, 'inline', '滑回页面顶部保持 inline 归还原位')
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
})

test('useComposerDocking: 组件卸载时安全清理所有宿主样式与标记', async () => {
  const env = withDom()
  const host = document.querySelector('[data-omnimux-starter-host]')
  const root = createRoot(document.querySelector('#seat'))
  let hookApi = null

  function TestHarness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef }, 'Test')
  }

  try {
    await act(async () => {
      root.render(React.createElement(TestHarness))
    })
    await flush()

    await act(async () => {
      hookApi.pin({ id: 'sk-skill-1', title: '技能1' })
    })
    await flush()
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true)

    // 卸载组件
    await act(async () => {
      root.unmount()
    })
    await flush()

    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '卸载后停靠标记必须清除')
    assert.equal(host.style.getPropertyValue('--omnimux-dock-left'), '')
    assert.equal(host.style.getPropertyValue('--omnimux-dock-width'), '')
  } finally {
    env.restore()
  }
})

test('useComposerDocking: dock(item, onDocked) 延迟交付回调且锁定视口滚动位置保持 0 位移', async () => {
  const env = withDom()
  const host = document.querySelector('[data-omnimux-starter-host]')
  const scroller = host.querySelector('.scrollBody')
  const root = createRoot(document.querySelector('#seat'))
  let hookApi = null

  function TestHarness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef }, 'Test')
  }

  try {
    await act(async () => {
      root.render(React.createElement(TestHarness))
    })
    await flush()

    // 用户滚动到偏下位置 (例如 380px)
    scroller.scrollTop = 380
    let callbackExecuted = false

    await act(async () => {
      hookApi.dock({ id: 'sk-skill-scroll-test', title: '防跳动测试' }, () => {
        callbackExecuted = true
      })
    })
    await flush()

    assert.equal(callbackExecuted, true, 'onDocked 回调必须在吸底就位后被执行')
    assert.equal(hookApi.placement, 'docked')
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true)
    // 关键断言：滚动条位置必须纹丝不动地停在 380px
    assert.equal(scroller.scrollTop, 380, '点击吸底后视口必须保持 0 位移，严禁跳动')
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
})

test('useComposerDocking: 吸底先手——dock() 同一帧同步写入停靠 DOM，不等渲染周期', async () => {
  const env = withDom()
  const host = document.querySelector('[data-omnimux-starter-host]')
  const scroller = host.querySelector('.scrollBody')
  const root = createRoot(document.querySelector('#seat'))
  let hookApi = null

  function TestHarness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef }, 'Test')
  }

  try {
    await act(async () => {
      root.render(React.createElement(TestHarness))
    })
    await flush()

    scroller.scrollTop = 560

    // 不包 act、不等 flush：模拟真实点击当帧，验证停靠 DOM 已同步落地。
    // 这正是附件挂载提醒（scrollIntoView 强制滚动定位）随后落在 fixed 输入框上
    // 即天然失效的机制保证——先手必须在渲染周期之前。
    hookApi.dock({ id: 'sk-prime-test', title: '先手测试' }, () => {})

    assert.equal(
      host.hasAttribute(DOCK_OPEN_ATTR),
      true,
      'dock() 返回时停靠标记必须已经同步写入宿主，绝不等渲染周期',
    )
    assert.equal(
      host.style.getPropertyValue('--omnimux-dock-bottom'),
      '20px',
      'dock() 返回时停靠几何必须已经同步写入',
    )
    assert.equal(scroller.scrollTop, 560, '吸底先手不得改动视口位置')

    await flush()
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true)
    assert.equal(scroller.scrollTop, 560)
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
})

test('useComposerDocking: 意图驱动模式——纯向下滚动默认不吸底，显式意图触发后才吸底', async () => {
  const env = withDom()
  const host = document.querySelector('[data-omnimux-starter-host]')
  const scroller = host.querySelector('.scrollBody')
  const root = createRoot(document.querySelector('#seat'))
  let hookApi = null

  function TestHarness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef }, 'PureScrollTest')
  }

  try {
    await act(async () => {
      root.render(React.createElement(TestHarness))
    })
    await flush()

    // 初始状态：无 item，处于顶部，必须为 inline
    assert.equal(hookApi.placement, 'inline')
    assert.equal(hookApi.isDocked, false)
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false)

    // 阶段 1：纯向下滚动离开顶部槽位（> leaveThreshold 196px）但未主动触发输入框
    scroller.scrollTop = 280
    await act(async () => {
      scroller.dispatchEvent(new window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    await flush()

    // 契约铁律：未显式意图触发时，纯向下滚动绝不自动吸底，底部不显示输入框
    assert.equal(hookApi.placement, 'inline', '未触发输入框时纯向下滚动必须保持 inline')
    assert.equal(hookApi.isDocked, false)
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '宿主严禁打上吸底标记')

    // 阶段 2：显式意图触发（例如用户点击加号选素材或卡片选用）
    await act(async () => {
      hookApi.dock({ id: 'card_intent_1' })
    })
    await flush()

    assert.equal(hookApi.placement, 'docked', '显式意图触发后必须就位吸底')
    assert.equal(hookApi.isDocked, true)
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true, '宿主被打上吸底标记')

    // 阶段 3：向上滚动回到原位露头范围（<= revealThreshold 166px）
    scroller.scrollTop = 80
    await act(async () => {
      scroller.dispatchEvent(new window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    await flush()

    assert.equal(hookApi.placement, 'inline', '向上滚动回露头可见范围必须自动恢复 inline')
    assert.equal(hookApi.isDocked, false)
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '宿主吸底标记必须被移除')
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
})

test('getComposerScrollThresholds: 卡片缺失时返回基线，不测量宿主根节点', () => {
  const dom = new JSDOM('<div id="root" style="height: 5000px;"><div class="no-card"></div></div>')
  const root = dom.window.document.getElementById('root')
  assert.deepEqual(getComposerScrollThresholds(root, null), {
    revealThreshold: READ_TOP_MAX,
    leaveThreshold: DOCK_LEAVE_MAX,
    measuredHeight: 0,
    offsetTop: 0,
  })
})

test('getComposerScrollThresholds: 滚动容器不是定位父级时按视口矩形计算距离', () => {
  const dom = new JSDOM(`
    <div id="root">
      <div id="scroller">
        <div id="parent-container">
          <div id="band">
            <div data-composer-card=""></div>
          </div>
        </div>
      </div>
    </div>
  `)
  const root = dom.window.document.getElementById('root')
  const scroller = dom.window.document.getElementById('scroller')
  const band = dom.window.document.getElementById('band')
  const card = dom.window.document.querySelector('[data-composer-card]')
  const positionedParent = dom.window.document.getElementById('parent-container')
  Object.defineProperty(band, 'offsetParent', { value: positionedParent })
  scroller.scrollTop = 30
  band.getBoundingClientRect = () => ({ top: 220, height: 120, width: 780, left: 10, bottom: 340, right: 790 })
  card.getBoundingClientRect = () => ({ top: 220, height: 120, width: 780, left: 10, bottom: 340, right: 790 })
  scroller.getBoundingClientRect = () => ({ top: 50, height: 600, width: 800, left: 0, bottom: 650, right: 800 })

  const thresholds = getComposerScrollThresholds(root, scroller)
  assert.equal(thresholds.offsetTop, 200)
  assert.equal(thresholds.measuredHeight, 120)
  assert.equal(thresholds.revealThreshold, 320)
  assert.equal(thresholds.leaveThreshold, 350)
})

test('AC-1: 侧边栏展开态（280px）在 2700px 宽屏下，输入框严格居中于栏目内部（left = 1014px，两侧等距 734px）', () => {
  const dom = new JSDOM(`<!doctype html>
    <div id="root">
      <div class="dshDesktopSidebar" style="width: 280px;"></div>
      <div class="dshDesktopConversationSurface" style="width: 2420px; left: 280px;">
        <div data-omnimux-starter-host="">
          <div id="band">
            <div data-composer-card=""></div>
          </div>
        </div>
      </div>
    </div>
  `, { url: 'http://localhost/' })

  const surface = dom.window.document.querySelector('.dshDesktopConversationSurface')
  const card = dom.window.document.querySelector('[data-composer-card]')
  const band = dom.window.document.getElementById('band')

  surface.getBoundingClientRect = () => ({
    left: 280,
    width: 2420,
    right: 2700,
    top: 0,
    bottom: 1080,
    height: 1080,
  })

  // 1. 测试列探测算法
  const column = resolveConversationColumn(card, band)
  assert.ok(column, '必须成功解析出栏目页面几何')
  assert.equal(column.left, 280)
  assert.equal(column.width, 2420)
  assert.equal(column.right, 2700)

  // 2. 测试停靠几何计算
  const geo = dockGeometry(card, band)
  assert.ok(geo, '必须计算出有效停靠几何')
  assert.equal(geo.width, 952, '宽度必须对齐原生上限 952px (方案 A)')
  // 核心居中坐标计算验证：280 + (2420 - 952) / 2 = 1014px
  assert.equal(geo.left, 1014, 'left 坐标必须严格为 1014px，严禁全屏居中的 874px')

  // 3. 几何对称性严格断言：left - columnLeft === columnRight - (left + width)
  const leftSpace = geo.left - column.left
  const rightSpace = column.right - (geo.left + geo.width)
  assert.equal(leftSpace, 734, '栏目内左侧留白必须精确等于 734px')
  assert.equal(rightSpace, 734, '栏目内右侧留白必须精确等于 734px')
  assert.equal(leftSpace, rightSpace, '栏目内部两侧留白必须 100% 绝对对称 1:1')

  dom.window.close()
})

test('AC-2: 侧边栏扩展态（440px）在 2700px 宽屏下，输入框自适应居中（left = 1094px，两侧等距 654px）', () => {
  const dom = new JSDOM(`<!doctype html>
    <div id="root">
      <div data-conversation-scroll style="left: 440px; width: 2260px;">
        <div data-omnimux-starter-host="">
          <div data-composer-card=""></div>
        </div>
      </div>
    </div>
  `, { url: 'http://localhost/' })

  const scrollEl = dom.window.document.querySelector('[data-conversation-scroll]')
  const card = dom.window.document.querySelector('[data-composer-card]')
  scrollEl.getBoundingClientRect = () => ({
    left: 440,
    width: 2260,
    right: 2700,
    top: 0,
    bottom: 1080,
    height: 1080,
  })

  const geo = dockGeometry(card, card)
  assert.ok(geo)
  assert.equal(geo.width, 952)
  // 440 + (2260 - 952) / 2 = 1094px
  assert.equal(geo.left, 1094)

  const leftSpace = geo.left - 440
  const rightSpace = 2700 - (geo.left + geo.width)
  assert.equal(leftSpace, 654)
  assert.equal(rightSpace, 654)
  assert.equal(leftSpace, rightSpace)

  dom.window.close()
})

test('AC-3: 侧边栏折叠收起态（0px / data-omnimux-left-collapsed），输入框居中于全屏（left = 874px，两侧等距 874px）', () => {
  const dom = new JSDOM(`<!doctype html>
    <html data-omnimux-left-collapsed="">
      <body>
        <div id="root">
          <div data-omnimux-starter-host="">
            <div data-composer-card=""></div>
          </div>
        </div>
      </body>
    </html>
  `, { url: 'http://localhost/' })

  Object.defineProperty(dom.window, 'innerWidth', { value: 2700, writable: true })
  const card = dom.window.document.querySelector('[data-composer-card]')

  const column = resolveConversationColumn(card, card)
  assert.ok(column)
  assert.equal(column.left, 0)
  assert.equal(column.width, 2700)

  const geo = dockGeometry(card, card)
  assert.ok(geo)
  assert.equal(geo.width, 952)
  // (2700 - 952) / 2 = 874px
  assert.equal(geo.left, 874)

  const leftSpace = geo.left - 0
  const rightSpace = 2700 - (geo.left + geo.width)
  assert.equal(leftSpace, 874)
  assert.equal(rightSpace, 874)
  assert.equal(leftSpace, rightSpace)

  dom.window.close()
})

test('AC-4: 窄屏/分栏紧凑态（栏目宽 712px <= 952px），输入框自适应为 688px 且居中（两侧等距 12px 呼吸缓冲）', () => {
  const dom = new JSDOM(`<!doctype html>
    <div class="dshDesktopConversationSurface" style="left: 0px; width: 712px;">
      <div data-omnimux-starter-host="">
        <div data-composer-card=""></div>
      </div>
    </div>
  `, { url: 'http://localhost/' })

  const surface = dom.window.document.querySelector('.dshDesktopConversationSurface')
  const card = dom.window.document.querySelector('[data-composer-card]')
  surface.getBoundingClientRect = () => ({
    left: 0,
    width: 712,
    right: 712,
    top: 0,
    bottom: 800,
    height: 800,
  })

  const geo = dockGeometry(card, card)
  assert.ok(geo)
  // available = 712 - 24 = 688px
  assert.equal(geo.width, 688, '窄屏紧凑态下宽度必须自适应为 712 - 24 = 688px')
  // left = 0 + (712 - 688) / 2 = 12px
  assert.equal(geo.left, 12, 'left 坐标必须严格留出 12px 呼吸间距')

  const leftSpace = geo.left - 0
  const rightSpace = 712 - (geo.left + geo.width)
  assert.equal(leftSpace, 12)
  assert.equal(rightSpace, 12)
  assert.equal(leftSpace, rightSpace)

  dom.window.close()
})

test('resolveConversationColumn: 跨越兄弟节点穿透探测，突破 closest 局限', () => {
  // 模拟真实桌面端 DOM：[data-composer-seat] 与 [data-conversation-scroll] 为同级兄弟节点
  const dom = new JSDOM(`<!doctype html>
    <div class="dshDesktopFrame">
      <div data-conversation-scroll style="left: 300px; width: 1000px;"></div>
      <div data-composer-seat>
        <div data-composer-card></div>
      </div>
    </div>
  `, { url: 'http://localhost/' })

  const scrollEl = dom.window.document.querySelector('[data-conversation-scroll]')
  const card = dom.window.document.querySelector('[data-composer-card]')
  scrollEl.getBoundingClientRect = () => ({
    left: 300,
    width: 1000,
    right: 1300,
    top: 0,
    bottom: 900,
    height: 900,
  })

  // 验证 closest 确实无法找到兄弟节点
  assert.equal(card.closest('[data-conversation-scroll]'), null, 'card.closest 无法跨越兄弟节点')

  // 验证 resolveConversationColumn 全局探测成功穿透命中兄弟节点
  const column = resolveConversationColumn(card, card)
  assert.ok(column)
  assert.equal(column.left, 300)
  assert.equal(column.width, 1000)
  assert.equal(column.right, 1300)

  dom.window.close()
})

test('resolveConversationColumn: 过滤 width === 0 或 height === 0 的隐藏/脱落候选节点，准确命中真实活动列', () => {
  const dom = new JSDOM(`<!doctype html>
    <div id="root">
      <!-- 隐藏节点 1: 尺寸均为 0 -->
      <div class="dshDesktopConversationSurface inactive-zero"></div>
      <!-- 隐藏节点 2: 高度为 0（折叠残留） -->
      <div class="dshDesktopConversationSurface inactive-collapsed"></div>
      <!-- 活动节点 3: 真实渲染尺寸 -->
      <div class="dshDesktopConversationSurface active-surface">
        <div data-omnimux-starter-host="">
          <div data-composer-card=""></div>
        </div>
      </div>
    </div>
  `, { url: 'http://localhost/' })

  const surfaces = dom.window.document.querySelectorAll('.dshDesktopConversationSurface')
  const card = dom.window.document.querySelector('[data-composer-card]')

  surfaces[0].getBoundingClientRect = () => ({
    left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0,
  })
  surfaces[1].getBoundingClientRect = () => ({
    left: 100, top: 0, width: 1200, height: 0, right: 1300, bottom: 0,
  })
  surfaces[2].getBoundingClientRect = () => ({
    left: 280, top: 0, width: 2420, height: 1080, right: 2700, bottom: 1080,
  })

  const column = resolveConversationColumn(card, card)
  assert.ok(column, '必须成功解析有效会话列')
  assert.equal(column.left, 280, '必须准确忽略前两个零尺寸候选节点，命中真实可见列的 left')
  assert.equal(column.width, 2420, '必须命中真实可见列的 width')
  assert.equal(column.right, 2700)

  dom.window.close()
})

test('resolveConversationColumn: 多会话切换或抽屉残留存在多个可见候选节点时，优先选择包含当前上下文（card/band/host）的区域', () => {
  const dom = new JSDOM(`<!doctype html>
    <div id="root">
      <!-- 旧会话残留表面（未隐藏但属于其他会话） -->
      <div class="dshDesktopConversationSurface stale-session" style="left: 0px; width: 800px;"></div>
      <!-- 当前活动会话工作区（包含当前 card / host 上下文） -->
      <div class="dshDesktopConversationSurface current-session" style="left: 300px; width: 1600px;">
        <div data-omnimux-starter-host="">
          <div id="band">
            <div data-composer-card=""></div>
          </div>
        </div>
      </div>
    </div>
  `, { url: 'http://localhost/' })

  const surfaces = dom.window.document.querySelectorAll('.dshDesktopConversationSurface')
  const card = dom.window.document.querySelector('[data-composer-card]')
  const band = dom.window.document.getElementById('band')

  surfaces[0].getBoundingClientRect = () => ({
    left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600,
  })
  surfaces[1].getBoundingClientRect = () => ({
    left: 300, top: 0, width: 1600, height: 900, right: 1900, bottom: 900,
  })

  // 即使 surfaces[0] 排在 DOM 最前面且具有非零尺寸，算法也必须优先选择包含当前上下文的 surfaces[1]
  const column = resolveConversationColumn(card, band)
  assert.ok(column)
  assert.equal(column.left, 300, '必须优先选择包含当前上下文的当前会话列')
  assert.equal(column.width, 1600)
  assert.equal(column.right, 1900)

  dom.window.close()
})

test('useComposerDocking: transitionend 事件安全过滤——仅响应几何属性（width/transform）或侧边栏目标', async () => {
  const env = withDom()
  const host = document.querySelector('[data-omnimux-starter-host]')
  host.classList.add('centerCol')
  let currentWidth = 1200
  host.getBoundingClientRect = () => ({ left: 300, right: 300 + currentWidth, width: currentWidth, height: 800 })

  const root = createRoot(document.querySelector('#seat'))
  let hookApi

  function TestHarness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef })
  }

  try {
    await act(async () => root.render(React.createElement(TestHarness)))
    await act(async () => hookApi.pin({ id: 'test-transition' }))

    // 初始停靠状态
    assert.equal(host.style.getPropertyValue('--omnimux-dock-width'), '952px')
    assert.equal(host.style.getPropertyValue('--omnimux-dock-left'), '424px') // 300 + (1200 - 952) / 2 = 424

    // 1. 模拟非几何属性（如 background-color）过渡完成，即使尺寸模拟变化，也不会触发重新计算
    currentWidth = 1000
    await act(async () => {
      const colorEvent = new window.Event('transitionend', { bubbles: true })
      Object.defineProperty(colorEvent, 'propertyName', { value: 'background-color' })
      Object.defineProperty(colorEvent, 'target', { value: host })
      window.dispatchEvent(colorEvent)
    })
    // 依然维持之前的 424px，没有被无关 transitionend 触发重算
    assert.equal(host.style.getPropertyValue('--omnimux-dock-left'), '424px')

    // 1b. 模拟非关联元素即使完成几何属性（如 width）过渡，也被安全拦截，不会触发重算
    await act(async () => {
      const unrelatedEl = document.createElement('div')
      unrelatedEl.className = 'unrelated-popup'
      document.body.appendChild(unrelatedEl)
      const unrelatedEvent = new window.Event('transitionend', { bubbles: true })
      Object.defineProperty(unrelatedEvent, 'propertyName', { value: 'width' })
      Object.defineProperty(unrelatedEvent, 'target', { value: unrelatedEl })
      window.dispatchEvent(unrelatedEvent)
      unrelatedEl.remove()
    })
    assert.equal(host.style.getPropertyValue('--omnimux-dock-left'), '424px')

    // 2. 模拟宿主/关联元素完成几何属性（如 width）过渡，准确触发重算更新
    await act(async () => {
      const widthEvent = new window.Event('transitionend', { bubbles: true })
      Object.defineProperty(widthEvent, 'propertyName', { value: 'width' })
      Object.defineProperty(widthEvent, 'target', { value: host })
      window.dispatchEvent(widthEvent)
    })
    // 300 + (1000 - 952) / 2 = 324px
    assert.equal(host.style.getPropertyValue('--omnimux-dock-left'), '324px')

    // 3. 模拟侧边栏子元素冒泡完成非 width 属性过渡（如 opacity），closest 穿透判定命中侧边栏目标，安全触发更新
    currentWidth = 1100
    await act(async () => {
      const sidebarEl = document.createElement('div')
      sidebarEl.className = 'dshDesktopSidebar'
      const sidebarChildEl = document.createElement('span')
      sidebarChildEl.className = 'sidebar-inner-item'
      sidebarEl.appendChild(sidebarChildEl)
      document.body.appendChild(sidebarEl)

      const sideEvent = new window.Event('transitionend', { bubbles: true })
      Object.defineProperty(sideEvent, 'propertyName', { value: 'opacity' })
      Object.defineProperty(sideEvent, 'target', { value: sidebarChildEl })
      window.dispatchEvent(sideEvent)

      sidebarEl.remove()
    })
    // 300 + (1100 - 952) / 2 = 374px
    assert.equal(host.style.getPropertyValue('--omnimux-dock-left'), '374px')
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
})
