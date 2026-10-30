// Test environment setup: expose DOM globals that jsdom provides on window
// but dsh-client-ui-primitives@0.2.1-rc.3 expects on globalThis.
// This runs before any test file via `node --import`.
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
const globals = ['requestAnimationFrame', 'cancelAnimationFrame', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'getComputedStyle', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'CustomEvent', 'Event', 'MouseEvent', 'KeyboardEvent', 'PointerEvent']
for (const name of globals) {
  if (dom.window[name] !== undefined && globalThis[name] === undefined) {
    Object.defineProperty(globalThis, name, {
      value: typeof dom.window[name] === 'function' && dom.window[name].bind ? dom.window[name].bind(dom.window) : dom.window[name],
      writable: true,
      configurable: true,
    })
  }
}
