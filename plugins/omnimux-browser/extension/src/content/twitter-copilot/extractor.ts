/**
 * Twitter Context Extractor
 * Extracts tweet body, author, quote targets, and drafts with 100% precision.
 */

import type { TwitterContext, TwitterCopilotScene } from './types.ts'

function findComposerContainer(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el
  for (let i = 0; i < 14 && cur; i++) {
    if (cur.querySelector('div[data-testid="tweetTextarea_0"]')) {
      return cur
    }
    cur = cur.parentElement
  }
  return null
}

export function isStatusDetailPage(): boolean {
  return /\/[^/]+\/status\/\d+/.test(window.location.pathname)
}

/**
 * 回帖弹窗打开时推特会把地址改写成 /compose/post，地址栏不再能区分入口，
 * 因此按「弹窗背后是否仍留有被聚焦的原推」判定详情页入口（线上实测：详情页 true、信息流 false）。
 */
export function hasFocalTweetBehind(): boolean {
  return !!document.querySelector('main article[data-testid="tweet"][tabindex="-1"]')
}

export function detectTwitterScene(anchorButton: HTMLElement): TwitterCopilotScene {
  // 1. Is this inside a tweet compose modal? (e.g. url includes /compose/post or inside modal role="dialog")
  const dialog = anchorButton.closest('[role="dialog"]')
  if (dialog) {
    // 引用转发弹窗：被引用原推内嵌在 attachments 容器中，并带 tweetText（线上实测结构）
    const hasQuotedCard = !!dialog.querySelector('[data-testid="attachments"] [data-testid="tweetText"]')
    if (hasQuotedCard) {
      return 'POST_QUOTE'
    }
    // 回帖弹窗：被回复的原推以 article[data-testid="tweet"] 内嵌；详情页入口 → 回帖菜单，
    // 其余入口（信息流、个人页、通知等）→ 快捷互动菜单
    const hasEmbeddedTweet = !!dialog.querySelector('article[data-testid="tweet"]')
    if (hasEmbeddedTweet) {
      return hasFocalTweetBehind() ? 'REPLY_DETAIL' : 'REPLY_FEED'
    }
    return 'POST_NEW'
  }

  // 2. Find the owning composer container that wraps both textarea and toolbar
  const composer = findComposerContainer(anchorButton)
  const containerText = (composer?.textContent || '').toLowerCase()

  const isPostNewPlaceholder =
    containerText.includes('有什么新鲜事') ||
    containerText.includes('happening') ||
    containerText.includes('what is happening')

  // Check the button's own text or targetBtn text
  const targetBtn =
    anchorButton.parentElement?.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]') ||
    anchorButton
  const btnText = (targetBtn.textContent || '').trim().toLowerCase()
  const isPostBtn = btnText.includes('发帖') || btnText.includes('post')
  const isReplyBtn = btnText.includes('回复') || btnText.includes('reply')

  // 3. Is this inside an existing tweet article card (inline reply in feed)?
  const parentTweet = anchorButton.closest('article[data-testid="tweet"]')
  if (parentTweet) {
    return 'REPLY_FEED'
  }

  // 4. Explicit new post signals (home feed top composer)
  if (isPostNewPlaceholder || (isPostBtn && !isReplyBtn)) {
    return 'POST_NEW'
  }

  // 5. Is this inline in tweet detail page (/username/status/123)?
  if (isStatusDetailPage() || isReplyBtn) {
    return 'REPLY_DETAIL'
  }

  return 'POST_NEW'
}

