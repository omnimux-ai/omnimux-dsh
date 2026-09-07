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
  './ProductFormDialog.jsx': 'export function ProductFormDialog() {}',
  './ConfirmRemoveDialog.jsx': 'export function ConfirmRemoveDialog() {}',
  './styles.js': 'export function injectProductsStyles() {}',
}
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./ProductsStage.jsx', import.meta.url))],
  bundle: true, write: false, format: 'cjs', platform: 'browser', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'dsh-ui-kit'],
  plugins: [{ name: 'visual-boundaries', setup(ctx) {
    ctx.onResolve({ filter: /.*/ }, ({ path }) => Object.hasOwn(stubs, path) ? { path, namespace: 'stub' } : undefined)
    ctx.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({ contents: stubs[path], loader: 'jsx' }))
  } }], logLevel: 'silent',
})

function find(tree, matches) {
  if (!tree || typeof tree !== 'object') return null
  if (matches(tree)) return tree
  for (const child of [tree.props?.children].flat(Infinity)) {
    const found = find(child, matches)
    if (found) return found
  }
  return null
}

function mount(dispatcher) {
  const hooks = []
  const effects = []
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
    useEffect(effect) { if (!mounted) effects.push(effect) },
    useCallback(callback) { return callback },
  }
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
      if (name === 'dsh-ui-kit') return { Button: 'Button', IconButton: 'IconButton', PageHeader: 'PageHeader', FilterBar: 'FilterBar', SearchField: 'SearchField' }
      throw new Error(`unexpected dependency ${name}`)
    },
    fetch: async (url, opts) => {
      const result = await dispatcher.dispatch({ method: opts.method, url, body: opts.body ? JSON.parse(opts.body) : undefined })
      return { ok: result.status >= 200 && result.status < 300, status: result.status, json: async () => result.body }
    },
    setInterval: () => 1, clearInterval() {}, setTimeout, URLSearchParams,
  }
  runInNewContext(bundle.outputFiles[0].text, context)
  const render = () => {
    index = 0
    const tree = context.module.exports.ProductsStage({ t: key => key })
    mounted = true
    return tree
  }
  render()
  const cleanups = effects.map(effect => effect()).filter(cleanup => typeof cleanup === 'function')
  return {
    render,
    flush: () => new Promise(resolve => setImmediate(resolve)),
    unmount: () => { for (const cleanup of cleanups) cleanup() },
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

const component = name => node => node.type?.name === name

test('stage loads actual state response, opens complete media details and saves without losing references', async () => {
  await withStore(async ({ library, dispatcher, realPath }) => {
    const product = library.add({ name: '原商品', media: [{ real_path: realPath }], price: '99' })
    const mounted = mount(dispatcher)
    await mounted.flush()
    const grid = find(mounted.render(), component('ProductGrid'))
    assert.equal(grid.props.products.length, 1)
    assert.equal(grid.props.products[0].id, product.id)
    assert.equal(grid.props.products[0].media, undefined, 'state rows are compact list views')

    const card = find(grid.type(grid.props), node => node.type === 'article')
    card.props.onClick()
    await mounted.flush()
    const dialog = find(mounted.render(), component('ProductFormDialog'))
    assert.equal(dialog.props.data.initial.media[0].real_path, realPath)
    dialog.props.onAction.onSubmit({ name: '修改商品', price: '199', media: dialog.props.data.initial.media })
    await mounted.flush()
    assert.equal(find(mounted.render(), component('ProductFormDialog')), null)
    assert.equal(library.get(product.id).media[0].real_path, realPath)
    assert.equal(find(mounted.render(), component('ProductGrid')).props.products[0].name, '修改商品')
  })
})

test('failed detail request is visible and never opens an empty-media editor', async () => {
  await withStore(async ({ library, dispatcher }) => {
    const product = library.add({ name: '待删除商品' })
    const mounted = mount(dispatcher)
    await mounted.flush()
    const grid = find(mounted.render(), component('ProductGrid'))
    library.remove(product.id)
    const card = find(grid.type(grid.props), node => node.type === 'article')
    card.props.onClick()
    await mounted.flush()
    const tree = mounted.render()
    assert.equal(find(tree, component('ProductFormDialog')), null)
    assert.equal(find(tree, node => node.props?.className === 'omnimux-products-error').props.children, 'product not found')
  })
})

test('empty response clears cards and exposes the grid create action', async () => {
  await withStore(async ({ library, dispatcher }) => {
    const product = library.add({ name: '待删除商品' })
    const mounted = mount(dispatcher)
    await mounted.flush()
    library.remove(product.id)
    find(mounted.render(), node => node.type === 'PageHeader').props.onRefresh()
    await mounted.flush()
    const grid = find(mounted.render(), component('ProductGrid'))
    assert.equal(grid.props.products.length, 0)
    const empty = grid.type(grid.props)
    assert.equal(find(empty, node => node.type === 'p').props.children, 'empty.all')
    find(empty, node => node.type === 'Button').props.onClick()
    assert.equal(find(mounted.render(), component('ProductFormDialog')).props.data.mode, 'create')
  })
})


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
    await grid.props.onOpen(grid.props.products[0])
    const dialog = find(mounted.render(), component('ProductFormDialog'))
    const initial = dialog.props.data.initial
    assert.equal(initial.media[0].real_path, realPath)
    const payload = buildPayload({
      name: '修改名称', kind: initial.kind, link: initial.link, categories: initial.categories,
      media: getInitialMedia(initial), coverId: initial.cover_media_id,
    })
    dialog.props.onAction.onSubmit(payload)
    await mounted.flush()
    assert.match(find(mounted.render(), component('ProductFormDialog')).props.data.error, /missing, not a file, or unreadable/)
    assert.equal(library.get(product.id).name, '原商品')
    assert.equal(library.get(product.id).media[0].real_path, realPath)
    assert.equal(library.revision(), 1)
    assert.equal(readFileSync(libraryFile, 'utf8'), persisted)
    writeFileSync(realPath, 'restored')
    assert.equal(library.getView(product.id).media[0].real_path, realPath)
    find(mounted.render(), component('ProductFormDialog')).props.onAction.onSubmit(payload)
    await mounted.flush()
    assert.equal(library.get(product.id).name, '修改名称')
    assert.equal(library.get(product.id).media[0].real_path, realPath)
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
    assert.equal(find(mounted.render(), component('ProductFormDialog')).props.data.initial.id, b.id)
    pending[0].resolve()
    await mounted.flush()
    assert.equal(find(mounted.render(), component('ProductFormDialog')).props.data.initial.id, b.id)
  })
})

