/**
 * sidebar-coordinator 回归测试（P0）：
 *   1. 注册 below（rank 5）+ inline（kind:'inline'）后，连续 place() 不抛；
 *   2. 收敛项不作为独立行挂入侧栏 DOM；官方「更多」菜单是这批入口的唯一渲染面；
 *   3. 运行时注册接缝（集合语义）与激活三段委托；
 *   4. 探索行与浮动菜单已退役：侧栏不得再渲染它们，源码不得残留实现。
 */
import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ALPHA_DESCRIPTION,
  EXPLORE_MENU_ITEMS,
  SIDEBAR_GLOBAL,
  activateExploreItem,
  filterExploreItemsForChannel,
  getConvergedRowsForTests,
  installSidebarGlobal,
  resolveExploreMenuItems,
  setReleaseChannelForTests,
} from './sidebar-coordinator.js'

// install() 会 setInterval(2s) 轮询；测试里替换为 no-op，避免挂住测试进程。
globalThis.setInterval = () => 1
globalThis.clearInterval = () => {}

/** @type {JSDOM | undefined} */
let dom

afterEach(async () => {
  const { resetSidebarCoordinatorForTests } = await import('./sidebar-coordinator.js')
  resetSidebarCoordinatorForTests()
  dom?.window.close()
  dom = undefined
})

function setup(html) {
  dom = new JSDOM(html || `<!doctype html><html><body>
    <div data-slot="root">
      <div class="frame" data-omnimux-frame>
        <div data-pane="sidebar">
          <div class="logoRow">
            <button type="button" class="x-Wl6W_brand" aria-label="OmniMux">OmniMux</button>
          </div>
          <button class="newSession">新建会话</button>
        </div>
      </div>
    </div>
  </body></html>`, { url: 'http://127.0.0.1/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.MutationObserver = dom.window.MutationObserver
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement
}

test('below + inline 并存时 place() 幂等不抛，且 below 行落在 wrapper 之后', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  assert.ok(api, 'window.__omnimuxSidebar installed')

  const belowBtn = document.createElement('button')
  belowBtn.id = 'below-entry'
  const inlineBtn = document.createElement('button')
  inlineBtn.id = 'inline-entry'

  const disposeBelow = api.register({ id: 'below-entry', rank: 5, create: () => belowBtn })
  const disposeInline = api.register({ id: 'inline-entry', kind: 'inline', create: () => inlineBtn })

  try {
    for (let i = 0; i < 6; i++) {
      assert.doesNotThrow(() => { api.place() })
    }

    const root = document.querySelector('[data-pane="sidebar"]')
    const wrapper = root.querySelector('[data-omnimux-inline-row]')
    assert.ok(wrapper, 'inline wrapper 存在')
    assert.equal(wrapper.querySelector('.newSession').parentElement, wrapper, '新建会话按钮被移进 wrapper')
    assert.equal(wrapper.querySelector('#inline-entry'), inlineBtn, 'inline 按钮在 wrapper 内')
    assert.equal(belowBtn.parentElement, root, 'below 行仍是 root 直接子节点')
    const children = [...root.children]
    assert.ok(children.indexOf(wrapper) < children.indexOf(belowBtn), 'below 行排在 wrapper 之后')
  } finally {
    disposeBelow()
    disposeInline()
  }
})

test('仅 below 行（无 inline）时行紧挨新对话，不插在品牌钮后', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  const belowBtn = document.createElement('button')
  belowBtn.id = 'below-only'
  const disposeBelow = api.register({ id: 'below-only', rank: 5, create: () => belowBtn })

  try {
    for (let i = 0; i < 3; i++) {
      assert.doesNotThrow(() => { api.place() })
    }

    const root = document.querySelector('[data-pane="sidebar"]')
    const sessionBtn = root.querySelector('.newSession')
    const brand = root.querySelector('.x-Wl6W_brand')
    assert.ok(brand, '夹具含品牌钮')
    assert.equal(belowBtn.parentElement, root, 'below 行是 root 直接子节点')
    assert.equal(belowBtn.previousElementSibling, sessionBtn, 'below 行排在新会话后，不得插在品牌钮后')
    assert.notEqual(belowBtn.previousElementSibling, brand)
    assert.equal(root.querySelector('[data-omnimux-inline-row]'), null, '无 inline wrapper')
  } finally {
    disposeBelow()
  }
})

