/**
 * Dynamic conflict resolution for TikTok action bar marks.
 *
 * When third-party extensions (such as CreatOK) inject shortcut buttons near or
 * above the TikTok author's avatar, OmniMux's ghost trigger must remain in its
 * primary golden position directly above the avatar (8px gap), while conflicting rival
 * icons and their labels are displaced upward so that:
 *
 * [Rival extension icon and text pushed upward]
 *   ↑ 16px (generous spacing)
 * [OmniMux ghost trigger (48x48)]
 *   ↑ 8px
 * [TikTok author avatar]
 *
 * @module
 */

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

const SHIFT_ATTR = 'data-omx-shift'
const ORIGINAL_TRANSFORM_ATTR = 'data-omx-orig-transform'
export const SAFE_GAP = 16

/**
 * Read the element's un-shifted bounding rectangle.
 */
function getBaseRect(el: HTMLElement): Box {
  const current = el.getBoundingClientRect()
  const appliedShift = Number.parseFloat(el.getAttribute(SHIFT_ATTR) ?? '0') || 0
  const top = current.top + appliedShift
  const bottom = current.bottom + appliedShift
  return {
    left: current.left,
    right: current.right,
    top,
    bottom,
    width: current.width,
    height: current.height,
  }
}

/**
 * Ascend to the topmost compact item container (e.g. wrapper containing both icon and text label like CreatOK).
 */
function findDisplaceableTarget(el: HTMLElement, actionBar: Element | null): HTMLElement {
  let cur = el
  while (cur.parentElement && cur.parentElement !== actionBar && cur.parentElement !== document.body && cur.parentElement !== document.documentElement) {
    const parent = cur.parentElement
    const pr = parent.getBoundingClientRect()
    // If the parent is a compact container wrapping this item and its label
    if (pr.width <= 140 && pr.height <= 160) {
      cur = parent
    } else {
      break
    }
  }
  return cur
}

/**
 * Check whether an element is a candidate rival icon or extension item.
 */
function isRivalCandidate(el: HTMLElement, avatarEl: Element | null, ourHostId: string): boolean {
  if (el.id === ourHostId || el.closest(`#${ourHostId}`) !== null) return false
  if (avatarEl !== null && (el === avatarEl || el.contains(avatarEl) || avatarEl.contains(el))) return false
  const tag = el.tagName.toLowerCase()
  if (['html', 'body', 'header', 'nav', 'main', 'video', 'canvas', 'svg', 'path'].includes(tag)) return false

  const rect = el.getBoundingClientRect()
  // Must have visible geometry and item-like dimensions
  if (rect.width < 14 || rect.width > 140 || rect.height < 14 || rect.height > 160) return false

  // Filter out follow badge under avatar
  if (el.textContent?.trim() === '+' || el.getAttribute('aria-label')?.includes('follow')) {
    if (avatarEl !== null) {
      const aRect = avatarEl.getBoundingClientRect()
      if (rect.top >= aRect.bottom - 4) return false
    }
  }

  return true
}

/**
 * Scan the document and displace any external rival icons overlapping or situated
 * in the zone above the avatar so they sit neatly above our ghost trigger with generous spacing.
 *
 * @param doc The document
 * @param ourPlacement The resolved position of our ghost trigger
 * @param avatarElement The detected author avatar element
 * @param ourHostId Host ID of OmniMux trigger layer
 * @returns List of displaced elements
 */
