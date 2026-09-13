/** Languages supported by the extension UI. */
export type UiLocale = 'en' | 'zh'

/**
 * Chinese browser locales use Chinese; every other locale deliberately falls
 * back to English so an untranslated third language never leaks into the UI.
 */
export function localeFromLanguage(language: string | null | undefined): UiLocale {
  const normalized = language?.trim().toLowerCase() ?? ''
  return normalized === 'zh' || normalized.startsWith('zh-') ? 'zh' : 'en'
}

export function safeGetStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage.getItem(key)
    }
  } catch {
    // Ignore storage errors in test / sandbox
  }
  return null
}

export function safeSetStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(key, value)
    }
  } catch {
    // Ignore storage errors
  }
}

export function safeRemoveStorage(key: string): void {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
      localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Read the active UI locale:
 * 1. Explicit user manual preference ('omnimux_manual_locale')
 * 2. Host DSH configuration preference ('dsh_configured_locale')
 * 3. Chrome extension runtime UI language (chrome.i18n.getUILanguage)
 * 4. Browser preferred languages (navigator.languages)
 */
export function getUiLocale(): UiLocale {
  const manual = safeGetStorage('omnimux_manual_locale')
  if (manual === 'zh' || manual === 'en') return manual
  const dsh = safeGetStorage('dsh_configured_locale')
  if (dsh === 'zh' || dsh === 'en') return dsh

  // 1. In browser extension runtime, check chrome.i18n.getUILanguage first
  // which accurately reflects user system / browser UI locale
  if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
    try {
      const uiLang = chrome.i18n.getUILanguage()
      if (uiLang && typeof uiLang === 'string') {
        const normalized = uiLang.trim().toLowerCase()
        if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh'
        if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
      }
    } catch {}
  }

  // 2. Primary browser preferred language
  let language: string | undefined
  if (typeof navigator !== 'undefined') {
    const preferred = navigator.languages?.find((candidate) => candidate.trim() !== '') ?? navigator.language
    language = preferred.trim() === '' ? undefined : preferred
  }
  return localeFromLanguage(language)
}
