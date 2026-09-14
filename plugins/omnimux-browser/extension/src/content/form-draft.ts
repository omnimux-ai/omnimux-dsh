/**
 * Structured form draft snapshot and safe fill engine.
 * Ensures field-level binding, non-empty overwrite protection, and no auto-submission.
 */

export interface FormFieldDescriptor {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'email' | 'tel' | 'url'
  required?: boolean
  hasValue: boolean
}

export interface FormSnapshot {
  documentId: string
  fields: FormFieldDescriptor[]
}

export interface FormFieldFill {
  id: string
  value: string
}

export interface FillFormResult {
  ok: boolean
  message: string
  results?: Array<{ id: string; ok: boolean; message?: string }>
}

const SENSITIVE_PATTERNS = /(?:password|pwd|secret|token|api[_-]?key|otp|auth[_-]?code|cvv|cvc|credit|card|密码|验证码|安全码|one-time-code)/i

function isSensitive(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement && el.type.toLowerCase() === 'password') return true
  const hints = [
    el.id,
    el.getAttribute('name') || '',
    el.getAttribute('autocomplete') || '',
    el.getAttribute('aria-label') || '',
    el.getAttribute('placeholder') || '',
  ].join(' ')
  return SENSITIVE_PATTERNS.test(hints)
}

function getSafeLabel(el: HTMLElement, doc: Document): string {
  // 1. Check aria-label
  const ariaLabel = el.getAttribute('aria-label')?.trim()
  if (ariaLabel) return ariaLabel

  // 2. Check aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const labelEl = doc.getElementById(labelledBy)
    if (labelEl && labelEl.textContent?.trim()) {
      return labelEl.textContent.trim()
    }
  }

  // 3. Check associated <label for="...">
  if (el.id) {
    const labelEl = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`)
    if (labelEl && labelEl.textContent?.trim()) {
      return labelEl.textContent.trim()
    }
  }

  // 4. Check enclosing <label>
  const parentLabel = el.closest('label')
  if (parentLabel) {
    // Clone and remove the input itself so its text isn't included
    const clone = parentLabel.cloneNode(true) as HTMLElement
    clone.querySelectorAll('input, textarea, select').forEach((n) => n.remove())
    const text = clone.textContent?.trim()
    if (text) return text
  }

  // 5. Check placeholder
  const placeholder = el.getAttribute('placeholder')?.trim()
  if (placeholder) return placeholder

  // 6. Check name
  const name = el.getAttribute('name')?.trim()
  if (name) return name

  return el.id || '输入框'
}

function determineFieldType(el: HTMLElement): FormFieldDescriptor['type'] | null {
  if (el instanceof HTMLTextAreaElement) return 'textarea'
  if (el instanceof HTMLSelectElement) return 'select'
  if (el instanceof HTMLInputElement) {
    const t = (el.type || 'text').toLowerCase()
    if (['hidden', 'password', 'submit', 'button', 'reset', 'image', 'file', 'checkbox', 'radio'].includes(t)) {
      return null
    }
    if (t === 'email') return 'email'
    if (t === 'tel') return 'tel'
    if (t === 'url') return 'url'
    return 'text'
  }
  if (el.isContentEditable) return 'textarea'
  return null
}

export function snapshotFormFields(doc: Document = document): FormSnapshot {
  const elements = Array.from(
    doc.querySelectorAll<HTMLElement>('input, textarea, select, [contenteditable="true"]'),
  )

  const fields: FormFieldDescriptor[] = []
  let autoIndex = 1

  for (const el of elements) {
    // Skip disabled or readonly
    if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) continue
    if (el.getAttribute('aria-hidden') === 'true') continue

    // Skip sensitive fields
    if (isSensitive(el)) continue

    const fieldType = determineFieldType(el)
    if (!fieldType) continue

    const id = el.id || el.getAttribute('name') || `field-${autoIndex++}`
    if (!el.id && !el.getAttribute('name')) {
      el.setAttribute('data-draft-field-id', id)
    }
    const label = getSafeLabel(el, doc)

    let hasValue = false
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      hasValue = el.value.trim().length > 0
    } else if (el.isContentEditable) {
      hasValue = (el.textContent || '').trim().length > 0
    }

    const required = (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true'

    fields.push({
      id,
      label,
      type: fieldType,
      required: required ? true : undefined,
      hasValue,
    })
  }

  return {
    documentId: (doc.location && doc.location.href) || 'document-0',
    fields,
  }
}

function setElementValue(el: HTMLElement, value: string): void {
  el.focus()

  if (el instanceof HTMLSelectElement) {
    const option = Array.from(el.options).find(
      (opt) => opt.value === value || opt.text.trim() === value.trim(),
    )
    if (option) {
      el.value = option.value
    } else {
      el.value = value
    }
    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = Object.getPrototypeOf(el)
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (setter) {
      setter.call(el, value)
    } else {
      el.value = value
    }
    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return
  }

  if (el.isContentEditable) {
    el.textContent = value
    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
  }
}

export async function fillFormFields(
  doc: Document = document,
  fields: FormFieldFill[],
): Promise<FillFormResult> {
  if (!fields || fields.length === 0) {
    return { ok: false, message: '未提供填写内容' }
  }

  // Pre-flight check: resolve target elements and ensure no overwrite
  const targets: Array<{ el: HTMLElement; field: FormFieldFill }> = []

  for (const field of fields) {
    let targetEl: HTMLElement | null = null

    if (field.id === 'body') {
      // Find the primary empty writable textarea or contenteditable or input
      const candidates = Array.from(
        doc.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"], input[type="text"], input:not([type])'),
      ).filter((el) => {
        if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return false
        if (isSensitive(el)) return false
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          return el.value.trim().length === 0
        }
        if (el.isContentEditable) {
          return (el.textContent || '').trim().length === 0
        }
        return false
      })

      if (candidates.length === 0) {
        return { ok: false, message: '未找到可填写的空白输入框' }
      }
      targetEl = candidates[0]!
    } else {
      targetEl = doc.getElementById(field.id)
      if (!targetEl) {
        targetEl = doc.querySelector(`[name="${CSS.escape(field.id)}"]`)
      }
      if (!targetEl) {
        targetEl = doc.querySelector(`[data-draft-field-id="${CSS.escape(field.id)}"]`)
      }
    }

    if (!targetEl) {
      return { ok: false, message: `未在页面中找到目标字段: ${field.id}` }
    }

    if (isSensitive(targetEl)) {
      return { ok: false, message: `字段 ${field.id} 为敏感项，拒绝填写` }
    }

    // Protection: Refuse overwrite if target already has existing content (select with default option excluded)
    let existingValue = ''
    if (targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement) {
      existingValue = targetEl.value.trim()
    } else if (targetEl.isContentEditable) {
      existingValue = (targetEl.textContent || '').trim()
    }

    if (existingValue.length > 0) {
      return { ok: false, message: `字段 ${field.id} 已有内容，拒绝覆盖` }
    }

    targets.push({ el: targetEl, field })
  }

  // Execution: write each target
  for (const { el, field } of targets) {
    setElementValue(el, field.value)
  }

  return { ok: true, message: '已完成填写' }
}
