/**
 * 「项目」页「AI应用」分类的端到端旅程（Issue #1964）。
 *
 * 与 `src/client/projects/projectLibraryPage.apps.test.mjs` 的分工：
 * 单测逐个钉契约，本文件把 7 条用户旅程**按真实顺序连成一次会话**跑完，
 * 断言跨步骤才成立的连续性（切分类→空态→播种→网格→过滤→开标签页→菜单→
 * 删除（取消/确认）→编辑回画布），并只使用「工作树隔离 Web 预演」中实测到的
 * 定位器与 DOM 结构（见 docs/evidence/ai-app-library-journeys.json）：
 *
 *   - 分类栏：`.omnimux-workflow-library-filter [role="tab"]`，三项，第二项 disabled
 *   - 卡片：`.dshUk-MediaCard-card.omnimux-workflow-app-card[role="button"]`
 *   - 更多：`button[aria-label=...][aria-haspopup="menu"][aria-expanded]`
 *   - 菜单：`document.body` 下的 `[role="menu"]`（portal），项为 `[role="menuitem"]`
 *   - 二次确认：`.dshUk-Dialog-dialog`，按钮文案来自真实字典
 *   - 空态：`.omnimux-workflow-library-empty-title` / `-empty-sub`
 *   - 数据源：`localStorage['omnimux_apps_manifests']`；应用标签页 id `app_<appId>`
 *
 * 运行：`node --test tests/ai-app-library.e2e.test.mjs`（已并入包内 `test` 脚本）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zh } from '../src/client/locales.js'
import { APP_MANIFESTS_STORAGE_KEY, APP_TAB_ID_PREFIX } from '../src/client/projects/appLibrary.js'

const require = createRequire(import.meta.url)
const React = require('react')
const here = dirname(fileURLToPath(import.meta.url))

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
    absWorkingDir: resolve(here, '..'),
    entryPoints: [resolve(here, '..', 'src', 'client', 'projects', 'ProjectLibraryPage.jsx')],
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

/** 侧栏服务桩：记录 openTab / closeTab / updateTab，并可回答 getTab / getSnapshot。 */
function makeSidebar() {
  const opened = []
  const closed = []
  const updated = []
  return {
    opened,
    closed,
    updated,
    getTab: (id) => ({ id }),
    // 形状对齐实测的侧栏快照：{ sessionId, state, prefs }
    getSnapshot: () => ({ sessionId: 'sess-1', state: { splits: { kind: 'leaf', tabs: [] }, bottomSplits: { kind: 'leaf', tabs: [] } }, prefs: {} }),
    openTab: (seed, scope) => opened.push({ seed, scope }),
    updateTab: (id, patch) => updated.push({ id, patch }),
    closeTab: (id) => closed.push(id),
  }
}

async function mountPage({ sidebar, t = (key) => zh[key] || key } = {}) {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' })
  const defineGlobal = (name, value) => Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })
  defineGlobal('window', dom.window)
  defineGlobal('document', dom.window.document)
  defineGlobal('navigator', dom.window.navigator)
  defineGlobal('localStorage', dom.window.localStorage)
  defineGlobal('CustomEvent', dom.window.CustomEvent)
  defineGlobal('Event', dom.window.Event)
  defineGlobal('MouseEvent', dom.window.MouseEvent)
  defineGlobal('KeyboardEvent', dom.window.KeyboardEvent)
  defineGlobal('PointerEvent', dom.window.PointerEvent || dom.window.MouseEvent)
  // jsdom 不实现观察器 API，真实浏览器里有；按最小契约补空实现，不改变组件行为。
  class ObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  defineGlobal('IntersectionObserver', ObserverStub)
  defineGlobal('ResizeObserver', ObserverStub)
  // 画布 tab 的比例逻辑会直接取这些宿主构造器 / 度量函数。
  defineGlobal('HTMLElement', dom.window.HTMLElement)
  defineGlobal('Element', dom.window.Element)
  defineGlobal('Node', dom.window.Node)
  defineGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window))
  defineGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window))
  defineGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.__testProjects = [{ id: 'proj_alpha', title: '项目甲', canvasWorkspaceIds: ['ws_alpha'], pages: [] }]
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
      sessions: { create: async () => ({ id: 'sess-1' }), open() {} },
      workspaces: {},
      layout: { closeDetails() {} },
      betterSidebar: sidebar,
    }))
  })
  await act(async () => { await Promise.resolve() })
  return {
    dom,
    act,
    container,
    async teardown() {
      await act(async () => root.unmount())
      dom.window.close()
      for (const name of ['window', 'document', 'localStorage', 'CustomEvent', 'Event', 'MouseEvent', 'KeyboardEvent', 'PointerEvent']) delete globalThis[name]
      delete globalThis.__testProjects
    },
  }
}

