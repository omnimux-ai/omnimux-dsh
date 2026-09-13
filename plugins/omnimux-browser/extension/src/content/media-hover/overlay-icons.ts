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
export type CapsuleIcon = 'bulb' | 'copy' | 'bubble' | 'plus' | 'check' | 'external' | 'star' | 'brand'

/** Shared root attributes. `aria-hidden` keeps the mark out of the a11y tree. */
export const SVG_ROOT_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"'

const ICON_PATHS: Record<CapsuleIcon, string> = {
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
  // Plus: the split affordance.
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
  // Brand micro-mark: a squircle with the OmniMux seam.
  brand: [
    '<rect x="4" y="4" width="16" height="16" rx="5.2"/>',
    '<path d="M8.6 15.4V10l3.4 5.4L15.4 10v5.4"/>',
  ].join(''),
}

/**
 * Builds the SVG markup for one capsule icon.
 *
 * @param name - Icon key from {@link CapsuleIcon}.
 * @param size - Rendered square size in CSS pixels; defaults to the icon box.
 */
export function svgIcon(name: CapsuleIcon, size = 18): string {
  return `<svg ${SVG_ROOT_ATTRS} width="${size}" height="${size}">${ICON_PATHS[name]}</svg>`
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
