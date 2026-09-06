import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const sourceUrl = new URL('./AccountsSidebar.jsx', import.meta.url)
const mocksUrl = new URL('./AccountsSidebar.disconnect.test-mocks.jsx', import.meta.url)
const bundleUrl = new URL('./.AccountsSidebar.disconnect.test.bundle.mjs', import.meta.url)

await build({
  entryPoints: [fileURLToPath(sourceUrl)],
  outfile: fileURLToPath(bundleUrl),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
  ],
  plugins: [{
    name: 'component-mocks',
    setup(buildContext) {
      buildContext.onResolve({ filter: /^(dsh-ui-kit|@deepseek-ai\/dsh-client-ui-primitives)$/ }, () => ({ path: fileURLToPath(mocksUrl) }))
    },
  }],
  logLevel: 'silent',
})
const { AccountsSidebar } = await import(`${bundleUrl.href}?test=${Date.now()}`)
await rm(fileURLToPath(bundleUrl), { force: true })

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const labels = {
  'acct.title': 'Accounts',
  'acct.add': 'Add account',
  'acct.searchPlaceholder': 'Search accounts',
  'acct.loading': 'Loading',
  'acct.empty': 'Empty',
  'acct.panel.title': 'TikTok Authorization',
  'acct.panel.body': 'Panel body',
  'acct.status.connected': 'Connected',
  'acct.status.expired': 'Expired',
  'acct.status.error': 'Error',
  'acct.agentOff': 'Agent off',
  'acct.disconnect': 'Disconnect',
  'acct.disconnectTitle': 'Disconnect account',
  'acct.retry': 'Retry',
  'auth.cancel': 'Cancel',
  close: 'Close',
}

