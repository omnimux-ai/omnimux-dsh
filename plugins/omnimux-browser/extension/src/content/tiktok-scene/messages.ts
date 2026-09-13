/**
 * Protocol constants for the TikTok scene trigger.
 *
 * One place owns the storage key, the runtime message names and the rescan
 * budget, so the content script and the background worker cannot drift apart on
 * a string literal.
 *
 * @module
 */

/** Id of the shadow host the trigger mounts into. */
export const TIKTOK_SCENE_HOST_ID = 'omnimux-tiktok-scene-root'

/** `chrome.runtime` message types exchanged with the background worker. */
export const TIKTOK_RUNTIME_MESSAGE = {
  /** Content → background: write the watermark-free video, or its audio, to Downloads. */
  fetchMedia: 'DSH_TIKTOK_FETCH_MEDIA',
  /** Content → background: import the post into the OmniMux inspiration library. */
  saveToInspiration: 'DSH_TIKTOK_SAVE_TO_INSPIRATION',
} as const

/** Timing budgets. */
export const TIKTOK_TIMING = {
  /**
   * Quiet period after a DOM mutation before the page is re-scanned.
   *
   * TikTok mutates the feed continuously while a video plays, so reacting to
   * every mutation would re-measure the anchor dozens of times a second for a
   * position that only changes when the user scrolls or navigates.
   */
  rescanDebounceMs: 180,
} as const
