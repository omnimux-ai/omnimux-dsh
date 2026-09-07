import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const bundle = new URL('./.row-action-menu-test.mjs', import.meta.url)
await build({
  entryPoints: [fileURLToPath(new URL('./views/RowActionMenu.jsx', import.meta.url))],
  outfile: fileURLToPath(bundle), bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom'], loader: { '.css': 'empty' },
  plugins: [{ name: 'kit-button', setup(ctx) {
    ctx.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: 'kit', namespace: 'stub' }))
    ctx.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export function IconButton({children, variant, size, ...props}) { return <button {...props}>{children}</button> }', loader: 'jsx',
    }))
  } }], logLevel: 'silent',
})

test('native row menu opens, selects actions, closes and respects record status', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true })
  const keys = ['window', 'document', 'Node', 'HTMLElement', 'Element', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']
  const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] })
  const { RowActionMenu } = await import(bundle.href)
  await rm(fileURLToPath(bundle))
  await rm(fileURLToPath(bundle).replace(/\.mjs$/, '.css'), { force: true })
  const root = createRoot(document.getElementById('root'))
  const calls = []
  const record = { id: 'fixture-draft', status: 'draft', subtasks: [] }
  const render = async () => act(async () => root.render(React.createElement(RowActionMenu, {
    t: key => key, record,
    onView: value => calls.push(['view', value.id]), onEdit: value => calls.push(['edit', value.id]),
    onDelete: value => calls.push(['delete', value.id]), onRetry: value => calls.push(['retry', value.id]),
  })))
  const click = async selector => {
    const target = document.querySelector(selector)
    assert.ok(target, `missing ${selector}`)
    await act(async () => target.click())
  }
  try {
    await render()
    for (const action of ['view', 'edit', 'delete']) {
      await click('button[aria-label="records.more"]')
      assert.ok(document.querySelector('[role="menu"]'))
      const items = [...document.querySelectorAll('[role="menuitem"]')]
      assert.deepEqual(items.map(item => item.textContent), ['records.action.view', 'records.action.edit', 'records.action.delete'])
      await act(async () => items.find(item => item.textContent === `records.action.${action}`).click())
      assert.deepEqual(calls.pop(), [action, record.id])
      assert.equal(document.querySelector('[role="menu"]'), null)
    }
    record.status = 'failed'
    record.subtasks = [{ id: 'official-task', platform: 'tiktok', provider: 'tiktok_direct', status: 'failed' }]
    await render()
    await click('button[aria-label="records.more"]')
    const items = [...document.querySelectorAll('[role="menuitem"]')]
    assert.deepEqual(items.map(item => item.textContent), ['records.action.view', 'records.action.retry'])
    await act(async () => items[1].click())
    assert.deepEqual(calls.pop(), ['retry', record.id])
    await click('button[aria-label="records.more"]')
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('[role="menu"]'), null)
    for (const provider of ['zernio', undefined]) {
      record.subtasks = [{ id: 'legacy-task', platform: 'tiktok', provider, status: 'failed' }]
      await render()
      await click('button[aria-label="records.more"]')
      assert.deepEqual([...document.querySelectorAll('[role="menuitem"]')].map(item => item.textContent), ['records.action.view'])
      await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    }
  } finally {
    await act(async () => root.unmount())
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
    dom.window.close()
  }
})
