import { describe, it, expect } from 'vitest'
// @vitest-environment jsdom
import { rowFromEvent, mergeHistoryRows, appendLiveRow } from '../src/panel/events.ts'

describe('durable draft provenance', () => {
  const event = { type: 'assistant/message', seq: 42, data: { message: { content: [{ type: 'text', text: '普通说明' }] } } }
  it('marks only durable assistant messages complete and retains their identity', () => {
    expect(rowFromEvent(event)).toMatchObject({ status: 'complete', sourceSeq: 42 })
  })
  it('passes durable provenance through live append without authorizing ordinary rows', () => {
    const row = rowFromEvent(event)!
    expect(appendLiveRow([], row.kind, row.text, 91, row.images, row)[0]).toMatchObject({ seq: 91, sourceSeq: 42, status: 'complete' })
    expect(appendLiveRow([], 'assistant', 'unfinished', 90)[0]?.status).toBeUndefined()
  })
  it('retains durable identity when history allocates display sequences', () => {
    expect(mergeHistoryRows([event], () => 99)[0]).toMatchObject({ seq: 99, sourceSeq: 42, status: 'complete' })
  })
})
