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
 * 3. Browser first preferred language
 */
export function getUiLocale(): UiLocale {
  const manual = safeGetStorage('omnimux_manual_locale')
  if (manual === 'zh' || manual === 'en') return manual
  const dsh = safeGetStorage('dsh_configured_locale')
  if (dsh === 'zh' || dsh === 'en') return dsh

  let language: string | undefined
  if (typeof navigator !== 'undefined') {
    const preferred = navigator.languages?.find((candidate) => candidate.trim() !== '') ?? navigator.language
    language = preferred.trim() === '' ? undefined : preferred
  }
  if (language === undefined && typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage !== undefined) {
    try {
      language = chrome.i18n.getUILanguage()
    } catch {
      // A partially mocked or stale extension context may expose an unusable API.
    }
  }
  return localeFromLanguage(language)
}
