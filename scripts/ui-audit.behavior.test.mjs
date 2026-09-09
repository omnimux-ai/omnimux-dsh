import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { buildSync } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const require = createRequire(import.meta.url)
const kitPath = process.env.UI_AUDIT_KIT
assert.ok(kitPath, 'UI_AUDIT_KIT must identify the isolated kit checkout')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'navigator']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const h = React.createElement
const primitives = new Proxy({}, { get: (_, key) => key === 'Tooltip' ? ({ children }) => children : () => null })
function load(entry, suffix = '') {
  const source = readFileSync(entry, 'utf8') + suffix
  const built = buildSync({ stdin: { contents: source, resolveDir: resolve(entry, '..'), loader: entry.endsWith('.jsx') ? 'jsx' : 'js' }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', write: false, alias: { 'dsh-ui-kit': resolve(kitPath, 'lib/index.js') }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'] })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', built.outputFiles[0].text)(module, module.exports, (id) => id === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : require(id))
  return module.exports
}
const kit = load(resolve(kitPath, 'lib/index.js'))
function mount(element) {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(element))
  return { host, render: (next) => act(() => root.render(next)), close: () => { act(() => root.unmount()); host.remove() } }
}
function click(node) { act(() => node.click()) }
function key(node, value) {
  const event = new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
  act(() => node.dispatchEvent(event))
  return event
}

test('TableHead exposes native focusable sorting button; aria-sort remains on th; disabled/busy suppress callbacks', () => {
  let calls = 0
  const view = (props = {}) => h('table', null, h('thead', null, h('tr', null, h(kit.TableHead, { sortable: true, sortDirection: 'asc', onClick: () => calls++, ...props }, 'Name'))))
  const ui = mount(view())
  const button = ui.host.querySelector('button'); button.focus()
  assert.equal(document.activeElement, button); assert.equal(button.type, 'button'); assert.equal(button.tabIndex, 0)
  assert.equal(ui.host.querySelector('th').getAttribute('aria-sort'), 'ascending')
  assert.equal(button.hasAttribute('aria-sort'), false)
  assert.equal(key(button, 'Enter').defaultPrevented, false)
  click(button); assert.equal(calls, 1)
  ui.render(view({ disabled: true })); click(ui.host.querySelector('button')); assert.equal(calls, 1)
  ui.render(view({ busy: true })); click(ui.host.querySelector('button')); assert.equal(calls, 1)
  ui.close()
})

test('DataTable sorting changes state through native header button', () => {
  const changes = []
  function Table() {
    const [sort, setSort] = React.useState([null, null])
    return h(kit.DataTable, { data: [{ id: '1', name: 'A' }], rowKey: 'id', columns: [{ id: 'name', header: 'Name', accessorKey: 'name', sortable: true }], sortKey: sort[0], sortDirection: sort[1], onSortChange: (...next) => { changes.push(next); setSort(next) } })
  }
  const ui = mount(h(Table))
  for (let i = 0; i < 3; i++) click(ui.host.querySelector('th button'))
  assert.deepEqual(changes, [['name', 'desc'], ['name', 'asc'], [null, null]])
  ui.close()
})

test('Drawer shared container remains locked through out-of-order closing, unmount and StrictMode', () => {
  for (const reverse of [false, true]) {
    document.body.style.overflow = 'auto'
    const view = (a, b) => h(React.StrictMode, null, h(kit.Drawer, { key: 'a', open: a, onClose() {}, closable: false }, 'A'), h(kit.Drawer, { key: 'b', open: b, onClose() {}, closable: false }, 'B'))
    const ui = mount(view(true, false)); assert.equal(document.body.style.overflow, 'hidden')
    ui.render(view(true, true)); ui.render(view(reverse, !reverse)); assert.equal(document.body.style.overflow, 'hidden')
    ui.close(); assert.equal(document.body.style.overflow, 'auto')
  }
  const container = document.createElement('div'); container.style.overflow = 'scroll'; document.body.append(container)
  const ui = mount(h(kit.Drawer, { open: true, container, onClose() {}, closable: false }, 'C'))
  assert.equal(container.style.overflow, 'hidden'); assert.equal(document.body.style.overflow, 'auto')
  ui.close(); assert.equal(container.style.overflow, 'scroll'); container.remove()
})

test('SelectableTile extra control events do not select or cancel native activation', () => {
  let selected = 0; let extra = 0
  const ui = mount(h(kit.SelectableTile, { id: 'tile', title: 'Tile', onChange: () => selected++, extra: h('button', { onClick: () => extra++ }, h('span', null, 'Extra')) }))
  const button = ui.host.querySelector('button'); const tile = ui.host.querySelector('[role="checkbox"]')
  for (const value of ['Enter', ' ']) assert.equal(key(button, value).defaultPrevented, false)
  click(button.querySelector('span')); assert.equal(extra, 1); assert.equal(selected, 0)
  key(tile, 'Enter'); key(tile, ' '); click(tile); assert.equal(selected, 3)
  ui.close()
})

test('clipboard fallback always removes textarea and restores focus for true false and throw', async () => {
  const input = document.createElement('input'); document.body.append(input)
  for (const outcome of [true, false, 'throw']) {
    input.focus()
    document.execCommand = () => { assert.equal(document.activeElement.tagName, 'TEXTAREA'); if (outcome === 'throw') throw Error('copy failed'); return outcome }
    assert.equal(await kit.copyToClipboard('preserved'), outcome === true)
    assert.equal(document.querySelectorAll('textarea').length, 0); assert.equal(document.activeElement, input)
  }
  input.remove()
})

