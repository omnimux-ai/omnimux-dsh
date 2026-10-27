import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { build, transform } from 'esbuild'

const nodeRequire = createRequire(import.meta.url)

/**
 * 资产库产品库 Tab 的**真实渲染**回归测试。
 *
 * 存在的理由：此前该面的测试全是 `readFileSync` + 正则，从不挂载组件，因此两个
 * 真实缺陷（`AssetsBody` 里引用 `AssetsStage` 作用域变量导致的 `ReferenceError`、
 * `ProductTab` 视图上报 effect 依赖不稳定导致的无限重渲染）都完美躲过了门禁。
 * 这里用 jsdom 真渲染，把「切到产品库 Tab」「点开二级页」两条路径钉住。
 *
 * 只 stub 视觉套件与产品表单组件，产品列表与视图状态机全部走生产源码。
 */
const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '..', '..', '..')
const productsRoot = join(pluginRoot, 'omnimux-products', 'src', 'client')

const ENTRY = join(here, 'ProductTab.jsx')

const STUBS = {
  'dsh-ui-kit': `
    const React = nodeRequire('react')
    const make = (name) => (props) => React.createElement('div', { 'data-kit': name, ...props }, props.children)
    exports.Button = make('Button')
    exports.IconButton = make('IconButton')
    exports.ConfirmModal = (props) => (props.open
      ? React.createElement('div', { 'data-kit': 'ConfirmModal' }, props.title, props.message)
      : null)
    exports.Divider = make('Divider')
    exports.PageHeader = make('PageHeader')
    exports.FilterBar = make('FilterBar')
    exports.SearchField = make('SearchField')
    exports.Tabs = make('Tabs')
    exports.EmptyState = make('EmptyState')
  `,
}

/** 只替掉产品表单本身：二级页由资产库 Stage 根渲染，这里验证的是「上报了什么」。 */
const UI_STUB = `
  export { ProductGrid } from '${join(productsRoot, 'ProductGrid.jsx').replace(/\\/g, '/')}'
  export { CreateProductMenu } from '${join(productsRoot, 'CreateProductMenu.jsx').replace(/\\/g, '/')}'
  export { ChatIcon } from '${join(productsRoot, 'icons.jsx').replace(/\\/g, '/')}'
  export * from '${join(productsRoot, 'api.js').replace(/\\/g, '/')}'
  export function injectProductsStyles() {}
  export function ProductFormPage() { return null }
  export function deliverProductReference() { return Promise.resolve() }
  export const zh = {}
  export const en = {}
  export const NS = 'omnimux-products'
`

/** dsh-ui-kit 拉 CSS 模块，与真实插件构建一样保持 external，用最小桩顶上。 */
function makeKitStub() {
  const React = nodeRequire('react')
  const make = (name) => (props) => React.createElement('div', { 'data-kit': name }, props.children)
  return {
    Button: make('Button'),
    IconButton: make('IconButton'),
    ConfirmModal: (props) => (props.open ? React.createElement('div', { 'data-kit': 'ConfirmModal' }, props.title) : null),
    Divider: make('Divider'),
    PageHeader: make('PageHeader'),
    FilterBar: make('FilterBar'),
    SearchField: make('SearchField'),
    Tabs: make('Tabs'),
    EmptyState: make('EmptyState'),
  }
}

function shimRequire(name) {
  if (name === 'react') return nodeRequire('react')
  if (name === 'react-dom/client') return nodeRequire('react-dom/client')
  if (name === 'react/jsx-runtime') return nodeRequire('react/jsx-runtime')
  if (name === 'dsh-ui-kit') return makeKitStub()
  throw new Error(`unexpected require ${name}`)
}

