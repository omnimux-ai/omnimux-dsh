import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { build } from 'esbuild'
import * as React from 'react'
import { en, zh } from './locales.js'
import { logicalEntries, directoryPage } from '../directory-page.js'

const require = createRequire(import.meta.url)
const directory = new URL('.', import.meta.url).pathname
let current = null
const hooks = {
  ...React,
  useState(initial) {
    const scope = current
    const index = scope.index++
    if (!(index in scope.values)) scope.values[index] = typeof initial === 'function' ? initial() : initial
    return [scope.values[index], (value) => { scope.values[index] = typeof value === 'function' ? value(scope.values[index]) : value }]
  },
  useRef(value) {
    const [ref] = hooks.useState(() => ({ current: value }))
    return ref
  },
  useMemo(fn, deps) {
    const [memo] = hooks.useState(() => ({ deps: null, value: null }))
    if (!memo.deps || deps.some((value, i) => value !== memo.deps[i])) { memo.value = fn(); memo.deps = deps }
    return memo.value
  },
  useCallback: (fn) => fn,
  useEffect(fn, deps) {
    const [memo] = hooks.useState(() => ({ deps: null, cleanup: null }))
    if (!memo.deps || deps.some((value, i) => value !== memo.deps[i])) {
      memo.cleanup?.(); memo.cleanup = fn(); memo.deps = deps
    }
  },
}
const kit = new Proxy({}, { get: (_, name) => name })

/** Execute real JSX and callbacks with controlled hooks; not a DOM or React lifecycle renderer. */
function harness() {
  const scopes = new Map()
  function invoke(fn, props, path = 'root') {
    const scope = scopes.get(path) || { values: [], index: 0 }
    scopes.set(path, scope)
    scope.index = 0
    const previous = current
    current = scope
    try { return fn(props) } finally { current = previous }
  }
  function expand(node, path = 'root') {
    if (Array.isArray(node)) return node.flatMap((item, index) => expand(item, `${path}.${index}`))
    if (!React.isValidElement(node)) return node == null || node === false ? [] : [node]
    if (typeof node.type === 'function') return expand(invoke(node.type, node.props, path), `${path}.render`)
    const children = [
      ...expand(node.props.children, `${path}.children`),
      ...(node.props.coverNode ? expand(node.props.coverNode, `${path}.coverNode`) : []),
    ]
    return [{ type: node.type, props: node.props, children }]
  }
  return { invoke, render: (Component, props) => expand(React.createElement(Component, props)) }
}
function nodes(tree) { return tree.flatMap((node) => typeof node === 'object' ? [node, ...nodes(node.children)] : []) }
function text(tree) { return tree.map((node) => typeof node === 'object' ? text(node.children) : String(node)).join(' ') }
function click(node) { assert.ok(node); node.props.onClick({ stopPropagation() {}, preventDefault() {} }) }
const t = (key) => en[key] || key
async function load(file, exports = '') {
  const compiled = await build({ stdin: { contents: readFileSync(`${directory}${file}`, 'utf8') + exports,
    resolveDir: directory, loader: file.endsWith('.jsx') ? 'jsx' : 'js' }, bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'dsh-ui-kit'] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)((name) => name === 'react' ? hooks : name === 'dsh-ui-kit' ? kit : require(name), module, module.exports)
  return module.exports
}
const { AssetGrid } = await load('AssetGrid.jsx')
const { AssetDetail } = await load('AssetDetail.jsx')
const { AssetsBody, ConfirmRemoveDialogItem } = await load('AssetsStage.jsx', '\nexport { AssetsBody, ConfirmRemoveDialogItem }')
const { createRemovalRequest, useFeedSelection, useDeleteBatchHandler } = await load('use-assets-feed.js', '\nexport { useFeedSelection, useDeleteBatchHandler }')
const leaf = { id: 'leaf', original_name: 'a.png', kind: 'image', logical_path: '素材/人物/a.png', relative_path: 'shared/a.png' }
const missing = { id: 'skip', original_name: 'b.png', logical_path: '素材/人物/b.png', status: 'unmigrated', recovery_ref: { taskId: 'task', reason: 'Skipped' } }
const partial = { id: 'partial', name: 'Partial', type: 'custom', files: [leaf], unavailable_files: [missing] }
const unavailable = { id: 'unavailable', name: 'Unavailable', type: 'custom', files: [], unavailable_files: [missing] }
const routeRequests = []
globalThis.window = new EventTarget()
globalThis.fetch = async (path) => {
  const url = new URL(path, 'http://localhost')
  routeRequests.push(url)
  const asset = url.searchParams.get('id') === 'unavailable' ? unavailable : partial
  const entries = logicalEntries([...asset.files, ...asset.unavailable_files], url.searchParams.get('path') || '')
  return { ok: true, status: 200, json: async () => directoryPage(entries, asset.id, { limit: Number(url.searchParams.get('limit')) }) }
}
async function renderPage(renderer, Component, props) {
  let tree = renderer.render(Component, props)
  await new Promise((resolve) => setImmediate(resolve))
  tree = renderer.render(Component, props)
  await new Promise((resolve) => setImmediate(resolve))
  return renderer.render(Component, props)
}