test('收起时隐藏 inline 项目按钮，点加号弹出「新建会话 / 新建项目」菜单', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  const inlineBtn = document.createElement('button')
  inlineBtn.id = 'inline-entry'
  inlineBtn.setAttribute('aria-label', '新建项目')
  let projectClicks = 0
  inlineBtn.addEventListener('click', () => { projectClicks += 1 })
  const sessionBtn = document.querySelector('.newSession')
  let sessionClicks = 0
  sessionBtn.addEventListener('click', () => { sessionClicks += 1 })

  const disposeInline = api.register({ id: 'inline-collapsed', kind: 'inline', create: () => inlineBtn })
  try {
    const frame = document.querySelector('[data-omnimux-frame]')
    frame.setAttribute('data-sidebar-collapsed', '')
    api.place()

    sessionBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    let menu = document.getElementById('omnimux-sidebar-new-menu')
    assert.ok(menu, '收起点加号应弹出菜单')
    const items = [...menu.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent)
    assert.deepEqual(items, ['新建会话', '新建项目'])
    assert.equal(sessionClicks, 0, '加号本身不立刻新建会话')

    menu.querySelectorAll('[role="menuitem"]')[0].click()
    assert.equal(sessionClicks, 1, '菜单第一项走官方新建会话')
    assert.equal(document.getElementById('omnimux-sidebar-new-menu'), null)

    sessionBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    menu = document.getElementById('omnimux-sidebar-new-menu')
    assert.ok(menu, '再点加号重新弹出菜单')

    menu.querySelectorAll('[role="menuitem"]')[1].click()
    assert.equal(projectClicks, 1)
    assert.equal(document.getElementById('omnimux-sidebar-new-menu'), null, '选完关掉菜单')

    frame.removeAttribute('data-sidebar-collapsed')
    api.place()
    assert.equal(document.getElementById('omnimux-sidebar-new-menu'), null)

    sessionBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    assert.equal(document.getElementById('omnimux-sidebar-new-menu'), null, '展开时加号不再拦截成菜单')
    assert.equal(sessionClicks, 2)
  } finally {
    disposeInline()
  }
})

test('收起 CSS 把官方加号从 flex:1 收回 36px，避免竖条', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  const inlineBtn = document.createElement('button')
  inlineBtn.id = 'inline-flex-leak'
  inlineBtn.setAttribute('aria-label', '新建项目')
  const disposeInline = api.register({ id: 'inline-flex-leak', kind: 'inline', create: () => inlineBtn })
  try {
    const css = document.getElementById('omnimux-sidebar-inline-styles')?.textContent ?? ''
    assert.match(
      css,
      /\[data-sidebar-collapsed\][\s\S]*omnimux-sidebar-inline-new-session[\s\S]*flex:\s*none/,
      '收起必须覆盖展开时写在加号上的 flex:1，否则 display:contents 会把加号撑成竖列',
    )
    assert.match(css, /width:\s*36px/)
    assert.match(css, /height:\s*36px/)

    const frame = document.querySelector('[data-omnimux-frame]')
    frame.setAttribute('data-sidebar-collapsed', '')
    const sessionBtn = document.querySelector('.newSession')
    const sessionStyle = window.getComputedStyle(sessionBtn)
    assert.equal(sessionStyle.flexGrow, '0')
    assert.equal(sessionStyle.flexShrink, '0')
    assert.equal(sessionStyle.width, '36px')
    assert.equal(sessionStyle.height, '36px')
    assert.equal(window.getComputedStyle(inlineBtn).display, 'none')
  } finally {
    disposeInline()
  }
})

