/**
 * 官方「更多」菜单（seat `sidebar.panellist.actions`）注册与渲染回归测试（Issue #3774）。
 *
 * 覆盖：注册形状（seat 名 / id / order）、10 行文案与顺序、分组分隔线、
 * 点击先关官方菜单再走既有激活委托、老宿主 / 非法 primitives 的 no-op，
 * 以及「不顶层 import 官方 primitives、不复制第二份清单」的依赖注入与单一真源约束。
 *
 * 加载方式（为什么不是 `new Function`）：`.jsx` 不能被 node 直接加载
 * （ERR_UNKNOWN_FILE_EXTENSION），而仓内防作弊门禁（scripts/guard-anti-cheat.mjs）
 * 禁止测试使用 `eval` / `new Function` / 动态 `import()` / `require()`。
 * 因此按该模块的真实形态加载：esbuild 打成 IIFE，作为 `<script>` 注入
 * `runScripts: 'dangerously'` 的 jsdom，再从 window 取回导出 —— 与仓内
 * `subjectBrowse.runtime.test.mjs` 的 bundle + jsdom 做法同源。
 * react / react-dom 一并打进该 bundle，组件树与渲染器同 realm。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { resolveExploreMenuItems } from './sidebar-coordinator.js'

const here = dirname(fileURLToPath(import.meta.url))
const sourceFile = join(here, 'explore-more-menu.jsx')
const source = readFileSync(sourceFile, 'utf8')

const built = await build({
  absWorkingDir: here,
  stdin: {
    contents: "export * from './explore-more-menu.jsx'\nexport * as React from 'react'\nexport * as ReactDOMClient from 'react-dom/client'\n",
    resolveDir: here,
    loader: 'js',
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: '__omnimuxExploreMoreMenu',
  platform: 'browser',
  jsx: 'automatic',
  logLevel: 'warning',
})
const BUNDLE = built.outputFiles[0].text

/** 真源清单（与浮动菜单同一份）：行文案、顺序、分组、图标都从这里取。 */
const TRUTH = resolveExploreMenuItems()
const EXPECTED_LABELS = TRUTH.map((item) => item.label)
const EXPECTED_SEPARATORS = TRUTH.map((item, index) => index > 0 && TRUTH.at(index - 1).dividerAfter === true)
const SEPARATOR_OWNERS = TRUTH.filter((item, index) => index > 0 && TRUTH.at(index - 1).dividerAfter === true)
  .map((item) => item.label)

/** 注入 bundle 的 jsdom：取回模块导出，并补上 react-dom 调度器需要的 MessageChannel。 */
function loadMenuBundle() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost/',
  })
  dom.window.IS_REACT_ACT_ENVIRONMENT = true
  dom.window.MessageChannel = class {
    constructor() {
      this.port1 = { onmessage: null }
      this.port2 = { postMessage: () => setImmediate(() => this.port1.onmessage?.()) }
    }
  }
  const script = dom.window.document.createElement('script')
  script.textContent = BUNDLE
  dom.window.document.body.append(script)
  const api = dom.window.__omnimuxExploreMoreMenu
  assert.ok(api && typeof api.installExploreMoreMenu === 'function', 'bundle 必须在 jsdom 里执行并暴露模块导出')
  return { dom, api }
}

/** 用假行原语渲染菜单内容，记录每行 props，并返回真实 DOM 供计数。 */
async function renderMoreMenu(props) {
  const { dom, api } = loadMenuBundle()
  const rows = []
  const StubMenuItemButton = (rowProps) => {
    rows.push(rowProps)
    return api.React.createElement('div', { 'data-stub-row': String(rowProps.children) }, rowProps.children)
  }
  const Content = api.createExploreMoreMenuContent({ MenuItemButton: StubMenuItemButton })
  const container = dom.window.document.getElementById('root')
  const root = api.ReactDOMClient.createRoot(container)
  await api.React.act(async () => {
    root.render(api.React.createElement(Content, props))
  })
  return {
    dom,
    api,
    rows,
    container,
    cleanup: () => {
      api.React.act(() => { root.unmount() })
      dom.window.close()
    },
  }
}

