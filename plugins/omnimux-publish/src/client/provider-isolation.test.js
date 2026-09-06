import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const components = {}
for (const name of ['AccountPanel', 'RecordDetail']) {
  const bundle = new URL(`./.${name}.provider-test.mjs`, import.meta.url)
  await build({
    entryPoints: [fileURLToPath(new URL(`./${name}.jsx`, import.meta.url))],
    outfile: fileURLToPath(bundle), bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    plugins: [{ name: 'ui-mocks', setup(ctx) {
      ctx.onResolve({ filter: /^(dsh-ui-kit|@deepseek-ai\/dsh-client-ui-primitives)$/ }, () => ({
        path: fileURLToPath(new URL('./AccountsSidebar.disconnect.test-mocks.jsx', import.meta.url)),
      }))
    } }], logLevel: 'silent',
  })
  components[name] = (await import(bundle.href))[name]
  await rm(fileURLToPath(bundle))
}

async function render(name, body, props, inspect, status = 200) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const saved = {}
  for (const key of ['window', 'document', 'Node', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch']) saved[key] = globalThis[key]
  for (const key of ['window', 'document', 'Node', 'HTMLElement']) globalThis[key] = dom.window[key]
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  }
  const container = dom.window.document.getElementById('root')
  const root = createRoot(container)
  try {
    await act(async () => root.render(React.createElement(components[name], {
      t: (key, vars) => key === 'accounts.selected' ? `Selected ${vars.count}` : key, ...props,
    })))
    await inspect(container, calls)
  } finally {
    await act(async () => root.unmount())
    Object.assign(globalThis, saved)
    dom.window.close()
  }
}

test('old draft keeps its selection until explicitly cleared and counts only official IDs', async () => {
  const selectedIds = ['z', 'official']
  const changes = []
  await render('AccountPanel', { accounts: [
    { id: 'z', platform: 'tiktok', provider: 'zernio', display_name: 'Legacy' },
    { id: 'official', platform: 'tiktok', provider: 'tiktok_direct', display_name: 'Official', status: 'active' },
  ] }, { selectedIds, onChange: (...args) => changes.push(args) }, async (container) => {
    assert.ok(container.textContent.includes('accounts.sourceMismatch'))
    assert.ok(container.textContent.includes('Selected 1'))
    assert.ok(!container.textContent.includes('Legacy'))
    assert.deepEqual(changes, [])
    const clear = [...container.querySelectorAll('button')].find((button) => button.textContent === 'accounts.clearInvalid')
    await act(async () => clear.click())
    assert.deepEqual(changes[0][0], ['official'])
    assert.deepEqual(selectedIds, ['z', 'official'])
  })
})

test('account load failure is not rendered as an empty official account list', async () => {
  await render('AccountPanel', { error: 'provider unavailable' }, { selectedIds: ['z'], onChange() {} }, (container) => {
    assert.ok(container.textContent.includes('provider unavailable'))
    assert.ok(!container.textContent.includes('accounts.empty'))
    assert.ok(!container.textContent.includes('accounts.sourceMismatch'))
  }, 503)
})

test('historical nonofficial tasks remain viewable without retry or upstream refresh', async () => {
  await render('RecordDetail', { record: { title: 'Saved history', subtasks: [
    { id: 'z', account_id: '1', provider: 'zernio', platform: 'tiktok', status: 'failed', post_id: 'post-z' },
    { id: 'legacy', account_id: '2', platform: 'tiktok', status: 'submitted', post_id: 'post-old' },
  ] } }, { recordId: 'record', onBack() {}, onChanged() {} }, (container, calls) => {
    assert.ok(container.textContent.includes('Saved history'))
    assert.equal(container.querySelectorAll('.omnimux-publish-task-err').length, 2)
    assert.ok(!container.textContent.includes('task.retry'))
    const refresh = [...container.querySelectorAll('button')].find((button) => button.textContent === 'detail.refresh')
    assert.equal(refresh.disabled, true)
    refresh.click()
    assert.equal(calls.length, 1)
  })
})
