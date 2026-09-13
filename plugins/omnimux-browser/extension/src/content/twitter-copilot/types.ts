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
  generatePrompt: (context: TwitterContext, locale?: 'zh' | 'en') => { systemPrompt: string; userMessage: string }
}
