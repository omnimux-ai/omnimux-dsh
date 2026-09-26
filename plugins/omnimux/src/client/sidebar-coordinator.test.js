/**
 * sidebar-coordinator 回归测试（P0）与探索菜单收敛专项测试：
 *   1. 注册 below（rank 5）+ inline（kind:'inline'）后，连续 place() 不抛；
 *   2. 常驻探索行 rank 3.9，排在项目（rank 4）上方；
 *   3. 浮动菜单展示 11 项白名单，点击激活对应 Workbench Tab 并关闭菜单；
 *   4. 收敛所有非常驻插件，不作为独立行挂入侧栏 DOM。
 */
import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

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

test('仅 below 行（无 inline）时保持原有锚点行为，探索行首发居前', async () => {
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
    const exploreBtn = root.querySelector('[data-omnimux-explore-entry]')
    assert.ok(exploreBtn, '常驻探索行存在')
    assert.equal(exploreBtn.parentElement, root)
    assert.equal(exploreBtn.previousElementSibling, sessionBtn, '探索行紧接新建会话按钮')
    assert.equal(belowBtn.parentElement, root, 'below 行是 root 直接子节点')
    assert.equal(belowBtn.previousElementSibling, exploreBtn, 'rank 5 below 行排在 rank 3.9 探索行之后')
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

test('Alpha entries are excluded from sidebar placement while retaining source registers', async () => {
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

  for (const { name, element } of rows) {
    if (name === 'inspiration' || name === 'workflow') {
      assert.ok(element.parentElement !== null, `${name} 必须挂入 DOM`)
    } else {
      assert.equal(element.parentElement, null, `${name} 内测版与收敛项不得挂入侧栏 DOM`)
    }
  }

  assert.equal(document.querySelectorAll('.omnimux-sidebar-alpha-badge').length, 0)
  assert.equal(document.querySelectorAll('[data-release-stage="alpha"]').length, 0)

  api.place()
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(document.querySelectorAll('.omnimux-sidebar-alpha-badge').length, 0)

  for (const { dispose } of rows) dispose()
})

test('品牌按钮不得抢占新对话锚点，常驻探索行紧挨新对话且不插在品牌钮后', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  for (let i = 0; i < 4; i++) assert.doesNotThrow(() => { api.place() })
  const root = document.querySelector('[data-pane="sidebar"]')
  const sessionBtn = root.querySelector('.newSession')
  const brand = root.querySelector('.x-Wl6W_brand')
  const exploreBtn = root.querySelector('[data-omnimux-explore-entry]')
  assert.ok(brand, '夹具含品牌钮')
  assert.ok(exploreBtn, '探索行已挂入 DOM')
  assert.equal(exploreBtn.parentElement, root)
  assert.equal(exploreBtn.previousElementSibling, sessionBtn, '探索行必须紧挨新对话，不得插在品牌钮后')
  assert.notEqual(exploreBtn.previousElementSibling, brand)
})

test('desktop 外壳包住内层 pane 时仍把 extra row 插在新对话下方', async () => {
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
    const sessionBtn = pane.querySelector('.newSession')
    const exploreBtn = pane.querySelector('[data-omnimux-explore-entry]')
    assert.equal(exploreBtn.parentElement, pane, '探索行必须插在 inner pane')
    assert.equal(exploreBtn.previousElementSibling, sessionBtn)
    assert.equal(belowBtn.parentElement, pane, 'assets 必须插在 inner pane')
    assert.equal(belowBtn.previousElementSibling, exploreBtn)
    assert.equal(belowBtn.nextElementSibling?.className, 'workspace')
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
/* 探索行与探索浮动菜单专项测试                                                */
/* ========================================================================= */

test('探索行 rank 严格为 3.9，排在「项目」（rank 4）正上方', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  const workflowBtn = document.createElement('button')
  workflowBtn.id = 'workflow-entry'
  const disposeWorkflow = api.register({ id: 'omnimux-workflow-entry', rank: 4, create: () => workflowBtn })

  try {
    api.place()
    const root = document.querySelector('[data-pane="sidebar"]')
    const exploreBtn = root.querySelector('[data-omnimux-explore-entry]')
    assert.ok(exploreBtn, '探索行已常驻渲染')
    assert.equal(exploreBtn.parentElement, root)
    assert.equal(workflowBtn.parentElement, root)
    assert.equal(exploreBtn.nextElementSibling, workflowBtn, '探索行必须排在「项目」正上方')
    assert.equal(workflowBtn.previousElementSibling, exploreBtn)
  } finally {
    disposeWorkflow()
  }
})

test('探索行折叠态展示为居中图标，隐藏文案标签', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  api.place()

  const root = document.querySelector('[data-pane="sidebar"]')
  const exploreBtn = root.querySelector('[data-omnimux-explore-entry]')
  const label = exploreBtn.querySelector('.omnimux-explore-entry-label')
  const icon = exploreBtn.querySelector('.omnimux-explore-entry-icon')

  assert.ok(label && icon, '展开态包含图标与标签')
  assert.equal(label.textContent, '探索', '文案严格为「探索」')

  const frame = document.querySelector('[data-omnimux-frame]')
  frame.setAttribute('data-sidebar-collapsed', '')
  api.place()

  const css = document.getElementById('omnimux-sidebar-explore-styles')?.textContent ?? ''
  assert.match(css, /\[data-sidebar-collapsed\][\s\S]*\.omnimux-explore-entry[\s\S]*width:\s*36px/)
  assert.match(css, /\[data-sidebar-collapsed\][\s\S]*\.omnimux-explore-entry-label[\s\S]*display:\s*none/)
})

test('非核心插件（video, products, device, clip, social-harvest, apps 等）收敛，不渲染独立行', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  const targets = [
    { id: 'omnimux-video-entry', rank: 7.5 },
    { id: 'omnimux-google-vids-entry', rank: 7.5 },
    { id: 'omnimux-products-entry', rank: 8 },
    { id: 'omnimux-device-entry', rank: 3.5 },
    { id: 'omnimux-clip-entry', rank: 8.2 },
    { id: 'omnimux-social-harvest-entry', rank: 19 },
    { id: 'omnimux-apps-entry', rank: 1 },
    { id: 'omnimux-market-entry', rank: 8 },
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

test('点击探索行弹出浮动菜单，包含 Spec 锁定 11 项白名单与纯矢量 SVG', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL, closeExploreMenu } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  api.place()

  const root = document.querySelector('[data-pane="sidebar"]')
  const exploreBtn = root.querySelector('[data-omnimux-explore-entry]')

  exploreBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))

  const menu = document.getElementById('omnimux-explore-menu')
  assert.ok(menu, '浮动菜单必须挂入 document.body')
  assert.equal(menu.getAttribute('role'), 'menu')
  assert.equal(exploreBtn.getAttribute('aria-expanded'), 'true')

  const items = [...menu.querySelectorAll('.omnimux-explore-menu-item')]
  assert.equal(items.length, 11, '菜单项必须严格为 11 项')

  const expectedLabels = [
    '应用', '视频剪辑', 'Google Vids', '产品库', '发布',
    '账号', '手机管理', '数据分析', '自动化', '任务表单', '社交采收',
  ]
  const actualLabels = items.map((el) => el.querySelector('.omnimux-explore-menu-item-label')?.textContent?.trim())
  assert.deepEqual(actualLabels, expectedLabels, '11项文案必须逐字匹配白名单')

  // 严禁 Emoji（UI04 门禁硬规则），每项必须包含矢量 SVG
  for (const item of items) {
    const svg = item.querySelector('svg')
    assert.ok(svg, '每项必须包含矢量 SVG 图标')
    assert.equal(svg.getAttribute('viewBox'), '0 0 16 16')
    assert.doesNotMatch(item.textContent, /[\u{1F300}-\u{1F9FF}]/u, '严禁任何 Emoji')
  }

  const dividers = menu.querySelectorAll('.omnimux-explore-menu-divider')
  assert.ok(dividers.length >= 2, '包含细分割线')

  // 再次点击探索行，切换关闭菜单
  exploreBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  assert.equal(document.getElementById('omnimux-explore-menu'), null, '再次点击关闭菜单')
})

