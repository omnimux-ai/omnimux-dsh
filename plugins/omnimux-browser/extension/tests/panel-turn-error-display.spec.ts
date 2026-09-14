// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { errorFromTurnEnd, type SessionEventView } from '../src/panel/events.ts'

describe('errorFromTurnEnd', () => {
  it('returns null on normal completed turn/end', () => {
    const ev: SessionEventView = {
      type: 'turn/end',
      data: {
        turn: 1,
        reason: { kind: 'completed' },
      },
    }
    expect(errorFromTurnEnd(ev, 'zh')).toBeNull()
    expect(errorFromTurnEnd(ev, 'en')).toBeNull()
  })

  it('returns null on non-turn/end events', () => {
    const ev: SessionEventView = {
      type: 'assistant/message',
      data: {
        message: { content: [{ type: 'text', text: 'hello' }] },
      },
    }
    expect(errorFromTurnEnd(ev, 'zh')).toBeNull()
  })

  it('extracts error message when reason.kind is error', () => {
    const ev: SessionEventView = {
      type: 'turn/end',
      data: {
        turn: 1,
        reason: {
          kind: 'error',
          error: {
            message: 'pi-ai provider "cpa" has no configured model "gpt-6-astra"',
            code: 'UNKNOWN_MODEL',
          },
        },
      },
    }
    const errZh = errorFromTurnEnd(ev, 'zh')
    expect(errZh).toBe('模型响应异常: pi-ai provider "cpa" has no configured model "gpt-6-astra"')

    const errEn = errorFromTurnEnd(ev, 'en')
    expect(errEn).toBe('Model error: pi-ai provider "cpa" has no configured model "gpt-6-astra"')
  })

  it('falls back to localized default error message when error detail is missing', () => {
    const ev: SessionEventView = {
      type: 'turn/end',
      data: {
        turn: 1,
        reason: {
          kind: 'error',
        },
      },
    }
    expect(errorFromTurnEnd(ev, 'zh')).toBe('模型响应异常，请检查模型配置')
    expect(errorFromTurnEnd(ev, 'en')).toBe('Model execution failed')
  })
})
