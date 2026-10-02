// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import {
  applyInboxSplice,
  inboxQueuedMessages,
  inboxSpliceFromEvent,
  mergeHistoryRows,
  previewClip,
  turnNumberOf,
  turnOutlineEntries,
  type SessionEventView,
} from '../src/panel/events.ts'
import { buildRailItems } from '../src/panel/TurnRail.tsx'

const seq = (() => { let n = 0; return () => ++n })()

describe('task rail · turn tagging', () => {
  it('tags rows with the declared turn number from turn/start', () => {
    const events: SessionEventView[] = [
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'user/message', data: { message: { source: { kind: 'user' }, content: [{ type: 'text', text: '总结帖子' }] } } },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '帖子大意…' }] } } },
      { type: 'turn/end', data: { turn: 1 } },
      { type: 'turn/start', data: { turn: 2 } },
      { type: 'user/message', data: { message: { source: { kind: 'user' }, content: [{ type: 'text', text: '写点评' }] } } },
    ]
    const rows = mergeHistoryRows(events, seq)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ kind: 'user', turn: 1 })
    expect(rows[1]).toMatchObject({ kind: 'assistant', turn: 1 })
    expect(rows[2]).toMatchObject({ kind: 'user', turn: 2 })
  })

  it('falls back to counting turn/start events when data.turn is absent', () => {
    const events: SessionEventView[] = [
      { type: 'turn/start' },
      { type: 'user/message', data: { message: { source: { kind: 'user' }, content: [{ type: 'text', text: 'a' }] } } },
      { type: 'turn/start' },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'b' }] } } },
    ]
    const rows = mergeHistoryRows(events, seq)
    expect(rows[0]).toMatchObject({ turn: 1 })
    expect(rows[1]).toMatchObject({ turn: 2 })
  })

  it('turnNumberOf reads the declared value and rejects bad shapes', () => {
    expect(turnNumberOf({ type: 'turn/start', data: { turn: 4 } })).toBe(4)
    expect(turnNumberOf({ type: 'turn/start', data: {} })).toBeNull()
    expect(turnNumberOf({ type: 'turn/start' })).toBeNull()
  })
})

describe('task rail · inbox queue', () => {
  it('parses next-turn queued messages from the inbox projection', () => {
    const inbox = {
      'next-turn': [
        { id: 'm1', source: { kind: 'user' }, content: [{ type: 'text', text: '总结' }] },
        { id: 'm2', source: { kind: 'user' }, content: [{ type: 'text', text: '点评' }] },
      ],
      'next-step': [],
    }
    const items = inboxQueuedMessages(inbox)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ id: 'm1', text: '总结' })
  })

  it('applies splices to reconstruct the live queue', () => {
    const queue: unknown[] = [
      { id: 'a', content: [{ type: 'text', text: 'A' }] },
      { id: 'b', content: [{ type: 'text', text: 'B' }] },
    ]
    const splice = inboxSpliceFromEvent({
      type: 'agent/inbox/spliced',
      data: { target: 'next-turn', start: 1, inserted: [{ id: 'c', content: [{ type: 'text', text: 'C' }] }] },
    })
    expect(splice).not.toBeNull()
    const next = applyInboxSplice(queue, splice!)
    expect(next).toHaveLength(3)
    expect((next[1] as { id: string }).id).toBe('c')
    expect((next[2] as { id: string }).id).toBe('b')
  })

  it('ignores splices targeting next-step or malformed payloads', () => {
    expect(inboxSpliceFromEvent({ type: 'agent/inbox/spliced', data: { target: 'next-step', start: 0 } })).toMatchObject({ target: 'next-step' })
    expect(inboxSpliceFromEvent({ type: 'agent/inbox/spliced', data: { target: 'bogus', start: 0 } })).toBeNull()
    expect(inboxSpliceFromEvent({ type: 'turn/start' })).toBeNull()
  })
})

describe('task rail · turnOutline + previews', () => {
  it('parses wire outline entries and drops malformed ones', () => {
    const entries = turnOutlineEntries([
      { turn: 1, seq: 3, prompt: '总结帖子', response: '帖子大意' },
      { turn: 'x' },
      { turn: 2, seq: 9, prompt: '写点评', response: '' },
    ])
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ turn: 1, seq: 3 })
  })

  it('clips previews to the official budgets', () => {
    expect(previewClip('a'.repeat(80), 50)).toHaveLength(50)
    expect(previewClip('a'.repeat(80), 50).endsWith('…')).toBe(true)
    expect(previewClip('short', 50)).toBe('short')
    expect(previewClip('  多空格   折叠  ', 50)).toBe('多空格 折叠')
  })
})

describe('task rail · buildRailItems', () => {
  const rows = [
    { seq: 1, kind: 'user' as const, turn: 1, text: '总结帖子' },
    { seq: 2, kind: 'assistant' as const, turn: 1, text: '帖子大意' },
    { seq: 3, kind: 'user' as const, turn: 2, text: '写点评' },
    { seq: 4, kind: 'assistant' as const, turn: 2, text: '点评草稿' },
  ]

  it('merges row turns with outline turns and queue tail', () => {
    const items = buildRailItems(rows, [], [{ id: 'q1', text: '写回复角度' }], null, null)
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ kind: 'turn', turn: 1, status: 'done', prompt: '总结帖子', response: '帖子大意' })
    expect(items[1]).toMatchObject({ kind: 'turn', turn: 2, status: 'done' })
    expect(items[2]).toMatchObject({ kind: 'queued', status: 'queued', prompt: '写回复角度' })
  })

  it('marks the running and failed turns', () => {
    const running = buildRailItems(rows, [], [], 2, null)
    expect(running.find((i) => i.turn === 2)?.status).toBe('running')
    const failed = buildRailItems(rows, [], [], null, 2)
    expect(failed.find((i) => i.turn === 2)?.status).toBe('failed')
  })

  it('outline supplies previews for turns without loaded rows', () => {
    const items = buildRailItems(
      rows.slice(0, 2),
      [{ turn: 1, seq: 1, prompt: 'p1', response: 'r1' }, { turn: 9, seq: 40, prompt: '老任务', response: '老结果' }],
      [],
      null,
      null,
    )
    const old = items.find((i) => i.turn === 9)
    expect(old).toMatchObject({ prompt: '老任务', response: '老结果', status: 'done' })
  })
})