test('点击菜单项激活对应 Tab 并关闭菜单，支持委托收敛元素 click', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  let videoClicks = 0
  const videoBtn = document.createElement('button')
  videoBtn.addEventListener('click', () => { videoClicks += 1 })
  const disposeVideo = api.register({ id: 'omnimux-google-vids-entry', rank: 7.5, create: () => videoBtn })

  let wbOpenedTab = null
  window.__omnimuxWorkbench = {
    open: (opts) => { wbOpenedTab = opts },
  }

  try {
    api.place()
    const root = document.querySelector('[data-pane="sidebar"]')
    const exploreBtn = root.querySelector('[data-omnimux-explore-entry]')

    // 1. 点击已注册的 Google Vids，委托触发 videoBtn.click()
    exploreBtn.click()
    let menu = document.getElementById('omnimux-explore-menu')
    const vidsItem = menu.querySelector('[data-explore-id="google-vids"]')
    vidsItem.click()
    assert.equal(videoClicks, 1, '优先触发已注册收敛元素的 click 处理器')
    assert.equal(document.getElementById('omnimux-explore-menu'), null, '选后关闭菜单')

    // 2. 点击未注册实际元素的「数据分析」，fallback 到 window.__omnimuxWorkbench.open
    exploreBtn.click()
    menu = document.getElementById('omnimux-explore-menu')
    const analyticsItem = menu.querySelector('[data-explore-id="analytics"]')
    analyticsItem.click()
    assert.equal(wbOpenedTab?.tabId, 'omnimux-analytics:library')
    assert.equal(wbOpenedTab?.title, '数据分析')
    assert.equal(document.getElementById('omnimux-explore-menu'), null, '选后关闭菜单')
  } finally {
    disposeVideo()
    delete window.__omnimuxWorkbench
  }
})

