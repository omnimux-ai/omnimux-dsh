import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  activeFetchAccounts,
  fetchIssue,
  fetchPollIntervalMs,
  fetchPollBudget,
} from './rival-fetch-watch.js'

/**
 * Unit gate for the bounded first-fetch watch (#3112).
 *
 * The watch is the only mechanism the ticket adds: it must poll while — and
 * only while — an account is queued/running, must call a terminal state a
 * failure instead of spinning forever, and must stop on a budget so a broken
 * promise cannot keep a timer alive.
 *
 * Expected values come from the spec and the ticket, not from the module:
 * active = queued|running (Host constants), the promise is「约 1 分钟」,
 * the client interval is the E1 `config_summary.poll_interval_ms` field, and
 * the budget leaves headroom (~40 polls at the shipped 2500ms).
 */

const queued = { id: 'a', refresh_state: 'queued' }
const running = { id: 'a', refresh_state: 'running' }
const idleWithPosts = { id: 'a', refresh_state: 'idle', post_count: 3 }
const errored = { id: 'a', refresh_state: 'error', post_count: 0, consecutive_failures: 4 }
const cooling = {
  id: 'a',
  refresh_state: 'backoff',
  post_count: 0,
  next_auto_refresh_at: '2026-10-05T09:10:00.000Z',
}
const pausedEmpty = { id: 'a', refresh_state: 'paused', post_count: 0 }

describe('activeFetchAccounts (#3112)', () => {
  it('flags queued and running accounts as the in-flight signal', () => {
    assert.deepEqual(activeFetchAccounts([queued]), [queued])
    assert.deepEqual(activeFetchAccounts([running]), [running])
  })

  it('does not flag idle, error, backoff or paused states', () => {
    for (const account of [idleWithPosts, errored, cooling, pausedEmpty]) {
      assert.deepEqual(activeFetchAccounts([account]), [])
    }
  })

  it('returns only the active ones from a mixed pool', () => {
    const list = activeFetchAccounts([idleWithPosts, running, errored])
    assert.deepEqual(list, [running])
  })
})

describe('fetchIssue (#3112)', () => {
  it('returns null while the pool is fine (no terminal state with zero posts)', () => {
    assert.equal(fetchIssue([queued, idleWithPosts]), null)
  })

  it('reports stopped when a first fetch ended in error with no posts collected', () => {
    const issue = fetchIssue([errored])
    assert.equal(issue.kind, 'stopped')
    assert.equal(issue.account, errored)
  })

  it('does not flag an errored account that already holds posts — it is a refresh failure, not a first-fetch failure', () => {
    const account = { ...errored, post_count: 5 }
    assert.equal(fetchIssue([account]), null)
  })

  it('reports cooling when the first fetch is waiting out the backoff', () => {
    const now = Date.parse('2026-10-05T09:03:00.000Z')
    const issue = fetchIssue([cooling], now)
    assert.equal(issue.kind, 'cooling')
    assert.equal(issue.minutes, 7)
  })

  it('rounds the cooling minutes up and never below one', () => {
    const account = { ...cooling, next_auto_refresh_at: '2026-10-05T09:00:40.000Z' }
    const now = Date.parse('2026-10-05T09:00:00.000Z')
    const issue = fetchIssue([account], now)
    assert.equal(issue.kind, 'cooling')
    assert.equal(issue.minutes, 1)
  })

  it('falls back to a generic failure when cooling carries no parseable clock', () => {
    const account = { ...cooling, next_auto_refresh_at: null }
    const issue = fetchIssue([account], Date.parse('2026-10-05T09:00:00.000Z'))
    assert.equal(issue.kind, 'failed')
  })

  it('ignores paused accounts — a skipped budget window is not a fetch failure', () => {
    assert.equal(fetchIssue([pausedEmpty]), null)
  })
})

describe('fetchPollIntervalMs (#3112)', () => {
  it('consumes the interval the server ships in config_summary', () => {
    assert.equal(fetchPollIntervalMs({ config_summary: { poll_interval_ms: 2500 } }), 2500)
  })

  it('falls back to the shipped default when the field is absent or malformed', () => {
    assert.equal(fetchPollIntervalMs({}), 2500)
    assert.equal(fetchPollIntervalMs({ config_summary: { poll_interval_ms: 'nope' } }), 2500)
  })
})

describe('fetchPollBudget (#3112)', () => {
  it('caps the watch at the promised minute plus headroom — ~40 polls at 2500ms', () => {
    // 60_000 × 1.4 = 84_000ms of watching at 2_500ms intervals → 34 polls.
    assert.equal(fetchPollBudget(2500), 34)
  })

  it('respects a different server interval instead of a hardcoded count', () => {
    assert.equal(fetchPollBudget(5000), 17)
  })

  it('keeps a sane floor for pathological intervals', () => {
    assert.ok(fetchPollBudget(60000) >= 2)
  })
})
