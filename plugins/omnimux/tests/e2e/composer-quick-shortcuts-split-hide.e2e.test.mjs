import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { QUICK_SHORTCUTS_CSS, ensureQuickShortcutStyles } from '../../src/client/composer-quick-shortcuts/styles.js'

describe('E2E: 输入框下方快捷方式在非全屏/分屏模式下的隐藏契约', () => {
  it('样式表中必须完整声明分屏紧凑态与宿主分屏面板展开态的隐藏规则', () => {
    assert.match(
      QUICK_SHORTCUTS_CSS,
      /html\[data-omnimux-split-compact\]\s+\.omx-quick-shortcuts/,
      '必须声明 data-omnimux-split-compact 隐藏规则'
    )
    assert.match(
      QUICK_SHORTCUTS_CSS,
      /\.dshDesktopFrame:not\(\[data-rightbar-collapsed="true"\]\):has\(\[data-sidebar-right-panel\]\[data-sidebar-right-open\]:not\(\[data-sidebar-right-panel="fullscreen"\]\)\)\s+\.omx-quick-shortcuts/,
      '必须声明宿主分屏面板展开态隐藏规则'
    )
    assert.match(
      QUICK_SHORTCUTS_CSS,
      /display:\s*none\s*!important;/,
      '分屏隐藏规则必须是 display: none !important'
    )
  })

  it('在分屏真实 DOM 结构中，快捷方式节点成功匹配隐藏选择器', () => {
    const dom = new JSDOM(`
      <!doctype html>
      <html>
        <head></head>
        <body>
          <div class="dshDesktopFrame">
            <div data-sidebar-right-panel="push" data-sidebar-right-open="true"></div>
            <div class="omx-quick-shortcuts" data-omnimux-quick-shortcuts="true"></div>
          </div>
        </body>
      </html>
    `)
    const doc = dom.window.document
    ensureQuickShortcutStyles(doc)

    const shortcutsEl = doc.querySelector('.omx-quick-shortcuts')
    assert.ok(shortcutsEl, '快捷方式节点必须在 DOM 中')

    // 验证选择器匹配
    const splitSelector = '.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omx-quick-shortcuts'
    const matched = doc.querySelector(splitSelector)
    assert.equal(matched, shortcutsEl, '在分屏展开状态下必须精准匹配隐藏选择器')
  })

  it('在全屏模式下（右侧面板收起或右侧全屏），不命中分屏隐藏规则', () => {
    const dom = new JSDOM(`
      <!doctype html>
      <html>
        <head></head>
        <body>
          <div class="dshDesktopFrame">
            <div data-sidebar-right-panel="push"></div>
            <div class="omx-quick-shortcuts" data-omnimux-quick-shortcuts="true"></div>
          </div>
        </body>
      </html>
    `)
    const doc = dom.window.document
    ensureQuickShortcutStyles(doc)

    const splitSelector = '.dshDesktopFrame:not([data-rightbar-collapsed="true"]):has([data-sidebar-right-panel][data-sidebar-right-open]:not([data-sidebar-right-panel="fullscreen"])) .omx-quick-shortcuts'
    const matched = doc.querySelector(splitSelector)
    assert.equal(matched, null, '全屏状态下绝不能命中分屏隐藏选择器')
  })
})
