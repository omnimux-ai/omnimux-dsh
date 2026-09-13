/**
 * Inline vector marks for the TikTok scene trigger and its menu.
 *
 * The content script is built as an IIFE with no React runtime, so the panel's
 * `SvgIcon` components cannot be reused here. The three action marks mirror that
 * set's graphic language — a 24x24 viewBox with ~2px round strokes painted in
 * `currentColor`, so CSS alone drives every state.
 *
 * The brand mark is the official ghost, transcribed from
 * `assets/icons/icon.svg`: the same path, the same two group transforms and the
 * same eye capsules, with the lavender tile dropped so the silhouette can be
 * painted in `currentColor` on the dark pill. It is not redrawn — a hand-tuned
 * approximation reads as a different character next to the real logo.
 *
 * `BRAND_VIEW_BOX` is measured, not estimated: rasterising that file
 * (`rsvg-convert`) and trimming the ink (`magick -trim`) reports 702x851 at
 * +276+193 on the 1254-unit canvas, and those four numbers are what crop the
 * mark to its edges instead of leaving a two-thirds-empty box.
 *
 * @module
 */

import type { TiktokAction } from './copy.ts'

/** The ghost's ink box on the source canvas, measured from the asset. */
export const BRAND_VIEW_BOX = '276 193 702 851'

/**
 * The official ghost silhouette, verbatim from `assets/icons/icon.svg`.
 *
 * One `path` in the asset's own 12540-unit space, drawn through the two group
 * transforms the asset declares: the file's `0.1 / -0.1` flip into the 1254
 * canvas, then its centred `0.9` fit inside the tile.
 */
export const BRAND_GHOST_PATH = 'M6140 11075 c-139 -45 -194 -180 -155 -380 64 -321 -32 -625 -266 -851 -124 -119 -249 -191 -570 -330 -668 -288 -1134 -629 -1523 -1116 -386 -481 -639 -1054 -746 -1689 -42 -253 -54 -430 -47 -728 7 -336 18 -419 137 -1061 102 -550 86 -978 -48 -1263 -62 -133 -119 -212 -257 -357 -127 -134 -182 -205 -225 -290 -113 -221 -83 -455 80 -633 77 -84 163 -140 265 -174 69 -23 97 -27 205 -27 186 -1 248 20 506 170 152 88 208 107 314 108 75 1 91 -3 140 -28 80 -42 165 -135 239 -262 183 -314 288 -417 499 -492 69 -24 91 -27 212 -27 146 1 196 11 318 66 111 50 203 120 368 280 173 167 248 227 362 283 189 95 420 102 619 19 110 -47 208 -121 388 -293 180 -172 287 -251 404 -300 152 -62 333 -78 471 -39 217 60 345 181 541 513 78 133 156 216 235 253 50 23 72 27 144 27 102 -1 153 -18 290 -100 290 -173 465 -215 679 -164 115 28 193 71 276 155 143 143 202 333 161 523 -31 147 -88 237 -274 434 -66 70 -141 156 -166 192 -67 93 -133 240 -169 374 -31 117 -31 118 -31 382 -1 294 9 398 70 715 37 193 84 492 106 670 8 71 13 228 13 445 -1 356 -6 421 -61 720 -194 1062 -829 1958 -1753 2476 -230 129 -268 182 -312 441 -29 171 -60 278 -119 401 -199 417 -609 800 -1005 937 -98 34 -244 43 -315 20z'

/** Shared root attributes for an outlined 24-unit mark. */
const SVG_OUTLINE_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" '
  + 'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"'

/** Inner markup per action; each entry is a real vector path, never a glyph. */
const ACTION_PATHS: Record<TiktokAction, string> = {
  video:
    '<path d="M12 3v11"/><path d="m7.5 9.5 4.5 4.5 4.5-4.5"/>'
    + '<path d="M4 17.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5"/>',
  audio:
    '<path d="M4 10v4"/><path d="M8 6.5v11"/><path d="M12 4v16"/>'
    + '<path d="M16 7.5v9"/><path d="M20 10.5v3"/>',
  save: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2L5.5 20.5v-16a1 1 0 0 1 1-1Z"/>',
}

/** The mark for one menu row. */
export function actionIcon(action: TiktokAction, size = 19): string {
  return `<svg ${SVG_OUTLINE_ATTRS} width="${size}" height="${size}">${ACTION_PATHS[action]}</svg>`
}

/**
 * The official OmniMux ghost.
 *
 * The eyes are authored as separate capsules in the asset — they are knocked out
 * of the silhouette rather than drawn on top of it — so they carry their own
 * class and are filled from CSS with the surface colour behind the mark.
 */
export function brandIcon(size = 20): string {
  return `<svg viewBox="${BRAND_VIEW_BOX}" width="${size}" height="${size}" fill="none" aria-hidden="true" focusable="false">`
    + '<g transform="translate(627 627) scale(0.9) translate(-627 -627)">'
    + `<g transform="translate(0 1254) scale(0.1 -0.1)" fill="currentColor" stroke="none"><path d="${BRAND_GHOST_PATH}"/></g>`
    + '<rect x="447" y="562" width="75" height="172" rx="37.5" ry="37.5" class="omx-eye"/>'
    + '<rect x="731" y="562" width="75" height="172" rx="37.5" ry="37.5" class="omx-eye"/>'
    + '</g></svg>'
}

/** The settled mark a row swaps in once its work is done. */
export function checkIcon(size = 19): string {
  return `<svg ${SVG_OUTLINE_ATTRS} width="${size}" height="${size}"><path d="m5 12.5 4.5 4.5L19 7"/></svg>`
}
