// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  buildJevDecisionArgs,
  classifyPerspectiveByRules,
  JEV_STATE_MAX,
  PERSPECTIVES,
} from '../src/content/twitter-copilot/perspectives.ts'
import { COPILOT_MENU_ITEMS } from '../src/content/twitter-copilot/prompts.ts'
import type { PerspectiveId, ScoredCandidate } from '../src/content/twitter-copilot/types.ts'

function seed(text: string, controversy = 10): ScoredCandidate {
  return {
    author: 'a', text, replies: 5, reposts: 5, likes: 5, ageHours: 1,
    scores: { keyword: 50, controversy, infoDelta: 50, velocity: 50 }, total: 80,
  }
}

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

  it('多视角菜单项：注入视角段，且只出现在发新帖与引用转发', () => {
    const item = COPILOT_MENU_ITEMS.find((i) => i.id === 'ai-perspective-post')!
    expect(item.scenes).toEqual(['POST_NEW', 'POST_QUOTE'])
    expect(item.usesPerspective).toBe(true)
    const p = PERSPECTIVES[0]
    const zh = item.generatePrompt({ scene: 'POST_QUOTE', draftText: '', quotedTweetText: '原推正文', quotedAuthor: 'bob' }, 'zh', p)
    expect(zh.systemPrompt).toContain(`写作视角：${p.name}`)
    expect(zh.userMessage).toContain('原推正文')
    expect(zh.userMessage).toContain('@bob')
    const en = item.generatePrompt({ scene: 'POST_NEW', draftText: 'my idea' }, 'en', p)
    expect(en.systemPrompt).toContain(`PERSPECTIVE: ${p.nameEn}`)
    expect(en.userMessage).toContain('my idea')
    for (const other of COPILOT_MENU_ITEMS.filter((i) => i.category === 'reply')) {
      expect(other.usesPerspective).toBeFalsy()
    }
  })
})
