import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { installWelcomeGreetingObserver, WELCOME_HEADER_SELECTOR } from '../../src/client/welcome-greeting.js'

test('e2e: session compact welcome header mounts on split mode and unmounts on exit', () => {
  const dom = new JSDOM(`<!doctype html>
    <html>
      <body>
        <div class="dshDesktopFrame">
          <aside class="dshDesktopSidebarSurface" style="width: 280px;"></aside>
          <main class="dshDesktopConversationSurface">
            <div data-phase="hero">
              <div class="composerHero">
                <div>
                  <div class="headline">原有居中文案</div>
                </div>
              </div>
            </div>
          </main>
          <aside class="dshDesktopRightbarSurface">
            <div data-sidebar-right-panel="push" data-sidebar-right-open="true"></div>
          </aside>
        </div>
      </body>
    </html>`, {
    url: 'http://127.0.0.1:45120/',
  })

  const doc = dom.window.document
  const cleanup = installWelcomeGreetingObserver(doc)

  // 1. In split mode, the welcome header is mounted and old headline hidden
  const welcome = doc.querySelector(WELCOME_HEADER_SELECTOR)
  assert.ok(welcome, 'welcome header should be mounted in split mode')
  assert.match(welcome.textContent, /你好，老钟/)
  assert.match(welcome.textContent, /属于你的AI社媒运营团队/)
  assert.equal(doc.querySelector('.headline').style.display, 'none')

  // 2. When right panel closes, welcome header hides and old headline restores
  const panel = doc.querySelector('[data-sidebar-right-panel]')
  panel.removeAttribute('data-sidebar-right-open')
  // Trigger mutation or sync
  dom.window.dispatchEvent(new dom.window.CustomEvent('resize'))
  cleanup()

  // 3. After cleanup, welcome header is removed
  assert.equal(doc.querySelector(WELCOME_HEADER_SELECTOR), null)
})
