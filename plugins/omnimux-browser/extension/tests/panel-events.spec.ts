// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  appendLiveRow,
  completeLastTool,
  mergeHistoryRows,
  pendingQuestionFromFrame,
  resolvedQuestionFromFrame,
  rowFromEvent,
  textFromBlocks,
  toolSummary,
  type SessionEventView,
} from '../src/panel/events.ts'

/** 构造符合真实 SessionEvent 形状（{ type, seq, time, data }）的事件。 */
function ev(type: string, data: Record<string, unknown>): SessionEventView {
  return { type, data }
}

describe('textFromBlocks', () => {
  it('extracts text blocks and ignores non-text', () => {
    expect(textFromBlocks([{ type: 'text', text: '你好' }, { type: 'reasoning', text: '思考' }])).toBe('你好')
    expect(textFromBlocks(undefined)).toBe('')
    expect(textFromBlocks([{ type: 'text' }])).toBe('')
  })
})

describe('rowFromEvent', () => {
  it('renders user messages from data.content (the real SessionEvent shape)', () => {
    const row = rowFromEvent(ev('user/message', { content: [{ type: 'text', text: '帮我看看页面' }], source: { kind: 'user' } }))
    expect(row).toEqual({ seq: 0, kind: 'user', text: '帮我看看页面' })
  })

  it('skips system-injected user/message events (source.kind = plugin)', () => {
    // dsh 每轮注入的运行时上下文（<system-reminder> 等）是 plugin 来源，
    // 绝不能渲染成用户消息。
    const injected = ev('user/message', {
      content: [{ type: 'text', text: '</system-reminder> 一段很长的系统注入…' }],
      source: { kind: 'plugin', plugin: 'workspace-context' },
    })
    expect(rowFromEvent(injected)).toBeNull()
  })

  it('renders assistant messages from data.message.content', () => {
    const row = rowFromEvent(ev('assistant/message', { message: { content: [{ type: 'text', text: '好的' }] } }))
    expect(row).toEqual({ seq: 0, kind: 'assistant', text: '好的', status: 'complete', sourceSeq: undefined })
  })

  it('renders image-only and mixed multimodal messages from durable attachment refs', () => {
    const image = {
      type: 'image',
      attachment: {
        attachmentId: 'image-1', mediaType: 'image/png', bytes: 10, width: 20, height: 30, name: 'page.png',
      },
    }
    // Row.images 升级为 ProducedMediaRef：attachment 块经 attachmentProduced 加 source 标记。
    const produced = [{ source: 'attachment' as const, ...image.attachment }]
    expect(rowFromEvent(ev('user/message', { content: [image], source: { kind: 'user' } }))).toEqual({
      seq: 0,
      kind: 'user',
      text: '',
      images: produced,
    })
    expect(rowFromEvent(ev('assistant/message', {
      message: { content: [{ type: 'text', text: 'I see it' }, image] },
    }))).toEqual({
      seq: 0,
      kind: 'assistant',
      status: 'complete',
      sourceSeq: undefined,
      text: 'I see it',
      images: produced,
    })
  })

  it('skips assistant events that contain only tool or blank blocks', () => {
    expect(rowFromEvent(ev('assistant/message', {
      message: { content: [{ type: 'tool_use', name: 'browser_snapshot' }] },
    }))).toBeNull()
    expect(rowFromEvent(ev('assistant/message', {
      message: { content: [{ type: 'text', text: '   \n' }] },
    }))).toBeNull()
  })

  it('returns null for non-message events', () => {
    expect(rowFromEvent(ev('turn/start', {}))).toBeNull()
    expect(rowFromEvent(ev('tool/call', { name: 'browser_click' }))).toBeNull()
  })
})

