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
}

function requestCompletion(prompt: OpinionPrompt): Promise<string> {
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
            resolve('')
            return
          }
          resolve(typeof response?.text === 'string' ? response.text : '')
        },
      )
    } catch {
      resolve('')
    }
  })
}

/**
 * Generates the opinion, returning `''` when the host is unavailable or slow.
 *
 * @param timeoutMs - Generation deadline; the caller proceeds with the poster
 *   alone rather than holding the navigation hostage.
 */
export async function generateOpinion(
  input: OpinionInput,
  timeoutMs = 20_000,
): Promise<string> {
  if (String(input.text || '').trim() === '') return ''

  let timer: ReturnType<typeof setTimeout> | null = null
  const raw = await Promise.race([
    requestCompletion(buildOpinionPrompt(input)),
    new Promise<string>((resolve) => {
      timer = setTimeout(() => resolve(''), timeoutMs)
    }),
  ])
  if (timer !== null) clearTimeout(timer)

  const cleaned = sanitizeTweetText(raw, input.locale).trim()
  return cleaned === '' ? '' : limitOpinionLength(cleaned, input.locale)
}
