/**
 * Twitter Native Text Injector
 * Penetrates React/Draft.js/Lexical states via native ClipboardEvent paste simulation
 * so Twitter's official post/reply button activates instantly.
 */

import { sanitizeTweetText } from './sanitizer.ts'

/**
 * 填入层文案（双语）。菜单层已按 detectCopilotLocale 全量双语，此处保持同一份语言口径。
 */
export const INJECTOR_COPY = {
  injected: {
    zh: '已填入推文输入框，请复核后点击发帖！',
    en: 'Filled into the tweet box — review, then hit Post.',
  },
  copiedToClipboard: {
    zh: '未找到可输入的输入框，文案已自动复制到剪贴板！',
    en: 'No input box found — the copy was saved to your clipboard.',
  },
  clipboardBlocked: {
    zh: '未找到推特输入框，且剪贴板访问受限。',
    en: 'No tweet input box found and clipboard access is blocked.',
  },
} as const

/** 黑白中性底：与下拉菜单同一深中性色，杜绝紫色 */
export const COPILOT_TOAST_BG = '#18181b'
/** 状态色取 design.md 状态令牌（Dark 档），仅用于文字，底色保持中性 */
export const COPILOT_TOAST_TEXT_COLOR: Record<'success' | 'info' | 'error', string> = {
  success: '#4ade80',
  info: '#ffffff',
  error: '#f87171',
}
/** 填入高亮：白色描边 + 深色外圈，浅色与深色主题下均清晰可见 */
export const COPILOT_PULSE_OUTLINE = '2px solid #ffffff'
export const COPILOT_PULSE_SHADOW = '0 0 0 3px rgba(0, 0, 0, 0.55)'

export async function injectTweetText(rawText: string, anchorButton?: HTMLElement, locale: 'zh' | 'en' = 'zh'): Promise<boolean> {
  const text = sanitizeTweetText(rawText, locale)
  if (!text) return false

  // 1. Locate the tweet textarea corresponding to this anchor button
  // 严格物理锚定：传入图标时，必须基于图标所在局部容器查找，绝不退化到全局 document，防止误注入
  let targetArea: HTMLElement | null = null

  const isTooBroad = (el: Element | null | undefined): boolean =>
    !el || el === document.body || el === document.documentElement || el.tagName === 'BODY' || el.tagName === 'HTML'

  if (anchorButton) {
    const parentContainer =
      anchorButton.parentElement && !isTooBroad(anchorButton.parentElement) &&
      anchorButton.parentElement.querySelector('div[data-testid="tweetTextarea_0"][role="textbox"], div[role="textbox"][contenteditable="true"]')
        ? anchorButton.parentElement
        : null

    const container =
      anchorButton.closest('[data-testid="tweetTextarea_0_label"]')?.parentElement ||
      anchorButton.closest('[role="dialog"]') ||
      anchorButton.closest('form') ||
      anchorButton.closest('article') ||
      parentContainer

    targetArea = container?.querySelector(
      'div[data-testid="tweetTextarea_0"][role="textbox"], div[role="textbox"][contenteditable="true"]',
    ) as HTMLElement | null
  } else {
    // 未指定锚点图标时（如无界面的直接调用），优先使用当前获得焦点的输入框，其次才按选择器查找
    const activeEl = document.activeElement
    if (activeEl instanceof HTMLElement && (activeEl.isContentEditable || activeEl.getAttribute('role') === 'textbox')) {
      targetArea = activeEl
    } else {
      targetArea = document.querySelector(
        'div[data-testid="tweetTextarea_0"][role="textbox"], div[role="textbox"][contenteditable="true"], [contenteditable="true"][data-testid^="tweetTextarea"]',
      ) as HTMLElement | null
    }
  }

  if (!targetArea) {
    // Fallback: write to clipboard
    try {
      await navigator.clipboard.writeText(text)
      showCopilotToast(INJECTOR_COPY.copiedToClipboard[locale], 'info')
      return true
    } catch {
      showCopilotToast(INJECTOR_COPY.clipboardBlocked[locale], 'error')
      return false
    }
  }

  // 2. Focus and position cursor
  if (typeof targetArea.scrollIntoView === 'function') {
    targetArea.scrollIntoView({ block: 'center', inline: 'nearest' })
  }
  targetArea.focus()
  targetArea.dispatchEvent(new Event('focus', { bubbles: true }))

  const sel = window.getSelection()
  if (sel) {
    const range = document.createRange()
    range.selectNodeContents(targetArea)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // 3. Primary method: Native ClipboardEvent paste
  const initialText = targetArea.textContent || ''
  let pasteDispatched = false

  if (typeof DataTransfer !== 'undefined') {
    try {
      const dt = new DataTransfer()
      dt.setData('text/plain', text)

      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: dt,
      })

      targetArea.dispatchEvent(pasteEvent)
      pasteDispatched = true
    } catch {
      // ignore clipboard error
    }
  }

  // Allow React/Draft.js batch update tick
  await new Promise((resolve) => setTimeout(resolve, 50))

  // 4. Secondary fallback: execCommand if content did not change
  if ((targetArea.textContent || '') === initialText || !pasteDispatched) {
    if (typeof document.execCommand === 'function') {
      document.execCommand('insertText', false, text)
    } else {
      targetArea.textContent = text
    }
    targetArea.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text,
      }),
    )
  }

  // 5. Apply graceful pulse highlight
  pulseHighlightElement(targetArea)
  showCopilotToast(INJECTOR_COPY.injected[locale], 'success')
  return true
}

function pulseHighlightElement(element: HTMLElement) {
  try {
    const prevTransition = element.style.transition
    const prevOutline = element.style.outline
    const prevShadow = element.style.boxShadow

    element.style.transition = 'outline 0.2s ease, box-shadow 0.2s ease'
    element.style.outline = COPILOT_PULSE_OUTLINE
    element.style.boxShadow = COPILOT_PULSE_SHADOW

    setTimeout(() => {
      element.style.outline = prevOutline
      element.style.boxShadow = prevShadow
      element.style.transition = prevTransition
    }, 1500)
  } catch {
    // ignore
  }
}

export function showCopilotToast(message: string, tone: 'success' | 'info' | 'error' = 'info') {
  let toast = document.getElementById('omnimux-copilot-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'omnimux-copilot-toast'
    toast.className = 'omnimux-copilot-toast'
    document.body.appendChild(toast)
  }

  toast.style.background = COPILOT_TOAST_BG
  toast.style.color = COPILOT_TOAST_TEXT_COLOR[tone]
  toast.textContent = message
  toast.classList.add('omnimux-copilot-toast--visible')

  setTimeout(() => {
    toast?.classList.remove('omnimux-copilot-toast--visible')
  }, 2600)
}