describe('toolSummary', () => {
  it('appends the inventory index when present', () => {
    expect(toolSummary('browser_click', '{"index":7}', 'zh')).toBe('点击元素 #7')
    expect(toolSummary('browser_snapshot', '{"delta":true}', 'zh')).toBe('读取页面')
    expect(toolSummary('browser_navigate', 'not-json', 'zh')).toBe('打开页面')
    expect(toolSummary('browser_open_tab', '{"url":"https://example.com"}', 'zh')).toBe('打开新标签页')
    expect(toolSummary('browser_list_tabs', '{}', 'zh')).toBe('列出标签页')
    expect(toolSummary('browser_follow_tab', '{"tabId":17}', 'zh')).toBe('跟随标签页')
    expect(toolSummary('browser_close_tab', '{"tabId":18}', 'zh')).toBe('关闭标签页')
    expect(toolSummary('custom_tool', '{}', 'zh')).toBe('custom_tool')
    expect(toolSummary('browser_click', '{"index":7}', 'en')).toBe('Click element #7')
    expect(toolSummary('browser_open_tab', '{"url":"https://example.com"}', 'en')).toBe('Open new tab')
    expect(toolSummary('browser_list_tabs', '{}', 'en')).toBe('List open tabs')
    expect(toolSummary('browser_follow_tab', '{"tabId":17}', 'en')).toBe('Follow tab')
    expect(toolSummary('browser_close_tab', '{"tabId":18}', 'en')).toBe('Close tab')
  })
})

describe('appendLiveRow / completeLastTool', () => {
  it('merges consecutive tool rows into one line (no tool spam)', () => {
    let rows: ReturnType<typeof appendLiveRow> = []
    rows = appendLiveRow(rows, 'user', '帮我操作页面', 1)
    rows = appendLiveRow(rows, 'tool', '读取页面', 2)
    rows = appendLiveRow(rows, 'tool', '点击元素 #7', 3)
    rows = appendLiveRow(rows, 'tool', '填写内容 #9', 4)
    rows = completeLastTool(rows, 5)
    expect(rows.map((r) => r.kind)).toEqual(['user', 'tool'])
    expect(rows[1]).toMatchObject({ text: '读取页面 → 点击元素 #7 → 填写内容 #9', status: 'complete' })
    rows = appendLiveRow(rows, 'assistant', '完成', 6)
    expect(rows.map((r) => r.kind)).toEqual(['user', 'tool', 'assistant'])
  })
})

describe('mergeHistoryRows', () => {
  it('aggregates tool calls and renders user/assistant text from data', () => {
    let seq = 0
    const nextSeq = (): number => { seq += 1; return seq }
    const events = [
      ev('user/message', { content: [{ type: 'text', text: '操作页面' }], source: { kind: 'user' } }),
      ev('turn/start', {}),
      ev('tool/call', { name: 'browser_snapshot', arguments: '{}' }),
      ev('tool/result', {}),
      ev('tool/call', { name: 'browser_click', arguments: '{"index":7}' }),
      ev('tool/result', {}),
      ev('tool/call', { name: 'browser_click', arguments: '{"index":8}' }),
      ev('tool/result', {}),
      ev('assistant/message', { message: { content: [{ type: 'text', text: '已点击' }] } }),
      ev('turn/end', {}),
    ]
    const rows = mergeHistoryRows(events, nextSeq, 'zh')
    // tool/result 会 flush 未决工具行（给可能的产物行让位），真实事件流里
    // 交替的 call/result 各成一行，不再跨 result 归并。
    expect(rows.map((r) => r.kind)).toEqual(['user', 'tool', 'tool', 'tool', 'assistant'])
    expect(rows[0]!.text).toBe('操作页面')
    expect(rows[4]!.text).toBe('已点击')
    expect(rows[1]).toMatchObject({ text: '读取页面', status: 'complete' })
    expect(rows[2]).toMatchObject({ text: '点击元素 #7', status: 'complete' })
    expect(rows[3]).toMatchObject({ text: '点击元素 #8', status: 'complete' })
  })

  it('does not restore empty assistant rows from history', () => {
    let seq = 0
    const rows = mergeHistoryRows([
      ev('assistant/message', { message: { content: [{ type: 'tool_use', name: 'browser_snapshot' }] } }),
      ev('tool/call', { name: 'browser_snapshot', arguments: '{}' }),
      ev('tool/result', {}),
    ], () => { seq += 1; return seq }, 'zh')
    expect(rows).toEqual([{ seq: 1, kind: 'tool', text: '读取页面', status: 'complete' }])
  })

  it('handles empty history', () => {
    expect(mergeHistoryRows([], () => 0)).toEqual([])
  })

  it('pairs a submit tool call with its result and emits one produced-media assistant row', () => {
    let seq = 0
    const rows = mergeHistoryRows([
      ev('tool/call', { callId: 'call-1', name: 'omnimux_image_submit', arguments: '{"prompt":"a cat"}' }),
      ev('tool/result', {
        message: {
          toolCallId: 'call-1',
          content: [{ type: 'text', text: '{"mode":"live","dest":"/d/x.png"}' }],
        },
      }),
    ], () => { seq += 1; return seq }, 'zh')

    // 工具行照常 flush，随后一条 assistant 行携带 path 源产物。
    expect(rows.map((r) => r.kind)).toEqual(['tool', 'assistant'])
    expect(rows[0]!.text).toBe('omnimux_image_submit')
    const images = rows[1]!.images
    expect(images).toHaveLength(1)
    expect(images![0]).toMatchObject({ source: 'path', path: '/d/x.png', kind: 'image', name: 'x.png' })
    expect(rows[1]!.status).toBe('complete')
  })

  it('flushes the tool line without adding a row when a tool/result produced nothing', () => {
    let seq = 0
    const rows = mergeHistoryRows([
      ev('tool/call', { callId: 'call-2', name: 'omnimux_image_submit', arguments: '{}' }),
      // mode:'submitted' 无 dest —— 除工具行外不新增任何行。
      ev('tool/result', {
        message: {
          toolCallId: 'call-2',
          content: [{ type: 'text', text: '{"mode":"submitted","taskId":"t1"}' }],
        },
      }),
    ], () => { seq += 1; return seq }, 'zh')

    expect(rows).toEqual([{ seq: 1, kind: 'tool', text: 'omnimux_image_submit', status: 'complete' }])
  })
})

