/**
 * Six writing perspectives for POST_NEW / POST_QUOTE, plus the deterministic
 * rule classifier used whenever Jev is unavailable or answers off-list.
 */

import type { PerspectiveDef, PerspectiveId, ScoredCandidate } from './types.ts'

export const PERSPECTIVES: readonly PerspectiveDef[] = [
  {
    id: 'P1_CONTRARIAN',
    name: '反常识批判者',
    nameEn: 'Contrarian',
    choice: 'Challenge the consensus with a counter-intuitive claim; fits heated, divided discussions.',
    guidanceZh: '首句直接给出一个反直觉判断，挑战多数人的默认看法；用一个素材里的事实撑住它；结尾抛出一个让读者站队的反问。不人身攻击，不夸大。',
    guidanceEn: 'Open with a counter-intuitive claim that challenges the default view, back it with one fact from the material, and end with a question that makes readers pick a side. No personal attacks, no exaggeration.',
  },
  {
    id: 'P2_PRACTITIONER',
    name: '一线实战老兵',
    nameEn: 'Practitioner',
    choice: 'Speak from hands-on experience with concrete numbers and failure cases; fits engineering details or benchmarks.',
    guidanceZh: '只使用素材里出现的场景、数字和结果，写清「原以为 A，实际是 B」的落差；口吻像刚处理完问题的人。没有数字就不写数字。',
    guidanceEn: 'Use only scenarios, numbers and outcomes present in the material; make the "expected A, got B" gap explicit; sound like someone who just fixed it. No numbers if none are given.',
  },
  {
    id: 'P3_SIMPLIFIER',
    name: '降维普及者',
    nameEn: 'Simplifier',
    choice: 'Explain a complex new tool, paper or concept with one everyday analogy; fits jargon-heavy topics.',
    guidanceZh: '不用行话，用一个日常生活里的类比讲清核心机制，再用一句话说明它和普通人有什么关系。',
    guidanceEn: 'No jargon. Explain the core mechanism with one everyday analogy, then one sentence on why it matters to ordinary people.',
  },
  {
    id: 'P4_ARBITRAGEUR',
    name: '商业套利猎手',
    nameEn: 'Arbitrageur',
    choice: 'Run the numbers on cost, time and return; fits pricing, monetization or replacing human work.',
    guidanceZh: '从成本、时间、回报三个角度算一笔账，点出一个确定的收益或一个容易忽视的亏损。只用素材里有的数，没有就讲逻辑。',
    guidanceEn: 'Do the math on cost, time and return; point out one clear gain or one overlooked loss. Only use numbers from the material; otherwise argue the logic.',
  },
  {
    id: 'P5_OBSERVER',
    name: '冷眼趋势观察家',
    nameEn: 'Trend Observer',
    choice: 'Step back to second-order effects: who wins, who gets replaced; fits big-company moves and industry shifts.',
    guidanceZh: '跳出单个产品的好坏之争，讲一个二阶影响：这件事之后谁受益、谁被替代、价值往哪里移。',
    guidanceEn: 'Skip the single-product debate and name one second-order effect: who benefits, who gets replaced, where value moves next.',
  },
  {
    id: 'P6_PEER',
    name: '真实同壕战友',
    nameEn: 'Peer',
    choice: 'Talk as an equal about shared struggle and real feelings; fits burnout, anxiety or help-seeking threads.',
    guidanceZh: '用平视的同路人口吻，说出大家心里有但不常说的真实感受；不灌鸡汤，结尾一句克制的话即可。',
    guidanceEn: 'Speak as an equal, voice the feeling people share but rarely say; no pep talk, end with one restrained line.',
  },
]

export const PERSPECTIVE_IDS: readonly PerspectiveId[] = PERSPECTIVES.map((p) => p.id)

export function getPerspective(id: string | undefined): PerspectiveDef | undefined {
  return PERSPECTIVES.find((p) => p.id === id)
}

