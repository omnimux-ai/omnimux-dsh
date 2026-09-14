/**
 * Twitter Copilot Menu & Generation Dispatcher
 * Strictly follows design.md: monochrome aesthetics, zero purple, full bilingual (zh/en) support.
 */

import { COPILOT_MENU_ITEMS } from './prompts.ts'
import { extractTwitterContext } from './extractor.ts'
import { injectTweetText, showCopilotToast } from './injector.ts'
import type { CopilotMenuItem, TwitterCopilotScene, TwitterContext } from './types.ts'

declare const chrome: any

let activeDropdown: HTMLElement | null = null

const GHOST_MINI_SVG = `
<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" fill-rule="evenodd" stroke="none" aria-hidden="true" focusable="false">
  <path d="M11.6666 0.0318c-0.3531 0.1143 -0.4928 0.4573 -0.3938 0.9653c0.1626 0.8155 -0.0813 1.5877 -0.6757 2.1618c-0.315 0.3023 -0.6325 0.4852 -1.448 0.8383c-1.697 0.7316 -2.8808 1.5979 -3.869 2.835c-0.9806 1.2219 -1.6233 2.6775 -1.8951 4.2907c-0.1067 0.6427 -0.1372 1.0924 -0.1194 1.8494c0.0178 0.8536 0.0457 1.0644 0.348 2.6953c0.2591 1.3972 0.2185 2.4845 -0.1219 3.2085c-0.1575 0.3379 -0.3023 0.5386 -0.6529 0.9069c-0.3226 0.3404 -0.4623 0.5208 -0.5716 0.7367c-0.2871 0.5614 -0.2108 1.1559 0.2032 1.608c0.1956 0.2134 0.4141 0.3556 0.6732 0.442c0.1753 0.0584 0.2464 0.0686 0.5208 0.0686c0.4725 0.0025 0.63 -0.0508 1.2854 -0.4319c0.3861 -0.2236 0.5284 -0.2718 0.7977 -0.2744c0.1905 -0.0025 0.2312 0.0076 0.3556 0.0711c0.2032 0.1067 0.4192 0.3429 0.6071 0.6656c0.4649 0.7977 0.7316 1.0593 1.2676 1.2499c0.1753 0.061 0.2312 0.0686 0.5386 0.0686c0.3709 -0.0025 0.4979 -0.0279 0.8078 -0.1677c0.282 -0.127 0.5157 -0.3048 0.9349 -0.7113c0.4395 -0.4242 0.63 -0.5767 0.9196 -0.7189c0.4801 -0.2413 1.0669 -0.2591 1.5725 -0.0483c0.2794 0.1194 0.5284 0.3074 0.9857 0.7443c0.4573 0.4369 0.7291 0.6376 1.0263 0.7621c0.3861 0.1575 0.8459 0.1981 1.1965 0.0991c0.5513 -0.1524 0.8764 -0.4598 1.3743 -1.3032c0.1981 -0.3379 0.3963 -0.5487 0.597 -0.6427c0.127 -0.0584 0.1829 -0.0686 0.3658 -0.0686c0.2591 0.0025 0.3887 0.0457 0.7367 0.254c0.7367 0.4395 1.1813 0.5462 1.7249 0.4166c0.2921 -0.0711 0.4903 -0.1804 0.7011 -0.3938c0.3633 -0.3633 0.5132 -0.8459 0.409 -1.3286c-0.0788 -0.3734 -0.2236 -0.6021 -0.6961 -1.1025c-0.1677 -0.1778 -0.3582 -0.3963 -0.4217 -0.4877c-0.1702 -0.2363 -0.3379 -0.6097 -0.4293 -0.9501c-0.0788 -0.2972 -0.0788 -0.2998 -0.0788 -0.9704c-0.0025 -0.7469 0.0229 -1.0111 0.1778 -1.8164c0.094 -0.4903 0.2134 -1.2499 0.2693 -1.702c0.0203 -0.1804 0.033 -0.5792 0.033 -1.1305c-0.0025 -0.9044 -0.0152 -1.0695 -0.155 -1.8291c-0.4928 -2.6979 -2.106 -4.974 -4.4532 -6.2899c-0.5843 -0.3277 -0.6808 -0.4623 -0.7926 -1.1203c-0.0737 -0.4344 -0.1524 -0.7062 -0.3023 -1.0187c-0.5055 -1.0593 -1.5471 -2.0323 -2.5531 -2.3803c-0.249 -0.0864 -0.6198 -0.1092 -0.8002 -0.0508ZM7.4242 11.5396A0.9526 0.9526 0 0 1 9.3295 11.5396L9.3295 14.0037A0.9526 0.9526 0 0 1 7.4242 14.0037ZM14.6388 11.5396A0.9526 0.9526 0 0 1 16.5441 11.5396L16.5441 14.0037A0.9526 0.9526 0 0 1 14.6388 14.0037Z"/>
</svg>
`

