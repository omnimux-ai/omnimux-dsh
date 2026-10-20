import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { DOM_RENDER_LOADERS } from './test-fixtures/dom-render-build.mjs'
import { JSDOM } from 'jsdom'
import './test-fixtures/dom-bootstrap.mjs'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { zh } from './locales.js'

/**
 * #3111 监控池状态条与账号健康态的渲染契约（规格 §2.2 R3/R4、§8.1）。
 *
 * Mounted the same way `account-monitor-feed-render.test.js` mounts: the real
 * `InspirationStage` bundled by esbuild, in jsdom, with `dsh-ui-kit`'s leaf
 * components replaced by `test-fixtures/ui-kit-shim.mjs`. What this file pins
 * down, word for word from the spec dictionary:
 *
 *   - the pool bar renders exactly one row carrying the refresh allowance and
 *     (when a refresh fact exists) the freshness text — the account-tally line
 *     is gone, so neither `监控池` nor `待重导入` appears in the bar;
 *   - the account row shows one of four health marks, the two terminal marks
 *     carry a resident reason line, and「已停止」is the only row with 重试;
 *   - `重试` hands the account back to `queued` — the row returns to `正常`
 *     in the same reload;
 *   - the refresh button greys but stays clickable under quota / stopped /
 *     cooldown, and its D4 popover names exactly one reason.
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const sourceEntry = join(here, 'InspirationStage.jsx')
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')
const cacheDir = join(here, '.esbuild-cache', 'pool-health')

const RIVAL_PREFIX = '/omnimux/inspiration/local/rival-accounts'
const REQUEST_BUDGET = 160

const NOW = Date.now()
const isoMinutesAgo = (minutes) => new Date(NOW - minutes * 60_000).toISOString()
const isoMinutesAhead = (minutes) => new Date(NOW + minutes * 60_000).toISOString()

/**
 * 四态各一账号：正常 / 冷却 / 待重导入 / 已停止。另有用例把「已停止」账号的
 * `consecutive_failures` 置空，覆盖原因行缺失时的健康态分支。
 */
const ACCOUNTS = [
  {
    id: 'ra_ok',
    nickname: '喵星日常',
    handle: '@meow_daily',
    platform: 'tiktok',
    profile_url: 'https://www.tiktok.com/@meow_daily',
    refresh_state: 'idle',
    error_code: null,
    consecutive_failures: 0,
    last_refresh_at: isoMinutesAgo(3),
    post_count: 3,
  },
  {
    id: 'ra_cool',
    nickname: '毛孩子食堂',
    handle: '@fur_kitchen',
    platform: 'tiktok',
    profile_url: 'https://www.tiktok.com/@fur_kitchen',
    refresh_state: 'backoff',
    error_code: 'cloud-error',
    consecutive_failures: 1,
    next_auto_refresh_at: isoMinutesAhead(42),
    last_refresh_at: isoMinutesAgo(30),
    post_count: 1,
  },
  {
    id: 'ra_reimport',
    nickname: '科技小辛',
    handle: '@tech_xin',
    platform: 'youtube',
    profile_url: 'https://www.youtube.com/@tech_xin',
    refresh_state: 'error',
    error_code: 'identity-unverified',
    consecutive_failures: 1,
    last_refresh_at: isoMinutesAgo(60),
    post_count: 0,
  },
  {
    id: 'ra_stopped',
    nickname: '穿搭研究所',
    handle: '@ootd_lab',
    platform: 'instagram',
    profile_url: 'https://www.instagram.com/ootd_lab',
    refresh_state: 'error',
    error_code: 'cloud-error',
    consecutive_failures: 3,
    next_auto_refresh_at: null,
    last_refresh_at: isoMinutesAgo(120),
    post_count: 1,
  },
]

const STATUS = {
  running: [],
  queued: [],
  paused: { global: false, reason: null, paused_at: null },
  budget_used: { global_calls: 4, per_account: {} },
  budget_limits: { cloud_calls_global_per_day: 50 },
  next_auto_at: null,
  per_account_paused: [],
}

