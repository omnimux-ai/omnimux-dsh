/**
 * Pure conversation-rendering logic: maps session events (live and history)
 * to display rows. Kept framework-free so the wire shapes are unit-tested
 * against the REAL SessionEvent contract: `{ type, seq, time, data }` — the
 * payload always lives in `data`, never on the event root.
 *
 * @module
 */

import { getUiLocale, type UiLocale } from '../i18n.ts'
import { imageRefsFromBlocks, type ImageAttachmentRef } from './attachments.ts'
import { PANEL_COPY } from './strings.ts'

/** One rendered conversation row. */
export interface Row {
  seq: number
  sourceSeq?: number
  /** 1-based turn owning this row (turn/start order); undefined = pre-turn info. */
  turn?: number
  kind: 'user' | 'assistant' | 'tool' | 'info'
  text: string
  images?: ImageAttachmentRef[]
  status?: 'running' | 'complete'
}

/** Minimal view of a SessionEvent (payload in `data`). */
export interface SessionEventView {
  type: string
  seq?: number
  surfaceOp?: unknown
  data?: {
    content?: unknown
    source?: { kind?: string }
    message?: { content?: unknown; source?: { kind?: string } }
    turn?: number
    step?: number
    name?: string
    arguments?: string
    title?: unknown
    reason?: { kind?: string; error?: unknown }
    target?: string
    start?: number
    removedCount?: number
    inserted?: unknown[]
    outcome?: string
  }
}

/** One user-selectable answer exposed by ask_user_question. */
export interface QuestionOption {
  label: string
  description?: string
}

/** One item in a question batch. */
export interface QuestionItem {
  id: string
  question: string
  header?: string
  detail?: string
  options?: QuestionOption[]
  multiSelect?: boolean
}

/** Pending interaction belonging to one dsh session. */
export interface PendingQuestion {
  rpcId: string
  sessionId: string
  questions: QuestionItem[]
}

/** Identity carried by question/resolved; both fields must match before clearing UI. */
export interface ResolvedQuestion {
  rpcId: string
  sessionId: string
}

/** The gateway mux envelope shape carried inside a bridge event frame. */
export interface EventFrameView {
  rpcId: string
  method: string
  payload: unknown
}

export function pendingQuestionFromFrame(frame: EventFrameView): PendingQuestion | null {
  if (typeof frame.rpcId !== 'string' || frame.method !== 'question/requested' || !isRecord(frame.payload)) return null
  const sessionId = frame.payload.sessionId
  const rawQuestions = frame.payload.questions
  if (typeof sessionId !== 'string' || !Array.isArray(rawQuestions) || rawQuestions.length === 0) return null
  const questions: QuestionItem[] = []
  for (const value of rawQuestions) {
    const question = parseQuestionItem(value)
    if (question === null) return null
    questions.push(question)
  }
  return { rpcId: frame.rpcId, sessionId, questions }
}

export function resolvedQuestionFromFrame(frame: EventFrameView): ResolvedQuestion | null {
  if (frame.method !== 'question/resolved' || !isRecord(frame.payload)) return null
  const sessionId = frame.payload.sessionId
  const rpcId = frame.payload.questionRpcId
  return typeof sessionId === 'string' && typeof rpcId === 'string' ? { sessionId, rpcId } : null
}

function parseQuestionItem(value: unknown): QuestionItem | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.question !== 'string') return null
  if (value.header !== undefined && typeof value.header !== 'string') return null
  if (value.detail !== undefined && typeof value.detail !== 'string') return null
  if (value.multiSelect !== undefined && typeof value.multiSelect !== 'boolean') return null
  let options: QuestionOption[] | undefined
  if (value.options !== undefined) {
    if (!Array.isArray(value.options)) return null
    options = []
    for (const rawOption of value.options) {
      if (!isRecord(rawOption) || typeof rawOption.label !== 'string') return null
      if (rawOption.description !== undefined && typeof rawOption.description !== 'string') return null
      options.push({
        label: rawOption.label,
        ...(rawOption.description === undefined ? {} : { description: rawOption.description }),
      })
    }
  }
  return {
    id: value.id,
    question: value.question,
    ...(value.header === undefined ? {} : { header: value.header }),
    ...(value.detail === undefined ? {} : { detail: value.detail }),
    ...(options === undefined ? {} : { options }),
    ...(value.multiSelect === undefined ? {} : { multiSelect: value.multiSelect }),
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Extract model-visible text from content blocks (defensive: unknown block shapes degrade to markers). */
export function textFromBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return String(blocks ?? '')
  const parts: string[] = []
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as { type?: string; text?: unknown }
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
  }
  return parts.join('\n')
}

