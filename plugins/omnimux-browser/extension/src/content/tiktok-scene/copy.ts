/**
 * Bilingual copy for the TikTok scene trigger, its menu and its result lines.
 *
 * The content script runs inside TikTok's page and must stay small, so it never
 * imports the React panel's copy tables. Locale resolution mirrors
 * `media-hover/copy.ts` and `src/i18n.ts`: manual preference, then the extension
 * UI language, then the browser's preferred language.
 *
 * Result lines are functions rather than templates because a success names the
 * file it wrote and a failure carries the host's own explanation — both are
 * runtime values, and neither should be assembled by the caller.
 *
 * @module
 */

import type { ExportOutcome } from '../../background/media-export.ts'

/** Languages this module can render. */
export type TiktokLocale = 'zh' | 'en'

/** Locale keys that can already be localised by the user. */
const MANUAL_LOCALE_KEY = 'omnimux_manual_locale'

/** Which shortcut a line belongs to. */
export type TiktokAction = 'video' | 'audio' | 'save'

/** Every user-facing string this feature renders. */
export interface TiktokCopy {
  /** Accessible name of the trigger. */
  brand: string
  /** Visible label on the trigger. */
  trigger: string
  /** Menu row labels. */
  menu: Record<TiktokAction, string>
  /** Row label while the host works. */
  busy: Record<TiktokAction, string>
  /** Row label once the host answered. */
  done: (action: TiktokAction, outcome: ExportOutcome) => string
  /** Explanation shown under a failed row. */
  failed: (outcome: ExportOutcome) => string
  /** Shown when the page offers no post to act on. */
  noTarget: string
}

const ZH: TiktokCopy = {
  brand: 'OmniMux 快捷操作',
  trigger: 'OmniMux',
  menu: {
    video: '下载无水印视频',
    audio: '下载原视频音频',
    save: '保存到灵感库',
  },
  busy: {
    video: '解析下载中',
    audio: '提取音轨中',
    save: '解析入库中',
  },
  done: (action, outcome) => {
    if (outcome.code === 'duplicate') return '已在灵感库'
    if (outcome.code === 'saved') return '已进灵感库'
    return action === 'audio' ? '原声已存「下载」' : '已存到「下载」'
  },
  failed: (outcome) => {
    if (outcome.code === 'unreachable') return '未连接 OmniMux 主程序，请先启动后再试'
    return outcome.detail !== undefined && outcome.detail !== '' ? outcome.detail : '操作失败，请重试'
  },
  noTarget: '这一页没有可操作的作品',
}

const EN: TiktokCopy = {
  brand: 'OmniMux shortcuts',
  trigger: 'OmniMux',
  menu: {
    video: 'Download without watermark',
    audio: 'Download original audio',
    save: 'Save to inspiration',
  },
  busy: {
    video: 'Resolving',
    audio: 'Extracting audio',
    save: 'Importing',
  },
  done: (action, outcome) => {
    if (outcome.code === 'duplicate') return 'Already in library'
    if (outcome.code === 'saved') return 'Saved to library'
    return action === 'audio' ? 'Audio in Downloads' : 'Saved to Downloads'
  },
  failed: (outcome) => {
    if (outcome.code === 'unreachable') return 'OmniMux is not running — start it and retry'
    return outcome.detail !== undefined && outcome.detail !== '' ? outcome.detail : 'That did not work — try again'
  },
  noTarget: 'No post to act on here',
}

/** Map a BCP-47 tag onto a supported locale, or `null`. */
function normaliseLocale(tag: string | undefined): TiktokLocale | null {
  if (tag === undefined) return null
  const lower = tag.toLowerCase()
  if (lower.startsWith('zh')) return 'zh'
  if (lower.startsWith('en')) return 'en'
  return null
}

function readManualLocale(): TiktokLocale | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const stored = localStorage.getItem(MANUAL_LOCALE_KEY)
    return stored === 'zh' || stored === 'en' ? stored : null
  } catch {
    return null
  }
}

function readExtensionLocale(): TiktokLocale | null {
  try {
    if (typeof chrome === 'undefined' || chrome.i18n?.getUILanguage === undefined) return null
    return normaliseLocale(chrome.i18n.getUILanguage())
  } catch {
    return null
  }
}

function readBrowserLocale(): TiktokLocale | null {
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

/** Resolve the active locale for this feature. Defaults to Chinese. */
export function resolveTiktokLocale(): TiktokLocale {
  return readManualLocale() ?? readExtensionLocale() ?? readBrowserLocale() ?? 'zh'
}

/** The copy table for a locale, resolving the locale when omitted. */
export function tiktokCopy(locale?: TiktokLocale): TiktokCopy {
  return (locale ?? resolveTiktokLocale()) === 'en' ? EN : ZH
}
