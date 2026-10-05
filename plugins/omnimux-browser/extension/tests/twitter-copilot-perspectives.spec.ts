// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  buildJevDecisionArgs,
  buildSeedPickArgs,
  classifyPerspectiveByRules,
  JEV_STATE_MAX,
  PERSPECTIVES,
  SEED_PICK_NONE,
} from '../src/content/twitter-copilot/perspectives.ts'
const NONE_KEY_PINNED = () => expect(SEED_PICK_NONE).toEqual('none')
import { COPILOT_MENU_ITEMS } from '../src/content/twitter-copilot/prompts.ts'
import type { PerspectiveId, ScoredCandidate } from '../src/content/twitter-copilot/types.ts'
import {
  addKeywordTags,
  MAX_KEYWORD_TAGS,
  parseKeywordTags,
  serializeKeywordTags,
} from '../src/content/twitter-copilot/settings.ts'
import { normalizeKeywords } from '../src/content/twitter-copilot/candidates.ts'

describe('#3100 推特赛道关键词标签', () => {
  it('回车/逗号拆分、去重（忽略大小写）、去空白', () => {
    expect(addKeywordTags(['AI'], ' 出海，增长、ai ;; ')).toEqual(['AI', '出海', '增长'])
  })

  it('最多 12 个标签，单个最长 24 字', () => {
    const many = Array.from({ length: 20 }, (_, i) => `词${i}`).join(',')
    expect(addKeywordTags([], many)).toHaveLength(MAX_KEYWORD_TAGS)
    expect(addKeywordTags([], 'x'.repeat(40))[0]).toHaveLength(24)
  })

  it('存储往返一致，且提取器能读出同样的关键词', () => {
    const tags = ['AI', '出海', '独立开发']
    const stored = serializeKeywordTags(tags)
    expect(parseKeywordTags(stored)).toEqual(tags)
    expect(normalizeKeywords(stored)).toEqual(['ai', '出海', '独立开发'])
    expect(parseKeywordTags('AI, 出海 增长')).toEqual(['AI', '出海 增长'])
  })
})

function seed(text: string, controversy = 10): ScoredCandidate {
  return {
    author: 'a', text, replies: 5, reposts: 5, likes: 5, ageHours: 1,
    scores: { keyword: 50, controversy, infoDelta: 50, velocity: 50, reach: 50 }, total: 80, heat: 60,
  }
}

describe('#3100 决策模型挑爆款（AC-13）', () => {
  it('候选作为选项、赛道作为状态，另设「都不贴合」', () => {
    const quote = { ...seed('这才是重点'), isQuote: true, quotedText: '原帖：推理成本下降 40%' }
    const args = buildSeedPickArgs([seed('Claude 新功能实测'), quote], ['ai工具', '出海'])
    expect(Object.keys(args.choices)).toEqual(['t0', 't1', SEED_PICK_NONE])
    expect(args.state).toContain('ai工具, 出海')
    expect(args.choices.t0).toContain('Claude 新功能实测')
    expect(args.choices.t1).toContain('quoting: 原帖：推理成本下降 40%')
    expect(args.choices.t0.length).toBeLessThanOrEqual(500)
    NONE_KEY_PINNED()
  })
})

const LABELED: Array<[string, ScoredCandidate[], string, PerspectiveId]> = [
  ['争议-评论区对立', [seed('远程办公到底提不提效？', 90)], '', 'P1_CONTRARIAN'],
  ['争议-草稿也无关', [seed('996 是不是福报', 80)], '随便写写', 'P1_CONTRARIAN'],
  ['实战-压测数字', [seed('压测到 500 并发时延迟飙到 900ms')], '', 'P2_PRACTITIONER'],
  ['实战-踩坑复盘', [seed('上线第一天就踩坑，复盘一下缓存雪崩')], '', 'P2_PRACTITIONER'],
  ['普及-论文', [seed('这篇论文提出了新的注意力机制')], '', 'P3_SIMPLIFIER'],
  ['普及-新版本', [seed('框架发布 v2.0，改了整个协议')], '', 'P3_SIMPLIFIER'],
  ['套利-定价', [seed('我们把订阅定价从 9 元调到 19 元')], '', 'P4_ARBITRAGEUR'],
  ['套利-降本', [seed('用工具替代外包，人力成本砍掉一半')], '', 'P4_ARBITRAGEUR'],
  ['观察-巨头', [seed('巨头又出手收购了一家创业公司')], '', 'P5_OBSERVER'],
  ['观察-格局', [seed('整个行业格局正在重新洗牌')], '', 'P5_OBSERVER'],
  ['战友-焦虑', [seed('最近真的很焦虑，不知道还能撑多久')], '', 'P6_PEER'],
  ['战友-迷茫', [seed('转行半年了还是很迷茫，怎么办')], '', 'P6_PEER'],
]

