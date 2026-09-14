import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { HUB_CSS } from './styles.js'
import { ensureComposerCompactChrome } from './composer-compact.js'

describe('composer visual e2e integration (issue #1707)', () => {
  it('hides ContextMeter token usage progress ring and renders transparent 3D model icon in composer DOM', () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html data-omnimux-composer-density="short">
        <head></head>
        <body>
          <div data-composer-card>
            <div class="Q7WfXG_trailing">
              <button aria-haspopup="menu" class="Ns6z9q_trigger">
                <svg class="Ns6z9q_triggerIcon"><path d="M1 1"/></svg>
                <span class="Ns6z9q_triggerLabel">gpt-4o</span>
                <svg class="Ns6z9q_chevron"><path d="M2 2"/></svg>
              </button>
              <span class="JdJrwG_root">
                <button type="button" aria-label="上下文已用 35%">
                  <svg><circle class="JdJrwG_fill"/></svg>
                </button>
              </span>
              <button class="primary" aria-label="发送">发送</button>
            </div>
          </div>
        </body>
      </html>
    `, { runScripts: 'dangerously' })

    const { window } = dom
    const { document } = window
    globalThis.document = document
    globalThis.window = window

    // Inject HUB_CSS
    const hubStyle = document.createElement('style')
    hubStyle.id = 'omnimux-hub-styles'
    hubStyle.textContent = HUB_CSS
    document.head.appendChild(hubStyle)

    // Inject compact chrome styles
    ensureComposerCompactChrome(document)

    // 1. Verify ContextMeter is targeted by defensive hide rules
    assert.match(HUB_CSS, /button\[aria-label\*="上下文已用"\]/)
    assert.match(HUB_CSS, /\.JdJrwG_root/)

    // 2. Verify model select button has transparent background rule
    const allStyles = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\n')
    assert.match(allStyles, /\[data-composer-card\] \[class\*="trailing"\] button\[aria-haspopup='menu'\]\{[^}]*background:transparent!important/)

    // 3. Verify triggerIcon is masked as 3D model icon
    assert.match(allStyles, /\[data-composer-card\] \[class\*="trailing"\] button\[aria-haspopup='menu'\] \[class\*="triggerIcon"\]\{[^}]*mask-image:var\(--omnimux-model-icon\)!important/)

    // 4. Verify native triggerIcon children are suppressed
    assert.match(allStyles, /\[data-composer-card\] \[class\*="trailing"\] button\[aria-haspopup='menu'\] \[class\*="triggerIcon"\] \*\{[^}]*display:none!important/)

    // 5. Verify --omnimux-model-icon is declared at [data-composer-card] root scope to prevent unmasked white box
    assert.match(allStyles, /\[data-composer-card\]\{[^}]*--omnimux-model-icon:url\(/)
  })
})
