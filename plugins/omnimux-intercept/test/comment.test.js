/**
 * @file 文案层测试：提示词模板 / 纯函数确定性 / 三级降级 / 后置校验。
 *
 * 全程**不发真实网络**：`fetcher` 与 `complete` 一律注入假实现。
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { scoreTweets } from '../src/core/algorithm.js'
import { buildRecord } from '../src/collect/tweet.js'
import {
  CONTACT_PATTERN,
  MAX_CHARS_ZH,
  buildOfflineDraft,
  generateComments,
  sanitizeDraftText,
  topicSnippet,
  validateDraftText,
} from '../src/comment/comment-service.js'
import {
  createHostComplete,
  createHttpComplete,
  extractCompletionText,
  parseCredentialsText,
  resolveApiKey,
  resolveCompleteChannel,
} from '../src/comment/complete-gateway.js'
import {
  BUILTIN_TEMPLATES,
  INFORMATION_VALUE_RULE,
  SOPILOT_SKILL_ROOT,
  builtinTemplate,
  extractSystemPrompt,
  loadPromptTemplate,
  resolveSopilotPromptPath,
} from '../src/comment/prompt-templates.js'
import { buildCommentPrompt } from '../src/comment/prompt-builder.js'

const NOW_MS = Date.parse('2026-09-13T07:00:00.000Z')

/**
 * 构造一条打分结果。
 * @param {Record<string, unknown>} [overrides] 字段覆盖
 * @returns {import('../src/core/sort.js').ScoredTweet}
 */
function scoredTweet(overrides = {}) {
  const record = buildRecord(
    {
      id: '1001',
      author: 'AI 观察局',
      handle: 'ai_watch',
      text: '刚测完新一代推理模型：同等 token 预算下数学题正确率从 62% 提到 81%，但代价是延迟翻倍。',
      likes: '812',
      retweets: '124',
      replies: '3',
      views: '120000',
      created_at: '2026-09-13T05:00:00.000Z',
      url: 'https://x.com/ai_watch/status/1001',
      ...overrides,
    },
    NOW_MS,
    'fixture',
  )
  return scoreTweets([record], NOW_MS)[0]
}

// ── 提示词模板 ──────────────────────────────────────────────────────────────

test('resolveSopilotPromptPath 指向 presets 下的既有资产（单一真源）', () => {
  assert.ok(
    resolveSopilotPromptPath('reply-high').includes(
      `${SOPILOT_SKILL_ROOT}/references/prompts/ai-tweet-reply-high.sys-prompt.md`,
    ),
  )
  assert.ok(resolveSopilotPromptPath('quote').endsWith('ai-retweet.sys-prompt.md'))
  assert.ok(
    resolveSopilotPromptPath('reply-high', { OMNIMUX_REPO_ROOT: '/repo' }).startsWith('/repo'),
  )
})

test('loadPromptTemplate 优先读取 SoPilot 资产', async () => {
  const template = await loadPromptTemplate('reply-high', {
    readFile: async () => `---
id: sopilot-ai-tweet-reply-high
---

# Twitter生成高赞评论

## 系统提示词

你是一位在Twitter上深度运营的真实用户。

## 评论核心公式

评论价值 = 信息增量 × 情绪共鸣
`,
  })

  assert.equal(template.kind, 'reply-high')
  assert.equal(template.source, 'sopilot')
  assert.deepEqual(template.warnings, [])
  assert.ok(template.system.includes('深度运营'))
  assert.ok(!template.system.includes('评论核心公式'), '只取「系统提示词」小节')
  assert.ok(!template.system.includes('frontmatter'), 'frontmatter 必须被剥离')
})

test('loadPromptTemplate 读不到时回退内置模板且不抛错', async () => {
  const template = await loadPromptTemplate('reply-high', {
    readFile: async () => {
      throw new Error('ENOENT')
    },
  })

  assert.equal(template.source, 'builtin')
  assert.deepEqual(template.warnings, ['TEMPLATE_FALLBACK'])
  assert.equal(template.system, BUILTIN_TEMPLATES['reply-high'])
  assert.ok(template.system.includes(INFORMATION_VALUE_RULE))
})

