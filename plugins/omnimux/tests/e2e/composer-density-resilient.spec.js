/**
 * E2E 契约：输入框尺寸监听器重挂自愈与容器查询自适应纯图标兜底（Issue #2302）。
 * 覆盖：
 *  1. [data-composer-card] 声明容器查询上下文（container-type 与 container-name）；
 *  2. 声明 @container composer-card (max-width: 459px) 原生自适应收敛纯图标规则；
 *  3. 工具栏声明 overflow: hidden 与左侧插槽 flex-shrink: 1 弹性防溢出；
 *  4. 验证 DOM 节点重绘/重挂时监听器自愈重新绑定。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COMPOSER_COMPACT_CSS,
  COMPOSER_COMPACT_ATTR,
  COMPOSER_COMPACT_DENSITY,
  installComposerCompactObserver,
  resetComposerCompactForTests
} from '../../src/client/composer-compact.js'

test('E2E: [data-composer-card] 声明容器查询上下文与 459px 纯图标原生自适应兜底', () => {
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-composer-card\]\{[^}]*container-type:inline-size;/,
    '必须声明 container-type: inline-size'
  )
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-composer-card\]\{[^}]*container-name:composer-card;/,
    '必须声明 container-name: composer-card'
  )
  assert.match(
    COMPOSER_COMPACT_CSS,
    /@container composer-card \(max-width: 459px\)\{/,
    '必须包含 459px 纯图标收敛容器查询'
  )
})

test('E2E: 左侧工具栏声明 overflow: hidden 与插槽弹性防溢出，杜绝覆盖右侧模型选择按钮', () => {
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-composer-card\] \[class\*="tools"\]\{[^}]*overflow:hidden;/,
    '工具栏必须防溢出'
  )
  assert.match(
    COMPOSER_COMPACT_CSS,
    /\[data-composer-card\] \[class\*="tools"\] \[data-slot="conversation\.input\.left"\]\{[^}]*min-width:0;/,
    '左侧插槽必须允许缩小'
  )
})

test('E2E: 模拟 React 重新渲染卡片节点，MutationObserver 必须持续自愈重新绑定新节点', async () => {
  let cardWidth = 700
  let mutationCallback = null

  class FakeResizeObserver {
    constructor(cb) { this.cb = cb }
    observe() {}
    disconnect() {}
  }
  class FakeMutationObserver {
    constructor(cb) { mutationCallback = cb }
    observe() {}
    disconnect() { mutationCallback = null }
  }

  globalThis.ResizeObserver = FakeResizeObserver
  globalThis.MutationObserver = FakeMutationObserver

  const attrs = new Map()
  const doc = {
    head: { append() {} },
    documentElement: {
      setAttribute(k, v) { attrs.set(k, String(v)) },
      removeAttribute(k) { attrs.delete(k) },
      getAttribute(k) { return attrs.get(k) || null },
      style: { setProperty() {}, removeProperty() {} }
    },
    body: {},
    defaultView: globalThis,
    getElementById() { return null },
    querySelector(sel) {
      if (sel === '[data-composer-card]') {
        return {
          isConnected: true,
          getBoundingClientRect: () => ({ width: cardWidth, left: 0 })
        }
      }
      return null
    }
  }

  const dispose = installComposerCompactObserver(doc)
  assert.equal(doc.documentElement.getAttribute(COMPOSER_COMPACT_ATTR), COMPOSER_COMPACT_DENSITY.full)

  // 模拟窗口缩窄且 React 卸载重建了卡片（宽度变成 358px）
  cardWidth = 358
  if (mutationCallback) mutationCallback()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(
    doc.documentElement.getAttribute(COMPOSER_COMPACT_ATTR),
    COMPOSER_COMPACT_DENSITY.icon,
    '节点重新挂载后必须自动更新密度为 icon'
  )

  dispose()
  resetComposerCompactForTests()
})