test('AppFrame 去掉 data-sidebar-collapsed 后 observer 关掉菜单', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  const inlineBtn = document.createElement('button')
  inlineBtn.id = 'inline-observer'
  inlineBtn.setAttribute('aria-label', '新建项目')
  const disposeInline = api.register({ id: 'inline-observer', kind: 'inline', create: () => inlineBtn })
  try {
    const frame = document.querySelector('[data-omnimux-frame]')
    frame.setAttribute('data-sidebar-collapsed', '')
    api.place()

    const sessionBtn = document.querySelector('.newSession')
    sessionBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    assert.ok(document.getElementById('omnimux-sidebar-new-menu'), '收起点加号应弹出菜单')

    frame.removeAttribute('data-sidebar-collapsed')
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    assert.equal(document.getElementById('omnimux-sidebar-new-menu'), null, '展开后 observer 关掉菜单')

    sessionBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    assert.equal(document.getElementById('omnimux-sidebar-new-menu'), null, '展开时加号不再拦截成菜单')
  } finally {
    disposeInline()
  }
})

test('sidebar 就绪后 observer 收窄到侧栏列，overlay 突变不触发 placeAll', async () => {
  setup()
  const {
    installSidebarGlobal,
    SIDEBAR_GLOBAL,
    getSidebarObserverTargetForTests,
    getPlaceCountForTests,
  } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  const belowBtn = document.createElement('button')
  belowBtn.id = 'below-scope'
  const disposeBelow = api.register({ id: 'below-scope', rank: 5, create: () => belowBtn })

  try {
    const column = document.querySelector('[data-pane="sidebar"]')
    assert.equal(
      getSidebarObserverTargetForTests(),
      column,
      'observer 必须绑在 sidebar 列，不得长驻 document.body',
    )
    assert.notEqual(getSidebarObserverTargetForTests(), document.body)

    await new Promise((resolve) => { setTimeout(resolve, 20) })
    const before = getPlaceCountForTests()
    const overlay = document.createElement('div')
    overlay.setAttribute('data-slot', 'shell.overlay')
    for (let i = 0; i < 40; i++) {
      const child = document.createElement('div')
      child.className = 'omnimux-assets-stage'
      child.append(document.createElement('span'))
      overlay.append(child)
    }
    document.body.append(overlay)
    await new Promise((resolve) => { setTimeout(resolve, 20) })

    assert.equal(getPlaceCountForTests(), before, 'Stage overlay 的 DOM 突变不得回灌 placeAll')
    assert.equal(belowBtn.parentElement, column, 'overlay 突变不得搅动侧栏行')
  } finally {
    disposeBelow()
  }
})

test('computeNewMenuPosition anchors under the visible control', async () => {
  setup()
  const { computeNewMenuPosition } = await import('./sidebar-coordinator.js')
  const anchor = document.createElement('button')
  document.body.append(anchor)
  anchor.getBoundingClientRect = () => ({
    x: 124, y: 4, left: 124, top: 4, width: 32, height: 32, right: 156, bottom: 36,
  })
  const pos = computeNewMenuPosition(anchor, { innerWidth: 1280, innerHeight: 800 })
  assert.equal(pos.left, 124, 'left-aligned with anchor')
  assert.equal(pos.top, 42, '6px gap below anchor bottom')
})

test('openCollapsedNewMenuAt uses topbar anchor rect not hidden rail', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL, openCollapsedNewMenuAt } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  const inlineBtn = document.createElement('button')
  inlineBtn.id = 'inline-topbar-anchor'
  inlineBtn.setAttribute('aria-label', '新建项目')
  const disposeInline = api.register({ id: 'inline-topbar-anchor', kind: 'inline', create: () => inlineBtn })
  try {
    const frame = document.querySelector('[data-omnimux-frame]')
    frame.setAttribute('data-sidebar-collapsed', '')
    api.place()

    const topbar = document.createElement('button')
    topbar.setAttribute('data-omnimux-topbar-new-session', '1')
    document.body.append(topbar)
    topbar.getBoundingClientRect = () => ({
      x: 124, y: 4, left: 124, top: 4, width: 32, height: 32, right: 156, bottom: 36,
    })
    const sessionBtn = document.querySelector('.newSession')
    sessionBtn.getBoundingClientRect = () => ({
      x: 0, y: 90, left: 0, top: 90, width: 0, height: 0, right: 0, bottom: 90,
    })

    assert.equal(openCollapsedNewMenuAt(topbar), true)
    const menu = document.getElementById('omnimux-sidebar-new-menu')
    assert.ok(menu, 'menu opens')
    assert.equal(menu.style.left, '124px', 'menu left tracks topbar anchor')
    assert.equal(menu.style.top, '42px', 'menu sits under topbar anchor')
  } finally {
    disposeInline()
  }
})

