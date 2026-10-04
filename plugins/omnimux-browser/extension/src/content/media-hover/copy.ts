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

/**
 * The image primary action's full state matrix.
 *
 * Verbatim strings from the product UI spec: title, aria-label, hover/focus
 * tooltip and the single result feedback share these words, so nothing else in
 * the codebase may paraphrase them.
 */
export interface ImagePrimaryCopy {
  /** Idle: title / aria-label / hover hint. */
  idle: string
  /** While the host save is in flight. */
  busy: string
  /** After the host confirmed the real save. */
  done: string
  /** No trusted host is connected for the write. */
  hostUnavailable: string
  /** The host reported the image could not be downloaded. */
  downloadFailed: string
  /** The host was connected but refused/failed the save itself. */
  saveFailed: string
  /** The source cannot be turned into a real image file. */
  unavailable: string
  /** The media type could not be confirmed at press time. */
  typeUnknown: string
  /** The request may have reached the host but the receipt never came back. */
  unconfirmed: string
  /** Host-side asset name when the page offers no real title. */
  defaultName: string
}

/** Every user-facing string this feature can render. */
export interface HoverCopy {
  hint: Record<MediaActionKind, string>
  done: Record<MediaActionKind, string>
  failed: string
  /** Rendered for media whose address cannot be used downstream. */
  unusable: string
  /**
   * Rendered when the media only resolves inside its own page — a `blob:` video
   * with no poster — so the shortcut fell back to citing the page itself.
   */
  pageReference: string
  /** Accessible name of the capsule toolbar. */
  brand: string
  action: Record<MediaActionKind, string>
  /** Image primary action's verbatim state matrix. */
  image: ImagePrimaryCopy
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
  pageReference: '该视频仅在页面内可播，已引用页面链接',
  brand: 'OmniMux',
  action: {
    inspiration: '加入灵感库',
    copy: '复制',
    attach: '加入对话',
  },
  image: {
    idle: '加入资产库',
    busy: '正在加入资产库',
    done: '已加入资产库',
    hostUnavailable: '宿主未连接，请打开 OmniMux 后重试',
    downloadFailed: '图片下载失败，请重试',
    saveFailed: '资产保存失败，请重试',
    unavailable: '该图片无法保存',
    typeUnknown: '无法确认素材类型，请刷新后重试',
    unconfirmed: '未确认保存结果，请稍后查看资产库',
    defaultName: '网页图片',
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
  pageReference: 'This video only plays in its page, so the page link was used',
  brand: 'OmniMux',
  action: {
    inspiration: 'Add to library',
    copy: 'Copy',
    attach: 'Add to chat',
  },
  image: {
    idle: 'Add to asset library',
    busy: 'Adding to asset library',
    done: 'Added to asset library',
    hostUnavailable: 'Host not connected. Open OmniMux and try again.',
    downloadFailed: 'Image download failed. Try again.',
    saveFailed: 'Asset could not be saved. Try again.',
    unavailable: 'This image cannot be saved',
    typeUnknown: 'Media type could not be confirmed. Refresh and try again.',
    unconfirmed: 'Save result not confirmed. Check the asset library shortly.',
    defaultName: 'Web image',
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
