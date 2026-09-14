import { mountTweetBadge } from './badge.ts'
import { FEATURE_FLAG, readFlag, readFlagSync, subscribeFlag } from '../../feature-flags.ts'
import './styles.css'

export function isTwitterHost(): boolean {
  const host = window.location.hostname
  return host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')
}

/** 移除页面上已挂载的角标与其宿主节点（关闭开关时立即生效）。 */
function removeMountedBadges(): void {
  document.querySelectorAll('.omnimux-velocity-host').forEach((host) => host.remove())
  document.querySelectorAll('article[data-testid="tweet"]').forEach((tweet) => {
    tweet.removeAttribute('data-omnimux-velocity-attached')
  })
}

export function initTwitterVelocity(): void {
  if (!isTwitterHost()) return

  let enabled = readFlagSync(FEATURE_FLAG.velocity)

  function scanAndMount(): void {
    if (!enabled) return
    const tweets = document.querySelectorAll('article[data-testid="tweet"]')
    tweets.forEach((tweet) => {
      if (tweet instanceof HTMLElement) {
        mountTweetBadge(tweet)
      }
    })
  }

  // Initial scan（开关关闭时不挂载）
  scanAndMount()

  // Observe page feed mutations
  let timer: number | null = null
  const observer = new MutationObserver(() => {
    if (!enabled) return
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

  // 设置面板开关：关闭即移除并停止挂载，打开即重新扫描
  subscribeFlag(FEATURE_FLAG.velocity, (next) => {
    enabled = next
    if (enabled) {
      scanAndMount()
    } else {
      removeMountedBadges()
    }
  })

  // 首次加载以 chrome.storage 为准：内容脚本的 localStorage 属于页面，镜像读不到面板的写入
  void readFlag(FEATURE_FLAG.velocity).then((next) => {
    if (next === enabled) return
    enabled = next
    if (enabled) {
      scanAndMount()
    } else {
      removeMountedBadges()
    }
  })
}
