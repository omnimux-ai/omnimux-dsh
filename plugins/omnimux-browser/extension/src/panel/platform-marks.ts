/**
 * Platform glyph data for the page card's platform mark.
 *
 * The card already showed the platform *name* from the page sensor while the
 * mark beside it was hard-coded to X, so a TikTok page read "TikTok" next to a
 * Twitter glyph. This table is the missing half: one drawing per platform, and a
 * generic web mark for anything else.
 *
 * Both brand paths are transcriptions of drawings this repo already ships — X
 * from `components/icons.tsx`, TikTok from the inspiration client's
 * `RivalPlatformMark.jsx`, which is the only hand-checked TikTok path in the
 * repository. Nothing here is a newly hand-drawn logo, and this module is
 * deliberately the only owner of the data so a second copy cannot drift.
 *
 * The fallback is *not* X. "We do not recognise this platform" must never render
 * as "this is Twitter", which is precisely the bug this table fixes. Platforms
 * that the sensor detects but that have no checked drawing yet (Zhihu, WeChat)
 * therefore land on the web mark rather than on a brand they are not.
 *
 * @module
 */

/** One platform drawing. */
export interface PlatformGlyph {
  /** The SVG viewBox the path is authored against. */
  viewBox: string
  /** Filled path data, painted in `currentColor`. */
  path: string
}

/** X (formerly Twitter) on the shared 24-unit grid. */
const X_PATH =
  'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68'
  + 'l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'

/**
 * TikTok's music-note mark on its own 16-unit grid.
 *
 * Transcribed from `plugins/omnimux-inspiration/src/client/RivalPlatformMark.jsx`.
 */
const TIKTOK_PATH = 'M8 3v7.2a3 3 0 1 0 2.4 2.95V6.6a4.6 4.6 0 0 0 3 1.1V4.9A3.6 3.6 0 0 1 10.4 3H8Z'

/**
 * A generic page: window frame with its title bar, on the 24-unit grid.
 *
 * Painted with `fill-rule: evenodd` so the inner rectangle knocks the body out,
 * leaving an outline plus a bar. Local drawing, not a brand mark.
 */
const WEB_PATH = 'M4.5 3h15A2.5 2.5 0 0 1 22 5.5v13A2.5 2.5 0 0 1 19.5 21h-15A2.5 2.5 0 0 1 2 18.5v-13A2.5 2.5 0 0 1 4.5 3ZM4 6.5v12h16v-12H4Z'

/** Every platform that has a checked drawing. */
export const PLATFORM_GLYPHS: Record<string, PlatformGlyph> = {
  twitter: { viewBox: '0 0 24 24', path: X_PATH },
  tiktok: { viewBox: '0 0 16 16', path: TIKTOK_PATH },
  generic: { viewBox: '0 0 24 24', path: WEB_PATH },
}

/**
 * The drawing for one platform.
 *
 * Unknown, empty and absent platforms all answer with the generic web mark: the
 * caller renders whatever this returns, so it must always return something the
 * user can read as "a page" rather than as somebody else's brand.
 * @param platform platform key as reported by the page sensor
 */
export function platformGlyph(platform: string | undefined): PlatformGlyph {
  const key = String(platform ?? '').trim().toLowerCase()
  // `hasOwn`, not `??`: the table is an ordinary object literal, so a key like
  // `constructor` or `__proto__` finds an inherited member, `??` sees a truthy
  // value, and the caller renders a mark with no path at all.
  return Object.hasOwn(PLATFORM_GLYPHS, key) ? PLATFORM_GLYPHS[key] : PLATFORM_GLYPHS.generic
}
