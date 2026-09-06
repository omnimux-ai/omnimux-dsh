import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const bundle = new URL('./.stage-callbacks-test.mjs', import.meta.url)
const stubs = {
  'dsh-ui-kit': `export function PageHeader() { return null }
    export function ConfirmModal({open, confirmLoading, onConfirm, onClose}) {
      return open ? <><button disabled={confirmLoading} onClick={onConfirm}>delete</button><button disabled={confirmLoading} onClick={onClose}>cancel</button></> : null
    }`,
  './styles.js': 'export function injectPublishStyles() {}',
  './usePublishFeed.js': 'export function usePublishFeed() {}',
  './AccountsSidebar.jsx': 'export function AccountsSidebar() { return null }',
  './views/PublishActionRow.jsx': 'export function PublishActionRow() { return null }',
  './views/PublishControlBar.jsx': 'export function PublishControlBar() { return null }',
  './views/PublishViewport.jsx': 'export function PublishViewport() { return null }',
  '../Composer/index.jsx': `export function Composer({draftId, onBack, onSaved, onSubmitted}) {
    return <><span>{draftId}</span><button onClick={onBack}>back</button><button onClick={onSaved}>save</button><button onClick={() => onSubmitted('submitted-id')}>submit</button></>
  }`,
  '../RecordDetail.jsx': `import {useState} from 'react'; export function RecordDetail({recordId, onBack, onChanged}) {
    const [changed, setChanged] = useState(false)
    return <><span>{recordId}</span><span>{changed ? 'changed' : 'fresh'}</span><button onClick={onBack}>back</button><button onClick={() => {setChanged(true); onChanged()}}>change</button></>
  }`,
}
await build({
  entryPoints: [fileURLToPath(new URL('./PublishStage.jsx', import.meta.url))],
  outfile: fileURLToPath(bundle), bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  plugins: [{ name: 'boundary-stubs', setup(ctx) {
    ctx.onResolve({ filter: /.*/ }, ({ path }) => Object.hasOwn(stubs, path) ? { path, namespace: 'stub' } : undefined)
    ctx.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({ contents: stubs[path], loader: 'jsx' }))
  } }], logLevel: 'silent',
})
const { PublishStageModals } = await import(bundle.href)
await rm(fileURLToPath(bundle))

async function render(view, inspect) {
  const dom = new JSDOM('<div id="root"></div>')
  const saved = {}
  for (const key of ['window', 'document', 'Node', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) saved[key] = globalThis[key]
  for (const key of ['window', 'document', 'Node', 'HTMLElement']) globalThis[key] = dom.window[key]
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const calls = []
  const feed = {
    detailTick: 0, pendingDelete: null, busyDelete: false,
    loadList: () => { calls.push('load') }, startTracking: () => { calls.push('track') },
    confirmDelete: () => { calls.push('delete') }, setPendingDelete: (value) => { calls.push(['pending', value]) },
  }
  const root = createRoot(dom.window.document.getElementById('root'))
  const update = async () => act(async () => root.render(React.createElement(PublishStageModals, {
    t: (key) => key, view, feed, setView: (value) => { calls.push(['view', value]) },
  })))
  const click = async (text) => {
    const button = [...dom.window.document.querySelectorAll('button')].find((node) => node.textContent === text)
    assert.ok(button, `missing ${text}`)
    await act(async () => button.click())
  }
  try { await update(); await inspect({ feed, calls, click, update, document: dom.window.document }) }
  finally { await act(async () => root.unmount()); Object.assign(globalThis, saved); dom.window.close() }
}

test('composer return, save and submit reach the stage callbacks', async () => {
  await render({ name: 'composer', draftId: 'draft-id' }, async ({ calls, click, document }) => {
    assert.match(document.body.textContent, /draft-id/)
    await click('back')
    assert.deepEqual(calls.splice(0), [['view', { name: 'list' }]])
    await click('save')
    assert.deepEqual(calls.splice(0), ['load'])
    await click('submit')
    assert.ok(calls.includes('track'))
    assert.ok(calls.some((call) => Array.isArray(call) && call[0] === 'view' && call[1].name === 'detail' && call[1].recordId === 'submitted-id'))
  })
})

test('detail return, update and revision remount reach the stage', async () => {
  await render({ name: 'detail', recordId: 'record-id' }, async ({ feed, calls, click, update, document }) => {
    await click('back')
    assert.deepEqual(calls.splice(0), [['view', { name: 'list' }]])
    await click('change')
    assert.ok(calls.includes('load'))
    assert.ok(calls.includes('track'))
    assert.match(document.body.textContent, /changed/)
    feed.detailTick++
    await update()
    assert.match(document.body.textContent, /fresh/)
  })
})

test('delete confirmation receives the real handler and busy state', async () => {
  await render({ name: 'list' }, async ({ feed, calls, click, update, document }) => {
    feed.pendingDelete = { id: 'draft-id' }
    await update()
    await click('delete')
    assert.deepEqual(calls.splice(0), ['delete'])
    feed.busyDelete = true
    await update()
    assert.ok([...document.querySelectorAll('button')].every((button) => button.disabled))
    await click('delete')
    assert.deepEqual(calls, [])
    feed.busyDelete = false
    await update()
    await click('cancel')
    assert.deepEqual(calls, [['pending', null]])
  })
})
