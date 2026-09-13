import { formatMetricNumber } from './algorithm.ts'
import { extractTweetVelocityData } from './extractor.ts'
import { showVelocityPanel } from './panel.ts'

const ATTACHED_ATTR = 'data-omnimux-velocity-attached'

export function mountTweetBadge(tweetEl: HTMLElement): void {
  if (tweetEl.getAttribute(ATTACHED_ATTR)) {
    return
  }

  const data = extractTweetVelocityData(tweetEl)
  if (!data) return

  tweetEl.setAttribute(ATTACHED_ATTR, '1')

  const host = document.createElement('div')
  host.className = 'omnimux-velocity-host'

  const tierClass = `omnimux-velocity-badge--${data.tier}`
  const prefix = data.tier === 'viral' ? '爆款 ' : data.tier === 'surging' ? '飙升 ' : ''
  const paceStr = `${formatMetricNumber(data.pace)}/h`

  const badge = document.createElement('button')
  badge.type = 'button'
  badge.className = `omnimux-velocity-badge ${tierClass}`
  badge.innerHTML = `<span>${prefix}${paceStr}</span>`
  badge.title = `推特爆速指标 · ${prefix || '时速 '}${paceStr} (点击查看曝光预测与一键抢评)`

  badge.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    // Re-extract fresh metrics at click time
    const freshData = extractTweetVelocityData(tweetEl) || data
    showVelocityPanel(badge, freshData, tweetEl)
  })

  host.appendChild(badge)

  // Avoid overlapping Grok button if present, strictly maintain 8px gap
  const grokBtn = tweetEl.querySelector('button[aria-label*="Grok"], button[aria-label*="grok"], [aria-label*="Grok"]')
  if (grokBtn instanceof HTMLElement) {
    const tweetRect = tweetEl.getBoundingClientRect()
    const grokRect = grokBtn.getBoundingClientRect()
    if (tweetRect.width > 0 && grokRect.width > 0) {
      const grokLeftFromRight = tweetRect.right - grokRect.left
      host.style.right = `${Math.round(grokLeftFromRight + 8)}px`
      const grokTopFromTweet = grokRect.top - tweetRect.top
      host.style.top = `${Math.round(grokTopFromTweet)}px`
    }
  } else {
    const moreBtn = tweetEl.querySelector('button[data-testid="caret"]')
    if (moreBtn instanceof HTMLElement) {
      const tweetRect = tweetEl.getBoundingClientRect()
      const moreRect = moreBtn.getBoundingClientRect()
      if (tweetRect.width > 0 && moreRect.width > 0) {
        const moreLeftFromRight = tweetRect.right - moreRect.left
        host.style.right = `${Math.round(moreLeftFromRight + 8)}px`
        const moreTopFromTweet = moreRect.top - tweetRect.top
        host.style.top = `${Math.round(moreTopFromTweet)}px`
      }
    }
  }

  // Position relative to tweet
  const originalPos = window.getComputedStyle(tweetEl).position
  if (originalPos === 'static') {
    tweetEl.style.position = 'relative'
  }

  tweetEl.appendChild(host)
}
