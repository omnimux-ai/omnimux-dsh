// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  collectFeedCandidates,
  normalizeKeywords,
  scoreCandidate,
  selectSeeds,
  SEED_THRESHOLD,
} from '../src/content/twitter-copilot/candidates.ts'
import { COPILOT_MENU_ITEMS, HUMANIZE_EN_RULES, HUMANIZE_ZH_RULES } from '../src/content/twitter-copilot/prompts.ts'
import { findHumanizeViolations } from '../src/content/twitter-copilot/sanitizer.ts'
import { extractTwitterContext } from '../src/content/twitter-copilot/extractor.ts'
import { buildCopilotLogEntry, checkContextReady } from '../src/content/twitter-copilot/menu.ts'

const NOW = Date.parse('2026-10-05T12:00:00Z')

function tweet(opts: { author?: string; text: string; replies?: number; reposts?: number; likes?: number; hoursAgo?: number; promoted?: boolean }): HTMLElement {
  const a = document.createElement('article')
  a.setAttribute('data-testid', 'tweet')
  const created = new Date(NOW - (opts.hoursAgo ?? 1) * 3_600_000).toISOString()
  a.innerHTML = `
    <div data-testid="User-Name"><a role="link" href="/${opts.author ?? 'someone'}">${opts.author ?? 'someone'}</a></div>
    <time datetime="${created}"></time>
    <div data-testid="tweetText">${opts.text}</div>
    ${opts.promoted ? '<span>Promoted</span>' : ''}
    <div role="group">
      <button data-testid="reply" aria-label="${opts.replies ?? 0} 回复"></button>
      <button data-testid="retweet" aria-label="${opts.reposts ?? 0} 次转帖"></button>
      <button data-testid="like" aria-label="${opts.likes ?? 0} 喜欢"></button>
    </div>`
  document.body.appendChild(a)
  return a
}

const LONG = '我们把推理服务从 A 换到 B 之后，延迟下降了 40%，但是账单反而涨了一倍，原因是缓存命中率掉了。'

