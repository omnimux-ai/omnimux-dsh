import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { build } from 'esbuild'
import { createProductsDispatcher } from '../http-routes.js'
import { createLibraryStore } from '../library.js'
import { buildPayload, getInitialMedia } from './useProductFormState.js'

// Run the production stage, grid, and API against the real dispatcher. Only
// React's rendering hooks and unrelated visual components are substituted.
const stubs = {
  'omnimux-products/ui': `export function injectProductsStyles() {}
export function ProductFormPage() {}
export function deliverProductReference() { return Promise.resolve() }
export const zh = {}
export const en = {}
export const NS = 'omnimux-products'
export { ProductGrid } from './ProductGrid.jsx'
export { CreateProductMenu } from './CreateProductMenu.jsx'
export * from './api.js'
export { ChatIcon } from './icons.jsx'`,
}
const bundle = await build({
  // 产品库宿主已并入资产库：被测对象改为 ProductTab（产品 UI 仍取本插件的生产源码）。
  entryPoints: [fileURLToPath(new URL('../../../omnimux-assets/src/client/ProductTab.jsx', import.meta.url))],
  bundle: true, write: false, format: 'cjs', platform: 'browser', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'dsh-ui-kit'],
  plugins: [{ name: 'visual-boundaries', setup(ctx) {
    ctx.onResolve({ filter: /.*/ }, ({ path }) => Object.hasOwn(stubs, path) ? { path, namespace: 'stub' } : undefined)
    ctx.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({
      contents: stubs[path], loader: 'jsx',
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    }))
  } }], logLevel: 'silent',
})

const gridBundle = await build({
  entryPoints: [fileURLToPath(new URL('./ProductGrid.jsx', import.meta.url))],
  bundle: true, write: false, format: 'cjs', platform: 'browser', jsx: 'automatic',
  external: ['dsh-ui-kit'],
  logLevel: 'silent',
})
const gridContext = {
  module: { exports: {} },
  require(name) {
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
    if (name === 'dsh-ui-kit') return { Button: 'Button', IconButton: 'IconButton' }
    throw new Error(`unexpected dependency ${name}`)
  },
}
runInNewContext(gridBundle.outputFiles[0].text, gridContext)
const { ProductGrid } = gridContext.module.exports

function find(tree, matches) {
  if (!tree || typeof tree !== 'object') return null
  if (matches(tree)) return tree
  for (const child of [tree.props?.children].flat(Infinity)) {
    const found = find(child, matches)
    if (found) return found
  }
  return null
}

function mount(dispatcher, overrides = {}) {
  const hooks = []
  let pendingEffects = []
  let liveCleanups = []
  let index = 0
  let mounted = false
  const react = {
    useState(initial) {
      const slot = index++
      if (!mounted) hooks[slot] = typeof initial === 'function' ? initial() : initial
      return [hooks[slot], next => { hooks[slot] = typeof next === 'function' ? next(hooks[slot]) : next }]
    },
    useRef(initial) {
      const slot = index++
      if (!mounted) hooks[slot] = { current: initial }
      return hooks[slot]
    },
    useEffect(effect) { pendingEffects.push(effect) },
    useCallback(callback) { return callback },
  }
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
      if (name === 'dsh-ui-kit') return { Button: 'Button', IconButton: 'IconButton', PageHeader: 'PageHeader', FilterBar: 'FilterBar', SearchField: 'SearchField', Tabs: 'Tabs', Divider: 'Divider' }
      throw new Error(`unexpected dependency ${name}`)
    },
    fetch: async (url, opts) => {
      const result = await dispatcher.dispatch({ method: opts.method, url, body: opts.body ? JSON.parse(opts.body) : undefined })
      return { ok: result.status >= 200 && result.status < 300, status: result.status, json: async () => result.body }
    },
    setInterval: fn => { intervalCallback = fn; return 1 }, clearInterval() {}, setTimeout, URLSearchParams,
  }
  let intervalCallback = null
  runInNewContext(bundle.outputFiles[0].text, context)
  // 二级页由资产库 Stage 根渲染，ProductTab 只上报视图；按 AssetsStage 的真实映射
  // （product→initial、error→serverError）合成同形节点，断言原文一律不动。
  let reportedView = null
  const render = (runEffects = true) => {
    index = 0
    pendingEffects = []
    const tree = context.module.exports.ProductTab({
      t: key => key, visible: true, query: '', kindTab: 'all',
      ...overrides,
      onViewChange: (next) => { reportedView = next },
    })
    mounted = true
    if (runEffects) {
      liveCleanups = pendingEffects.map((effect) => effect()).filter((c) => typeof c === 'function')
    }
    if (!reportedView) return tree
    return {
      type: 'Root',
      props: {
        children: [tree, {
          type: 'ProductFormPage',
          props: {
            name: reportedView.name,
            kind: reportedView.kind,
            mode: reportedView.mode,
            initial: reportedView.product,
            serverError: reportedView.error,
            saving: reportedView.saving,
            onSubmit: reportedView.onSubmit,
            onLeave: reportedView.onLeave,
            onPick: reportedView.onPick,
          },
        }],
      },
    }
  }
  render()
  return {
    render,
    flush: async () => {
      // 只推进状态与视图上报，**不重跑 effect**：ProductTab 的轮询 effect 会调
      // refreshState → setError('')，把待断言的错误条清掉（真实 React 里该 effect
      // 只在 visible/refreshState 变化时重跑，不会每轮都跑）。
      for (let i = 0; i < 8; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10))
        render(false)
      }
    },
    refresh: () => intervalCallback?.(),
    props: () => ({ t: (k) => k, visible: true, query: '', kindTab: 'all', ...overrides }),
    setIntent: (next) => { overrides.intent = next },
    unmount: () => { for (const cleanup of liveCleanups) cleanup() },
  }
}

