/**
 * Inline vector icon constants for the hover capsule.
 *
 * The content script is built as an IIFE with no React runtime, so the React
 * `SvgIcon` components in `panel/components/icons.tsx` cannot be reused here.
 * These string builders mirror that set's graphic language: a 24x24 viewBox
 * with 2px round strokes painted in `currentColor`, so CSS drives the state.
 *
 * Every mark is a real vector path — no emoji, no icon glyph characters.
 *
 * @module
 */

/** Marks drawn as outlines; the checked/active look is a CSS fill. */
export type CapsuleIcon = 'brand' | 'bulb' | 'copy' | 'bubble' | 'plus' | 'check' | 'external' | 'star'

/** Shared root attributes. `aria-hidden` keeps the mark out of the a11y tree. */
export const SVG_ROOT_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"'

/**
 * Root attributes for a solid brand silhouette.
 *
 * The brand mark is a filled shape — a stroked outline of the same drawing
 * reads as a hole at 20px — so it overrides the outline attributes above.
 * `evenodd` is what cuts the two capsule eyes out of the ghost body.
 */
export const SVG_FILLED_ROOT_ATTRS =
  'viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" stroke="none" ' +
  'aria-hidden="true" focusable="false"'

/**
 * The official OmniMux ghost IP, transcribed onto the shared 24-unit grid.
 *
 * Source of truth: `assets/ip_design/octo_ghost_vector.svg` (1254-unit tile;
 * same geometry as `web/public/logo.svg` and this repo's
 * `extension/assets/icons/icon.svg`). The outline is the official path verbatim
 * under one exact affine transform, and the two eyes are the official
 * `75 x 172 rx = ry = 37.5` rects rewritten as capsule subpaths of the *same*
 * `<path>` — the ghost is one `path`, so a single `fill-rule="evenodd"` cuts
 * both eyes out and `fill="currentColor"` paints the whole mark in one colour.
 *
 * Do not redraw this by hand. An earlier revision was a hand-tuned approximation
 * (narrower body, circular eyes) and read as a different character next to the
 * official logo.
 *
 * Transcription: `s = 24 / 944.75` (ink height fitted to the grid), horizontally
 * centred (`X0 = (24 - 779.75 * s) / 2`), ghost points mapped by
 * `x' = Ax + k * x`, `y' = Ay - k * y` with `k = 0.1 * s`. Verified by
 * rasterising the candidate and the official path under the same transform:
 * identical ink bbox `198x240+21+0` at 240px, normalised RMSE `0.0004`, and both
 * eye holes fully formed from 24px up.
 */
const BRAND_GHOST_PATH =
  'M11.6666 0.0318c-0.3531 0.1143 -0.4928 0.4573 -0.3938 0.9653c0.1626 0.8155 -0.0813 1.5877 -0.6757 2.'
  + '1618c-0.315 0.3023 -0.6325 0.4852 -1.448 0.8383c-1.697 0.7316 -2.8808 1.5979 -3.869 2.835c-0.9806 1.'
  + '2219 -1.6233 2.6775 -1.8951 4.2907c-0.1067 0.6427 -0.1372 1.0924 -0.1194 1.8494c0.0178 0.8536 0.0457'
  + ' 1.0644 0.348 2.6953c0.2591 1.3972 0.2185 2.4845 -0.1219 3.2085c-0.1575 0.3379 -0.3023 0.5386 -0.652'
  + '9 0.9069c-0.3226 0.3404 -0.4623 0.5208 -0.5716 0.7367c-0.2871 0.5614 -0.2108 1.1559 0.2032 1.608c0.1'
  + '956 0.2134 0.4141 0.3556 0.6732 0.442c0.1753 0.0584 0.2464 0.0686 0.5208 0.0686c0.4725 0.0025 0.63 -'
  + '0.0508 1.2854 -0.4319c0.3861 -0.2236 0.5284 -0.2718 0.7977 -0.2744c0.1905 -0.0025 0.2312 0.0076 0.35'
  + '56 0.0711c0.2032 0.1067 0.4192 0.3429 0.6071 0.6656c0.4649 0.7977 0.7316 1.0593 1.2676 1.2499c0.1753'
  + ' 0.061 0.2312 0.0686 0.5386 0.0686c0.3709 -0.0025 0.4979 -0.0279 0.8078 -0.1677c0.282 -0.127 0.5157 '
  + '-0.3048 0.9349 -0.7113c0.4395 -0.4242 0.63 -0.5767 0.9196 -0.7189c0.4801 -0.2413 1.0669 -0.2591 1.57'
  + '25 -0.0483c0.2794 0.1194 0.5284 0.3074 0.9857 0.7443c0.4573 0.4369 0.7291 0.6376 1.0263 0.7621c0.386'
  + '1 0.1575 0.8459 0.1981 1.1965 0.0991c0.5513 -0.1524 0.8764 -0.4598 1.3743 -1.3032c0.1981 -0.3379 0.3'
  + '963 -0.5487 0.597 -0.6427c0.127 -0.0584 0.1829 -0.0686 0.3658 -0.0686c0.2591 0.0025 0.3887 0.0457 0.'
  + '7367 0.254c0.7367 0.4395 1.1813 0.5462 1.7249 0.4166c0.2921 -0.0711 0.4903 -0.1804 0.7011 -0.3938c0.'
  + '3633 -0.3633 0.5132 -0.8459 0.409 -1.3286c-0.0788 -0.3734 -0.2236 -0.6021 -0.6961 -1.1025c-0.1677 -0'
  + '.1778 -0.3582 -0.3963 -0.4217 -0.4877c-0.1702 -0.2363 -0.3379 -0.6097 -0.4293 -0.9501c-0.0788 -0.297'
  + '2 -0.0788 -0.2998 -0.0788 -0.9704c-0.0025 -0.7469 0.0229 -1.0111 0.1778 -1.8164c0.094 -0.4903 0.2134'
  + ' -1.2499 0.2693 -1.702c0.0203 -0.1804 0.033 -0.5792 0.033 -1.1305c-0.0025 -0.9044 -0.0152 -1.0695 -0'
  + '.155 -1.8291c-0.4928 -2.6979 -2.106 -4.974 -4.4532 -6.2899c-0.5843 -0.3277 -0.6808 -0.4623 -0.7926 -'
  + '1.1203c-0.0737 -0.4344 -0.1524 -0.7062 -0.3023 -1.0187c-0.5055 -1.0593 -1.5471 -2.0323 -2.5531 -2.38'
  + '03c-0.249 -0.0864 -0.6198 -0.1092 -0.8002 -0.0508ZM7.4242 11.5396A0.9526 0.9526 0 0 1 9.3295 11.5396'
  + 'L9.3295 14.0037A0.9526 0.9526 0 0 1 7.4242 14.0037ZM14.6388 11.5396A0.9526 0.9526 0 0 1 16.5441 11.5'
  + '396L16.5441 14.0037A0.9526 0.9526 0 0 1 14.6388 14.0037Z'

