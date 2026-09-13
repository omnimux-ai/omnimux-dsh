/**
 * Twitter Copilot Anchor Injector
 * Finds Twitter's native post & reply buttons and mounts the OmniMux Copilot icon.
 */

import { detectTwitterScene } from './extractor.ts'
import { toggleCopilotMenu } from './menu.ts'

const COPILOT_ATTACHED_ATTR = 'data-omnimux-copilot'
const SPARKLE_SVG = `
<svg viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z"/>
</svg>
`

export function mountCopilotToTwitterButtons(): void {
  // Candidate target selectors for Twitter post & reply buttons
  const targetSelectors = [
    'button[data-testid="tweetButton"]',
    'button[data-testid="tweetButtonInline"]',
    'div[data-testid="tweetButton"]',
    'div[data-testid="tweetButtonInline"]',
  ]

  for (const selector of targetSelectors) {
    const buttons = document.querySelectorAll(selector)
    buttons.forEach((btn) => {
      if (btn instanceof HTMLElement && isElementActionable(btn)) {
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

function attachCopilotButton(targetBtn: HTMLElement): void {
  // Check if sibling copilot button already exists in parent
  const parent = targetBtn.parentElement
  if (!parent) return

  const existing = parent.querySelector(`[${COPILOT_ATTACHED_ATTR}="true"]`)
  if (existing) return

  // Create OmniMux Copilot Anchor Button
  const copilotBtn = document.createElement('button')
  copilotBtn.type = 'button'
  copilotBtn.setAttribute(COPILOT_ATTACHED_ATTR, 'true')
  copilotBtn.className = 'omnimux-copilot-anchor-btn'
  copilotBtn.title = 'OmniMux 推特就地助手'
  copilotBtn.setAttribute('aria-label', 'OmniMux 推特就地助手')
  copilotBtn.innerHTML = SPARKLE_SVG

  copilotBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    const scene = detectTwitterScene(targetBtn)
    toggleCopilotMenu(copilotBtn, scene)
  })

  // Insert immediately after targetBtn
  if (targetBtn.nextSibling) {
    parent.insertBefore(copilotBtn, targetBtn.nextSibling)
  } else {
    parent.appendChild(copilotBtn)
  }
}