async function withStore(run) {
  const root = mkdtempSync(join(tmpdir(), 'products-stage-'))
  try {
    const realPath = join(root, 'hero.png')
    writeFileSync(realPath, 'png')
    const library = createLibraryStore({ paths: { libraryFile: join(root, 'library.json') } })
    const dispatcher = createProductsDispatcher({ library })
    await run({ library, dispatcher, realPath })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const component = name => node => (node.type?.name ?? node.type) === name

/**
 * 列表页的创建入口是一个悬停分流菜单：它自己不开表单，只把选中的形态交给宿主。
 * 测试沿同一条路径驱动 —— 找到菜单元素，调用它的 `onSelect`。
 */
function openCreate(mounted, kind = 'physical') {
  // 新建入口的动作行由资产库宿主渲染；ProductTab 通过 `intent` 接收同一意图。
  const menu = typeof mounted.setIntent === 'function' ? { props: { onSelect: (k) => mounted.setIntent({ mode: 'create', kind: k, nonce: Date.now() }) } } : null
  assert.ok(menu, 'the create split menu is rendered')
  menu.props.onSelect(kind)
  return mounted.render()
}

test('stage loads actual state response, opens complete media details and saves without losing references', async () => {
  await withStore(async ({ library, dispatcher, realPath }) => {
    const product = library.add({ name: '原商品', media: [{ real_path: realPath }], price: '99' })
    const mounted = mount(dispatcher)
    await mounted.flush()
    const grid = find(mounted.render(), component('ProductGrid'))
    assert.equal(grid.props.products.length, 1)
    assert.equal(grid.props.products[0].id, product.id)
    assert.equal(grid.props.products[0].media, undefined, 'state rows are compact list views')

    grid.props.onOpen({ id: product.id, kind: product.kind })
    await mounted.flush()
    await mounted.flush()
    const page = find(mounted.render(), component('ProductFormPage'))
    assert.equal(page.props.mode, 'edit')
    assert.equal(page.props.initial.media[0].real_path, realPath)
    await page.props.onSubmit({ name: '修改商品', price: '199', media: page.props.initial.media })
    await mounted.flush()
    assert.equal(find(mounted.render(), component('ProductFormPage')), null)
    assert.equal(library.get(product.id).media[0].real_path, realPath)
    assert.equal(find(mounted.render(), component('ProductGrid')).props.products[0].name, '修改商品')
  })
})

test('the list view stays mounted behind the sub-screen so filters survive the round trip', async () => {
  await withStore(async ({ library, dispatcher }) => {
    library.add({ name: '实体商品', kind: 'physical' })
    library.add({ name: '数字产品', kind: 'digital' })
    const mounted = mount(dispatcher)
    await mounted.flush()

    // 先筛成只剩数字产品，再进二级页 —— 返回后筛选必须原样还在。
    const filtered = mount(dispatcher, { kindTab: 'digital' })
    await filtered.flush()
    const filteredCount = find(filtered.render(), component('ProductGrid')).props.products.length
    assert.equal(filteredCount, 1)

    openCreate(filtered, 'physical')
    await filtered.flush()
    const opened = filtered.render()
    const page = find(opened, component('ProductFormPage'))
    assert.equal(page.props.mode, 'create')
    assert.equal(page.props.kind, 'physical', 'the physical entry opens the physical form')
    // 列表子树没有被替换掉：它仍在树里，只是被覆盖层盖住。
    assert.ok(find(opened, component('ProductGrid')), 'the list view must stay mounted behind the sub-screen')
    assert.equal(
      find(opened, component('ProductGrid')).props.products.length,
      filteredCount,
      '列表数据在二级页打开期间保持不变',
    )

    find(opened, component('ProductFormPage')).props.onLeave()
    const closed = filtered.render()
    assert.equal(find(closed, component('ProductFormPage')), null)
    assert.equal(find(closed, component('ProductGrid')).props.products.length, filteredCount)
  })
})

test('failed detail request is visible and never opens an empty-media editor', async () => {
  await withStore(async ({ library, dispatcher }) => {
    const product = library.add({ name: '待删除商品' })
    const mounted = mount(dispatcher)
    await mounted.flush()
    const grid = find(mounted.render(), component('ProductGrid'))
    library.remove(product.id)
    grid.props.onOpen({ id: product.id, kind: product.kind })
    await mounted.flush()
    await mounted.flush()
    await mounted.flush()
    const tree = mounted.render()
    assert.equal(find(tree, component('ProductFormPage')), null)
    assert.equal(find(tree, node => node.props?.className === 'omnimux-products-error').props.children, 'product not found')
  })
})

test('empty response clears cards and exposes the grid create action', async () => {
  await withStore(async ({ library, dispatcher }) => {
    const product = library.add({ name: '待删除商品' })
    const mounted = mount(dispatcher)
    await mounted.flush()
    library.remove(product.id)
    mounted.refresh()
    await mounted.flush()
    const grid = find(mounted.render(), component('ProductGrid'))
    assert.equal(grid.props.products.length, 0)
    const empty = grid.type(grid.props)
    assert.equal(find(empty, node => node.type === 'p').props.children, 'empty.all')
    // AC-104：空状态的创建入口与动作行同源，都走同一个分流菜单。
    const menu = find(empty, component('CreateProductMenu'))
    assert.ok(menu, 'the empty state reuses the split menu')
    menu.props.onSelect('digital')
    const page = find(mounted.render(), component('ProductFormPage'))
    assert.equal(page.props.mode, 'create')
    assert.equal(page.props.kind, 'digital')
  })
})


// AC-401 / AC-402：卡片点击按产品自身的持久化形态路由，而不是跟当前筛选页签走。
for (const kind of ['physical', 'digital']) {
  test(`opening a ${kind} product card routes to the ${kind} form`, async () => {
    await withStore(async ({ library, dispatcher }) => {
      const product = library.add({ name: `${kind} 商品`, kind })
      const mounted = mount(dispatcher)
      await mounted.flush()
      const grid = find(mounted.render(), component('ProductGrid'))
      const row = grid.props.products.find((item) => item.id === product.id)
      await grid.props.onOpen(row)
      await mounted.flush()
      const page = find(mounted.render(), component('ProductFormPage'))
      assert.equal(page.props.mode, 'edit')
      assert.equal(page.props.kind, kind)
      assert.equal(page.props.initial.id, product.id)
      assert.equal(page.props.initial.kind, kind)
    })
  })
}

test('editing preserves a missing source reference and refuses a name-only save until the file is restored', async () => {
  await withStore(async ({ library, dispatcher, realPath }) => {
    const product = library.add({ name: '原商品', media: [{ real_path: realPath }] })
    const libraryFile = join(realPath, '..', 'library.json')
    const persisted = readFileSync(libraryFile, 'utf8')
    rmSync(realPath)
    const ordinary = await dispatcher.dispatch({ method: 'GET', url: `/omnimux/products/${product.id}` })
    assert.equal(ordinary.body.product.media.length, 0)
    const mounted = mount(dispatcher)
    await mounted.flush()
    const grid = find(mounted.render(), component('ProductGrid'))
    assert.equal(grid.props.products[0].media_count, 0)
    grid.props.onOpen(grid.props.products[0])
    await mounted.flush()
    await mounted.flush()
    const dialog = find(mounted.render(), component('ProductFormPage'))
    const initial = dialog.props.initial
    assert.equal(initial.media[0].real_path, realPath)
    const payload = buildPayload({
      name: '修改名称', kind: initial.kind, link: initial.link, categories: initial.categories,
      media: getInitialMedia(initial), coverId: initial.cover_media_id,
    })
    await dialog.props.onSubmit(payload)
    await mounted.flush()
    assert.match(find(mounted.render(), component('ProductFormPage')).props.serverError, /missing, not a file, or unreadable/)
    assert.equal(library.get(product.id).name, '原商品')
    assert.equal(library.get(product.id).media[0].real_path, realPath)
    assert.equal(library.revision(), 1)
    assert.equal(readFileSync(libraryFile, 'utf8'), persisted)
    writeFileSync(realPath, 'restored')
    assert.equal(library.getView(product.id).media[0].real_path, realPath)
    await find(mounted.render(), component('ProductFormPage')).props.onSubmit(payload)
    await mounted.flush()
    assert.equal(library.get(product.id).name, '修改名称')
    assert.equal(library.get(product.id).media[0].real_path, realPath)
    // 编辑保存走的是更新，不是新建：库里仍然只有一条记录。
    assert.equal(library.list().length, 1)
    // 保存成功即回列表：二级页卸载，列表子树还在。
    assert.equal(find(mounted.render(), component('ProductFormPage')), null)
    assert.ok(find(mounted.render(), component('ProductGrid')))
  })
})

function deferEditResponses(dispatcher) {
  const pending = []
  return {
    pending,
    async dispatch(req) {
      const response = await dispatcher.dispatch(req)
      if (!req.url.endsWith('?view=edit')) return response
      return new Promise((resolve, reject) => {
        pending.push({ resolve: () => resolve(response), reject })
      })
    },
  }
}

async function withDeferredEdits(run) {
  await withStore(async ({ library, dispatcher }) => {
    const a = library.add({ name: '商品A' })
    const b = library.add({ name: '商品B' })
    const delayed = deferEditResponses(dispatcher)
    const mounted = mount(delayed)
    await mounted.flush()
    const open = async product => {
      void find(mounted.render(), component('ProductGrid')).props.onOpen(product)
      await mounted.flush()
    }
    await run({ mounted, pending: delayed.pending, open, a, b })
  })
}

test('a slow A detail response cannot replace the faster B editor', async () => {
  await withDeferredEdits(async ({ mounted, pending, open, a, b }) => {
    await open(a)
    await open(b)
    pending[1].resolve()
    await mounted.flush()
    assert.equal(find(mounted.render(), component('ProductFormPage')).props.initial.id, b.id)
    pending[0].resolve()
    await mounted.flush()
    assert.equal(find(mounted.render(), component('ProductFormPage')).props.initial.id, b.id)
  })
})

test('closing an editor invalidates an older pending detail request', async () => {
  await withDeferredEdits(async ({ mounted, pending, open, a, b }) => {
    await open(a)
    await open(b)
    pending[1].resolve()
    await mounted.flush()
    find(mounted.render(), component('ProductFormPage')).props.onLeave()
    pending[0].resolve()
    await mounted.flush()
    assert.equal(find(mounted.render(), component('ProductFormPage')), null)
  })
})

test('creating a product invalidates pending edit responses', async () => {
  await withDeferredEdits(async ({ mounted, pending, open, a }) => {
    await open(a)
    openCreate(mounted, 'digital')
    pending[0].resolve()
    await mounted.flush()
    const dialog = find(mounted.render(), component('ProductFormPage'))
    assert.equal(dialog.props.mode, 'create')
    assert.equal(dialog.props.kind, 'digital')
    assert.equal(dialog.props.saving, false)
  })
})

// 关 Tab 与卸载都必须作废在路上的取数请求：迟到的响应不能回来改写已经打开的表单，
// 但表单本身不再被静默清空（关 Tab 顺带清空是旧形态最不可恢复的一处写法）。
for (const action of ['close', 'unmount']) {
  test(`${action} invalidates a pending detail request without wiping the open editor`, async () => {
    await withDeferredEdits(async ({ mounted, pending, open, a, b }) => {
      await open(a)
      await open(b)
      pending[1].resolve()
      await mounted.flush()
      const opened = find(mounted.render(), component('ProductFormPage'))
      assert.equal(opened.props.initial.id, b.id)
      mounted.unmount()
      pending[0].resolve()
      await mounted.flush()
      const after = find(mounted.render(), component('ProductFormPage'))
      assert.equal(after.props.initial.id, b.id, 'a stale response must never replace the open editor')
    })
  })
}

// Tests for Issue #572: reconcile ProductGrid props and empty content
test('ProductGrid falls back to safe labels when emptyLabel and emptyActionLabel are omitted', () => {
  const tree = ProductGrid({
    t: key => `translated:${key}`,
    products: [],
    showEmptyAction: true,
    onEmptyAction: () => {},
  })
  const p = find(tree, node => node.type === 'p')
  assert.ok(p, 'empty state should render a paragraph')
  assert.equal(p.props.children, 'translated:empty.all', 'emptyLabel should fall back to t("empty.all")')
  assert.notEqual(p.props.children, '', 'paragraph content must not be empty')

  const btn = find(tree, node => node.type === 'Button')
  assert.ok(btn, 'empty state should render action button when onEmptyAction is provided')
  assert.equal(btn.props.children, 'translated:add.button', 'emptyActionLabel should fall back to t("add.button")')

  const customTree = ProductGrid({
    t: key => `translated:${key}`,
    products: [],
    emptyLabel: '自定义空状态',
    emptyActionLabel: '自定义添加',
    showEmptyAction: true,
    onEmptyAction: () => {},
  })
  assert.equal(find(customTree, node => node.type === 'p').props.children, '自定义空状态')
  assert.equal(find(customTree, node => node.type === 'Button').props.children, '自定义添加')
})

test('ProductGrid in searched-empty state renders message only and omits action button', () => {
  let actionTriggered = false
  const tree = ProductGrid({
    t: key => key,
    products: [],
    emptyLabel: 'empty.noMatch',
    emptyActionLabel: 'add.button',
    showEmptyAction: false,
    onEmptyAction: () => { actionTriggered = true },
  })
  const p = find(tree, node => node.type === 'p')
  assert.ok(p, 'searched-empty should render message paragraph')
  assert.equal(p.props.children, 'empty.noMatch')

  const btn = find(tree, node => node.type === 'Button')
  assert.equal(btn, null, 'searched-empty state must not render empty action button')
  assert.equal(actionTriggered, false)
})

test('ProductsStage displays searched-empty state and hides empty action button when query has no match', async () => {
  await withStore(async ({ library, dispatcher }) => {
    library.add({ name: '真实商品A' })
    const mounted = mount(dispatcher)
    await mounted.flush()

    let grid = find(mounted.render(), component('ProductGrid'))
    assert.equal(grid.props.products.length, 1)

    const searched = mount(dispatcher, { query: '不存在的商品' })
    const searchField = searched.props().query === '不存在的商品' ? { props: { onValueChange: () => {} } } : null
    assert.ok(searchField, 'SearchField should be present')
    await searched.flush()

    const tree = searched.render()
    grid = find(tree, component('ProductGrid'))
    assert.equal(grid.props.products.length, 0)
    assert.equal(grid.props.emptyLabel, 'empty.noMatch')
    assert.equal(grid.props.showEmptyAction, false)

    const empty = grid.type(grid.props)
    assert.equal(find(empty, node => node.type === 'p').props.children, 'empty.noMatch')
    assert.equal(find(empty, node => node.type === 'Button'), null, 'searched-empty must hide action button')
  })
})

test('ProductGrid triggers onOpen on card click and onEmptyAction on empty button click', () => {
  // 1. 空状态下点击操作按钮触发 onEmptyAction
  let emptyActionCalled = false
  const emptyTree = ProductGrid({
    t: key => key,
    products: [],
    showEmptyAction: true,
    onEmptyAction: () => { emptyActionCalled = true },
  })
  const emptyBtn = find(emptyTree, node => node.type === 'Button')
  assert.ok(emptyBtn, 'empty action button should be present')
  emptyBtn.props.onClick()
  assert.equal(emptyActionCalled, true, 'clicking empty action button must trigger onEmptyAction')

  // 2. 卡片列表下点击卡片触发 onOpen
  let openedProduct = null
  const sample = { id: 'p-101', name: '测试商品', kind: 'physical' }
  const gridTree = ProductGrid({
    t: key => key,
    products: [sample],
    onOpen: (p) => { openedProduct = p },
  })
  const card = find(gridTree, node => node.type === 'article')
  assert.ok(card, 'product card should be rendered')
  card.props.onClick()
  assert.equal(openedProduct, sample, 'clicking card must trigger onOpen with product')

  // 3. 安全调用验证：未提供 onOpen 时点击卡片安全不报错
  const safeTree = ProductGrid({
    t: key => key,
    products: [sample],
  })
  const safeCard = find(safeTree, node => node.type === 'article')
  assert.doesNotThrow(() => {
    safeCard.props.onClick()
  }, 'clicking card without onOpen should safely do nothing')
})
