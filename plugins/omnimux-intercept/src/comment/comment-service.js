/**
 * @file 逐条生成热评草稿 / 引用转发 —— 三级降级阶梯 + 后置校验。
 *
 * 降级阶梯：宿主 `complete()` → HTTP 直连 → 离线模板。
 * **永不因模型不可用而让整条链路失败**；每次降级都必须写 `warnings`（不允许静默降级）。
 */

import { isInterceptError } from '../core/errors.js'
import { DEFAULT_MAX_CHARS, buildCommentPrompt } from './prompt-builder.js'
import { builtinTemplate } from './prompt-templates.js'

/** 中文默认字数上限。 */
export const MAX_CHARS_ZH = 220

/** 英文默认字数上限。 */
export const MAX_CHARS_EN = 380

/** 离线模板的策略标签。 */
export const OFFLINE_STRATEGY = '离线模板骨架（信息增量优先）'

/**
 * 联系方式特征：邮箱、Telegram、手机号、微信号。
 * 命中即判不合格并降级到模板（PRD 合规要求）。
 * @type {RegExp}
 */
export const CONTACT_PATTERN =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|t\.me\/|telegram\.me\/|(?:\+?86[-\s]?)?1[3-9]\d{9}|\+?\d[\d\s-]{9,}\d|加我微信|微信号|weixin|wxid|扣扣|QQ\s*[:：]\s*\d+/i

/**
 * 清洗文本：剥离 Markdown 代码围栏与控制字符，压缩空行。
 *
 * 输出**只含纯文本**，保证可以整段贴进 X 的发帖框。
 * @param {unknown} text 原始文本
 * @returns {string}
 */
export function sanitizeDraftText(text) {
  if (typeof text !== 'string') return ''
  return text
    // 围栏代码块（含语言标注）整体去围栏，保留内部文字。
    .replace(/```[^\n]*\n?/g, '')
    // 行内代码反引号。
    .replace(/`+/g, '')
    // 控制字符（保留换行与制表符）。
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // 行首列表符号造成的 Markdown 感。
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // 3 个以上连续换行压成 2 个。
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 后置校验：空文本 / 超字数 / 含联系方式一律判不合格。
 * @param {unknown} text 模型或模板产出的文本
 * @param {{ maxChars?: number }} [options] 校验选项
 * @returns {{ ok: boolean, text: string, reasons: string[] }}
 */
export function validateDraftText(text, options = {}) {
  const sanitized = sanitizeDraftText(text)
  const maxChars =
    typeof options.maxChars === 'number' && Number.isFinite(options.maxChars) && options.maxChars > 0
      ? Math.trunc(options.maxChars)
      : DEFAULT_MAX_CHARS

  /** @type {string[]} */
  const reasons = []
  if (sanitized === '') reasons.push('文本为空')
  if ([...sanitized].length > maxChars) reasons.push(`超过字数上限 ${maxChars}`)
  if (CONTACT_PATTERN.test(sanitized)) reasons.push('含联系方式')

  return { ok: reasons.length === 0, text: sanitized, reasons }
}

/**
 * 解析生效的字数上限。
 * @param {unknown} value 显式指定值
 * @param {'zh' | 'en'} language 语言
 * @returns {number}
 */
export function resolveMaxChars(value, language) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value)
  return language === 'en' ? MAX_CHARS_EN : MAX_CHARS_ZH
}

/**
 * 抽取用于离线草稿的「话题片段」：取原推首个句子，最长 24 字。
 * @param {unknown} text 原推正文
 * @returns {string}
 */
export function topicSnippet(text) {
  const raw = typeof text === 'string' ? text.trim() : ''
  if (raw === '') return '这条推文'
  const firstLine = raw.split(/\n/)[0] ?? raw
  const firstSentence = firstLine.split(/[。！？!?.;；]/)[0] ?? firstLine
  const cleaned = firstSentence.replace(/\s+/g, ' ').trim()
  if (cleaned === '') return '这条推文'
  const chars = [...cleaned]
  return chars.length > 24 ? `${chars.slice(0, 24).join('')}…` : cleaned
}

