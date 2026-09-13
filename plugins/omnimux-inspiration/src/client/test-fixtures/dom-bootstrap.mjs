/**
 * A document has to exist before `react-dom` is evaluated.
 *
 * `react-dom` snapshots its "is there a DOM" answer in module scope and, when it
 * says no, replaces its `onChange` support with the branch meant for browsers
 * without an `input` event (IE9). In that branch a dispatched `input` never
 * reaches a handler at all — clicks work, typing silently does nothing, and a
 * gate that drives a text field ends up testing a dialog that can never be
 * submitted.
 *
 * Import this module BEFORE `react-dom`. ESM evaluates imports in order, so a
 * module-level `import './test-fixtures/dom-bootstrap.mjs'` placed above the
 * `react-dom/client` import is what puts the document in place in time.
 */

import { JSDOM } from 'jsdom'

const bootstrap = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost:3000' })

globalThis.window = bootstrap.window
globalThis.document = bootstrap.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true
