import { mountTweetBadge } from './badge.ts'
import './styles.css'

export function isTwitterHost(): boolean {
  const host = window.location.hostname
  return host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')
}

export function initTwitterVelocity(): void {
  if (!isTwitterHost()) return

  function scanAndMount(): void {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]')
    tweets.forEach((tweet) => {
      if (tweet instanceof HTMLElement) {
        mountTweetBadge(tweet)
      }
    })
  }

  // Initial scan
  scanAndMount()

  // Observe page feed mutations
  let timer: number | null = null
  const observer = new MutationObserver(() => {
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = null
      scanAndMount()
    }, 150)
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}