export function resolveIconConflicts(
  doc: Document,
  ourPlacement: { left: number; top: number; width: number; height: number },
  avatarElement: Element | null,
  ourHostId: string = 'dsh-browser-tiktok-scene',
): HTMLElement[] {
  const ourBox: Box = {
    left: ourPlacement.left,
    right: ourPlacement.left + ourPlacement.width,
    top: ourPlacement.top,
    bottom: ourPlacement.top + ourPlacement.height,
    width: ourPlacement.width,
    height: ourPlacement.height,
  }

  const actionBar = avatarElement?.closest('section[class*="ActionBarContainer"], [class*="ActionBarContainer"], [class*="action-bar"]')

  // 1. Gather all candidates in the action bar, custom elements, or floating nearby
  const candidates: HTMLElement[] = []
  const checked = new Set<HTMLElement>()

  // A. Check siblings inside the action bar container if present
  if (actionBar) {
    for (const child of Array.from(actionBar.querySelectorAll<HTMLElement>('*'))) {
      if (checked.has(child)) continue
      checked.add(child)
      if (isRivalCandidate(child, avatarElement, ourHostId)) {
        candidates.push(child)
      }
    }
  }

  // B. Check custom extension tags (like plasmo-csui) and common button/item selectors
  const commonSelectors = 'plasmo-csui, button, [role="button"], a, [class*="action"], [class*="icon"], [class*="btn"], [class*="download"], [class*="extension"], [id*="extension"], [id*="tiktok"], [class*="creat" i]'
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(commonSelectors))) {
    if (checked.has(el)) continue
    checked.add(el)
    if (isRivalCandidate(el, avatarElement, ourHostId)) {
      candidates.push(el)
    }
  }

  // C. Map candidates to their topmost compact target container
  const targetMap = new Map<HTMLElement, Box>()
  for (const cand of candidates) {
    const target = findDisplaceableTarget(cand, actionBar ?? null)
    if (!targetMap.has(target)) {
      targetMap.set(target, getBaseRect(target))
    }
  }

  // 2. Filter targets situated on the same vertical corridor above the avatar
  const corridorRivals: Array<{ el: HTMLElement; base: Box }> = []
  const avatarTop = avatarElement ? getBaseRect(avatarElement as HTMLElement).top : ourBox.bottom + SAFE_GAP

  for (const [el, base] of targetMap.entries()) {
    // Horizontal alignment check: centers must be close or horizontally overlapping
    const xOverlap = base.left < ourBox.right + 30 && base.right > ourBox.left - 30
    if (!xOverlap) continue

    // Target must sit above the avatar
    if (base.top < avatarTop) {
      corridorRivals.push({ el, base })
    }
  }

  if (corridorRivals.length === 0) {
    return []
  }

  // 3. Sort rivals from bottom to top (closest to avatar / ghost trigger first)
  corridorRivals.sort((a, b) => b.base.bottom - a.base.bottom)

  // 4. Cascade displacement: first rival must end at least SAFE_GAP above our ghost trigger top
  let currentCeiling = ourBox.top - SAFE_GAP
  const displaced: HTMLElement[] = []

  for (const { el, base } of corridorRivals) {
    if (base.bottom > currentCeiling) {
      const shift = base.bottom - currentCeiling
      if (!el.hasAttribute(ORIGINAL_TRANSFORM_ATTR)) {
        el.setAttribute(ORIGINAL_TRANSFORM_ATTR, el.style.transform || '')
      }
      el.setAttribute(SHIFT_ATTR, String(shift))
      el.style.setProperty('transform', `translateY(-${shift}px)`, 'important')
      el.style.setProperty('transition', 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)', 'important')
      displaced.push(el)

      // Update ceiling for the next item above this one
      const newTop = base.top - shift
      currentCeiling = newTop - SAFE_GAP
    }
  }

  return displaced
}

/**
 * Restore all displaced elements to their original styling.
 */
export function restoreDisplacedIcons(doc: Document): void {
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(`[${SHIFT_ATTR}]`))) {
    const orig = el.getAttribute(ORIGINAL_TRANSFORM_ATTR) ?? ''
    if (orig) {
      el.style.transform = orig
    } else {
      el.style.removeProperty('transform')
    }
    el.style.removeProperty('transition')
    el.removeAttribute(SHIFT_ATTR)
    el.removeAttribute(ORIGINAL_TRANSFORM_ATTR)
  }
}
