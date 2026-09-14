/**
 * Twitter Copilot Anchor Injector
 * Finds Twitter's native post & reply buttons and mounts the OmniMux Copilot icon
 * strictly on the right side of the post/reply button, aligned with and overlaying any competitor icon.
 */

import { detectTwitterScene } from './extractor.ts'
import { toggleCopilotMenu } from './menu.ts'

const COPILOT_ATTACHED_ATTR = 'data-omnimux-copilot'

/**
 * OmniMux Official Brand Ghost IP (verbatim from media-hover/overlay-icons.ts)
 */
const GHOST_ICON_SVG = `
<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" stroke="none" aria-hidden="true" focusable="false">
  <path d="M11.6666 0.0318c-0.3531 0.1143 -0.4928 0.4573 -0.3938 0.9653c0.1626 0.8155 -0.0813 1.5877 -0.6757 2.1618c-0.315 0.3023 -0.6325 0.4852 -1.448 0.8383c-1.697 0.7316 -2.8808 1.5979 -3.869 2.835c-0.9806 1.2219 -1.6233 2.6775 -1.8951 4.2907c-0.1067 0.6427 -0.1372 1.0924 -0.1194 1.8494c0.0178 0.8536 0.0457 1.0644 0.348 2.6953c0.2591 1.3972 0.2185 2.4845 -0.1219 3.2085c-0.1575 0.3379 -0.3023 0.5386 -0.6529 0.9069c-0.3226 0.3404 -0.4623 0.5208 -0.5716 0.7367c-0.2871 0.5614 -0.2108 1.1559 0.2032 1.608c0.1956 0.2134 0.4141 0.3556 0.6732 0.442c0.1753 0.0584 0.2464 0.0686 0.5208 0.0686c0.4725 0.0025 0.63 -0.0508 1.2854 -0.4319c0.3861 -0.2236 0.5284 -0.2718 0.7977 -0.2744c0.1905 -0.0025 0.2312 0.0076 0.3556 0.0711c0.2032 0.1067 0.4192 0.3429 0.6071 0.6656c0.4649 0.7977 0.7316 1.0593 1.2676 1.2499c0.1753 0.061 0.2312 0.0686 0.5386 0.0686c0.3709 -0.0025 0.4979 -0.0279 0.8078 -0.1677c0.282 -0.127 0.5157 -0.3048 0.9349 -0.7113c0.4395 -0.4242 0.63 -0.5767 0.9196 -0.7189c0.4801 -0.2413 1.0669 -0.2591 1.5725 -0.0483c0.2794 0.1194 0.5284 0.3074 0.9857 0.7443c0.4573 0.4369 0.7291 0.6376 1.0263 0.7621c0.3861 0.1575 0.8459 0.1981 1.1965 0.0991c0.5513 -0.1524 0.8764 -0.4598 1.3743 -1.3032c0.1981 -0.3379 0.3963 -0.5487 0.597 -0.6427c0.127 -0.0584 0.1829 -0.0686 0.3658 -0.0686c0.2591 0.0025 0.3887 0.0457 0.7367 0.254c0.7367 0.4395 1.1813 0.5462 1.7249 0.4166c0.2921 -0.0711 0.4903 -0.1804 0.7011 -0.3938c0.3633 -0.3633 0.5132 -0.8459 0.409 -1.3286c-0.0788 -0.3734 -0.2236 -0.6021 -0.6961 -1.1025c-0.1677 -0.1778 -0.3582 -0.3963 -0.4217 -0.4877c-0.1702 -0.2363 -0.3379 -0.6097 -0.4293 -0.9501c-0.0788 -0.2972 -0.0788 -0.2998 -0.0788 -0.9704c-0.0025 -0.7469 0.0229 -1.0111 0.1778 -1.8164c0.094 -0.4903 0.2134 -1.2499 0.2693 -1.702c0.0203 -0.1804 0.033 -0.5792 0.033 -1.1305c-0.0025 -0.9044 -0.0152 -1.0695 -0.155 -1.8291c-0.4928 -2.6979 -2.106 -4.974 -4.4532 -6.2899c-0.5843 -0.3277 -0.6808 -0.4623 -0.7926 -1.1203c-0.0737 -0.4344 -0.1524 -0.7062 -0.3023 -1.0187c-0.5055 -1.0593 -1.5471 -2.0323 -2.5531 -2.3803c-0.249 -0.0864 -0.6198 -0.1092 -0.8002 -0.0508ZM7.4242 11.5396A0.9526 0.9526 0 0 1 9.3295 11.5396L9.3295 14.0037A0.9526 0.9526 0 0 1 7.4242 14.0037ZM14.6388 11.5396A0.9526 0.9526 0 0 1 16.5441 11.5396L16.5441 14.0037A0.9526 0.9526 0 0 1 14.6388 14.0037Z"/>
</svg>
`

