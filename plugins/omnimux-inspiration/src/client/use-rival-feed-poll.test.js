import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useRivalFeed } from './use-rival-feed.js'

/**
 * Hook-level gate for the bounded first-fetch poll (#3112).
 *
 * `use-rival-feed.js` is deliberately timer-free; the ticket opens one
 * controlled exception and this suite pins its four boundaries against the
 * real hook mounted on jsdom (no bundling — the hook is plain ESM):
 *
 *   - polls only while an account is queued/running, at the server-shipped
 *     `config_summary.poll_interval_ms`;
 *   - stops the moment nothing is active — the last poll re-reads page 1, so
 *     collected works appear without a manual refresh;
 *   - swaps the watch for a failure state on `error`/`backoff` and on the
 *     budget ceiling, so a broken promise cannot spin forever;
 *   - leaves zero timers behind after unmount.
 *
 * Poll intervals are milliseconds-scale because the tests inject their own
 * `pollIntervalMs`/`watchBudgetMs` — the production cadence stays the
 * server's 2500ms.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function installDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return {
    container: dom.window.document.getElementById('host'),
    restore() {
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment
    },
  }
}

/**
 * The probe captures the latest feed object so assertions read state without
 * reaching into the hook's internals.
 * @param {{ api: object, pollIntervalMs?: number, watchBudgetMs?: number }} props
 */
function Probe(props) {
  const feed = useRivalFeed(props)
  Probe.latest = feed
  return null
}

/**
 * @param {object} api fetchRivalAccounts/fetchRivalFeed implementations
 * @param {Record<string, any>} [extra] extra useRivalFeed options
 */
async function mount(api, extra = {}) {
  const { container, restore } = installDom()
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(Probe, { api, ...extra }))
  })
  const unmount = async () => { await act(async () => root.unmount()); restore() }
  const rerender = async (next) => {
    await act(async () => { root.render(React.createElement(Probe, { api, ...extra, ...next })) })
  }
  return { container, unmount, rerender, get feed() { return Probe.latest } }
}

const okAccounts = (items, pollIntervalMs = 2500) => ({
  ok: true,
  body: { data: { items, total: items.length, config_summary: { poll_interval_ms: pollIntervalMs } } },
})
const okFeed = (items = []) => ({
  ok: true,
  body: { data: { items, total: items.length, page: 1, has_more: false } },
})

