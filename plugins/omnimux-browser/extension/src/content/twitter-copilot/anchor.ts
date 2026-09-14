/**
 * Twitter Copilot Anchor Injector
 * Finds Twitter's native post & reply buttons and mounts the OmniMux Copilot icon
 * strictly on the right side of the post/reply button, aligned with and accompanying any competitor icon.
 */

import { detectTwitterScene } from './extractor.ts'
import { toggleCopilotMenu } from './menu.ts'

const COPILOT_ATTACHED_ATTR = 'data-omnimux-copilot'

/**
 * OmniMux Official Brand Ghost IP (verbatim from media-hover/overlay-icons.ts)
 */
const GHOST_ICON_SVG = `
<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" stroke="none" aria-hidden="true" focusable="false">
  <path d="M11.6666 0.0318c-0.3531 0.1143 -0.4928 0.4573 -0.3938 0.9653c0.1626 0.8155 -0.0813 1.5877 -0.6757 2.1618c-0.315 0.3023 -0.6325 0.4852 -1.448 0.8383c-1.697 0.7316 -2.8808 1.5979 -3.869 2.835c-0.9806 1.2219 -1.6233 2.6775 -1.8951 4.2907c-0.1067 0.6427 -0.1372 1.0924 -0.1194 1.8494c0.0178 0.8536 0.0457 1.0644 0.348 2.6953c0.2591 1.3972 0.2185 2.4845 -0.1219 3.2085c-0.1575 0.3379 -0.3023 0.5386 -0.6529 0.9069c-0.3226 0.3404 -0.4623 0.5208 -0.5716 0.7367c-0.2871 0.5614 -0.2108 1.1559 0.2032 1.608c0.1956 0.2134 0.4141 0.3556 0.6732 0.442c0.1753 0.0584 0.2464 0.0686 0.5208 0.0686c0.4725 0.0025 0.63 -0.0508 1.2854 -0.4319c0.3861 -0.2236 0.5284 -0.2718 0.7977 -0.2744c0.1905 -0.0025 0.2312 0.0076 0.3556 0.0711c0.2032 0.1067 0.4192 0.3429 0.6071 0.6656c0.4649 0.7977 0.7316 1.0593 1.2676 1.2499c0.1753 0.061 0.2312 0.0686 0.5386 0.0686c0.3709 -0.0025 0.4979 -0.0279 0.8078 -0.1677c0.282 -0.127 0.5157 -0.3048 0.9349 -0.7113c0.4395 -0.4242 0.63 -0.5767 0.9196 -0.7189c0.4801 -0.2413 1.0669 -0.2591 1.5725 -0.0483c0.2794 0.1194 0.5284 0.3074 0.9857 0.7443c0.4573 0.4369 0.7291 0.6376 1.0263 0.7621c0.3861 0.1575 0.8459 0.1981 1.1965 0.0991c0.5513 -0.1524 0.8764 -0.4598 1.3743 -1.3032c0.1981 -0.3379 0.3963 -0.5487 0.597 -0.6427c0.127 -0.0584 0.1829 -0.0686 0.3658 -0.0686c0.2591 0.0025 0.3887 0.0457 0.7367 0.254c0.7367 0.4395 1.1813 0.5462 1.7249 0.4166c0.2921 -0.0711 0.4903 -0.1804 0.7011 -0.3938c0.3633 -0.3633 0.5132 -0.8459 0.409 -1.3286c-0.0788 -0.3734 -0.2236 -0.6021 -0.6961 -1.1025c-0.1677 -0.1778 -0.3582 -0.3963 -0.4217 -0.4877c-0.1702 -0.2363 -0.3379 -0.6097 -0.4293 -0.9501c-0.0788 -0.2972 -0.0788 -0.2998 -0.0788 -0.9704c-0.0025 -0.7469 0.0229 -1.0111 0.1778 -1.8164c0.094 -0.4903 0.2134 -1.2499 0.2693 -1.702c0.0203 -0.1804 0.033 -0.5792 0.033 -1.1305c-0.0025 -0.9044 -0.0152 -1.0695 -0.155 -1.8291c-0.4928 -2.6979 -2.106 -4.974 -4.4532 -6.2899c-0.5843 -0.3277 -0.6808 -0.4623 -0.7926 -1.1203c-0.0737 -0.4344 -0.1524 -0.7062 -0.3023 -1.0187c-0.5055 -1.0593 -1.5471 -2.0323 -2.6033 -2.4334c-0.5157 -0.1956 -0.7697 -0.2464 -1.3972 -0.2744c-0.7875 -0.033 -1.0695 0.0127 -1.7579 0.2845c-0.8713 0.3429 -1.4988 0.8104 -1.8951 1.4175c-0.2108 0.3252 -0.2947 0.5487 -0.3887 1.0263c-0.0762 0.3887 -0.1702 0.6275 -0.4039 1.0593c-0.2312 0.4319 -0.3861 0.6071 -0.7748 0.884c-0.6554 0.4725 -1.3337 0.5487 -2.1034 0.2312c-0.4954 -0.2032 -0.7646 -0.4496 -1.1254 -1.0162c-0.4573 -0.7189 -0.6402 -1.4937 -0.5462 -2.3397c0.0762 -0.6757 0.348 -1.3998 0.7773 -2.0729c0.3582 -0.5639 0.6986 -0.9577 1.2549 -1.4429c0.6605 -0.5741 0.9857 -1.006 1.0721 -1.4175c0.0508 -0.2388 0.0406 -0.5894 -0.0279 -0.8738c-0.0889 -0.3658 -0.2744 -0.6782 -0.5513 -0.9272c-0.3429 -0.3074 -0.6782 -0.4192 -1.1356 -0.3709c-0.2489 0.0254 -0.4496 0.1067 -0.6858 0.282c-0.3023 0.2236 -0.5284 0.4877 -0.8002 0.94c-0.4725 0.7875 -0.8434 1.1356 -1.4886 1.3972c-0.4776 0.1931 -1.1534 0.16 -1.5877 -0.0762c-0.5411 -0.2972 -0.9552 -0.8713 -1.1407 -1.5801c-0.0813 -0.315 -0.0762 -1.0492 0.0076 -1.3946c0.1473 -0.6122 0.4776 -1.2499 0.9171 -1.7655c0.3811 -0.4496 0.8408 -0.8358 1.4581 -1.2295c0.7595 -0.4852 1.3844 -1.0746 1.7655 -1.6587c0.315 -0.4801 0.4395 -0.8306 0.4725 -1.3083c0.0559 -0.7977 -0.2388 -1.448 -0.8459 -1.8696c-0.2972 -0.2058 -0.5462 -0.2769 -0.9297 -0.2642c-0.3709 0.0127 -0.5843 0.0788 -0.8687 0.2693c-0.3988 0.2667 -0.6808 0.6351 -1.0187 1.3438c-0.3684 0.7672 -0.6656 1.1458 -1.1534 1.4581c-0.4801 0.3074 -1.0924 0.3938 -1.6258 0.2261c-0.785 -0.2489 -1.4023 -0.9323 -1.615 -1.7858c-0.1042 -0.4192 -0.1016 -1.1838 0.0051 -1.5699c0.1346 -0.4903 0.3912 -1.0035 0.7418 -1.4886c0.4192 -0.5792 1.0593 -1.2193 1.8341 -1.8341c0.7291 -0.5767 1.1838 -1.0974 1.4277 -1.6434c0.2337 -0.5284 0.2489 -1.0441 0.0457 -1.5547c-0.1651 -0.4141 -0.4852 -0.7393 -0.912 -0.9272c-0.3988 -0.1753 -0.8992 -0.1651 -1.3032 0.0279c-0.4573 0.2185 -0.7926 0.6198 -1.1559 1.387c-0.3023 0.6376 -0.5258 0.9704 -0.8713 1.2854c-0.536 0.4852 -1.2295 0.5843 -1.8215 0.2617c-0.5639 -0.3074 -0.9857 -0.9069 -1.1356 -1.608c-0.0914 -0.4268 -0.0686 -1.1736 0.0457 -1.5496c0.2185 -0.7265 0.6402 -1.4328 1.1965 -2.0169c0.3988 -0.4192 0.9932 -0.9171 1.4937 -1.2523c0.4674 -0.3125 0.8129 -0.6656 1.0746 -1.0974c0.3684 -0.6097 0.4496 -1.1559 0.2566 -1.7223c-0.1905 -0.5563 -0.6351 -0.9755 -1.2015 -1.1381c-0.5487 -0.1575 -1.1381 -0.0381 -1.608 0.3226c-0.4446 0.3404 -0.7646 0.8155 -1.1761 1.7427c-0.2286 0.5157 -0.4293 0.8358 -0.7239 1.1508c-0.5462 0.5868 -1.2828 0.7418 -1.956 0.4115c-0.5284 -0.2591 -0.9196 -0.7773 -1.0949 -1.4429c-0.1067 -0.4039 -0.0965 -1.1838 0.0229 -1.5674c0.1473 -0.4725 0.4268 -1.0085 0.7748 -1.4886c0.4674 -0.6453 1.0974 -1.3312 1.7655 -1.9179c0.5106 -0.4496 0.8713 -0.8713 1.1331 -1.3286c0.2794 -0.4877 0.348 -0.94 0.2236 -1.4581c-0.1423 -0.597 -0.5665 -1.0542 -1.1381 -1.2295c-0.536 -0.1651 -1.1152 -0.0635 -1.5649 0.2744c-0.4674 0.3531 -0.7875 0.8256 -1.2397 1.8341c-0.1804 0.4039 -0.3734 0.7062 -0.6402 1.0035c-0.5538 0.6198 -1.3591 0.7824 -2.0628 0.4166c-0.6224 -0.3226 -1.0289 -0.9171 -1.166 -1.702c-0.0559 -0.32 -0.0534 -1.0365 0.0051 -1.3642c0.0889 -0.4928 0.3023 -1.0746 0.5843 -1.615c0.3506 -0.6681 0.8814 -1.3718 1.4962 -1.9841c0.4776 -0.4751 0.94 -0.8383 1.5471 -1.2219c0.5132 -0.3252 0.8662 -0.7011 1.0721 -1.1407c0.2363 -0.5055 0.2464 -1.0365 0.033 -1.5445c-0.1702 -0.409 -0.4903 -0.7265 -0.9145 -0.9069c-0.4496 -0.1905 -0.9704 -0.1677 -1.4124 0.061c-0.4725 0.2464 -0.8256 0.6935 -1.2499 1.5775c-0.2032 0.4242 -0.4065 0.7265 -0.6884 1.0212c-0.6071 0.6351 -1.4581 0.7748 -2.1949 0.3607c-0.597 -0.3353 -0.9932 -0.9171 -1.1356 -1.6715c-0.0508 -0.2718 -0.0483 -1.0314 0.0051 -1.3616c0.0914 -0.5639 0.3277 -1.2193 0.6707 -1.8621c0.3582 -0.6732 0.8713 -1.3667 1.4728 -1.9892c0.5639 -0.5843 1.0567 -0.9704 1.7045 -1.3388c0.4141 -0.2363 0.6732 -0.4751 0.8865 -0.8179c0.32 -0.5157 0.3811 -1.0416 0.1931 -1.5725c-0.16 -0.4522 -0.5081 -0.8002 -0.9653 -0.9677c-0.4573 -0.1677 -0.978 -0.1194 -1.4277 0.1346c-0.4776 0.2718 -0.8561 0.7773 -1.2904 1.7275c-0.1651 0.3607 -0.3404 0.6275 -0.5843 0.8891c-0.5487 0.5868 -1.2676 0.7875 -1.9483 0.5436c-0.6122 -0.2185 -1.0797 -0.7443 -1.2828 -1.4404c-0.0991 -0.3404 -0.1143 -1.0542 -0.033 -1.3998c0.0914 -0.3887 0.315 -0.9857 0.5487 -1.4683c0.4014 -0.8282 0.9577 -1.5877 1.6383 -2.2479c0.4852 -0.47 1.0187 -0.8484 1.7529 -1.2447c0.4573 -0.2464 0.7342 -0.5157 0.945 -0.912c0.282 -0.5284 0.2972 -1.0669 0.0457 -1.5877c-0.1702 -0.3531 -0.4547 -0.63 -0.8408 -0.8179c-0.5639 -0.2744 -1.2727 -0.1753 -1.7453 0.2413c-0.4268 0.3759 -0.7494 0.8891 -1.1432 1.8316c-0.155 0.3709 -0.3379 0.6554 -0.6071 0.9475c-0.5513 0.597 -1.2981 0.7875 -1.9892 0.5106c-0.5741 -0.2286 -1.0111 -0.7316 -1.2219 -1.4074c-0.0914 -0.2921 -0.0991 -1.0873 -0.0152 -1.4175c0.1626 -0.6402 0.536 -1.4251 1.0263 -2.1466c0.4065 -0.5995 1.0492 -1.3057 1.6892 -1.8544c0.5589 -0.4776 1.0746 -0.8052 1.7832 -1.1356c0.4192 -0.1956 0.6782 -0.4065 0.884 -0.7189c0.3429 -0.5208 0.3734 -1.0924 0.0914 -1.6511c-0.188 -0.3709 -0.4903 -0.6402 -0.9095 -0.8052c-0.4903 -0.1931 -1.0822 -0.127 -1.5471 0.1702c-0.4242 0.2718 -0.7621 0.7062 -1.2295 1.6029c-0.1804 0.3455 -0.3556 0.5894 -0.5995 0.8358c-0.5919 0.597 -1.4098 0.7672 -2.1135 0.442c-0.5792 -0.2693 -0.9984 -0.8256 -1.1534 -1.5297c-0.0508 -0.2312 -0.0483 -1.0467 0.0051 -1.3514c0.1473 -0.8358 0.6071 -1.8215 1.161 -2.4845c0.4293 -0.5132 1.0365 -1.0644 1.7045 -1.5471c0.6656 -0.4801 1.2523 -0.7951 2.0526 -1.1025c0.4065 -0.1549 0.6605 -0.348 0.8662 -0.6554c0.3582 -0.536 0.3633 -1.1482 0.0152 -1.6968c-0.2134 -0.3353 -0.5487 -0.5894 -0.9653 -0.7316c-0.5106 -0.1727 -1.0669 -0.0762 -1.5369 0.2667c-0.3785 0.2769 -0.6884 0.6858 -1.1534 1.5165c-0.1829 0.3277 -0.3582 0.5513 -0.6173 0.7875c-0.5944 0.5436 -1.4175 0.6858 -2.1262 0.3658c-0.5792 -0.2617 -0.9984 -0.8104 -1.1559 -1.5064c-0.0533 -0.2388 -0.0508 -1.0365 0.0051 -1.3413c0.1626 -0.8865 0.6858 -1.9051 1.2955 -2.5296c0.4801 -0.4928 1.1356 -1.0009 1.8416 -1.4277c0.7722 -0.4674 1.3972 -0.7418 2.3065 -1.0111c0.4065 -0.1219 0.6554 -0.2845 0.8611 -0.5639c0.3759 -0.5132 0.3988 -1.1331 0.0686 -1.6994c-0.2388 -0.409 -0.63 -0.6961 -1.0924 -0.7977c-0.3684 -0.0813 -0.7977 -0.0305 -1.1965 0.1423c-0.3658 0.1575 -0.6427 0.3938 -1.1356 0.9677c-0.3455 0.4014 -0.5284 0.5589 -0.8358 0.7291c-0.6554 0.3633 -1.4429 0.3658 -2.0907 0.0051c-0.536 -0.2997 -0.9044 -0.8408 -1.0136 -1.4886c-0.0457 -0.2718 -0.0381 -1.0441 0.0152 -1.3464c0.1702 -0.9577 0.7544 -2.0094 1.4455 -2.5976c0.5055 -0.4319 1.1965 -0.8713 1.956 -1.2422c0.884 -0.4319 1.5471 -0.6656 2.5327 -0.8992c0.3938 -0.094 0.6325 -0.2286 0.8358 -0.4725c0.3963 -0.4751 0.4446 -1.1076 0.127 -1.6816c-0.2489 -0.4496 -0.6858 -0.7469 -1.2065 -0.8179c-0.2744 -0.0381 -0.6808 0.0229 -1.0009 0.1524z"/>
</svg>
`