describe('question mux frames', () => {
  it('parses the full question, compact header, options, and session identity', () => {
    expect(pendingQuestionFromFrame({
      rpcId: 'question-rpc',
      method: 'question/requested',
      payload: {
        sessionId: 'session-1',
        questions: [{
          id: 'database',
          header: 'Database',
          question: 'Which database should we use?',
          detail: 'Choose the default for local development.',
          options: [{ label: 'SQLite', description: 'No setup required' }, { label: 'Postgres' }],
          multiSelect: false,
        }],
      },
    })).toEqual({
      rpcId: 'question-rpc',
      sessionId: 'session-1',
      questions: [{
        id: 'database',
        header: 'Database',
        question: 'Which database should we use?',
        detail: 'Choose the default for local development.',
        options: [{ label: 'SQLite', description: 'No setup required' }, { label: 'Postgres' }],
        multiSelect: false,
      }],
    })
  })

  it('rejects malformed question payloads instead of trusting mux data', () => {
    expect(pendingQuestionFromFrame({ rpcId: 'r', method: 'session/event', payload: {} })).toBeNull()
    expect(pendingQuestionFromFrame({ rpcId: 'r', method: 'question/requested', payload: null })).toBeNull()
    expect(pendingQuestionFromFrame({ rpcId: 'r', method: 'question/requested', payload: { sessionId: 5, questions: [] } })).toBeNull()
    expect(pendingQuestionFromFrame({
      rpcId: 'r', method: 'question/requested',
      payload: { sessionId: 's', questions: [{ id: 'q', question: 'Question?', options: [{ label: 4 }] }] },
    })).toBeNull()
  })

  it('accepts wire-valid empty strings and repeated question ids', () => {
    expect(pendingQuestionFromFrame({
      rpcId: '', method: 'question/requested',
      payload: {
        sessionId: 's',
        questions: [
          { id: '', question: '', options: [{ label: '' }] },
          { id: '', question: 'Repeated id' },
        ],
      },
    })).toEqual({
      rpcId: '',
      sessionId: 's',
      questions: [
        { id: '', question: '', options: [{ label: '' }] },
        { id: '', question: 'Repeated id' },
      ],
    })
  })

  it('extracts both identifiers required to match question/resolved', () => {
    expect(resolvedQuestionFromFrame({
      rpcId: 'event-rpc',
      method: 'question/resolved',
      payload: { sessionId: 'session-1', questionRpcId: 'question-rpc' },
    })).toEqual({ sessionId: 'session-1', rpcId: 'question-rpc' })
    expect(resolvedQuestionFromFrame({
      rpcId: 'event-rpc', method: 'question/resolved', payload: { sessionId: 'session-1' },
    })).toBeNull()
  })
})
