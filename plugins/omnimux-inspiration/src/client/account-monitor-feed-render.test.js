import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { DOM_RENDER_LOADERS } from '../../tests/fixtures/dom-render-build.mjs'
import { JSDOM } from 'jsdom'
// 必须先于 react-dom 求值：本文件也驱动受控输入框（顶部「导入灵感」弹窗）。
import '../../tests/fixtures/dom-bootstrap.mjs'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { zh } from './locales.js'

/**
 * Render gate for the 账号监控 feed — the account column and the timeline.
 *
 * What the tab promises after #3432, and what this file pins down:
 *
 *   - the monitor is a two-column layout: a persistent account column that
 *     lists every monitored account with its avatar, handle, platform glyph and
 *     work count, and a content column beside it;
 *   - every account starts checked; checking one narrows the timeline
 *     immediately, 反选 inverts and 重置 restores the default — the three rules
 *     `rival-filter.js` owns, observed through the real components;
 *   - the ↗ button opens the creator's profile without touching the selection;
 *   - the works render as one native-looking timeline (avatar / author / handle
 *     / platform / time / body / media / metrics / actions), newest first, and
 *     a row opens a detail dialog that knows it is not a library item;
 *   - the retired account popover, masonry and 9:16 work cards do not render on
 *     this tab.
 *
 * Mounted the same way `rivals-layout-render.test.js` mounts: the real
 * `InspirationStage` bundled by esbuild, in jsdom, with `dsh-ui-kit`'s leaf
 * components replaced by `tests/fixtures/ui-kit-shim.mjs`.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'InspirationStage.jsx')
const shimEntry = join(here, '../../tests/fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'account-monitor-feed')

const RIVAL_PREFIX = '/omnimux/inspiration/local/rival-accounts'

/** 导入用例里 Host 新建出来的那个监控账号。 */
const NEW_ACCOUNT_ID = 'ra_gethullo'

/** 导入用例粘贴的账号主页链接。 */
const NEW_ACCOUNT_URL = 'https://www.tiktok.com/@gethullo'

/** Requests one mount may make before the gate calls it a loop. */
const REQUEST_BUDGET = 120

const ACCOUNTS = [
  {
    id: 'ra_alice',
    nickname: 'Alice Studio',
    handle: '@alice',
    platform: 'tiktok',
    profile_url: 'https://www.tiktok.com/@alice',
    refresh_state: 'idle',
    post_count: 2,
  },
  {
    id: 'ra_bob',
    nickname: 'Bob Films',
    handle: '@bob',
    platform: 'x',
    profile_url: 'https://x.com/bob',
    refresh_state: 'idle',
    post_count: 1,
  },
]

const WORK_ALICE = {
  id: 'post_1',
  row_id: 'ra_alice:post_1',
  account_id: 'ra_alice',
  title: 'Alice 的第一条作品',
  url: 'https://www.tiktok.com/@alice/video/1',
  type: 'video',
  duration: 31,
  posted_at: '2026-09-12T08:00:00.000Z',
  stats: { views: 1200, likes: 30, comments: 4, shares: 1 },
  cover_src: 'https://cdn.example/tiktok-cover.heic',
  video_src: 'https://cdn.example/tiktok-video.mp4',
  account: {
    id: 'ra_alice',
    nickname: 'Alice Studio',
    handle: '@alice',
    platform: 'tiktok',
    profile_url: 'https://www.tiktok.com/@alice',
    post_count: 2,
  },
}

const WORK_BOB = {
  id: 'post_2',
  row_id: 'ra_bob:post_2',
  account_id: 'ra_bob',
  title: 'Bob 的第一条作品',
  url: 'https://x.com/bob/status/2',
  type: 'video',
  duration: 12,
  posted_at: '2026-09-11T08:00:00.000Z',
  stats: { views: 900, likes: 10, comments: 1, shares: 0 },
  cover_src: '/omnimux/inspiration/local/media/rival-accounts/covers/rival-2.jpg',
  account: {
    id: 'ra_bob',
    nickname: 'Bob Films',
    handle: '@bob',
    platform: 'x',
    profile_url: 'https://x.com/bob',
    post_count: 1,
  },
}

const WORKS = [WORK_ALICE, WORK_BOB]

/** Labels the gate drives the UI by, taken from the plugin's own table. */
const L = {
  columnTitle: zh['rivalAccounts.column.title'],
  all: zh['rivalAccounts.column.all'],
  more: zh['rivalAccounts.column.more'],
  remove: zh['rivalAccounts.column.remove'],
  confirmRemove: zh['rivalAccounts.column.confirmRemove'],
  removeFailed: zh['rivalAccounts.column.removeFailed'],
  remove: zh['rivalAccounts.column.remove'],
  refresh: zh['rivalAccounts.column.refresh'],
  removeConfirm: zh['rivalAccounts.column.removeConfirm'],
  removeCancel: zh['rivalAccounts.column.removeCancel'],
  openProfile: zh['rivalFilter.openProfile'],
  replicate: zh['rivalFeed.card.replicate'],
  importBtn: zh['rivalAccounts.import.btn'],
  searchPlaceholder: zh['rivalAccounts.import.searchPlaceholder'],
  // 顶部「导入灵感」弹窗的三个控件标签，账号主页链接就是从它进来的。
  topImport: zh['add.btn'],
  urlLabel: zh['add.urlLabel'],
  submit: zh['add.submit'],
  importSuccess: (handle) => zh['rivalAccounts.import.success'].replace('{handle}', handle),
}

let bundleCounter = 0

/**
 * Bundle the stage with the UI-kit shim in place of `dsh-ui-kit`.
 * @returns {Promise<string>} absolute path of the bundled ESM file
 */
async function bundleStage() {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `account-monitor-${bundleCounter}.mjs`)
  bundleCounter += 1
  const result = await esbuild.build({
    loader: DOM_RENDER_LOADERS,
    absWorkingDir: join(here, '..', '..'),
    entryPoints: [sourceEntry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    plugins: [{
      name: 'ui-kit-shim',
      setup(build) {
        build.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: shimEntry }))
      },
    }],
  })
  const code = result.outputFiles?.[0]?.text
  if (!code) throw new Error('esbuild produced no bundle for InspirationStage.jsx')
  writeFileSync(outFile, code)
  return outFile
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

/**
 * Mount the stage against a scripted Host whose works are known.
 *
 * A fresh bundle path per mount gives every case its own module registry, which
 * matters because the feed keeps an SWR cache at module scope.
 * @param {{ accounts?: Array<object>, works?: Array<object>, localItems?: Record<string, object>, failPaths?: RegExp[], removeStatus?: number }} [options]
 *   `failPaths` lists request paths that must reject (network failure), not
 *   return an !ok body — that is the only way an uncaught rejection can leak.
 *   `removeStatus` is the DELETE receipt of the 更多 menu (default 200).
 */
