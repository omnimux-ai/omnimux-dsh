/**
 * Twitter Copilot Native Module Entrypoint
 */

import { mountCopilotToTwitterButtons } from './anchor.ts'
import './styles.css'

export function isTwitterHost(): boolean {
  const host = window.location.hostname
  return host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')
}

export function initTwitterCopilot(): void {
  if (!isTwitterHost()) return

  // Initial scan
  mountCopilotToTwitterButtons()

  // Observe SPA route transitions and popup composer modals
  let debounceTimer: number | null = null
  const observer = new MutationObserver(() => {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null
      mountCopilotToTwitterButtons()
    }, 150)
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}