const manifestRow = (appId, name, createdAt, binding = {}) => ({
  appId,
  version: '0.1.0',
  createdAt,
  metadata: { name, category: 'video', description: `${name} 的描述` },
  workflowBinding: { workspaceId: `ws_${appId}`, projectId: '', sourceGroupId: '', ...binding },
})

const cardEls = (container) => [...container.querySelectorAll('.omnimux-workflow-app-card')]
const categoryTabs = (container) => [...container.querySelectorAll('.omnimux-workflow-library-filter [role="tab"]')]
const menuEl = () => document.querySelector('[role="menu"]')
const menuItemEls = () => [...document.querySelectorAll('[role="menuitem"]')]
const dialogEl = () => document.querySelector('.dshUk-Dialog-dialog')
const dialogButton = (label) => [...(dialogEl()?.querySelectorAll('button') || [])].find((b) => b.textContent.trim() === label)
const moreButton = (container, index = 0) => [...container.querySelectorAll('[aria-label="更多操作"]')][index]
const searchInput = (container) => container.querySelector('.omnimux-workflow-library-filter input')
const CATEGORY_LABELS = [
  zh['projects.appCategoryVideo'],
  zh['projects.appCategoryImage'],
  zh['projects.appCategoryAudio'],
  zh['projects.appCategoryUnknown'],
]
/** 卡片文本 = 应用名 + 分类副标题；去掉真实字典里的副标题即得应用名。 */
const cardName = (card) => {
  let text = card.textContent.trim()
  for (const label of CATEGORY_LABELS) if (text.endsWith(label)) text = text.slice(0, -label.length)
  return text.trim()
}

/** 真实输入：受控 SearchField 只吃 input 事件。 */
async function typeSearch(act, container, value) {
  const input = searchInput(container)
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(globalThis.window.HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }))
  })
  await act(async () => { await Promise.resolve() })
}

