/**
 * QA harness for Issue #3112 — mounts the REAL useRivalFeed + RivalAccountsPanel
 * + RivalFeedGrid + rival-styles/tokens against a scripted Host, so a real
 * browser can verify the whole first-fetch promise:
 *
 *   E1 无账号 → 导入 → E2 进度承诺 → 内容自动出现 → 失败态(原因+重试) → 重试回 E2
 *
 * The scripted Host lives in window.__qaHost and answers the same endpoints
 * the real one does (E1 listAccounts / E15 listFeed / classify / import /
 * account refresh). `window.__qaHost.set(...)` rewrites the next answers —
 * the playwright driver uses it to walk the state machine the same way a real
 * first fetch moves queued → idle / error.
 *
 * Query params: ?theme=light|dark  ?scenario=empty
 */

import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useState } from 'react'
import { RivalAccountsPanel } from '../../../../plugins/omnimux-inspiration/src/client/RivalAccountsPanel.jsx'
import { useRivalFeed } from '../../../../plugins/omnimux-inspiration/src/client/use-rival-feed.js'
import { injectRivalStyles } from '../../../../plugins/omnimux-inspiration/src/client/rival-styles.js'
import { injectRivalTokens } from '../../../../plugins/omnimux-inspiration/src/client/rival-tokens.js'
import { injectInspirationStyles } from '../../../../plugins/omnimux-inspiration/src/client/styles.js'
import { zh } from '../../../../plugins/omnimux-inspiration/src/client/locales.js'

const t = (key) => zh[key] || key

const RIVAL = '/omnimux/inspiration/local/rival-accounts'

const POST = {
  id: 'p1',
  row_id: 'acc-1:p1',
  account_id: 'acc-1',
  title: '猫咪饮水机实测：三只猫一周后还喝吗',
  type: 'video',
  url: 'https://tiktok.example/@meow_daily/p1',
  posted_at: '2026-10-05T08:12:00.000Z',
  stats: { views: 128000, likes: 8640, comments: 214, shares: 96 },
  source_platform: 'tiktok',
  cover_src: '/omnimux/inspiration/local/media/c1.svg',
  account: { id: 'acc-1', nickname: '喵星日常', handle: '@meow_daily', platform: 'tiktok' },
}

/**
 * The scripted Host: the page's own `fetch` answers every route the real
 * client code calls, from the same state object — so import, polling,
 * completion and failure all run through the real client, never stubs of it.
 */
const host = {
  accounts: [],
  posts: [],
  intervalMs: 60,   // the QA watch runs faster than the shipped 2500ms
  refreshCalls: [],
  set(patch) { Object.assign(this, patch) },
}
window.__qaHost = host
window.__qaPost = POST

function json(data, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const realFetch = window.fetch?.bind(window)
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || ''
  const method = (init?.method || 'GET').toUpperCase()
  if (url === `${RIVAL}/classify` && method === 'POST') {
    const body = JSON.parse(init?.body || '{}')
    return json({
      kind: 'account',
      platform: 'tiktok',
      external_id: 'meow_daily',
      handle: '@meow_daily',
      nickname: '喵星日常',
      url: body.url,
    })
  }
  if (url === RIVAL && method === 'POST') {
    host.accounts = [{ id: 'acc-1', handle: '@meow_daily', nickname: '喵星日常', platform: 'tiktok', refresh_state: 'queued', post_count: 0 }]
    return json({ ...host.accounts[0], account_id: 'acc-1', job: 'running', cloud_calls_planned: 2, status: 'accepted' })
  }
  if (/^\/omnimux\/inspiration\/local\/rival-accounts\/[^/]+\/refresh$/.test(url) && method === 'POST') {
    const id = url.split('/').at(-2)
    host.refreshCalls.push({ id, manual: JSON.parse(init?.body || '{}').manual === true })
    host.accounts = host.accounts.map((a) => (a.id === id ? { ...a, refresh_state: 'queued', consecutive_failures: 0 } : a))
    return json({ queued: true })
  }
  if (url.startsWith(`${RIVAL}/posts`)) {
    return json({ items: host.posts, total: host.posts.length, page: 1, page_size: 20, has_more: false })
  }
  if (url === RIVAL || url.startsWith(`${RIVAL}?`)) {
    return json({
      items: host.accounts,
      total: host.accounts.length,
      config_summary: {
        refresh_interval_hours: 24,
        posts_per_refresh: 10,
        limits: { daily_refresh_quota: 8 },
        poll_interval_ms: host.intervalMs,
      },
    })
  }
  if (url.startsWith('/omnimux/inspiration/local/media/')) {
    const file = url.split('/').pop()
    const res = await realFetch?.(`covers/${file}`) || fetch(`covers/${file}`)
    return res
  }
  return json({ items: [], total: 0 })
}

function App() {
  const [trendNote, setTrendNote] = useState('')
  const [importNote, setImportNote] = useState('')
  const feed = useRivalFeed({ enabled: true, query: '', platform: '' })

  useEffect(() => {
    injectRivalTokens()
    injectRivalStyles()
    injectInspirationStyles()
    document.documentElement.setAttribute('data-theme',
      new URLSearchParams(location.search).get('theme') || 'dark')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // QA driver seam: rewrite the Host state, then do what a settle would —
  // re-read page 1. It is the same call the import handler makes, exposed so
  // the playwright script can walk the machine without a second account.
  window.__qaApply = () => { void feed.reload() }

  return (
    <div className="qa-stage">
      <RivalAccountsPanel
        t={t}
        active={true}
        query=""
        platform=""
        feed={{ ...feed, query: '', platform: '' }}
        onImported={() => {}}
        onAccountImported={(account) => {
          setImportNote(`已添加监控账号 ${account?.handle || ''}，首次采集约需 1 分钟`)
          void feed.reload()
        }}
        onBrowseTrend={() => setTrendNote('已切到爆款趋势')}
      />
      {importNote ? <div className="qa-note qa-toast">{importNote}</div> : null}
      {trendNote ? <div className="qa-note qa-trend">{trendNote}</div> : null}
    </div>
  )
}

const root = createRoot(document.getElementById('app'))
root.render(<App />)
