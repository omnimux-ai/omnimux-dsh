/**
 * 「项目」页「AI应用」卡片（AIAppCard）的行为契约。
 *
 * 与 ProjectFolderCard.menu.test.mjs 同样是真实 DOM 测试：组件用真实
 * `dsh-ui-kit` 的 `MediaCard` 与官方 primitives 的 `Menu` 打包（只有 CSS
 * 走空桩，Node 无法 import CSS），断言的是组件库真实渲染出的结构与事件，
 * 不是自定义 seam 的自说自话。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const React = require('react')
const here = dirname(fileURLToPath(import.meta.url))

/** 官方 CSS Modules 产物无法在 Node 直接 import；空桩把类名按 key 回读。 */
const CSS_STUB = 'export default new Proxy({}, { get: (_t, k) => (typeof k === "string" ? k : undefined) })'

async function loadCard() {
  const result = await build({
    absWorkingDir: resolve(here, '..', '..', '..'),
    entryPoints: [resolve(here, 'AIAppCard.jsx')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/client'],
    logLevel: 'silent',
    plugins: [{
      name: 'css-stub',
      setup(builder) {
        builder.onLoad({ filter: /\.css$/ }, () => ({ contents: CSS_STUB, loader: 'js' }))
      },
    }],
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports)
  return mod.exports.AIAppCard
}

const APP = Object.freeze({
  appId: 'app_marketing_1',
  name: '营销短片',
  category: 'video',
  coverUrl: '',
})

async function mountCard(overrides = {}) {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true })
  for (const [name, value] of [['window', dom.window], ['document', dom.window.document], ['navigator', dom.window.navigator]]) {
    Object.defineProperty(global, name, { value, writable: true, configurable: true })
  }
  if (!dom.window.PointerEvent) dom.window.PointerEvent = dom.window.MouseEvent
  global.PointerEvent = dom.window.PointerEvent
  global.IS_REACT_ACT_ENVIRONMENT = true

  const calls = { open: [], edit: [], delete: [] }
  const reactDomClient = require('react-dom/client')
  const { act } = require('react')
  const AIAppCard = await loadCard()

  const container = document.getElementById('root')
  const root = reactDomClient.createRoot(container)
  await act(async () => {
    root.render(React.createElement(AIAppCard, {
      app: APP,
      t: (key) => key,
      onOpen: (app) => calls.open.push(app),
      onEdit: (app) => calls.edit.push(app),
      onDelete: (app) => calls.delete.push(app),
      ...overrides,
    }))
  })
  return { dom, act, container, root, calls }
}

/** `Menu` 走 portal，列表挂在 document.body 上，卡片容器里查不到。 */
const menuItems = () => [...document.querySelectorAll('[role="menuitem"]')]

test('「更多」按钮是 IconButton + aria-haspopup="menu"，开合同步 aria-expanded', async () => {
  const { dom, act, container, root } = await mountCard()
  try {
    const trigger = container.querySelector('[aria-haspopup="menu"]')
    assert.ok(trigger, '缺少「更多」触发器')
    assert.equal(trigger.getAttribute('aria-label'), 'projects.appMore')
    assert.equal(trigger.getAttribute('aria-expanded'), 'false')
    assert.equal(menuItems().length, 0, '未展开时不应有菜单项')

    await act(async () => trigger.click())
    assert.equal(trigger.getAttribute('aria-expanded'), 'true')
    assert.equal(container.querySelectorAll('[aria-haspopup="menu"]').length, 1, '卡片上只应有一个「更多」入口')
  } finally { await act(async () => root.unmount()); dom.window.close() }
})

test('菜单恰好两项：「编辑」与「删除」，且删除项为危险态', async () => {
  const { dom, act, container, root } = await mountCard()
  try {
    await act(async () => container.querySelector('[aria-haspopup="menu"]').click())
    const items = menuItems()
    assert.equal(items.length, 2, '菜单必须恰好两项，不多不少')
    assert.deepEqual(items.map((item) => item.textContent.trim()), ['projects.appEdit', 'projects.appDelete'])

    const dangerClasses = items[1].className.split(/\s+/)
    assert.ok(
      dangerClasses.includes('danger'),
      `删除项必须带危险态，实际类名：${items[1].className}`,
    )
    const safeClasses = items[0].className.split(/\s+/)
    assert.equal(safeClasses.includes('danger'), false, '编辑项不得是危险态')
  } finally { await act(async () => root.unmount()); dom.window.close() }
})

test('点「更多」只开菜单，不触发卡片打开；点菜单项走编辑/删除而不是打开应用', async () => {
  const { dom, act, container, root, calls } = await mountCard()
  try {
    await act(async () => container.querySelector('[aria-haspopup="menu"]').click())
    assert.equal(calls.open.length, 0, '点「更多」不得打开应用标签页')

    await act(async () => menuItems()[0].click())
    assert.deepEqual(calls.edit, [APP], '「编辑」必须回调 onEdit 并带上原应用')
    assert.equal(calls.open.length, 0, '「编辑」不得顺带打开应用')
    assert.equal(menuItems().length, 0, '选择后菜单应关闭')

    await act(async () => container.querySelector('[aria-haspopup="menu"]').click())
    await act(async () => menuItems()[1].click())
    assert.deepEqual(calls.delete, [APP], '「删除」必须回调 onDelete 并带上原应用')
    assert.equal(calls.open.length, 0, '「删除」不得顺带打开应用')
  } finally { await act(async () => root.unmount()); dom.window.close() }
})

test('整卡点击打开应用，且卡片展示应用名与分类文案键', async () => {
  const { dom, act, container, root, calls } = await mountCard()
  try {
    assert.match(container.textContent, /营销短片/)
    assert.match(container.textContent, /projects\.appCategoryVideo/)

    const card = container.firstElementChild
    assert.equal(card?.getAttribute('role'), 'button', '可点击卡片必须可聚焦可回车触发')
    await act(async () => card.click())
    assert.deepEqual(calls.open, [APP])
    assert.equal(calls.edit.length + calls.delete.length, 0)
  } finally { await act(async () => root.unmount()); dom.window.close() }
})

test('卡片不新增自造皮肤与裸色：类名走既有卡片契约，无内联颜色', async () => {
  const { dom, act, container, root } = await mountCard()
  try {
    const card = container.firstElementChild
    assert.ok(
      card.className.split(/\s+/).includes('omnimux-workflow-app-card'),
      'AI 应用卡片必须挂既有卡片类名，便于库页网格统一排布',
    )
    assert.equal(card.getAttribute('style'), null, '卡片不得用内联样式表达外观')
    assert.doesNotMatch(container.innerHTML, /#[0-9a-fA-F]{3,8}\b/, '卡片不得出现裸色硬编码')
  } finally { await act(async () => root.unmount()); dom.window.close() }
})
