/**
 * E2E：切 Tab 引起的被动位移不得把吸底输入框弹回顶部（#3832）。
 *
 * 换库时列表重建、页面变矮，浏览器会把 scrollTop 夹回合法范围。这段位移不是
 * 用户滚动意图：没有静默窗口时它会被读成「滑回顶部」，输入框被弹回去；
 * 有了 holdScroll() 声明的窗口，输入框必须守住吸底。
 *
 * 用例把同一段夹回位移跑两遍，两条断言互为对照 —— 只有「无窗口会弹回」成立，
 * 「有窗口守住」才说明修复真的起作用，而不是夹具本来就不触发。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import React, { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { JSDOM } from 'jsdom'
import { useComposerDocking, DOCK_OPEN_ATTR } from './useComposerDocking.js'

/**
 * 走一遍「滚到深处 → 点卡片吸底 → 内容变矮被夹回顶部」。
 *
 * 滚动容器必须带 `data-conversation-scroll`：hook 只认这个宿主锚点，
 * 缺了它 readPageScrollTop 永远读 0，整段模拟都是空转。
 */
async function clampJourney({ suppress }) {
  const dom = new JSDOM(`<!doctype html>
<html><head></head><body>
  <div id="root" data-omnimux-starter-host="">
    <div data-conversation-scroll style="height: 600px; overflow-y: auto;">
      <div data-composer-seat="">
        <div data-composer-card="" style="height: 160px;">
          <div data-composer-input="true" contenteditable="true"></div>
        </div>
      </div>
      <div style="height: 2000px;"><div id="guide-inner"></div></div>
    </div>
  </div>
</body></html>`, { url: 'http://localhost/' })

  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Element = dom.window.Element
  globalThis.Node = dom.window.Node
  globalThis.CustomEvent = dom.window.CustomEvent
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const scroller = dom.window.document.querySelector('[data-conversation-scroll]')
  Object.defineProperty(scroller, 'scrollTop', { writable: true, value: 0 })
  const host = dom.window.document.querySelector('#root')

  let hookApi = null
  function Harness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef })
  }
  const root = createRoot(dom.window.document.querySelector('#guide-inner'))
  try {
    await act(async () => {
      root.render(React.createElement(Harness))
    })

    // 滚到深处并触发滚动事件：hook 记住「确实离开过顶部」
    scroller.scrollTop = 550
    await act(async () => {
      scroller.dispatchEvent(new dom.window.Event('scroll'))
      await new Promise((resolve) => setTimeout(resolve, 80))
    })
    // 点卡片吸底
    await act(async () => {
      hookApi.dock({ id: 'asset_tab_switch', title: '资产卡' }, { force: true })
    })
    assert.equal(hookApi.placement, 'docked', '前置条件：点卡片后必须吸底')

    // 换库：内容变矮，浏览器把 scrollTop 夹回 0
    await act(async () => {
      if (suppress) hookApi.holdScroll(600)
      scroller.scrollTop = 0
      scroller.dispatchEvent(new dom.window.Event('scroll'))
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
    return { placement: hookApi.placement, dockOpen: host.hasAttribute(DOCK_OPEN_ATTR) }
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
}

test('E2E：切 Tab 被夹回的位移，无静默窗口会弹回、有静默窗口必须守住吸底', async () => {
  const withoutWindow = await clampJourney({ suppress: false })
  assert.equal(
    withoutWindow.placement,
    'inline',
    '没有静默窗口时，被夹回顶部的位移会被读成用户滚动意图 —— 这正是要修的缺陷',
  )

  const withWindow = await clampJourney({ suppress: true })
  assert.equal(withWindow.placement, 'docked', '静默窗口内被夹回的位移不得把输入框弹回顶部')
  assert.equal(withWindow.dockOpen, true, '吸底标记必须保留')
})
