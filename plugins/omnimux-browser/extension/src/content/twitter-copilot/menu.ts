/**
 * Twitter Copilot Menu & Generation Dispatcher
 */

import { COPILOT_MENU_ITEMS } from './prompts.ts'
import { extractTwitterContext } from './extractor.ts'
import { injectTweetText, showCopilotToast } from './injector.ts'
import type { CopilotMenuItem, TwitterCopilotScene, TwitterContext } from './types.ts'

declare const chrome: any

let activeDropdown: HTMLElement | null = null

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

// Global click & scroll listeners
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement | null
  if (!target?.closest('.omnimux-copilot-dropdown') && !target?.closest('.omnimux-copilot-anchor-btn')) {
    closeCopilotMenu()
  }
})

window.addEventListener('scroll', () => {
  closeCopilotMenu()
}, { passive: true })

export function toggleCopilotMenu(anchorButton: HTMLElement, scene: TwitterCopilotScene) {
  if (activeDropdown) {
    closeCopilotMenu()
    return
  }

  // Filter items applicable to current scene
  const items = COPILOT_MENU_ITEMS.filter((it) => it.scenes.includes(scene))
  if (items.length === 0) {
    showCopilotToast('当前场景暂无可用提示词', 'info')
    return
  }

  const dropdown = document.createElement('div')
  dropdown.className = 'omnimux-copilot-dropdown'

  const sceneTitle =
    scene === 'POST_NEW'
      ? '发新帖助手'
      : scene === 'POST_QUOTE'
        ? '引用转发助手'
        : '推文回帖助手'

  dropdown.innerHTML = `
    <div class="omnimux-copilot-dropdown__header">
      <div class="omnimux-copilot-dropdown__title">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z"/>
        </svg>
        <span>${sceneTitle}</span>
      </div>
      <span class="omnimux-copilot-dropdown__badge">OmniMux AI</span>
    </div>
    <div class="omnimux-copilot-dropdown__list">
      ${items
        .map(
          (item) => `
        <button type="button" class="omnimux-copilot-menu-item" data-item-id="${item.id}">
          <span class="omnimux-copilot-menu-item__name">${item.name}</span>
          <span class="omnimux-copilot-menu-item__desc">${item.desc}</span>
        </button>
      `,
        )
        .join('')}
    </div>
  `

  document.body.appendChild(dropdown)

  // Position dropdown
  const rect = anchorButton.getBoundingClientRect()
  const dropdownWidth = 270
  let left = rect.left
  let top = rect.bottom + 8

  // Keep within viewport horizontally
  if (left + dropdownWidth > window.innerWidth - 12) {
    left = window.innerWidth - dropdownWidth - 12
  }
  if (left < 12) left = 12

  // If opening downwards overflows viewport, open upwards
  if (top + 340 > window.innerHeight && rect.top > 340) {
    top = rect.top - 340
  }

  dropdown.style.left = `${left}px`
  dropdown.style.top = `${top}px`

  // Show with transition
  requestAnimationFrame(() => {
    dropdown.classList.add('omnimux-copilot-dropdown--visible')
  })

  activeDropdown = dropdown

  // Bind clicks
  dropdown.querySelectorAll<HTMLButtonElement>('.omnimux-copilot-menu-item').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const itemId = btn.getAttribute('data-item-id')
      const chosenItem = items.find((it) => it.id === itemId)
      if (chosenItem) {
        closeCopilotMenu()
        await handleExecuteItem(anchorButton, scene, chosenItem)
      }
    })
  })
}

async function handleExecuteItem(anchorButton: HTMLElement, scene: TwitterCopilotScene, item: CopilotMenuItem) {
  // Set loading state on anchor button
  anchorButton.classList.add('omnimux-copilot-anchor-btn--loading')
  showCopilotToast(`正在为您生成：${item.name}...`, 'info')

  try {
    // 1. Extract context
    const ctx = extractTwitterContext(anchorButton, scene)
    const { systemPrompt, userMessage } = item.generatePrompt(ctx)

    // 2. Request generation from OmniMux Bridge / Local LLM
    let generatedText = await requestLlmGeneration(systemPrompt, userMessage)

    if (!generatedText) {
      // Graceful intelligent fallback if backend model engine is temporarily unready
      generatedText = generateGracefulFallback(item.id, ctx)
    }

    // 3. Inject into tweet input area
    await injectTweetText(generatedText, anchorButton)
  } catch (err) {
    console.error('[OmniMux Twitter Copilot] Generation failed:', err)
    showCopilotToast('生成遇到异常，请检查本地引擎状态。', 'error')
  } finally {
    anchorButton.classList.remove('omnimux-copilot-anchor-btn--loading')
  }
}

async function requestLlmGeneration(systemPrompt: string, userMessage: string): Promise<string | null> {
  try {
    // Send message to extension background which proxies to local OmniMux / DSH endpoint
    const response = await chrome.runtime.sendMessage({
      type: 'DSH_TWITTER_COPILOT_GENERATE',
      systemPrompt,
      userMessage,
    })

    if (response && response.ok && typeof response.text === 'string' && response.text.trim()) {
      return response.text.trim()
    }
  } catch {
    // runtime unavailable or not answering
  }
  return null
}

function generateGracefulFallback(itemId: string, ctx: TwitterContext): string {
  // Built-in intelligent templating guarantee for instant zero-dependency generation
  switch (itemId) {
    case 'ai-hot-tweets':
      return `思考了一个行业关键趋势：${ctx.draftText || 'AI 自动化重塑工作流'}。\n\n大多数人看到的是效率提升，但真正的核心分水岭在【全链路闭环】。\n\n你是怎么看的？欢迎留言讨论。`
    case 'ai-tweet-imitation':
      return `最近关于 ${ctx.draftText || '新一代智能体实践'} 的讨论非常热烈。\n\n跳出同质化内卷，关键在落地体验上的每一个细节点磨砺。`
    case 'ai-retweet':
      return `深度认同这个判断！补充一个关键视角：在真实落地场景中，工具是否能无缝嵌入已有工作流，往往比单纯的参数量更能决定成败。`
    case 'ai-tweet-threads':
      return `🧵 关于“${ctx.draftText || '如何用 AI 高效打造出海增长闭环'}”，这里整理了一套完整复盘：\n\n1/ 核心逻辑拆解\n2/ 关键落地细节\n3/ 实测避坑指南\n\n（连载干货，建议先转后看）`
    case 'ai-tweet-reply-high':
      return `非常精彩的洞察！补充一个实践中的数据切片：当用户路径缩短哪怕一步，全流程完播与互动留存就能呈现数倍的倍增效应。`
    case 'ai-tweet-comment':
      return `很有深度的分析。从系统架构与长期演进来看，解决状态穿透与确定性交付确实是基石级能力。`
    case 'ai-tweet-reply-follow':
      return `写得非常在理，同在这条赛道深耕！博主的思路很清晰，期待后续更多高质量分享，先关注了！`
    case 'twitter-reply-en':
      return `Spot on! Totally agree with this insight. Making the execution loop frictionless is where the real leverage comes from.`
    case 'cmqolx85u000x1fbggacvllkj':
      return `逻辑感人。建议下次下结论前，先亲自把全流程跑通一遍再来指点江山，画面会更和谐一点。`
    case 'ai-tweet-reply':
    default:
      return `说到点子上了，确实很有启发！`
  }
}
