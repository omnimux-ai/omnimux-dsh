/**
 * Collect one chat turn from bridge `session/event` frames.
 *
 * The poster opinion is generated through a temporary chat session, so the
 * background worker must turn the host's event stream back into one body:
 * `assistant/message` carries the text, `turn/end` carries the outcome. This
 * module is pure so the parsing can be unit-tested without Chrome.
 *
 * @module
 */

export interface SessionTurnOutcome {
  ok: boolean
  error?: string
}

function textOfMessage(message: unknown): string {
  if (typeof message !== 'object' || message === null) return ''
  const content = (message as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    if ((block as { type?: unknown }).type !== 'text') continue
    const text = (block as { text?: unknown }).text
    if (typeof text === 'string' && text !== '') parts.push(text)
  }
  return parts.join('')
}

function reasonError(reason: unknown): string {
  if (typeof reason !== 'object' || reason === null) return '会话没有完成'
  const kind = (reason as { kind?: unknown }).kind
  if (kind === 'completed') return ''
  if (kind === 'canceled' || kind === 'aborted') return '会话被取消'
  const error = (reason as { error?: { message?: unknown } }).error
  return typeof error?.message === 'string' && error.message.trim() !== ''
    ? error.message.trim()
    : '会话没有完成'
}

/** Accumulates assistant text and the final outcome for one temporary session. */
export class SessionTextCollector {
  text = ''
  outcome: SessionTurnOutcome | null = null

  constructor(readonly sessionId: string) {}

  /** Returns true when the frame belongs to this session. */
  push(frame: unknown): boolean {
    const record = (frame as { frame?: { method?: unknown; payload?: unknown } } | null)?.frame
    if (record?.method !== 'session/event') return false
    const payload = record.payload as { sessionId?: unknown; event?: { type?: unknown; data?: unknown } } | undefined
    if (payload?.sessionId !== this.sessionId || payload.event === undefined) return false
    const event = payload.event
    if (event.type === 'assistant/message') {
      const data = event.data as { message?: unknown } | undefined
      const text = textOfMessage(data?.message)
      if (text !== '') this.text = text
      return true
    }
    if (event.type === 'turn/end') {
      const reason = (event.data as { reason?: unknown } | undefined)?.reason
      const error = reasonError(reason)
      this.outcome = error === '' ? { ok: true } : { ok: false, error }
      return true
    }
    return true
  }
}
