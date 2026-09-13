/**
 * The overlay stylesheet, as the single string the shadow root receives.
 *
 * A content script has no CSS file channel, so `styles.css` is imported with
 * `?inline`: the build minifies the stylesheet and inlines it here as a string.
 * That keeps the styles authored as real CSS (highlighting, linting, one owner
 * per rule) while `content.js` carries only the minified form.
 *
 * @module
 */

import inlineStyles from './styles.css?inline'

/** Inline stylesheet injected into the shadow root by `overlay.ts`. */
export const OVERLAY_STYLES: string = inlineStyles
