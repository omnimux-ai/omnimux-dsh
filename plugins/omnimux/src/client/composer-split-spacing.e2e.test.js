import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ensureComposerCompactChrome } from './composer-compact.js'

describe('composer native geometry preservation e2e verification', () => {
  it('does not interfere with native composer-card max-width and margins in fullscreen mode', () => {
    let styleTag = null
    const doc = {
      getElementById(id) {
        return styleTag?.id === id ? styleTag : null
      },
      createElement(tag) {
        return {
          id: '',
          textContent: '',
        }
      },
      head: {
        append(el) {
          styleTag = el
        },
      },
    }

    const style = ensureComposerCompactChrome(doc)
    assert.ok(style, 'compact chrome style tag must exist')
    const css = style.textContent

    // 1. Verify card is NOT forced to 100% max-width or full-width stretch
    assert.doesNotMatch(css, /\[data-composer-card\]\{\s*width:100%!important/)
    assert.doesNotMatch(css, /\[data-composer-card\]\{\s*max-width:100%!important/)

    // 2. Verify composerSeat does not force 25px padding that destroys native centering
    assert.doesNotMatch(css, /padding-left:25px!important/)
    assert.doesNotMatch(css, /padding-right:25px!important/)

    // 3. Verify content-width is not forcibly overridden to 0.92
    assert.doesNotMatch(css, /--dsh-chat-content-width:min\(/)

    // 4. Verify composerStack width is not forced to calc(100% - 24px)
    assert.doesNotMatch(css, /\[data-composer-seat\] \[class\*="composerStack"\]\{\s*width:calc\(100% - 24px\)!important/)
  })
})