test('开发版：Alpha 内测项不挂 DOM，核心常驻项挂回侧栏', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  let clicks = 0
  const rows = ['accounts', 'workflow', 'publish', 'analytics', 'forms', 'inspiration', 'automation'].map((name, rank) => {
    const element = document.createElement('button')
    element.innerHTML = `<span class="omnimux-sidebar-nav-entry-label">${name}</span>`
    element.setAttribute('aria-label', name)
    element.addEventListener('click', () => { clicks += 1 })
    const row = { id: `omnimux-${name}-entry`, rank: rank + 3, create: () => element }
    return { name, element, row, dispose: api.register(row) }
  })

  api.place()
  const root = document.querySelector('[data-pane="sidebar"]')
  const mounted = new Set(['workflow', 'inspiration'])
  for (const { name, element } of rows) {
    if (mounted.has(name)) {
      assert.equal(element.parentElement, root, `${name} 是核心常驻项，必须挂回侧栏`)
    } else {
      assert.equal(element.parentElement, null, `${name} 内测版与收敛项不得挂入侧栏 DOM`)
    }
  }

  assert.equal(document.querySelectorAll('.omnimux-sidebar-alpha-badge').length, 0)
  assert.equal(document.querySelectorAll('[data-release-stage="alpha"]').length, 0)

  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(document.querySelectorAll('.omnimux-sidebar-alpha-badge').length, 0)

  for (const { dispose } of rows) dispose()
})

test('发布渠道过滤：开发版保留全部入口，正式版只过滤 Alpha 测试版', () => {
  const dev = filterExploreItemsForChannel(EXPLORE_MENU_ITEMS, 'development')
  assert.deepEqual(dev.map((item) => item.label), [
    '应用', '视频剪辑', '发布', '账号', '手机管理', '数据分析', '任务表单', '社交采收',
  ])
  const prod = filterExploreItemsForChannel(EXPLORE_MENU_ITEMS, 'production')
  assert.deepEqual(prod.map((item) => item.label), ['应用', '视频剪辑', '手机管理', '社交采收'])
  assert.equal(resolveExploreMenuItems().length, EXPLORE_MENU_ITEMS.length, '开发版默认渠道返回全部入口')
})

test('正式版渠道：Alpha 行注册不创建元素、不进收敛集合，菜单只剩非 Alpha 项', async () => {
  setup()
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  setReleaseChannelForTests('production')
  const created = []
  const makeRow = (name) => api.register({
    id: `omnimux-${name}-entry`,
    rank: 3,
    create: () => {
      created.push(name)
      return document.createElement('button')
    },
  })
  const alphaDisposers = ['accounts', 'publish', 'analytics', 'forms'].map(makeRow)
  let clipCreated = 0
  const disposeClip = api.register({
    id: 'omnimux-clip-entry',
    rank: 5,
    create: () => { clipCreated += 1; return document.createElement('button') },
  })
  try {
    api.place()
    assert.deepEqual(created, [], '正式版不得为任何 Alpha 行创建元素（删掉守卫该断言会变红）')
    const converged = getConvergedRowsForTests()
    for (const name of ['accounts', 'publish', 'analytics', 'forms']) {
      assert.equal(converged.has(`omnimux-${name}-entry`), false, `正式版 Alpha ${name} 不得进入收敛集合`)
    }
    assert.equal(clipCreated, 1, '非 Alpha 收敛项仍正常创建以进入「更多」菜单')
    assert.deepEqual(resolveExploreMenuItems().map((item) => item.label), ['应用', '视频剪辑', '手机管理', '社交采收'])
  } finally {
    alphaDisposers.forEach((dispose) => dispose())
    disposeClip()
    setReleaseChannelForTests('development')
  }
})

