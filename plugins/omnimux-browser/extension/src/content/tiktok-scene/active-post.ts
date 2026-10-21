/**
 * Which post the For You feed is showing right now.
 *
 * The address bar is not an answer any more: the current TikTok web feed keeps
 * `/` while the user swipes through posts, so the post has to be read off the
 * card that owns the viewport's centre.
 *
 * A video card happens to name its post twice — `div[id^="xgwrapper-0-"]<postId>`
 * and a "more" button carrying `data-more-menu-item-id`. A **photo/carousel** card
 * has no player at all and, in the current layout, no `/photo/` anchor either;
 * that more button is the only place its id appears in the DOM. Reading only the
 * player id is what made every action on a photo post answer "no post to act on".
 *
 * The id comes from a plain attribute, never from React's expando props: a content
 * script runs in an isolated world and cannot see the page's JavaScript
 * properties, only the DOM.
 *
 * @module
 */

import { canonicalPostUrl } from './target.ts'

/** The viewport the cards are measured against. */
export interface ViewportSize {
  readonly height: number
}

/** Which markup the current card offers. */
export type ActivePostKind = 'video' | 'photo'

/** Containers that can own one feed post, most specific first. */
const CARD_SELECTORS: readonly string[] = [
  '[data-e2e="recommend-list-item-container"]',
  '[data-e2e="feed-video"]',
  '[data-e2e="feed-photo"]',
  'article',
  '[class*="ItemContainer"]',
]

/**
 * Controls that name the post they belong to.
 *
 * `data-more-menu-item-id` is the "…" menu every card renders, photo posts
 * included (measured: a 7-image carousel card had it, with no player at all);
 * `data-item-id` is the same fact under an older name.
 */
const ITEM_ID_ATTRIBUTES: readonly string[] = ['data-more-menu-item-id', 'data-item-id']

/** Smallest box a feed card may have; smaller nodes are chrome, not a post. */
const MIN_CARD_PX = 200

/** Post id shape TikTok uses for videos and photo posts alike. */
const POST_ID = /^\d{18,19}$/

/** The same id as it appears inside a longer string, such as a player DOM id. */
const POST_ID_IN_TEXT = /\d{18,19}/

/** Link shapes that name a post. */
const POST_LINK = 'a[href*="/video/"], a[href*="/photo/"]'

/** Whether a value is a post id; the predicate is what keeps the call sites typed. */
function isPostId(value: unknown): value is string {
  if (typeof value === 'number') return POST_ID.test(String(value))
  return typeof value === 'string' && POST_ID.test(value)
}

/** Distance from the viewport's vertical centre to an element's centre. */
function centreDistance(element: Element, viewport: ViewportSize): number {
  const box = element.getBoundingClientRect()
  return Math.abs((box.top + box.bottom) / 2 - viewport.height / 2)
}

/** Whether an element is a card-sized, laid-out box. */
function isCardSized(element: Element, viewport: ViewportSize): boolean {
  const box = element.getBoundingClientRect()
  if (box.width < MIN_CARD_PX || box.height < MIN_CARD_PX) return false
  return box.bottom > 0 && box.top < viewport.height
}

/** The card closest to the viewport centre. */
function activeCard(doc: Document, viewport: ViewportSize): Element | null {
  const cards = Array.from(doc.querySelectorAll(CARD_SELECTORS.join(', '))).filter((element) =>
    isCardSized(element, viewport),
  )
  let best: Element | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const card of cards) {
    const distance = centreDistance(card, viewport)
    if (distance < bestDistance) {
      bestDistance = distance
      best = card
    }
  }
  return best
}

/** The id named by an item-id control inside a container, or `null`. */
function itemIdIn(container: Element | null): string | null {
  if (container === null) return null
  for (const attribute of ITEM_ID_ATTRIBUTES) {
    const holder = container.querySelector(`[${attribute}]`)
    const value = holder?.getAttribute(attribute)?.trim()
    if (isPostId(value)) return value
  }
  return null
}

