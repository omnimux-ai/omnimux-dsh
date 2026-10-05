/**
 * Twitter Copilot Types & Data Models
 */

export type TwitterCopilotScene = 'POST_NEW' | 'POST_QUOTE' | 'REPLY_DETAIL' | 'REPLY_FEED'

export interface TwitterContext {
  scene: TwitterCopilotScene
  /** Existing draft text in the composer */
  draftText: string
  /** Target tweet text (for reply or quote) */
  targetTweetText?: string
  /** Author name / handle of target tweet */
  targetAuthor?: string
  /** Quoted tweet text if quote modal is open */
  quotedTweetText?: string
  /** Quoted author if quote modal is open */
  quotedAuthor?: string
  /** Tweet URL or ID if available */
  tweetUrl?: string
  /** Hot tweets extracted from feed for inspiration when draft is empty */
  feedHotTweets?: FeedHotTweet[]
  /** Scored seeds behind `feedHotTweets` (empty-composer POST_NEW only) */
  seeds?: ScoredCandidate[]
  /** Feed tweets examined before scoring (empty-composer POST_NEW only) */
  candidatesScanned?: number
  /** Normalized keywords used for keyword-fit scoring */
  keywords?: string[]
  /** Candidates collected per feed source (empty-composer POST_NEW only) */
  sourcesScanned?: Partial<Record<CandidateSource, number>>
  /** Hottest candidates offered to the decision model (empty-composer POST_NEW only) */
  shortlist?: ScoredCandidate[]
}

/** Outcome of choosing the remix seed: the decision model's semantic pick, or the rule-score fallback. */
export interface SeedPickDecision {
  source: 'jev' | 'rules'
  candidates: number
  /** 0-based index into the shortlist when the model picked one */
  pickedIndex?: number
  confidence?: number
  latencyMs?: number
  fallbackReason?: string
}

/** Where a feed candidate came from: the home「为你推荐」/「正在关注」tabs, or whatever page is open. */
export type CandidateSource = 'for_you' | 'following' | 'page'

/** One feed tweet for inspiration; quote tweets carry the quoted post apart from the comment. */
export interface FeedHotTweet {
  author: string
  text: string
  stat?: string
  quotedAuthor?: string
  quotedText?: string
}

/** One feed tweet with its five 0–100 dimension scores and weighted total. */
export interface ScoredCandidate {
  author: string
  text: string
  replies: number
  reposts: number
  likes: number
  ageHours: number
  source?: CandidateSource
  /** True when the tweet quotes another post; `text` is then the quoter's own comment */
  isQuote?: boolean
  quotedAuthor?: string
  quotedText?: string
  scores: { keyword: number; controversy: number; infoDelta: number; velocity: number; reach: number }
  /** Keyword-free 0–100 heat used to shortlist candidates for the semantic pick */
  heat: number
  total: number
}

export type PerspectiveId =
  | 'P1_CONTRARIAN'
  | 'P2_PRACTITIONER'
  | 'P3_SIMPLIFIER'
  | 'P4_ARBITRAGEUR'
  | 'P5_OBSERVER'
  | 'P6_PEER'

export interface PerspectiveDef {
  id: PerspectiveId
  name: string
  nameEn: string
  /** One-line choice description handed to Jev */
  choice: string
  guidanceZh: string
  guidanceEn: string
}

export interface PerspectiveDecision {
  id: PerspectiveId
  source: 'jev' | 'rules'
  confidence?: number
  latencyMs?: number
  fallbackReason?: string
}

export interface CopilotMenuItem {
  id: string
  name: string
  nameEn: string
  desc: string
  descEn: string
  /** Categories: create (发帖/转发) vs reply (回帖互动) */
  category: 'create' | 'reply'
  /** Matching scenes */
  scenes: TwitterCopilotScene[]
  /** System prompt / instruction generator supporting bilingual output */
  generatePrompt: (
    context: TwitterContext,
    locale?: 'zh' | 'en',
    perspective?: PerspectiveDef,
  ) => { systemPrompt: string; userMessage: string }
  /** True when the item asks Jev for a perspective before generating */
  usesPerspective?: boolean
}
