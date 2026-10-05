/**
 * #3164 真机验收页：挂载真实的 `InspirationStage`（账号监控页），用与仓库渲染
 * 测试同一套桩喂入四个健康态账号与额度事实，供真实浏览器核对「监控池状态条
 * 只剩额度/新鲜度一行」。
 *
 * 桩件与 `rival-pool-health-render.test.js` 的 `mountStage` 对齐：拦截全局
 * fetch，只回答账号列表、状态、刷新与本地列表四类请求。
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { InspirationStage } from '../../../../plugins/omnimux-inspiration/src/client/InspirationStage.jsx'
import { zh } from '../../../../plugins/omnimux-inspiration/src/client/locales.js'

const NOW = Date.now()
const isoMinutesAgo = (minutes) => new Date(NOW - minutes * 60_000).toISOString()
const isoMinutesAhead = (minutes) => new Date(NOW + minutes * 60_000).toISOString()

const RIVAL_PREFIX = '/omnimux/inspiration/local/rival-accounts'

const ACCOUNTS = [
  {
    id: 'ra_ok', nickname: '喵星日常', handle: '@meow_daily', platform: 'tiktok',
    profile_url: 'https://www.tiktok.com/@meow_daily', refresh_state: 'idle',
    error_code: null, consecutive_failures: 0, last_refresh_at: isoMinutesAgo(3), post_count: 3,
  },
  {
    id: 'ra_cool', nickname: '毛孩子食堂', handle: '@fur_kitchen', platform: 'tiktok',
    profile_url: 'https://www.tiktok.com/@fur_kitchen', refresh_state: 'backoff',
    error_code: 'cloud-error', consecutive_failures: 1,
    next_auto_refresh_at: isoMinutesAhead(42), last_refresh_at: isoMinutesAgo(30), post_count: 1,
  },
  {
    id: 'ra_reimport', nickname: '科技小辛', handle: '@tech_xin', platform: 'youtube',
    profile_url: 'https://www.youtube.com/@tech_xin', refresh_state: 'error',
    error_code: 'identity-unverified', consecutive_failures: 1,
    last_refresh_at: isoMinutesAgo(60), post_count: 0,
  },
  {
    id: 'ra_stopped', nickname: '穿搭研究所', handle: '@ootd_lab', platform: 'instagram',
    profile_url: 'https://www.instagram.com/ootd_lab', refresh_state: 'error',
    error_code: 'cloud-error', consecutive_failures: 3, next_auto_refresh_at: null,
    last_refresh_at: isoMinutesAgo(120), post_count: 1,
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

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

window.__omnimuxAuth = { ensureLogin() {} }

const calls = []
window.fetch = async (url, options = {}) => {
  const path = String(url)
  const method = options?.method ?? 'GET'
  calls.push({ path, method })
  if (path.includes(`${RIVAL_PREFIX}/posts`)) {
    return jsonResponse(200, {
      success: true,
      data: { items: [], total: 0, page: 1, page_size: 20, has_more: false, requested_accounts: [] },
    })
  }
  if (path.includes(`${RIVAL_PREFIX}/status`)) {
    return jsonResponse(200, { success: true, data: STATUS })
  }
  if (path.includes(RIVAL_PREFIX) && method === 'GET') {
    return jsonResponse(200, {
      success: true,
      data: {
        items: ACCOUNTS.map((account) => ({ ...account })),
        total: ACCOUNTS.length,
        config_summary: CONFIG_SUMMARY,
      },
    })
  }
  return jsonResponse(200, { success: true, data: { items: [], total: 0, platforms: [] } })
}

const waitFor = (predicate, timeoutMs = 10_000) =>
  new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      let value
      try {
        value = predicate()
      } catch (error) {
        reject(error)
        return
      }
      if (value) {
        resolve(value)
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('harness timeout'))
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
  })

const container = document.getElementById('host')
const root = createRoot(container)
root.render(createElement(InspirationStage, { t: (key) => zh[key] || key, visible: true }))

;(async () => {
  try {
    const tab = await waitFor(() => container.querySelector('[data-tab="rivals"]'))
    tab.click()
    const bar = await waitFor(() => container.querySelector('[data-rival-pool="true"]'))
    window.__harness = {
      ready: true,
      rowCount: bar.querySelectorAll('.omnimux-rival-pool-row').length,
      summaryPresent: Boolean(container.querySelector('.omnimux-rival-pool-summary')),
      barText: bar.textContent,
      accountRows: container.querySelectorAll('.omnimux-rival-filter-row').length,
      calls: calls.length,
    }
    document.title = 'HARNESS_READY'
  } catch (error) {
    window.__harness = { ready: false, error: String(error) }
    document.title = 'HARNESS_ERROR'
  }
})()