describe('useRivalFeed bounded first-fetch poll (#3112)', () => {
  const mounted = []
  after(async () => {
    while (mounted.length) {
      // eslint-disable-next-line no-await-in-loop
      await mounted.pop().unmount()
    }
  })

  it('issues no timer-driven requests when nothing is being collected', async () => {
    let accountCalls = 0
    const api = {
      fetchRivalAccounts: async () => { accountCalls += 1; return okAccounts([{ id: 'a', refresh_state: 'idle', post_count: 4 }]) },
      fetchRivalFeed: async () => okFeed([{ id: 'p1' }]),
    }
    const m = await mount(api, { pollIntervalMs: 15 })
    mounted.push(m)
    await act(async () => { await sleep(60) })
    assert.equal(
      accountCalls,
      1,
      'an idle pool must not keep re-reading accounts — the watch only exists while a fetch is in flight',
    )
  })

  it('polls while queued and stops with content visible once the fetch lands', async () => {
    const account = { id: 'a', refresh_state: 'queued', post_count: 0 }
    let accountCalls = 0
    let feedReads = 0
    const api = {
      fetchRivalAccounts: async () => {
        accountCalls += 1
        // The third account read sees the fetch finished: drain() is synchronous
        // on the Host, the queue is empty and the post is collected.
        if (accountCalls >= 3) {
          account.refresh_state = 'idle'
          account.post_count = 1
        }
        return okAccounts([account])
      },
      fetchRivalFeed: async () => {
        feedReads += 1
        return okFeed(account.post_count > 0 ? [{ id: 'p1', title: '首采内容' }] : [])
      },
    }
    const m = await mount(api, { pollIntervalMs: 15 })
    mounted.push(m)
    await act(async () => {
      for (let i = 0; i < 40 && m.feed.accounts[0]?.refresh_state !== 'idle'; i += 1) await sleep(10)
    })
    const callsWhenSettled = accountCalls
    assert.equal(m.feed.accounts[0]?.refresh_state, 'idle', 'the watch must observe the settled account')
    assert.ok(
      m.feed.items.length > 0,
      'the poll that sees the queue empty re-reads page 1 — content appears without a manual refresh',
    )
    assert.equal(m.feed.fetchPhase, null, 'a landed fetch clears the failure phase')
    await act(async () => { await sleep(50) })
    assert.equal(
      accountCalls,
      callsWhenSettled,
      'the watch must leave zero timers once nothing is queued/running',
    )
    assert.ok(feedReads >= 2, 'the final poll re-read the feed (>= initial + settle read)')
  })

  it('reports a terminal error instead of polling forever', async () => {
    let accountCalls = 0
    const api = {
      fetchRivalAccounts: async () => {
        accountCalls += 1
        return okAccounts([{ id: 'a', refresh_state: 'error', post_count: 0, consecutive_failures: 4 }])
      },
      fetchRivalFeed: async () => okFeed([]),
    }
    const m = await mount(api, { pollIntervalMs: 15 })
    mounted.push(m)
    await act(async () => { await sleep(50) })
    assert.equal(m.feed.fetchPhase?.kind, 'stopped', 'an errored first fetch must surface as a failure')
    const settled = accountCalls
    await act(async () => { await sleep(40) })
    assert.equal(accountCalls, settled, 'a terminal state stops the watch — no infinite spinner')
  })

  it('gives up after the watch budget with a timeout phase', async () => {
    const api = {
      fetchRivalAccounts: async () => okAccounts([{ id: 'a', refresh_state: 'running', post_count: 0 }]),
      fetchRivalFeed: async () => okFeed([]),
    }
    const m = await mount(api, { pollIntervalMs: 10, watchBudgetMs: 55 })
    mounted.push(m)
    await act(async () => {
      for (let i = 0; i < 40 && m.feed.fetchPhase?.kind !== 'timeout'; i += 1) await sleep(10)
    })
    assert.equal(
      m.feed.fetchPhase?.kind,
      'timeout',
      'the promise「约 1 分钟」is bounded: the watch must give up and say so',
    )
  })

  it('cleans its timer on unmount', async () => {
    let accountCalls = 0
    const api = {
      fetchRivalAccounts: async () => { accountCalls += 1; return okAccounts([{ id: 'a', refresh_state: 'running', post_count: 0 }]) },
      fetchRivalFeed: async () => okFeed([]),
    }
    const m = await mount(api, { pollIntervalMs: 15 })
    await act(async () => { await sleep(30) })
    await m.unmount()
    const atUnmount = accountCalls
    await sleep(50)
    assert.equal(accountCalls, atUnmount, 'an unmounted tab must not keep polling')
  })
})


describe('useRivalFeed — sort 选项映射（#3113 增速排序）', () => {
  const mounted = []
  after(async () => {
    while (mounted.length) {
      // eslint-disable-next-line no-await-in-loop
      await mounted.pop().unmount()
    }
  })

  it('velocity 请求参数原样下发；recommended/latest/views 映射为 wire 值', async () => {
    const seen = []
    const api = {
      fetchRivalAccounts: async () => okAccounts([{ id: 'a', refresh_state: 'idle', post_count: 1 }]),
      fetchRivalFeed: async (filter) => {
        seen.push(filter?.sort)
        return okFeed([{ id: 'p1' }])
      },
    }
    for (const [option, wire] of [
      ['velocity', 'velocity'],
      ['views', 'views'],
      ['recommended', 'posted_at'],
      ['latest', 'posted_at'],
      [undefined, 'posted_at'],
    ]) {
      seen.length = 0
      const extra = option === undefined ? {} : { sort: option }
      // eslint-disable-next-line no-await-in-loop
      const m = await mount(api, { pollIntervalMs: 15, ...extra })
      mounted.push(m)
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await sleep(40) })
      assert.ok(seen.length > 0, `sort=${option}: feed must be requested`)
      assert.equal(seen[0], wire, `option ${option} must map to wire sort ${wire}`)
    }
  })
})

