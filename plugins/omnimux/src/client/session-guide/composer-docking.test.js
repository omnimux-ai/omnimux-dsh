import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React, { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import {
  useComposerDocking,
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

test('useComposerDocking: 调用 dock(item) 后宿主被打上 dock-open 标记，且设置几何变量', async () => {
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
      const res = hookApi.dock({ id: 'sk-test-skill', title: '测试技能' })
      assert.equal(res, true)
    })
    await flush()

    assert.equal(hookApi.placement, 'docked')
    assert.equal(hookApi.isDocked, true)
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true, '调用 dock 后宿主必须打上停靠标记')
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
    await act(async () => hookApi.dock({ id: 'inline-demand' }))
    assert.equal(host.style.getPropertyValue('--omnimux-dock-width'), '960px')
    availableWidth = 900
    await act(async () => window.dispatchEvent(new window.Event('resize')))
    assert.equal(host.style.getPropertyValue('--omnimux-dock-width'), '888px')
    assert.equal(host.style.getPropertyValue('--omnimux-dock-left'), '406px')
    await act(async () => {
      card.querySelector('[data-omx-quick-shortcut-controls]').remove()
      await Promise.resolve()
    })
    assert.equal(host.style.getPropertyValue('--omnimux-dock-width'), '780px')
    assert.equal(card.style.width, '')
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
      hookApi.dock({ id: 'sk-test-skill', title: '测试技能' })
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

    // 第一次点击：吸底
    await act(async () => {
      const res = hookApi.dock({ id: 'sk-skill-1', title: '技能1' })
      assert.equal(res, true)
    })
    await flush()
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true)

    // 第二次点击同一卡片：反悔解除吸底
    await act(async () => {
      const res = hookApi.dock({ id: 'sk-skill-1', title: '技能1' })
      assert.equal(res, false, '再次点击同一卡片应返回 false')
    })
    await flush()
    assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '反悔后必须解除停靠')
    assert.equal(hookApi.isDocked, false)
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
    assert.equal(hookApi.placement, 'docked')

    // 模拟向下滚动离开顶部 (>leaveThreshold 186px)
    scroller.scrollTop = 250
    await act(async () => {
      scroller.dispatchEvent(new window.Event('scroll'))
      await new Promise((r) => setTimeout(r, 10))
    })
    await flush()
    assert.equal(hookApi.placement, 'docked', '向下滚动离开顶部槽位后保持吸底')

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
      hookApi.dock({ id: 'sk-skill-1', title: '技能1' })
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

test('getComposerScrollThresholds: 卡片缺失时返回防御性基线，严禁将 root 作为 band', () => {
  const dom = new JSDOM('<div id="root" style="height: 5000px;"><div class="no-card"></div></div>')
  const root = dom.window.document.getElementById('root')
  const thresholds = getComposerScrollThresholds(root, null)
  assert.deepEqual(thresholds, {
    revealThreshold: READ_TOP_MAX,
    leaveThreshold: DOCK_LEAVE_MAX,
    measuredHeight: 0,
    offsetTop: 0,
  }, '卡片缺失时必须返回安全基线常量，严禁把 root 当作 band 测出几千像素的高度')
})

test('getComposerScrollThresholds: 当 scroller !== band.offsetParent 时精确按相对坐标系计算 offsetTop', () => {
  const dom = new JSDOM(`
    <div id="root">
      <div id="scroller" style="overflow-y: auto;">
        <div id="parent-container" style="position: relative;">
          <div id="band">
            <div data-composer-card="" style="height: 120px;"></div>
          </div>
        </div>
      </div>
    </div>
  `)
  const root = dom.window.document.getElementById('root')
  const scroller = dom.window.document.getElementById('scroller')
  const band = dom.window.document.getElementById('band')
  const card = dom.window.document.querySelector('[data-composer-card]')

  // 模拟布局信息：band 距离视口 top 220，scroller 距离视口 top 50，当前 scroller 已滚动 30px
  scroller.scrollTop = 30
  band.getBoundingClientRect = () => ({ top: 220, height: 120, width: 780, left: 10, bottom: 340, right: 790 })
  card.getBoundingClientRect = () => ({ top: 220, height: 120, width: 780, left: 10, bottom: 340, right: 790 })
  scroller.getBoundingClientRect = () => ({ top: 50, height: 600, width: 800, left: 0, bottom: 650, right: 800 })

  const thresholds = getComposerScrollThresholds(root, scroller)
  assert.equal(thresholds.offsetTop, 200, '必须通过相对坐标系精确计算 offsetTop')
  assert.equal(thresholds.measuredHeight, 120)
  assert.equal(thresholds.revealThreshold, 320)
  assert.equal(thresholds.leaveThreshold, 340)
})

test('useComposerDocking: 滚动热路径直接读取 thresholdsRef 缓存，避免重复触发 getBoundingClientRect 同步重排', async () => {
  const env = withDom()
  const host = document.querySelector('[data-omnimux-starter-host]')
  const scroller = host.querySelector('.scrollBody')
  const card = host.querySelector('[data-composer-card]')
  const root = createRoot(document.querySelector('#seat'))
  let hookApi = null

  let rectCallCount = 0
  const originalGetBoundingClientRect = card.getBoundingClientRect
  card.getBoundingClientRect = function tracked() {
    rectCallCount++
    return originalGetBoundingClientRect.call(this)
  }

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
      hookApi.dock({ id: 'sk-perf-test', title: '性能测试' })
    })
    await flush()

    const countAfterDock = rectCallCount

    // 触发多次连续滚动
    for (let i = 0; i < 5; i++) {
      scroller.scrollTop = 200 + i * 10
      await act(async () => {
        scroller.dispatchEvent(new window.Event('scroll'))
        await new Promise((r) => setTimeout(r, 5))
      })
    }
    await flush()

    // 断言：在滚动热路径 evaluate 评估期间，直接读取 thresholdsRef，不产生针对 card 的 getBoundingClientRect 重新测量
    assert.equal(
      rectCallCount,
      countAfterDock,
      '滚动热路径不得在每一帧调用 getBoundingClientRect 造成强制同步重排 (Layout Thrashing)',
    )
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
})