test('旅程 1→7：一次会话走完分类切换、空态、网格、过滤、开标签页、菜单、删除与编辑', async () => {
  const sidebar = makeSidebar()
  const page = await mountPage({ sidebar })
  try {
    // ── 旅程 1：顶层分类栏三项，顺序为 本地项目 → 共创项目（即将上线）→ AI应用
    const tabs = categoryTabs(page.container)
    assert.deepEqual(tabs.map((tab) => tab.textContent.trim()), ['本地项目', '共创项目（即将上线）', 'AI应用'])
    assert.equal(tabs[1].disabled, true, '「共创项目（即将上线）」保持禁用')
    assert.equal(tabs[2].disabled, false, '「AI应用」必须可切换')
    assert.equal(searchInput(page.container).placeholder, zh['projects.searchPlaceholder'])

    // ── 旅程 2a：无数据时是真实空态（不伪造卡片）
    await page.act(async () => tabs[2].click())
    assert.equal(cardEls(page.container).length, 0)
    const empty = page.container.querySelector('.omnimux-workflow-library-empty')
    assert.ok(empty, '无数据必须渲染空态容器')
    assert.equal(empty.querySelector('.omnimux-workflow-library-empty-title').textContent.trim(), zh['projects.appsEmptyTitle'])
    assert.equal(empty.querySelector('.omnimux-workflow-library-empty-sub').textContent.trim(), zh['projects.appsEmptySubtitle'])

    // ── 旅程 2b：清单有数据时渲染网格，新 → 旧
    globalThis.window.localStorage.setItem(APP_MANIFESTS_STORAGE_KEY, JSON.stringify({
      app_demo_video_001: manifestRow('app_demo_video_001', '爆款复刻助手', '2026-09-15T10:00:00.000Z', { projectId: 'proj_alpha', workspaceId: 'ws_alpha', sourceGroupId: 'group_demo_1' }),
      app_demo_image_002: manifestRow('app_demo_image_002', '商品图生成器', '2026-09-15T12:30:00.000Z', { category: 'image' }),
    }))
    await page.act(async () => categoryTabs(page.container)[0].click())
    await page.act(async () => categoryTabs(page.container)[2].click())
    let cards = cardEls(page.container)
    assert.equal(cards.length, 2, '两张卡片必须来自真实存储键')
    assert.deepEqual(cards.map(cardName), ['商品图生成器', '爆款复刻助手'], '按 createdAt 倒序')
    assert.equal(page.container.querySelectorAll('.omnimux-workflow-grid').length, 1, '复用既有网格容器')
    for (const card of cards) {
      assert.equal(card.getAttribute('role'), 'button', '整卡可点击（role=button）')
      assert.ok(card.getBoundingClientRect, '卡片必须是真实 DOM 元素')
    }

    // ── 旅程 7：搜索框按应用名过滤（同一分类下）
    await typeSearch(page.act, page.container, '爆款')
    assert.deepEqual(cardEls(page.container).map(cardName), ['爆款复刻助手'])
    await typeSearch(page.act, page.container, '商品')
    assert.deepEqual(cardEls(page.container).map(cardName), ['商品图生成器'])
    await typeSearch(page.act, page.container, '不存在的应用')
    assert.equal(cardEls(page.container).length, 0)
    assert.ok(page.container.querySelector('.omnimux-workflow-library-empty'), '过滤无结果回落真实空态')
    await typeSearch(page.act, page.container, '')
    assert.equal(cardEls(page.container).length, 2, '清空搜索后恢复全部结果')

    // ── 旅程 3：点卡片 → 右侧栏打开应用标签页（id 契约 app_<appId>，标题为应用名）
    cards = cardEls(page.container)
    const openedCardName = cardName(cards[0])
    await page.act(async () => cards[0].click())
    const appOpen = sidebar.opened.find((entry) => String(entry.seed.id).startsWith(APP_TAB_ID_PREFIX))
    assert.ok(appOpen, '点卡片必须调用侧栏 openTab')
    assert.equal(appOpen.seed.id, `${APP_TAB_ID_PREFIX}app_demo_image_002`, '标签页 id 必须是 app_<appId>')
    assert.equal(appOpen.seed.title, openedCardName, '标签页标题必须是应用名')

    // ── 旅程 4：卡片「⋯」→ 菜单含「编辑」「删除」
    await page.act(async () => moreButton(page.container, 0).click())
    const trigger = moreButton(page.container, 0)
    assert.equal(trigger.getAttribute('aria-haspopup'), 'menu')
    assert.equal(trigger.getAttribute('aria-expanded'), 'true', '展开状态必须回写到触发器')
    assert.ok(menuEl(), '菜单必须渲染（portal 到 body）')
    assert.deepEqual(menuItemEls().map((item) => item.textContent.trim()), [zh['projects.appEdit'], zh['projects.appDelete']])
    assert.match(String(menuItemEls()[1].className), /danger/, '「删除」是危险项')

    // ── 旅程 5a：删除 → 二次确认 → 取消则卡片保留
    await page.act(async () => menuItemEls()[1].click())
    assert.ok(dialogEl(), '删除必须走二次确认弹窗')
    assert.match(dialogEl().textContent, /商品图生成器/, '确认文案必须点名应用名')
    await page.act(async () => dialogButton(zh['projects.dialog.cancel']).click())
    assert.equal(dialogEl(), null, '取消后弹窗关闭')
    assert.equal(cardEls(page.container).length, 2, '取消不得删除卡片')
    assert.deepEqual(
      Object.keys(JSON.parse(globalThis.window.localStorage.getItem(APP_MANIFESTS_STORAGE_KEY))).sort(),
      ['app_demo_image_002', 'app_demo_video_001'],
      '取消不得改动存储',
    )
    assert.deepEqual(sidebar.closed, [], '取消不得关闭任何标签页')

    // ── 旅程 5b：确认删除 → 卡片消失 + 记录移除 + 应用标签页关闭
    await page.act(async () => moreButton(page.container, 0).click())
    await page.act(async () => menuItemEls()[1].click())
    await page.act(async () => dialogButton(zh['projects.appDelete']).click())
    await page.act(async () => { await Promise.resolve() })
    assert.equal(cardEls(page.container).length, 1, '确认后卡片从列表消失')
    assert.deepEqual(cardEls(page.container).map(cardName), ['爆款复刻助手'])
    assert.deepEqual(Object.keys(JSON.parse(globalThis.window.localStorage.getItem(APP_MANIFESTS_STORAGE_KEY))), ['app_demo_video_001'])
    assert.deepEqual(sidebar.closed, [`${APP_TAB_ID_PREFIX}app_demo_image_002`], '确认后按 app_<appId> 关闭该应用标签页')
    assert.equal(page.container.querySelectorAll('.omnimux-workflow-library-error').length, 0, '成功路径不得报错')

    // ── 旅程 6：编辑 → 打开所属项目画布，并把发布时的工作流组写进 tab meta
    await page.act(async () => moreButton(page.container, 0).click())
    await page.act(async () => menuItemEls()[0].click())
    // 「编辑」要等建会话 + 画布 tab 注册的异步链落地
    await page.act(async () => { await new Promise((done) => setTimeout(done, 50)) })
    const canvasOpen = sidebar.opened.find((entry) => entry.seed.id === 'omnimux-workflow:canvas')
    assert.ok(canvasOpen, '「编辑」必须打开创作画布标签页')
    assert.deepEqual(sidebar.updated, [{ id: 'omnimux-workflow:canvas', patch: { meta: { focusGroupId: 'group_demo_1' } } }], '必须把工作流组 id 写进画布 tab meta')
    assert.equal(cardEls(page.container).length, 1, '「编辑」不得改动列表')
  } finally {
    await page.teardown()
  }
})

