/**
 * Twitter Native Text Injector
 * Penetrates React/Draft.js/Lexical states via native ClipboardEvent paste simulation
 * so Twitter's official post/reply button activates instantly.
 */

import { sanitizeTweetText } from './sanitizer.ts'

export async function injectTweetText(rawText: string, anchorButton?: HTMLElement, locale: 'zh' | 'en' = 'zh'): Promise<boolean> {
  const text = sanitizeTweetText(rawText, locale)
  if (!text) return false

  // 1. Locate the tweet textarea corresponding to this anchor button
  let targetArea: HTMLElement | null = null

  if (anchorButton) {
    const container =
      anchorButton.closest('[data-testid="tweetTextarea_0_label"]')?.parentElement ||
      anchorButton.closest('[role="dialog"]') ||
      anchorButton.closest('form') ||
      anchorButton.closest('article') ||
      document

    targetArea = container.querySelector(
      'div[data-testid="tweetTextarea_0"][role="textbox"], div[role="textbox"][contenteditable="true"]',
    ) as HTMLElement | null
  }

  if (!targetArea) {
    targetArea = document.querySelector(
      'div[data-testid="tweetTextarea_0"][role="textbox"], div[role="textbox"][contenteditable="true"], [contenteditable="true"][data-testid^="tweetTextarea"]',
    ) as HTMLElement | null
  }

  if (!targetArea) {
    // Fallback: write to clipboard
    try {
      await navigator.clipboard.writeText(text)
      showCopilotToast('未找到可输入的输入框，文案已自动复制到剪贴板！', 'info')
      return true
    } catch {
      showCopilotToast('未找到推特输入框，且剪贴板访问受限。', 'error')
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
  showCopilotToast('已填入推文输入框，请复核后点击发帖！', 'success')
  return true
}

function pulseHighlightElement(element: HTMLElement) {
  try {
    const prevTransition = element.style.transition
    const prevOutline = element.style.outline
    const prevShadow = element.style.boxShadow

    element.style.transition = 'outline 0.2s ease, box-shadow 0.2s ease'
    element.style.outline = '2px solid #a855f7'
    element.style.boxShadow = '0 0 16px rgba(168, 85, 247, 0.45)'

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

  const bg = tone === 'success' ? '#10b981' : tone === 'error' ? '#ef4444' : '#8b5cf6'
  toast.style.background = bg
  toast.textContent = message
  toast.classList.add('omnimux-copilot-toast--visible')

  setTimeout(() => {
    toast?.classList.remove('omnimux-copilot-toast--visible')
  }, 2600)
}