const CONFIG_SUMMARY = {
  refresh_interval_hours: 24,
  posts_per_refresh: 20,
  limits: {
    cloud_calls_per_account_per_cycle: 2,
    cloud_calls_per_account_per_day: 4,
    cloud_calls_global_per_day: 50,
  },
  poll_interval_ms: 2500,
}

let bundleCounter = 0

async function bundleStage() {
  mkdirSync(cacheDir, { recursive: true })
  const outFile = join(cacheDir, `pool-health-${bundleCounter}.mjs`)
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
 * @param {{ accounts?: Array<object>, status?: object, refreshResponse?: { status: number, body: object } }} [options]
 */
async function mountStage(options = {}) {
  const accounts = (options.accounts ?? ACCOUNTS).map((account) => ({ ...account }))
  const status = options.status ?? { ...STATUS, budget_used: { ...STATUS.budget_used }, budget_limits: { ...STATUS.budget_limits } }
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
  window.__omnimuxAuth = { ensureLogin() {} }
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  const calls = []
  globalThis.fetch = async (url, fetchOptions = {}) => {
    const path = String(url)
    const method = fetchOptions?.method ?? 'GET'
    calls.push({ path, method })
    if (calls.length > REQUEST_BUDGET) {
      throw new Error(`request storm: ${calls.length} calls, last ${method} ${path}`)
    }
    if (path.includes(`${RIVAL_PREFIX}/posts`)) {
      return jsonResponse(200, {
        success: true,
        data: { items: [], total: 0, page: 1, page_size: 20, has_more: false, requested_accounts: [] },
      })
    }
    if (path.includes(`${RIVAL_PREFIX}/status`)) {
      return jsonResponse(200, { success: true, data: status })
    }
    if (path.includes(`${RIVAL_PREFIX}/refresh-all`)) {
      return jsonResponse(202, { success: true, data: { queued: accounts.map((a) => a.id), skipped: [] } })
    }
    const retryMatch = path.match(new RegExp(`${RIVAL_PREFIX}/([^/]+)/refresh$`))
    if (retryMatch && method === 'POST') {
      if (options.refreshResponse) return jsonResponse(options.refreshResponse.status, options.refreshResponse.body)
      const target = accounts.find((account) => account.id === decodeURIComponent(retryMatch[1]))
      if (target) {
        target.refresh_state = 'queued'
        target.error_code = null
      }
      return jsonResponse(202, {
        success: true,
        data: { account_id: decodeURIComponent(retryMatch[1]), job: 'running', status: 'queued' },
      })
    }
    if (path.includes(RIVAL_PREFIX) && method === 'GET') {
      return jsonResponse(200, {
        success: true,
        data: {
          // 克隆模拟 JSON 往返：同一个数组引用会让 React 的 setAccounts bail out。
          items: accounts.map((account) => ({ ...account })),
          total: accounts.length,
          config_summary: CONFIG_SUMMARY,
        },
      })
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
    async click(node) {
      assert.ok(node, 'the node to click must exist')
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
    async openAccountTab() {
      const button = container.querySelector('[data-tab="rivals"]')
      assert.ok(button, 'the tab bar must render the 账号监控 tab')
      await act(async () => {
        button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      await settle(container, () => button.getAttribute('aria-pressed') === 'true')
      assert.equal(button.getAttribute('aria-pressed'), 'true')
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

async function settle(container, predicate) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (predicate()) return true
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
  return false
}

const poolBar = (container) => container.querySelector('[data-rival-pool="true"]')
const filterRows = (container) => [...container.querySelectorAll('.omnimux-rival-filter-row')]
const rowById = (container, id) => filterRows(container).find((node) => node.getAttribute('data-account-id') === id)
const reasonPopover = (container) => container.querySelector('.omnimux-rival-refresh-wrap .omnimux-rival-reason')
const refreshButton = (container) => container.querySelector('.omnimux-rival-refresh')

after(() => {
  rmSync(cacheDir, { recursive: true, force: true })
})

describe('R3 监控池状态条已移除', () => {
  it('账号监控有账号时不再渲染额度/更新于状态条', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => refreshButton(mounted.container))
      assert.equal(poolBar(mounted.container), null, '状态条整行不再渲染')
      const text = mounted.container.textContent || ''
      assert.ok(!text.includes('今日剩余刷新额度'), '页面不再出现额度文案')
      assert.ok(!text.includes('数据更新于'), '页面不再出现新鲜度文案')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('E1 空态（无监控账号）状态条与刷新按钮都不出现（规格 B9）', async () => {
    const mounted = await mountStage({ accounts: [] })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () =>
        (mounted.container.textContent || '').includes('还没有监控账号')
        || (mounted.container.textContent || '').includes('暂无监控作品'))
      assert.equal(poolBar(mounted.container), null, '无账号时状态条不出现')
      assert.equal(refreshButton(mounted.container), null, '无账号时刷新按钮不出现')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

describe('D1 账号行四态健康标记（#3111）', () => {
  it('四态收敛为警告图标：正常无标记，冷却/重导入/停止只露图标与悬停原因', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => filterRows(mounted.container).length === ACCOUNTS.length)

      const ok = rowById(mounted.container, 'ra_ok')
      assert.equal(ok.getAttribute('data-health'), 'normal')
      assert.equal(ok.textContent.includes('正常'), false, '正常行不再显示状态文字')
      assert.equal(ok.querySelector('.omnimux-rival-filter-warning'), null, '正常行没有警告图标')

      const cooling = rowById(mounted.container, 'ra_cool')
      assert.equal(cooling.getAttribute('data-health'), 'cooling')
      assert.equal(cooling.querySelector('.omnimux-rival-filter-select').textContent.includes('冷却中'), false, '冷却行不再显示状态文字')
      const coolingWarning = cooling.querySelector('.omnimux-rival-filter-warning')
      assert.equal(coolingWarning.getAttribute('tabindex'), '0', 'the warning must be keyboard focusable')
      const describedBy = coolingWarning.getAttribute('aria-describedby')
      assert.ok(describedBy, 'the warning must point at its tooltip copy')
      assert.equal(coolingWarning.querySelector(`#${describedBy}`)?.getAttribute('role'), 'tooltip', 'the tooltip must expose its role')
      assert.equal(coolingWarning.querySelector(`#${describedBy}`)?.textContent.trim(), coolingWarning.getAttribute('aria-label'), 'the tooltip must carry the health reason')
      assert.ok(coolingWarning, '冷却行显示警告图标')
      assert.match(coolingWarning.getAttribute('aria-label'), /^冷却中 · \d+ 分钟后恢复$/, '冷却原因在图标悬停提示里')

      const reimport = rowById(mounted.container, 'ra_reimport')
      assert.equal(reimport.getAttribute('data-health'), 'reimport')
      assert.equal(reimport.querySelector('.omnimux-rival-filter-select').textContent.includes('需要重新导入'), false, '重导入行不再显示状态文字')
      assert.equal(
        reimport.querySelector('.omnimux-rival-filter-warning')?.getAttribute('aria-label'),
        '该 YouTube 频道尚未验证身份，请改用 channel/UC… 链接重新导入',
        '重导入原因只在图标悬停提示里',
      )
      assert.equal(reimport.querySelector('.omnimux-rival-retry'), null, '重导入行没有重试按钮')

      const stopped = rowById(mounted.container, 'ra_stopped')
      assert.equal(stopped.getAttribute('data-health'), 'stopped')
      assert.equal(stopped.textContent.includes('已停止'), false, '停止行不再显示状态文字')
      const stoppedTitle = stopped.querySelector('.omnimux-rival-filter-warning')?.getAttribute('aria-label') || ''
      assert.ok(stoppedTitle.includes('连续 3 次刷新失败'), `停止原因在图标悬停提示里 (got ${JSON.stringify(stoppedTitle)})`)
      assert.ok(stopped.querySelector('.omnimux-rival-retry'), '已停止行有重试按钮')
      const nameRow = stopped.querySelector('.omnimux-rival-filter-name-row')
      assert.ok(nameRow, '昵称行必须存在')
      const actions = stopped.querySelector('.omnimux-rival-filter-actions')
      assert.ok(actions?.querySelector('.omnimux-rival-filter-warning'), '警告图标必须与行主选择按钮同级（不嵌套按钮）')
      const platform = nameRow.querySelector('.omnimux-rival-filter-platform')
      assert.ok(platform, '平台图标必须在昵称行内')
      assert.equal(platform.previousElementSibling?.className, 'omnimux-rival-filter-name', '平台图标必须紧随昵称')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('未上报次数时仍显示可行动原因，不编造失败次数', async () => {
    const accounts = ACCOUNTS.map((account) => (
      account.id === 'ra_stopped' ? { ...account, consecutive_failures: undefined } : account
    ))
    const mounted = await mountStage({ accounts })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => rowById(mounted.container, 'ra_stopped'))
      const stopped = rowById(mounted.container, 'ra_stopped')
      assert.equal(stopped.textContent.includes('已停止'), false, '停止行不显示状态文字')
      const title = stopped.querySelector('.omnimux-rival-filter-warning')?.getAttribute('aria-label') || ''
      assert.ok(title.includes(zh['rivalAccounts.error.cloud']), `图标提示必须给出可行动原因 (got ${JSON.stringify(title)})`)
      assert.equal(title.includes('连续'), false, '不显示占位符或 0')
      assert.ok(stopped.querySelector('.omnimux-rival-retry'), '重试仍在')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('点重试后该行回正常、原因行消失、计数同步变化', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => rowById(mounted.container, 'ra_stopped'))
      const stopped = rowById(mounted.container, 'ra_stopped')
      const retry = stopped.querySelector('.omnimux-rival-retry')
      assert.ok(retry, '已停止行必须有重试')

      await mounted.click(retry)
      await settle(
        mounted.container,
        () => rowById(mounted.container, 'ra_stopped')?.getAttribute('data-health') === 'normal',
      )

      assert.ok(
        mounted.calls.some((call) => call.method === 'POST' && call.path.includes('/ra_stopped/refresh')),
        '重试必须发出该账号的单刷新请求',
      )
      const updated = rowById(mounted.container, 'ra_stopped')
      assert.equal(updated.getAttribute('data-health'), 'normal')
      assert.equal(updated.textContent.includes('正常'), false, '恢复正常后不显示状态文字')
      assert.equal(updated.querySelector('.omnimux-rival-filter-warning'), null, '警告图标消失')
      assert.equal(updated.querySelector('.omnimux-rival-retry'), null, '重试随健康态消失')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

describe('R4 刷新置灰与 D4 原因（#3111）', () => {
  it('筛选集存在已停止账号时置灰可点，弹出 refresh.stopped', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      const button = refreshButton(mounted.container)
      assert.ok(button, '筛选行必须有刷新按钮')
      await mounted.click(button)
      const pop = reasonPopover(mounted.container)
      assert.ok(pop, '点击置灰按钮必须弹原因')
      assert.equal(pop.textContent.trim(), '该账号自动刷新已停止，请在账号筛选中处理。')
      assert.ok(
        !mounted.calls.some((call) => call.method === 'POST' && call.path.includes('/refresh-all')),
        '置灰状态下点击不得发出刷新请求',
      )
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('额度耗尽置灰，点击弹出 refresh.quota', async () => {
    const mounted = await mountStage({
      status: {
        ...STATUS,
        budget_used: { global_calls: 50, per_account: {} },
      },
    })
    try {
      await mounted.openAccountTab()
      await mounted.click(refreshButton(mounted.container))
      const pop = reasonPopover(mounted.container)
      assert.ok(pop, '额度耗尽必须弹原因')
      assert.ok(pop.textContent.includes('今日额度已用完'), '原因逐字取 refresh.quota')
      assert.ok(!pop.textContent.includes('已停止'), '额度原因优先于停止原因')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('额度耗尽时正常行不出现警告图标，已停止行的悬停提示带额度原因', async () => {
    const mounted = await mountStage({
      status: {
        ...STATUS,
        budget_used: { global_calls: 50, per_account: {} },
      },
    })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => rowById(mounted.container, 'ra_stopped'))
      assert.equal(
        rowById(mounted.container, 'ra_ok').querySelector('.omnimux-rival-filter-warning'),
        null,
        '额度是池级事实，正常行不得因此长出警告图标',
      )
      const title = rowById(mounted.container, 'ra_stopped')
        .querySelector('.omnimux-rival-filter-warning')?.getAttribute('aria-label') || ''
      assert.ok(title.includes('今日额度已用完'), '已停止行的提示可补充额度原因')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('额度耗尽时账号行重试置灰，悬停提示 refresh.quota', async () => {
    const mounted = await mountStage({
      status: {
        ...STATUS,
        budget_used: { global_calls: 50, per_account: {} },
      },
    })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => rowById(mounted.container, 'ra_stopped'))
      const retry = rowById(mounted.container, 'ra_stopped').querySelector('.omnimux-rival-retry')
      assert.ok(retry, '已停止行有重试按钮')
      assert.equal(retry.disabled, true, '额度耗尽时重试禁用')
      assert.ok((retry.getAttribute('title') || '').includes('今日额度已用完'), '额度原因逐字取 refresh.quota')
      assert.equal(reasonPopover(mounted.container), null, '不再弹出额度气泡')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('冷却中置灰，点击弹出 refresh.cooldown（含分钟数）', async () => {
    const mounted = await mountStage({
      accounts: ACCOUNTS.filter((account) => account.id !== 'ra_stopped'),
    })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => refreshButton(mounted.container))
      await mounted.click(refreshButton(mounted.container))
      assert.ok(
        mounted.calls.some((call) => call.method === 'POST' && /\/ra_ok\/refresh$/.test(call.path)),
        '首次点击必须发出范围内的单账号刷新请求',
      )
      await mounted.click(refreshButton(mounted.container))
      const pop = reasonPopover(mounted.container)
      assert.ok(pop, '冷却中点击必须弹原因')
      assert.ok(pop.textContent.includes('刷新过于频繁'), '原因逐字取 refresh.cooldown')
      assert.ok(pop.textContent.includes('分钟后可再次刷新'), '原因带剩余分钟')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })
})

describe('账号采集失败的可见、安全恢复 (#3374)', () => {
  const failed = { ...ACCOUNTS[3], post_count: 0, error_message: 'secret=fixture-upstream-token' }

  it('首采失败点名账号并显示白名单原因，不回显上游原文', async () => {
    const mounted = await mountStage({ accounts: [failed] })
    try {
      await mounted.openAccountTab()
      const text = mounted.container.textContent || ''
      assert.ok(text.includes('@ootd_lab'))
      assert.ok(text.includes(zh['rivalAccounts.error.cloud']))
      assert.ok(!text.includes('fixture-upstream-token'))
      assert.ok(text.includes('连续 3 次刷新失败'))
    } finally { await mounted.unmount(); mounted.close() }
  })

  it('额度拒绝显示在页面且不宣称刷新完成', async () => {
    const mounted = await mountStage({
      accounts: [failed],
      refreshResponse: { status: 429, body: { error: 'secret=fixture-upstream-token', code: 'refresh-budget-exhausted' } },
    })
    try {
      await mounted.openAccountTab()
      const retry = [...mounted.container.querySelectorAll('button')].find((node) => node.textContent.trim() === '重试')
      await mounted.click(retry)
      const alert = mounted.container.querySelector('.omnimux-rival-notice[role="alert"]')
      assert.ok(alert, '拒绝受理必须有可见提示')
      assert.ok(alert.textContent.includes('@ootd_lab'))
      assert.ok(alert.textContent.includes(zh['rivalAccounts.skip.budget']))
      assert.ok(!mounted.container.textContent.includes('fixture-upstream-token'))
      assert.ok(!mounted.container.textContent.includes('刚刚更新'))
    } finally { await mounted.unmount(); mounted.close() }
  })

  it('身份错误直接引导重新导入，不发送无效重试', async () => {
    const mounted = await mountStage({ accounts: [ACCOUNTS[2]] })
    try {
      await mounted.openAccountTab()
      const button = [...mounted.container.querySelectorAll('button')].find((node) => node.textContent.trim() === '重新导入')
      assert.ok(button)
      await mounted.click(button)
      assert.ok(mounted.container.querySelector('[role="dialog"]'))
      assert.ok(!mounted.calls.some((call) => call.method === 'POST' && /\/refresh$/.test(call.path)))
    } finally { await mounted.unmount(); mounted.close() }
  })
})