test('loadPromptTemplate 内容为空时同样回退（不返回空 system）', async () => {
  const template = await loadPromptTemplate('quote', { readFile: async () => '' })
  assert.equal(template.source, 'builtin')
  assert.ok(template.system.length > 0)
})

test('loadPromptTemplate 在真实仓库里能读到 SoPilot 资产', async () => {
  const template = await loadPromptTemplate('quote')
  assert.equal(template.kind, 'quote')
  assert.ok(template.system.length > 20, '真实资产应当非空')
})

test('extractSystemPrompt 容错', () => {
  assert.equal(extractSystemPrompt('## 系统提示词\n\nhello'), 'hello')
  assert.equal(extractSystemPrompt('no heading here'), 'no heading here')
  assert.equal(extractSystemPrompt(''), '')
  assert.equal(extractSystemPrompt(null), '')
})

test('builtinTemplate 不读盘且两种类型都有兜底', () => {
  assert.equal(builtinTemplate('reply-high').source, 'builtin')
  assert.equal(builtinTemplate('quote').kind, 'quote')
  assert.ok(BUILTIN_TEMPLATES['reply-high'].length > 0)
  assert.ok(BUILTIN_TEMPLATES.quote.length > 0)
})

// ── 提示词构建：纯函数 + 必备信息 ────────────────────────────────────────────

test('buildCommentPrompt 同输入两次调用字符串完全相等', () => {
  const tweet = scoredTweet()
  const template = builtinTemplate('reply-high')
  const first = buildCommentPrompt({ tweet, style: 'reply', language: 'zh' }, template)
  const second = buildCommentPrompt({ tweet, style: 'reply', language: 'zh' }, template)
  assert.equal(first.prompt, second.prompt)
  assert.equal(first.system, second.system)
  assert.equal(first.prompt, second.prompt, '不得混入时间戳或随机 id')
})

test('buildCommentPrompt 携带全部必备信息与硬性指令', () => {
  const tweet = scoredTweet()
  const { prompt } = buildCommentPrompt({ tweet, style: 'reply' }, builtinTemplate('reply-high'))

  assert.ok(prompt.includes(tweet.record.text), '原推全文')
  assert.ok(prompt.includes('AI 观察局'), '作者名')
  assert.ok(prompt.includes('@ai_watch'), '作者 handle')
  assert.ok(prompt.includes('存活时长 R = 2.0000'), '存活时长 R')
  assert.ok(prompt.includes('时速 j = 60,000'), '时速 j')
  assert.ok(prompt.includes('分级 = 爆款（viral）'), '分级')
  assert.ok(prompt.includes('预估抢评曝光 = 14,980'), '预估曝光')
  assert.ok(prompt.includes('点赞 812 / 转推 124 / 回复 3'), '互动量')
  assert.ok(prompt.includes(INFORMATION_VALUE_RULE), '信息增量优先、禁止复述原文')
  assert.ok(prompt.includes('禁止把原推内容换个说法复述一遍'))
  assert.ok(prompt.includes('不出现任何联系方式'))
})

test('buildCommentPrompt 区分 style 与 language', () => {
  const tweet = scoredTweet()
  const reply = buildCommentPrompt({ tweet, style: 'reply' }, builtinTemplate('reply-high')).prompt
  const quote = buildCommentPrompt({ tweet, style: 'quote' }, builtinTemplate('quote')).prompt
  const en = buildCommentPrompt({ tweet, style: 'reply', language: 'en' }, builtinTemplate('reply-high')).prompt

  assert.ok(reply.includes('写 1 条评论。'))
  assert.ok(quote.includes('写 1 条中文引用转发文案。'))
  assert.ok(en.includes('输出语言：英文'))
})

