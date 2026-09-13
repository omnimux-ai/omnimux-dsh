/**
 * Bilingual copy for the hover capsule and its tooltips.
 *
 * The content script runs in the page and must stay tiny, so it never imports
 * the React panel's copy tables. Locale resolution mirrors `src/i18n.ts`:
 * manual preference first, then the extension UI language, then the browser's
 * preferred language.
 *
 * @module
 */

import type { MediaActionKind } from './types.ts'

/** Languages supported by this module. */
export type HoverLocale = 'zh' | 'en'

/** Locale keys that can already be localised by the user. */
const MANUAL_LOCALE_KEY = 'omnimux_manual_locale'

/** Every user-facing string this feature can render. */
export interface HoverCopy {
  hint: Record<MediaActionKind, string>
  done: Record<MediaActionKind, string>
  failed: string
  /** Rendered for media whose address cannot be used downstream. */
  unusable: string
  /** Title of the divider "+" affordance. */
  more: string
  /** Accessible name of the brand micro-mark. */
  brand: string
  action: Record<MediaActionKind, string>
}

const ZH: HoverCopy = {
  hint: {
    inspiration: '加入灵感库',
    copy: '复制素材链接',
    attach: '加入对话',
  },
  done: {
    inspiration: '已加入灵感库',
    copy: '已复制素材链接',
    attach: '已加入对话',
  },
  failed: '操作失败，请重试',
  unusable: '该素材地址不可用',
  more: '更多操作',
  brand: 'OmniMux',
  action: {
    inspiration: '加入灵感库',
    copy: '复制',
    attach: '加入对话',
  },
}

const EN: HoverCopy = {
  hint: {
    inspiration: 'Add to library',
    copy: 'Copy media link',
    attach: 'Add to chat',
  },
  done: {
    inspiration: 'Added to library',
    copy: 'Media link copied',
    attach: 'Added to chat',
  },
  failed: 'Something went wrong. Try again.',
  unusable: 'This media address cannot be used',
  more: 'More actions',
  brand: 'OmniMux',
  action: {
    inspiration: 'Add to library',
    copy: 'Copy',
    attach: 'Add to chat',
  },
}

function normaliseLocale(value: string | null | undefined): HoverLocale | null {
  const normalized = value?.trim().toLowerCase() ?? ''
  if (normalized === '') return null
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh'
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
  return null
}

function readManualLocale(): HoverLocale | null {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return null
    const stored = localStorage.getItem(MANUAL_LOCALE_KEY)
    return stored === 'zh' || stored === 'en' ? stored : null
  } catch {
    return null
  }
}

function readExtensionLocale(): HoverLocale | null {
  try {
    if (typeof chrome === 'undefined' || chrome.i18n?.getUILanguage === undefined) return null
    return normaliseLocale(chrome.i18n.getUILanguage())
  } catch {
    return null
  }
}

function readBrowserLocale(): HoverLocale | null {
  if (typeof navigator === 'undefined') return null
  const candidates = navigator.languages !== undefined && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language]
  for (const candidate of candidates) {
    const resolved = normaliseLocale(candidate)
    if (resolved !== null) return resolved
  }
  return null
}

/** Resolves the active locale for capsule copy. Defaults to Chinese. */
export function resolveHoverLocale(): HoverLocale {
  return readManualLocale() ?? readExtensionLocale() ?? readBrowserLocale() ?? 'zh'
}

/** Returns the copy table for a locale, resolving the locale when omitted. */
export function hoverCopy(locale?: HoverLocale): HoverCopy {
  return (locale ?? resolveHoverLocale()) === 'en' ? EN : ZH
}
