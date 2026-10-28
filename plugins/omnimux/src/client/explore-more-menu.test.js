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
import { ALPHA_DESCRIPTION, isAlphaEntry } from './sidebar-coordinator.js'

const here = dirname(fileURLToPath(import.meta.url))
const sourceFile = join(here, 'explore-more-menu.jsx')
const source = readFileSync(sourceFile, 'utf8')

const built = await build({
  absWorkingDir: here,
  stdin: {
    contents: "export * from './explore-more-menu.jsx'\nexport * as coordinator from './sidebar-coordinator.js'\nexport * as React from 'react'\nexport * as ReactDOMClient from 'react-dom/client'\n",
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

/** 真源清单（sidebar-coordinator 单一真源）：行文案、顺序、分组、图标都从这里取。 */
const TRUTH = resolveExploreMenuItems()
const EXPECTED_LABELS = TRUTH.map((item) => item.label)
const EXPECTED_SEPARATORS = TRUTH.map((item, index) => index > 0 && TRUTH.at(index - 1).dividerAfter === true)
const SEPARATOR_OWNERS = TRUTH.filter((item, index) => index > 0 && TRUTH.at(index - 1).dividerAfter === true)
  .map((item) => item.label)

/**
 * Alpha 行内容的文本部分：非 Alpha 行的 `children` 仍是纯字符串（零变化），
 * Alpha 行是「文案 + 标识」片段，文案取片段里的第一个文本节点。
 * @param {unknown} children
 * @returns {string | null}
 */
function labelTextOf(children) {
  if (typeof children === 'string') return children
  const inner = children?.props?.children
  const nodes = Array.isArray(inner) ? inner : [inner]
  for (const node of nodes) {
    if (typeof node === 'string') return node
    if (typeof node?.props?.children === 'string') return node.props.children
  }
  return null
}

/** 行内容里的 Alpha 标识元素（没有则返回 undefined）。 */
function alphaBadgeOf(children) {
  if (children === null || typeof children !== 'object') return undefined
  const inner = children.props?.children
  return (Array.isArray(inner) ? inner : [inner])
    .find((node) => node?.props?.className === 'omnimux-explore-more-alpha')
}

/** 注入 bundle 的 jsdom：取回模块导出，并补上 react-dom 调度器需要的 MessageChannel。 */
function loadMenuBundle() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost/',
  })
  dom.window.IS_REACT_ACT_ENVIRONMENT = true
  // coordinator 的 install() 会 setInterval(2s) 轮询侧栏就绪；测试里换成 no-op，避免挂住进程。
  dom.window.setInterval = () => 0
  dom.window.clearInterval = () => {}
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
      closeMenuBundle(dom, api)
    },
  }
}

/**
 * 可重挂载的菜单渲染器：官方「更多」菜单每次展开重新挂载即读最新集合，
 * 因此注册 / 注销后必须重新挂载才能观察到集合变化。
 */
function createMenuRenderer(dom, api, props) {
  const rows = []
  const StubMenuItemButton = (rowProps) => {
    rows.push(rowProps)
    return api.React.createElement('div', { 'data-stub-row': String(rowProps.children) }, rowProps.children)
  }
  const Content = api.createExploreMoreMenuContent({ MenuItemButton: StubMenuItemButton })
  const container = dom.window.document.getElementById('root')
  let root = null
  return {
    rows,
    container,
    async render() {
      rows.length = 0
      if (root) api.React.act(() => { root.unmount() })
      root = api.ReactDOMClient.createRoot(container)
      await api.React.act(async () => {
        root.render(api.React.createElement(Content, props))
      })
    },
    unmount() {
      if (root) api.React.act(() => { root.unmount() })
      root = null
    },
  }
}

/** 在 bundle realm 装上 sidebar 全局，返回运行时注册接缝（与菜单共用同一份集合）。 */
function installRuntimeRegistry(dom, api) {
  api.coordinator.installSidebarGlobal()
  const registry = dom.window.__omnimuxSidebar
  assert.ok(registry && typeof registry.registerExploreItem === 'function', '运行时注册接缝必须可用')
  return registry
}

