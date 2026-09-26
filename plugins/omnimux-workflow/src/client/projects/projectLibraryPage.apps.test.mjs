/**
 * 「项目」页「AI应用」分类的接线契约（ProjectLibraryPage.jsx）。
 *
 * 真实 DOM 测试：页面与真实组件库一起打包进 jsdom，只对网络层
 * （../api.js、../../canvas/bridge/apiClient.ts）与建会话模块打桩，
 * 文案走真实 zh 字典。断言的是「切分类才去读清单」「删除真的走二次确认」
 * 「失败真的不改存储」，而不是源码正则的自说自话。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zh } from '../locales.js'

const require = createRequire(import.meta.url)
const React = require('react')
const here = dirname(fileURLToPath(import.meta.url))

const MANIFESTS_KEY = 'omnimux_apps_manifests'

const CSS_STUB = 'export default new Proxy({}, { get: (_t, k) => (typeof k === "string" ? k : undefined) })'

const API_STUB = `
exports.listProjects = async () => ({ ok: true, body: { projects: globalThis.__testProjects || [] } })
exports.getProject = async () => ({ ok: false })
exports.renameProject = async () => ({ ok: true })
exports.deleteProject = async () => ({ ok: true })
exports.bindProjectSession = async () => ({ ok: true })
exports.createProjectPage = async () => ({ ok: true })
exports.updateProjectPage = async () => ({ ok: true })
exports.deleteProjectPage = async () => ({ ok: true })
exports.fetchProjectFiles = async () => ({ ok: false })
exports.mkdirProjectFile = async () => ({ ok: false })
exports.uploadProjectFiles = async () => ({ ok: false })
`

const API_CLIENT_STUB = `
exports.getWorkspaceAssets = async () => ({ ok: false })
exports.mkdirWorkspaceAsset = async () => ({ ok: false })
exports.ingestWorkspaceAssets = async () => ({ ok: false })
exports.pickLocalFiles = async () => ({ ok: false, body: { paths: [] } })
`

const NEW_PROJECT_STUB = `
exports.createProjectSession = async () => ({ id: 'sess-1' })
exports.dismissProductStage = () => {}
exports.runNewProject = async () => ({ ok: true })
`

async function loadPage() {
  const result = await build({
    absWorkingDir: resolve(here, '..', '..', '..'),
    entryPoints: [resolve(here, 'ProjectLibraryPage.jsx')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/client'],
    logLevel: 'silent',
    plugins: [{
      name: 'page-seams',
      setup(builder) {
        builder.onLoad({ filter: /\.css$/ }, () => ({ contents: CSS_STUB, loader: 'js' }))
        builder.onResolve({ filter: /(^|\/)api\.js$/ }, () => ({ path: 'api-seam', namespace: 'seam' }))
        builder.onResolve({ filter: /bridge\/apiClient\.ts$/ }, () => ({ path: 'apiclient-seam', namespace: 'seam' }))
        builder.onResolve({ filter: /newProject\.js$/ }, () => ({ path: 'newproject-seam', namespace: 'seam' }))
        builder.onLoad({ filter: /.*/, namespace: 'seam' }, (args) => {
          if (args.path === 'api-seam') return { contents: API_STUB, loader: 'js' }
          if (args.path === 'apiclient-seam') return { contents: API_CLIENT_STUB, loader: 'js' }
          if (args.path === 'newproject-seam') return { contents: NEW_PROJECT_STUB, loader: 'js' }
          return undefined
        })
      },
    }],
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports)
  return mod.exports
}

const realStorage = () => globalThis.localStorage

function seedManifests(rows) {
  const map = Object.fromEntries(rows.map((row) => [row.appId, row]))
  realStorage().setItem(MANIFESTS_KEY, JSON.stringify(map))
}

const appRow = (appId, name, createdAt, binding = {}) => ({
  appId,
  createdAt,
  metadata: { name, category: 'video' },
  workflowBinding: { workspaceId: `ws_${appId}`, nodes: [], edges: [], ...binding },
})

