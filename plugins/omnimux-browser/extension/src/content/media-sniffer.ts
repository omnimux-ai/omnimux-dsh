/**
 * Media Sniffer: detects visible images and video posters in the current viewport
 * so users can toggle them into attachments with one click.
 *
 * The `>= 40px` eligibility rule and the URL normalisation both come from the
 * hover detector's payload module: the viewport scan and the pointer detector
 * must never disagree about what counts as a usable media element.
 */

import {
  isAttachablePayload,
  isElementInViewport,
  isEligibleMediaSize,
  mediaSourceOf,
  normalizeMedia,
} from './media-hover/payload.ts'
import type { MediaKind } from './media-hover/types.ts'

export interface DetectedMediaItem {
  id: string
  type: 'image' | 'video'
  src: string
  previewSrc: string
  alt?: string
  width?: number
  height?: number
}

/** Maximum number of items one page scan reports. */
export const SNIFF_MEDIA_LIMIT = 8

/** True when an element is large enough and inside the viewport. */
function isSniffable(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  const vw = window.innerWidth || document.documentElement.clientWidth
  const vh = window.innerHeight || document.documentElement.clientHeight
  if (!isEligibleMediaSize(rect.width, rect.height)) return false
  return isElementInViewport(rect, vw, vh)
}

function sniffElement(el: Element, kind: MediaKind, index: number): DetectedMediaItem | null {
  const payload = normalizeMedia(el, kind, location.href)
  if (payload === null) return null
  return {
    id: `${kind === 'video' ? 'video' : 'img'}_${index + 1}`,
    type: payload.type,
    // A page-scoped address is dead outside its own tab, so the panel gets the
    // captured frame or the page address instead of a link that resolves nowhere.
    src: isAttachablePayload(payload) ? payload.src : (payload.previewSrc || payload.pageUrl),
    previewSrc: payload.previewSrc || mediaSourceOf(el, kind, location.href),
    alt: payload.alt,
    width: payload.naturalWidth || payload.width,
    height: payload.naturalHeight || payload.height,
  }
}

export function sniffViewportMedia(): DetectedMediaItem[] {
  const items: DetectedMediaItem[] = []
  const seenUrls = new Set<string>()

  const push = (el: Element, kind: MediaKind): void => {
    if (items.length >= SNIFF_MEDIA_LIMIT) return
    if (!isSniffable(el)) return
    const item = sniffElement(el, kind, items.length)
    if (item === null || seenUrls.has(item.src)) return
    seenUrls.add(item.src)
    items.push(item)
  }

  for (const img of document.querySelectorAll('img')) {
    push(img, 'image')
  }
  for (const video of document.querySelectorAll('video')) {
    push(video, 'video')
  }

  return items
}