for (const viewMode of ['grid', 'list']) {
  for (const asset of [partial, unavailable, { ...partial, unavailable_files: [] }]) {
    test(`${viewMode} card and View route ${asset.name}/${asset.unavailable_files.length} to browse`, () => {
      const opened = [], previews = []
      const tree = harness().render(AssetGrid, { assets: [asset], t, viewMode, onOpen: (value) => opened.push(value), onPreview: (value) => previews.push(value) })
      const row = nodes(tree).find((node) => (viewMode === 'grid' ? ['article', 'MediaCard'].includes(node.type) : ['tr', 'TableRow'].includes(node.type)) && node.props.onClick)
      click(row)
      click(nodes(tree).find((node) => ['button', 'Button'].includes(node.type) && text(node.children).includes(t('card.view'))))
      assert.deepEqual(opened, [asset, asset])
      assert.deepEqual(previews, [])
      if (viewMode === 'grid' && typeof row.props.onKeyDown === 'function') {
        let prevented = false
        row.props.onKeyDown({ target: row, currentTarget: row, key: 'Enter', preventDefault() { prevented = true } })
        assert.equal(prevented, true)
        assert.equal(opened.length, 3)
      }
    })
  }
  test(`${viewMode} ordinary image still previews directly and selection does not open`, () => {
    const asset = { id: 'image', name: 'Image', type: 'custom', files: [{ id: 'image-file', original_name: 'a.png', relative_path: 'data/files/image/a.png' }] }
    const opened = [], previews = [], selected = []
    const tree = harness().render(AssetGrid, { assets: [asset], t, viewMode, onOpen: (item) => opened.push(item), onPreview: (item) => previews.push(item), onToggleSelect: (item) => selected.push(item) })
    click(nodes(tree).find((node) => node.props['aria-label'] === t('select.toggle')))
    assert.deepEqual(selected, [asset])
    assert.deepEqual(opened, [])
    assert.deepEqual(previews, [])
    click(nodes(tree).find((node) => (viewMode === 'grid' ? ['article', 'MediaCard'].includes(node.type) : ['tr', 'TableRow'].includes(node.type)) && node.props.onClick))
    assert.equal(previews[0].previewUrl, '/omnimux/assets/library/preview?id=image&file=image-file')
    assert.deepEqual(opened, [])
  })
}

for (const asset of [partial, unavailable]) {
  test(`detail uses logical navigation and safe leaf actions for ${asset.name}`, async () => {
    const renderer = harness(), previews = []
    let closed = 0
    const props = { asset, t, busy: false, onClose: () => closed++, onSave() {}, onPreview: (item) => previews.push(item) }
    let tree = await renderPage(renderer, AssetDetail, props)
    click(nodes(tree).find((node) => node.type === 'article' && node.props['aria-label'] === '素材'))
    tree = await renderPage(renderer, AssetDetail, props)
    click(nodes(tree).find((node) => node.type === 'article' && node.props['aria-label'] === '人物'))
    tree = await renderPage(renderer, AssetDetail, props)
    const unavailableCard = nodes(tree).find((node) => node.type === 'article' && node.props['aria-label'] === 'b.png')
    assert.equal(unavailableCard.props.onClick, undefined)
    assert.match(text(unavailableCard.children), /Not migrated.*Skipped.*task/)
    assert.equal(nodes(unavailableCard.children).some((node) => node.props.src), false)
    if (asset.files.length) {
      click(nodes(tree).find((node) => node.type === 'article' && node.props['aria-label'] === 'a.png'))
      assert.equal(previews[0].previewUrl, '/omnimux/assets/library/preview?id=partial&file=leaf&epoch=0')
      assert.ok(routeRequests.some((url) => url.searchParams.get('logical') === '1' && url.searchParams.get('path') === '素材/人物' && url.searchParams.get('limit') === '100'))
    }
    click(nodes(tree).find((node) => node.type === 'Button' && text(node.children) === 'Back'))
    tree = await renderPage(renderer, AssetDetail, props)
    assert.ok(nodes(tree).find((node) => node.type === 'article' && node.props['aria-label'] === '人物'))
    assert.equal(closed, 0)
  })
}