async function mountPage({ sidebar = null, t = (key) => zh[key] || key } = {}) {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' })
  const defineGlobal = (name, value) => Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })
  defineGlobal('window', dom.window)
  defineGlobal('document', dom.window.document)
  defineGlobal('navigator', dom.window.navigator)
  defineGlobal('localStorage', dom.window.localStorage)
  // 组件里的 CustomEvent / Event 走宿主全局；必须和 jsdom 的 window 同源，否则 dispatchEvent 拒收。
  defineGlobal('CustomEvent', dom.window.CustomEvent)
  defineGlobal('Event', dom.window.Event)
  defineGlobal('MouseEvent', dom.window.MouseEvent)
  defineGlobal('KeyboardEvent', dom.window.KeyboardEvent)
  defineGlobal('PointerEvent', dom.window.PointerEvent || dom.window.MouseEvent)
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.__testProjects = []
  if (sidebar) dom.window.__omnimuxBetterSidebar = sidebar

  const { ProjectLibraryPage } = await loadPage()
  const reactDomClient = require('react-dom/client')
  const { act } = require('react')

  const container = document.getElementById('root')
  const root = reactDomClient.createRoot(container)
  await act(async () => {
    root.render(React.createElement(ProjectLibraryPage, {
      t,
      stage: { set() {} },
      store: null,
      visible: true,
      sessions: { create: async () => ({ id: 's' }), open() {} },
      workspaces: {},
      layout: { closeDetails() {} },
      betterSidebar: sidebar,
    }))
  })
  // 顶层项目列表在 await 之后才落地，让微任务跑完
  await act(async () => { await Promise.resolve() })
  return {
    dom,
    act,
    container,
    root,
    async teardown() {
      await act(async () => root.unmount())
      dom.window.close()
      delete globalThis.window
      delete globalThis.document
      delete globalThis.localStorage
      delete globalThis.CustomEvent
      delete globalThis.Event
      delete globalThis.MouseEvent
      delete globalThis.KeyboardEvent
      delete globalThis.PointerEvent
      delete globalThis.__testProjects
    },
  }
}

const tabButtons = (container) => [...container.querySelectorAll('[role="tab"]')]
const menuItems = () => [...document.querySelectorAll('[role="menuitem"]')]
const cardEls = (container) => [...container.querySelectorAll('.omnimux-workflow-app-card')]
const dialogEl = () => document.querySelector('[role="dialog"]')
const buttonByText = (scope, text) => [...scope.querySelectorAll('button')].find((button) => button.textContent.trim() === text)

async function openAppsTab(act, container) {
  const appsTab = tabButtons(container).find((button) => button.textContent.trim() === 'AI应用')
  assert.ok(appsTab, '「AI应用」分类必须存在')
  await act(async () => appsTab.click())
}

test('分类栏为三项且顺序是 本地项目 → 共创项目（禁用）→ AI应用', async () => {
  const page = await mountPage()
  try {
    assert.deepEqual(
      tabButtons(page.container).map((button) => button.textContent.trim()),
      ['本地项目', '共创项目（即将上线）', 'AI应用'],
    )
    const [, featured, apps] = tabButtons(page.container)
    assert.equal(featured.disabled, true, '共创项目保持禁用')
    assert.equal(apps.disabled, false, 'AI应用必须可切换')
  } finally { await page.teardown() }
})

test('切到「AI应用」才读清单：卡片按新→旧渲染，标题与分类文案来自 manifest', async () => {
  const page = await mountPage()
  try {
    seedManifests([
      appRow('app_old', '旧应用', '2026-09-01T00:00:00.000Z'),
      appRow('app_new', '新应用', '2026-09-10T00:00:00.000Z'),
    ])

    assert.equal(cardEls(page.container).length, 0, '默认在「本地项目」分类，不得提前渲染应用卡片')

    await openAppsTab(page.act, page.container)
    const cards = cardEls(page.container)
    assert.equal(cards.length, 2)
    assert.deepEqual(cards.map((card) => card.textContent.match(/新应用|旧应用/)?.[0]), ['新应用', '旧应用'])
    assert.match(cards[0].textContent, /视频应用/, '副标题走既有分类文案，不是原始 category 值')
  } finally { await page.teardown() }
})

test('无已发布应用时给真实空态，不伪造卡片', async () => {
  const page = await mountPage()
  try {
    await openAppsTab(page.act, page.container)
    assert.equal(cardEls(page.container).length, 0)
    assert.match(page.container.textContent, /还没有 AI 应用/)
    assert.match(page.container.textContent, /发布应用/)
  } finally { await page.teardown() }
})

test('清单损坏 → 真实空态（不抛异常、不伪造数据）；存储不可用 → 真实错误', async () => {
  const corrupt = await mountPage()
  try {
    realStorage().setItem(MANIFESTS_KEY, '{ 不是 json')
    await openAppsTab(corrupt.act, corrupt.container)
    assert.equal(cardEls(corrupt.container).length, 0)
    assert.match(corrupt.container.textContent, /还没有 AI 应用/)
  } finally { await corrupt.teardown() }

  const blocked = await mountPage()
  try {
    // 隐私模式 / 存储被策略禁用：读写入口都不存在
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, writable: true, configurable: true })
    await openAppsTab(blocked.act, blocked.container)
    assert.equal(cardEls(blocked.container).length, 0)
    assert.match(blocked.container.textContent, /本地存储不可用/)
  } finally { await blocked.teardown() }
})

