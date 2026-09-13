import { formatMetricNumber } from './algorithm.ts'
import { extractTweetVelocityData } from './extractor.ts'
import { showVelocityPanel } from './panel.ts'
import type { TweetVelocityData } from './types.ts'

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

  // Position relative to tweet
  const originalPos = window.getComputedStyle(tweetEl).position
  if (originalPos === 'static') {
    tweetEl.style.position = 'relative'
  }

  tweetEl.appendChild(host)
}