/**
 * Checks if an inline reply button is a stale/orphaned target.
 *
 * Rules:
 * 1. Post buttons ("发帖", "Post", dialog composer) are ALWAYS valid targets.
 * 2. Unactivated compact inline reply bars (single-line placeholder bar without expanded textarea)
 *    are FULLY VALID targets. Users expect the icon to show in both active & inactive states!
 * 3. When a card is in the EXPANDED state (contains tweetTextarea_0):
 *    Only buttons located in or accompanying the bottom media toolbar (below the textarea) are valid.
 *    Any orphaned/stale buttons in the top half or header of the expanded card are rejected.
 */
export function isStaleOrphanReplyButton(targetBtn: HTMLElement): boolean {
  const testId = targetBtn.getAttribute('data-testid') || ''
  if (!testId.includes('tweetButtonInline')) {
    return false
  }

  // 1. If it is inside a modal dialog (role="dialog"), it is always an expanded composer modal
  if (targetBtn.closest('[role="dialog"]')) {
    return false
  }

  // 2. If button explicitly says "发帖" or "Post", it's a home composer, always valid
  const btnText = (targetBtn.textContent || '').trim().toLowerCase()
  if (btnText.includes('发帖') || btnText.includes('post')) {
    return false
  }

  // 3. Find the owning composer container upwards (contains tweetTextarea_0)
  let composer: HTMLElement | null = targetBtn.parentElement
  let composerCard: HTMLElement | null = null
  for (let i = 0; i < 14 && composer && composer !== document.body; i++) {
    if (composer.querySelector('div[data-testid="tweetTextarea_0"]')) {
      composerCard = composer
      break
    }
    composer = composer.parentElement
  }

  // 4. If no expanded composer card found (no tweetTextarea_0), this is an unactivated compact bar.
  // Unactivated compact inline reply bar IS A VALID TARGET! Both inactive and active states must mount!
  if (!composerCard) {
    return false
  }

  // 5. In an expanded composer card, verify if this button is located in or accompanying the bottom toolbar.
  const isInToolbar =
    !!targetBtn.closest('[data-testid="toolBar"]') ||
    !!composerCard.querySelector('[data-testid="toolBar"]')?.contains(targetBtn) ||
    !!targetBtn.parentElement?.querySelector('[aria-label*="媒体"], [aria-label*="Media"], [aria-label*="Emoji"], [aria-label*="表情"]')

  // If inside an expanded card but NOT in the bottom toolbar, it's an orphaned/stale node (e.g. top corner residue)
  if (!isInToolbar) {
    return true
  }

  return false
}