async function mountStage(options = {}) {
  // 可变副本：导入用例会让 Host 多出一个监控账号，重读必须看得到它。
  const accounts = [...(options.accounts ?? ACCOUNTS)]
  const works = options.works ?? WORKS
  const localItems = options.localItems ?? {}
  const failPaths = options.failPaths ?? []
  const removeStatus = options.removeStatus ?? 200
  const stageModule = await import(`${await bundleStage()}?mount=${bundleCounter}`)

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const { window } = dom
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  const previousIntersectionObserver = globalThis.IntersectionObserver
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT

  globalThis.window = window
  globalThis.document = window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The deferred page-load path waits for the host auth bridge; without it only
  // the first effect runs and the second load is never attempted.
  window.__omnimuxAuth = { ensureLogin() {} }
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  /** Profiles the gate opened, in order. */
  const opened = []
  window.open = (url) => {
    opened.push(String(url))
    return null
  }

  const calls = []
  globalThis.fetch = async (url, fetchOptions = {}) => {
    const path = String(url)
    const method = fetchOptions?.method ?? 'GET'
    const body = typeof fetchOptions.body === 'string' ? JSON.parse(fetchOptions.body) : undefined
    calls.push({ path, method, body })
    // A gate that fails loudly beats a gate that spins.
    if (calls.length > REQUEST_BUDGET) {
      throw new Error(`request storm: ${calls.length} calls, last ${method} ${path}`)
    }
    // A path opted into `failPaths` fails at the transport layer, the way a
    // real network outage does — `inspirationRequest` never sees a response,
    // so the rejection propagates to whatever handler forgot its catch.
    if (failPaths.some((pattern) => pattern.test(path))) {
      throw new Error(`network failure (test-injected): ${method} ${path}`)
    }
    // 「AI 拆解」把作品转成灵感条目：一次 POST 返回既有或新建的 inspiration_id。
    if (path.includes('/to-inspiration') && method === 'POST') {
      return jsonResponse(200, { success: true, data: { inspiration_id: 'insp-3110' } })
    }
    // The aggregate feed is a sibling of the per-account routes, not a child,
    // so it is matched before the account-collection fallback.
    if (path.includes(`${RIVAL_PREFIX}/posts`)) {
      const query = new URL(path, 'http://localhost').searchParams
      const requested = (query.get('accounts') || '').split(',').filter(Boolean)
      const keyword = (query.get('q') || '').toLowerCase()
      let items = requested.length > 0
        ? works.filter((row) => requested.includes(row.account_id))
        : works
      // 删掉一个账号之后，它的作品也不再属于账号监控——Host 的行为一致。
      items = items.filter((row) => accounts.some((account) => account.id === row.account_id))
      if (keyword) {
        items = items.filter((row) => JSON.stringify(row).toLowerCase().includes(keyword))
      }
      return jsonResponse(200, {
        success: true,
        data: {
          items,
          total: items.length,
          page: 1,
          page_size: 20,
          has_more: false,
          requested_accounts: requested.length > 0 ? requested : accounts.map((row) => row.id),
        },
      })
    }
    // 「更多」菜单的删除：DELETE 掉那个账号，下一次重读就看不到它了。
    if (method === 'DELETE' && path.includes(RIVAL_PREFIX)) {
      if (removeStatus >= 400) {
        return jsonResponse(removeStatus, { success: false, error: 'remove-failed' })
      }
      const id = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1))
      const index = accounts.findIndex((row) => row.id === id)
      if (index >= 0) accounts.splice(index, 1)
      return jsonResponse(200, { success: true, data: { id } })
    }
    // 判定与账号导入：一次导入会先问 Host「这条链接是什么」，再创建监控账号。
    // 新账号进的是同一个数组，所以导入之后的重读必须能把它带回来。
    if (path.includes(`${RIVAL_PREFIX}/classify`)) {
      return jsonResponse(200, {
        success: true,
        data: { kind: 'account', platform: 'tiktok', external_id: 'gethullo', handle: '@gethullo' },
      })
    }
    if (path.includes(RIVAL_PREFIX) && method === 'POST') {
      const created = {
        id: NEW_ACCOUNT_ID,
        nickname: 'Gethullo',
        handle: '@gethullo',
        platform: 'tiktok',
        profile_url: 'https://www.tiktok.com/@gethullo',
        refresh_state: 'idle',
        post_count: 0,
      }
      accounts.push(created)
      return jsonResponse(201, { success: true, data: created })
    }
    if (path.includes(RIVAL_PREFIX)) {
      return jsonResponse(200, { success: true, data: { items: accounts, total: accounts.length } })
    }
    const preparation = path.match(/^\/omnimux\/inspiration\/local\/([^/?]+)\/creation-reference$/)
    if (preparation && method === 'POST' && localItems[preparation[1]]) {
      const row = localItems[preparation[1]]
      return jsonResponse(200, { success: true, data: { ...row, creation_draft: body.draft, creation_reference: { id: 'c47d2fd4-f2f7-4e33-948c-8187bfb0aceb', text: body.draft.text, basis: body.draft.basis, prepared_at: '2026-10-18T12:00:00.000Z', reference_count: body.draft.references.length } } })
    }
    // A single library item by id — the row the deconstruct modal is opened on.
    const single = path.match(/^\/omnimux\/inspiration\/local\/([^/?]+)$/)
    if (single && localItems[single[1]]) {
      return jsonResponse(200, { success: true, data: localItems[single[1]] })
    }
    if (path.startsWith('/omnimux/inspiration/local')) {
      return jsonResponse(200, { success: true, data: { items: [], total: 0, platforms: [] } })
    }
    return jsonResponse(200, { success: true, data: { items: [], total: 0 } })
  }

  const container = window.document.getElementById('host')
  const reactRoot = createRoot(container)
  const t = (key) => zh[key] || key

  await act(async () => {
    reactRoot.render(React.createElement(stageModule.InspirationStage, { t, visible: true }))
  })
  await settle(container, () => container.querySelector('[data-tab="rivals"]'))

  return {
    container,
    calls,
    document: window.document,
    opened,
    /** Click a node and let the resulting data flow settle. */
    async click(node) {
      assert.ok(node, 'the node to click must exist')
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
    /** Switch to the 账号监控 tab and wait for its content to render. */
    async openAccountTab() {
      const button = container.querySelector('[data-tab="rivals"]')
      assert.ok(button, 'the tab bar must render the 账号监控 tab')
      await act(async () => {
        button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      await settle(container, () => button.getAttribute('aria-pressed') === 'true')
      assert.equal(button.getAttribute('aria-pressed'), 'true', 'the 账号监控 tab must activate')
    },
    async unmount() {
      await act(async () => reactRoot.unmount())
      globalThis.window = previousWindow
      globalThis.document = previousDocument
      globalThis.fetch = previousFetch
      globalThis.IntersectionObserver = previousIntersectionObserver
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    },
    close() {
      dom.window.close()
    },
  }
}

/** Pump the microtask/effect queue until `predicate` holds or the budget runs out. */
async function settle(container, predicate) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (predicate()) return true
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
  return false
}

/**
 * Let wall-clock time pass, so a timed dismissal can actually happen on screen.
 *
 * Time is advanced in short slices, each inside its own `act`: the timer fires
 * inside a window instead of between them, so the updates it produces are
 * observed rather than warned about. A single long `act` window spanning the
 * whole wait is what does not work here.
 */
async function waitFor(ms) {
  const slice = 50
  for (let waited = 0; waited < ms; waited += slice) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, slice))
    })
  }
}

/**
 * 气泡的停留与退场时长，与 `InspirationSection.jsx` 的两个常量同值。
 * 断言「2.5 秒后自动关闭」必须等满两者之和，少一毫秒都会读到还在退场的那个节点。
 */
const TOAST_EXIT_MS = 2500 + 180 + 120

const layout = (container) => container.querySelector('.omnimux-rival-layout')
const accountColumn = (container) => container.querySelector('.omnimux-rival-accounts')
const allButton = (container) => container.querySelector('.omnimux-rival-accounts-all')
const allCount = (container) => container.querySelector('.omnimux-rival-accounts-all-count')?.textContent.trim() || ''
const accountGroups = (container) => Array.from(container.querySelectorAll('.omnimux-rival-account-group'))
const groupTitles = (container) => accountGroups(container)
  .map((group) => group.querySelector('.omnimux-rival-account-group-title')?.textContent.trim() || '')
const menu = (container) => container.querySelector('.omnimux-rival-menu')
const menuItem = (container) => container.querySelector('.omnimux-rival-menu-item')
const menuItemByLabel = (container, label) => [...container.querySelectorAll('.omnimux-rival-menu-item')]
  .find((node) => node.textContent.trim() === label)
const confirmDialog = (container) => container.querySelector('[role="dialog"]')
const dialogButton = (container, label) => [...(confirmDialog(container)?.querySelectorAll('button') || [])]
  .find((node) => node.textContent.trim() === label)
const timeline = (container) => container.querySelector('[data-rival-timeline="true"]')
const timelineItems = (container) => Array.from(container.querySelectorAll('.omnimux-rival-timeline-item'))
const timelineIds = (container) => timelineItems(container).map((node) => node.getAttribute('data-card-id'))
const filterRows = (container) => [...container.querySelectorAll('.omnimux-rival-filter-row')]
const selectedRows = (container) => filterRows(container)
  .filter((node) => node.getAttribute('data-selected') === 'true')
