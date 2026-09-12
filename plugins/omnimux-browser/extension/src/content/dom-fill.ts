/**
 * DOM Fill Engine: safely penetrates React, Draft.js, Lexical, and ContentEditable
 * input surfaces to inject generated AI content, with fallback to clipboard.
 */

const SELECTOR_REGISTRY: Record<string, string[]> = {
  twitter: [
    '[data-testid="tweetTextarea_0"]',
    '[data-testid="tweetTextarea_0_label"] div[role="textbox"]',
    '[data-testid="dm-composer-textarea"]',
    'div[data-testid^="tweetTextarea"]',
    'div[role="textbox"][contenteditable="true"]',
    'textarea[data-testid="tweetTextarea_0"]',
    'textarea',
  ],
  tiktok: [
    'div[data-e2e="comment-input"] [contenteditable="true"]',
    'div[data-e2e="comment-input"] textarea',
    'div[contenteditable="true"][data-placeholder]',
    'div[role="textbox"][contenteditable="true"]',
    'textarea[placeholder*="comment" i]',
    'textarea[placeholder*="评论" i]',
    'textarea',
  ],
  generic: [
    'div[contenteditable="true"]:focus',
    'textarea:focus',
    'div[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea[name*="comment" i]',
    'textarea[name*="reply" i]',
    'textarea',
  ],
}

function isElementVisible(el: Element | null): el is HTMLElement {
  if (!el || !el.isConnected) return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false
  }
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function findTargetElement(platform: string = 'generic'): { element: HTMLElement; selector: string } | null {
  const candidates = [
    ...(SELECTOR_REGISTRY[platform] || []),
    ...SELECTOR_REGISTRY.generic,
  ]

  const activeEl = document.activeElement
  if (
    activeEl &&
    (activeEl instanceof HTMLElement) &&
    (activeEl.isContentEditable || activeEl.tagName === 'TEXTAREA' || (activeEl.tagName === 'INPUT' && (activeEl as HTMLInputElement).type === 'text'))
  ) {
    return { element: activeEl, selector: 'document.activeElement' }
  }

  for (const selector of candidates) {
    try {
      const elements = document.querySelectorAll(selector)
      for (const el of elements) {
        if (isElementVisible(el)) {
          return { element: el, selector }
        }
      }
    } catch {
      // Ignore pseudo-selector syntax errors
    }
  }

  return null
}

function pulseHighlightElement(element: HTMLElement) {
  try {
    const originalOutline = element.style.outline
    const originalTransition = element.style.transition
    const originalShadow = element.style.boxShadow

    element.style.transition = 'outline 0.2s ease, box-shadow 0.2s ease'
    element.style.outline = '2.5px solid #8b5cf6'
    element.style.boxShadow = '0 0 16px rgba(139, 92, 246, 0.45)'

    setTimeout(() => {
      element.style.outline = originalOutline
      element.style.boxShadow = originalShadow
      element.style.transition = originalTransition
    }, 1500)
  } catch {
    // Ignore styling issues
  }
}

export interface FillResult {
  success: boolean
  fallbackToClipboard: boolean
  method: string
  message: string
}

export async function fillHostInput(text: string, platform: string = 'generic'): Promise<FillResult> {
  const target = findTargetElement(platform)

  if (!target) {
    try {
      await navigator.clipboard.writeText(text)
      return {
        success: false,
        fallbackToClipboard: true,
        method: 'clipboard',
        message: '未定位到可填写的输入框，文案已复制到剪贴板，请直接粘贴。',
      }
    } catch {
      return {
        success: false,
        fallbackToClipboard: false,
        method: 'failed',
        message: '未定位到输入框且剪贴板权限受限。',
      }
    }
  }

  const el = target.element
  el.focus()
  pulseHighlightElement(el)

  // Standard TEXTAREA or text INPUT
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const originalValue = el.value

    el.value = originalValue.substring(0, start) + text + originalValue.substring(end)
    el.selectionStart = el.selectionEnd = start + text.length

    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))

    return {
      success: true,
      fallbackToClipboard: false,
      method: 'native-input',
      message: '已填入输入框',
    }
  }

  // ContentEditable / Draft.js / Lexical rich text
  if (el.isContentEditable) {
    const sel = window.getSelection()
    if (sel) {
      if (sel.rangeCount === 0) {
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }

      const inserted = document.execCommand('insertText', false, text)
      if (inserted) {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }))
        return {
          success: true,
          fallbackToClipboard: false,
          method: 'execCommand',
          message: '已成功注入富文本输入框',
        }
      }
    }

    // Direct text fallback
    el.textContent = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return {
      success: true,
      fallbackToClipboard: false,
      method: 'textContent',
      message: '已填入输入框',
    }
  }

  // Fallback
  await navigator.clipboard.writeText(text).catch(() => {})
  return {
    success: false,
    fallbackToClipboard: true,
    method: 'clipboard-fallback',
    message: '输入框类型暂不支持直接写入，文案已写入剪贴板。',
  }
}