describe('#3100 视角规则分类', () => {
  it.each(LABELED)('%s', (_label, seeds, draft, expected) => {
    expect(classifyPerspectiveByRules(seeds, draft)).toBe(expected)
  })

  it('无信号时默认一线实战老兵', () => {
    expect(classifyPerspectiveByRules([], '今天天气不错')).toBe('P2_PRACTITIONER')
  })

  it('六个视角各有中英指令', () => {
    expect(PERSPECTIVES).toHaveLength(6)
    for (const p of PERSPECTIVES) {
      expect(p.guidanceZh.length).toBeGreaterThan(10)
      expect(p.guidanceEn.length).toBeGreaterThan(10)
    }
  })
})

describe('#3100 Jev 决策参数', () => {
  it('state 截断、choices 覆盖六视角', () => {
    const long = 'x'.repeat(5000)
    const args = buildJevDecisionArgs([seed(long)], '草稿')
    expect(args.state.length).toBeLessThanOrEqual(JEV_STATE_MAX + 1)
    expect(Object.keys(args.choices)).toEqual(PERSPECTIVES.map((p) => p.id))
    expect(args.instructions).toMatch(/choice key/)
  })

  it('AC-7 无任何素材时 Jev 素材仍非空（有赛道用赛道，无赛道用通用背景）', () => {
    const bare = buildJevDecisionArgs([], '', '', [])
    expect(bare.state.trim().length).toBeGreaterThan(0)
    expect(bare.state.length).toBeLessThanOrEqual(JEV_STATE_MAX + 1)
    expect(buildJevDecisionArgs([], '', '', ['ai', '出海']).state).toContain('ai, 出海')
  })

  it('AC-7 无达标热帖的提示不向模型透露内部筛选说法', () => {
    const item = COPILOT_MENU_ITEMS.find((i) => i.id === 'ai-hot-tweets')!
    const p = PERSPECTIVES[0]
    const banned = /评分|门槛|信息流|quality bar|feed/i
    for (const keywords of [[], ['ai']]) {
      const zh = item.generatePrompt({ scene: 'POST_NEW', draftText: '', keywords }, 'zh', p)
      const en = item.generatePrompt({ scene: 'POST_NEW', draftText: '', keywords }, 'en', p)
      expect(zh.userMessage).not.toMatch(banned)
      expect(en.userMessage).not.toMatch(banned)
    }
  })

  it('AC-9 视角并入「爆款推文复刻」，多视角菜单已移除', () => {
    expect(COPILOT_MENU_ITEMS.find((i) => i.id === 'ai-perspective-post')).toBeUndefined()
    expect(COPILOT_MENU_ITEMS.filter((i) => i.usesPerspective).map((i) => i.id)).toEqual(['ai-hot-tweets'])
    const item = COPILOT_MENU_ITEMS.find((i) => i.id === 'ai-hot-tweets')!
    expect(item.scenes).toEqual(['POST_NEW'])
    const p = PERSPECTIVES[0]
    // 有草稿：按视角改写草稿
    const draft = item.generatePrompt({ scene: 'POST_NEW', draftText: '我的想法' }, 'zh', p)
    expect(draft.systemPrompt).toContain(`写作视角：${p.name}`)
    expect(draft.userMessage).toContain('我的想法')
    // 无草稿、有热帖：提炼钩子，按视角原创
    const seeds = [{ author: 'alice', text: '一条热帖正文', stat: '10 回复' }]
    const hot = item.generatePrompt({ scene: 'POST_NEW', draftText: '', feedHotTweets: seeds }, 'zh', p)
    expect(hot.systemPrompt).toContain(`写作视角：${p.name}`)
    expect(hot.userMessage).toContain('一条热帖正文')
    expect(hot.userMessage).toContain('复刻二创')
    expect(hot.userMessage).toContain('爆点结构')
    // AC-11 带评论转发：评论与原帖分开给模型，并要求看评论对原帖用了什么角度
    const quoteSeeds = [{ author: 'bob', text: '这才是重点', stat: '900 回复', quotedAuthor: 'carol', quotedText: '原帖正文：推理成本下降 40%' }]
    const remix = item.generatePrompt({ scene: 'POST_NEW', draftText: '', feedHotTweets: quoteSeeds }, 'zh', p)
    expect(remix.userMessage).toContain('带评论转发')
    expect(remix.userMessage).toContain('@bob 的评论：这才是重点')
    expect(remix.userMessage).toContain('被转发的原帖 —— @carol: 原帖正文：推理成本下降 40%')
    expect(remix.userMessage).toContain('评论对原帖用了什么角度')
    const remixEn = item.generatePrompt({ scene: 'POST_NEW', draftText: '', feedHotTweets: quoteSeeds }, 'en', p)
    expect(remixEn.userMessage).toContain('Quoted post — @carol')
    expect(remixEn.userMessage).toContain('winning structure')
    // 无草稿、无热帖：围绕赛道关键词按视角原创
    const pure = item.generatePrompt({ scene: 'POST_NEW', draftText: '', keywords: ['出海'] }, 'en', p)
    expect(pure.systemPrompt).toContain(`PERSPECTIVE: ${p.nameEn}`)
    expect(pure.userMessage).toContain('出海')
    expect(pure.userMessage).not.toMatch(/trending discussions above/)
  })
})