const toast = (container) => container.querySelector('.omnimux-inspiration-toast')
const rowById = (container, id) => filterRows(container).find((node) => node.getAttribute('data-account-id') === id)
const buttonsLabelled = (container, text) => [...container.querySelectorAll('button')]
  .filter((node) => node.textContent.trim() === text)

/** A press outside the menu, which is what dismisses it (the menu listens for pointerdown). */
async function pointerDown(node) {
  const view = node.ownerDocument.defaultView
  await act(async () => {
    node.dispatchEvent(new view.MouseEvent('pointerdown', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** Escape closes the 更多 menu. */
async function pressEscape(mounted) {
  const target = mounted.document.activeElement || mounted.document
  await act(async () => {
    target.dispatchEvent(new mounted.document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** Click the row's 更多 button; the menu must be on screen before the test goes on. */
async function openAccountMenu(mounted, id) {
  const more = rowById(mounted.container, id)?.querySelector('.omnimux-rival-filter-more')
  assert.ok(more, `the row ${id} must carry its 更多 button`)
  await mounted.click(more)
  assert.ok(menu(mounted.container), 'the 更多 button must open the account menu')
  return menu(mounted.container)
}

/** Type into a React-controlled input the way a user would. */
async function typeInto(input, value) {
  const view = input.ownerDocument.defaultView
  const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new view.Event('input', { bubbles: true }))
  })
}

/** Move focus away, which is when the import dialog asks the Host what the link is. */
async function blur(input) {
  const view = input.ownerDocument.defaultView
  await act(async () => {
    input.dispatchEvent(new view.FocusEvent('blur'))
    input.dispatchEvent(new view.FocusEvent('focusout', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** 顶部「导入灵感」弹窗里那个链接输入框，弹窗没开时为 null。 */
const urlInput = (container) => container.querySelector(`input[aria-label="${L.urlLabel}"]`)

/** Rival feed paths requested so far, in order. */
const feedRequests = (mounted) => mounted.calls
  .filter((call) => call.path.includes(`${RIVAL_PREFIX}/posts`))
  .map((call) => new URL(call.path, 'http://localhost').searchParams)
  .map((params) => params.get('accounts'))

after(() => {
  rmSync(cacheDir, { recursive: true, force: true })
})

describe('账号监控 — 账号单选导航（#3451）', () => {
  it('renders the account column beside the content, with 全部 selected by default', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => filterRows(mounted.container).length === ACCOUNTS.length)

      const twoColumns = layout(mounted.container)
      assert.ok(twoColumns, 'the monitor must render as the two-column layout')
      const column = accountColumn(mounted.container)
      assert.ok(column, 'the account column must always be on screen — it is not a popover')
      assert.equal(column.parentElement, twoColumns, 'the account column must be the left column of the layout')
      assert.equal(twoColumns.querySelector('.omnimux-rival-content'), column.nextElementSibling, 'the content column must sit beside the account column')
      assert.ok(column.querySelector('.omnimux-rival-accounts-head'), 'the column must carry its own title')
      assert.ok(column.querySelector('.omnimux-rival-accounts-list'), 'the column must render its own row list')

      // The retired account popover is gone from this tab: no trigger, no panel.
      assert.equal(mounted.container.querySelector('.omnimux-rival-filter-trigger'), null, 'the retired account filter trigger must not render')
      assert.equal(mounted.container.querySelector('.omnimux-rival-filter-panel'), null, 'the retired account filter panel must not render')

      assert.ok(column.textContent.includes(L.columnTitle), 'the column header must name what the list is')
      assert.ok(!column.textContent.includes('选择要查看的账号'), 'the header must not carry the retired hint line')

      // A1：默认「全部」高亮，右侧是全部内容。
      const all = allButton(mounted.container)
      assert.ok(all, 'the column must offer the 全部 target')
      assert.ok(all.classList.contains('is-selected'), '全部 must be the default target')
      assert.equal(all.getAttribute('aria-current'), 'page', 'the default target must be marked as the current page')
      assert.ok(all.textContent.includes(L.all), 'the default target must read 全部')
      assert.equal(allCount(mounted.container), String(ACCOUNTS.length), '全部 must carry the monitored account count')
      assert.equal(timelineItems(mounted.container).length, WORKS.length, 'the default view must show every account\'s works')

      // A3：多选已经删除——没有复选框、没有反选/重置、没有已选摘要。
      assert.equal(column.querySelector('input[type="checkbox"]'), null, 'the column must not render checkboxes any more')
      assert.equal(column.querySelector('.omnimux-rival-filter-check'), null, 'the retired checkbox square must not render')
      assert.equal(column.querySelector('.omnimux-rival-accounts-summary'), null, 'the retired selection summary must not render')
      assert.equal((column.textContent || '').includes('已选'), false, 'the retired「已选 N 个账号」copy must be gone')
      assert.equal(buttonsLabelled(column, zh['rivalFilter.invert']).length, 0, 'the column must not offer 反选')
      assert.equal(buttonsLabelled(column, zh['rivalFilter.reset']).length, 0, 'the column must not offer 重置')

      for (const account of ACCOUNTS) {
        const row = rowById(mounted.container, account.id)
        assert.ok(row, `the column must list ${account.id}`)
        assert.equal(row.querySelector('.omnimux-rival-filter-select').getAttribute('role'), 'button', 'the row main area is a single-select navigation target')
        assert.equal(row.getAttribute('aria-checked'), null, 'a row is no longer a checkbox')
        assert.equal(row.getAttribute('data-selected'), 'false', 'no account is selected while 全部 is active')
        assert.equal(row.getAttribute('aria-current'), null, 'an unselected row carries no aria-current')
      }
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('groups every account under its platform, with the platform label as the group title', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => filterRows(mounted.container).length === ACCOUNTS.length)

      const column = accountColumn(mounted.container)
      assert.ok(column, 'the account column must render on the monitor')
      assert.equal(column.getAttribute('aria-label'), zh['rivalAccounts.column.title'], 'the column must carry the account-list label')

      // A3：每个平台一个分组，组标题就是 t('platform.*') 的文案。
      const titles = groupTitles(mounted.container)
      assert.deepEqual(
        titles.slice().sort(),
        [zh['platform.tiktok'], 'X'].sort(),
        `every platform must get its own titled group (got ${JSON.stringify(titles)})`,
      )
      const groups = accountGroups(mounted.container)
      assert.equal(groups.length, 2, 'the fixture spans exactly two platforms')
      const platformOfTitle = new Map([
        [zh['platform.tiktok'], 'tiktok'],
        ['X', 'x'],
      ])
      for (const group of groups) {
        const title = group.querySelector('.omnimux-rival-account-group-title')?.textContent.trim()
        const platform = platformOfTitle.get(title)
        assert.ok(platform, `the group title must name its platform (got ${JSON.stringify(title)})`)
        const groupedRows = Array.from(group.querySelectorAll('.omnimux-rival-filter-row'))
        assert.ok(groupedRows.length > 0, 'a platform group must list at least one account')
        for (const row of groupedRows) {
          const account = ACCOUNTS.find((entry) => entry.id === row.getAttribute('data-account-id'))
          assert.ok(account, 'every grouped row must belong to a monitored account')
          assert.equal(account.platform, platform, 'a row must sit under its own platform group')
        }
      }

      const rows = filterRows(mounted.container)
      assert.equal(rows.length, ACCOUNTS.length, 'every monitored account must have a row')
      for (const account of ACCOUNTS) {
        const row = rowById(mounted.container, account.id)
        assert.ok(row, `the panel must list ${account.id}`)
        assert.ok(row.textContent.includes(account.nickname), `the row must show ${account.nickname}`)
        assert.ok(row.textContent.includes(account.handle), `the row must show ${account.handle}`)
        assert.equal(row.textContent.includes('个作品'), false, 'the row must not show the account work count')
        assert.equal(row.textContent.includes('正常'), false, 'a healthy row must not spell out its health status')
        assert.equal(row.querySelector('.omnimux-rival-filter-warning'), null, 'a healthy row carries no warning icon')
        assert.equal(row.querySelector('.omnimux-rival-filter-select').getAttribute('role'), 'button', 'the row main area is a single-select navigation target, not a checkbox')
        assert.equal(row.getAttribute('aria-checked'), null, 'a row no longer reports checkbox state')
        assert.ok(row.querySelector('.omnimux-rival-filter-platform svg'), 'the row must draw the platform glyph beside the nickname')
      }
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('switches the timeline to a single account, then back to 全部', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => timelineItems(mounted.container).length === WORKS.length)
      assert.equal(timelineItems(mounted.container).length, WORKS.length, 'both accounts\' works start on screen')

      const all = allButton(mounted.container)
      const alice = rowById(mounted.container, 'ra_alice')
      assert.ok(alice, 'the column must list ra_alice')

      // A2：点一行就只看这个账号；「全部」退位。
      await mounted.click(alice)
      await settle(mounted.container, () => timelineItems(mounted.container).length === 1)
      assert.deepEqual(timelineIds(mounted.container), [WORK_ALICE.row_id], 'clicking an account must show only its works')
      assert.equal(feedRequests(mounted).at(-1), 'ra_alice', 'the request must carry the clicked account')
      assert.equal(alice.getAttribute('data-selected'), 'true', 'the clicked row must be selected')
      assert.equal(alice.querySelector('.omnimux-rival-filter-select').getAttribute('aria-current'), 'true', 'the clicked row is the current page')
      assert.equal(all.classList.contains('is-selected'), false, '全部 must give up the highlight')
      assert.equal(all.getAttribute('aria-current'), null, '全部 is no longer the current page')
      assert.equal(selectedRows(mounted.container).length, 1, 'single-select keeps exactly one row selected')

      // 再点另一个账号：视图跟着换，仍然只有一个选中项。
      const bob = rowById(mounted.container, 'ra_bob')
      await mounted.click(bob)
      await settle(mounted.container, () => timelineIds(mounted.container)[0] === WORK_BOB.row_id)
      assert.deepEqual(timelineIds(mounted.container), [WORK_BOB.row_id], 'the timeline follows the new single selection')
      assert.equal(feedRequests(mounted).at(-1), 'ra_bob', 'the request must carry the newly clicked account')
      assert.equal(alice.getAttribute('data-selected'), 'false', 'the previous row must be released')
      assert.equal(bob.getAttribute('data-selected'), 'true', 'the new row is the only selected one')
      assert.equal(selectedRows(mounted.container).length, 1, 'single-select never accumulates rows')

      // A1：点「全部」回到默认。
      await mounted.click(allButton(mounted.container))
      await settle(mounted.container, () => timelineItems(mounted.container).length === WORKS.length)
      assert.deepEqual(timelineIds(mounted.container), [WORK_ALICE.row_id, WORK_BOB.row_id], '全部 must restore the whole timeline')
      assert.equal(feedRequests(mounted).at(-1), null, '全部 is requested without an accounts parameter')
      assert.ok(allButton(mounted.container).classList.contains('is-selected'), '全部 must be highlighted again')
      assert.equal(allButton(mounted.container).getAttribute('aria-current'), 'page')
      assert.equal(selectedRows(mounted.container).length, 0, 'no row stays selected after 全部')
      assert.equal((mounted.container.textContent || '').includes('已选'), false, 'the retired selection summary must not come back')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('loads the account list once when the row main area is clicked', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => filterRows(mounted.container).length === ACCOUNTS.length)
      const accountsCalls = () => mounted.calls.filter((call) => (
        call.method === 'GET'
        && call.path.includes(RIVAL_PREFIX)
        && !call.path.includes('/posts')
        && !call.path.includes('/status')
      )).length
      const before = accountsCalls()
      await mounted.click(rowById(mounted.container, 'ra_alice').querySelector('.omnimux-rival-filter-select'))
      await settle(mounted.container, () => rowById(mounted.container, 'ra_alice').getAttribute('data-selected') === 'true')
      assert.equal(accountsCalls() - before, 1, 'one click on the row main area must trigger exactly one account reload')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('renders a silent video frame for a HEIC TikTok cover instead of text-only (#3469)', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => timelineItems(mounted.container).length === WORKS.length)
      const row = timelineItems(mounted.container).find((node) => node.getAttribute('data-card-id') === WORK_ALICE.row_id)
      const video = row.querySelector('.omnimux-rival-timeline-video')
      assert.ok(video, 'HEIC video covers must render an inline video preview')
      assert.match(video.getAttribute('src'), /tiktok-video\.mp4#t=0\.1$/, 'the preview must seek to a real first frame')
      assert.equal(video.muted, true, 'the preview must stay silent')
      assert.equal(video.getAttribute('preload'), 'metadata', 'the preview must only fetch metadata')
      assert.equal(row.querySelector('.omnimux-rival-timeline-media img'), null, 'the HEIC <img> must not be used')

      // A broken video must fall back to the platform placeholder, not an empty card.
      await act(async () => {
        video.dispatchEvent(new window.Event('error'))
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
      assert.equal(row.querySelector('.omnimux-rival-timeline-video'), null, 'a failed video must be removed')
      assert.ok(row.querySelector('.omnimux-rival-timeline-media.is-placeholder'), 'a failed video must show the platform placeholder')
      assert.ok(row.querySelector('.omnimux-rival-timeline-placeholder'), 'the placeholder must carry its platform/label content')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('falls back from a failed JPG cover to the video frame or a placeholder (#3469)', async () => {
    const jpgVideo = { ...WORK_BOB, id: 'post_jpg_video', row_id: 'ra_bob:post_jpg_video', cover_src: '/bad-cover.jpg', video_src: 'https://cdn.example/v.mp4' }
    const imagePost = { ...WORK_BOB, id: 'post_image', row_id: 'ra_bob:post_image', type: 'image', cover_src: '/bad-image.jpg', video_src: '' }
    const mounted = await mountStage({ works: [...WORKS, jpgVideo, imagePost] })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => timelineItems(mounted.container).length === WORKS.length + 2)
      const videoRow = timelineItems(mounted.container).find((node) => node.getAttribute('data-card-id') === jpgVideo.row_id)
      const imageRow = timelineItems(mounted.container).find((node) => node.getAttribute('data-card-id') === imagePost.row_id)

      await act(async () => {
        videoRow.querySelector('.omnimux-rival-timeline-media img').dispatchEvent(new window.Event('error'))
        imageRow.querySelector('.omnimux-rival-timeline-media img').dispatchEvent(new window.Event('error'))
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
      assert.ok(videoRow.querySelector('.omnimux-rival-timeline-video'), 'a failed JPG video cover must fall forward to the video frame')
      assert.equal(imageRow.querySelector('.omnimux-rival-timeline-video'), null, 'an image post has no video fallback')
      assert.ok(imageRow.querySelector('.omnimux-rival-timeline-media.is-placeholder'), 'a failed image cover must show the placeholder')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('reveals 更多 on the row and opens the account menu without switching accounts', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => filterRows(mounted.container).length === ACCOUNTS.length)

      const row = rowById(mounted.container, 'ra_alice')
      assert.ok(row, 'the column must list ra_alice')
      const more = row.querySelector('.omnimux-rival-filter-more')
      assert.ok(more, 'the row must carry its 更多 button')
      assert.equal(more.getAttribute('aria-label'), L.more, '更多 is the accessible name of the row action')

      const before = feedRequests(mounted).length
      await mounted.click(more)
      assert.ok(menu(mounted.container), '更多 must open the account menu')
      assert.equal(menu(mounted.container).getAttribute('role'), 'menu', 'the menu must present itself as a menu')
      assert.ok(menuItemByLabel(mounted.container, L.refresh), 'the menu offers 刷新')
      assert.ok(menuItemByLabel(mounted.container, L.remove), 'the menu offers 删除')
      assert.equal(row.getAttribute('data-selected'), 'false', 'opening 更多 must not select the account')
      assert.ok(allButton(mounted.container).classList.contains('is-selected'), '全部 must stay the current target')
      assert.equal(feedRequests(mounted).length, before, 'opening the menu must not reload the feed')

      // A4：Escape 和点外部都关闭菜单。焦点在 更多 上时 Escape 必须冒泡到 document。
      more.focus()
      await pressEscape(mounted)
      assert.equal(menu(mounted.container), null, 'Escape must close the account menu')
      await mounted.click(row.querySelector('.omnimux-rival-filter-more'))
      assert.ok(menu(mounted.container), '更多 must reopen the menu')
      await pointerDown(mounted.document.body)
      assert.equal(menu(mounted.container), null, 'a press outside the menu must close it')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('closes the account menu when the viewport scrolls or resizes (#3467)', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => filterRows(mounted.container).length === ACCOUNTS.length)
      await openAccountMenu(mounted, 'ra_alice')
      assert.ok(menu(mounted.container), 'the menu must open first')
      await act(async () => {
        window.dispatchEvent(new window.Event('scroll'))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      assert.equal(menu(mounted.container), null, 'scrolling must close the anchored menu')

      await openAccountMenu(mounted, 'ra_alice')
      await act(async () => {
        window.dispatchEvent(new window.Event('resize'))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      assert.equal(menu(mounted.container), null, 'resizing must close the anchored menu')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('does not reload when the already-selected account is clicked again (#3467)', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => filterRows(mounted.container).length === ACCOUNTS.length)
      await mounted.click(rowById(mounted.container, 'ra_alice').querySelector('.omnimux-rival-filter-select'))
      await settle(mounted.container, () => rowById(mounted.container, 'ra_alice').getAttribute('data-selected') === 'true')
      const before = mounted.calls.filter((call) => call.method === 'GET').length
      await mounted.click(rowById(mounted.container, 'ra_alice').querySelector('.omnimux-rival-filter-select'))
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)) })
      assert.equal(mounted.calls.filter((call) => call.method === 'GET').length, before, 'a repeated click on the current account must not reload the feed')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('offers a manual refresh action in the 更多 menu (#3467)', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => filterRows(mounted.container).length === ACCOUNTS.length)
      await openAccountMenu(mounted, 'ra_alice')
      await mounted.click(menuItemByLabel(mounted.container, L.refresh))
      const refreshed = await settle(mounted.container, () => mounted.calls.some((call) => call.method === 'POST' && /\/ra_alice\/refresh$/.test(call.path)))
      assert.ok(refreshed, '刷新 must call the single-account manual refresh endpoint')
      assert.equal(menu(mounted.container), null, 'the menu closes after requesting a refresh')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('deletes an account only after a second confirmation, then reloads the column and the timeline', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => filterRows(mounted.container).length === ACCOUNTS.length)
      assert.equal(allCount(mounted.container), '2', 'both accounts are listed before the deletion')

      // 取消路径：不 DELETE、账号保留、弹窗关闭。
      await openAccountMenu(mounted, 'ra_alice')
      await mounted.click(menuItemByLabel(mounted.container, L.remove))
      await mounted.click(dialogButton(mounted.container, L.removeCancel))
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })
      assert.equal(confirmDialog(mounted.container), null, '取消 must close the dialog')
      assert.equal(mounted.calls.filter((call) => call.method === 'DELETE').length, 0, '取消 must not delete')
      assert.ok(rowById(mounted.container, 'ra_alice'), '取消 must keep the account')

      await openAccountMenu(mounted, 'ra_alice')
      await mounted.click(menuItemByLabel(mounted.container, L.remove))
      const dialog = confirmDialog(mounted.container)
      assert.ok(dialog, '删除 must open the confirmation dialog')
      assert.match(dialog.textContent, /确认删除/, 'the dialog must ask for confirmation')
      assert.match(dialog.textContent, /@0xCodez|alice/i, 'the dialog must name the account')
      assert.equal(mounted.calls.filter((call) => call.method === 'DELETE').length, 0, 'opening the dialog must not delete anything')
      assert.ok(rowById(mounted.container, 'ra_alice'), 'the account must still be there while confirming')

      await mounted.click(dialogButton(mounted.container, L.removeConfirm))
      const removed = await settle(mounted.container, () => !rowById(mounted.container, 'ra_alice') && allCount(mounted.container) === '1')
      assert.ok(removed, 'a confirmed deletion must remove the account from the column')

      const deletes = mounted.calls.filter((call) => call.method === 'DELETE')
      assert.equal(deletes.length, 1, 'the deletion is one DELETE request')
      assert.ok(deletes[0].path.endsWith('/ra_alice'), `the DELETE must target the account (got ${deletes[0].path})`)
      assert.equal(menu(mounted.container), null, 'the menu closes once the deletion succeeds')

      // A5：成功后重读作品流与账号列表，被删账号的作品随之消失。
      await settle(mounted.container, () => timelineItems(mounted.container).length === 1)
      assert.deepEqual(timelineIds(mounted.container), [WORK_BOB.row_id], 'the removed account\'s works must leave the timeline')
      const deleteIndex = mounted.calls.findIndex((call) => call.method === 'DELETE')
      const afterDelete = mounted.calls.slice(deleteIndex + 1)
      assert.ok(afterDelete.some((call) => call.path.includes(`${RIVAL_PREFIX}/posts`)), 'the works must be re-read after the deletion')
      assert.ok(
        afterDelete.some((call) => call.method === 'GET' && call.path.includes(RIVAL_PREFIX) && !call.path.includes('/posts')),
        'the account list must be re-read after the deletion',
      )
      assert.ok(allButton(mounted.container).classList.contains('is-selected'), 'deleting another account must keep 全部 current')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('keeps the row and reports the failure when the deletion is rejected', async () => {
    const mounted = await mountStage({ removeStatus: 500 })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => filterRows(mounted.container).length === ACCOUNTS.length)

      await openAccountMenu(mounted, 'ra_alice')
      await mounted.click(menuItemByLabel(mounted.container, L.remove))
      await mounted.click(dialogButton(mounted.container, L.removeConfirm))
      const shown = await settle(
        mounted.container,
        () => (confirmDialog(mounted.container)?.textContent || '').includes(L.removeFailed),
      )
      assert.ok(shown, 'a rejected deletion must surface its error in the dialog message')
      assert.ok(confirmDialog(mounted.container).textContent.includes(L.removeFailed), 'the failure must use the dialog copy')
      assert.ok(rowById(mounted.container, 'ra_alice'), 'a rejected deletion must keep the account row')
      assert.equal(allCount(mounted.container), '2', 'the column keeps the failed account')
      assert.equal(filterRows(mounted.container).length, 2, 'no other row may disappear on a failure')
      assert.equal(mounted.calls.filter((call) => call.method === 'DELETE').length, 1, 'the rejection is reported, not retried')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('keeps the row and reports the failure when DELETE rejects at the transport layer', async () => {
    const mounted = await mountStage({ failPaths: [/\/ra_alice$/] })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => rowById(mounted.container, 'ra_alice'))
      await mounted.click(rowById(mounted.container, 'ra_alice').querySelector('.omnimux-rival-filter-more'))
      await settle(mounted.container, () => Boolean(menu(mounted.container)))
      await mounted.click(menuItemByLabel(mounted.container, L.remove))
      await mounted.click(dialogButton(mounted.container, L.removeConfirm))
      await settle(mounted.container, () => (confirmDialog(mounted.container)?.textContent || '').includes('删除失败'))
      assert.ok(confirmDialog(mounted.container).textContent.includes('删除失败'), 'a rejected DELETE must surface the failure copy')
      assert.ok(rowById(mounted.container, 'ra_alice'), 'the account must stay when the DELETE network call fails')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('returns to 全部 when the currently selected account is deleted', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => timelineItems(mounted.container).length === WORKS.length)
      await mounted.click(rowById(mounted.container, 'ra_alice'))
      await settle(mounted.container, () => timelineItems(mounted.container).length === 1)
      assert.equal(feedRequests(mounted).at(-1), 'ra_alice', 'the account must be the current selection before it is removed')
      assert.equal(allButton(mounted.container).classList.contains('is-selected'), false)

      await openAccountMenu(mounted, 'ra_alice')
      await mounted.click(menuItemByLabel(mounted.container, L.remove))
      await mounted.click(dialogButton(mounted.container, L.removeConfirm))
      const removed = await settle(
        mounted.container,
        () => !rowById(mounted.container, 'ra_alice') && allButton(mounted.container)?.classList.contains('is-selected') === true,
      )
      assert.ok(removed, 'removing the current account must fall back to 全部')
      assert.equal(allButton(mounted.container).getAttribute('aria-current'), 'page', '全部 must become the current page again')
      assert.equal(selectedRows(mounted.container).length, 0, 'the deleted row must not leave a selection behind')

      await settle(mounted.container, () => timelineItems(mounted.container).length === 1)
      assert.deepEqual(timelineIds(mounted.container), [WORK_BOB.row_id], '全部 after the deletion shows the remaining account\'s works')
      const deleteIndex = mounted.calls.findIndex((call) => call.method === 'DELETE')
      const afterDelete = mounted.calls.slice(deleteIndex + 1)
      const afterFeeds = afterDelete.filter((call) => call.path.includes(`${RIVAL_PREFIX}/posts`))
      assert.ok(afterFeeds.length > 0, 'the fallback to 全部 must refetch the works')
      assert.ok(
        afterFeeds.some((call) => new URL(call.path, 'http://localhost').searchParams.get('accounts') === null),
        'the refetch after deleting the current account must be「全部」',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('opens a creator profile from the row without touching the selection', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => Boolean(rowById(mounted.container, 'ra_alice')))
      const before = feedRequests(mounted).length

      const jump = rowById(mounted.container, 'ra_alice')
        ?.querySelector(`[aria-label="${L.openProfile}"]`)
      assert.ok(jump, 'the row must carry a profile button')
      await mounted.click(jump)
      await settle(mounted.container, () => mounted.opened.length > 0)

      assert.deepEqual(mounted.opened, [ACCOUNTS[0].profile_url], 'the profile must open in a new tab')
      assert.ok(allButton(mounted.container).classList.contains('is-selected'), 'opening a profile must keep 全部 current')
      assert.equal(selectedRows(mounted.container).length, 0, 'opening a profile must not select a row')
      assert.equal(
        feedRequests(mounted).length,
        before,
        'opening a profile must not refetch the works',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

})

describe('账号监控 — 作品网格流', () => {
  it('renders the works as one native-looking timeline, newest first, with hover actions', async () => {
    // Host order is deliberately oldest-first: the timeline owns the order.
    const mounted = await mountStage({ works: [WORK_BOB, WORK_ALICE] })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => timelineItems(mounted.container).length === WORKS.length)

      const feed = timeline(mounted.container)
      assert.ok(feed, 'the works must render in the single-column timeline')
      assert.equal(feed.getAttribute('role'), 'feed', 'the timeline must present itself as a feed')
      assert.equal(mounted.container.querySelector('.omnimux-rival-masonry'), null, 'the retired masonry must not render on the monitor')
      assert.equal(mounted.container.querySelector('.omnimux-rival-card'), null, 'the retired work card must not render on the monitor')
      assert.deepEqual(
        timelineIds(mounted.container),
        [WORK_ALICE.row_id, WORK_BOB.row_id],
        'rows must be sorted by publish time, newest first, whatever order the Host returned',
      )
      assert.equal(timelineItems(mounted.container).length, WORKS.length, 'one row per work')

      const first = timelineItems(mounted.container)[0]
      assert.equal(first.getAttribute('data-platform'), 'tiktok')
      assert.ok(first.querySelector('.omnimux-rival-timeline-avatar'), 'every row must carry the author avatar slot')
      assert.equal(first.querySelector('.omnimux-rival-timeline-author')?.textContent, WORK_ALICE.account.nickname)
      assert.equal(first.querySelector('.omnimux-rival-timeline-handle')?.textContent, WORK_ALICE.account.handle)
      assert.ok(first.querySelector('.omnimux-rival-timeline-platform svg'), 'the row must draw the platform mark')
      assert.ok((first.querySelector('.omnimux-rival-timeline-time')?.textContent || '').includes('·'), 'the row must carry the relative publish time')
      assert.equal(first.querySelector('.omnimux-rival-timeline-body')?.textContent, WORK_ALICE.title)
      assert.ok(first.querySelector('.omnimux-rival-timeline-media'), 'media rows must reserve their media block')
      assert.ok(first.querySelector('.omnimux-rival-timeline-play'), 'video rows must carry a play badge')
      const metrics = first.querySelector('.omnimux-rival-timeline-metrics')?.textContent || ''
      for (const labelText of [zh['rivalAccounts.post.views'], zh['rivalAccounts.post.likes'], zh['rivalAccounts.post.comments'], zh['rivalAccounts.post.shares']]) {
        assert.ok(metrics.includes(labelText), `the metrics line must name「${labelText}」`)
      }
      const actions = Array.from(first.querySelectorAll('[data-act]')).map((node) => node.getAttribute('data-act'))
      assert.deepEqual(actions, ['original', 'replicate', 'deconstruct', 'markDone'], 'the hover row must carry every monitor action through the real panel wiring')
      assert.ok(first.textContent.includes(L.replicate), 'the replicate action must read 立即复刻')

      // 「标为已处理」must flip the row optimistically (#3432 review P2-1).
      await mounted.click(first.querySelector('[data-act="markDone"]'))
      await settle(mounted.container, () => first.classList.contains('is-done'))
      assert.equal(first.classList.contains('is-done'), true, 'mark-done must flip the row without a reload')
      assert.equal(first.querySelector('[data-act="markDone"]'), null, 'a processed row must not offer mark-done twice')
      assert.equal(
        first.querySelector('.omnimux-rival-timeline-state')?.textContent,
        zh['rivalFeed.card.done'],
        'the processed row must name its state',
      )

      // The browse-summary line was retired (#3430): the page leads straight
      // into the timeline, and neither the row nor its copy may return.
      assert.equal(
        mounted.container.querySelector('[data-rival-summary]'),
        null,
        'the retired summary line must not render above the timeline',
      )
      assert.equal(
        mounted.container.querySelector('.omnimux-rival-summary'),
        null,
        'the retired summary classes must not render either',
      )
      assert.equal(
        (mounted.container.textContent || '').includes('正在浏览'),
        false,
        'the retired summary copy must go with its line',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('opens a detail dialog that reads as a work, not as a library item', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => timelineItems(mounted.container).length === WORKS.length)

      // The timeline row itself opens the detail dialog; there is no separate
      // 详情 button.
      const item = timelineItems(mounted.container)[0]
      assert.ok(item, 'a timeline row must be on screen')
      await mounted.click(item)
      await settle(mounted.container, () => (mounted.container.textContent || '').includes(zh['rivalFeed.detail.title']))

      const text = mounted.container.textContent || ''
      assert.ok(text.includes(zh['rivalFeed.detail.title']), 'the dialog must title itself')
      assert.ok(text.includes(WORK_ALICE.title), 'the dialog must show the work title')
      assert.ok(text.includes('@alice'), 'the dialog must name the creator')
      assert.ok(
        text.includes(zh['rivalFeed.detail.original']),
        'the dialog must offer the original post',
      )
      // A monitored work is not a library entry: none of the library-only
      // actions may appear in its dialog. Scoped to the dialog — the page around
      // it legitimately offers other actions.
      const dialog = mounted.container.querySelector('[role="dialog"]')
      assert.ok(dialog, 'the detail dialog must render as a dialog')
      for (const libraryOnly of [zh['card.cta.addToConversation'], zh['rivalAccounts.post.toInspiration']]) {
        assert.equal(
          (dialog.textContent || '').includes(libraryOnly),
          false,
          `the detail dialog must not offer the library action「${libraryOnly}」`,
        )
      }
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('shows the library shimmer skeleton while the first request is in flight', async () => {
    const mounted = await mountStage({ works: [] })
    try {
      // No await before the assertion: the first paint is the state under test.
      const button = mounted.container.querySelector('[data-tab="rivals"]')
      await act(async () => {
        button.dispatchEvent(new mounted.document.defaultView.MouseEvent('click', { bubbles: true }))
      })
      const skeleton = mounted.container.querySelector('[data-rival-skeleton="true"]')
      const claimed = (mounted.container.textContent || '').includes(zh['rivalFeed.empty.noPostsTitle'])
      assert.ok(
        skeleton || claimed,
        'the tab must either shimmer or report the settled empty state, never nothing',
      )
      assert.equal(
        skeleton !== null && claimed,
        false,
        'a skeleton and a settled empty state must not be on screen together',
      )
      if (skeleton) {
        assert.equal(
          skeleton.querySelectorAll('.omnimux-inspiration-skel').length,
          10,
          'the skeleton must be the library\'s own 10-block shimmer',
        )
      }
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('offers the import action, not a filter reset, when no account is monitored', async () => {
    const mounted = await mountStage({ accounts: [], works: [] })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => (mounted.container.textContent || '').includes(zh['rivalFeed.empty.noAccounts']))
      const text = mounted.container.textContent || ''
      assert.ok(text.includes(zh['rivalFeed.empty.noAccounts']), 'the no-account empty state must explain itself')
      assert.ok(
        buttonsLabelled(mounted.container, L.importBtn).length > 0,
        'the no-account empty state must offer the import dialog',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

/**
 * 空态与导入反馈。
 *
 * 两条被用户报上来的缺陷，各自钉在这里：
 *
 *   - 作品为空的账号监控曾经只剩一行灰字，没有图标的层级，也没有任何出路；
 *     作品为空时它还要顺带把「显示 0 个作品」的摘要行一起收掉，留白就是留白；
 *   - 在账号监控页导入账号时，弹窗关掉之后界面上什么都没发生 —— 重读作品流与
 *     账号筛选器、以及一句成功提示，是这次修复必须留下的痕迹。
 */
describe('账号监控 — 空态与导入反馈', () => {
  it('renders the shared empty state with its vector icon, copy and action, and no summary line', async () => {
    const mounted = await mountStage({ works: [] })
    try {
      await mounted.openAccountTab()
      const shown = await settle(
        mounted.container,
        () => (mounted.container.textContent || '').includes(zh['rivalFeed.empty.noPostsTitle']),
      )
      assert.ok(shown, 'monitored accounts without works must say so')

      const empty = mounted.container.querySelector('.dshUk-EmptyState-emptyState')
      assert.ok(empty, 'the empty state must be the shared kit component, not a hand-written paragraph')

      // 层级：矢量图标 → 标题 → 描述 → 操作。缺一层就退回成「一屏灰字」。
      const icon = empty.querySelector('.dshUk-EmptyState-iconWrap svg')
      assert.ok(icon, 'the empty state must open with a vector SVG icon — never a character or an emoji')
      assert.equal(icon.getAttribute('aria-hidden'), 'true', 'a decorative icon must stay out of the a11y tree')

      assert.equal(
        empty.querySelector('.dshUk-EmptyState-title')?.textContent,
        zh['rivalFeed.empty.noPostsTitle'],
        'the empty state must carry its own title',
      )
      assert.equal(
        empty.querySelector('.dshUk-EmptyState-description')?.textContent,
        zh['rivalFeed.empty.noPostsDesc'],
        'the empty state must explain what happens next',
      )
      assert.ok(
        buttonsLabelled(empty, L.importBtn).length > 0,
        'an empty grid must offer a way out of itself',
      )

      // 摘要行（#3430 已删除）在空态同样不得出现。
      assert.equal(
        mounted.container.querySelector('[data-rival-summary]'),
        null,
        'an empty grid must not carry the retired summary line',
      )
      assert.equal(
        (mounted.container.textContent || '').includes('正在浏览'),
        false,
        'the retired summary copy must not return on an empty grid',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('reloads the feed, refreshes the account filter and reports success on an account import', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => timelineItems(mounted.container).length === WORKS.length)

      const postsBefore = feedRequests(mounted).length

      // 用户就在账号监控页上，从顶部「导入灵感」弹窗粘贴账号主页链接。
      await mounted.click(buttonsLabelled(mounted.container, L.topImport)[0])
      const input = urlInput(mounted.container)
      assert.ok(input, 'the top import dialog must render its URL field')
      await typeInto(input, NEW_ACCOUNT_URL)
      await blur(input)
      await mounted.click(buttonsLabelled(mounted.container, L.submit)[0])

      const imported = await settle(
        mounted.container,
        () => (mounted.container.textContent || '').includes(L.importSuccess('@gethullo')),
      )
      assert.ok(
        imported,
        'closing the dialog on a successful account import must leave a confirmation behind',
      )
      assert.equal(
        urlInput(mounted.container),
        null,
        'the dialog must close once the account is imported',
      )

      // 确认必须浮在内容之上，而不是插进内容流：以前那条通知条每次导入都把
      // 账号列表和作品网格整体下推一行。
      const pill = toast(mounted.container)
      assert.ok(pill, 'an account import must confirm itself in the top toast')
      assert.equal(
        pill.closest('.omnimux-rival-root'),
        null,
        'the confirmation must float above the content area, not sit inside it',
      )
      assert.equal(
        mounted.container.querySelector('.omnimux-rival-notice'),
        null,
        'a successful import must not render a notice bar in the content area',
      )
      assert.equal(pill.getAttribute('role'), 'status', 'the toast must announce itself to assistive tech')
      assert.ok(
        pill.querySelector('.omnimux-inspiration-toast-icon svg'),
        'the toast must draw its own vector tick — never a character or an emoji',
      )
      assert.ok(
        (pill.textContent || '').includes(L.importSuccess('@gethullo')),
        'the toast must name the account that was just added',
      )

      const createIndex = mounted.calls.findIndex(
        (call) => call.method === 'POST' && call.path.includes(RIVAL_PREFIX),
      )
      assert.ok(createIndex >= 0, 'the account import must reach the Host')
      const after = mounted.calls.slice(createIndex + 1)
      assert.ok(
        after.some((call) => call.path.includes(`${RIVAL_PREFIX}/posts`)),
        'the works feed must be re-read immediately, not on the next tab switch',
      )
      assert.ok(
        after.some((call) => call.method === 'GET'
          && call.path.includes(RIVAL_PREFIX)
          && !call.path.includes('/posts')),
        'the account list behind the filter must be re-read as well',
      )
      assert.ok(
        feedRequests(mounted).length > postsBefore,
        'the reload must be a new request, not the one already in flight',
      )

      // 重读的成果要看见：新账号出现在常驻账号列里，不需要手动打开任何弹层。
      await settle(mounted.container, () => rowById(mounted.container, NEW_ACCOUNT_ID))
      assert.ok(
        rowById(mounted.container, NEW_ACCOUNT_ID),
        'the imported account must be listed in the account column without a manual refresh',
      )

      // 气泡自己走：2.5 秒后淡出，不留下一条需要人来关掉的通知。
      assert.ok(toast(mounted.container), 'the toast must still be up while it is being read')
      await waitFor(TOAST_EXIT_MS)
      assert.equal(
        toast(mounted.container),
        null,
        'the toast must close itself after its 2.5s instead of waiting to be dismissed',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

/**
 * 第三轮整改的三条缺陷（QA 复审 N 项 + OCR 行级意见），各自一条钉测。
 *
 * The library row the「AI 拆解」endpoint is scripted to return: a *local
 * inspiration item*, which is the point — it has `id`/`title`/`source_url`
 * but no `account_id`/`post_id`. Whatever handler the modal's「立即复刻」
 * reaches for must be the inspiration chain, not the rival-post one.
 */
const LOCAL_ITEM = {
  id: 'insp-3110',
  title: '拆解入库的作品',
  content: '用于下一次创作的完整原帖正文',
  type: 'video',
  source_url: 'https://www.tiktok.com/@alice/video/1',
  source_platform: 'tiktok',
  is_local: true,
}

describe('账号监控 — 第三轮整改回执', () => {
  it('routes selected references from the deconstruct modal to the inspiration chain, not the rival handler', async () => {
    const mounted = await mountStage({ localItems: { 'insp-3110': LOCAL_ITEM } })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => timelineItems(mounted.container).length === WORKS.length)

      const row = timelineItems(mounted.container)[0]
      await mounted.click(row.querySelector('[data-act="deconstruct"]'))
      const modalReady = await settle(
        mounted.container,
        () => mounted.container.querySelector('.omnimux-inspiration-modal-replicate'),
      )
      assert.ok(modalReady, 'the deconstruct modal must open on the converted library item')

      const callsBefore = mounted.calls.length
      await mounted.click(mounted.container.querySelector('.omnimux-post-original [aria-pressed]'))
      await mounted.click(mounted.container.querySelector('.omnimux-inspiration-modal-replicate'))
      const drawer = mounted.container.querySelector('.omnimux-post-creation-drawer')
      assert.ok(drawer, 'selected references must be reviewed in the creation drawer')
      await mounted.click([...drawer.querySelectorAll('button')].find(node => node.textContent === zh['post.useInChat']))
      await settle(
        mounted.container,
        () => mounted.container.querySelector('.omnimux-rival-notice'),
      )

      const after = mounted.calls.slice(callsBefore)
      const prepared = after.filter(call => call.path === '/omnimux/inspiration/local/insp-3110/creation-reference' && call.method === 'POST')
      assert.equal(prepared.length, 1, 'prepare the selected references before invoking the inspiration handoff')
      assert.deepEqual(prepared[0].body.draft.references, [{ kind: 'body' }])
      assert.ok(prepared[0].body.draft.text.includes(LOCAL_ITEM.source_url))
      assert.ok(mounted.container.querySelector('.omnimux-post-creation-drawer'), 'the failed awaited handoff must leave the drawer available for retry')
      const rivalChainHits = after.filter((call) => /\/posts\/.+\/(media|to-inspiration)/.test(call.path))
      assert.deepEqual(
        rivalChainHits.map((call) => call.path),
        [],
        'the modal hands back a library item — the rival replicate chain must not run on it',
      )
      assert.equal(
        after.some((call) => call.path.includes('account_id=undefined') || call.path.includes('/undefined/')),
        false,
        'no request may be built from the item\'s missing account_id',
      )

      // The visible answer: the panel surfaces the inspiration chain's own
      // status. With no sessions service bound in this harness the chain's
      // honest reply is newSessionFailed — anything else (or silence) means
      // the click went somewhere it should not have.
      const notice = mounted.container.querySelector('.omnimux-rival-notice')
      assert.ok(notice, 'the replicate click must leave a user-visible answer')
      assert.ok(
        (notice.textContent || '').includes(zh['card.cta.newSessionFailed']),
        `expected the inspiration chain's status (got ${JSON.stringify(notice.textContent)})`,
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('reports a transport-level deconstruct failure instead of leaking a rejection', async () => {
    const unhandled = []
    const onUnhandled = (reason) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    const mounted = await mountStage({ failPaths: [/to-inspiration/] })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => timelineItems(mounted.container).length === WORKS.length)

      const button = timelineItems(mounted.container)[0].querySelector('[data-act="deconstruct"]')
      const requestsBefore = mounted.calls.filter((call) => call.path.includes('to-inspiration')).length
      await mounted.click(button)
      const shown = await settle(
        mounted.container,
        () => (mounted.container.querySelector('.omnimux-rival-notice')?.textContent || '')
          .includes(zh['rivalAccounts.post.attachFailed']),
      )
      assert.ok(shown, 'a rejected convert must surface the failure notice, not silence')

      // The busy flag must be released: a second click is a second request.
      await mounted.click(button)
      await settle(
        mounted.container,
        () => mounted.calls.filter((call) => call.path.includes('to-inspiration')).length > requestsBefore + 1,
      )
      const convertCalls = mounted.calls.filter((call) => call.path.includes('to-inspiration')).length
      assert.ok(convertCalls >= requestsBefore + 2, `busy must clear so the retry can run (got ${convertCalls})`)

      await new Promise((resolve) => setTimeout(resolve, 30))
      assert.deepEqual(unhandled, [], 'the deconstruct handler must not leak an unhandled rejection')
    } finally {
      process.off('unhandledRejection', onUnhandled)
      await mounted.unmount()
      mounted.close()
    }
  })

  it('never offers a profile jump for a non-http(s) URL', async () => {
    const evil = { ...ACCOUNTS[0], id: 'ra_evil', profile_url: 'javascript:alert(1)' }
    const mounted = await mountStage({ accounts: [evil], works: [] })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => filterRows(mounted.container).length > 0)

      const jump = rowById(mounted.container, 'ra_evil')
        ?.querySelector(`[aria-label="${L.openProfile}"]`)
      assert.ok(jump, 'the row still carries its profile button slot')
      assert.equal(jump.disabled, true, 'a non-http(s) profile URL must disable the jump')
      const openedBefore = mounted.opened.length
      await mounted.click(jump)
      assert.equal(mounted.opened.length, openedBefore, 'window.open must not run for a refused scheme')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('wires the real locale into every count and time the card shows (N1)', async () => {
    // Mounted-level en coverage lives in rival-post-card.test.js; this gate pins
    // the wiring itself at the sources so the locale cannot silently stop
    // reaching the formatters again — the exact way N1 came back.
    const { readFileSync } = await import('node:fs')
    const card = readFileSync(join(here, 'RivalPostCard.jsx'), 'utf8')
    assert.match(card, /rivalLocaleOf\(t\)/, 'the card must derive its locale from t()')
    assert.match(card, /formatRelativeTime\(card\?\.posted_at,\s*Date\.now\(\),\s*locale\)/, 'posted time must be formatted with the card\'s locale')
    assert.match(card, /formatEngagementCount\(stats\.(likes|comments|shares),\s*locale\)/, 'engagement counts must be formatted with the card\'s locale')
    assert.match(card, /formatCount\(views,\s*locale\)/, 'view count must be formatted with the card\'s locale')
    assert.match(card, /stats\.views >= 0/, 'unknown views (-1 sentinel) must be shown as the -- marker, never a negative count')
    // The monitor itself renders `RivalTimelineRow` now; it must derive the same
    // locale from the same `t()`.
    const timelineRow = readFileSync(join(here, 'RivalTimelineRow.jsx'), 'utf8')
    assert.match(timelineRow, /rivalLocaleOf\(t\)/, 'the timeline row must derive its locale from t()')
    assert.match(timelineRow, /formatRelativeTime\(card\?\.posted_at,\s*Date\.now\(\),\s*locale\)/, 'the timeline time must follow the same locale')
    assert.match(timelineRow, /formatEngagementCount\(stats\.(likes|comments|shares),\s*locale\)/, 'the timeline engagement counts must follow the same locale')
    assert.match(timelineRow, /formatCount\(views,\s*locale\)/, 'the timeline view count must follow the same locale')
    assert.match(timelineRow, /stats\.views >= 0/, 'the timeline must keep the -1 views sentinel out of the count')
    const modal = readFileSync(join(here, 'RivalPostPreviewModal.jsx'), 'utf8')
    assert.match(modal, /rivalLocaleOf\(t\)/, 'the detail dialog must derive the same locale')
    assert.match(modal, /formatRelativeTime\(row\.posted_at,\s*Date\.now\(\),\s*locale\)/, 'the detail dialog time must follow the same locale')
    assert.match(modal, /formatCount\(value,\s*locale\)/, 'the detail dialog stats must follow the same locale')
    const column = readFileSync(join(here, 'RivalAccountColumn.jsx'), 'utf8')
    assert.match(column, /rivalLocaleOf\(t\)/, 'the account column must derive the same locale')
    assert.match(column, /formatCount\(list\.length,\s*locale\)/, 'the 全部 count must follow the same locale')
    const accountRow = readFileSync(join(here, 'RivalAccountFilter.jsx'), 'utf8')
    assert.doesNotMatch(accountRow, /formatCount\(row\.postCount/, 'the compact row must not format a work count any more')
  })
})