const { AccountTable } = load(resolve('plugins/omnimux-accounts/src/client/AccountTable.jsx'))
test('AccountTable sort callbacks and busy state consume TableHead correctly', () => {
  const calls = []
  const props = { t: (key) => key, accounts: [], selected: new Set(), sortKey: 'display_name', sortDir: 'asc', onSortHeader: (key) => calls.push(key) }
  const ui = mount(h(AccountTable, props))
  click(ui.host.querySelector('th button')); assert.deepEqual(calls, ['display_name'])
  ui.render(h(AccountTable, { ...props, busy: 'working' }))
  assert.equal(ui.host.querySelector('th button').disabled, true); click(ui.host.querySelector('th button')); assert.equal(calls.length, 1)
  ui.close()
})
for (const name of ['PlatformTable', 'TopPostsTable']) {
  const Component = load(resolve(`plugins/omnimux-analytics/src/client/components/${name}.jsx`))[name]
  test(`${name} sorting updates aria-sort through the actual consumer`, () => {
    const ui = mount(h(Component, { t: (key) => key, rows: [] }))
    const button = ui.host.querySelector('th button'); const th = button.closest('th')
    click(button); const first = th.getAttribute('aria-sort'); click(button)
    assert.notEqual(th.getAttribute('aria-sort'), first); ui.close()
  })
}

const { InspirationPreviewModal } = load(resolve('plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx'))
test('Preview null transitions preserve hooks; empty clipboard controls absent; analysis pending failure success use actual lifecycle', async () => {
  let finish
  window.__omnimux = undefined
  globalThis.fetch = () => new Promise((resolve) => { finish = resolve })
  const props = { t: (key) => key, onClose() {} }
  const ui = mount(h(InspirationPreviewModal, { ...props, row: null }))
  ui.render(h(InspirationPreviewModal, { ...props, row: { id: 'test', title: 'Title' } }))
  assert.equal([...ui.host.querySelectorAll('button')].some((b) => b.textContent === 'modal.script.copy' || b.textContent === 'modal.deconstruction.copy'), false)
  assert.ok(ui.host.textContent.includes('modal.deconstruction.empty'))
  const analyze = [...ui.host.querySelectorAll('button')].find((b) => b.textContent.includes('modal.deconstruction.analyze'))
  await act(async () => { analyze.click() })
  assert.ok(ui.host.textContent.includes('status.breakdownGenerating'))
  await act(async () => { finish({ ok: false, status: 500, json: async () => ({ error: 'failed' }) }) })
  assert.ok(ui.host.textContent.includes('modal.deconstruction.error')); assert.equal(ui.host.textContent.includes('status.breakdownGenerating'), false)
  await act(async () => { [...ui.host.querySelectorAll('button')].find((b) => b.textContent.includes('modal.deconstruction.analyze')).click() })
  await act(async () => { finish({ ok: true, status: 200, json: async () => ({ data: { id: 'test', title: 'Title', content: 'Script', deconstruction: { hook: 'Hook' } } }) }) })
  assert.ok(ui.host.textContent.includes('status.breakdownReady'))
  assert.ok([...ui.host.querySelectorAll('button')].some((b) => b.textContent === 'modal.deconstruction.copy'))
  ui.render(h(InspirationPreviewModal, { ...props, row: null })); ui.close()
})

const { AssetGridCard } = load(resolve('plugins/omnimux-assets/src/client/AssetGrid.jsx'), '\nexport { AssetGridCard };')
test('Asset selection key events do not activate the parent MediaCard', () => {
  let selected = 0; let opened = 0
  const ui = mount(h(AssetGridCard, { asset: { id: 'a', name: 'A', type: 'image', files: [] }, t: (key) => key, onToggleSelect: () => selected++, onOpen: () => opened++ }))
  const button = ui.host.querySelector('[aria-label="select.toggle"]')
  for (const value of ['Enter', ' ']) { assert.equal(key(button, value).defaultPrevented, false); click(button) }
  assert.equal(selected, 2); assert.equal(opened, 0); ui.close()
})

const { RecordsTable } = load(resolve('plugins/omnimux-publish/src/client/views/RecordsTable.jsx'))
test('Publish RecordsTable retains native sorting controls and callback fields', () => {
  const calls = []
  const ui = mount(h(RecordsTable, { t: (key) => key, records: [{ id: 'p', content: 'Post', accounts: [], tasks: [], status: 'draft' }], selectedIds: new Set(), sortField: 'date', sortOrder: 'asc', onSort: (field) => calls.push(field) }))
  const buttons = [...ui.host.querySelectorAll('th button')]
  click(buttons.find((button) => button.textContent.includes('Date')))
  click(buttons.find((button) => button.textContent.includes('Status')))
  assert.deepEqual(calls, ['date', 'status']); ui.close()
})

const { TypeCard } = load(resolve('plugins/omnimux-publish/src/client/Composer/index.jsx'), '\nexport { TypeCard };')
test('Composer TypeCard is an action button and invokes the chosen media action', () => {
  const values = []
  const ui = mount(h(TypeCard, { t: (key) => key, value: 'video', onPick: (value) => values.push(value) }))
  const button = ui.host.querySelector('button')
  assert.ok(button); assert.equal(button.hasAttribute('role'), false); assert.equal(button.hasAttribute('aria-checked'), false)
  click(button); assert.deepEqual(values, ['video']); ui.close()
})
