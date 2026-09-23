import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

/**
 * E2E：新会话页打开应用默认全屏（场景契约）。
 *
 * 用**真实构建产物**驱动：工作流 `openAppTab`（应用打开唯一漏斗）+ 中枢
 * `enterHostRightSidebarFullscreen`（官方全屏唯一实现），二者按运行时的公开缝
 * `__omnimuxEnterRightSidebarFullscreen` 接线，验证：
 *   1. 空会话（hero）打开应用 → 官方全屏按钮在调和器程序化保护内被点一次；
 *   2. 已有对话（非 hero）打开应用 → 按钮零点击，布局不动；
 *   3. 已全屏（面板无进入按钮）→ 安静 no-op，应用照常打开。
 *
 * 位置说明：包测试脚本 glob 为 `tests/*.test.mjs`（不下沉 tests/e2e/），
 * 本文件放在 tests/ 根，确保 `pnpm --filter omnimux-workflow test` 真正收集执行。
 */
async function bundle(entry) {
  const output = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
  })
  const module = { exports: {} }
  const factory = vm.runInThisContext(
    `(function (require, module, exports) {\n${output.outputFiles[0].text}\n})`,
    { filename: 'app-open-fullscreen.bundle.cjs' },
  )
  factory(createRequire(import.meta.url), module, module.exports)
  return module.exports
}

const { openAppTab, enterFullscreenWhenBlankConversation } = await bundle('../src/client/projects/projectCanvas.js')
const { enterHostRightSidebarFullscreen } = await bundle('../../omnimux/src/client/workbench/host-fullscreen.js')

const PANEL_OPEN = '<div data-sidebar-right-panel="push" data-sidebar-right-open="true"><button data-sidebar-right-mode="fullscreen" id="enter-fs">全屏</button></div>'
const PANEL_FULLSCREEN = '<div data-sidebar-right-panel="fullscreen" data-sidebar-right-open="true"><button data-sidebar-right-mode="push" id="exit-fs">分栏</button></div>'
const HERO = '<div data-phase="hero"><div data-composer-input="true" contenteditable="true"></div></div>'
const ACTIVE = '<div data-phase="active"><div data-composer-input="true" contenteditable="true"></div></div>'

function setup({ conversation, panel }) {
  const dom = new JSDOM(`<!doctype html><html><body>${conversation}${panel}</body></html>`)
  const win = dom.window
  const clicks = []
  win.document.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => clicks.push(btn.id))
  })
  const opened = []
  win.__omnimuxBetterSidebar = {
    openTab(seed) { opened.push(seed); return true },
  }
  win.__omnimuxEnterRightSidebarFullscreen = enterHostRightSidebarFullscreen
  const guard = []
  win.__omnimuxTabViewport = {
    beginProgrammatic() { guard.push('begin') },
    endProgrammatic() { guard.push('end') },
  }
  const previous = globalThis.window
  globalThis.window = win
  return { dom, win, clicks, opened, guard, restore: () => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous } }
}

describe('E2E: 新会话页打开应用默认全屏', () => {
  it('空会话打开应用：官方全屏按钮在程序化保护内被点击一次，应用照常打开', () => {
    const ctx = setup({ conversation: HERO, panel: PANEL_OPEN })
    try {
      assert.equal(openAppTab({ appId: 'demo_app', metadata: { name: '演示应用' } }), true)
      assert.equal(ctx.opened.length, 1, '应用标签必须照常打开')
      assert.equal(ctx.opened[0].id, 'app_demo_app')
      assert.deepEqual(ctx.clicks, ['enter-fs'], '官方进入全屏按钮必须被点击恰好一次')
      assert.deepEqual(ctx.guard, ['begin', 'end'], '全屏动作必须包在调和器程序化保护内，不写用户意图')
    } finally {
      ctx.restore()
      ctx.dom.window.close()
    }
  })

  it('已有对话打开应用：按钮零点击，布局保持原样', () => {
    const ctx = setup({ conversation: ACTIVE, panel: PANEL_OPEN })
    try {
      assert.equal(openAppTab({ appId: 'demo_app_2' }), true)
      assert.equal(ctx.opened.length, 1)
      assert.deepEqual(ctx.clicks, [], '非空会话打开应用绝不得点击任何模式按钮')
      assert.deepEqual(ctx.guard, [], '非空会话不得进入程序化保护')
    } finally {
      ctx.restore()
      ctx.dom.window.close()
    }
  })

  it('已处于全屏：安静 no-op，不产生退出/进入的误点击', () => {
    const ctx = setup({ conversation: HERO, panel: PANEL_FULLSCREEN })
    try {
      assert.equal(openAppTab({ appId: 'demo_app_3' }), true)
      assert.equal(ctx.opened.length, 1)
      assert.deepEqual(ctx.clicks, [], '已全屏时绝不得产生任何按钮点击')
    } finally {
      ctx.restore()
      ctx.dom.window.close()
    }
  })

  it('直接调用助手：hero + 中枢缝 → 返回 true；缝真实实现按官方契约驱动按钮', () => {
    const ctx = setup({ conversation: HERO, panel: PANEL_OPEN })
    try {
      assert.equal(enterFullscreenWhenBlankConversation(ctx.win), true)
      assert.deepEqual(ctx.clicks, ['enter-fs'])
    } finally {
      ctx.restore()
      ctx.dom.window.close()
    }
  })
})
