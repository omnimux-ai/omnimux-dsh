import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sortTimelineRows, timelineBody, timelineInitial } from './rival-timeline.js'

/**
 * Pure rules of the account-monitor timeline (#3432). The page-level gate
 * covers the wiring; this file pins the ordering contract itself: newest first,
 * unreadable timestamps last, deterministic ties.
 */

describe('rival-timeline: publish-time order (#3432)', () => {
  const row = (id, posted_at) => ({ id, posted_at })

  it('sorts newest first even when the Host page arrives shuffled', () => {
    const ordered = sortTimelineRows([
      row('a', '2026-10-18T00:00:00.000Z'),
      row('b', '2026-10-20T00:00:00.000Z'),
      row('c', '2026-10-19T00:00:00.000Z'),
    ])
    assert.deepEqual(ordered.map((entry) => entry.id), ['b', 'c', 'a'])
  })

  it('sinks rows with an unreadable timestamp to the end', () => {
    const ordered = sortTimelineRows([
      row('bad', 'not-a-date'),
      row('old', '2026-10-18T00:00:00.000Z'),
      row('missing', undefined),
      row('new', '2026-10-20T00:00:00.000Z'),
    ])
    assert.deepEqual(ordered.map((entry) => entry.id), ['new', 'old', 'missing', 'bad'])
  })

  it('breaks equal timestamps by id, descending, so renders never swap', () => {
    const at = '2026-10-20T00:00:00.000Z'
    const first = sortTimelineRows([row('a', at), row('b', at)])
    const second = sortTimelineRows([row('b', at), row('a', at)])
    assert.deepEqual(first.map((entry) => entry.id), ['b', 'a'])
    assert.deepEqual(second.map((entry) => entry.id), ['b', 'a'])
  })

  it('does not mutate the input array', () => {
    const input = [row('a', '2026-10-18T00:00:00.000Z'), row('b', '2026-10-20T00:00:00.000Z')]
    sortTimelineRows(input)
    assert.deepEqual(input.map((entry) => entry.id), ['a', 'b'])
  })
})

describe('rival-timeline: row text (#3432)', () => {
  it('prefers the original post body over a URL-fallback title', () => {
    assert.equal(timelineBody({ text: 'real body', title: 'https://t.co/x' }), 'real body')
    assert.equal(timelineBody({ title: 'title only' }), 'title only')
    assert.equal(timelineBody({}), '')
  })

  it('uses the author initial, stripping the handle decoration', () => {
    assert.equal(timelineInitial({ account: { nickname: 'Judy Cafe' } }), 'J')
    assert.equal(timelineInitial({ account: { handle: '@gethullo' } }), 'G')
    assert.equal(timelineInitial({}), '?')
  })
})