test('侧栏全局 seam 暴露 Alpha 判定与统一说明，供插件自注册菜单复用', () => {
  setup()
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  assert.equal(typeof api.isAlphaEntry, 'function', '必须暴露 isAlphaEntry')
  assert.equal(api.isAlphaEntry('omnimux-avatar-entry'), true, 'avatar 已在 lifecycle 列为 Alpha')
  assert.equal(api.isAlphaEntry('omnimux-workflow-entry'), false, '非 Alpha 项必须返回 false')
  assert.equal(api.alphaDescription, ALPHA_DESCRIPTION, '内测说明与中枢常量逐字一致')
})

test('desktop 外壳包住内层 pane 时 assets 常驻项挂进侧栏 DOM', async () => {
  setup(`<!doctype html><html><body>
    <div class="dshDesktopSidebarSurface">
      <div class="dshDesktopUpstreamSidebar">
        <div data-pane="sidebar">
          <div class="logoRow">
            <button type="button" class="x-Wl6W_brand">OmniMux</button>
          </div>
          <button class="newSession" aria-label="新对话">新对话</button>
          <div class="workspace">工作区</div>
        </div>
      </div>
    </div>
  </body></html>`)
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  const belowBtn = document.createElement('button')
  belowBtn.id = 'assets-entry'
  const dispose = api.register({ id: 'omnimux-assets-entry', rank: 6, create: () => belowBtn })
  try {
    const pane = document.querySelector('[data-pane="sidebar"]')
    api.place()
    assert.equal(belowBtn.parentElement, pane, 'assets 是核心常驻项，必须挂进内层侧栏 pane')
    assert.equal(pane.querySelector('[data-omnimux-explore-entry]'), null, '探索行已退役')
  } finally {
    dispose()
  }
})

test('coordinator 源码不得把 brand 类写进新对话选择器', async () => {
  const { readFileSync } = await import('node:fs')
  const { dirname, join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'sidebar-coordinator.js'), 'utf8')
  assert.doesNotMatch(source, /x-Wl6W_brand/)
  assert.doesNotMatch(source, /button\.x-Wl6W_brand/)
  assert.match(source, /button\[class\*="newSession"\]/)
})

/* ========================================================================= */
/* 探索行 / 浮动菜单退役回归                                                   */
/* ========================================================================= */

test('移除回归：侧栏不再渲染探索行，源码不再残留浮动菜单实现', async () => {
  setup()
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  api.place()

  const root = document.querySelector('[data-pane="sidebar"]')
  assert.equal(root.querySelector('[data-omnimux-explore-entry]'), null, '侧栏不得再渲染探索行')
  assert.equal(document.getElementById('omnimux-explore-entry'), null)
  assert.equal(document.getElementById('omnimux-explore-menu'), null, '不得再有浮动菜单')
  assert.equal(document.getElementById('omnimux-sidebar-explore-styles'), null, '不得再注入探索样式节点')

  // 真源与激活委托必须保留：官方「更多」菜单仍复用它们
  assert.equal(typeof resolveExploreMenuItems, 'function', '合并函数是真源，必须保留')
  assert.equal(typeof activateExploreItem, 'function', '激活委托必须保留')
  assert.equal(resolveExploreMenuItems().length, EXPLORE_MENU_ITEMS.length)

  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'sidebar-coordinator.js'), 'utf8')
  assert.doesNotMatch(source, /omnimux-explore-entry/, '源码不得残留探索行 id')
  assert.doesNotMatch(source, /omnimux-explore-menu/, '源码不得残留浮动菜单 id')
  assert.doesNotMatch(source, /ensureExploreRow|createExploreIcon|EXPLORE_STYLES|handleExploreFocusOut/)
  assert.doesNotMatch(source, /getExploreEntryForTests|openExploreMenu|toggleExploreMenu|closeExploreMenu/)
  assert.doesNotMatch(source, /computeExploreMenuPosition|EXPLORE_HOVER_/)
  assert.match(source, /export function resolveExploreMenuItems/)
  assert.match(source, /export function activateExploreItem/)
})

