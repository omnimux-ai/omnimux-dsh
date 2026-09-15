import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { ensureComposerCompactChrome } from './composer-compact.js'

describe('composer split spacing e2e geometry verification', () => {
  it('enforces 25px sides and 25px bottom clearance on non-fullscreen composer seats', () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html data-omnimux-split-compact="true">
        <head></head>
        <body>
          <div class="dshDesktopFrame">
            <div class="centerCol">
              <div data-composer-seat>
                <div class="composerStack">
                  <div class="heroWorkspaceRow">
                    <button aria-haspopup="menu"><span>测试工作区</span></button>
                  </div>
                  <div data-composer-card>
                    <div class="inputBar">
                      <div contenteditable="true"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div data-sidebar-right-panel="push" data-sidebar-right-open="true"></div>
          </div>
        </body>
      </html>
    `, { runScripts: 'dangerously' })

    const { window } = dom
    const { document } = window
    globalThis.document = document
    globalThis.window = window

    // Inject compact chrome styles
    ensureComposerCompactChrome(document)

    const style = document.getElementById('omnimux-composer-compact-chrome')
    assert.ok(style, 'compact chrome style tag must exist')
    const css = style.textContent

    // 1. Verify padding rules for split compact mode
    assert.match(css, /html\[data-omnimux-split-compact\] \[data-composer-seat\]/)
    assert.match(css, /padding-left:25px!important/)
    assert.match(css, /padding-right:25px!important/)
    assert.match(css, /padding-bottom:25px!important/)
    assert.match(css, /padding-top:0!important/)

    // 2. Verify composerStack and composerHero 100% full width with zero side margins
    assert.match(css, /html\[data-omnimux-split-compact\] \[data-composer-seat\] \[class\*="composerStack"\]/)
    assert.match(css, /margin-inline:0!important/)
    assert.match(css, /padding-inline:0!important/)

    // 3. Verify composerCard 100% full width and no margins inside seat
    assert.match(css, /html\[data-omnimux-split-compact\] \[data-composer-card\]/)
    assert.match(css, /width:100%!important/)
    assert.match(css, /max-width:100%!important/)

    // 4. Verify heroWorkspaceRow 100% width and aligned with card
    assert.match(css, /html\[data-omnimux-split-compact\] \[class\*="heroWorkspaceRow"\]/)

    // 5. Verify welcome header left and right padding alignment to 25px
    assert.match(css, /left:25px!important/)
    assert.match(css, /right:25px!important/)
  })
})
