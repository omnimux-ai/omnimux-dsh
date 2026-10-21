import './dom-bootstrap.mjs'

/**
 * These jsdom gates assert DOM and behavior, with the kit's existing leaf shim.
 * Keep direct official primitives (including Menu) real, while omitting their
 * CSS imports: jsdom cannot measure layout and these bundles have no CSS output.
 * Bootstrap the existing DOM before browser-conditioned dependencies evaluate.
 * Do not use this configuration for real-browser or visual acceptance.
 */
export const DOM_RENDER_LOADERS = Object.freeze({ '.module.css': 'empty', '.css': 'empty' })
