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
   * Shortest gap between two anchor re-measurements.
   *
   * TikTok mutates the feed continuously while a video plays, so reacting to
   * every mutation would re-measure the anchor dozens of times a second for a
   * position that only changes when the rail is rebuilt. A throttle, not a
   * debounce: a debounce restarted by each mutation can be starved forever by a
   * page that never goes quiet, leaving the trigger at a stale anchor.
   */
  rescanThrottleMs: 180,

  /**
   * How often the address is re-read while the page is a TikTok page.
   *
   * The address decides whether the page gets a trigger at all, and this app
   * rewrites it without a navigation event: a hard load of a post address
   * commits on the feed and then has the post's own path pushed in behind it,
   * with no DOM mutation to hang a re-check on. Reading one string on a timer is
   * what keeps that rewrite from leaving a stale decision behind; the observer
   * stays the fast path, and this is the floor under it.
   */
  urlWatchMs: 400,
} as const