/**
 * Backwards-compatibility alias for tests / callers.
 * Now points to the refined stale/orphan validator.
 */
export const isCollapsedInlineReply = isStaleOrphanReplyButton

/**
 * Cleans up stale, orphaned, or mislocated Copilot buttons from the DOM.
 * Enforces Card-level and Bar-level Single-instance guarantee:
 * exactly ONE copilot button per reply card or compact bar!
 */
export function cleanupStaleCopilotButtons(): void {
  const existingBtns = document.querySelectorAll<HTMLElement>(
    `.omnimux-copilot-anchor-btn, [${COPILOT_ATTACHED_ATTR}="true"]`
  )

  existingBtns.forEach((copilotBtn) => {
    const boundTarget = (copilotBtn as any).__targetBtn as HTMLElement | undefined

    // 1. If bound target is disconnected, invisible, or identified as a stale orphan
    if (boundTarget) {
      if (!boundTarget.isConnected || !isElementActionable(boundTarget) || isStaleOrphanReplyButton(boundTarget)) {
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
      (tb) => isElementActionable(tb) && !isStaleOrphanReplyButton(tb)
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

  // 5. [Card-level Single-instance Enforcement]: Enforce exactly ONE copilot button per reply card.
  // Purge any orphan/stale buttons in the upper half or top-right corner of the composer card!
  const textareas = document.querySelectorAll('div[data-testid="tweetTextarea_0"]')
  textareas.forEach((ta) => {
    let card: HTMLElement | null = ta.parentElement
    for (let i = 0; i < 14 && card && card !== document.body; i++) {
      const cardCopilots = Array.from(
        card.querySelectorAll<HTMLElement>(`.omnimux-copilot-anchor-btn, [${COPILOT_ATTACHED_ATTR}="true"]`)
      )
      if (cardCopilots.length > 1) {
        // Find bottom-most copilot button (which belongs to the bottom toolbar reply button)
        let bottomMost: HTMLElement = cardCopilots[0]
        let maxTop = -Infinity
        for (const btn of cardCopilots) {
          const rect = btn.getBoundingClientRect()
          if (rect.top > maxTop) {
            maxTop = rect.top
            bottomMost = btn
          }
        }
        // Remove all other buttons in this card (e.g. top-right corner or stale placeholder buttons)
        for (const btn of cardCopilots) {
          if (btn !== bottomMost) {
            btn.remove()
          }
        }
      }
      card = card.parentElement
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
      if (btn instanceof HTMLElement && isElementActionable(btn) && !isStaleOrphanReplyButton(btn)) {
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
 * and smoothly accompanies any competitor icon (e.g. SoPilot) on its right.
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

    if (isRowFlex) {
      rowContainer = curr
      break
    }

    branchChild = curr
    curr = curr.parentElement
  }

  // 严格限制作用域：仅在当前水平工具行内部查找紧邻同级的竞品按钮，严禁向上跨越到外层整张卡片！
  if (rowContainer) {
    sopilotBtn = rowContainer.querySelector('.ai-assistant-button') as HTMLElement | null
  }

  // If competitor button is detected, insert in its place and suppress competitor
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