describe('useRivalFeed scoped refresh and safe feedback (#3374)', () => {
  const accounts = [
    { id: 'a', handle: '@first', platform: 'x', refresh_state: 'error', error_code: 'cloud-error', post_count: 0 },
    { id: 'b', handle: '@second', platform: 'youtube', refresh_state: 'idle', post_count: 0 },
    { id: 'c', handle: '@third', platform: 'x', refresh_state: 'backoff', post_count: 0 },
  ]

  it('ignores failures and active jobs outside the selected platform', async () => {
    let reads = 0
    const m = await mount({
      fetchRivalAccounts: async () => { reads += 1; return okAccounts([...accounts, { id: 'd', platform: 'x', refresh_state: 'running' }]) },
      fetchRivalFeed: async () => okFeed(),
    }, { platform: 'youtube', pollIntervalMs: 10 })
    try {
      assert.equal(m.feed.fetchPhase, null)
      assert.equal(m.feed.fetching, false)
      await act(async () => { await sleep(35) })
      assert.equal(reads, 1, 'unselected jobs must not start this platform’s observation timer')
    } finally { await m.unmount() }
  })

  it('clears an excluded account failure when the account selection changes', async () => {
    const m = await mount({ fetchRivalAccounts: async () => okAccounts(accounts), fetchRivalFeed: async () => okFeed() })
    try {
      await act(async () => { m.feed.toggleAccount('a'); m.feed.toggleAccount('c') })
      assert.equal(m.feed.fetchPhase, null)
    } finally { await m.unmount() }
  })

  it('retries only failed accounts in the current selection and platform, as explicit manual retries', async () => {
    const sent = []
    const m = await mount({
      fetchRivalAccounts: async () => okAccounts(accounts), fetchRivalFeed: async () => okFeed(),
      refreshRivalAccount: async (id, options) => { sent.push({ id, options }); return { ok: true, body: { data: { queued: true } } } },
    }, { platform: 'x' })
    try {
      await act(async () => { m.feed.toggleAccount('c') })
      await act(async () => { await m.feed.retryFetch() })
      assert.deepEqual(sent, [{ id: 'a', options: { manual: true } }])
      assert.equal(m.feed.refreshNotice?.key, 'rivalAccounts.refresh.queued')
    } finally { await m.unmount() }
  })

  it('top refresh uses single-account requests for the selected range', async () => {
    const sent = []
    let allCalls = 0
    const m = await mount({
      fetchRivalAccounts: async () => okAccounts(accounts), fetchRivalFeed: async () => okFeed(),
      refreshAllRivalAccounts: async () => { allCalls += 1; return { ok: true } },
      refreshRivalAccount: async (id, options) => { sent.push({ id, options }); return { ok: true, body: { data: { queued: true } } } },
    }, { platform: 'youtube' })
    try {
      await act(async () => { await m.feed.refreshPool() })
      assert.equal(allCalls, 0, 'a narrowed toolbar action must never call refresh-all')
      assert.deepEqual(sent, [{ id: 'b', options: { manual: true } }])
    } finally { await m.unmount() }
  })

  it('keeps the current platform visible when an earlier refresh submission finishes after switching platforms', async () => {
    const sent = []
    const reads = []
    let finishSubmission
    const receipt = new Promise((resolve) => { finishSubmission = resolve })
    const m = await mount({
      fetchRivalAccounts: async () => okAccounts(accounts.slice(0, 2).map((account) => ({ ...account, refresh_state: 'idle', post_count: 1 }))),
      fetchRivalFeed: async (filter) => {
        reads.push(filter.platform)
        return okFeed([{ id: `${filter.platform}-post`, title: filter.platform }])
      },
      refreshRivalAccount: async (id) => { sent.push(id); return receipt },
    }, { platform: 'x' })
    try {
      let refresh
      await act(async () => { refresh = m.feed.refreshPool() })
      await m.rerender({ platform: 'youtube' })
      assert.equal(m.feed.items[0]?.title, 'youtube', 'the new platform has already loaded')
      await act(async () => {
        finishSubmission({ ok: true, body: { data: { status: 'queued' } } })
        await refresh
      })
      assert.deepEqual(sent, ['a'], 'submission keeps the account range selected when the user clicked')
      assert.equal(m.feed.items[0]?.title, 'youtube', 'the old receipt must reload the latest platform')
      assert.deepEqual(reads, ['x', 'youtube', 'youtube'])
    } finally { await m.unmount() }
  })

  it('keeps the toolbar’s 30-minute cooldown on accepted accounts without blocking a different selection', async () => {
    const sent = []
    const m = await mount({
      fetchRivalAccounts: async () => okAccounts(accounts.slice(0, 2).map((account) => ({ ...account, refresh_state: 'idle' }))),
      fetchRivalFeed: async () => okFeed(),
      refreshRivalAccount: async (id) => { sent.push(id); return { ok: true, body: { data: { status: 'queued' } } } },
    })
    try {
      await act(async () => { m.feed.toggleAccount('b') })
      await act(async () => { await m.feed.refreshPool() })
      assert.equal(m.feed.manualCooldownLeft, 30)
      await act(async () => { m.feed.invertAccounts() })
      assert.equal(m.feed.manualCooldownLeft, null, 'the other account has not been refreshed')
      await act(async () => { await m.feed.refreshPool() })
      assert.deepEqual(sent, ['a', 'b'])
      assert.equal(m.feed.manualCooldownLeft, 30)
    } finally { await m.unmount() }
  })

  it('deduplicates concurrent retries before the first render can disable the button', async () => {
    let resolveRefresh
    let submissions = 0
    const response = new Promise((resolve) => { resolveRefresh = resolve })
    const m = await mount({
      fetchRivalAccounts: async () => okAccounts([accounts[0]]), fetchRivalFeed: async () => okFeed(),
      refreshRivalAccount: async () => { submissions += 1; return response },
    })
    try {
      await act(async () => {
        const first = m.feed.retryFetch()
        const second = m.feed.retryFetch()
        assert.equal(submissions, 1)
        resolveRefresh({ ok: true, body: { data: { queued: true } } })
        await Promise.all([first, second])
      })
    } finally { await m.unmount() }
  })

  it('reports a queue refusal even when HTTP accepted the request', async () => {
    const m = await mount({
      fetchRivalAccounts: async () => okAccounts([accounts[0]]), fetchRivalFeed: async () => okFeed(),
      refreshRivalAccount: async () => ({ ok: true, status: 202, body: { data: { queued: false, status: 'budget', reason_key: 'rivalAccounts.skip.budget' } } }),
    })
    try {
      await act(async () => { await m.feed.retryFetch() })
      assert.equal(m.feed.refreshFailure?.reason, 'budget')
      assert.equal(m.feed.refreshNotice?.key, 'rivalAccounts.skip.budget')
    } finally { await m.unmount() }
  })

  it('never exposes arbitrary upstream error text in the feed error', async () => {
    const m = await mount({
      fetchRivalAccounts: async () => ({ ok: false, body: { error: 'upstream request contained secret=fixture-secret' } }),
      fetchRivalFeed: async () => okFeed(),
    })
    try {
      assert.equal(m.feed.error, 'rivalAccounts.error.failed')
    } finally { await m.unmount() }
  })
})
