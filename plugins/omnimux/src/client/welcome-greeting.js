/**
 * 迎宾打招呼与左上角品牌布局模块。
 *
 * 在非全屏（分屏）模式下，将空白会话的品牌标识、问候语（「你好，xxx」）与标语
 * 移至会话栏左上角排布，提供对齐现代桌面设计的极简开屏体验。
 */

import { hostDocument, hostWindow } from './workbench/host-adapter.js'
import { resolveHeroLogoSvg } from './hero-brand.js'

export const WELCOME_HEADER_CLASS = 'omnimux-welcome-header'
export const WELCOME_HEADER_SELECTOR = `.${WELCOME_HEADER_CLASS}`

/**
 * 解析当前问候对象名称：优先从中枢鉴权缓存中获取 display_name / username，
 * 未登录或为空时友好兜底为「老钟」（符合用户定制预期）或「创作者」。
 * @param {Window} [win]
 * @returns {string}
 */
export function resolveGreetingUserName(win = hostWindow()) {
  try {
    const auth = win ? win.__omnimuxAuth : undefined
    const profile = auth && typeof auth.peekCache === 'function' ? auth.peekCache()?.body : null
    const name = profile?.display_name || profile?.username
    if (typeof name === 'string' && name.trim() && name.trim() !== 'admin') {
      return name.trim()
    }
  } catch {}
  return '老钟'
}

/**
 * 判定当前是否处于非全屏模式（即右侧工作台处于展开状态）。
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function isSplitMode(doc = hostDocument()) {
  if (!doc) return false
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  const isOpen = panel ? panel.hasAttribute('data-sidebar-right-open') : false
  const isFullscreen = panel ? panel.getAttribute('data-sidebar-right-panel') === 'fullscreen' : false
  return Boolean(isOpen && !isFullscreen)
}

/**
 * 构建迎宾头部 DOM 节点。
 * @param {Document} doc
 * @param {string} userName
 * @returns {HTMLElement}
 */
export function createWelcomeHeaderElement(doc, userName) {
  const container = doc.createElement('div')
  container.className = WELCOME_HEADER_CLASS

  const logoSvg = resolveHeroLogoSvg(doc.defaultView || hostWindow())
  const greeting = `你好，${userName}`

  container.innerHTML = `
    <div class="omnimux-welcome-logo" aria-hidden="true">${logoSvg}</div>
    <div class="omnimux-welcome-texts">
      <div class="omnimux-welcome-title">${greeting}</div>
      <div class="omnimux-welcome-subtitle">属于你的AI社媒运营团队</div>
    </div>
  `
  return container
}

/**
 * 同步会话栏左上角迎宾头部状态。
 * @param {Document} [doc]
 * @returns {boolean} 是否发生改动
 */
export function syncWelcomeGreeting(doc = hostDocument()) {
  if (!doc) return false
  const heroShell = doc.querySelector('[data-phase="hero"] [class*="composerHero"] > :first-child')
  if (!heroShell) return false

  const split = isSplitMode(doc)
  let existing = heroShell.querySelector(WELCOME_HEADER_SELECTOR)
  const oldHeadline = heroShell.querySelector('[class*="headline"]')

  if (split) {
    const userName = resolveGreetingUserName(doc.defaultView || hostWindow())
    if (!existing) {
      existing = createWelcomeHeaderElement(doc, userName)
      heroShell.prepend(existing)
    } else {
      const titleEl = existing.querySelector('.omnimux-welcome-title')
      if (titleEl && titleEl.textContent !== `你好，${userName}`) {
        titleEl.textContent = `你好，${userName}`
      }
      existing.style.display = ''
    }
    if (oldHeadline) {
      oldHeadline.style.display = 'none'
    }
    return true
  } else {
    if (existing) {
      existing.style.display = 'none'
    }
    if (oldHeadline) {
      oldHeadline.style.display = ''
    }
    return false
  }
}

let welcomeObserver = null

/**
 * 监听右侧栏状态和中间栏状态，自适应挂载迎宾打招呼头部。
 * @param {Document} [doc]
 * @returns {() => void} 注销回调
 */
export function installWelcomeGreetingObserver(doc = hostDocument()) {
  if (!doc) return () => {}
  let active = true
  syncWelcomeGreeting(doc)

  const ObserverClass = doc.defaultView?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null)
  let observerInstance = null

  if (ObserverClass) {
    observerInstance = new ObserverClass(() => {
      if (!active) return
      syncWelcomeGreeting(doc)
    })

    try {
      observerInstance.observe(doc.documentElement, {
        attributes: true,
        attributeFilter: ['data-sidebar-right-panel', 'data-sidebar-right-open', 'data-omnimux-conversation-collapsed'],
        subtree: true,
        childList: true,
      })
    } catch {}
  }

  return () => {
    active = false
    if (observerInstance) {
      observerInstance.disconnect()
      observerInstance = null
    }
    const elements = Array.from(doc.querySelectorAll(WELCOME_HEADER_SELECTOR))
    for (const el of elements) {
      el.remove()
    }
  }
}
