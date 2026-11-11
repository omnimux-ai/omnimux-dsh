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
exports.listProjects = async () => ({ ok: true, body: { projects: (globalThis.__testProjects || []).map((p) => ({ ...p, path: p.path || ('/tmp/' + p.id) })) } })
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
exports.createProjectSession = (...args) => globalThis.__testCreateProjectSession
  ? globalThis.__testCreateProjectSession(...args)
  : Promise.resolve({ ok: true, sessionId: 'sess-1' })
exports.dismissProductStage = () => {}
exports.runNewProject = (...args) => globalThis.__testRunNewProject
  ? globalThis.__testRunNewProject(...args)
  : { ok: true, canvasOpened: true }
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

async function mountPage({ sidebar = null, t = (key) => zh[key] || key, projects = [] } = {}) {
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
  if (typeof globalThis.IntersectionObserver === 'undefined') {
    globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
  }
  globalThis.__testProjects = projects
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
      sessions: {
        create: async (opts) => (globalThis.__testCreateSession ? globalThis.__testCreateSession(opts) : 'sess-1'),
        open() {},
        list: {
          getSnapshot: () => {
            const path = globalThis.__testSessionCwd || globalThis.__testProjects?.[0]?.path || '/tmp/proj_1'
            return {
              current: 'sess-1',
              byId: { 'sess-1': { id: 'sess-1', cwd: path, updatedAt: 1, blank: false } },
              archivedSessionIds: [],
            }
          },
          subscribe: () => () => {},
        },
      },
      workspaces: {
        create: async ({ path }) => ({ workspaceId: `ws_${path.split('/').pop() || 'created'}` }),
        list: {
          getSnapshot: () => ({
            items: (globalThis.__testProjects || []).map((p) => ({
              workspaceId: `ws_${p.id}`,
              path: p.path || ('/tmp/' + p.id),
              title: p.title,
              sessionIds: [],
            })),
          }),
          subscribe: () => () => {},
        },
      },
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
  const page = await mountPage({ sidebar, projects: [{ id: 'proj_1', title: '项目一', path: '/tmp/proj_1', pages: [{ id: 'page_1', title: '创作页 1', canvasWorkspaceId: 'ws_page_1' }] }] })
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
  const page = await mountPage({ sidebar, projects: [{ id: 'proj_1', title: '项目一', path: '/tmp/proj_1', pages: [{ id: 'page_1', title: '创作页 1', canvasWorkspaceId: 'ws_page_1' }] }] })
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
  const page = await mountPage({ sidebar, projects: [{ id: 'proj_1', title: '项目一', path: '/tmp/proj_1', pages: [{ id: 'page_1', title: '创作页 1', canvasWorkspaceId: 'ws_page_1' }] }] })
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
  const page = await mountPage({ sidebar, projects: [{ id: 'proj_1', title: '项目一', path: '/tmp/proj_1', pages: [{ id: 'page_1', title: '创作页 1', canvasWorkspaceId: 'ws_page_1' }] }] })
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
  const page = await mountPage({ sidebar, projects: [{ id: 'proj_1', title: '项目一', path: '/tmp/proj_1', pages: [{ id: 'page_1', title: '创作页 1', canvasWorkspaceId: 'ws_page_1' }] }] })
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
    assert.equal(canvasOpen.seed.meta?.focusGroupId, 'group_7', '画布 tab seed 必须携带工作流组 id')
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
    projects: [{
      id: 'proj_legacy',
      title: '旧项目',
      path: '/tmp/proj_legacy',
      sessionId: 'sess-legacy',
      canvasWorkspaceIds: ['ws_app_legacy'],
      pages: [{ id: 'page_legacy', title: '创作页 1', canvasWorkspaceId: 'ws_app_legacy' }],
    }],
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

// ── Issue #3876：官方内置应用与用户已发布应用合并展示 ─────────────────────────

const BUILTIN_ENDPOINT = '/omnimux-apps/api/apps'

const builtinRow = (appId, name, extra = {}) => ({
  schemaVersion: '1.0.0',
  appId,
  version: '1.0.0',
  workflowBinding: { workspaceId: `ws_${appId}`, workflowVersion: 1 },
  metadata: { name, category: 'video', description: `${name} 官方出厂` },
  ...extra,
})

/** 只替换 fetch：内置清单接口走这份桩，其他请求仍走真实失败路径。 */
function stubBuiltinFetch(payload, { ok = true, fail = false } = {}) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (fail) throw new Error('offline')
    return {
      ok,
      status: ok ? 200 : 500,
      async json() { return payload },
    }
  }
  return { calls, restore() { globalThis.fetch = original } }
}