test('激活 apps 项时其 element.click 仅被调用一次，绝无重复点击', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL, activateExploreItem, EXPLORE_MENU_ITEMS } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()

  let appsClicks = 0
  const appsBtn = document.createElement('button')
  appsBtn.addEventListener('click', () => { appsClicks += 1 })
  const disposeApps = api.register({ id: 'omnimux-apps-entry', rank: 1, create: () => appsBtn })

  try {
    api.place()
    const root = document.querySelector('[data-pane="sidebar"]')
    const exploreBtn = root.querySelector('[data-omnimux-explore-entry]')

    // 1. 通过探索菜单点击「应用」项，验证 element.click 仅被调用一次，绝无重复点击
    exploreBtn.click()
    const menu = document.getElementById('omnimux-explore-menu')
    assert.ok(menu, '探索菜单已打开')
    const appsItemEl = menu.querySelector('[data-explore-id="apps"]')
    assert.ok(appsItemEl, '找到应用菜单项')

    appsItemEl.click()
    assert.equal(appsClicks, 1, 'apps.action 执行并触发 element.click 仅 1 次，绝无重复点击')
    assert.equal(document.getElementById('omnimux-explore-menu'), null, '选后关闭菜单')

    // 2. 直接调用 activateExploreItem(appsItem)，再次验证仅触发 1 次（累计 2 次）
    const appsItem = EXPLORE_MENU_ITEMS.find((it) => it.id === 'apps')
    assert.ok(appsItem, 'EXPLORE_MENU_ITEMS 包含 apps')
    activateExploreItem(appsItem)
    assert.equal(appsClicks, 2, '直接激活 apps 项时其 element.click 同样仅被调用 1 次')
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

test('按 Escape 键或点击外部可关闭探索浮动菜单', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  api.place()

  const root = document.querySelector('[data-pane="sidebar"]')
  const exploreBtn = root.querySelector('[data-omnimux-explore-entry]')

  // 1. 按 Escape 键关闭
  exploreBtn.click()
  assert.ok(document.getElementById('omnimux-explore-menu'))
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(document.getElementById('omnimux-explore-menu'), null, 'Esc 键关闭菜单')

  // 2. 点击外部区域关闭
  exploreBtn.click()
  assert.ok(document.getElementById('omnimux-explore-menu'))
  document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  assert.equal(document.getElementById('omnimux-explore-menu'), null, '点击外部关闭菜单')
})

test('computeExploreMenuPosition 具备视口防溢出几何计算', async () => {
  setup()
  const { computeExploreMenuPosition } = await import('./sidebar-coordinator.js')
  const anchor = document.createElement('button')
  document.body.append(anchor)

  // 正常位置：显示在 anchor 右侧 6px
  anchor.getBoundingClientRect = () => ({
    x: 50, y: 100, left: 50, top: 100, width: 36, height: 36, right: 86, bottom: 136,
  })
  const posNormal = computeExploreMenuPosition(anchor, { innerWidth: 1280, innerHeight: 800 })
  assert.equal(posNormal.left, 92, 'right + gap 6')
  assert.equal(posNormal.top, 100, 'top 对齐')

  // 右侧溢出位置：翻转到 anchor 左侧
  anchor.getBoundingClientRect = () => ({
    x: 1200, y: 100, left: 1200, top: 100, width: 36, height: 36, right: 1236, bottom: 136,
  })
  const posRightOverflow = computeExploreMenuPosition(anchor, { innerWidth: 1280, innerHeight: 800 })
  assert.ok(posRightOverflow.left < 1200, '右侧溢出时翻转到左侧')

  // 底部溢出位置：向上贴合防溢出
  anchor.getBoundingClientRect = () => ({
    x: 50, y: 700, left: 50, top: 700, width: 36, height: 36, right: 86, bottom: 736,
  })
  const posBottomOverflow = computeExploreMenuPosition(anchor, { innerWidth: 1280, innerHeight: 800 })
  assert.ok(posBottomOverflow.top <= 800 - 380 - 8, '底部溢出时向上翻转贴合')
})
