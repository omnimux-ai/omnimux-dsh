import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { build } from 'esbuild'

/**
 * `ProductGrid` 的渲染契约。
 *
 * 这个文件原本还驱动整个 `ProductsStage` 宿主（列表 + 二级页 + 真实 dispatcher）。
 * 产品库宿主已并入资产库（`omnimux-assets` 的 `ProductTab`），`ProductsStage` 不再
 * 存在，宿主级用例（数据往返、二级页路由、请求作废、列表保活）已由资产库侧的
 * 真实渲染测试（`product-tab-render.test.js`）与 `scripts/verify-product-secondary-page.mjs`
 * 覆盖；这里只保留产品插件自己拥有的卡片渲染契约。
 */
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
