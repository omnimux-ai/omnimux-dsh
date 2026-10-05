import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
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
 * @param {{ accounts?: Array<object>, status?: object }} [options]
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
const poolRows = (container) => [...container.querySelectorAll('.omnimux-rival-pool-row')]
const poolQuotaText = (container) => container.querySelector('.omnimux-rival-pool-quota')?.textContent.trim()
const poolFreshness = (container) => container.querySelector('.omnimux-rival-pool-freshness')?.textContent.trim()
const filterTrigger = (container) => container.querySelector('.omnimux-rival-filter-trigger')
const filterRows = (container) => [...container.querySelectorAll('.omnimux-rival-filter-row')]
const rowById = (container, id) => filterRows(container).find((node) => node.getAttribute('data-account-id') === id)
const reasonPopover = (container) => container.querySelector('.omnimux-rival-refresh-wrap .omnimux-rival-reason')
const refreshButton = (container) => container.querySelector('.omnimux-rival-refresh')

after(() => {
  rmSync(cacheDir, { recursive: true, force: true })
})

describe('R3 监控池状态条（#3111）', () => {
  it('只渲染一行：额度与新鲜度，账号统计行不存在', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => poolQuotaText(mounted.container))
      assert.equal(poolRows(mounted.container).length, 1, '状态条只剩一行')
      assert.equal(
        mounted.container.querySelector('.omnimux-rival-pool-summary'),
        null,
        '账号统计行不再渲染',
      )
      const barText = poolBar(mounted.container).textContent
      assert.ok(!barText.includes('监控池'), '状态条不再出现账号统计文案')
      assert.ok(!barText.includes('待重导入'), '状态条不再出现待重导入分段')
      assert.equal(poolQuotaText(mounted.container), '今日剩余刷新额度 46/50')
      assert.equal(poolFreshness(mounted.container), '数据更新于 3 分钟前')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('额度在左、新鲜度在右，同行不换行', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => poolBar(mounted.container))
      const rows = poolRows(mounted.container)
      assert.equal(rows.length, 1, '状态条只有一行')
      assert.ok(rows[0].textContent.includes('今日剩余刷新额度'))
      assert.ok(rows[0].textContent.includes('数据更新于'))
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('无任何刷新事实时新鲜度段不渲染', async () => {
    const mounted = await mountStage({
      accounts: ACCOUNTS.map((account) => ({ ...account, last_refresh_at: null })),
    })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => poolQuotaText(mounted.container))
      assert.equal(poolFreshness(mounted.container), undefined)
      assert.equal(mounted.container.querySelector('.omnimux-rival-pool-freshness'), null)
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('E1 空态（无监控账号）整条状态条不渲染（规格 B9）', async () => {
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
  it('四态齐全：正常 / 冷却中 · {n} 分钟后恢复 / 需要重新导入 / 已停止 + 常驻原因行', async () => {
    const mounted = await mountStage()
    try {
      await mounted.openAccountTab()
      await mounted.click(filterTrigger(mounted.container))
      await settle(mounted.container, () => filterRows(mounted.container).length === ACCOUNTS.length)

      const ok = rowById(mounted.container, 'ra_ok')
      assert.equal(ok.getAttribute('data-health'), 'normal')
      assert.ok(ok.textContent.includes('正常'))
      assert.equal(ok.querySelector('.omnimux-rival-filter-reason'), null, '正常行没有原因行')

      const cooling = rowById(mounted.container, 'ra_cool')
      assert.equal(cooling.getAttribute('data-health'), 'cooling')
      assert.ok(cooling.textContent.includes('冷却中 · '), '冷却行显示恢复分钟')
      assert.ok(/冷却中 · \d+ 分钟后恢复/.test(cooling.textContent), '冷却行逐字 `冷却中 · {n} 分钟后恢复`')

      const reimport = rowById(mounted.container, 'ra_reimport')
      assert.equal(reimport.getAttribute('data-health'), 'reimport')
      assert.ok(reimport.textContent.includes('需要重新导入'))
      assert.ok(
        reimport.textContent.includes('该 YouTube 频道尚未验证身份，请改用 channel/UC… 链接重新导入'),
        '重导入原因行常驻可见',
      )
      assert.equal(reimport.querySelector('.omnimux-rival-retry'), null, '重导入行没有重试按钮')

      const stopped = rowById(mounted.container, 'ra_stopped')
      assert.equal(stopped.getAttribute('data-health'), 'stopped')
      assert.ok(stopped.textContent.includes('已停止'))
      assert.ok(stopped.textContent.includes('连续 3 次刷新失败'), '已停止原因行带计数')
      assert.ok(stopped.querySelector('.omnimux-rival-retry'), '已停止行有重试按钮')
    } finally {
      await mounted.unmount()
      mounted.close()
    }
  })

  it('{n} 未上报时原因行整行不渲染，标记仍在', async () => {
    const accounts = ACCOUNTS.map((account) => (
      account.id === 'ra_stopped' ? { ...account, consecutive_failures: undefined } : account
    ))
    const mounted = await mountStage({ accounts })
    try {
      await mounted.openAccountTab()
      await mounted.click(filterTrigger(mounted.container))
      const stopped = rowById(mounted.container, 'ra_stopped')
      assert.ok(stopped.textContent.includes('已停止'))
      assert.equal(stopped.querySelector('.omnimux-rival-filter-reason'), null, '无计数时原因行整行不渲染')
      assert.ok(!stopped.textContent.includes('连续'), '不显示占位符或 0')
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
      await mounted.click(filterTrigger(mounted.container))
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
      assert.ok(updated.textContent.includes('正常'))
      assert.equal(updated.querySelector('.omnimux-rival-filter-reason'), null, '原因行消失')
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

  it('冷却中置灰，点击弹出 refresh.cooldown（含分钟数）', async () => {
    const mounted = await mountStage({
      accounts: ACCOUNTS.filter((account) => account.id !== 'ra_stopped'),
    })
    try {
      await mounted.openAccountTab()
      await settle(mounted.container, () => poolQuotaText(mounted.container))
      await mounted.click(refreshButton(mounted.container))
      assert.ok(
        mounted.calls.some((call) => call.method === 'POST' && call.path.includes('/refresh-all')),
        '首次点击必须发出刷新请求',
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