test('closing an editor invalidates an older pending detail request', async () => {
  await withDeferredEdits(async ({ mounted, pending, open, a, b }) => {
    await open(a)
    await open(b)
    pending[1].resolve()
    await mounted.flush()
    find(mounted.render(), component('ProductFormDialog')).props.onAction.onCancel()
    pending[0].resolve()
    await mounted.flush()
    assert.equal(find(mounted.render(), component('ProductFormDialog')), null)
  })
})

test('creating a product invalidates pending edit responses', async () => {
  await withDeferredEdits(async ({ mounted, pending, open, a }) => {
    await open(a)
    find(mounted.render(), node => node.type === 'Button' && node.props.children === 'add.button').props.onClick()
    pending[0].resolve()
    await mounted.flush()
    const dialog = find(mounted.render(), component('ProductFormDialog'))
    assert.equal(dialog.props.data.mode, 'create')
    assert.equal(dialog.props.data.busy, false)
  })
})

for (const action of ['close', 'unmount']) {
  test(`${action} invalidates a pending detail request`, async () => {
    await withDeferredEdits(async ({ mounted, pending, open, a }) => {
      await open(a)
      if (action === 'close') find(mounted.render(), node => node.type === 'PageHeader').props.onClose()
      else mounted.unmount()
      pending[0].resolve()
      await mounted.flush()
      assert.equal(find(mounted.render(), component('ProductFormDialog')), null)
    })
  })
}
