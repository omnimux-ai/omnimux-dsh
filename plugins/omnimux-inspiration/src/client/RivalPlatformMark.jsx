/**
 * Platform glyph of a monitored account, drawn rather than typed.
 *
 * Moved here verbatim from the account-list column that the filter panel
 * replaced: UI04 forbids emoji and character icons, so every platform is a
 * hand-written 16×16 outline path that inherits `currentColor`.
 */

/** @param {string} platform */
export function RivalPlatformMark({ platform }) {
  const paths = {
    tiktok: 'M8 3v7.2a3 3 0 1 0 2.4 2.95V6.6a4.6 4.6 0 0 0 3 1.1V4.9A3.6 3.6 0 0 1 10.4 3H8Z',
    instagram: 'M5.5 2h5A3.5 3.5 0 0 1 14 5.5v5A3.5 3.5 0 0 1 10.5 14h-5A3.5 3.5 0 0 1 2 10.5v-5A3.5 3.5 0 0 1 5.5 2Zm2.5 3.4A2.6 2.6 0 1 0 10.6 8 2.6 2.6 0 0 0 8 5.4Zm3.6-.9a.7.7 0 1 0 .7.7.7.7 0 0 0-.7-.7Z',
    youtube: 'M2.4 5.6A2 2 0 0 1 4.2 4c2.4-.2 5.2-.2 7.6 0a2 2 0 0 1 1.8 1.6 18 18 0 0 1 0 4.8A2 2 0 0 1 11.8 12c-2.4.2-5.2.2-7.6 0a2 2 0 0 1-1.8-1.6 18 18 0 0 1 0-4.8ZM6.8 6.2v3.6L9.9 8 6.8 6.2Z',
    x: 'M3 2.6h3.3l2.6 3.5 3-3.5H14l-4.3 5 4.6 6.2h-3.3L8.2 10l-3.3 3.8H2.7l4.6-5.2L3 2.6Z',
    facebook: 'M9.6 2a3.6 3.6 0 0 0-3.6 3.6V7H4.6v2.2H6V14h2.3V9.2h1.6l.3-2.2H8.3V5.8c0-.5.2-.8.8-.8h1V2.1A9 9 0 0 0 9.6 2Z',
    threads: 'M9.9 7.5a3.7 3.7 0 0 0-1.2-.5c-.1-1.1-.6-1.8-1.5-1.8-.6 0-1.1.3-1.4.9l1 .6c.2-.3.4-.4.5-.4.4 0 .6.3.7 1a6 6 0 0 0-1.2.2C5.6 7.8 4.9 8.6 5 9.6c0 1.2 1 1.9 2.1 1.8 1-.1 1.7-.7 1.9-1.6.3.2.6.4.8.7.5.7.5 1.7-.3 2.4-.6.6-1.5.9-2.4.8-1.8-.1-3-1.2-3-3.7s1.2-3.6 3.1-3.7c1.3-.1 2.2.4 2.7 1.2Z',
  }
  const d = paths[platform] || paths.x
  return (
    <svg className="omnimux-rival-platform-mark" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  )
}