/**
 * Detect language:
 * 1. Primary: Twitter/X webpage language declared on <html lang="...">
 * 2. Secondary: Native Twitter button keywords ("发帖", "回复")
 * 3. Tertiary: DSH configured locale & browser language preferences (navigator.languages)
 */
export function detectCopilotLocale(): 'zh' | 'en' {
  // 1. 最高优先级：当前推特网页自身声明的语言（<html lang="zh">）
  try {
    const htmlLang = document.documentElement.lang || document.querySelector('html')?.getAttribute('lang') || ''
    if (htmlLang.toLowerCase().startsWith('zh')) {
      return 'zh'
    }
  } catch {}

  // 2. 检查推特界面是否有原生中文关键按钮特征
  try {
    const isChineseTwitter = Array.from(document.querySelectorAll('span, button')).some((el) => {
      const txt = el.textContent?.trim()
      return txt === '发帖' || txt === '回复' || txt === '转帖'
    })
    if (isChineseTwitter) {
      return 'zh'
    }
  } catch {}

  // 3. 检查 DSH 显式配置的环境语言（如果设置存在）
  try {
    const dshLocale = localStorage.getItem('dsh_configured_locale') || localStorage.getItem('omnimux_locale')
    if (dshLocale && dshLocale.toLowerCase().startsWith('zh')) {
      return 'zh'
    }
  } catch {}

  // 4. 检查浏览器用户偏好语言列表
  try {
    const langs = navigator.languages || [navigator.language]
    if (langs.some((l) => l.toLowerCase().startsWith('zh'))) {
      return 'zh'
    }
  } catch {}

  const browserLang = (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) || navigator.language || ''
  return browserLang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function closeCopilotMenu() {
  if (activeDropdown) {
    activeDropdown.classList.remove('omnimux-copilot-dropdown--visible')
    setTimeout(() => {
      if (activeDropdown && !activeDropdown.classList.contains('omnimux-copilot-dropdown--visible')) {
        activeDropdown.remove()
        activeDropdown = null
      }
    }, 200)
  }
}

const onDocClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement | null
  if (!target?.closest('.omnimux-copilot-dropdown') && !target?.closest('.omnimux-copilot-anchor-btn')) {
    closeCopilotMenu()
  }
}

const onWindowScroll = () => {
  closeCopilotMenu()
}

document.addEventListener('click', onDocClick)
window.addEventListener('scroll', onWindowScroll, { passive: true })

export function disposeCopilotListeners() {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('scroll', onWindowScroll)
  closeCopilotMenu()
}

export function toggleCopilotMenu(anchorButton: HTMLElement, scene: TwitterCopilotScene) {
  if (activeDropdown) {
    closeCopilotMenu()
    return
  }

  const locale = detectCopilotLocale()
  const items = COPILOT_MENU_ITEMS.filter((it) => it.scenes.includes(scene))
  if (items.length === 0) {
    showCopilotToast(locale === 'en' ? 'No prompts available for this scene' : '当前场景暂无可用提示词', 'info')
    return
  }

  const dropdown = document.createElement('div')
  dropdown.className = 'omnimux-copilot-dropdown'

  const sceneTitle =
    locale === 'en'
      ? scene === 'POST_NEW'
        ? 'Tweet Composer Copilot'
        : scene === 'POST_QUOTE'
          ? 'Quote Retweet Copilot'
          : scene === 'REPLY_FEED'
            ? 'Quick Interaction Copilot'
            : 'Tweet Reply Copilot'
      : scene === 'POST_NEW'
        ? '推特创作助手'
        : scene === 'POST_QUOTE'
          ? '引用转发助手'
          : scene === 'REPLY_FEED'
            ? '快捷互动助手'
            : '推文回帖助手'

  dropdown.innerHTML = `
    <div class="omnimux-copilot-dropdown__header">
      <div class="omnimux-copilot-dropdown__title">
        ${GHOST_MINI_SVG}
        <span>${sceneTitle}</span>
      </div>
      <span class="omnimux-copilot-dropdown__badge">OmniMux AI</span>
    </div>
    <div class="omnimux-copilot-dropdown__list">
      ${items
        .map(
          (item) => `
        <button type="button" class="omnimux-copilot-menu-item" data-item-id="${item.id}">
          <span class="omnimux-copilot-menu-item__name">${locale === 'en' ? item.nameEn : item.name}</span>
          <span class="omnimux-copilot-menu-item__desc">${locale === 'en' ? item.descEn : item.desc}</span>
        </button>
      `,
        )
        .join('')}
    </div>
  `

  document.body.appendChild(dropdown)

  const rect = anchorButton.getBoundingClientRect()
  const dropdownWidth = 270
  let left = rect.left
  let top = rect.bottom + 8

  if (left + dropdownWidth > window.innerWidth - 12) {
    left = window.innerWidth - dropdownWidth - 12
  }
  if (left < 12) left = 12

  if (top + 340 > window.innerHeight && rect.top > 340) {
    top = rect.top - 340
  }

  dropdown.style.left = `${left}px`
  dropdown.style.top = `${top}px`

  requestAnimationFrame(() => {
    dropdown.classList.add('omnimux-copilot-dropdown--visible')
  })

  activeDropdown = dropdown

  dropdown.querySelectorAll<HTMLButtonElement>('.omnimux-copilot-menu-item').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const itemId = btn.getAttribute('data-item-id')
      const chosenItem = items.find((it) => it.id === itemId)
      if (chosenItem) {
        closeCopilotMenu()
        await handleExecuteItem(anchorButton, scene, chosenItem, locale)
      }
    })
  })
}

