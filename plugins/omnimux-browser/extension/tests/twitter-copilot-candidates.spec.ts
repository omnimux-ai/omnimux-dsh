// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  collectFeedCandidates,
  mergeCandidatePools,
  normalizeKeywords,
  scoreCandidate,
  selectSeeds,
  SEED_THRESHOLD,
  SHORTLIST_SIZE,
  shortlistForPick,
} from '../src/content/twitter-copilot/candidates.ts'
import { COPILOT_MENU_ITEMS, HUMANIZE_EN_RULES, HUMANIZE_ZH_RULES } from '../src/content/twitter-copilot/prompts.ts'
import { findHumanizeViolations } from '../src/content/twitter-copilot/sanitizer.ts'
import { applyPickedSeed, extractTwitterContext } from '../src/content/twitter-copilot/extractor.ts'
import { buildCopilotLogEntry, checkContextReady, decideSeedPick } from '../src/content/twitter-copilot/menu.ts'
import type { TwitterContext } from '../src/content/twitter-copilot/types.ts'
const PINNED = () => expect([SEED_THRESHOLD, SHORTLIST_SIZE]).toEqual([65, 8])

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

  it('AC-15 视频帖不算广告：播放器外层的 placementTracking 不排除；真广告位仍排除', () => {
    const video = tweet({ text: LONG, author: 'video' })
    video.insertAdjacentHTML('beforeend', '<div data-testid="placementTracking"><div data-testid="videoPlayer"><video></video></div></div>')
    const adSlot = tweet({ text: LONG, author: 'adslot' })
    adSlot.insertAdjacentHTML('beforeend', '<div data-testid="placementTracking"><a href="/promo">去看看</a></div>')
    tweet({ text: LONG, author: 'labeled', promoted: true })
    const authors = collectFeedCandidates(document, null, NOW).map((c) => c.author)
    expect(authors).toEqual(['video'])
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

/** Quote tweet as X renders it: own tweetText, then a role="link" card holding the quoted post. */
function quoteTweet(opts: { author: string; comment: string; quotedHandle: string; quoted: string; replies?: number; reposts?: number; likes?: number }): HTMLElement {
  const a = tweet({ author: opts.author, text: opts.comment, replies: opts.replies, reposts: opts.reposts, likes: opts.likes })
  const card = document.createElement('div')
  card.setAttribute('role', 'link')
  card.innerHTML = `<div data-testid="User-Name">Quoted @${opts.quotedHandle}·10月4日</div><div data-testid="tweetText">${opts.quoted}</div>`
  a.appendChild(card)
  return a
}

describe('#3100 双来源 + 带评论转发优先（AC-11）', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('入选门槛为 65', () => {
    expect(SEED_THRESHOLD).toBe(65)
    PINNED()
  })

  it('带评论转发：拆出评论与原帖，短评论 + 长原帖也能入池', () => {
    quoteTweet({ author: 'bob', comment: '这才是重点', quotedHandle: 'carol', quoted: LONG })
    const [c] = collectFeedCandidates(document, null, NOW, undefined, 'following')
    expect(c).toMatchObject({ author: 'bob', text: '这才是重点', isQuote: true, quotedAuthor: 'carol', quotedText: LONG, source: 'following' })
    // 评论太短（< 4 字）不入池
    document.body.innerHTML = ''
    quoteTweet({ author: 'bob', comment: '哈', quotedHandle: 'carol', quoted: LONG })
    expect(collectFeedCandidates(document, null, NOW)).toEqual([])
  })

  it('评论与原帖合并计算关键词', () => {
    const quote = { author: 'b', text: '这才是重点', replies: 3, reposts: 0, likes: 2, ageHours: 1, isQuote: true, quotedText: LONG }
    expect(scoreCandidate(quote, ['延迟']).scores.keyword).toBe(70)
  })

  it('同样达标时带评论转发排在前面', () => {
    const hot = { author: 'h', text: LONG, replies: 400, reposts: 300, likes: 9000, ageHours: 1 }
    const plain = scoreCandidate({ ...hot, author: 'plain', replies: 900 }, ['延迟'])
    const quote = scoreCandidate({ ...hot, author: 'quote', text: '这才是重点', isQuote: true, quotedText: LONG }, ['延迟'])
    expect(plain.total).toBeGreaterThanOrEqual(SEED_THRESHOLD)
    expect(quote.total).toBeGreaterThanOrEqual(SEED_THRESHOLD)
    expect(selectSeeds([plain, quote]).map((s) => s.author)).toEqual(['quote', 'plain'])
  })

  it('互动规模计入评分：1 万互动的帖子能过 65 分门槛', () => {
    const viral = scoreCandidate({ author: 'v', text: LONG, replies: 943, reposts: 1118, likes: 12816, ageHours: 21 }, [])
    expect(viral.scores.reach).toBe(100)
    expect(viral.total).toBeGreaterThanOrEqual(SEED_THRESHOLD)
    const quiet = scoreCandidate({ author: 'q', text: LONG, replies: 1, reposts: 0, likes: 2, ageHours: 1 }, [])
    expect(quiet.total).toBeLessThan(SEED_THRESHOLD)
  })

  it('多来源合并按作者 + 正文去重，保留首次出现的来源', () => {
    const a = { author: 'x', text: LONG, replies: 1, reposts: 1, likes: 1, ageHours: 1, source: 'for_you' as const }
    const merged = mergeCandidatePools([[a], [{ ...a, source: 'following' as const }, { ...a, author: 'y', source: 'following' as const }]])
    expect(merged.map((c) => [c.author, c.source])).toEqual([['x', 'for_you'], ['y', 'following']])
  })

  it('日志带来源条数与入选帖的来源、是否带评论转发', () => {
    const seed = scoreCandidate({ author: 'q', text: '这才是重点', replies: 943, reposts: 1118, likes: 12816, ageHours: 1, source: 'for_you', isQuote: true, quotedText: LONG }, [])
    const ctx = { scene: 'POST_NEW' as const, draftText: '', seeds: [seed], candidatesScanned: 12, sourcesScanned: { for_you: 6, following: 7 } }
    const entry = buildCopilotLogEntry({ traceId: 'tw_2_abc', ctx, itemId: 'ai-hot-tweets', locale: 'zh', outcome: { status: 'injected' } })
    expect(entry.sourcesScanned).toEqual({ for_you: 6, following: 7 })
    expect(entry.seeds).toEqual([expect.objectContaining({ author: 'q', source: 'for_you', isQuote: true })])
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

describe('#3100 决策模型挑爆款：候选与回落（AC-13）', () => {
  const base = { text: LONG, ageHours: 2 }

  it('热度不含关键词：同一帖子换不换赛道，热度不变', () => {
    const c = { ...base, author: 'a', replies: 40, reposts: 30, likes: 400 }
    expect(scoreCandidate(c, ['区块链']).heat).toEqual(scoreCandidate(c, ['延迟']).heat)
    expect(scoreCandidate(c, ['区块链']).total).toBeLessThan(scoreCandidate(c, ['延迟']).total)
  })

  it('候选最多 8 条、热度 ≥ 40，按热度降序', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      scoreCandidate({ ...base, author: `u${i}`, replies: 10 * (i + 1), reposts: 10 * (i + 1), likes: 100 * (i + 1) }, []))
    const cold = scoreCandidate({ ...base, author: 'cold', replies: 0, reposts: 0, likes: 1, ageHours: 30 }, [])
    const list = shortlistForPick([...many, cold])
    expect(list).toHaveLength(SHORTLIST_SIZE)
    expect(list.every((c) => c.heat >= 40)).toEqual(true)
    expect(list.map((c) => c.author)).not.toContain('cold')
    expect(list[0].author).toEqual('u11')
  })

  it('选中帖子成为唯一复刻素材', () => {
    const ctx: TwitterContext = { scene: 'POST_NEW', draftText: '' }
    const pick = scoreCandidate({ ...base, author: 'picked', replies: 5, reposts: 5, likes: 50, isQuote: true, quotedText: '原帖内容' }, [])
    applyPickedSeed(ctx, pick)
    expect(ctx.seeds?.map((s) => s.author)).toEqual(['picked'])
    expect(ctx.feedHotTweets).toEqual([expect.objectContaining({ author: 'picked', quotedText: '原帖内容' })])
  })

  it('决策模型选中 / 选「都不贴合」/ 出错时的结果与日志', async () => {
    const shortlist = [
      scoreCandidate({ ...base, author: 'x0', replies: 20, reposts: 20, likes: 200 }, []),
      scoreCandidate({ ...base, author: 'x1', replies: 30, reposts: 30, likes: 300 }, []),
    ]
    const send = vi.fn()
    ;(globalThis as any).chrome = { runtime: { sendMessage: send } }

    send.mockResolvedValueOnce({ ok: true, decision: 't1', confidence: 0.7 })
    const ctx1: TwitterContext = { scene: 'POST_NEW', draftText: '', shortlist }
    const picked = await decideSeedPick(ctx1)
    expect(picked).toEqual(expect.objectContaining({ source: 'jev', candidates: 2, pickedIndex: 1, confidence: 0.7 }))
    expect(ctx1.seeds?.map((s) => s.author)).toEqual(['x1'])
    const entry = buildCopilotLogEntry({ traceId: 'tw_3_abc', ctx: ctx1, itemId: 'ai-hot-tweets', locale: 'zh', seedPick: picked, outcome: { status: 'injected' } })
    expect(entry).toMatchObject({ inputMode: 'AUTO_FEED_HOT', seedPick: { source: 'jev', pickedIndex: 1 } })

    send.mockResolvedValueOnce({ ok: true, decision: 'none' })
    const ctx2: TwitterContext = { scene: 'POST_NEW', draftText: '', shortlist, seeds: [] }
    expect(await decideSeedPick(ctx2)).toEqual(expect.objectContaining({ source: 'rules', fallbackReason: 'none fits the niche' }))
    expect(ctx2.seeds).toEqual([])

    send.mockRejectedValueOnce(new Error('bridge down'))
    const ctx3: TwitterContext = { scene: 'POST_NEW', draftText: '', shortlist }
    expect(await decideSeedPick(ctx3)).toEqual(expect.objectContaining({ source: 'rules', fallbackReason: 'bridge down' }))

    expect(await decideSeedPick({ scene: 'POST_NEW', draftText: '', shortlist: [] })).toEqual(undefined)
  })
})