test('只有内置应用时不出空态：内置应用全部渲染成卡片', async () => {
  const fetchStub = stubBuiltinFetch({
    apps: [
      builtinRow('app-builtin-product-video', '商品生视频'),
      builtinRow('app-creatify-app-demo', '手机与网页交互实机演示'),
    ],
  })
  const page = await mountPage()
  try {
    await openAppsTab(page.act, page.container)
    const cards = cardEls(page.container)
    assert.equal(cards.length, 2, '内置应用必须出现在「AI应用」分类里')
    assert.match(page.container.textContent, /商品生视频/)
    assert.doesNotMatch(page.container.textContent, /还没有 AI 应用/, '有内置应用时不得显示空态')
    assert.ok(
      fetchStub.calls.some((call) => call.url === BUILTIN_ENDPOINT),
      '必须真的请求内置清单接口，而不是客户端硬编码清单',
    )
  } finally {
    fetchStub.restore()
    await page.teardown()
  }
})

test('内置卡片带「官方」标识且没有「更多」菜单；点它仍能打开 app_<appId> 标签页', async () => {
  const opened = []
  const sidebar = { openTab: (seed) => opened.push(seed), closeTab() {} }
  const fetchStub = stubBuiltinFetch({ apps: [builtinRow('app-builtin-video-to-prompt', '视频转提示词')] })
  const page = await mountPage({ sidebar })
  try {
    await openAppsTab(page.act, page.container)
    const card = cardEls(page.container)[0]
    assert.ok(card, '内置卡片必须渲染')
    assert.match(card.textContent, /官方/, '内置卡片必须有官方标识，与用户应用可区分')
    assert.equal(
      page.container.querySelectorAll('[aria-haspopup="menu"]').length,
      0,
      '内置应用是出厂内容，不得提供删除/编辑菜单',
    )

    await page.act(async () => card.click())
    assert.equal(opened.length, 1)
    assert.equal(opened[0].id, 'app_app-builtin-video-to-prompt')
    assert.equal(opened[0].type, 'omnimux-workflow:app')
    assert.equal(opened[0].meta.appId, 'app-builtin-video-to-prompt')
  } finally {
    fetchStub.restore()
    await page.teardown()
  }
})

test('用户已发布应用与内置应用合并：用户在前、同 appId 只留用户版且仍可删除', async () => {
  const fetchStub = stubBuiltinFetch({
    apps: [
      builtinRow('app-builtin-product-video', '商品生视频'),
      builtinRow('app-builtin-viral-replication', '爆款复刻'),
    ],
  })
  const page = await mountPage()
  try {
    seedManifests([appRow('app-builtin-product-video', '我的商品生视频', '2026-09-10T00:00:00.000Z')])
    await openAppsTab(page.act, page.container)

    const cards = cardEls(page.container)
    assert.equal(cards.length, 2, '同 appId 去重后应只剩用户版 + 另一个内置应用')
    assert.match(cards[0].textContent, /我的商品生视频/, '用户已发布应用排在最前')
    assert.match(cards[1].textContent, /爆款复刻/)
    assert.equal(
      page.container.querySelectorAll('[aria-haspopup="menu"]').length,
      1,
      '只有用户应用带「更多」菜单',
    )
  } finally {
    fetchStub.restore()
    await page.teardown()
  }
})

