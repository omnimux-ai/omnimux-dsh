import assert from 'node:assert/strict'
import test from 'node:test'
import React, { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { JSDOM } from 'jsdom'
import { useComposerDocking, DOCK_OPEN_ATTR } from './useComposerDocking.js'
import { focusEditorElement } from '../../../omnimux/src/client/attachments/focusEditorElement.ts'

function setupDom() {
  const dom = new JSDOM(`<!doctype html>
<html>
  <head></head>
  <body>
    <div id="root" data-omnimux-starter-host="">
      <div class="scrollBody" style="height: 600px; overflow-y: auto;">
        <div id="seat" data-composer-seat="">
          <div data-composer-card="" style="height: 160px;">
            <div data-composer-input="true" contenteditable="true"></div>
          </div>
        </div>
        <div id="guide" style="height: 2000px;">
          <div id="guide-inner"></div>
        </div>
      </div>
    </div>
  </body>
</html>`, { url: 'http://localhost/' })

  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Element = dom.window.Element
  globalThis.Node = dom.window.Node
  globalThis.CustomEvent = dom.window.CustomEvent
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

  const scroller = dom.window.document.querySelector('.scrollBody')
  Object.defineProperty(scroller, 'scrollTop', {
    writable: true,
    value: 0,
  })

  return { dom, scroller, host: dom.window.document.querySelector('#root') }
}

test('focusEditorElement: 必须携带 preventScroll: true 阻止滚动条抽回页首', (t) => {
  const { dom } = setupDom()
  t.after(() => dom.window.close())

  const input = dom.window.document.querySelector('[data-composer-input="true"]')
  let receivedOptions = null
  input.focus = (opts) => {
    receivedOptions = opts
  }

  focusEditorElement(dom.window.document)
  assert.deepEqual(receivedOptions, { preventScroll: true }, '聚焦输入框必须强制携带 preventScroll: true')
})

test('useComposerDocking: 长列表滚动状态下调用 dock(item, { force: true }) 必须坚决吸底，绝不退回 inline', async (t) => {
  const { dom, scroller, host } = setupDom()
  t.after(() => dom.window.close())

  let hookApi = null
  function Harness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef })
  }

  const root = createRoot(dom.window.document.querySelector('#guide-inner'))
  await act(async () => {
    root.render(React.createElement(Harness))
  })

  // 1. 模拟向下滚动到 550px
  scroller.scrollTop = 550
  assert.equal(hookApi.placement, 'inline', '初始向下滚动未触发意图前保持 inline')

  // 2. 模拟点击卡片复刻（显式带 force: true 意图）
  let callbackFired = false
  await act(async () => {
    const ok = hookApi.dock({ id: 'trending_card_1', title: '助眠视频' }, {
      force: true,
      onDocked: () => {
        callbackFired = true
      },
    })
    assert.equal(ok, true, 'dock 必须返回成功')
  })

  assert.equal(hookApi.placement, 'docked', '点击卡片必须坚决进入 docked 态')
  assert.equal(hookApi.isDocked, true, 'isDocked 必须为 true')
  assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), true, '宿主根节点必须打上 data-omnimux-dock-open')
  assert.equal(callbackFired, true, '就位回调必须被调用')

  // 3. 再次点击同一卡片：作为反悔动作解除吸底
  await act(async () => {
    const ok = hookApi.dock({ id: 'trending_card_1', title: '助眠视频' }, {
      force: true,
    })
    assert.equal(ok, false, '再次点击同卡片必须返回 false 触发反悔')
  })

  assert.equal(hookApi.placement, 'inline', '反悔后必须归还 inline')
  assert.equal(hookApi.isDocked, false, 'isDocked 必须恢复为 false')
  assert.equal(host.hasAttribute(DOCK_OPEN_ATTR), false, '宿主吸底标记必须被移除')
})

test('useComposerDocking: dock 回调执行时锁定视口滚动位置，保持 0 像素位移', async (t) => {
  const { dom, scroller } = setupDom()
  t.after(() => dom.window.close())

  let hookApi = null
  function Harness() {
    const guideRef = useRef(null)
    hookApi = useComposerDocking({ hostRef: guideRef })
    return React.createElement('div', { ref: guideRef })
  }

  const root = createRoot(dom.window.document.querySelector('#guide-inner'))
  await act(async () => {
    root.render(React.createElement(Harness))
  })

  scroller.scrollTop = 520

  let scrollDuringCallback = null
  await act(async () => {
    hookApi.dock({ id: 'template_card_2', title: '营销模板' }, {
      force: true,
      onDocked: () => {
        scrollDuringCallback = scroller.scrollTop
      },
    })
  })

  assert.equal(scrollDuringCallback, 520, '执行回调预填提示词时视口滚动必须稳固锁定在 520px，绝不跳顶')
  assert.equal(scroller.scrollTop, 520, '最终滚动位置保持一致')
})
