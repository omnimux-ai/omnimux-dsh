/**
 * jsdom E2E: the injected topbar chrome must survive hostile DOM failures.
 *
 * Issue #3503 P1 把本模块 41 处 `catch {}` 收敛为 `safeDom(fn, fallback)`；本文件用真实
 * DOM（jsdom）验证收敛后的**可观察行为**，而不是源码文本：
 *  - 单点 DOM 操作（remove / disconnect）抛错时，安装与卸载流程仍完成，
 *    页面保持可操作（注入按钮仍能驱动官方侧边栏按钮）。
 *  - `triggerClick` 仍是「React synthetic props → dispatchEvent → click」三段式降级，
 *    前一段抛错时继续尝试下一段。
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'

import {
  SIDEBAR_TOGGLE_TOPBAR_ATTR,
  SIDEBAR_TOGGLE_TOPBAR_HTML_ATTR,
  SIDEBAR_ORIGINAL_TOGGLE_ATTR,
  TOPBAR_NEW_SESSION_ATTR,
  TOPBAR_RIGHT_EXPAND_ATTR,
  ensureSidebarToggleTopbar,
  injectTopbarNewSessionButton,
  installSidebarToggleTopbar,
  triggerClick,
} from './sidebar-toggle-topbar.js'

const FIXTURE_HTML = `<!doctype html><html><body>
  <div class="frame_abc" data-sidebar-collapsed>
    <div class="sidebarCol_x">
      <div class="logoRow_y">
        <button type="button" class="iconButton_z toggle_w" aria-label="打开侧边栏">T</button>
      </div>
      <button type="button" class="newSession_n" aria-label="新建会话">新会话</button>
    </div>
  </div>
  <div class="tabBar_n" data-dsh-better-sidebar>
    <div class="tabList_m"></div>
  </div>
</body></html>`

const previous = {
  window: globalThis.window,
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  MouseEvent: globalThis.MouseEvent,
  MutationObserver: globalThis.MutationObserver,
}

let dom

afterEach(() => {
  dom?.window.close()
  dom = undefined
  globalThis.window = previous.window
  globalThis.document = previous.document
  globalThis.HTMLElement = previous.HTMLElement
  globalThis.MouseEvent = previous.MouseEvent
  if (previous.MutationObserver === undefined) delete globalThis.MutationObserver
  else globalThis.MutationObserver = previous.MutationObserver
})

function setup(html = FIXTURE_HTML) {
  dom = new JSDOM(html, { url: 'http://127.0.0.1/' })
  const { window } = dom
  globalThis.window = window
  globalThis.document = window.document
  globalThis.HTMLElement = window.HTMLElement
  globalThis.MouseEvent = window.MouseEvent
  globalThis.MutationObserver = window.MutationObserver
  return window.document
}

function injectedToggle(doc) {
  return doc.querySelector(`[${SIDEBAR_TOGGLE_TOPBAR_ATTR}="1"]`)
}

function officialToggle(doc) {
  return doc.querySelector(`button[aria-label="打开侧边栏"]:not([${SIDEBAR_TOGGLE_TOPBAR_ATTR}])`)
}

describe('injected topbar chrome survives throwing DOM operations (jsdom E2E)', () => {
  it('completes installation when a stale injected node refuses to be removed, and the toggle stays operable', () => {
    const doc = setup()
    // 一个残留的插件节点，remove() 被宿主/扩展覆写成抛错：安装流程不得因此中断。
    const stale = doc.createElement('button')
    stale.setAttribute(TOPBAR_RIGHT_EXPAND_ATTR, '1')
    doc.body.appendChild(stale)
    stale.remove = () => { throw new Error('remove is blocked by host') }

    const official = officialToggle(doc)
    let officialClicks = 0
    official.addEventListener('click', () => { officialClicks += 1 })

    const cleanup = installSidebarToggleTopbar(doc)

    assert.equal(typeof cleanup, 'function')
    assert.notEqual(injectedToggle(doc), null, '注入的 toggle 必须仍然存在')
    assert.equal(doc.documentElement.hasAttribute(SIDEBAR_TOGGLE_TOPBAR_HTML_ATTR), true)
    assert.equal(official.hasAttribute(SIDEBAR_ORIGINAL_TOGGLE_ATTR), true, '官方按钮仍被标记为程序化触发器')

    // 页面仍然可操作：点击注入按钮必须驱动官方侧边栏按钮。
    injectedToggle(doc).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    assert.equal(officialClicks, 1, '注入按钮必须穿透到官方按钮的 click')

    assert.doesNotThrow(() => cleanup())
  })

  it('completes cleanup even when every observer disconnect() throws', () => {
    const doc = setup()
    const RealObserver = dom.window.MutationObserver
    class ThrowingDisconnectObserver extends RealObserver {
      disconnect() {
        throw new Error('disconnect is blocked by host')
      }
    }
    dom.window.MutationObserver = ThrowingDisconnectObserver

    const cleanup = installSidebarToggleTopbar(doc)
    assert.notEqual(injectedToggle(doc), null)

    // 卸载必须继续跑完剩余清理：四个 observer 的 disconnect 全部抛错也不得中断。
    assert.doesNotThrow(() => cleanup())
    assert.equal(doc.documentElement.hasAttribute(SIDEBAR_TOGGLE_TOPBAR_HTML_ATTR), false)
    assert.equal(injectedToggle(doc), null)
    assert.equal(doc.querySelector(`[${TOPBAR_NEW_SESSION_ATTR}="1"]`), null)
    assert.equal(officialToggle(doc).hasAttribute(SIDEBAR_ORIGINAL_TOGGLE_ATTR), false)
  })

  it('completes cleanup when the injected nodes were already removed by the host', () => {
    const doc = setup()
    const cleanup = installSidebarToggleTopbar(doc)
    injectedToggle(doc).remove()
    doc.querySelector(`[${TOPBAR_NEW_SESSION_ATTR}="1"]`).remove()

    assert.doesNotThrow(() => cleanup(), '节点已被移除时卸载不得抛错')
    assert.equal(doc.documentElement.hasAttribute(SIDEBAR_TOGGLE_TOPBAR_HTML_ATTR), false)
    assert.equal(doc.documentElement.hasAttribute('data-omnimux-left-collapsed'), false)
  })

  it('keeps new-session injection working when the stale button cannot be removed', () => {
    const doc = setup()
    installSidebarToggleTopbar(doc)
    const staleNewSession = doc.querySelector(`[${TOPBAR_NEW_SESSION_ATTR}="1"]`)
    assert.notEqual(staleNewSession, null)
    staleNewSession.remove = () => { throw new Error('remove is blocked by host') }

    let returned
    assert.doesNotThrow(() => {
      returned = injectTopbarNewSessionButton(doc, false)
    }, '移除失败不得让折叠态切换抛错')
    assert.equal(returned, null, '展开态不保留新会话按钮，返回 null 的契约不变')
  })

  it('triggerClick falls back to dispatchEvent when the React props handler throws', () => {
    const doc = setup()
    const el = doc.createElement('button')
    doc.body.appendChild(el)
    let reactCalls = 0
    el.__reactProps$e2e = {
      onClick() {
        reactCalls += 1
        throw new Error('react onClick exploded')
      },
    }
    let dispatched = 0
    el.addEventListener('click', () => { dispatched += 1 })

    assert.doesNotThrow(() => triggerClick(el))
    assert.equal(reactCalls, 1, 'React props 分支必须先被尝试')
    assert.equal(dispatched, 1, 'React 分支抛错后必须降级到 dispatchEvent')
  })

  it('triggerClick falls back to click() when both React props and dispatchEvent fail', () => {
    const doc = setup()
    const el = doc.createElement('button')
    doc.body.appendChild(el)
    let reactCalls = 0
    el.__reactProps$e2e = {
      onClick() {
        reactCalls += 1
        throw new Error('react onClick exploded')
      },
    }
    el.dispatchEvent = () => { throw new Error('dispatchEvent is blocked') }
    let clicked = 0
    el.addEventListener('click', () => { clicked += 1 })

    assert.doesNotThrow(() => triggerClick(el))
    assert.equal(reactCalls, 1)
    assert.equal(clicked, 1, '前两段都失败时最后一段 el.click() 必须仍然生效')
  })

  it('ensureSidebarToggleTopbar keeps a stable export contract with thrown removals', () => {
    const doc = setup()
    const stale = doc.createElement('button')
    stale.setAttribute(TOPBAR_RIGHT_EXPAND_ATTR, '1')
    doc.body.appendChild(stale)
    stale.remove = () => { throw new Error('remove is blocked by host') }

    const btn = ensureSidebarToggleTopbar(doc)
    assert.notEqual(btn, null, '安装必须返回注入的 toggle（导出契约不变）')
    assert.equal(btn.getAttribute('aria-label'), '打开侧边栏')
    assert.equal(doc.documentElement.hasAttribute(SIDEBAR_TOGGLE_TOPBAR_HTML_ATTR), true)
  })
})