describe('官方「更多」菜单注册形状', () => {
  it('seat 名 / id / order 固定，且在 ctx.slots.inject 回调内注册', () => {
    const { dom, api } = loadMenuBundle()
    try {
      assert.equal(api.EXPLORE_MORE_MENU_SLOT, 'sidebar.panellist.actions')
      assert.equal(api.EXPLORE_MORE_MENU_ID, 'omnimux-explore')
      assert.equal(api.EXPLORE_MORE_MENU_ORDER, 100)
      const injected = []
      const registrations = []
      const ctx = {
        slots: {
          inject: (slot, callback) => {
            injected.push(slot)
            callback()
          },
          register: (options, component) => {
            registrations.push({ name: options.name, id: options.id, order: options.order, component })
            return () => {}
          },
        },
      }
      assert.equal(api.installExploreMoreMenu(ctx, { MenuItemButton: () => null }), true)
      assert.deepEqual(injected, ['sidebar.panellist.actions'], '只注册官方「更多」菜单 seat')
      assert.deepEqual(registrations.map((item) => ({ name: item.name, id: item.id, order: item.order })), [
        { name: 'sidebar.panellist.actions', id: 'omnimux-explore', order: 100 },
      ])
      assert.equal(typeof registrations.at(0).component, 'function', '注册的是 React 组件')
    } finally {
      dom.window.close()
    }
  })

  it('seat 不存在时靠 inject 惰性语义 no-op：回调不触发即不注册', () => {
    const { dom, api } = loadMenuBundle()
    try {
      let registerCalls = 0
      const ctx = { slots: { inject: () => {}, register: () => { registerCalls += 1 } } }
      assert.equal(api.installExploreMoreMenu(ctx, { MenuItemButton: () => null }), true)
      assert.equal(registerCalls, 0, 'seat 未声明时不得注册')
    } finally {
      dom.window.close()
    }
  })

  it('无 slots 服务的老宿主直接 no-op 且不抛错', () => {
    const { dom, api } = loadMenuBundle()
    try {
      const candidates = [undefined, null, {}, { slots: {} }, { slots: { inject: null } }, { slots: { inject: 'nope' } }]
      for (const ctx of candidates) {
        assert.equal(api.installExploreMoreMenu(ctx, { MenuItemButton: () => null }), false)
      }
    } finally {
      dom.window.close()
    }
  })

  it('空 / 非法 primitives 不注册、不抛错', () => {
    const { dom, api } = loadMenuBundle()
    try {
      let registerCalls = 0
      const ctx = {
        slots: {
          inject: (slot, callback) => callback(),
          register: () => {
            registerCalls += 1
            return () => {}
          },
        },
      }
      const candidates = [undefined, null, {}, { MenuItemButton: null }, { MenuItemButton: 'nope' }]
      for (const primitives of candidates) {
        assert.equal(api.installExploreMoreMenu(ctx, primitives), false)
      }
      assert.equal(registerCalls, 0, '没有可渲染的行原语时不得注册空壳菜单')
    } finally {
      dom.window.close()
    }
  })
})