export function extractTwitterContext(anchorButton: HTMLElement, scene: TwitterCopilotScene): TwitterContext {
  // 所有字段一律初始化为空串：抓不到就是空，绝不让 undefined 流进提示词
  const context: TwitterContext = {
    scene,
    draftText: '',
    targetTweetText: '',
    targetAuthor: '',
    quotedTweetText: '',
    quotedAuthor: '',
    tweetUrl: '',
  }

  // 1. Extract draft text from current textarea
  // 严格从图标所属的局部容器查找，绝不向全局 document 退化，避免误取页面上其他编辑框内容
  const isTooBroad = (el: Element | null | undefined): boolean =>
    !el || el === document.body || el === document.documentElement || el.tagName === 'BODY' || el.tagName === 'HTML'

  const parentContainer =
    anchorButton.parentElement && !isTooBroad(anchorButton.parentElement) &&
    anchorButton.parentElement.querySelector('div[data-testid="tweetTextarea_0"][role="textbox"], div[role="textbox"][contenteditable="true"]')
      ? anchorButton.parentElement
      : null

  const composerContainer =
    anchorButton.closest('[data-testid="tweetTextarea_0_label"]')?.parentElement ||
    anchorButton.closest('[role="dialog"]') ||
    anchorButton.closest('form') ||
    anchorButton.closest('article') ||
    parentContainer

  const textarea = composerContainer
    ? (composerContainer.querySelector(
        'div[data-testid="tweetTextarea_0"][role="textbox"], div[role="textbox"][contenteditable="true"]',
      ) as HTMLElement | null)
    : null

  if (textarea) {
    context.draftText = (textarea.textContent || '').trim()
  }

  // 2. If it is a quote modal, extract quoted tweet
  if (scene === 'POST_QUOTE') {
    const dialog = anchorButton.closest('[role="dialog"]')
    if (dialog) {
      const quoteCard =
        dialog.querySelector('[data-testid="quoteTweet"]') ||
        dialog.querySelector('article[data-testid="tweet"]') ||
        dialog.querySelector('[data-testid="attachments"]')

      if (quoteCard) {
        const textEl = quoteCard.querySelector('[data-testid="tweetText"]')
        context.quotedTweetText = (textEl?.textContent || quoteCard.textContent || '').trim()

        const userEl = quoteCard.querySelector('[data-testid="User-Name"]')
        const userLink =
          userEl?.querySelector('a[role="link"][href^="/"]') ||
          quoteCard.querySelector('a[href*="/status/"], a[role="link"][href^="/"]')
        if (userLink) {
          const href = userLink.getAttribute('href') || ''
          const match = href.match(/^\/([^/]+)/)
          if (match && match[1]) {
            context.quotedAuthor = match[1]
          }
        }
      }
    }
  }

  // 3. If it is reply detail or feed, extract target main tweet
  if (scene === 'REPLY_DETAIL' || scene === 'REPLY_FEED') {
    const replyDialog = anchorButton.closest('[role="dialog"]')
    // 回帖弹窗：被回复的原推内嵌在弹窗内，优先按弹窗取，避免误取信息流里的其它推文
    let targetTweet =
      (replyDialog?.querySelector('article[data-testid="tweet"]') as HTMLElement | null) ||
      // In status detail page, official Twitter gives the focal parent tweet tabindex="-1"
      (document.querySelector('article[tabindex="-1"][data-testid="tweet"]') as HTMLElement | null)

    // If not found (e.g. inline reply on timeline feed), find the closest tweet ancestor of reply button
    if (!targetTweet) {
      targetTweet = anchorButton.closest('article[data-testid="tweet"]') as HTMLElement | null
    }

    // 绝对不向 document.querySelector('main article') 兜底，避免对着下面的推文点神评却抓了顶部的推文

    if (targetTweet) {
      const tweetTextEl = targetTweet.querySelector('[data-testid="tweetText"]')
      context.targetTweetText = (tweetTextEl?.textContent || '').trim()

      const userLink = targetTweet.querySelector('div[data-testid="User-Name"] a[role="link"]')
      if (userLink) {
        const href = userLink.getAttribute('href') || ''
        const handle = href.replace(/^\/+/, '').split('/')[0]
        context.targetAuthor = handle
      }

      const statusLink = targetTweet.querySelector('a[href*="/status/"]')
      if (statusLink) {
        context.tweetUrl = (statusLink as HTMLAnchorElement).href || ''
      }
    }
  }

  return context
}
