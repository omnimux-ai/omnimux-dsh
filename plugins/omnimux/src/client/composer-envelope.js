/**
 * Intercepts composer submit gestures (Enter key and Send button click)
 * to prefix UI Context Envelope to the user message before sending.
 * Supports both standard textarea and Lexical contenteditable editors.
 * Also injects CSS to hide <ui_context> tags in rendered chat bubbles.
 */

export const COMPOSER_SELECTOR = [
  '[data-lexical-editor="true"]',
  '[data-composer-input="true"]',
  'div[role="textbox"][contenteditable="true"]',
  'div[role="textbox"]',
  '[data-composer-card] textarea',
  '[data-composer-seat] textarea',
  'textarea[data-phase]',
  'textarea[placeholder]',
  'textarea',
].join(', ')

export const SEND_SELECTOR = [
  'button[aria-label="发送消息"]',
  'button[aria-label="Send message"]',
  'button[aria-label="Send"]',
  '[data-send-button]',
].join(', ')

export function findComposer(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  return doc.querySelector(COMPOSER_SELECTOR)
}

export function findSendButton(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null
  return doc.querySelector(SEND_SELECTOR)
}

export function getComposerText(field) {
  if (!field) return ''
  if (field.isContentEditable || field.getAttribute?.('contenteditable') === 'true') {
    return field.innerText ?? field.textContent ?? ''
  }
  return field.value ?? ''
}

export function setComposerValue(field, text, globals = {}) {
  if (!field) return false
  const value = String(text ?? '')

  // 1. Contenteditable / Lexical editor
  if (field.isContentEditable || field.getAttribute?.('contenteditable') === 'true' || field.__lexicalEditor) {
    if (field.__lexicalEditor && typeof document !== 'undefined') {
      try {
        field.focus()
        const sel = (globals.window || globalThis.window)?.getSelection?.()
        if (sel) {
          sel.selectAllChildren(field)
        }
        document.execCommand('insertText', false, value)
        return true
      } catch {
        // fall through
      }
    }
    field.textContent = value
    const Ev = globals.InputEvent ?? globals.Event ?? (typeof InputEvent === 'function' ? InputEvent : typeof Event === 'function' ? Event : undefined)
    if (Ev && typeof field.dispatchEvent === 'function') {
      try { field.dispatchEvent(new Ev('input', { bubbles: true, cancelable: true })) } catch {}
    }
    return true
  }

  // 2. Standard HTMLTextAreaElement / HTMLInputElement
  const TextArea = globals.HTMLTextAreaElement ?? (typeof HTMLTextAreaElement === 'function' ? HTMLTextAreaElement : undefined)
  const InputEl = globals.HTMLInputElement ?? (typeof HTMLInputElement === 'function' ? HTMLInputElement : undefined)
  const proto = TextArea && field instanceof TextArea
    ? TextArea.prototype
    : InputEl && field instanceof InputEl
      ? InputEl.prototype
      : Object.getPrototypeOf(field)
  const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : undefined
  if (setter) setter.call(field, value)
  else field.value = value

  const Ev = globals.InputEvent ?? globals.Event ?? (typeof InputEvent === 'function' ? InputEvent : typeof Event === 'function' ? Event : undefined)
  if (Ev && typeof field.dispatchEvent === 'function') {
    try {
      field.dispatchEvent(new Ev('input', { bubbles: true, cancelable: true }))
    } catch {
      // ignore
    }
  }
  return true
}

export function injectUiContextStyle(doc = (typeof document !== 'undefined' ? document : null)) {
  // Deprecated: UI context now uses native DSH context injection rows.
}

export function attachComposerEnvelope(composerEl, getUiContext, formatCompactBlock, globals = {}) {
  // Deprecated: UI context is injected natively via Host agent/pre-step; user message is preserved intact.
  return false
}

export function installComposerEnvelopeCapture(doc = (typeof document !== 'undefined' ? document : null), options = {}) {
  // Deprecated: No composer event interception or text prefixing needed.
  return () => {}
}