test('buildCommentPrompt 超长推文被截断且标记', () => {
  const tweet = scoredTweet({ text: 'x'.repeat(3000) })
  const { prompt } = buildCommentPrompt({ tweet, style: 'reply' }, builtinTemplate('reply-high'))
  assert.ok(prompt.includes('原推过长，已截断'))
})

// ── 后置校验 ────────────────────────────────────────────────────────────────

test('validateDraftText 拒绝空文本 / 超字数 / 含联系方式', () => {
  assert.equal(validateDraftText('', { maxChars: 220 }).ok, false)
  assert.deepEqual(validateDraftText('', { maxChars: 220 }).reasons, ['文本为空'])
  assert.equal(validateDraftText('   \n  ', { maxChars: 220 }).ok, false)

  const long = validateDraftText('字'.repeat(221), { maxChars: MAX_CHARS_ZH })
  assert.equal(long.ok, false)
  assert.ok(long.reasons.some((reason) => reason.includes('超过字数上限')))

  for (const bad of [
    '联系我 test@example.com',
    '加我 t.me/someone',
    '电话 13800138000',
    '加我微信 abc123',
  ]) {
    const result = validateDraftText(bad, { maxChars: 220 })
    assert.equal(result.ok, false, `${bad} 应被拒绝`)
    assert.ok(result.reasons.includes('含联系方式'))
  }
})

test('validateDraftText 放行正常文案', () => {
  const result = validateDraftText('这个结论我认同一半：延迟翻倍的代价在批处理场景里其实可以摊平。', {
    maxChars: 220,
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.reasons, [])
})

test('sanitizeDraftText 剥离代码围栏与控制字符', () => {
  const dirty = '```text\n正文\u0007内容\n```'
  const clean = sanitizeDraftText(dirty)
  assert.ok(!clean.includes('```'))
  assert.ok(!clean.includes('\u0007'))
  assert.ok(clean.includes('正文内容'.replace('\u0007', '')) || clean.includes('正文'))
  assert.equal(sanitizeDraftText(null), '')
  assert.equal(sanitizeDraftText('a\n\n\n\nb'), 'a\n\nb')
})

test('CONTACT_PATTERN 不误伤正常数字', () => {
  assert.equal(CONTACT_PATTERN.test('正确率从 62% 提到 81%'), false)
  assert.equal(CONTACT_PATTERN.test('价格 1,234 元'), false)
})

// ── 三级降级阶梯 ────────────────────────────────────────────────────────────

test('第一通道：宿主 complete 可用时 usedChannel = host', async () => {
  const drafts = await generateComments([{ tweet: scoredTweet(), style: 'reply' }], {
    complete: async () => '这个结论我认同一半：延迟翻倍在批处理场景里可以摊平，我实测过同样的曲线。',
    channel: 'host',
    template: builtinTemplate('reply-high'),
  })

  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].usedChannel, 'host')
  assert.ok(drafts[0].reply?.text.includes('延迟翻倍'))
  assert.equal(drafts[0].quote, null)
  assert.deepEqual(drafts[0].warnings, [])
})

test('第二通道：HTTP 直连可用时 usedChannel = http', async () => {
  /** @type {string[]} */
  const urls = []
  const complete = createHttpComplete({
    apiKey: 'test-key',
    baseUrl: 'https://gateway.test',
    fetcher: async (url) => {
      urls.push(String(url))
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'HTTP 通道产出的评论正文。' } }] }),
      }
    },
  })

  const drafts = await generateComments([{ tweet: scoredTweet(), style: 'reply' }], {
    complete,
    channel: 'http',
    template: builtinTemplate('reply-high'),
  })

  assert.deepEqual(urls, ['https://gateway.test/v1/chat/completions'])
  assert.equal(drafts[0].usedChannel, 'http')
  assert.equal(drafts[0].reply?.text, 'HTTP 通道产出的评论正文。')
})