const ICON_PATHS: Record<CapsuleIcon, string> = {
  // The stage-one trigger: the OmniMux ghost, drawn as a solid silhouette.
  brand: `<path d="${BRAND_GHOST_PATH}"/>`,
  // Lightbulb: "keep this idea".
  bulb: [
    '<path d="M9 18h6"/>',
    '<path d="M10 21.5h4"/>',
    '<path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.77c.5.36.8.94.8 1.55V18h6v-2.18c0-.61.3-1.19.8-1.55A6.5 6.5 0 0 0 12 2.5Z"/>',
  ].join(''),
  // Two sheets: "copy the link".
  copy: [
    '<rect x="9" y="9" width="11.5" height="11.5" rx="2.5"/>',
    '<path d="M5.5 15H5A1.5 1.5 0 0 1 3.5 13.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5"/>',
  ].join(''),
  // Round bubble with a square speech tail: "send it into the chat".
  bubble: [
    '<path d="M20.5 12.25v8.25h-5.6"/>',
    '<path d="M14.9 20.5v-5.2h5.6"/>',
    '<path d="M20.5 12.25a8.5 8.5 0 0 0-4.06-7.29"/>',
    '<path d="M12 3.75a8.5 8.5 0 1 0 4.44 15.75"/>',
  ].join(''),
  // Plus: the in-flight mark an action wears while it runs.
  plus: '<path d="M12 4.5v15"/><path d="M4.5 12h15"/>',
  // Check: saved / copied confirmation.
  check: '<path d="M20.5 6.5 9.8 17.5 3.8 11.6"/>',
  // Open elsewhere: used when the attach falls back to the side panel.
  external: [
    '<path d="M13.5 4.5H19a.5.5 0 0 1 .5.5v5.5"/>',
    '<path d="M19.2 4.8 11.5 12.5"/>',
    '<path d="M18 14.6V19a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5h4.4"/>',
  ].join(''),
  // Star: the filled "kept" state of the lightbulb button.
  star: '<path d="M12 3.6l2.6 5.3 5.9.86-4.25 4.14 1 5.9L12 17.02l-5.25 2.78 1-5.9L3.5 9.76l5.9-.86Z"/>',
}

/**
 * Builds the SVG markup for one capsule icon.
 *
 * @param name - Icon key from {@link CapsuleIcon}.
 * @param size - Rendered square size in CSS pixels; defaults to the icon box.
 */
export function svgIcon(name: CapsuleIcon, size = 18): string {
  const root = name === 'brand' ? SVG_FILLED_ROOT_ATTRS : SVG_ROOT_ATTRS
  return `<svg ${root} width="${size}" height="${size}">${ICON_PATHS[name]}</svg>`
}

/** Replaceable icons the capsule swaps in place for a confirmed action. */
export const ICON_BY_ACTION = {
  inspiration: 'bulb',
  copy: 'copy',
  attach: 'bubble',
} as const

/** Marks drawn only while an action is running or settled. */
export const STATE_ICON = {
  busy: 'plus',
  done: 'check',
  fallback: 'external',
} as const