/**
 * Checks if a target button belongs to a collapsed (inactive) inline reply placeholder.
 * Twitter's inline reply bar in comment threads has two distinct states:
 * 1. Collapsed (compact placeholder bar): single-line compact bar with "Post your reply",
 *    no active editable textbox (contenteditable="true"), no bottom media toolbar, disabled reply button.
 * 2. Expanded (active composer): multi-line editable textbox (contenteditable="true"),
 *    visible toolbar with media/emoji tools, active reply button at the bottom right.
 * The Copilot icon must NEVER mount to the collapsed placeholder bar — only to the expanded toolbar!
 */
export function isCollapsedInlineReply(targetBtn: HTMLElement): boolean {
  // 1. Tweet detail or inline feed buttons: tweetButtonInline
  const testId = targetBtn.getAttribute('data-testid') || ''
  if (!testId.includes('tweetButtonInline')) {
    return false
  }

  // 2. If it is inside a modal dialog (role="dialog"), it is always an expanded composer modal
  if (targetBtn.closest('[role="dialog"]')) {
    return false
  }

  // 3. If button explicitly says "发帖" or "Post" (e.g. home feed top composer), it's not a reply placeholder
  const btnText = (targetBtn.textContent || '').trim().toLowerCase()
  if (btnText.includes('发帖') || btnText.includes('post')) {
    return false
  }

  // 4. Find the owning composer container upwards
  let composer: HTMLElement | null = targetBtn.parentElement
  let foundEditableTextbox = false
  let foundToolbar = false

  for (let i = 0; i < 12 && composer && composer !== document.body; i++) {
    // Check for active editable textbox in this composer
    const textboxes = composer.querySelectorAll<HTMLElement>(
      'div[data-testid="tweetTextarea_0"][role="textbox"], div[role="textbox"][contenteditable="true"], div[data-testid="tweetTextarea_0"]'
    )
    for (const tb of Array.from(textboxes)) {
      const isContentEditable = tb.getAttribute('contenteditable') === 'true' || tb.isContentEditable
      const rect = tb.getBoundingClientRect()
      if (isContentEditable || (rect.height > 0 && tb.textContent?.trim() !== '')) {
        foundEditableTextbox = true
        break
      }
    }

    // Check for media toolbar icons (images, gif, emoji, poll, schedule)
    const toolbar = composer.querySelector(
      '[data-testid="toolBar"], [aria-label*="Media"], [aria-label*="媒体"], [aria-label*="Emoji"], [aria-label*="GIF"], [data-testid="geoButton"]'
    )
    if (toolbar) {
      foundToolbar = true
    }

    if (foundEditableTextbox && foundToolbar) {
      return false
    }

    composer = composer.parentElement
  }

  // If there's an editable textbox and toolbar, it's expanded
  if (foundEditableTextbox && foundToolbar) {
    return false
  }

  // If it has an editable textbox and the button is active/actionable with non-trivial height
  if (foundEditableTextbox) {
    return false
  }

  // Otherwise, it's a collapsed placeholder bar (no active textbox)
  return true
}

/**
 * Cleans up stale, orphaned, or mislocated Copilot buttons from the DOM.
 * When Twitter transitions between collapsed and expanded states or re-renders DOM trees,
 * old buttons might be left behind as zombies while new buttons are mounted.
 */
export function cleanupStaleCopilotButtons(): void {
  const existingBtns = document.querySelectorAll<HTMLElement>(
    `.omnimux-copilot-anchor-btn, [${COPILOT_ATTACHED_ATTR}="true"]`
  )

  existingBtns.forEach((copilotBtn) => {
    const boundTarget = (copilotBtn as any).__targetBtn as HTMLElement | undefined

    // 1. If bound target is disconnected, invisible, or now in collapsed placeholder state
    if (boundTarget) {
      if (!boundTarget.isConnected || !isElementActionable(boundTarget) || isCollapsedInlineReply(boundTarget)) {
        copilotBtn.remove()
        return
      }
    }

    // 2. If parent container is missing or disconnected
    const parent = copilotBtn.parentElement
    if (!parent || !parent.isConnected) {
      copilotBtn.remove()
      return
    }

    // 3. If there is no valid actionable tweetButton nearby in the same toolbar row
    const nearbyButtons = parent.querySelectorAll<HTMLElement>(
      'button[data-testid="tweetButton"], button[data-testid="tweetButtonInline"], div[data-testid="tweetButton"], div[data-testid="tweetButtonInline"]'
    )
    const hasValidActiveSibling = Array.from(nearbyButtons).some(
      (tb) => isElementActionable(tb) && !isCollapsedInlineReply(tb)
    )

    if (!hasValidActiveSibling && !boundTarget?.isConnected) {
      copilotBtn.remove()
      return
    }

    // 4. Clean up duplicate buttons within the same container
    const containerCopilots = parent.querySelectorAll<HTMLElement>(
      `.omnimux-copilot-anchor-btn, [${COPILOT_ATTACHED_ATTR}="true"]`
    )
    if (containerCopilots.length > 1) {
      // Keep only the last inserted one
      for (let i = 0; i < containerCopilots.length - 1; i++) {
        containerCopilots[i].remove()
      }
    }
  })
}

