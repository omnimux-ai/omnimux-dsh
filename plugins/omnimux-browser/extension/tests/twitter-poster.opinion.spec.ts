// @ts-nocheck
// @vitest-environment jsdom
/**
 * Opinion prompt and response hygiene: the generated text must be bounded and
 * stripped of model formatting before it lands in the composer.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'vitest'
import {
  OPINION_MAX_CHARS,
  buildOpinionPrompt,
  generateOpinion,
  limitOpinionLength,
} from '../src/content/twitter-poster/opinion.ts'

afterEach(() => {
  delete globalThis.chrome
})

describe('buildOpinionPrompt', () => {
  it('embeds the author and body for the Chinese prompt', () => {
    const prompt = buildOpinionPrompt({ text: '原推正文', author: 'alice', locale: 'zh' })
    assert.ok(prompt.userMessage.includes('@alice'))
    assert.ok(prompt.userMessage.includes('原推正文'))
    assert.ok(prompt.systemPrompt.includes('个人观点'))
  })

  it('uses the English prompt for an English reader', () => {
    const prompt = buildOpinionPrompt({ text: 'original post', author: 'alice', locale: 'en' })
    assert.ok(prompt.userMessage.includes('Original post'))
    assert.ok(prompt.systemPrompt.includes('first-person opinion'))
  })
})

describe('limitOpinionLength', () => {
  it('leaves a short opinion unchanged', () => {
    assert.equal(limitOpinionLength('短观点。', 'zh'), '短观点。')
  })

  it('cuts long text at a sentence boundary before the cap', () => {
    const sentence = '这是一句足够长的观点。'
    const text = sentence.repeat(30)
    const limited = limitOpinionLength(text, 'zh')
    assert.ok(limited.length <= OPINION_MAX_CHARS.zh)
    assert.ok(limited.endsWith('。'))
  })

  it('marks a hard cut when no sentence boundary is near the cap', () => {
    const limited = limitOpinionLength('长'.repeat(500), 'zh')
    assert.ok(limited.length <= OPINION_MAX_CHARS.zh)
    assert.ok(limited.endsWith('…'))
  })
})

describe('generateOpinion', () => {
  it('returns an empty string when the host has no answer', async () => {
    globalThis.chrome = {
      runtime: {
        lastError: undefined,
        sendMessage: (_message, callback) => callback({ ok: false }),
      },
    }
    const text = await generateOpinion({ text: '正文', author: 'alice', locale: 'zh' }, 50)
    assert.equal(text, '')
  })

  it('sanitises markdown and prefixes from the model output', async () => {
    globalThis.chrome = {
      runtime: {
        lastError: undefined,
        sendMessage: (_message, callback) => callback({ ok: true, text: '**评论**：这是观点。' }),
      },
    }
    const text = await generateOpinion({ text: '正文', author: 'alice', locale: 'zh' }, 50)
    assert.ok(text.includes('这是观点。'))
    assert.ok(!text.includes('**'))
  })

  it('skips the request when the source body is empty', async () => {
    let called = false
    globalThis.chrome = {
      runtime: {
        lastError: undefined,
        sendMessage: () => { called = true },
      },
    }
    const text = await generateOpinion({ text: '   ', author: 'alice', locale: 'zh' }, 50)
    assert.equal(text, '')
    assert.equal(called, false)
  })
})