test('旅程 2 负向：清单损坏时回落真实空态，存储不可用时才是真实错误', async () => {
  const page = await mountPage({ sidebar: makeSidebar() })
  try {
    // 损坏清单：按 appLibrary 契约返回空映射 → 真实空态，不是错误
    globalThis.window.localStorage.setItem(APP_MANIFESTS_STORAGE_KEY, '{ not json')
    await page.act(async () => categoryTabs(page.container)[2].click())
    assert.equal(cardEls(page.container).length, 0)
    assert.ok(page.container.querySelector('.omnimux-workflow-library-empty'), '损坏清单回落真实空态')
    assert.equal(page.container.querySelectorAll('.omnimux-workflow-library-error').length, 0, '空态不得冒充错误')

    // 存储不可用：真实错误文案，且不渲染卡片
    const original = globalThis.window.localStorage
    Object.defineProperty(globalThis, 'localStorage', { value: null, writable: true, configurable: true })
    try {
      await page.act(async () => categoryTabs(page.container)[0].click())
      await page.act(async () => categoryTabs(page.container)[2].click())
      assert.equal(cardEls(page.container).length, 0)
      const errors = [...page.container.querySelectorAll('.omnimux-workflow-library-error')].map((el) => el.textContent.trim())
      assert.deepEqual(errors, [zh['projects.appStorageUnavailable']], '存储不可用必须报真实错误')
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: original, writable: true, configurable: true })
    }
  } finally {
    await page.teardown()
  }
})