test('内置清单接口失败：给出真实错误提示，用户已发布应用照常显示', async () => {
  const fetchStub = stubBuiltinFetch({ apps: [] }, { fail: true })
  const page = await mountPage()
  try {
    seedManifests([appRow('app_marketing', '营销短片', '2026-09-10T00:00:00.000Z')])
    await openAppsTab(page.act, page.container)

    assert.equal(cardEls(page.container).length, 1, '内置失败不得连带清掉用户应用')
    assert.match(page.container.textContent, /官方内置应用暂时读取失败/, '必须显式报错，不能把读不到当成没有')
  } finally {
    fetchStub.restore()
    await page.teardown()
  }
})

test('内置清单非 2xx 也是错误：不渲染任何内置卡片', async () => {
  const fetchStub = stubBuiltinFetch({ apps: [builtinRow('app_x', '不该出现')] }, { ok: false })
  const page = await mountPage()
  try {
    await openAppsTab(page.act, page.container)
    assert.equal(cardEls(page.container).length, 0)
    assert.match(page.container.textContent, /官方内置应用暂时读取失败/)
    assert.match(page.container.textContent, /还没有 AI 应用/, '两边都空时仍给真空态')
  } finally {
    fetchStub.restore()
    await page.teardown()
  }
})

// ── 创作页打开链路：点击即时反馈 + 重复点击拦截 ─────────────────────────────

test('点创作页卡片：打开期间显示「打开中」并忽略重复点击，结束后复位可再次打开', async () => {
  const projects = [{
    id: 'proj_open',
    title: '项目一',
    path: '/tmp/proj_open',
    canvasWorkspaceIds: ['ws_page_open'],
    pages: [{ id: 'page_open', title: '创作页 1', canvasWorkspaceId: 'ws_page_open', createdAt: '2026-09-10T00:00:00.000Z' }],
  }]
  const pendingSessions = []
  globalThis.__testCreateSession = () => new Promise((resolve) => { pendingSessions.push(resolve) })
  globalThis.__testSessionCwd = '/tmp/other-workspace'
  const previousIntersectionObserver = globalThis.IntersectionObserver
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const opened = []
  const sidebar = {
    getTab: (id) => ({ id }),
    getSnapshot: () => ({
      sessionId: 'sess_open',
      state: { splits: { kind: 'leaf', tabs: [] }, bottomSplits: { kind: 'leaf', tabs: [] } },
    }),
    openTab: (seed, scope) => opened.push({ seed, scope }),
    updateTab() {},
    closeTab() {},
  }
  const page = await mountPage({ sidebar, t: () => undefined, projects })
  try {
    const folderOpen = page.container.querySelector('.omnimux-folder-open')
    assert.ok(folderOpen, '项目文件夹卡片必须可打开')
    await page.act(async () => { folderOpen.click() })
    await page.act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
    assert.ok(page.container.querySelector('.omnimux-page-card'), '项目详情必须展示创作页卡片')

    // 会话创建卡住期间：打开中遮罩出现，且同一帧的第二次点击被同步闸门拦下
    await page.act(async () => {
      const card = page.container.querySelector('.omnimux-page-card')
      card.click()
      card.click()
    })
    assert.equal(pendingSessions.length, 1, '重复点击不得发起第二次打开')
    const mask = page.container.querySelector('.omnimux-page-card-opening')
    assert.ok(mask, '打开期间必须显示「打开中」遮罩')
    assert.match(mask.textContent, /打开中/)
    assert.equal(opened.length, 0, '会话未就绪前不得先开画布 tab')

    // 会话就绪 → 画布 tab 打开且遮罩复位
    await page.act(async () => {
      pendingSessions[0]('sess_open')
      await new Promise((resolve) => { setTimeout(resolve, 0) })
    })
    assert.equal(page.container.querySelector('.omnimux-page-card-opening'), null, '打开结束必须复位「打开中」')
    assert.equal(opened.length, 1)
    assert.equal(opened[0].seed.id, 'omnimux-workflow:canvas')
    assert.equal(opened[0].scope.sessionId, 'sess_open')

    // 复位后可以再次打开
    await page.act(async () => { page.container.querySelector('.omnimux-page-card').click() })
    assert.equal(pendingSessions.length, 2, '复位后必须能再次打开')
    await page.act(async () => {
      pendingSessions[1]('sess_open')
      await new Promise((resolve) => { setTimeout(resolve, 0) })
    })
    assert.equal(opened.length, 2)
  } finally {
    delete globalThis.__testCreateSession
    delete globalThis.__testSessionCwd
    if (previousIntersectionObserver === undefined) delete globalThis.IntersectionObserver
    else globalThis.IntersectionObserver = previousIntersectionObserver
    await page.teardown()
  }
})