test('Stage card opens the main logical tree for partial and fully unavailable assets', async () => {
  for (const asset of [partial, unavailable]) {
    const renderer = harness()
    const feed = { detail: null, visible: [asset], viewMode: 'grid', setDetail: (value) => { feed.detail = value } }
    const props = { t, feed, emptyProps: {}, onPreview() {}, sourceTab: 'local' }
    let tree = await renderPage(renderer, AssetsBody, props)
    click(nodes(tree).find((node) => ['article', 'MediaCard'].includes(node.type)))
    assert.equal(feed.detail, asset)
    tree = await renderPage(renderer, AssetsBody, props)
    const main = nodes(tree).find((node) => node.props.className === 'omnimux-assets-main')
    assert.ok(nodes(main.children).find((node) => node.type === 'article' && node.props['aria-label'] === '素材'))
    assert.equal(nodes(main.children).some((node) => node.type === 'AssetPreviewModal'), false)
  }
})

test('Stage passes the same preview callback to main browse and detail sidebar', () => {
  const onPreview = () => {}, feed = { detail: partial, setDetail() {}, handleSaveDetail() {}, busy: false }
  const tree = AssetsBody({ t, feed, emptyProps: {}, onPreview, sourceTab: 'local' })
  const children = React.Children.toArray(tree.props.children)
  assert.equal(children[0].props.children.props.onPreview, onPreview)
  assert.equal(children[1].props.onPreview, onPreview)
})

test('ordinary single-image sidebar retains a disabled file row instead of adding browse', () => {
  const tree = harness().render(AssetDetail, { t, asset: { id: 'plain', name: 'Plain', files: [{ id: 'one', original_name: 'a.png' }] }, onClose() {}, onSave() {} })
  assert.equal(nodes(tree).some((node) => node.type === 'article'), false)
  assert.equal(nodes(tree).find((node) => node.type === 'Button' && text(node.children).includes('a.png')).props.disabled, true)
})

test('batch confirmation captures real selected objects, excluding stale IDs and keeping hidden selections', async () => {
  const renderer = harness()
  const second = { id: 'other', name: 'Other', files: [{ id: 'owned', ownership: 'adopted' }] }
  let selection = renderer.invoke(useFeedSelection, [partial, second])
  selection.setSelectedIds(new Set(['partial', 'other', 'stale']))
  selection = renderer.invoke(useFeedSelection, [partial, second])
  selection.handleOpenBatchDelete()
  selection = renderer.invoke(useFeedSelection, [partial, second])
  const pendingRemove = selection.pendingRemove
  assert.deepEqual(pendingRemove.ids, ['partial', 'other'])
  assert.deepEqual(pendingRemove.assets, [partial, second])
  assert.equal(pendingRemove.isBatch, true)
  for (const locale of [en, zh]) {
    const tree = harness().render(ConfirmRemoveDialogItem, { t: (key) => locale[key] || key, feed: { pendingRemove, setPendingRemove() {}, handleConfirmDelete() {}, busy: false } })
    const modal = nodes(tree).find((node) => node.type === 'ConfirmModal')
    assert.match(modal.props.title, /2/)
    assert.match(modal.props.title, /Partial.*Other/)
    assert.doesNotMatch(modal.props.title, /confirm\.|stale/)
    assert.equal(modal.props.message, locale['mapping.removeHint'])
  }
  const deleted = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/omnimux/assets/library/delete')
    deleted.push(JSON.parse(options.body).id)
    return { ok: true, status: 200, json: async () => ({}) }
  }
  let cleared = false
  try {
    const confirm = renderer.invoke(useDeleteBatchHandler, { pendingRemove, detail: partial,
      run: async (work, after) => { const result = await work(); if (result.ok) after(); return result },
      setDetail: (value) => { assert.equal(value, null) }, setPendingRemove: (value) => { cleared = value === null },
      setSelectedIds: (update) => { assert.deepEqual([...update(new Set(['partial', 'other', 'later']))], ['later']) } }, 'delete')
    await confirm()
    assert.deepEqual(deleted, pendingRemove.ids)
    assert.equal(cleared, true)
  } finally { globalThis.fetch = originalFetch }
})

test('removal request handles empty, single, duplicate and ownership-unknown objects without invented metadata', () => {
  assert.equal(createRemovalRequest([]), null)
  assert.equal(createRemovalRequest([null, {}]), null)
  const request = createRemovalRequest([partial, partial])
  assert.equal(request.isBatch, false)
  assert.deepEqual(request.ids, ['partial'])
  assert.equal(request.assets[0], partial)
  assert.equal(request.sharedCount, undefined)
  assert.equal(request.ownership, undefined)
  const tree = harness().render(ConfirmRemoveDialogItem, { t, feed: { pendingRemove: request, setPendingRemove() {}, handleConfirmDelete() {} } })
  assert.equal(nodes(tree).find((node) => node.type === 'ConfirmModal').props.title, 'Remove "Partial" from library?')
})