describe('#3100 候选池采集与评分', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('过滤推广、短文本与发帖框所在推文，最多采集 max 条', () => {
    tweet({ text: LONG, author: 'keep1' })
    tweet({ text: LONG, author: 'ad', promoted: true })
    tweet({ text: '太短了', author: 'short' })
    const own = tweet({ text: LONG, author: 'own' })
    tweet({ text: LONG, author: 'keep2' })
    const pool = collectFeedCandidates(document, own, NOW)
    expect(pool.map((c) => c.author)).toEqual(['keep1', 'keep2'])
    expect(collectFeedCandidates(document, null, NOW, 1)).toHaveLength(1)
  })

  it('读取回复/转帖/喜欢计数（支持 K 单位）', () => {
    tweet({ text: LONG, replies: 1200, reposts: 30, likes: 5 })
    document.querySelector('[data-testid="reply"]')!.setAttribute('aria-label', '1.2K 回复')
    const [c] = collectFeedCandidates(document, null, NOW)
    expect(c.replies).toBe(1200)
    expect(c.reposts).toBe(30)
    expect(c.likes).toBe(5)
  })

  it('四维得分边界：无关键词中性 50；未命中 0；少量回复不判为争议', () => {
    const base = { author: 'x', text: LONG, replies: 3, reposts: 0, likes: 2, ageHours: 1 }
    expect(scoreCandidate(base, []).scores.keyword).toBe(50)
    expect(scoreCandidate(base, ['区块链']).scores.keyword).toBe(0)
    expect(scoreCandidate(base, ['延迟']).scores.keyword).toBe(70)
    expect(scoreCandidate(base, []).scores.controversy).toBeLessThan(75)
    const heated = scoreCandidate({ ...base, replies: 300, reposts: 20 }, [])
    expect(heated.scores.controversy).toBe(100)
    const silent = scoreCandidate({ ...base, replies: 0, reposts: 0, likes: 0 }, [])
    expect(silent.scores.controversy).toBe(0)
    expect(silent.scores.velocity).toBe(0)
  })

  it('阈值截断：只保留 ≥75 分且按总分降序，最多 3 条；全部不达标返回空', () => {
    const hot = { author: 'h', text: LONG, replies: 400, reposts: 30, likes: 3000, ageHours: 1 }
    const scored = [
      scoreCandidate({ ...hot, author: 'a' }, ['延迟']),
      scoreCandidate({ ...hot, author: 'b', replies: 900 }, ['延迟', '账单']),
      scoreCandidate({ ...hot, author: 'c' }, ['延迟']),
      scoreCandidate({ ...hot, author: 'd' }, ['延迟']),
      scoreCandidate({ author: 'low', text: LONG, replies: 1, reposts: 5, likes: 1, ageHours: 20 }, ['延迟']),
    ]
    const seeds = selectSeeds(scored)
    expect(seeds.length).toBe(3)
    expect(seeds.every((s) => s.total >= SEED_THRESHOLD)).toBe(true)
    expect(seeds[0].author).toBe('b')
    expect(seeds.map((s) => s.author)).not.toContain('low')
    expect(selectSeeds([scored[4]])).toEqual([])
  })

  it('关键词归一化：多分隔符、去重、长度限制', () => {
    expect(normalizeKeywords('AI, 出海；增长 ai', 'x')).toEqual(['ai', '出海', '增长'])
  })

  it('空发帖框：无达标热帖时走纯原创而不是拦截，日志如实记录', () => {
    const composer = document.createElement('div')
    composer.innerHTML = '<div data-testid="tweetTextarea_0" role="textbox" contenteditable="true"></div><button id="anchor"></button>'
    const form = document.createElement('form')
    form.appendChild(composer)
    document.body.appendChild(form)
    tweet({ text: LONG, replies: 1, reposts: 0, likes: 0, hoursAgo: 10 })
    const anchor = document.getElementById('anchor') as HTMLElement
    const ctx = extractTwitterContext(anchor, 'POST_NEW', { keywords: '延迟', nowMs: NOW })
    expect(ctx.candidatesScanned).toBe(1)
    expect(ctx.seeds).toEqual([])
    expect(ctx.feedHotTweets).toBeUndefined()
    expect(checkContextReady('POST_NEW', ctx, 'zh')).toBeNull()

    const item = COPILOT_MENU_ITEMS.find((i) => i.id === 'ai-hot-tweets')!
    const { userMessage } = item.generatePrompt(ctx, 'zh')
    expect(userMessage).toContain('请围绕以下赛道，挑一个具体场景原创一条推文：延迟')
    expect(userMessage).not.toMatch(/评分|门槛|信息流/)

    const entry = buildCopilotLogEntry({ traceId: 'tw_1_abc', ctx, itemId: item.id, locale: 'zh', outcome: { status: 'injected' } })
    expect(entry).toMatchObject({ inputMode: 'PURE_ORIGINAL', candidatesScanned: 1, qualifiedCount: 0, keywords: ['延迟'] })
  })
})

describe('#3100 去 AI 味规则', () => {
  it('所有菜单项的系统提示词都带统一规则段（中英）', () => {
    for (const item of COPILOT_MENU_ITEMS) {
      const ctx = { scene: item.scenes[0], draftText: '草稿', targetTweetText: '原推', quotedTweetText: '被引' }
      expect(item.generatePrompt(ctx, 'zh').systemPrompt + item.generatePrompt(ctx, 'en').systemPrompt)
        .toMatch(/写作与编辑红线|WRITING & EDITING RULES/)
    }
    expect(HUMANIZE_ZH_RULES).toContain('45~85')
    expect(HUMANIZE_EN_RULES).toContain('220')
  })

  it('违规扫描命中禁用表达，干净文案为空', () => {
    expect(findHumanizeViolations('这不仅是工具，更是一种赋能。让我们拭目以待')).toEqual(
      expect.arrayContaining(['赋能', '让我们拭目以待']),
    )
    expect(findHumanizeViolations('换了模型以后延迟降了，账单涨了。你们怎么权衡？')).toEqual([])
    expect(findHumanizeViolations("Let's dive in: this is a game-changer")).toHaveLength(2)
  })
})
