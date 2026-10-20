/**
 * Platform presentation data shared by the account row, the post cards, the
 * preview modal and the account-monitor platform filter.
 *
 * Pure (no React, no I/O) so the glyph and dropdown contracts can be asserted
 * directly: UI04 forbids emoji and character icons, so every platform is a
 * hand-written 16×16 path that inherits `currentColor`.
 */

import { RIVAL_PLATFORMS } from '../rival/constants.js'

/**
 * Hand-written 16×16 glyph per monitorable platform.
 *
 * An unknown platform gets the neutral globe instead of another platform's
 * logo: falling back to the X mark used to label a Douyin row as X, and a wrong
 * glyph is worse than a generic one.
 * @type {Readonly<Record<string, string>>}
 */
export const RIVAL_PLATFORM_PATHS = Object.freeze({
  tiktok: 'M8 3v7.2a3 3 0 1 0 2.4 2.95V6.6a4.6 4.6 0 0 0 3 1.1V4.9A3.6 3.6 0 0 1 10.4 3H8Z',
  instagram: 'M5.5 2h5A3.5 3.5 0 0 1 14 5.5v5A3.5 3.5 0 0 1 10.5 14h-5A3.5 3.5 0 0 1 2 10.5v-5A3.5 3.5 0 0 1 5.5 2Zm2.5 3.4A2.6 2.6 0 1 0 10.6 8 2.6 2.6 0 0 0 8 5.4Zm3.6-.9a.7.7 0 1 0 .7.7.7.7 0 0 0-.7-.7Z',
  youtube: 'M2.4 5.6A2 2 0 0 1 4.2 4c2.4-.2 5.2-.2 7.6 0a2 2 0 0 1 1.8 1.6 18 18 0 0 1 0 4.8A2 2 0 0 1 11.8 12c-2.4.2-5.2.2-7.6 0a2 2 0 0 1-1.8-1.6 18 18 0 0 1 0-4.8ZM6.8 6.2v3.6L9.9 8 6.8 6.2Z',
  x: 'M3 2.6h3.3l2.6 3.5 3-3.5H14l-4.3 5 4.6 6.2h-3.3L8.2 10l-3.3 3.8H2.7l4.6-5.2L3 2.6Z',
  // Facebook / Threads keep their glyphs even though the monitor does not import
  // them: rivals' rows are the only consumer, but a stored or legacy row must not
  // fall back to a wrong logo.
  facebook: 'M9.6 2a3.6 3.6 0 0 0-3.6 3.6V7H4.6v2.2H6V14h2.3V9.2h1.6l.3-2.2H8.3V5.8c0-.5.2-.8.8-.8h1V2.1A9 9 0 0 0 9.6 2Z',
  threads: 'M9.9 7.5a3.7 3.7 0 0 0-1.2-.5c-.1-1.1-.6-1.8-1.5-1.8-.6 0-1.1.3-1.4.9l1 .6c.2-.3.4-.4.5-.4.4 0 .6.3.7 1a6 6 0 0 0-1.2.2C5.6 7.8 4.9 8.6 5 9.6c0 1.2 1 1.9 2.1 1.8 1-.1 1.7-.7 1.9-1.6.3.2.6.4.8.7.5.7.5 1.7-.3 2.4-.6.6-1.5.9-2.4.8-1.8-.1-3-1.2-3-3.7s1.2-3.6 3.1-3.7c1.3-.1 2.2.4 2.7 1.2Z',
  // 抖音：八分音符，音符头在左下、符尾向右上展开（与 TikTok 的走向区分）。
  douyin: 'M10 2.4c.2 1.5 1.2 2.6 2.7 2.9v2.2a5 5 0 0 1-2.7-1v4.1a3.9 3.9 0 1 1-3.6-3.9v2.2a1.7 1.7 0 1 0 1.4 1.7V2.4H10Z',
  // 小红书：摊开的书（两页 + 页缝），对应「小红书」的笔记语义。
  xiaohongshu: 'M8 4.6C6.9 3.7 5.3 3.2 3.4 3.2v8.4c1.9 0 3.5.5 4.6 1.4 1.1-.9 2.7-1.4 4.6-1.4V3.2C10.7 3.2 9.1 3.7 8 4.6Zm-.9 1.6c-.8-.5-1.8-.8-2.8-.9v6.1c1 .1 2 .4 2.8.9V6.2Zm1.8 0c.8-.5 1.8-.8 2.8-.9v6.1c-1 .1-2 .4-2.8.9V6.2Z',
  // 未知平台：中性地球，不冒充任何平台。
  unknown: 'M8 2.6a5.4 5.4 0 1 0 0 10.8A5.4 5.4 0 0 0 8 2.6Zm0 1.2c.9 0 1.6 1.3 1.8 3H6.2c.2-1.7.9-3 1.8-3Zm-2 4.2h4c0 .8-.1 1.5-.3 2.2H6.3a6.6 6.6 0 0 1-.3-2.2Zm-1.5 0h.3c0 .8.1 1.5.3 2.2h-.6a4.2 4.2 0 0 1 0-2.2Zm6.9 0h.3a4.2 4.2 0 0 1 0 2.2h-.6c.2-.7.3-1.4.3-2.2Z',
})

/**
 * Path of a platform's glyph; the neutral globe for anything unrecognized.
 * @param {string} platform
 * @returns {string}
 */
export function platformMarkPath(platform) {
  return RIVAL_PLATFORM_PATHS[platform] || RIVAL_PLATFORM_PATHS.unknown
}

/**
 * Platform filter options of the account monitor, built from the module's own
 * platform slugs and locale table.
 *
 * The slug list is `RIVAL_PLATFORMS`, so a newly monitorable platform cannot
 * appear in the account rows while missing from the dropdown.
 * @param {(key: string) => string} t
 * @returns {Array<{ value: string, label: string }>}
 */
export function buildRivalPlatformOptions(t) {
  return [
    { value: '', label: t('platform.all') },
    ...RIVAL_PLATFORMS.map((platform) => ({ value: platform, label: t(`platform.${platform}`) })),
  ]
}