/** Map one session event to a row (user/assistant only; tools handled separately). */
export function rowFromEvent(event: SessionEventView): Row | null {
  switch (event.type) {
    case 'user/message': {
      // dsh 每轮把运行时常量上下文作为 source.kind='plugin' 的 user/message
      // 记入日志（如 <system-reminder> 注入内容）——它们不是用户消息，
      // 渲染会污染对话流，必须跳过。
      const message = event.data?.message ?? event.data
      const source = message?.source
      if (source?.kind !== 'user') return null
      const blocks = message?.content
      const text = textFromBlocks(blocks)
      const images = imageRefsFromBlocks(blocks)
      return text.trim() === '' && images.length === 0
        ? null
        : { seq: 0, kind: 'user', text, ...(images.length === 0 ? {} : { images }) }
    }
    case 'assistant/message': {
      // 工具调用也会产生 assistant/message，但其 content 可能只有 tool_use
      // 等非文本块。不要为这种中间事件渲染一个空的 AI 气泡。
      const blocks = event.data?.message?.content
      const text = textFromBlocks(blocks)
      const images = imageRefsFromBlocks(blocks)
      return text.trim() === '' && images.length === 0
        ? null
        : { seq: 0, kind: 'assistant', text, status: 'complete', sourceSeq: event.seq, ...(images.length === 0 ? {} : { images }) }
    }
    default:
      return null
  }
}

/** 工具调用的友好展示名：带 index 参数时附上（如「点击元素 #7」）。 */
export function toolSummary(name: string, argsJson: unknown, locale: UiLocale = getUiLocale()): string {
  let summary = PANEL_COPY[locale].tool.labels[name] ?? name
  try {
    const args = JSON.parse(String(argsJson ?? '{}')) as unknown
    if (typeof args === 'object' && args !== null && 'index' in args) {
      summary += ` #${String((args as { index?: unknown }).index)}`
    }
  } catch {
    // 模型参数不可解析：只显示工具名。
  }
  return summary
}

/** live 合并：若最后一行是工具行则并入（连续工具调用不刷屏），否则新增一行。 */
export function appendLiveRow(
  rows: Row[],
  kind: Row['kind'],
  text: string,
  seq: number,
  images?: ImageAttachmentRef[],
  provenance?: Pick<Row, 'status' | 'sourceSeq'>,
  turn?: number,
): Row[] {
  const withTurn = turn === undefined ? {} : { turn }
  if (kind === 'tool') {
    const last = rows[rows.length - 1]
    if (last?.kind === 'tool') {
      return [...rows.slice(0, -1), { seq, kind: 'tool', text: `${last.text} → ${text}`, status: 'running', ...withTurn }]
    }
    return [...rows, { seq, kind, text, status: 'running', ...withTurn }]
  }
  return [...rows, { seq, kind, text, ...withTurn, ...(provenance === undefined ? {} : { status: provenance.status, sourceSeq: provenance.sourceSeq }), ...(images === undefined || images.length === 0 ? {} : { images }) }]
}

/** 标记最后一行工具调用已完成（并入，不新增行）。 */
export function completeLastTool(rows: Row[], seq: number): Row[] {
  const last = rows[rows.length - 1]
  if (last?.kind === 'tool') {
    return [...rows.slice(0, -1), { ...last, seq, status: 'complete' }]
  }
  return rows
}

/** 历史渲染：连续工具调用归并成一行（tool/call..result 不逐条刷屏；超 3 个折叠计数）。 */
export function mergeHistoryRows(
  events: SessionEventView[],
  nextSeq: () => number,
  locale: UiLocale = getUiLocale(),
): Row[] {
  const rows: Row[] = []
  // turn/start carries the 1-based turn number; rows after it belong to that
  // turn until the next boundary. Older logs without data.turn fall back to
  // counting turn/start events (same numbering).
  let turnCursor = 0
  const turnTag = (): { turn?: number } => (turnCursor === 0 ? {} : { turn: turnCursor })
  let pendingTool: { items: string[]; total: number } | null = null
  const flushTool = (): void => {
    if (pendingTool === null) return
    const shown = pendingTool.items.slice(0, 3)
    const label = pendingTool.total > shown.length
      ? PANEL_COPY[locale].tool.overflow(shown, pendingTool.total)
      : shown.join(' → ')
    rows.push({ seq: nextSeq(), kind: 'tool', text: label, status: 'complete', ...turnTag() })
    pendingTool = null
  }
  for (const ev of events) {
    if (ev.type === 'turn/start') {
      const declared = ev.data?.turn
      turnCursor = typeof declared === 'number' && Number.isInteger(declared) && declared > 0
        ? declared
        : turnCursor + 1
      continue
    }
    if (ev.type === 'tool/call') {
      const summary = toolSummary(ev.data?.name ?? 'tool', ev.data?.arguments, locale)
      if (pendingTool === null) pendingTool = { items: [summary], total: 1 }
      else {
        pendingTool.items.push(summary)
        pendingTool.total += 1
      }
      continue
    }
    if (ev.type === 'tool/result') continue
    flushTool()
    const row = rowFromEvent(ev)
    if (row !== null) rows.push({ ...row, seq: nextSeq(), ...turnTag() })
  }
  flushTool()
  return rows
}

