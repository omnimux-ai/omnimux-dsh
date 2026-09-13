/**
 * sidebar-coordinator 回归测试（P0）：
 *   注册 below（rank 5）+ inline（kind:'inline'）后，连续 place()（模拟 2s retry
 *   与 MutationObserver 触发）不得抛 NotFoundError。
 *
 * 根因：placeInline 把「新建会话」按钮移进 inline wrapper 后，placeBelow 仍以
 * 按钮为锚点，其 nextElementSibling 不再是 root 直接子节点 → insertBefore 抛
 * NotFoundError。修复后 placeBelow 感知 wrapper 并锚在其后。
 */
import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

// install() 会 setInterval(2s) 轮询；测试里替换为 no-op，避免挂住测试进程。
// 注意：不在此恢复 —— node --test 每个文件独立进程，且模块跨测试缓存，第二
// 个测试的 install() 若在恢复后调用会重新排真实 interval，反而挂住进程。
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
  // 对齐官方 AppFrame：data-sidebar-collapsed 写在 frame 根，不是 <html>。
  // logoRow 品牌钮必须在夹具里：#1572 曾把它误当成新对话锚点。
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
    // 首次放置 + 连续 place()（模拟 2s retry / MutationObserver 反复触发）不抛。
    for (let i = 0; i < 6; i++) {
      assert.doesNotThrow(() => { api.place() })
    }

    // 结构断言：wrapper 包裹「新建会话」+ inline 按钮；below 行是 root 直接子且在其后。
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

test('仅 below 行（无 inline）时保持原有锚点行为', async () => {
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
    assert.equal(belowBtn.parentElement, root, 'below 行是 root 直接子节点')
    assert.equal(belowBtn.previousElementSibling, sessionBtn, 'below 行紧接新建会话按钮')
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

    // Flush the observer tick caused by register()'s own insertBefore.
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
    // Hidden official button sits far left (rail zeroed)
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


test('Alpha entries retain activation and labels across placement and remount', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL, getPlaceCountForTests } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  let clicks = 0
  const rows = ['accounts', 'workflow', 'publish', 'analytics', 'forms', 'inspiration'].map((name, rank) => {
    const element = document.createElement('button')
    element.innerHTML = '<span class="omnimux-sidebar-nav-entry-label">功能</span>'
    element.setAttribute('aria-label', '功能')
    element.addEventListener('click', () => { clicks += 1 })
    const row = { id: `omnimux-${name}-entry`, rank: rank + 3, create: () => element }
    return { name, element, row, dispose: api.register(row) }
  })
  for (const { name, element } of rows) {
    element.click()
    assert.equal(element.disabled, false)
    assert.equal(element.getAttribute('aria-label'), '功能')
    if (name === 'inspiration' || name === 'workflow') {
      assert.equal(element.querySelector('.omnimux-sidebar-alpha-badge'), null)
      assert.equal(element.hasAttribute('data-release-stage'), false)
    } else {
      assert.equal(element.dataset.releaseStage, 'alpha')
      assert.equal(element.querySelector('.omnimux-sidebar-alpha-badge').textContent, 'Alpha')
      assert.match(element.getAttribute('aria-description'), /内测.*优先.*非 Alpha.*正式版/)
      element.querySelector('.omnimux-sidebar-nav-entry-label').textContent = 'Accounts'
      element.setAttribute('aria-label', 'Accounts')
      assert.match(element.title, /内测/)
    }
  }
  assert.equal(clicks, 6)
  for (const { dispose } of rows) dispose()
  const again = rows.filter(({ name }) => name !== 'workflow' && name !== 'inspiration').map(({ row }) => api.register(row))
  api.place()
  await new Promise(resolve => setTimeout(resolve, 20))
  const settled = getPlaceCountForTests()
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(getPlaceCountForTests(), settled, 'badge placement must not cause an observer loop')
  assert.equal(document.querySelectorAll('.omnimux-sidebar-alpha-badge').length, 4)
  for (const dispose of again) dispose()
  assert.equal(document.querySelectorAll('.omnimux-sidebar-alpha-badge').length, 0)
})

test('品牌按钮不得抢占新对话锚点，below 行紧挨新对话且不抛', async () => {
  setup()
  const { installSidebarGlobal, SIDEBAR_GLOBAL } = await import('./sidebar-coordinator.js')
  installSidebarGlobal()
  const api = SIDEBAR_GLOBAL()
  const belowBtn = document.createElement('button')
  belowBtn.id = 'apps-entry'
  belowBtn.setAttribute('data-omnimux-apps-entry', '')
  let dispose
  assert.doesNotThrow(() => {
    dispose = api.register({ id: 'omnimux-apps-entry', rank: 1, create: () => belowBtn })
  })
  try {
    for (let i = 0; i < 4; i++) assert.doesNotThrow(() => { api.place() })
    const root = document.querySelector('[data-pane="sidebar"]')
    const sessionBtn = root.querySelector('.newSession')
    const brand = root.querySelector('.x-Wl6W_brand')
    assert.ok(brand, '夹具含品牌钮')
    assert.equal(belowBtn.parentElement, root)
    assert.equal(belowBtn.previousElementSibling, sessionBtn, '入口必须紧挨新对话，不得插在品牌钮后')
    assert.notEqual(belowBtn.previousElementSibling, brand)
  } finally {
    dispose?.()
  }
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
    assert.equal(belowBtn.parentElement, pane, '不得插到 desktop surface 外壳')
    assert.equal(belowBtn.previousElementSibling, sessionBtn)
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