test('核心常驻行按 rank 挂载在侧栏，探索行不再出现', async () => {
  setup()
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  const workflowBtn = document.createElement('button')
  workflowBtn.id = 'workflow-entry'
  const disposeWorkflow = api.register({ id: 'omnimux-workflow-entry', rank: 4, create: () => workflowBtn })

  const marketBtn = document.createElement('button')
  marketBtn.id = 'market-entry'
  const disposeMarket = api.register({ id: 'omnimux-market-entry', rank: 4.1, create: () => marketBtn })

  const assetsBtn = document.createElement('button')
  assetsBtn.id = 'assets-entry'
  const disposeAssets = api.register({ id: 'omnimux-assets-entry', rank: 6, create: () => assetsBtn })

  const inspirationBtn = document.createElement('button')
  inspirationBtn.id = 'inspiration-entry'
  const disposeInspiration = api.register({ id: 'omnimux-inspiration-entry', rank: 7, create: () => inspirationBtn })

  try {
    api.place()
    const root = document.querySelector('[data-pane="sidebar"]')
    assert.equal(root.querySelector('[data-omnimux-explore-entry]'), null, '探索行已退役，不得再占位')
    for (const btn of [workflowBtn, marketBtn, assetsBtn, inspirationBtn]) {
      assert.equal(btn.parentElement, root, `${btn.id} 必须挂入侧栏 DOM`)
    }
    const order = [workflowBtn, marketBtn, assetsBtn, inspirationBtn].map((btn) => [...root.children].indexOf(btn))
    assert.deepEqual([...order].sort((a, b) => a - b), order, '常驻行按 rank 升序排列')
  } finally {
    disposeWorkflow()
    disposeMarket()
    disposeAssets()
    disposeInspiration()
  }
})

test('非核心插件（video, products 旧入口, device, clip, social-harvest, apps 等）收敛，不渲染独立行', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  const targets = [
    { id: 'omnimux-video-entry', rank: 7.5 },
    // 产品库已并入资产库：旧版本仍可能注册该入口，必须收敛而不是留一行死条目。
    { id: 'omnimux-products-entry', rank: 8 },
    { id: 'omnimux-device-entry', rank: 3.5 },
    { id: 'omnimux-clip-entry', rank: 8.2 },
    { id: 'omnimux-social-harvest-entry', rank: 19 },
    { id: 'omnimux-apps-entry', rank: 1 },
  ]

  const disposers = targets.map((t) => {
    const el = document.createElement('button')
    el.id = t.id
    return { ...t, el, dispose: api.register({ id: t.id, rank: t.rank, create: () => el }) }
  })

  api.place()
  const root = document.querySelector('[data-pane="sidebar"]')

  for (const { id, el } of disposers) {
    assert.equal(el.parentElement, null, `${id} 必须收敛，不得插入侧栏 DOM`)
    assert.equal(root.querySelector(`#${id}`), null)
  }

  for (const { dispose } of disposers) dispose()
})