test('点卡片打开应用标签页，tab.id 走 app_<appId> 约定', async () => {
  const opened = []
  const sidebar = { openTab: (seed, scope) => opened.push({ seed, scope }), closeTab() {} }
  const page = await mountPage({ sidebar })
  try {
    seedManifests([appRow('app_marketing', '营销短片', '2026-09-10T00:00:00.000Z')])
    await openAppsTab(page.act, page.container)
    await page.act(async () => cardEls(page.container)[0].click())

    assert.equal(opened.length, 1)
    assert.equal(opened[0].seed.type, 'omnimux-workflow:app')
    assert.equal(opened[0].seed.id, 'app_app_marketing')
    assert.equal(opened[0].seed.title, '营销短片')
  } finally { await page.teardown() }
})

test('卡片「更多」→ 删除先弹二次确认，取消后记录与卡片都保留', async () => {
  const closed = []
  const sidebar = { openTab() {}, closeTab: (id) => closed.push(id) }
  const page = await mountPage({ sidebar })
  try {
    seedManifests([appRow('app_marketing', '营销短片', '2026-09-10T00:00:00.000Z')])
    await openAppsTab(page.act, page.container)

    await page.act(async () => page.container.querySelector('[aria-haspopup="menu"]').click())
    const items = menuItems()
    assert.deepEqual(items.map((item) => item.textContent.trim()), ['编辑', '删除'])

    await page.act(async () => items[1].click())
    const dialog = dialogEl()
    assert.ok(dialog, '删除必须先弹二次确认')
    assert.match(dialog.textContent, /营销短片/, '确认文案必须点名要删哪个应用')
    assert.equal(closed.length, 0, '未确认前不得关闭标签页')

    const cancel = buttonByText(dialog, '取消')
    assert.ok(cancel, '二次确认必须有取消入口')
    await page.act(async () => cancel.click())

    assert.equal(dialogEl(), null, '取消后弹窗关闭')
    assert.equal(cardEls(page.container).length, 1, '取消后卡片必须保留')
    assert.equal(closed.length, 0)
    assert.ok(JSON.parse(realStorage().getItem(MANIFESTS_KEY)).app_marketing, '取消后记录必须原样保留')
  } finally { await page.teardown() }
})

test('确认删除：移除记录、关掉对应应用标签页、列表刷新', async () => {
  const closed = []
  const sidebar = { openTab() {}, closeTab: (id) => closed.push(id) }
  const page = await mountPage({ sidebar })
  try {
    seedManifests([
      appRow('app_marketing', '营销短片', '2026-09-10T00:00:00.000Z'),
      appRow('app_keep', '留下的应用', '2026-09-09T00:00:00.000Z'),
    ])
    await openAppsTab(page.act, page.container)
    assert.equal(cardEls(page.container).length, 2)

    await page.act(async () => page.container.querySelectorAll('[aria-haspopup="menu"]')[0].click())
    await page.act(async () => menuItems()[1].click())
    await page.act(async () => buttonByText(dialogEl(), '删除').click())
    await page.act(async () => { await Promise.resolve() })

    const left = JSON.parse(realStorage().getItem(MANIFESTS_KEY))
    assert.equal(left.app_marketing, undefined, '确认后目标记录必须被移除')
    assert.ok(left.app_keep, '其他应用必须原样保留')
    assert.deepEqual(closed, ['app_app_marketing'], '必须关掉对应的应用标签页')
    assert.equal(cardEls(page.container).length, 1, '列表必须刷新')
  } finally { await page.teardown() }
})

test('删除写盘失败：卡片保留并报错，不伪造成功', async () => {
  const closed = []
  const sidebar = { openTab() {}, closeTab: (id) => closed.push(id) }
  const page = await mountPage({ sidebar })
  try {
    seedManifests([appRow('app_marketing', '营销短片', '2026-09-10T00:00:00.000Z')])
    await openAppsTab(page.act, page.container)

    // 只让写盘失败、读取仍可用（配额超限的典型形态）
    const working = realStorage()
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: (key) => working.getItem(key), setItem: () => { throw new Error('QuotaExceededError') } },
      writable: true,
      configurable: true,
    })

    await page.act(async () => page.container.querySelector('[aria-haspopup="menu"]').click())
    await page.act(async () => menuItems()[1].click())
    await page.act(async () => buttonByText(dialogEl(), '删除').click())
    await page.act(async () => { await Promise.resolve() })

    assert.equal(cardEls(page.container).length, 1, '写盘失败必须保留卡片')
    assert.equal(closed.length, 0, '失败不得关闭标签页')
    assert.match(page.container.textContent, /删除应用失败/)
    assert.ok(JSON.parse(working.getItem(MANIFESTS_KEY)).app_marketing, '写盘失败不得改动原记录')
  } finally { await page.teardown() }
})

