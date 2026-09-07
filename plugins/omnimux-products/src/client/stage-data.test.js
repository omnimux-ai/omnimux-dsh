import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { build } from 'esbuild'
import { createProductsDispatcher } from '../http-routes.js'
import { createLibraryStore } from '../library.js'

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
  for (const effect of effects) effect()
  return { render, flush: () => new Promise(resolve => setImmediate(resolve)) }
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