test('第三通道：complete 抛错时降到 template 且 usedChannel = template', async () => {
  const drafts = await generateComments([{ tweet: scoredTweet(), style: 'reply' }], {
    complete: async () => {
      throw new Error('provider down')
    },
    channel: 'host',
    template: builtinTemplate('reply-high'),
  })

  assert.equal(drafts[0].usedChannel, 'template')
  assert.ok(drafts[0].reply?.text.includes('信息增量') || drafts[0].reply?.text.includes('原推'))
  assert.ok(drafts[0].warnings.some((warning) => warning.includes('模型调用失败')))
})

test('第三通道：无模型时直接落模板并留痕', async () => {
  const drafts = await generateComments([{ tweet: scoredTweet(), style: 'both' }], {
    complete: null,
    template: builtinTemplate('reply-high'),
    templates: { reply: builtinTemplate('reply-high'), quote: builtinTemplate('quote') },
  })

  assert.equal(drafts[0].usedChannel, 'template')
  assert.ok(drafts[0].reply)
  assert.ok(drafts[0].quote)
  assert.ok(drafts[0].warnings.some((warning) => warning.includes('LLM_UNAVAILABLE')))
})

test('模型输出不合格（含联系方式）时降级到模板', async () => {
  const drafts = await generateComments([{ tweet: scoredTweet(), style: 'reply' }], {
    complete: async () => '想聊更多可以加我 t.me/example',
    channel: 'host',
    template: builtinTemplate('reply-high'),
  })

  assert.equal(drafts[0].usedChannel, 'template')
  assert.ok(drafts[0].warnings.some((warning) => warning.includes('后置校验')))
})

test('模型输出超字数时降级到模板', async () => {
  const drafts = await generateComments([{ tweet: scoredTweet(), style: 'reply', maxChars: 20 }], {
    complete: async () => '这是一段非常长的正文'.repeat(10),
    channel: 'host',
    template: builtinTemplate('reply-high'),
  })
  assert.equal(drafts[0].usedChannel, 'template')
})

test('模型输出带代码围栏时被清洗后仍然合格', async () => {
  const drafts = await generateComments([{ tweet: scoredTweet(), style: 'reply' }], {
    complete: async () => '```text\n延迟翻倍在批处理里可以摊平，我实测过同样的曲线。\n```',
    channel: 'host',
    template: builtinTemplate('reply-high'),
  })
  assert.equal(drafts[0].usedChannel, 'host')
  assert.ok(!String(drafts[0].reply?.text).includes('```'))
})

test('generateComments 保持入参顺序', async () => {
  const first = scoredTweet({ id: '1001' })
  const second = scoredTweet({ id: '1002', text: '第二条推文正文' })
  const drafts = await generateComments(
    [
      { tweet: first, style: 'reply' },
      { tweet: second, style: 'reply' },
    ],
    { complete: async () => '合格的中文评论正文。', channel: 'host', template: builtinTemplate('reply-high') },
  )
  assert.deepEqual(drafts.map((draft) => draft.tweetId), ['1001', '1002'])
})

// ── 离线兜底草稿 ────────────────────────────────────────────────────────────

test('buildOfflineDraft 确定性且遵守字数上限', () => {
  const tweet = scoredTweet()
  const first = buildOfflineDraft(tweet, 'reply', 'zh', 220)
  const second = buildOfflineDraft(tweet, 'reply', 'zh', 220)
  assert.equal(first, second)

  const short = buildOfflineDraft(tweet, 'reply', 'zh', 20)
  assert.ok([...short].length <= 20, `实际长度 ${[...short].length}`)

  assert.notEqual(buildOfflineDraft(tweet, 'reply', 'zh', 220), buildOfflineDraft(tweet, 'quote', 'zh', 220))
})

test('topicSnippet 抽取话题片段', () => {
  assert.equal(topicSnippet('第一句。第二句。'), '第一句')
  assert.equal(topicSnippet(''), '这条推文')
  assert.equal(topicSnippet(null), '这条推文')
  assert.equal(topicSnippet('x'.repeat(80)).endsWith('…'), true)
})