/** 关窗前先断开 coordinator 的 observer / 定时器，避免 jsdom teardown 后回调再访问 document。 */
function closeMenuBundle(dom, api) {
  api.coordinator.resetSidebarCoordinatorForTests()
  dom.window.close()
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
      closeMenuBundle(dom, api)
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
      closeMenuBundle(dom, api)
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
      closeMenuBundle(dom, api)
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
      closeMenuBundle(dom, api)
    }
  })
})

describe('官方「更多」菜单内容', () => {
  it('9 行文案与顺序逐字等于真源清单', async () => {
    const menu = await renderMoreMenu({ onDismiss: () => {} })
    try {
      assert.equal(TRUTH.length, 9, '真源清单为 9 项（产品库已并入资产库）')
      assert.equal(menu.rows.length, 9, '每项渲染一行')
      assert.deepEqual(menu.rows.map((row) => labelTextOf(row.children)), EXPECTED_LABELS)
      assert.equal(menu.container.querySelectorAll('[data-stub-row]').length, 9)
    } finally {
      menu.cleanup()
    }
  })

  it('分组分隔线：上一项 dividerAfter 决定下一行 separatorBefore', async () => {
    const menu = await renderMoreMenu({ onDismiss: () => {} })
    try {
      assert.deepEqual(menu.rows.map((row) => row.separatorBefore === true), EXPECTED_SEPARATORS)
      assert.deepEqual(SEPARATOR_OWNERS, ['发布', '数据分析'], '视频剪辑后、手机管理后各一条分隔线')
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
        assert.equal(labelTextOf(row.children), TRUTH.at(index).label, 'label 只按纯文本交给 React')
      })
    } finally {
      menu.cleanup()
    }
  })

  it('Alpha 内测项带行内标识，非 Alpha 项保持纯字符串文案（Issue #3823）', async () => {
    const menu = await renderMoreMenu({ onDismiss: () => {} })
    try {
      const alphaLabels = []
      const plainLabels = []
      menu.rows.forEach((row, index) => {
        const item = TRUTH.at(index)
        const badge = alphaBadgeOf(row.children)
        if (isAlphaEntry(item.entryId)) {
          alphaLabels.push(item.label)
          assert.ok(badge, `${item.label} 是 Alpha 项，行内必须有标识`)
          assert.equal(badge.props.children, 'Alpha', '标识文案为 Alpha')
          assert.equal(badge.props.title, ALPHA_DESCRIPTION, '标识承载完整内测说明')
          assert.equal(labelTextOf(row.children), item.label, '加标识不得改动行文案')
        } else {
          plainLabels.push(item.label)
          assert.equal(badge, undefined, `${item.label} 不是 Alpha 项，不得带标识`)
          assert.equal(typeof row.children, 'string', '非 Alpha 行内容仍是纯字符串（零变化）')
        }
      })
      assert.deepEqual(alphaLabels, ['发布', '账号', '数据分析', '自动化', '任务表单'], 'Alpha 项按菜单顺序命中 5 项')
      assert.deepEqual(plainLabels, ['应用', '视频剪辑', '手机管理', '社交采收'], '其余 4 项不带标识')
      assert.equal(menu.container.querySelectorAll('.omnimux-explore-more-alpha').length, 5)
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

describe('官方「更多」菜单运行时注册接缝', () => {
  it('运行时注册项出现在菜单末尾', async () => {
    const { dom, api } = loadMenuBundle()
    try {
      const registry = installRuntimeRegistry(dom, api)
      const menu = createMenuRenderer(dom, api, { onDismiss: () => {} })

      await menu.render()
      assert.equal(menu.rows.length, 9, '未注册时 9 行')

      const unregister = registry.registerExploreItem({
        id: 'fast-news-workbench',
        label: '快讯中枢',
        iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 3.5h12v9H2z"/></svg>',
        tabId: 'fast-news-workbench',
      })
      assert.equal(typeof unregister, 'function', '注册返回注销函数')

      await menu.render()
      assert.equal(menu.rows.length, 10, '注册后 10 行')
      const labels = Array.from(menu.rows, (row) => row.children)
      assert.equal(labels.at(-1), '快讯中枢', '注册项追加在菜单末尾')
      assert.equal(labels.at(0), '应用', '内置首项不变')
      menu.unmount()
    } finally {
      closeMenuBundle(dom, api)
    }
  })

  it('注销后注册项从菜单消失，回到 9 行', async () => {
    const { dom, api } = loadMenuBundle()
    try {
      const registry = installRuntimeRegistry(dom, api)
      const menu = createMenuRenderer(dom, api, { onDismiss: () => {} })
      const unregister = registry.registerExploreItem({
        id: 'fast-news-workbench',
        label: '快讯中枢',
        iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 3.5h12v9H2z"/></svg>',
        tabId: 'fast-news-workbench',
      })
      await menu.render()
      assert.equal(menu.rows.length, 10, '注册后 10 行')

      unregister()
      await menu.render()
      assert.equal(menu.rows.length, 9, '注销后回到 9 行')
      const labels = Array.from(menu.rows, (row) => row.children)
      assert.equal(labels.includes('快讯中枢'), false, '注销项不再渲染')
      menu.unmount()
    } finally {
      closeMenuBundle(dom, api)
    }
  })

  it('与内置 id 冲突的注册项不出现（内置文案不被冒充）', async () => {
    const { dom, api } = loadMenuBundle()
    try {
      const registry = installRuntimeRegistry(dom, api)
      const menu = createMenuRenderer(dom, api, { onDismiss: () => {} })
      const conflict = registry.registerExploreItem({ id: 'apps', label: '伪装应用', iconSvg: '<svg></svg>' })
      assert.equal(typeof conflict, 'function', '冲突注册仍返回注销函数')

      await menu.render()
      assert.equal(menu.rows.length, 9, '冲突注册不新增行')
      const labels = Array.from(menu.rows, (row) => row.children)
      assert.equal(labels.at(0), '应用', '内置首项文案仍为「应用」')
      assert.equal(labels.includes('伪装应用'), false, '冒充项不出现')
      menu.unmount()
    } finally {
      closeMenuBundle(dom, api)
    }
  })
})

/**
 * 官方面板行白名单（#3809 用户最终决策）。
 *
 * 决策：官方「插件」行彻底隐藏（产品已有自研插件管理模块），只有「自动化任务」
 * 进「更多」菜单。用白名单而非黑名单，官方将来新增面板不会未经决策自动出现。
 *
 * 这里只断言白名单集合本身，不渲染菜单——渲染路径依赖 jsdom + esbuild bundle，
 * 在本文件里新增渲染型 describe 会让整个测试进程挂住（已实测），因此把纯逻辑
 * 与渲染分离验证。菜单实际渲染行为由既有 4 组 describe 覆盖。
 */
describe('官方面板行白名单', () => {
  it('只放行「自动化任务」，官方「插件」被排除', () => {
    const m = source.match(/PANEL_ENTRY_WHITELIST\s*=\s*new Set\(\[([^\]]*)\]\)/)
    assert.ok(m, '必须声明 PANEL_ENTRY_WHITELIST')
    const ids = m[1].split(',').map((v) => v.trim().replace(/[\x27"]/g, '')).filter(Boolean)
    assert.deepEqual(ids, ['schedules'], '白名单只应有「自动化任务」')
  })

  it('过滤用白名单，不是黑名单', () => {
    assert.match(source, /entries\.filter\(\(entry\) => PANEL_ENTRY_WHITELIST\.has\(entry\?\.id\)\)/,
      '必须用白名单 has() 过滤，官方新增面板默认不进菜单')
  })

  it('未跟踪的官方面板不会被无条件渲染', () => {
    assert.doesNotMatch(source, /const panels = Array\.isArray\(entries\) \? entries : \[\]/,
      '不得原样渲染全部 entries（那是 #3809 决策前的行为）')
  })
})
