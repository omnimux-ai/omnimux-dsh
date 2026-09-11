import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import * as SkillShelf from './skill-picker-logic.js'

const req = createRequire(import.meta.url)
const source = readFileSync(new URL('./skill-plaza.js', import.meta.url), 'utf8')
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
const walk = (node, predicate) => {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  for (const child of node.children || []) {
    const result = walk(child, predicate)
    if (result) return result
  }
  return null
}

function renderWorkshop() {
  const calls = []
  const stateWrites = []
  let index = 0
  const context = {
    require: req,
    h, fmt: value => String(value), iconSrc: value => value, useTr: () => (key) => key,
    useState: (initial) => { const key = index++; return [initial, (value) => stateWrites.push([key, value])] },
    useCallback: (fn) => fn, useEffect: () => {},
    SkillShelf,
    createSkillSession: (options) => calls.push(options),
    Drawer: 'Drawer', lookup: (key) => key,
  }
  const render = runInNewContext(`${source}\nSkillPlaza`, context)
  return { tree: render({}), calls, stateWrites }
}

test('create action delegates only slash prefill to existing session helper', () => {
  const { tree, calls } = renderWorkshop()
  const button = walk(tree, (node) => node.props.className === 'btn-create')
  button.props.onClick()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].text, '/skill-creator')
})

test('install action opens existing modal and category row precedes content', () => {
  const { tree, stateWrites } = renderWorkshop()
  walk(tree, (node) => node.props.className === 'btn-install').props.onClick()
  assert.ok(stateWrites.some(([, value]) => value === true))
  const categories = walk(tree, (node) => node.props.className === 'category-bar')
  assert.equal(categories.children.length, 11)
  assert.equal(tree.children[0].props.className, 'workshop-intro')
  assert.equal(tree.children[1].props.className, 'nav-bar')
  assert.equal(tree.children[2].props.className, 'category-bar')
})

test('failed installation retains dialog and reports error without installed callback', async () => {
  const writes = []
  let state = 0
  let installed = false
  let closed = false
  const render = runInNewContext(`${source}\nInstallModal`, {
    require: req,
    h, useState: (value) => [state++ === 0 ? { name: 'example.zip' } : value, (next) => writes.push(next)],
    useRef: () => ({ current: null }), Overlay: 'Overlay', lookup: (key) => key,
    api: async () => { throw new Error('installation-rejected') },
  })
  const tree = render({ open: true, onClose: () => { closed = true }, onInstalled: () => { installed = true } })
  await walk(tree, (node) => node.props.className?.startsWith('btn-modal-install')).props.onClick()
  assert.equal(installed, false)
  assert.equal(closed, false)
  assert.ok(writes.includes('installation-rejected'))
})

test('Drawer safely renders with Overlay defined in skills-ui', () => {
  const skillsUiSource = readFileSync(new URL('./skills-ui.js', import.meta.url), 'utf8')
  const ReactMock = {
    useContext: () => (k) => k,
    useState: (init) => [init, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    createContext: () => ({ Provider: 'Provider' }),
  }
  const context = {
    h,
    React: ReactMock,
    useState: ReactMock.useState,
    useEffect: ReactMock.useEffect,
    useRef: ReactMock.useRef,
    createPortal: (node) => node,
    fallbackPortal: null,
    document: { body: { style: {} } },
    window: { addEventListener: () => {}, removeEventListener: () => {} },
    useTr: () => (k) => k,
    lookup: (k) => k,
    catLabel: () => '通用',
    api: async () => ({ ok: true }),
    Button: 'Button',
    Toast: 'Toast',
  }
  const renderDrawer = runInNewContext(`${skillsUiSource}\nDrawer`, context)
  const node = renderDrawer({ item: { slug: 'test-skill', name: '测试技能' }, onClose: () => {} })
  assert.ok(node)
  assert.equal(node.type.name, 'Overlay')
})