function t(key, vars = {}) {
  if (key === 'acct.more') return `More actions for ${String(vars.name ?? '')}`
  if (key === 'acct.disconnectConfirm') return `Disconnect ${String(vars.name ?? '')}?`
  if (key === 'acct.disconnectFailed') return `Disconnect failed: ${String(vars.reason ?? '')}`
  if (key === 'acct.loadFailed') return `Load failed: ${String(vars.reason ?? '')}`
  if (key === 'acct.needLogin') return 'Login required'
  if (key === 'acct.needLogin.hint') return 'Login hint'
  return labels[key] ?? key
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function deferred() {
  /** @type {(value: Response) => void} */
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
  const previous = {}
  for (const key of ['window', 'document', 'Node', 'HTMLElement', 'getComputedStyle', 'MutationObserver']) {
    previous[key] = globalThis[key]
    globalThis[key] = dom.window[key]
  }
  return {
    container: dom.window.document.getElementById('root'),
    restore() {
      for (const [key, value] of Object.entries(previous)) globalThis[key] = value
      dom.window.close()
    },
  }
}

async function flush() {
  await act(async () => { await Promise.resolve() })
}

async function click(element) {
  await act(async () => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

function buttonByText(container, text) {
  return [...container.ownerDocument.querySelectorAll('button')].find((button) => button.textContent?.trim() === text)
}

async function openDisconnect(container, index = 0) {
  const moreButtons = [...container.querySelectorAll('button')].filter((button) => button.getAttribute('aria-label') === 'More actions for Twin')
  assert.ok(moreButtons[index], 'account-specific more button is rendered')
  await click(moreButtons[index])
  const action = buttonByText(container, 'Disconnect')
  assert.ok(action, 'disconnect menu action is rendered')
  await click(action)
}

describe('AccountsSidebar disconnect interaction', () => {
  it('cancels without DELETE, then deletes the selected same-name account and refreshes GET', async () => {
    const { container, restore } = setupDom()
    const originalFetch = globalThis.fetch
    const calls = []
    globalThis.fetch = async (path, init = {}) => {
      calls.push({ path: String(path), method: init.method ?? 'GET' })
      if (init.method === 'DELETE') return response({ ok: true })
      return response({ accounts: [
        { id: 'first', platform: 'tiktok', provider: 'tiktok_direct', display_name: 'Twin', status: 'connected' },
        { id: 'second/id', platform: 'tiktok', provider: 'tiktok_direct', display_name: 'Twin', status: 'connected' },
      ] })
    }
    const root = createRoot(container)
    try {
      await act(async () => { root.render(React.createElement(AccountsSidebar, { t })) })
      await flush()
      await openDisconnect(container, 1)
      assert.ok(container.textContent.includes('Disconnect Twin?'))
      await click(buttonByText(container, 'Cancel'))
      assert.equal(calls.filter((call) => call.method === 'DELETE').length, 0)

      await openDisconnect(container, 1)
      await click(buttonByText(container, 'Disconnect'))
      await flush()
      assert.deepEqual(calls.filter((call) => call.method === 'DELETE'), [
        { path: '/omnimux/accounts/second%2Fid?provider=tiktok_direct', method: 'DELETE' },
      ])
      assert.equal(calls.filter((call) => call.method === 'GET').length, 2)
    } finally {
      await act(async () => { root.unmount() })
      globalThis.fetch = originalFetch
      restore()
    }
  })

  it('uses a synchronous lock for duplicate confirms and retains the failed account for retry', async () => {
    const { container, restore } = setupDom()
    const originalFetch = globalThis.fetch
    const pending = deferred()
    let deleteCalls = 0
    globalThis.fetch = async (path, init = {}) => {
      if (init.method === 'DELETE') {
        deleteCalls += 1
        if (deleteCalls === 1) return pending.promise
        return response({ ok: true })
      }
      return response({ accounts: [{ id: 'retry-id', platform: 'tiktok', provider: 'tiktok_direct', display_name: 'Twin', status: 'connected' }] })
    }
    const root = createRoot(container)
    try {
      await act(async () => { root.render(React.createElement(AccountsSidebar, { t })) })
      await flush()
      await openDisconnect(container)
      const confirm = buttonByText(container, 'Disconnect')
      assert.ok(confirm)
      await act(async () => {
        confirm.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
        confirm.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      })
      assert.equal(deleteCalls, 1)
      pending.resolve(response({ error: 'blocked', message: 'Try again' }, 500))
      await flush()
      assert.ok(container.textContent.includes('Disconnect failed: blocked: Try again'))
      assert.ok(container.textContent.includes('Twin'), 'failed account stays rendered')
      await click(buttonByText(container, 'Retry'))
      await flush()
      assert.equal(deleteCalls, 2)
    } finally {
      await act(async () => { root.unmount() })
      globalThis.fetch = originalFetch
      restore()
    }
  })

  it('allows another account to be disconnected after a successful close, including StrictMode remount checks', async () => {
    const { container, restore } = setupDom()
    const originalFetch = globalThis.fetch
    const deletedIds = []
    globalThis.fetch = async (path, init = {}) => {
      if (init.method === 'DELETE') {
        deletedIds.push(String(path))
        return response({ ok: true })
      }
      return response({ accounts: [
        { id: 'first', platform: 'tiktok', provider: 'tiktok_direct', display_name: 'Twin', status: 'connected' },
        { id: 'second', platform: 'tiktok', provider: 'tiktok_direct', display_name: 'Twin', status: 'connected' },
      ] })
    }
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(React.createElement(React.StrictMode, null, React.createElement(AccountsSidebar, { t })))
      })
      await flush()
      await openDisconnect(container, 0)
      await click(buttonByText(container, 'Disconnect'))
      await flush()
      await openDisconnect(container, 1)
      await click(buttonByText(container, 'Disconnect'))
      await flush()
      assert.deepEqual(deletedIds, [
        '/omnimux/accounts/first?provider=tiktok_direct',
        '/omnimux/accounts/second?provider=tiktok_direct',
      ])
    } finally {
      await act(async () => { root.unmount() })
      globalThis.fetch = originalFetch
      restore()
    }
  })

  it('does not update state when a late DELETE callback resolves after unmount', async () => {
    const { container, restore } = setupDom()
    const originalFetch = globalThis.fetch
    const originalError = console.error
    const pending = deferred()
    const errors = []
    globalThis.fetch = async (_path, init = {}) => (
      init.method === 'DELETE' ? pending.promise : response({ accounts: [{ id: 'late-id', platform: 'tiktok', provider: 'tiktok_direct', display_name: 'Twin' }] })
    )
    console.error = (...args) => { errors.push(args.join(' ')) }
    const root = createRoot(container)
    try {
      await act(async () => { root.render(React.createElement(AccountsSidebar, { t })) })
      await flush()
      await openDisconnect(container)
      await click(buttonByText(container, 'Disconnect'))
      await act(async () => { root.unmount() })
      pending.resolve(response({ ok: true }))
      await flush()
      assert.equal(errors.some((line) => /unmounted component|state update/i.test(line)), false)
    } finally {
      console.error = originalError
      globalThis.fetch = originalFetch
      restore()
    }
  })
})
