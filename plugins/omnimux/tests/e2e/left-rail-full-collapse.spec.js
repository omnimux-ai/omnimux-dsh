/**
 * 端到端契约：左侧侧边栏完全收起（Issue #2077）。
 *
 * 产品要求收起即完全收起 —— 宿主收起后仍保留一条原生窄栏（真机 90px），
 * 插件不得再如实镜像这条残留宽度，否则右侧栏收起规则会把框架首列钉住，
 * 屏左留下死带，全屏面板左缘与输入框投射也一并偏移。
 *
 * 本用例驱动真实写入函数 `applyTopbarToggleCssVars`，断言镜像变量与消费端 CSS 契约。
 */

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { applyTopbarToggleCssVars } from '../../src/client/sidebar-toggle-topbar.js'
import { PRODUCT_STAGE_CHROME } from '../../src/client/conversation-box.js'

/** 全屏面板的样式常量未对外导出，按仓库既有做法读模块源码做契约断言。 */
const moduleSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/client/sidebar-toggle-topbar.js'),
  'utf8',
)

let dom
const previousWindow = globalThis.window
const previousDocument = globalThis.document

afterEach(() => {
  dom?.window.close()
  dom = undefined
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
  if (previousDocument === undefined) delete globalThis.document
  else globalThis.document = previousDocument
})

const readWidth = (doc) => doc.documentElement.style.getPropertyValue('--omnimux-sidebar-width')

/**
 * 桌面三栏夹具：与真机一致的「左侧栏 + 会话列 + 右侧栏」网格。
 * @param {{ inlineTrack: string, railWidth: number, leftCollapsed: boolean }} opts
 */
function fixture(opts) {
  dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame" style="grid-template-columns: ${opts.inlineTrack} minmax(0px, 1fr) 0px;">
      <div class="sidebarCol_x"></div>
      <main class="dshDesktopConversationSurface"></main>
      <aside class="dshDesktopRightbarSurface"><div data-sidebar-right-panel="push"></div></aside>
    </div>
  </body></html>`, { url: 'http://127.0.0.1:45120/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const doc = dom.window.document
  const frame = doc.querySelector('.dshDesktopFrame')
  const col = doc.querySelector('[class*="sidebarCol"]')
  Object.defineProperty(col, 'offsetWidth', { value: opts.railWidth, configurable: true })
  frame.setAttribute('data-rightbar-collapsed', 'true')
  if (opts.leftCollapsed) {
    doc.documentElement.setAttribute('data-omnimux-left-collapsed', '')
    frame.setAttribute('data-sidebar-collapsed', '')
  }
  return doc
}

test('AC-1: 收起意图为真时镜像宽度为 0（不采信壳层残留的 90px 窄栏）', () => {
  const doc = fixture({ inlineTrack: '90px', railWidth: 90, leftCollapsed: true })
  applyTopbarToggleCssVars(doc)
  assert.equal(readWidth(doc), '0px', '收起后必须完全收起，不得镜像壳层残留窄栏')
})

test('AC-1: 即便壳层首列是 56px 折叠轨，收起态同样归零', () => {
  const doc = fixture({ inlineTrack: '56px', railWidth: 56, leftCollapsed: true })
  applyTopbarToggleCssVars(doc)
  assert.equal(readWidth(doc), '0px')
})

test('AC-3: 左侧栏展开时仍如实镜像壳层真实栏宽（不回归）', () => {
  const doc = fixture({ inlineTrack: '300px', railWidth: 300, leftCollapsed: false })
  applyTopbarToggleCssVars(doc)
  assert.equal(readWidth(doc), '300px')
})

test('AC-2 & AC-4: 消费端 CSS 用同一变量，收起态首列与全屏面板左缘均归零', () => {
  assert.match(
    PRODUCT_STAGE_CHROME,
    /\.dshDesktopFrame\[data-rightbar-collapsed="true"\][^{]*\{[^}]*grid-template-columns:\s*var\(--omnimux-sidebar-width,\s*280px\)\s*minmax\(0px,\s*1fr\)\s*0px/,
    '右侧栏收起规则必须消费镜像变量',
  )
  assert.match(
    moduleSource,
    /html\[data-omnimux-left-collapsed\][^{]*\[data-sidebar-right-panel="fullscreen"\][^{]*\{[^}]*width:\s*calc\(100vw - var\(--omnimux-sidebar-width,\s*0px\)\)/,
    '左侧栏收起时全屏面板宽度必须扣掉镜像变量（收起态为 0，即铺满 100vw）',
  )
})