export function mountCopilotToTwitterButtons(): void {
  // 1. Clean up any orphaned or stale buttons from previous state transitions
  cleanupStaleCopilotButtons()

  const targetSelectors = [
    'button[data-testid="tweetButton"]',
    'button[data-testid="tweetButtonInline"]',
    'div[data-testid="tweetButton"]',
    'div[data-testid="tweetButtonInline"]',
  ]

  for (const selector of targetSelectors) {
    const buttons = document.querySelectorAll(selector)
    buttons.forEach((btn) => {
      if (btn instanceof HTMLElement && isElementActionable(btn) && !isCollapsedInlineReply(btn)) {
        attachCopilotButton(btn)
      }
    })
  }
}

function isElementActionable(el: HTMLElement): boolean {
  if (!el.isConnected) return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/**
 * Searches upward for the nearest horizontal flex row container
 * so the copilot button stays strictly side-by-side with the Post/Reply button
 * and accurately overlays competitor icons.
 */
export function findHorizontalToolbarAnchor(targetBtn: HTMLElement): {
  container: HTMLElement
  insertBefore: Node | null
  sopilotTarget?: HTMLElement
} {
  let curr: HTMLElement | null = targetBtn
  let rowContainer: HTMLElement | null = null
  let branchChild: HTMLElement | null = targetBtn
  let sopilotBtn: HTMLElement | null = null

  while (curr && curr !== document.body) {
    const style = window.getComputedStyle(curr)
    const isRowFlex =
      (style.display === 'flex' || style.display === 'inline-flex') &&
      style.flexDirection !== 'column' &&
      style.flexDirection !== 'column-reverse'

    if (isRowFlex && !rowContainer) {
      rowContainer = curr
    }

    // Check for competitor sopilot button
    const competitor = curr.querySelector('.ai-assistant-button') as HTMLElement | null
    if (competitor && !sopilotBtn) {
      sopilotBtn = competitor
      break
    }

    if (!rowContainer) {
      branchChild = curr
    }
    curr = curr.parentElement
  }

  // If competitor button is detected, insert in its exact place or right after it with overlay elevation
  if (sopilotBtn && sopilotBtn.parentElement) {
    return {
      container: sopilotBtn.parentElement,
      insertBefore: sopilotBtn,
      sopilotTarget: sopilotBtn,
    }
  }

  // Otherwise insert into the horizontal flex toolbar right after the button branch
  if (rowContainer && branchChild) {
    return {
      container: rowContainer,
      insertBefore: branchChild.nextSibling,
    }
  }

  return {
    container: targetBtn.parentElement || document.body,
    insertBefore: targetBtn.nextSibling,
  }
}

function attachCopilotButton(targetBtn: HTMLElement): void {
  const { container, insertBefore, sopilotTarget } = findHorizontalToolbarAnchor(targetBtn)

  // Prevent duplicate insertion in the same container
  const existing = container.querySelector<HTMLElement>(`[${COPILOT_ATTACHED_ATTR}="true"]`)
  if (existing) {
    const bound = (existing as any).__targetBtn as HTMLElement | undefined
    if (bound === targetBtn) {
      return
    }
    // If previous bound target was stale/replaced, remove old button before remounting
    existing.remove()
  }

  // If competitor is present, suppress it cleanly so OmniMux occupies the primary spot
  if (sopilotTarget) {
    sopilotTarget.style.display = 'none'
  }

  // Create OmniMux Copilot Anchor Button
  const copilotBtn = document.createElement('button')
  copilotBtn.type = 'button'
  copilotBtn.setAttribute(COPILOT_ATTACHED_ATTR, 'true')
  ;(copilotBtn as any).__targetBtn = targetBtn
  copilotBtn.className = 'omnimux-copilot-anchor-btn'
  copilotBtn.title = 'OmniMux 推特就地助手'
  copilotBtn.setAttribute('aria-label', 'OmniMux 推特就地助手')
  copilotBtn.innerHTML = GHOST_ICON_SVG

  // Stop mouse/pointer event propagation to prevent Twitter outer container from auto-expanding or toggling focus
  const stopImmediate = (e: Event) => {
    e.stopPropagation()
  }
  copilotBtn.addEventListener('mousedown', stopImmediate)
  copilotBtn.addEventListener('pointerdown', stopImmediate)
  copilotBtn.addEventListener('mouseup', stopImmediate)
  copilotBtn.addEventListener('pointerup', stopImmediate)

  copilotBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    const scene = detectTwitterScene(targetBtn)
    toggleCopilotMenu(copilotBtn, scene)
  })

  if (insertBefore) {
    container.insertBefore(copilotBtn, insertBefore)
  } else {
    container.appendChild(copilotBtn)
  }
}