test('激活委托：命中已注册收敛元素时优先其 click，未注册时回落 tabId', async () => {
  setup()
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  let clipClicks = 0
  const clipBtn = document.createElement('button')
  clipBtn.addEventListener('click', () => { clipClicks += 1 })
  // 必须用 omnimux-clip 插件真实注册的 row.id；用旧 id 会让菜单项 entryId 匹配不上而落到 tabId 兜底
  const disposeClip = api.register({ id: 'omnimux-clip-entry', rank: 8.2, create: () => clipBtn })

  let wbOpenedTab = null
  window.__omnimuxWorkbench = {
    open: (opts) => { wbOpenedTab = opts },
  }

  try {
    api.place()
    // PINNED_ENTRY_PREFIXES 为空：所有 omnimux-* 均收敛，clip 收敛后点击走 element.click
    const clipItem = { id: 'clip', entryId: 'omnimux-clip-entry', label: '视频剪辑', iconSvg: '', tabId: 'omnimux-clip:studio' }
    activateExploreItem(clipItem)
    assert.equal(clipClicks, 1, '优先触发已注册收敛元素的 click 处理器')
    assert.equal(wbOpenedTab, null, '命中已注册条目时不得回落到 window.__omnimuxWorkbench.open')

    // 未注册实际元素的项：fallback 到 window.__omnimuxWorkbench.open
    const analyticsItem = { id: 'analytics', entryId: 'omnimux-analytics-entry', label: '数据分析', iconSvg: '', tabId: 'omnimux-analytics:library' }
    activateExploreItem(analyticsItem)
    assert.equal(wbOpenedTab?.tabId, 'omnimux-analytics:library')
    assert.equal(wbOpenedTab?.title, '数据分析')
  } finally {
    disposeClip()
    delete window.__omnimuxWorkbench
  }
})

test('激活 apps 项时其 element.click 仅被调用一次，绝无重复点击', async () => {
  setup()
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  let appsClicks = 0
  const appsBtn = document.createElement('button')
  appsBtn.addEventListener('click', () => { appsClicks += 1 })
  const disposeApps = api.register({ id: 'omnimux-apps-entry', rank: 1, create: () => appsBtn })

  try {
    api.place()
    // PINNED_ENTRY_PREFIXES 为空：所有 omnimux-* 均收敛，apps 收敛后点击走 element.click
    const appsItem = { id: 'apps', entryId: 'omnimux-apps-entry', label: '应用', iconSvg: '' }
    activateExploreItem(appsItem)
    assert.equal(appsClicks, 1, 'apps.action 执行并触发 element.click 仅 1 次，绝无重复点击')

    // 再次激活，同样仅触发 1 次（累计 2 次）
    activateExploreItem(appsItem)
    assert.equal(appsClicks, 2, '再次激活 apps 项时其 element.click 同样仅被调用 1 次')
  } finally {
    disposeApps()
  }
})

test('activateExploreItem 中 item.action 返回非 false 时阻止后续 registered.element.click，返回 false 时允许向下执行', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL, activateExploreItem } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  let elementClicks = 0
  const btn = document.createElement('button')
  btn.addEventListener('click', () => { elementClicks += 1 })
  const dispose = api.register({ id: 'omnimux-test-action-entry', rank: 1, create: () => btn })

  try {
    api.place()

    // 1. action 返回 true，不触发 element.click
    let actionCalls = 0
    activateExploreItem({
      id: 'test-handled',
      entryId: 'omnimux-test-action-entry',
      action: () => {
        actionCalls += 1
        return true
      },
    })
    assert.equal(actionCalls, 1)
    assert.equal(elementClicks, 0, 'action 返回 true 时提前 return，不调用 element.click')

    // 2. action 返回 false，继续向下触发 element.click
    activateExploreItem({
      id: 'test-fallback',
      entryId: 'omnimux-test-action-entry',
      action: () => false,
    })
    assert.equal(elementClicks, 1, 'action 返回 false 时允许向下 fallback 调用 element.click')
  } finally {
    dispose()
  }
})