/**
 * 生成离线兜底草稿（第三通道）。
 *
 * **确定性**：同输入必然同输出，不含时间戳与随机成分，可直接做快照断言。
 * @param {import('../core/sort.js').ScoredTweet} tweet 打分结果
 * @param {'reply' | 'quote'} kind 草稿类型
 * @param {'zh' | 'en'} [language] 语言
 * @param {number} [maxChars] 字数上限
 * @returns {string}
 */
export function buildOfflineDraft(tweet, kind, language = 'zh', maxChars = MAX_CHARS_ZH) {
  const topic = topicSnippet(tweet?.record?.text)
  const limit = resolveMaxChars(maxChars, language)

  const text =
    kind === 'quote'
      ? `「${topic}」这个结论值得记一下。\n\n我看到的补充是 __（填一个具体数据或案例），它说明这条只在 __ 的前提下成立。先把口径存下来，等下一轮数据出来再回看。`
      : `关于「${topic}」，我补一个原推没提的点：__（填一个具体数据或案例）。\n\n它给原结论加了一个限定条件 __，所以先别急着下结论。`

  const chars = [...text]
  if (chars.length <= limit) return text
  return `${chars.slice(0, Math.max(1, limit - 1)).join('')}…`
}

/**
 * 选出某个草稿类型对应的模板。
 * @param {'reply' | 'quote'} kind 草稿类型
 * @param {{ template?: unknown, templates?: Record<string, unknown> }} deps 依赖
 * @returns {{ system: string, kind?: string, source?: string }} 模板
 */
function resolveTemplate(kind, deps) {
  const fromMap = deps?.templates?.[kind]
  const candidate = fromMap ?? deps?.template
  if (candidate !== null && typeof candidate === 'object' && typeof (/** @type {any} */ (candidate).system) === 'string') {
    return /** @type {{ system: string }} */ (candidate)
  }
  return builtinTemplate(kind)
}

/**
 * 生成单条草稿（reply 或 quote），失败一律降级到离线模板。
 * @param {'reply' | 'quote'} kind 草稿类型
 * @param {import('../core/sort.js').ScoredTweet} tweet 打分结果
 * @param {{
 *   complete: ((input: { system: string, prompt: string, maxTokens?: number, signal?: AbortSignal }) => Promise<string>) | null,
 *   channel: 'host' | 'http',
 *   template: { system: string },
 *   maxChars: number,
 *   language: 'zh' | 'en',
 *   maxTokens?: number,
 *   signal?: AbortSignal,
 * }} ctx 上下文
 * @returns {Promise<{ text: string, fromModel: boolean, strategy: string, warnings: string[] }>}
 */
async function produceDraft(kind, tweet, ctx) {
  /** @type {string[]} */
  const warnings = []

  if (ctx.complete) {
    try {
      const { system, prompt } = buildCommentPrompt(
        { tweet, style: kind, language: ctx.language, maxChars: ctx.maxChars },
        ctx.template,
      )
      const raw = await ctx.complete({
        system,
        prompt,
        ...(typeof ctx.maxTokens === 'number' ? { maxTokens: ctx.maxTokens } : {}),
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      })
      const validation = validateDraftText(raw, { maxChars: ctx.maxChars })
      if (validation.ok) {
        return {
          text: validation.text,
          fromModel: true,
          strategy: `模型生成（${ctx.channel} 通道）`,
          warnings,
        }
      }
      warnings.push(
        `模型输出未通过后置校验（${validation.reasons.join('、')}），已降级到离线模板`,
      )
    } catch (error) {
      const code = isInterceptError(error) ? error.code : 'LLM_UNAVAILABLE'
      warnings.push(`模型调用失败（${code}），已降级到离线模板`)
    }
  } else {
    warnings.push('模型通道不可用（LLM_UNAVAILABLE），已使用离线模板')
  }

  return {
    text: buildOfflineDraft(tweet, kind, ctx.language, ctx.maxChars),
    fromModel: false,
    strategy: OFFLINE_STRATEGY,
    warnings,
  }
}