/**
 * 上下文就绪闸门：抓不到内容时不许调用模型凭空生成（竞品同款「页面即上下文」纪律）。
 * 返回 null 表示就绪；否则返回给用户看的双语提示。
 */
export function checkContextReady(scene: TwitterCopilotScene, ctx: TwitterContext, locale: 'zh' | 'en'): string | null {
  const has = (v?: string) => Boolean((v || '').trim())
  const t = (zh: string, en: string) => (locale === 'en' ? en : zh)

  // 原创发新帖双轨支持：有草稿走改写扩写；无草稿时若有首页热点推文则走全新原创
  if (scene === 'POST_NEW' && !has(ctx.draftText) && (!ctx.feedHotTweets || ctx.feedHotTweets.length === 0)) {
    return t('请先在发帖框写下主题，或等待首页推文加载后再试。', 'Write your topic first, or wait for feed tweets to load.')
  }
  if (scene === 'POST_QUOTE' && !has(ctx.quotedTweetText)) {
    return t('没有读到被引用的推文，请刷新页面后重试。', "Couldn't read the quoted tweet — refresh the page and try again.")
  }
  if ((scene === 'REPLY_DETAIL' || scene === 'REPLY_FEED') && !has(ctx.targetTweetText)) {
    return t('没有读到原推内容，请刷新页面后重试。', "Couldn't read the target tweet — refresh the page and try again.")
  }
  return null
}

async function handleExecuteItem(
  anchorButton: HTMLElement,
  scene: TwitterCopilotScene,
  item: CopilotMenuItem,
  locale: 'zh' | 'en',
) {
  const ctx = extractTwitterContext(anchorButton, scene)
  const blocked = checkContextReady(scene, ctx, locale)
  if (blocked) {
    showCopilotToast(blocked, 'info')
    return
  }

  anchorButton.classList.add('omnimux-copilot-anchor-btn--loading')
  const isFreshInspiration = scene === 'POST_NEW' && !Boolean((ctx.draftText || '').trim())
  showCopilotToast(
    isFreshInspiration
      ? (locale === 'en' ? `AI is crafting from trending topics: ${item.nameEn}...` : `AI 正在分析首页热点并全新创作：${item.name}...`)
      : (locale === 'en' ? `AI is crafting: ${item.nameEn}...` : `AI 正在深度思考生成：${item.name}...`),
    'info',
  )

  try {
    const { systemPrompt, userMessage } = item.generatePrompt(ctx, locale)

    // 真正调用大模型补全
    const generatedText = await requestLlmGeneration(systemPrompt, userMessage, ctx, item.id, locale, scene)

    if (generatedText) {
      await injectTweetText(generatedText, anchorButton, locale)
    } else {
      showCopilotToast(
        locale === 'en'
          ? 'Model engine offline, please check OmniMux status'
          : '模型服务暂未响应，请检查 OmniMux 运行状态',
        'error',
      )
    }
  } catch (err) {
    console.error('[OmniMux Twitter Copilot] Generation failed:', err)
    showCopilotToast(locale === 'en' ? 'Generation failed, check engine status.' : '生成遇到异常，请检查本地引擎状态。', 'error')
  } finally {
    anchorButton.classList.remove('omnimux-copilot-anchor-btn--loading')
  }
}

async function requestLlmGeneration(
  systemPrompt: string,
  userMessage: string,
  ctx: TwitterContext,
  itemId: string,
  locale: 'zh' | 'en',
  scene: TwitterCopilotScene,
): Promise<string | null> {
  // 100% 委托给拥有特权网络通信能力的 extension background 代理处理，避免网页 CSP 拦截并保护凭据安全
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'DSH_TWITTER_COPILOT_GENERATE',
      systemPrompt,
      userMessage,
      locale,
      context: {
        scene: ctx.scene,
        targetTweetText: ctx.targetTweetText,
        targetAuthor: ctx.targetAuthor,
        draftText: ctx.draftText,
        quotedTweetText: ctx.quotedTweetText,
        quotedAuthor: ctx.quotedAuthor,
        tweetUrl: ctx.tweetUrl,
        itemId,
      },
    })

    if (response && response.ok && typeof response.text === 'string' && response.text.trim()) {
      return response.text.trim()
    }
  } catch (e) {
    console.warn('[Copilot] Background generation failed:', e)
  }

  return null
}
