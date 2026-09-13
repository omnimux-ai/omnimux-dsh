/**
 * The two page-surface switches the side panel owns and the content scripts obey.
 *
 * The value has to cross two isolated worlds: the panel renders on the extension
 * origin and writes the switch, while the FAB companion and the hover capsule run
 * as content scripts, where `localStorage` belongs to the *page* rather than to
 * the extension. `chrome.storage.local` is therefore the authoritative channel
 * (a change fires `chrome.storage.onChanged` in every extension context, so
 * every open tab converges), and `safeGetStorage` keeps a synchronous mirror so
 * the panel paints the stored value before the async read lands.
 *
 * Both switches ship on: an absent, malformed or unreadable value means enabled,
 * because a feature the user never turned off must not disappear.
 *
 * @module
 */

import { safeGetStorage, safeSetStorage } from './i18n.ts'

/** Storage keys for the page-surface switches, shared by every reader. */
export const FEATURE_FLAG = {
  /** The floating companion ball in the page's bottom-right corner. */
  fab: 'omnimux_fab_enabled',
  /** The capsule toolbar that appears while the pointer rests on page media. */
  mediaHover: 'omnimux_media_hover_enabled',
} as const

/** One of the switch keys above. */
export type FeatureFlagKey = (typeof FEATURE_FLAG)[keyof typeof FEATURE_FLAG]

/** Every switch ships on; the user opts out, never in. */
export const FEATURE_FLAG_DEFAULT = true

/** Runtime message carrying one switch straight to the tab it changed in. */
export const FEATURE_FLAG_MESSAGE = 'OMNIMUX_FEATURE_FLAG'

/** A switch value paired with the key it belongs to. */
export interface FeatureFlagUpdate {
  key: FeatureFlagKey
  enabled: boolean
}

const FEATURE_FLAG_KEYS: readonly string[] = [FEATURE_FLAG.fab, FEATURE_FLAG.mediaHover]

/** Whether `value` names one of the switches this module owns. */
export function isFeatureFlagKey(value: unknown): value is FeatureFlagKey {
  return typeof value === 'string' && FEATURE_FLAG_KEYS.includes(value)
}

/**
 * Reads a stored switch.
 *
 * Only a real boolean or its serialized form counts: `undefined`, `null` and a
 * stray string all fall back, so a value written by another build can never
 * leave a feature in a half-on state.
 *
 * @param raw - The value as storage returned it.
 * @param fallback - Value used when `raw` carries no decision; defaults to on.
 */
export function parseFlagValue(raw: unknown, fallback: boolean = FEATURE_FLAG_DEFAULT): boolean {
  if (typeof raw === 'boolean') return raw
  if (raw === 'true') return true
  if (raw === 'false') return false
  return fallback
}

/** The extension's local storage area, or `null` outside an extension context. */
function chromeStorageLocal(): chrome.storage.StorageArea | null {
  if (typeof chrome === 'undefined' || chrome === null) return null
  const local = chrome.storage?.local
  return local === undefined || local === null ? null : local
}

/** The runtime message channel, or `null` outside an extension context. */
function chromeRuntime(): typeof chrome.runtime | null {
  if (typeof chrome === 'undefined' || chrome === null) return null
  return chrome.runtime ?? null
}

/**
 * Synchronous read of the localStorage mirror.
 *
 * Safe in every context and used for the first paint; a context that never saw a
 * write — a page-origin content script, a sandboxed test — gets the default.
 */
export function readFlagSync(key: FeatureFlagKey): boolean {
  return parseFlagValue(safeGetStorage(key))
}

/**
 * Authoritative read from `chrome.storage.local`, falling back to the mirror.
 *
 * No mirror write happens here: a content script's `localStorage` belongs to the
 * page it runs in, so only `writeFlag` (the panel) may persist the value.
 */
export async function readFlag(key: FeatureFlagKey): Promise<boolean> {
  const stored = await readStoredFlag(key)
  return stored === null ? readFlagSync(key) : stored
}

async function readStoredFlag(key: FeatureFlagKey): Promise<boolean | null> {
  const local = chromeStorageLocal()
  if (local === null) return null
  try {
    const result = await local.get(key)
    if (typeof result !== 'object' || result === null) return null
    const raw = (result as Record<string, unknown>)[key]
    return raw === undefined ? null : parseFlagValue(raw)
  } catch {
    // A storage read failure is not a user decision: fall back to the mirror.
    return null
  }
}

/**
 * Persists one switch and mirrors it for the synchronous first paint.
 *
 * The write reaches every open tab through `chrome.storage.onChanged`; failing
 * the async half still leaves the mirror carrying the value for this surface.
 */
export async function writeFlag(key: FeatureFlagKey, enabled: boolean): Promise<void> {
  safeSetStorage(key, enabled ? 'true' : 'false')
  const local = chromeStorageLocal()
  if (local === null) return
  try {
    await local.set({ [key]: enabled })
  } catch {
    // The mirror above already carries the value.
  }
}

/**
 * Calls `listener` whenever `key` changes in `chrome.storage.local`.
 *
 * @returns An unsubscribe function; a no-op outside an extension context.
 */
export function watchFlag(key: FeatureFlagKey, listener: (enabled: boolean) => void): () => void {
  if (typeof chrome === 'undefined' || chrome === null) return () => {}
  const onChanged = chrome.storage?.onChanged
  if (onChanged === undefined || onChanged === null) return () => {}

  const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string): void => {
    if (areaName !== 'local') return
    const change = changes[key]
    if (change === undefined) return
    listener(parseFlagValue(change.newValue))
  }

  onChanged.addListener(handler)
  return () => { onChanged.removeListener(handler) }
}

/**
 * Recognises the message a panel sends to the tab whose switch just changed.
 *
 * @returns The update, or `null` for any other message on the channel.
 */
export function featureFlagUpdateFromMessage(message: unknown): FeatureFlagUpdate | null {
  if (typeof message !== 'object' || message === null) return null
  const candidate = message as { action?: unknown; key?: unknown; enabled?: unknown }
  if (candidate.action !== FEATURE_FLAG_MESSAGE) return null
  if (!isFeatureFlagKey(candidate.key)) return null
  return { key: candidate.key, enabled: parseFlagValue(candidate.enabled) }
}

/**
 * Follows one switch on both channels a surface can be reached through.
 *
 * Storage is what makes every open tab converge; the runtime message is the
 * immediate delivery the panel sends to the tab the user is looking at, so a tab
 * reacts even when the storage event is delayed or coalesced.
 *
 * @returns An unsubscribe function releasing both listeners.
 */
export function subscribeFlag(key: FeatureFlagKey, listener: (enabled: boolean) => void): () => void {
  const unwatch = watchFlag(key, listener)
  const runtime = chromeRuntime()
  const onMessage = runtime?.onMessage
  if (onMessage === undefined || onMessage === null) return unwatch

  const handler = (message: unknown): undefined => {
    const update = featureFlagUpdateFromMessage(message)
    if (update !== null && update.key === key) listener(update.enabled)
    return undefined
  }

  onMessage.addListener(handler)
  return () => {
    unwatch()
    onMessage.removeListener(handler)
  }
}

/** The message the panel sends to deliver one switch change to the active tab. */
export function featureFlagMessage(key: FeatureFlagKey, enabled: boolean): {
  action: string
  key: FeatureFlagKey
  enabled: boolean
} {
  return { action: FEATURE_FLAG_MESSAGE, key, enabled }
}