// ── 通道装配 ────────────────────────────────────────────────────────────────

test('parseCredentialsText 从凭据文件文本提取密钥', () => {
  assert.equal(parseCredentialsText('OMNIMUX_API_KEY: sk-abc\n'), 'sk-abc')
  assert.equal(parseCredentialsText('OMNIMUX_TOKEN: "tok-xyz"\n'), 'tok-xyz')
  assert.equal(parseCredentialsText('api_key: plain-key\n'), 'plain-key')
  assert.equal(parseCredentialsText('# 注释\nother: 1\n'), '')
  assert.equal(parseCredentialsText(''), '')
  assert.equal(parseCredentialsText(null), '')
})

test('resolveApiKey 环境变量优先于凭据文件', () => {
  assert.equal(resolveApiKey({ env: { OMNIMUX_API_KEY: 'env-key' } }), 'env-key')
  assert.equal(resolveApiKey({ env: { OMNIMUX_TOKEN: 'env-token' } }), 'env-token')
  assert.equal(
    resolveApiKey({ env: {}, credentialsText: 'OMNIMUX_API_KEY: file-key' }),
    'file-key',
  )
  assert.equal(resolveApiKey({ env: {} }), '')
})

test('resolveCompleteChannel 无凭据或缺 fetcher 时返回 null（不是错误）', () => {
  assert.equal(resolveCompleteChannel({ env: {}, fetcher: async () => ({}) }), null)
  assert.equal(resolveCompleteChannel({ env: { OMNIMUX_API_KEY: 'k' } }), null)
  assert.equal(typeof resolveCompleteChannel({ env: { OMNIMUX_API_KEY: 'k' }, fetcher: async () => ({}) }), 'function')
})

test('createHttpComplete 非 2xx 抛 LLM_UNAVAILABLE（非致命）', async () => {
  const complete = createHttpComplete({
    apiKey: 'k',
    fetcher: async () => ({ ok: false, status: 401, json: async () => ({}) }),
  })
  await assert.rejects(
    () => complete({ system: 's', prompt: 'p' }),
    (error) => {
      assert.equal(/** @type {any} */ (error).code, 'LLM_UNAVAILABLE')
      return true
    },
  )
})

test('createHttpComplete 网络异常与坏响应体都被兜住', async () => {
  const throwing = createHttpComplete({
    apiKey: 'k',
    fetcher: async () => {
      throw new Error('ECONNREFUSED')
    },
  })
  await assert.rejects(() => throwing({ system: 's', prompt: 'p' }), /网络|发送失败/)

  const badBody = createHttpComplete({
    apiKey: 'k',
    fetcher: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  })
  await assert.rejects(() => badBody({ system: 's', prompt: 'p' }), /空内容/)
})

test('createHostComplete 包装宿主工具并容忍两种返回形态', async () => {
  const asString = createHostComplete({ textComplete: async () => '纯字符串' })
  assert.equal(await asString({ system: 's', prompt: 'p' }), '纯字符串')

  const asObject = createHostComplete({ textComplete: async () => ({ text: '对象形态' }) })
  assert.equal(await asObject({ system: 's', prompt: 'p' }), '对象形态')

  const broken = createHostComplete({ textComplete: async () => 42 })
  await assert.rejects(() => broken({ system: 's', prompt: 'p' }), /结构无法识别/)

  const missing = createHostComplete({})
  await assert.rejects(() => missing({ system: 's', prompt: 'p' }), /宿主补全通道不可用/)
})

test('extractCompletionText 容错', () => {
  assert.equal(extractCompletionText({ choices: [{ message: { content: 'a' } }] }), 'a')
  assert.equal(extractCompletionText({ choices: [{ text: 'b' }] }), 'b')
  assert.equal(extractCompletionText({ choices: [] }), '')
  assert.equal(extractCompletionText(null), '')
})
