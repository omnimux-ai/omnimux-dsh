/**
 * @file 提示词组装 —— **纯函数**：同输入两次调用字符串完全相等（无时间戳、无随机 id）。
 *
 * 提示词必须携带：原推全文、作者、存活时长 `R`、时速 `j`、分级、预估曝光、
 * 互动量（点赞/转推/回复），以及「信息增量优先、禁止复述原文」指令。
 */

import { TIER_LABELS } from '../config.js'
import { INFORMATION_VALUE_RULE } from './prompt-templates.js'

/** 默认字数上限（中文）。 */
export const DEFAULT_MAX_CHARS = 220

/** 提示词内推文正文的截断长度（避免超长推文把上下文撑爆）。 */
export const MAX_PROMPT_TWEET_CHARS = 1200

/**
 * 数字展示：整数化 + 千分位，避免提示词里出现浮点噪声。
 * @param {number | null | undefined} value 数值
 * @returns {string}
 */
export function plainNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString('en-US')
}

/**
 * 保留 4 位有效小数的数字展示（用于 `R` / `j` 这类连续量）。
 * @param {number | null | undefined} value 数值
 * @returns {string}
 */
export function preciseNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  const absolute = Math.abs(value)
  if (absolute >= 1000 || absolute < 0.001) return value.toFixed(2)
  return value.toFixed(4)
}

/**
 * 分级中文标签。
 * @param {string} tier 分级
 * @returns {string} 形如 `爆款（viral）`
 */
export function tierLabel(tier) {
  const label = TIER_LABELS[tier] ?? '未知'
  return `${label}（${tier}）`
}

/**
 * 构建一条推文的评论/引用转发提示词。
 *
 * 纯函数：不读时钟、不读文件、不产生副作用，同输入必然同输出。
 * @param {{
 *   tweet: import('../core/sort.js').ScoredTweet,
 *   style?: 'reply' | 'quote' | 'both',
 *   language?: 'zh' | 'en',
 *   maxChars?: number,
 * }} req 生成请求
 * @param {{ system: string, kind?: string, source?: string }} template 提示词模板
 * @returns {{ system: string, prompt: string }}
 */
export function buildCommentPrompt(req, template) {
  const scored = req?.tweet
  const record = scored?.record
  const stats = scored?.stats
  const style = req?.style === 'quote' ? 'quote' : req?.style === 'both' ? 'both' : 'reply'
  const language = req?.language === 'en' ? 'en' : 'zh'
  const maxChars =
    typeof req?.maxChars === 'number' && Number.isFinite(req.maxChars) && req.maxChars > 0
      ? Math.trunc(req.maxChars)
      : DEFAULT_MAX_CHARS

  const rawText = typeof record?.text === 'string' ? record.text.trim() : ''
  const tweetText =
    rawText.length > MAX_PROMPT_TWEET_CHARS
      ? `${rawText.slice(0, MAX_PROMPT_TWEET_CHARS)}…（原推过长，已截断）`
      : rawText

  const metrics = record?.metrics ?? {}
  const anomalies = Array.isArray(record?.anomalies) ? record.anomalies : []

  const sections = [
    '【原推全文】',
    tweetText === '' ? '（原推正文为空）' : tweetText,
    '',
    '【作者】',
    `${record?.author || '—'}${record?.authorHandle ? ` (@${record.authorHandle})` : ''}`,
    `【推文链接】${record?.url || '—'}`,
    '',
    '【爆速指标（由本地算法计算，可信）】',
    `存活时长 R = ${preciseNumber(stats?.hoursAlive)} 小时`,
    `时速 j = ${plainNumber(stats?.pace)} 次浏览/小时`,
    `分级 = ${tierLabel(String(stats?.tier ?? 'normal'))}`,
    `预估抢评曝光 = ${plainNumber(stats?.exposure?.predicted)}`,
    `曝光拆解：时间衰减 ${preciseNumber(stats?.exposure?.timeDecay)} × 时效加成 ${preciseNumber(stats?.exposure?.freshnessBonus)} × 竞争折扣 ${preciseNumber(stats?.exposure?.competition)}`,
    '',
    '【互动量】',
    `点赞 ${plainNumber(metrics.likes)} / 转推 ${plainNumber(metrics.retweets)} / 回复 ${plainNumber(metrics.replies)}`,
    `数据健康度：${anomalies.length > 0 ? `存在缺陷 ${anomalies.join('、')}` : '正常'}`,
    '',
    '【任务】',
    style === 'quote'
      ? '写 1 条中文引用转发文案。'
      : style === 'both'
        ? '先写 1 条评论，再写 1 条中文引用转发文案，用空行分隔。'
        : '写 1 条评论。',
    language === 'zh'
      ? '输出语言：中文。'
      : '输出语言：英文（如需同时给中文翻译，请另起一行）。',
    `字数上限：${maxChars} 字（含标点，超出即废）。`,
    '',
    '【硬性要求】',
    `1. ${INFORMATION_VALUE_RULE}：必须给出原推没有的新数据、新案例或新视角。`,
    '2. 禁止把原推内容换个说法复述一遍，禁止「说得好」「同意」这类零信息量附和。',
    '3. 不出现任何联系方式、邮箱、Telegram、手机号、二维码等引流信息。',
    '4. 只输出可直接发布的正文，不要解释、不要前后缀、不要标题、不要 Markdown 代码围栏。',
  ]

  return {
    system: typeof template?.system === 'string' ? template.system : '',
    prompt: sections.join('\n'),
  }
}