/** The author handle a card names, or `null`. */
function authorOf(card: Element | null): string | null {
  if (card === null) return null
  const handle = card.querySelector('[data-e2e="video-author-uniqueid"], [data-e2e="browse-username"]')
  const text = handle?.textContent?.trim()
  if (text !== undefined && text !== '') return text.replace(/^@/, '')
  const link = card.querySelector('a[href*="/@"]')
  const match = link?.getAttribute('href')?.match(/\/@([^/?#]+)/)
  return match ? match[1] : null
}

/** A post address assembled from its parts, with `i` as the author fallback. */
function postUrl(kind: ActivePostKind, id: string, author: string | null): string {
  return `https://www.tiktok.com/@${author ?? 'i'}/${kind}/${id}`
}

/** The post a link names, canonicalised, or `null`. */
function postFromLink(container: Element | null): string | null {
  if (container === null) return null
  for (const link of Array.from(container.querySelectorAll<HTMLAnchorElement>(POST_LINK))) {
    const canonical = canonicalPostUrl(link.href)
    if (canonical !== null) return canonical
  }
  return null
}

/**
 * The card-sized container a control belongs to.
 *
 * Named card selectors answer first; when a layout has none, the first
 * card-sized ancestor is used so the kind (video vs photo) and the author are
 * read from the post the control actually belongs to, not from the page at
 * large.
 * @param control the item-id control
 */
function owningCard(control: Element): Element | null {
  const named = control.closest(CARD_SELECTORS.join(', '))
  if (named !== null) return named
  let node = control.parentElement
  for (let depth = 0; depth < 4 && node !== null; depth += 1, node = node.parentElement) {
    const box = node.getBoundingClientRect()
    if (box.width >= MIN_CARD_PX && box.height >= MIN_CARD_PX) return node
  }
  return null
}

/**
 * Whether a card is a photo/carousel post rather than a video.
 *
 * The card's own `data-e2e` is the first answer: a `feed-video` card whose player
 * has not mounted yet has no `<video>` either, and calling that a carousel would
 * hand the host a `/photo/` address for a video. Markup is only the fallback for
 * containers that do not name themselves.
 * @param card the card, when one was found
 */
function kindOf(card: Element | null): ActivePostKind {
  if (card === null) return 'video'
  const tag = card.getAttribute('data-e2e')
  if (tag === 'feed-video' || tag === 'browse-video') return 'video'
  if (tag === 'feed-photo' || tag === 'browse-photo') return 'photo'
  if (card.querySelector('video') !== null) return 'video'
  if (card.querySelector('[id*="xgwrapper-"], [id*="xgmedia-"]') !== null) return 'video'
  return 'photo'
}

/**
 * The post the feed is showing, as a canonical URL, or `null`.
 *
 * Rungs, in order: the active card's item-id control (covers videos and photo
 * posts alike), a post link inside that card, the nearest item-id control
 * anywhere in the viewport (overlays and future card layouts), a link in a browse
 * container, and finally the player wrapper's id for cards whose more button is
 * missing. A page with no post-sized card in the viewport answers `null` rather
 * than guessing the first post rendered.
 * @param doc the page
 * @param viewport the viewport the cards are measured against
 */
export function resolveActivePostUrl(doc: Document, viewport: ViewportSize): string | null {
  // 1. The card that owns the viewport centre, plus the id on its more button.
  const card = activeCard(doc, viewport)
  if (card !== null) {
    const id = itemIdIn(card)
    if (id !== null) return postUrl(kindOf(card), id, authorOf(card))

    const fromCard = postFromLink(card)
    if (fromCard !== null) return fromCard
  }

  // 2. With no active card, the nearest item-id control in the viewport covers
  //    overlays and card layouts that CARD_SELECTORS does not name. This rung is
  //    deliberately skipped when a card did match: falling through to a
  //    neighbour's control would resolve a post the user is not looking at.
  const controls = card === null
    ? Array.from(doc.querySelectorAll<HTMLElement>(ITEM_ID_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(', ')))
    : []
  let bestControl: HTMLElement | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const control of controls) {
    const box = control.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0 || box.top >= viewport.height || box.bottom <= 0) continue
    const distance = centreDistance(control, viewport)
    if (distance < bestDistance) {
      bestDistance = distance
      bestControl = control
    }
  }
  if (bestControl !== null) {
    const owner = owningCard(bestControl)
    if (owner !== null) {
      for (const attribute of ITEM_ID_ATTRIBUTES) {
        const value = bestControl.getAttribute(attribute)?.trim()
        if (isPostId(value)) return postUrl(kindOf(owner), value, authorOf(owner))
      }
    }
  }

  // 3. A browse container that already names the post in an anchor.
  const containers = Array.from(
    doc.querySelectorAll(
      '[data-e2e="browse-video"], [data-e2e="browse-photo"], [class*="DivVideoContainer"], [class*="DivPhotoContainer"]',
    ),
  )
  for (const container of containers) {
    const fromContainer = postFromLink(container)
    if (fromContainer !== null) return fromContainer
  }

  // 4. The player wrapper's id, for a card whose more button is missing.
  const players = Array.from(doc.querySelectorAll<HTMLElement>('[id*="xgwrapper-"], [id*="xgmedia-"]'))
  let bestPlayer: HTMLElement | null = null
  bestDistance = Number.POSITIVE_INFINITY
  for (const player of players) {
    const box = player.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0 || box.top >= viewport.height || box.bottom <= 0) continue
    const distance = centreDistance(player, viewport)
    if (distance < bestDistance) {
      bestDistance = distance
      bestPlayer = player
    }
  }
  if (bestPlayer !== null) {
    const id = bestPlayer.id.match(POST_ID_IN_TEXT)
    if (id !== null) {
      return postUrl('video', id[0], authorOf(bestPlayer.closest(CARD_SELECTORS.join(', '))))
    }
  }

  return null
}
