/**
 * X post body reader.
 *
 * A normal post draws its body in `[data-testid="tweetText"]`. A long-form post
 * (X Article) draws none: the title sits in `[data-testid="twitter-article-title"]`
 * and the body in `[data-testid="twitterArticleRichTextView"]` as Draft.js blocks
 * (`div.longform-unstyled` → `div.public-DraftStyleDefault-block` → inline spans).
 *
 * Readers that only looked at `tweetText` therefore produced an empty body on an
 * article page, and the copilot rejected the page as "original post not found"
 * (#3630). Article text is read from the title and body containers only: the
 * surrounding `twitterArticleReadView` also carries the interaction counters
 * (`45101591万`), which must never leak into a prompt.
 *
 * Every lookup stays inside the supplied scope: a wrapper around the whole post
 * (X can draw a card as one `div[role="link"]`) is the post itself, not a quote.
 *
 * @module
 */

const TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]'
const USER_NAME_SELECTOR = '[data-testid="User-Name"]'
const ARTICLE_TITLE_SELECTOR = '[data-testid="twitter-article-title"]'
const ARTICLE_BODY_SELECTOR = '[data-testid="twitterArticleRichTextView"]'

/**
 * The quoted post, in either shape X ships: the timeline's `quoteTweet` card, and
 * the composer's link-wrapped card. Both nest the quoted body.
 */
const QUOTE_POST_SELECTOR = '[data-testid="quoteTweet"]'
const QUOTE_LINK_SELECTOR = 'div[role="link"]'

/** Draft.js block wrappers inside the article body: one block per paragraph, heading or list item. */
const ARTICLE_BLOCK_SELECTOR = '[class*="longform-"]'

/**
 * Longest body handed to a prompt.
 *
 * X Articles and premium long posts have no 280-character ceiling, and an
 * arbitrarily long body would overflow the local model's context; 8000
 * characters keeps whole posts for the normal case while bounding the prompt.
 */
export const ARTICLE_TEXT_MAX_CHARS = 8000

function collapse(text: string | null | undefined): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function capped(text: string): string {
  return text.length <= ARTICLE_TEXT_MAX_CHARS ? text : `${text.slice(0, ARTICLE_TEXT_MAX_CHARS - 1)}…`
}

/** The first match for `selector` in `scope` that is not inside the excluded quote card. */
function firstOwnNode(scope: ParentNode, selector: string, exclude?: Element | null): Element | null {
  for (const el of scope.querySelectorAll(selector)) {
    if (exclude && exclude.contains(el)) continue
    return el
  }
  return null
}

/** Text of `el` with nested post bodies removed, for the no-Draft-block fallback. */
function textWithoutEmbeds(el: Element): string {
  const clone = el.cloneNode(true) as Element
  for (const embedded of Array.from(clone.querySelectorAll(TWEET_TEXT_SELECTOR))) embedded.remove()
  return collapse(clone.textContent)
}

/**
 * Title and body of an X Article inside `scope`, or `''` when it holds none.
 *
 * @param exclude - A nested quote card; its article nodes are skipped so the
 *   quote is never reported as the owning post's own body.
 */
export function readArticleText(scope: ParentNode | null | undefined, exclude?: Element | null): string {
  if (!scope) return ''
  const titleEl = firstOwnNode(scope, ARTICLE_TITLE_SELECTOR, exclude)
  const bodyEl = firstOwnNode(scope, ARTICLE_BODY_SELECTOR, exclude)
  const title = collapse(titleEl?.textContent)
  let body = ''
  if (bodyEl !== null) {
    // Only outermost blocks: a nested `longform-*` match is already inside its parent block.
    const blocks = Array.from(bodyEl.querySelectorAll(ARTICLE_BLOCK_SELECTOR))
      .filter((block) => block.closest(ARTICLE_BLOCK_SELECTOR) === block)
      .map((block) => collapse(block.textContent))
      .filter((block) => block !== '')
    body = blocks.length > 0 ? blocks.join('\n\n') : textWithoutEmbeds(bodyEl)
  }
  return capped([title, body].filter(Boolean).join('\n\n'))
}

/** The text of a card that is itself a post: its `tweetText`, else its article body. */
export function readCardText(scope: ParentNode | null | undefined): string {
  if (!scope) return ''
  const text = (scope.querySelector(TWEET_TEXT_SELECTOR)?.textContent || '').trim()
  return text !== '' ? capped(text) : readArticleText(scope)
}

/**
 * The quoted post nested inside `scope`, in either shape X ships: a
 * `[data-testid="quoteTweet"]` card (timeline), or a `div[role="link"]` card that
 * carries another post's header (composer, embed).
 *
 * A wrapper around the post itself is not a quote: when the link container holds
 * this post's own `User-Name`, it is the whole clickable card, so it is skipped.
 */
export function findQuoteContainer(scope: ParentNode | null | undefined): Element | null {
  if (!scope) return null
  const quotePost = scope.querySelector(QUOTE_POST_SELECTOR)
  if (quotePost !== null) return quotePost
  const ownName = scope instanceof Element ? scope.querySelector(USER_NAME_SELECTOR) : null
  for (const link of scope.querySelectorAll(QUOTE_LINK_SELECTOR)) {
    if (link.querySelector(USER_NAME_SELECTOR) === null) continue
    if (ownName !== null && link.contains(ownName)) continue
    return link
  }
  return null
}

/**
 * The owning post's own body, skipping any nested quoted card: `tweetText`
 * when present, otherwise the X Article title and body.
 *
 * @param exclude - The quote container, when the caller already resolved it.
 */
export function readTweetBody(scope: ParentNode | null | undefined, exclude?: Element | null): string {
  if (!scope) return ''
  const quote = exclude ?? findQuoteContainer(scope)
  const articleBody = firstOwnNode(scope, ARTICLE_BODY_SELECTOR, quote)
  for (const el of scope.querySelectorAll(TWEET_TEXT_SELECTOR)) {
    if (quote?.contains(el)) continue
    // Text embedded inside the article body is an embed, not the article's own body.
    if (articleBody?.contains(el)) continue
    const text = (el.textContent || '').trim()
    if (text !== '') return capped(text)
  }
  return readArticleText(scope, quote)
}

/** Whether `scope` draws any post body at all (normal text or article title/body). */
export function hasPostBody(scope: Element | null | undefined): boolean {
  if (!scope) return false
  return scope.querySelector(`${TWEET_TEXT_SELECTOR}, ${ARTICLE_TITLE_SELECTOR}, ${ARTICLE_BODY_SELECTOR}`) !== null
}