test('卡片「编辑」打开所属项目画布并把工作流组写进 tab meta，且不提前广播无 sessionId 事件', async () => {
  const opened = []
  const updated = []
  const rawEvents = []
  const onRawEvent = (e) => rawEvents.push(e?.detail)
  if (typeof window !== 'undefined') {
    window.addEventListener('omnimux:active-canvas-changed', onRawEvent)
  }
  const sidebar = {
    getTab: (id) => ({ id }),
    getSnapshot: () => ({ state: { splits: { kind: 'leaf', tabs: [] }, bottomSplits: { kind: 'leaf', tabs: [] } } }),
    openTab: (seed, scope) => opened.push({ seed, scope }),
    updateTab: (id, patch) => updated.push({ id, patch }),
    closeTab() {},
  }
  const page = await mountPage({ sidebar })
  try {
    seedManifests([
      appRow('app_marketing', '营销短片', '2026-09-10T00:00:00.000Z', {
        projectId: 'proj_1',
        sourceGroupId: 'group_7',
      }),
    ])
    await openAppsTab(page.act, page.container)
    await page.act(async () => page.container.querySelector('[aria-haspopup="menu"]').click())
    await page.act(async () => menuItems()[0].click())
    await page.act(async () => { await Promise.resolve() })

    const canvasOpen = opened.find((entry) => entry.seed.id === 'omnimux-workflow:canvas')
    assert.ok(canvasOpen, '「编辑」必须打开画布标签页')
    assert.deepEqual(updated, [{ id: 'omnimux-workflow:canvas', patch: { meta: { focusGroupId: 'group_7' } } }])
    assert.equal(dialogEl(), null, '「编辑」不得弹出删除确认')
    assert.equal(cardEls(page.container).length, 1, '「编辑」不得改动列表')

    // 严禁派发未带合法 sessionId 的提前广播
    const unsafeBroadcast = rawEvents.find((evt) => !evt?.sessionId)
    assert.equal(unsafeBroadcast, undefined, '严禁在会话就绪前提前广播未带 sessionId 的脏事件')
  } finally {
    if (typeof window !== 'undefined') {
      window.removeEventListener('omnimux:active-canvas-changed', onRawEvent)
    }
    await page.teardown()
  }
})

test('旧记录没有 projectId 时按 workspaceId 反查所属项目并落到同一个会话', async () => {
  const opened = []
  const sessionsOpened = []
  const sidebar = {
    getTab: (id) => ({ id }),
    getSnapshot: () => ({ state: { splits: { kind: 'leaf', tabs: [] }, bottomSplits: { kind: 'leaf', tabs: [] } } }),
    openTab: (seed, scope) => opened.push({ seed, scope }),
    updateTab() {},
    closeTab() {},
  }
  globalThis.__testProjects = [{
    id: 'proj_legacy',
    title: '旧项目',
    sessionId: 'sess-legacy',
    canvasWorkspaceIds: ['ws_app_legacy'],
  }]
  const page = await mountPage({
    sidebar,
    // 会话打开链路要能观察到
    t: (key) => zh[key] || key,
  })
  try {
    page.sessionsOpened = sessionsOpened
    seedManifests([appRow('app_legacy', '老应用', '2026-09-10T00:00:00.000Z', { sourceGroupId: 'group_3' })])

    await openAppsTab(page.act, page.container)
    await page.act(async () => page.container.querySelector('[aria-haspopup="menu"]').click())
    await page.act(async () => menuItems()[0].click())
    await page.act(async () => { await Promise.resolve() })

    assert.ok(
      opened.some((entry) => entry.seed.id === 'omnimux-workflow:canvas'),
      '旧记录没有 projectId，也要能按 workspaceId 反查并打开画布',
    )
    assert.equal(cardEls(page.container).length, 1, '反查所属项目不得改动应用列表')
  } finally { await page.teardown() }
})

test('搜索框在「AI应用」分类下按应用名过滤', async () => {
  const page = await mountPage()
  try {
    seedManifests([
      appRow('app_a', '营销短片', '2026-09-10T00:00:00.000Z'),
      appRow('app_b', '播客音频', '2026-09-09T00:00:00.000Z'),
    ])
    await openAppsTab(page.act, page.container)
    assert.equal(cardEls(page.container).length, 2)

    const input = page.container.querySelector('input')
    assert.ok(input, '筛选栏必须有搜索框')
    await page.act(async () => {
      const setter = Object.getOwnPropertyDescriptor(page.dom.window.HTMLInputElement.prototype, 'value').set
      setter.call(input, '播客')
      input.dispatchEvent(new page.dom.window.Event('input', { bubbles: true }))
    })
    const cards = cardEls(page.container)
    assert.equal(cards.length, 1)
    assert.match(cards[0].textContent, /播客音频/)
  } finally { await page.teardown() }
})
