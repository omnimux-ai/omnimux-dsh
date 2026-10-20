/**
 * Platform glyph of a monitored account, drawn rather than typed.
 *
 * Moved here verbatim from the account-list column that the filter panel
 * replaced. The glyph table itself lives in `rival-platforms.js` so the
 * icon contract can be asserted without a JSX runtime.
 */

import { platformMarkPath } from './rival-platforms.js'

/** @param {string} platform */
export function RivalPlatformMark({ platform }) {
  return (
    <svg className="omnimux-rival-platform-mark" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d={platformMarkPath(platform)} fill="currentColor" />
    </svg>
  )
}