describe('官方「更多」菜单内容', () => {
  it('10 行文案与顺序逐字等于真源清单', async () => {
    const menu = await renderMoreMenu({ onDismiss: () => {} })
    try {
      assert.equal(TRUTH.length, 10, '真源清单为 10 项')
      assert.equal(menu.rows.length, 10, '每项渲染一行')
      assert.deepEqual(menu.rows.map((row) => row.children), EXPECTED_LABELS)
      assert.equal(menu.container.querySelectorAll('[data-stub-row]').length, 10)
    } finally {
      menu.cleanup()
    }
  })

  it('分组分隔线：上一项 dividerAfter 决定下一行 separatorBefore', async () => {
    const menu = await renderMoreMenu({ onDismiss: () => {} })
    try {
      assert.deepEqual(menu.rows.map((row) => row.separatorBefore === true), EXPECTED_SEPARATORS)
      assert.deepEqual(SEPARATOR_OWNERS, ['产品库', '数据分析'], '视频剪辑后、手机管理后各一条分隔线')
      assert.equal(menu.rows.at(0).separatorBefore, false, '首行不画线')
    } finally {
      menu.cleanup()
    }
  })

  it('行图标沿用清单里的受信 iconSvg，行文案按纯文本渲染', async () => {
    const menu = await renderMoreMenu({ onDismiss: () => {} })
    try {
      assert.equal(menu.rows.length, TRUTH.length)
      menu.rows.forEach((row, index) => {
        assert.equal(row.icon.props.className, 'omnimux-explore-more-icon')
        assert.equal(row.icon.props['aria-hidden'], 'true')
        assert.equal(row.icon.props.dangerouslySetInnerHTML.__html, TRUTH.at(index).iconSvg)
        assert.equal(typeof row.children, 'string', 'label 只按纯文本交给 React')
      })
    } finally {
      menu.cleanup()
    }
  })

  it('点击：先 onDismiss 关菜单，再走 activateExploreItem 的 tabId 委托', async () => {
    const order = []
    const menu = await renderMoreMenu({ onDismiss: () => order.push('dismiss') })
    try {
      let opened = null
      menu.dom.window.__omnimuxWorkbench = {
        open: (options) => {
          order.push('open')
          opened = { tabId: options.tabId, title: options.title }
          return true
        },
      }
      const clipIndex = TRUTH.findIndex((item) => item.id === 'clip')
      menu.rows.at(clipIndex).onSelect()
      assert.deepEqual(order, ['dismiss', 'open'], '先关菜单再导航')
      assert.deepEqual(opened, { tabId: 'omnimux-clip:studio', title: '视频剪辑' })
    } finally {
      delete menu.dom.window.__omnimuxWorkbench
      menu.cleanup()
    }
  })

  it('点击内置 action 项（应用）：走 action 分支，不回落 tabId', async () => {
    const menu = await renderMoreMenu({ onDismiss: () => {} })
    try {
      const appEvents = []
      menu.dom.window.addEventListener('omnimux-app-open', (event) => appEvents.push(event.detail.id))
      let openCalls = 0
      menu.dom.window.__omnimuxWorkbench = { open: () => { openCalls += 1; return true } }
      menu.rows.at(0).onSelect()
      assert.deepEqual(appEvents, ['apps'], '应用项沿用既有 omnimux-app-open 通道')
      assert.equal(openCalls, 0, 'action 已处理时不得回落 tabId 兜底')
    } finally {
      delete menu.dom.window.__omnimuxWorkbench
      menu.cleanup()
    }
  })

  it('无 onDismiss 时点击不抛错（owner 未提供关闭回调）', async () => {
    const menu = await renderMoreMenu({})
    try {
      menu.dom.window.__omnimuxWorkbench = { open: () => true }
      assert.doesNotThrow(() => menu.rows.at(0).onSelect())
    } finally {
      delete menu.dom.window.__omnimuxWorkbench
      menu.cleanup()
    }
  })
})

describe('依赖注入与单一真源', () => {
  it('不顶层 import 官方 primitives（测试与老宿主解析不到该包）', () => {
    assert.doesNotMatch(source, /^\s*import\b[^\n]*from\s+['"]@deepseek-ai\/dsh-client-ui-primitives['"]/m)
  })

  it('清单 / 激活语义取自 sidebar-coordinator，不复制第二份实现', () => {
    assert.match(source, /from\s+'\.\/sidebar-coordinator\.js'/)
    assert.doesNotMatch(source, /EXPLORE_MENU_ITEMS\s*=\s*\[/)
    assert.doesNotMatch(source, /export\s+function\s+activateExploreItem/)
    for (const label of EXPECTED_LABELS) {
      assert.ok(!source.includes("'" + label + "'"), '模块源码不得硬编码清单文案 ' + label)
    }
  })
})
