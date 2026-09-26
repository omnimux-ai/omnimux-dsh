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
    __omnimuxFullscreenExploreActive: false,
    __omnimuxWorkbench: null,
  }

  globalThis.window = win
  return {
    win,
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

test('Tab 栏吸顶固定样式契约验证：.omnimux-explore-filter-bar 包含 position: sticky 与 top: 0', () => {
  const stylesSource = readFileSync(new URL('./styles.js', import.meta.url), 'utf8')
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*position:\s*sticky/i, '必须设置 position: sticky')
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*top:\s*0/i, '必须设置 top: 0 吸顶固定')
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*z-index:\s*80/i, '必须具备合适的 z-index 保证吸顶层级')
})
