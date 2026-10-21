/**
 * Personal-opinion generation for the poster hand-off.
 *
 * Generation goes through the extension background worker, which owns the
 * loopback connection to the local OmniMux host. A missing host is a normal
 * offline state: the poster still ships, only the prefilled text is empty.
 *
 * @module
 */

import { sanitizeTweetText } from '../twitter-copilot/sanitizer.ts'

export type PosterLocale = 'zh' | 'en'

export interface OpinionInput {
  text: string
  author: string
  locale: PosterLocale
}

export interface OpinionPrompt {
  systemPrompt: string
  userMessage: string
}

/** Character budget for the prefilled opinion, matching each language's X weight. */
export const OPINION_MAX_CHARS: Record<PosterLocale, number> = { zh: 140, en: 240 }

const SYSTEM_ZH =
  '你是中文 X 创作者。根据给定推文，用第一人称写一段个人观点，作为引用转发的正文。要求：2 到 3 句，80 到 140 字；只表达自己的判断或补一个信息增量，不复述原文；口语化、有具体细节；不使用话题标签、表情符号、@ 或链接；不使用“深入探讨、赋能、闭环、底层逻辑、标志着、拭目以待”等套话；只输出正文。'

const SYSTEM_EN =
  'You are a working professional posting on X. Write a first-person opinion about the given post in 2-3 sentences, 60-140 characters. Add a judgment or one concrete detail; do not restate the post. No hashtags, emoji, @mentions or links. No phrases like "delve into", "ever-evolving landscape", "game-changer", "only time will tell". Output the body only.'

/** Builds the system/user pair sent to the local text completion seam. */
export function buildOpinionPrompt(input: OpinionInput): OpinionPrompt {
  const author = input.author.trim() === '' ? '' : `@${input.author.trim()}`
  const body = String(input.text || '').trim()
  if (input.locale === 'en') {
    return {
      systemPrompt: SYSTEM_EN,
      userMessage: `Original post${author === '' ? '' : ` by ${author}`}:\n${body}\n\nWrite your personal opinion.`,
    }
  }
  return {
    systemPrompt: SYSTEM_ZH,
    userMessage: `原推${author === '' ? '' : `作者 ${author}`}：\n${body}\n\n请写你的个人观点。`,
  }
}

/**
 * Trims a model answer to the X budget at a sentence boundary.
 *
 * CJK text counts roughly two units per character on X, so the Chinese budget
 * is half the English one; cutting mid-sentence is the fallback, not the rule.
 */
export function limitOpinionLength(text: string, locale: PosterLocale): string {
  const max = OPINION_MAX_CHARS[locale]
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const boundary = Math.max(
    slice.lastIndexOf('。'),
    slice.lastIndexOf('！'),
    slice.lastIndexOf('？'),
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  )
  if (boundary >= Math.floor(max * 0.55)) return slice.slice(0, boundary + 1).trim()
  return `${slice.slice(0, max - 1).trimEnd()}…`
}

interface GenerateResponse {
  ok?: unknown
  text?: unknown
  message?: unknown
}

export interface OpinionResult {
  text: string
  /** Human-readable reason when the text is empty; `''` on success. */
  error: string
}

function requestCompletion(prompt: OpinionPrompt): Promise<OpinionResult> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: 'DSH_TWITTER_COPILOT_GENERATE',
          systemPrompt: prompt.systemPrompt,
          userMessage: prompt.userMessage,
        },
        (response: GenerateResponse | undefined) => {
          if (chrome.runtime.lastError) {
            resolve({ text: '', error: chrome.runtime.lastError.message || '插件后台不可用' })
            return
          }
          if (response?.ok === false) {
            const message = typeof response.message === 'string' && response.message.trim() !== ''
              ? response.message.trim()
              : '文本补全服务返回失败'
            resolve({ text: '', error: message })
            return
          }
          const text = typeof response?.text === 'string' ? response.text : ''
          resolve({ text, error: text === '' ? '模型没有返回正文' : '' })
        },
      )
    } catch (error) {
      resolve({ text: '', error: error instanceof Error ? error.message : String(error) })
    }
  })
}

/**
 * Generates the opinion together with a reason when it fails.
 *
 * @param timeoutMs - Generation deadline; the caller proceeds with the poster
 *   alone rather than holding the navigation hostage.
 */
export async function generateOpinionResult(
  input: OpinionInput,
  timeoutMs = 20_000,
): Promise<OpinionResult> {
  if (String(input.text || '').trim() === '') return { text: '', error: '原帖没有正文' }

  let timer: ReturnType<typeof setTimeout> | null = null
  const result = await Promise.race([
    requestCompletion(buildOpinionPrompt(input)),
    new Promise<OpinionResult>((resolve) => {
      timer = setTimeout(() => resolve({ text: '', error: `生成超时（${Math.round(timeoutMs / 1000)}s）` }), timeoutMs)
    }),
  ])
  if (timer !== null) clearTimeout(timer)

  const cleaned = sanitizeTweetText(result.text, input.locale).trim()
  if (cleaned === '') return { text: '', error: result.error || '模型没有返回正文' }
  return { text: limitOpinionLength(cleaned, input.locale), error: '' }
}

/** Backwards-compatible wrapper: text only. */
export async function generateOpinion(input: OpinionInput, timeoutMs = 20_000): Promise<string> {
  return (await generateOpinionResult(input, timeoutMs)).text
}