/**
 * 批量生成文案草稿。
 *
 * 返回的 `usedChannel` 语义：**只有全部草稿都由模型产出时**才是 `host` / `http`；
 * 任一部分降级到模板即标 `template`（宁可保守，不可静默降级）。
 * @param {Array<{
 *   tweet: import('../core/sort.js').ScoredTweet,
 *   style?: 'reply' | 'quote' | 'both',
 *   language?: 'zh' | 'en',
 *   maxChars?: number,
 * }>} reqs 生成请求列表
 * @param {{
 *   complete?: ((input: { system: string, prompt: string, maxTokens?: number, signal?: AbortSignal }) => Promise<string>) | null,
 *   channel?: 'host' | 'http',
 *   template?: unknown,
 *   templates?: Record<string, unknown>,
 *   maxChars?: number,
 *   language?: 'zh' | 'en',
 *   maxTokens?: number,
 *   signal?: AbortSignal,
 * }} deps 注入依赖
 * @returns {Promise<Array<{
 *   tweetId: string,
 *   reply: { text: string, strategy: string } | null,
 *   quote: { text: string } | null,
 *   usedChannel: 'host' | 'http' | 'template',
 *   warnings: string[],
 * }>>}
 */
export async function generateComments(reqs, deps = {}) {
  const complete = typeof deps.complete === 'function' ? deps.complete : null
  const channel = deps.channel === 'http' ? 'http' : 'host'
  const list = Array.isArray(reqs) ? reqs : []
  /** @type {Array<{ tweetId: string, reply: { text: string, strategy: string } | null, quote: { text: string } | null, usedChannel: 'host' | 'http' | 'template', warnings: string[] }>} */
  const results = []

  for (const req of list) {
    const tweet = req?.tweet
    const style = req?.style === 'quote' ? 'quote' : req?.style === 'both' ? 'both' : 'reply'
    const language = req?.language === 'en' ? 'en' : deps.language === 'en' ? 'en' : 'zh'
    const maxChars = resolveMaxChars(req?.maxChars ?? deps.maxChars, language)

    /** @type {string[]} */
    const warnings = []
    /** @type {{ text: string, strategy: string } | null} */
    let reply = null
    /** @type {{ text: string } | null} */
    let quote = null
    let allFromModel = true

    if (style === 'reply' || style === 'both') {
      const outcome = await produceDraft('reply', tweet, {
        complete,
        channel,
        template: resolveTemplate('reply', deps),
        maxChars,
        language,
        ...(typeof deps.maxTokens === 'number' ? { maxTokens: deps.maxTokens } : {}),
        ...(deps.signal ? { signal: deps.signal } : {}),
      })
      reply = { text: outcome.text, strategy: outcome.strategy }
      warnings.push(...outcome.warnings)
      allFromModel = allFromModel && outcome.fromModel
    }

    if (style === 'quote' || style === 'both') {
      const outcome = await produceDraft('quote', tweet, {
        complete,
        channel,
        template: resolveTemplate('quote', deps),
        maxChars,
        language,
        ...(typeof deps.maxTokens === 'number' ? { maxTokens: deps.maxTokens } : {}),
        ...(deps.signal ? { signal: deps.signal } : {}),
      })
      quote = { text: outcome.text }
      warnings.push(...outcome.warnings)
      allFromModel = allFromModel && outcome.fromModel
    }

    results.push({
      tweetId: String(tweet?.record?.id ?? ''),
      reply,
      quote,
      usedChannel: allFromModel && complete ? channel : 'template',
      warnings,
    })
  }

  return results
}
