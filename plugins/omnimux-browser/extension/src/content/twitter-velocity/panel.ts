import { formatMetricNumber } from './algorithm.ts'
import type { TweetVelocityData } from './types.ts'
import { fillHostInput } from '../dom-fill.ts'

let activePanel: HTMLElement | null = null

export function closeActivePanel(): void {
  if (activePanel) {
    activePanel.hidden = true
    activePanel = null
  }
}

const handleDocClick = (e: MouseEvent): void => {
  const target = e.target as HTMLElement | null
  if (!target?.closest('.omnimux-velocity-panel') && !target?.closest('.omnimux-velocity-badge')) {
    closeActivePanel()
  }
}

const handleWindowScroll = (): void => {
  closeActivePanel()
}

document.addEventListener('click', handleDocClick)
window.addEventListener('scroll', handleWindowScroll, { passive: true })

export function unsubscribeVelocityListeners(): void {
  document.removeEventListener('click', handleDocClick)
  window.removeEventListener('scroll', handleWindowScroll)
}

export function showVelocityPanel(badgeEl: HTMLElement, data: TweetVelocityData, tweetEl: HTMLElement): void {
  let panel = document.getElementById('omnimux-velocity-panel')
  if (!panel) {
    panel = document.createElement('div')
    panel.id = 'omnimux-velocity-panel'
    panel.className = 'omnimux-velocity-panel'
    document.body.appendChild(panel)
  }

  const tierLabel = data.tier === 'viral' ? '爆款' : data.tier === 'surging' ? '飙升' : '正常'
  const tagColor = data.tier === 'viral' ? '#c084fc' : data.tier === 'surging' ? '#fb923c' : '#94a3b8'
  const paceStr = `${formatMetricNumber(data.pace)}/h`
  const viewsStr = formatMetricNumber(data.views)
  const hoursStr = data.hoursAlive >= 24
    ? `${(data.hoursAlive / 24).toFixed(1).replace(/\.0$/, '')}天前`
    : `${data.hoursAlive.toFixed(data.hoursAlive >= 10 ? 0 : 1).replace(/\.0$/, '')}小时前`

  panel.innerHTML = `
    <div class="omnimux-velocity-panel__header">
      <div class="omnimux-velocity-panel__title">推特爆速指标</div>
      <div class="omnimux-velocity-panel__tag" style="color:${tagColor}; background:${tagColor}22;">${tierLabel}</div>
    </div>
    <div class="omnimux-velocity-panel__metric">
      <div class="omnimux-velocity-panel__pace">${paceStr}</div>
      <div class="omnimux-velocity-panel__meta">· 浏览 ${viewsStr} · ${hoursStr}</div>
    </div>
    <div class="omnimux-velocity-panel__exposure-box">
      <span class="omnimux-velocity-panel__exposure-label">抢评预估截流曝光</span>
      <span class="omnimux-velocity-panel__exposure-val">${data.predictedExposure.toLocaleString()} 次</span>
    </div>
    <div class="omnimux-velocity-panel__actions">
      <button type="button" class="omnimux-velocity-btn omnimux-velocity-btn--primary" id="omnimux-velocity-comment-btn">
        一键抢评
      </button>
      <button type="button" class="omnimux-velocity-btn omnimux-velocity-btn--secondary" id="omnimux-velocity-quote-btn">
        引用转发
      </button>
    </div>
  `

  // Position panel relative to badge
  const rect = badgeEl.getBoundingClientRect()
  panel.style.top = `${Math.min(window.innerHeight - 200, rect.bottom + 6)}px`
  panel.style.left = `${Math.max(12, Math.min(window.innerWidth - 280, rect.right - 260))}px`
  panel.hidden = false
  activePanel = panel

  // Bind Actions
  const commentBtn = panel.querySelector('#omnimux-velocity-comment-btn')
  commentBtn?.addEventListener('click', async (e) => {
    e.stopPropagation()
    closeActivePanel()
    await handleOneClickComment(tweetEl, data)
  })

  const quoteBtn = panel.querySelector('#omnimux-velocity-quote-btn')
  quoteBtn?.addEventListener('click', async (e) => {
    e.stopPropagation()
    closeActivePanel()
    await handleQuoteTweet(tweetEl, data)
  })
}

async function handleOneClickComment(tweetEl: HTMLElement, _data: TweetVelocityData): Promise<void> {
  // 1. Trigger reply button if reply box is not open
  const replyBtn = tweetEl.querySelector('button[data-testid="reply"], div[data-testid="reply"]') as HTMLElement | null
  if (replyBtn) {
    replyBtn.click()
  }

  // 2. Wait for tweet textbox to appear
  await new Promise((r) => setTimeout(r, 400))

  // 3. Draft high quality comment
  const highQualityReplies = [
    `非常有洞察！特别是从增速与长尾效应的角度看，数据反馈很真实。`,
    `核心逻辑很扎实。这类热点往往在起爆初期最关键，补充一个视角：前排互动带来的截流增量相当可观。`,
    `值得深入思考！赞同这个判断，执行细节上节奏把控确实是关键点。`,
  ]
  const chosen = highQualityReplies[Math.floor(Math.random() * highQualityReplies.length)]

  // 4. Fill into tweet textbox
  await fillHostInput(chosen, 'twitter')
}

async function handleQuoteTweet(tweetEl: HTMLElement, _data: TweetVelocityData): Promise<void> {
  const retweetBtn = tweetEl.querySelector('button[data-testid="retweet"], div[data-testid="retweet"]') as HTMLElement | null
  if (retweetBtn) {
    retweetBtn.click()
  }
}
