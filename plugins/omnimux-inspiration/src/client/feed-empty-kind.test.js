import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { feedEmptyKind } from './rival-feed-empty.js'

/**
 * Unit gate for the empty-state split (#3112).
 *
 * The spec gives the tab three mutually exclusive empty answers —「还没有
 * 监控账号」(no account imported), `正在为你抓取内容` (first fetch in
 * flight) and「当前筛选下没有内容」(filters excluded everything) — plus the
 * failure exit the ticket asks for. `feedEmptyKind` is the single function
 * that decides which one renders, so the whole matrix is pinned here.
 *
 * What changed for #3112: `no-posts` was one bucket; the ticket splits it by
 * the first-fetch signal — in-flight stays a promise (E2), ended badly is a
 * retryable failure, and anything else keeps the original answer.
 */

const base = {
  loading: false,
  accounts: [{ id: 'a' }],
  items: [],
  cards: [],
  emptySelection: false,
  error: null,
  query: '',
  platform: '',
  fetching: false,
  fetchPhase: null,
}

describe('feedEmptyKind (#3112)', () => {
  it('answers loading while the first request is in flight', () => {
    assert.equal(feedEmptyKind({ ...base, loading: true }), 'loading')
  })

  it('answers no-accounts when the pool is empty', () => {
    assert.equal(feedEmptyKind({ ...base, accounts: [] }), 'no-accounts')
  })

  it('answers fetching while the first fetch is still collecting', () => {
    assert.equal(
      feedEmptyKind({ ...base, fetching: true, accounts: [{ id: 'a', refresh_state: 'running', post_count: 0 }] }),
      'fetching',
      'queued/running with nothing collected yet is the E2 promise, not「暂无监控作品」',
    )
  })

  it('answers fetch-failed when the wait ended in a terminal Host state', () => {
    assert.equal(
      feedEmptyKind({ ...base, fetchPhase: { kind: 'stopped' } }),
      'fetch-failed',
    )
    assert.equal(
      feedEmptyKind({ ...base, fetchPhase: { kind: 'cooling', minutes: 7 } }),
      'fetch-failed',
    )
    assert.equal(
      feedEmptyKind({ ...base, fetchPhase: { kind: 'timeout' } }),
      'fetch-failed',
    )
  })

  it('keeps the failure answer even when a terminal account is mid-poll', () => {
    // An `error` account never sits in `queued`/`running`, but the matrix is
    // pinned anyway: the failure answer is the honest one to render.
    assert.equal(
      feedEmptyKind({ ...base, fetching: true, fetchPhase: { kind: 'stopped' } }),
      'fetch-failed',
    )
  })

  it('still answers filtered for the exclusion cases', () => {
    assert.equal(feedEmptyKind({ ...base, emptySelection: true }), 'filtered')
    assert.equal(feedEmptyKind({ ...base, query: 'zzz' }), 'filtered')
    assert.equal(feedEmptyKind({ ...base, error: 'boom' }), 'filtered')
  })

  it('answers no-posts only when nothing is collecting, failing or filtered', () => {
    assert.equal(feedEmptyKind(base), 'no-posts')
    // An account that already collected is not a first-fetch wait.
    assert.equal(
      feedEmptyKind({ ...base, accounts: [{ id: 'a', refresh_state: 'idle', post_count: 0 }] }),
      'no-posts',
    )
  })
})