/** 从 turn/end 事件读取 1-based 轮次号（缺 data.turn 时回退计数）。 */
export function turnNumberOf(event: SessionEventView): number | null {
  const declared = event.data?.turn
  return typeof declared === 'number' && Number.isInteger(declared) && declared > 0 ? declared : null
}

/** 轮次摘要预览预算：与 dsh 官方轮次导航一致（提问 1 行 / 回复 3 行）。 */
export const TURN_PROMPT_PREVIEW_LIMIT = 50
export const TURN_RESPONSE_PREVIEW_LIMIT = 120

/** 按官方同款预算截断文本：空白归一化后超限加省略号。 */
export function previewClip(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit - 1) return normalized
  return `${normalized.slice(0, limit - 1).trimEnd()}…`
}

/** turnOutline 投影视图里的一条轮次摘要（宿主 wire 形状）。 */
export interface TurnOutlineEntry {
  turn: number
  seq: number
  prompt: string
  response: string
}

/** 解析 history.projections.values.turnOutline（校验宽松，非法项丢弃）。 */
export function turnOutlineEntries(value: unknown): TurnOutlineEntry[] {
  if (!Array.isArray(value)) return []
  const entries: TurnOutlineEntry[] = []
  for (const raw of value) {
    if (!isRecord(raw)) continue
    const turn = raw.turn
    const seq = raw.seq
    if (typeof turn !== 'number' || !Number.isInteger(turn) || turn <= 0) continue
    entries.push({
      turn,
      seq: typeof seq === 'number' ? seq : 0,
      prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
      response: typeof raw.response === 'string' ? raw.response : '',
    })
  }
  return entries
}

/** inbox 投影视图里的一条排队消息（宿主 wire 形状的最小读取面）。 */
export interface QueuedMessage {
  id: string
  text: string
}

/** 从一条 inbox 消息提取展示文本（message.content → text blocks join）。 */
export function queuedMessageText(message: unknown): string {
  if (!isRecord(message)) return ''
  const content = message.content
  return textFromBlocks(content).replace(/\s+/g, ' ').trim()
}

/** 解析 inbox 投影的 next-turn 排队消息。 */
export function inboxQueuedMessages(inbox: unknown): QueuedMessage[] {
  if (!isRecord(inbox) || !Array.isArray(inbox['next-turn'])) return []
  const items: QueuedMessage[] = []
  for (const raw of inbox['next-turn']) {
    const id = isRecord(raw) && typeof raw.id === 'string' ? raw.id : ''
    items.push({ id, text: queuedMessageText(raw) })
  }
  return items
}

/** agent/inbox/spliced 事件的 wire 载荷。 */
export interface InboxSplice {
  target: 'next-turn' | 'next-step'
  start: number
  removedCount: number
  inserted: unknown[]
  outcome?: string
}

/** 解析 agent/inbox/spliced 事件；非该类型或载荷非法返回 null。 */
export function inboxSpliceFromEvent(event: SessionEventView): InboxSplice | null {
  if (event.type !== 'agent/inbox/spliced' || !isRecord(event.data)) return null
  const data = event.data as Record<string, unknown>
  const target = data.target
  if (target !== 'next-turn' && target !== 'next-step') return null
  const start = data.start
  if (typeof start !== 'number' || !Number.isSafeInteger(start) || start < 0) return null
  const removedCount = typeof data.removedCount === 'number' && Number.isSafeInteger(data.removedCount)
    ? data.removedCount
    : 0
  return {
    target,
    start,
    removedCount,
    inserted: Array.isArray(data.inserted) ? data.inserted : [],
    ...(typeof data.outcome === 'string' ? { outcome: data.outcome } : {}),
  }
}

/** 把一条 inbox splice 应用到本地 next-turn 队列快照。 */
export function applyInboxSplice(queue: unknown[], splice: InboxSplice): unknown[] {
  if (splice.target !== 'next-turn') return queue
  const next = queue.slice()
  next.splice(splice.start, splice.removedCount, ...splice.inserted)
  return next
}

/**
 * 提取 turn/end 中的异常原因描述，若无异常或正常结束则返回 null。
 */
export function errorFromTurnEnd(event: SessionEventView, locale: 'zh' | 'en' = 'zh'): string | null {
  if (event.type !== 'turn/end') return null
  const reason = (event.data as Record<string, unknown> | undefined)?.reason
  if (!reason || typeof reason !== 'object' || (reason as { kind?: unknown }).kind !== 'error') return null
  const err = (reason as { error?: unknown }).error
  const rawMsg = typeof err === 'object' && err !== null && 'message' in err
    ? String((err as { message?: unknown }).message)
    : (typeof err === 'string' ? err : '')
  if (rawMsg) {
    return locale === 'zh' ? `模型响应异常: ${rawMsg}` : `Model error: ${rawMsg}`
  }
  return locale === 'zh' ? '模型响应异常，请检查模型配置' : 'Model execution failed'
}