/** 把生产组件与桩打成一个可在 jsdom 里跑的 CJS 包。 */
async function bundleProductTab() {
  const result = await build({
    stdin: {
      contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { ProductTab } from '${ENTRY.replace(/\\/g, '/')}'
        // 复刻 AssetsStage 的真实接线：父级把上报的视图存进 state，
        // 从而在 ProductTab 重渲染时把新回调身份传回去——P0-2 的循环闭环。
        function Harness(props) {
          const [view, setView] = React.useState(null)
          globalThis.__reported = view
          globalThis.__reportCount = (globalThis.__reportCount || 0) + 1
          return React.createElement(ProductTab, { ...props, onViewChange: setView })
        }
        globalThis.__mountProductTab = (container, props) => {
          const root = createRoot(container)
          root.render(React.createElement(Harness, props))
          return root
        }
      `,
      resolveDir: here,
      loader: 'jsx',
      sourcefile: 'product-tab-render-harness.jsx',
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    jsx: 'automatic',
    logLevel: 'silent',
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'dsh-ui-kit'],
    plugins: [{
      name: 'product-ui-stub',
      setup(ctx) {
        ctx.onResolve({ filter: /^omnimux-products\/ui$/ }, () => ({ path: 'product-ui-stub', namespace: 'stub' }))
        ctx.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: UI_STUB, loader: 'jsx', resolveDir: productsRoot }))
      },
    }],
  })
  return result.outputFiles[0].text
}

const PRODUCTS = [
  { id: 'p1', name: '保温杯', kind: 'physical', selling_points: '24 小时保温' },
  { id: 'p2', name: '台灯', kind: 'physical', selling_points: '无频闪' },
]

/** 建一个干净的 jsdom 环境并挂上 fetch 桩。 */
async function withDom(run) {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const prev = { window: globalThis.window, document: globalThis.document }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  // Node 25 的 globalThis.navigator 是只读 getter，必须用 defineProperty 覆盖。
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator, configurable: true, writable: true,
  })
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Node = dom.window.Node
  globalThis.CustomEvent = dom.window.CustomEvent
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  globalThis.IS_REACT_ACT_ENVIRONMENT = false

  const calls = { open: [], closeTab: [], setFocus: [] }
  dom.window.__omnimuxWorkbench = {
    open: (p) => { calls.open.push(p); return true },
    openWorkbench: (p) => { calls.open.push(p); return true },
    closeTab: (id) => { calls.closeTab.push(id) },
    setFocus: (f) => { calls.setFocus.push(f) },
    setConversationCollapsed: () => {},
  }
  dom.window.fetch = async (url, opts) => {
    const path = String(url)
    const method = (opts && opts.method) || 'GET'
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
    if (path.startsWith('/omnimux/products/state')) return json({ products: PRODUCTS })
    const m = path.match(/^\/omnimux\/products\/([^/?]+)\?view=edit/)
    if (m) {
      const found = PRODUCTS.find((p) => p.id === decodeURIComponent(m[1]))
      return found ? json({ product: found }) : json({ error: 'not-found' }, 404)
    }
    if (method === 'POST' && path === '/omnimux/products') return json({ product: PRODUCTS[0] })
    return json({})
  }
  globalThis.fetch = dom.window.fetch

  try {
    await run({ dom, calls })
  } finally {
    globalThis.window = prev.window
    globalThis.document = prev.document
    dom.window.close()
  }
}

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms))

test('产品库 Tab 真实渲染：列表挂载且不崩（P0-1 回归）', async () => {
  const code = await bundleProductTab()
  await withDom(async ({ dom }) => {
    const container = dom.window.document.getElementById('root')
    const errors = []
    const originalError = console.error
    console.error = (...args) => { errors.push(args.join(' ')) }
    try {
      // eslint-disable-next-line no-eval
      const mod = { exports: {} }
      new Function('module', 'exports', 'require', code)(mod, mod.exports, shimRequire)
      const root = globalThis.__mountProductTab(container, {
        t: (k) => k, visible: true, query: '', kindTab: 'all',
      })
      await tick()
      assert.match(container.innerHTML, /omnimux-products-list-view/, '列表视图必须真实挂载')
      assert.equal(errors.filter((e) => /ReferenceError|is not defined/.test(e)).length, 0, '不得出现作用域 ReferenceError')
      root.unmount()
    } finally {
      console.error = originalError
    }
  })
})

test('产品库 Tab 真实渲染：切到二级页不触发无限重渲染（P0-2 回归）', async () => {
  const code = await bundleProductTab()
  await withDom(async ({ dom }) => {
    const container = dom.window.document.getElementById('root')
    const errors = []
    const originalError = console.error
    console.error = (...args) => { errors.push(args.join(' ')) }
    let reported = null
    let renderCount = 0
    try {
      const mod = { exports: {} }
      new Function('module', 'exports', 'require', code)(mod, mod.exports, shimRequire)
      globalThis.__reportCount = 0
      const root = globalThis.__mountProductTab(container, {
        t: (k) => k,
        visible: true,
        query: '',
        kindTab: 'all',
        intent: { mode: 'create', kind: 'physical', nonce: 1 },
      })
      await tick(200)
      reported = globalThis.__reported
      renderCount = globalThis.__reportCount
      assert.equal(
        errors.filter((e) => /Maximum update depth exceeded/.test(e)).length,
        0,
        '不得出现无限重渲染告警',
      )
      assert.ok(reported, '进入创建后必须上报二级页视图')
      assert.equal(reported.name, 'form', '上报的必须是 form 视图')
      assert.equal(reported.mode, 'create')
      assert.ok(renderCount < 60, `父级渲染次数应稳定（无无限重渲染），实际 ${renderCount}`)
      root.unmount()
    } finally {
      console.error = originalError
    }
  })
})


test('组件内引用的每个标识符都有绑定，不得出现跨作用域的悬空引用（P0-1 回归）', async () => {
  // P0-1 的真实形态：`AssetsBody` 引用了 `AssetsStage` 内定义的 handler。
  // esbuild 把内层定义重命名（`handleOpenProductConversation2`），而 `AssetsBody`
  // 里的引用保留原名 → 打包不报错、渲染即 ReferenceError。
  // 这里用最直接、不依赖作用域建模的判据：把 JSX 去掉后，凡是「被引用但从未声明」
  // 且「也不是 import / 全局」的标识符，就是悬空引用。
  const { parse } = await import('acorn')
  const jsxSource = readFileSync(join(here, 'AssetsStage.jsx'), 'utf8')
  const { code: source } = await transform(jsxSource, { loader: 'jsx', jsx: 'automatic', format: 'esm' })
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })

  const declared = new Set()
  const referenced = new Set()

  const collectPattern = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'Identifier') { declared.add(node.name); return }
    if (node.type === 'AssignmentPattern') { collectPattern(node.left); return }
    if (node.type === 'RestElement') { collectPattern(node.argument); return }
    if (node.type === 'ObjectPattern') { for (const q of node.properties) collectPattern(q.value ?? q.argument); return }
    if (node.type === 'ArrayPattern') { for (const q of node.elements) collectPattern(q); return }
  }

  const walk = (node, parent = null, key = null) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'ImportDeclaration') {
      for (const spec of node.specifiers) declared.add(spec.local.name)
      return
    }
    if (node.type === 'VariableDeclarator') collectPattern(node.id)
    if (node.type === 'FunctionDeclaration' && node.id) declared.add(node.id.name)
    if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      if (node.id) declared.add(node.id.name)
      for (const p of node.params) collectPattern(p)
    }
    if (node.type === 'CatchClause') collectPattern(node.param)
    if (node.type === 'ClassDeclaration' && node.id) declared.add(node.id.name)

    if (node.type === 'Identifier') {
      const isKey = parent?.type === 'Property' && key === 'key' && !parent.computed
      const isMemberProp = parent?.type === 'MemberExpression' && key === 'property' && !parent.computed
      if (!isKey && !isMemberProp) referenced.add(node.name)
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc') continue
      const v = node[k]
      if (Array.isArray(v)) v.forEach((c) => walk(c, node, k))
      else if (v && typeof v === 'object') walk(v, node, k)
    }
  }
  walk(ast)

  // 全局/宿主注入的名字不算悬空。
  const globals = new Set([
    'window', 'document', 'console', 'globalThis', 'undefined', 'NaN', 'Infinity',
    'Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Date', 'Set', 'Map',
    'Promise', 'Error', 'Symbol', 'URLSearchParams', 'URL', 'fetch', 'setTimeout',
    'clearTimeout', 'setInterval', 'clearInterval', 'navigator', 'React', 'arguments',
    'props', 'ResizeObserver', 'IntersectionObserver', 'CustomEvent', 'requestAnimationFrame',
    'cancelAnimationFrame', 'matchMedia', 'localStorage', 'HTMLElement', 'Node',
  ])

  const dangling = [...referenced].filter((name) => !declared.has(name) && !globals.has(name))
  assert.deepEqual(
    dangling,
    [],
    `存在被引用但从未声明的标识符（渲染即 ReferenceError）：${dangling.join(', ')}`,
  )
})