test('点创作页卡片：画布被宿主拒绝时页面给出可见错误（Issue #3928）', async () => {
  const projects = [{
    id: 'proj_deny',
    title: '项目拒绝',
    path: '/tmp/proj_deny',
    sessionId: 'sess_deny',
    pages: [{ id: 'page_deny', title: '创作页 1', canvasWorkspaceId: 'ws_deny', createdAt: '2026-09-10T00:00:00.000Z' }],
  }]
  const previousIntersectionObserver = globalThis.IntersectionObserver
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const sidebar = {
    getTab: (id) => ({ id }),
    getSnapshot: () => ({
      sessionId: 'sess_deny',
      state: { splits: { kind: 'leaf', tabs: [] }, bottomSplits: { kind: 'leaf', tabs: [] } },
    }),
    openTab: () => { throw new Error('sidebarRight: no session surface is mounted') },
    updateTab() {},
    closeTab() {},
  }
  const page = await mountPage({ sidebar, t: () => undefined, projects })
  try {
    const folderOpen = page.container.querySelector('.omnimux-folder-open')
    await page.act(async () => { folderOpen.click() })
    await page.act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
    await page.act(async () => { page.container.querySelector('.omnimux-page-card').click() })
    await page.act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })

    const banner = page.container.querySelector('.omnimux-workflow-library-error')
    assert.ok(banner, '画布没打开必须出现页面错误横幅')
    assert.match(banner.textContent, /无法打开创作画布/)
  } finally {
    if (previousIntersectionObserver === undefined) delete globalThis.IntersectionObserver
    else globalThis.IntersectionObserver = previousIntersectionObserver
    await page.teardown()
  }
})

test('新建项目成功但画布未打开时，项目库页给出可见错误（Issue #3928）', async () => {
  const previousIntersectionObserver = globalThis.IntersectionObserver
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.__testRunNewProject = async () => ({ ok: true, canvasOpened: false })
  const page = await mountPage({ sidebar: null, t: () => undefined, projects: [] })
  try {
    const newButton = [...page.container.querySelectorAll('button')]
      .find((node) => node.textContent.includes('新建项目'))
    assert.ok(newButton, '空态必须有新建项目入口')
    await page.act(async () => { newButton.click() })
    await page.act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })

    const input = document.querySelector('#omnimux-new-local-project-name')
    assert.ok(input, '创建项目弹窗必须出现名称输入框')
    await page.act(async () => {
      // React 会在实例上接管 value 的 tracker：先写值，再把 tracker 回落，change 事件才会被 onChange 接收。
      input.value = '画布未开验收'
      input._valueTracker?.setValue?.('')
      input.dispatchEvent(new page.dom.window.Event('change', { bubbles: true }))
    })
    const submit = document.querySelector('.omnimux-workflow-dialog-footer button:last-child')
    assert.ok(submit, '创建项目弹窗必须提交按钮')
    await page.act(async () => { submit.click() })
    await page.act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })

    const banner = page.container.querySelector('.omnimux-workflow-library-error')
    assert.ok(banner, '项目建成但画布没开时必须出现可见错误: ' + document.body.textContent.slice(0, 400))
    assert.match(banner.textContent, /创作画布未能打开/)
  } finally {
    delete globalThis.__testRunNewProject
    if (previousIntersectionObserver === undefined) delete globalThis.IntersectionObserver
    else globalThis.IntersectionObserver = previousIntersectionObserver
    await page.teardown()
  }
})
