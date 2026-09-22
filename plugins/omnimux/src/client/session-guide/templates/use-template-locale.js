import { useEffect, useState } from 'react'
import { isValidLanguageCode, resolveTemplateLocale } from './template-locale.js'

/**
 * 订阅宿主语言。只读，不改写页面语言标记。
 * @param {string | undefined} locale
 * @param {(key: string) => string} [t]
 * @returns {string}
 */
export function useTemplateLocale(locale, t) {
  const [current, setCurrent] = useState(() => resolveTemplateLocale(locale, t))

  useEffect(() => {
    const sync = (candidate) => {
      const next = isValidLanguageCode(candidate)
        ? candidate.trim()
        : resolveTemplateLocale(locale, t)
      setCurrent((prev) => (prev === next ? prev : next))
    }

    sync()

    const ObserverClass =
      (typeof document !== 'undefined' && document?.defaultView?.MutationObserver) ||
      (typeof MutationObserver !== 'undefined' ? MutationObserver : null)
    let observer = null
    if (ObserverClass && typeof document !== 'undefined' && document?.documentElement) {
      observer = new ObserverClass(() => sync())
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['lang'],
      })
    }

    const onLocaleEvent = (event) => {
      const raw = event?.detail?.locale || event?.detail
      sync(typeof raw === 'string' ? raw : null)
    }
    const targetWindow = typeof window !== 'undefined' ? window : null
    targetWindow?.addEventListener?.('omnimux:locale-change', onLocaleEvent)
    targetWindow?.addEventListener?.('languagechange', onLocaleEvent)

    return () => {
      observer?.disconnect()
      targetWindow?.removeEventListener?.('omnimux:locale-change', onLocaleEvent)
      targetWindow?.removeEventListener?.('languagechange', onLocaleEvent)
    }
  }, [locale, t])

  return current
}