const RULES: ReadonlyArray<{ id: PerspectiveId; test: RegExp }> = [
  { id: 'P2_PRACTITIONER', test: /\d+\s*(?:ms|毫秒|秒|小时|天|并发|qps|行代码|次请求|GB|MB|%)|报错|踩坑|复盘|压测|bug|benchmark|latency|refactor|上线/i },
  { id: 'P3_SIMPLIFIER', test: /论文|paper|架构|模型发布|新版本|开源|release|v\d+\.\d+|transformer|agent|协议|白皮书/i },
  { id: 'P4_ARBITRAGEUR', test: /成本|收入|利润|定价|价格|变现|裁员|降本|ROI|MRR|ARR|\$\d|美元|元\/|revenue|pricing|cost/i },
  { id: 'P5_OBSERVER', test: /巨头|格局|生态|垄断|收购|并购|估值|行业|周期|OpenAI|Google|Apple|Microsoft|Meta|英伟达|NVIDIA/i },
  { id: 'P6_PEER', test: /焦虑|迷茫|累了|内卷|撑不住|失业|求助|怎么办|burnout|anxious|tired|struggl/i },
]

/** Seeds whose reply/repost ratio reaches this are treated as divided discussions. */
export const CONTROVERSY_TRIGGER = 75

/**
 * Deterministic fallback: controversy first, then the first matching topic rule
 * in priority order; nothing matches → practitioner.
 */
export function classifyPerspectiveByRules(seeds: ScoredCandidate[], draft: string): PerspectiveId {
  if (seeds.some((s) => s.scores.controversy >= CONTROVERSY_TRIGGER)) return 'P1_CONTRARIAN'
  const corpus = [draft, ...seeds.map((s) => s.text)].join('\n')
  for (const rule of RULES) {
    if (rule.test.test(corpus)) return rule.id
  }
  return 'P2_PRACTITIONER'
}

export const JEV_STATE_MAX = 2000

/** Build the bounded Jev choice request for perspective selection. */
export function buildJevDecisionArgs(seeds: ScoredCandidate[], draft: string, quoted = '', keywords: string[] = []): {
  state: string
  choices: Record<string, string>
  instructions: string
} {
  const parts: string[] = []
  if (draft.trim()) parts.push(`Draft: ${draft.trim()}`)
  if (quoted.trim()) parts.push(`Quoted tweet: ${quoted.trim()}`)
  seeds.forEach((s, i) => {
    parts.push(`Feed ${i + 1} (replies ${s.replies}, reposts ${s.reposts}, likes ${s.likes}): ${s.text}${s.quotedText ? ` — quoting: ${s.quotedText}` : ''}`)
  })
  // 服务端拒收空素材：没有任何内容时用赛道或通用背景兜底，保证 Jev 始终能参与决策。
  if (parts.length === 0) {
    parts.push(keywords.length > 0
      ? `Original tweet with no source material. Niche: ${keywords.join(', ')}.`
      : 'Original tweet with no source material, drawn from a working practitioner’s everyday job.')
  }
  const joined = parts.join('\n')
  const state = joined.length > JEV_STATE_MAX ? `${joined.slice(0, JEV_STATE_MAX)}…` : joined
  const choices: Record<string, string> = {}
  for (const p of PERSPECTIVES) choices[p.id] = p.choice
  return {
    state,
    choices,
    instructions: 'Pick the single writing perspective most likely to earn replies for a tweet about this material. Answer with the choice key only.',
  }
}

/** Choice key for "none of the candidates fits the niche". */
export const SEED_PICK_NONE = 'none'

/**
 * Bounded Jev request for the semantic seed pick: each shortlisted hot tweet is
 * one choice, the niche is the state, plus an explicit "none fits" choice.
 */
export function buildSeedPickArgs(shortlist: ScoredCandidate[], keywords: string[]): {
  state: string
  choices: Record<string, string>
  instructions: string
} {
  const niche = keywords.length > 0 ? keywords.join(', ') : 'general creator / working professional'
  const state = `My niche: ${niche}. I want to remix one trending tweet below into a brand new original tweet for my audience, reusing what made it take off.`
  const choices: Record<string, string> = {}
  shortlist.forEach((c, i) => {
    const quoted = c.quotedText ? ` | quoting: ${c.quotedText}` : ''
    const stat = ` [${c.replies} replies, ${c.reposts} reposts, ${c.likes} likes]`
    const body = `${c.text}${quoted}`
    choices[`t${i}`] = `${body.slice(0, 500 - stat.length - 1)}${stat}`
  })
  choices[SEED_PICK_NONE] = 'None of these fits my niche or is worth remixing.'
  return {
    state,
    choices,
    instructions:
      'Pick the one trending tweet whose topic best fits my niche and whose hook or angle I could most convincingly remix for my audience. Prefer quote tweets that add a sharp take. Pick "none" only if every tweet is unrelated to my niche. Answer with the choice key only.',
  }
}