test('运行时注册接缝：未注册与内置项完全一致，注册后追加末尾、注销即消失', async () => {
  setup()
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  // AC1：未注册时合并结果 === 内置白名单（同长度、同序、同 id）
  assert.equal(EXPLORE_MENU_ITEMS.length, EXPLORE_MENU_ITEMS.length, '内置白名单长度')
  assert.deepEqual(
    resolveExploreMenuItems().map((item) => item.id),
    EXPLORE_MENU_ITEMS.map((item) => item.id),
    '未注册时菜单项 id 序列与内置完全一致',
  )

  // AC2：注册后追加在末尾，字段白名单与内置项同形
  const unregister = api.registerExploreItem({
    id: 'fast-news-workbench',
    label: '快讯中枢',
    iconSvg: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
    tabId: 'fast-news-workbench',
  })
  assert.equal(typeof unregister, 'function', '注册返回注销函数')

  const registered = resolveExploreMenuItems()
  assert.equal(registered.length, EXPLORE_MENU_ITEMS.length + 1, '注册后追加一项')
  const last = registered.at(-1)
  assert.equal(last.id, 'fast-news-workbench', '注册项追加在末尾')
  assert.equal(last.label, '快讯中枢')
  assert.ok(last.iconSvg.includes('<svg'), '注册项带既有 iconSvg')
  assert.equal(last.tabId, 'fast-news-workbench')

  // AC3：点击注册项走 tabId 兜底打开对应 Workbench Tab（渲染面在官方「更多」菜单）
  const opened = []
  window.__omnimuxWorkbench = { open: (opts) => { opened.push(opts); return true } }
  api.place()
  activateExploreItem(last)
  assert.deepEqual(opened, [{ tabId: 'fast-news-workbench', title: '快讯中枢' }], 'tabId 兜底打开一次')

  // AC6：注销后集合不再包含该项
  unregister()
  assert.equal(resolveExploreMenuItems().length, EXPLORE_MENU_ITEMS.length, '注销后回到初始项数')
  assert.equal(
    resolveExploreMenuItems().some((item) => item.id === 'fast-news-workbench'),
    false,
    '注销项不再出现',
  )
  delete window.__omnimuxWorkbench
})

test('运行时注册接缝：action 优先于 tabId，非法形状与 id 冲突不产生脏项', async () => {
  setup()
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  // AC7：非法形状不注册、不抛错，仍返回可调用注销函数
  const invalid = [
    null,
    undefined,
    'fast-news-workbench',
    {},
    { id: 'x' },
    { id: 'x', label: '' },
    { id: 'x', label: '快讯中枢' },
    { id: 'x', label: '快讯中枢', iconSvg: '   ' },
    { id: '   ', label: '快讯中枢', iconSvg: '<svg></svg>' },
  ]
  for (const bad of invalid) {
    const dispose = api.registerExploreItem(bad)
    assert.equal(typeof dispose, 'function', '非法输入仍返回注销函数')
    dispose()
  }
  assert.equal(resolveExploreMenuItems().length, EXPLORE_MENU_ITEMS.length, '非法输入不改变菜单集合')

  // AC5：与内置 id 冲突时不注册
  const conflict = api.registerExploreItem({ id: 'apps', label: '伪装应用', iconSvg: '<svg></svg>' })
  assert.equal(resolveExploreMenuItems().length, EXPLORE_MENU_ITEMS.length, '内置 id 冲突项被忽略')
  conflict()

  // AC5：同 id 二次注册覆盖，不产生重复项
  let actionCalls = 0
  const unregisterFirst = api.registerExploreItem({
    id: 'fast-news-workbench',
    label: '快讯中枢',
    iconSvg: '<svg></svg>',
    tabId: 'fast-news-workbench',
  })
  const unregisterSecond = api.registerExploreItem({
    id: 'fast-news-workbench',
    label: '快讯中枢',
    iconSvg: '<svg></svg>',
    action: () => {
      actionCalls += 1
      return true
    },
  })
  assert.equal(
    resolveExploreMenuItems().filter((item) => item.id === 'fast-news-workbench').length,
    1,
    '同 id 仅保留一项',
  )

  // AC4：action 返回 true 时不再走 tabId 兜底
  const opened = []
  window.__omnimuxWorkbench = { open: (opts) => { opened.push(opts); return true } }
  const registered = resolveExploreMenuItems().find((item) => item.id === 'fast-news-workbench')
  assert.ok(registered, '注册项在集合内')
  activateExploreItem(registered)
  assert.equal(actionCalls, 1, 'action 被调用一次')
  assert.deepEqual(opened, [], 'action 返回 true 时不走 tabId 兜底')

  unregisterFirst()
  unregisterSecond()
  assert.equal(resolveExploreMenuItems().length, EXPLORE_MENU_ITEMS.length, '全部注销后回到初始项数')
  delete window.__omnimuxWorkbench
})
