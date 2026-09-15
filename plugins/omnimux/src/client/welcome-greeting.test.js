import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  isSplitMode,
  resolveGreetingUserName,
  createWelcomeHeaderElement,
  syncWelcomeGreeting,
  installWelcomeGreetingObserver,
  WELCOME_HEADER_SELECTOR,
} from './welcome-greeting.js'

function setupDom(html = '') {
  const dom = new JSDOM(html || '<!doctype html><html><body></body></html>', {
    url: 'http://127.0.0.1:45120/',
  })
  return dom.window.document
}

test('resolveGreetingUserName returns profile name or falls back to 老钟', () => {
  const fakeWin1 = {
    __omnimuxAuth: {
      peekCache: () => ({ body: { display_name: '测试用户' } }),
    },
  }
  assert.equal(resolveGreetingUserName(fakeWin1), '测试用户')

  const fakeWin2 = {
    __omnimuxAuth: {
      peekCache: () => ({ body: { username: 'john_doe' } }),
    },
  }
  assert.equal(resolveGreetingUserName(fakeWin2), 'john_doe')

  const fakeWinEmpty = { __omnimuxAuth: null }
  assert.equal(resolveGreetingUserName(fakeWinEmpty), '老钟')
})

test('isSplitMode correctly detects whether right panel is open and not fullscreen', () => {
  const doc = setupDom(`
    <div data-sidebar-right-panel="push" data-sidebar-right-open="true"></div>
  `)
  assert.equal(isSplitMode(doc), true)

  const docFullscreen = setupDom(`
    <div data-sidebar-right-panel="fullscreen" data-sidebar-right-open="true"></div>
  `)
  assert.equal(isSplitMode(docFullscreen), false)

  const docClosed = setupDom(`
    <div data-sidebar-right-panel="push"></div>
  `)
  assert.equal(isSplitMode(docClosed), false)
})

test('createWelcomeHeaderElement creates well-formed header element', () => {
  const doc = setupDom()
  const el = createWelcomeHeaderElement(doc, '老钟')
  assert.ok(el.classList.contains('omnimux-welcome-header'))
  assert.match(el.innerHTML, /你好，老钟/)
  assert.match(el.innerHTML, /属于你的AI社媒运营团队/)
})

test('syncWelcomeGreeting mounts header in split mode and unhides in full mode', () => {
  const doc = setupDom(`
    <div data-sidebar-right-panel="push" data-sidebar-right-open="true"></div>
    <div data-phase="hero">
      <div class="composerHero">
        <div>
          <div class="headline">旧居中文案</div>
        </div>
      </div>
    </div>
  `)

  const changed = syncWelcomeGreeting(doc)
  assert.equal(changed, true)
  assert.ok(doc.querySelector(WELCOME_HEADER_SELECTOR))
  assert.equal(doc.querySelector('.headline').style.display, 'none')

  // Close panel
  doc.querySelector('[data-sidebar-right-panel]').removeAttribute('data-sidebar-right-open')
  syncWelcomeGreeting(doc)
  assert.equal(doc.querySelector(WELCOME_HEADER_SELECTOR).style.display, 'none')
  assert.equal(doc.querySelector('.headline').style.display, '')
})

test('installWelcomeGreetingObserver handles dynamic mutations and clean unmount', () => {
  const doc = setupDom(`
    <div data-sidebar-right-panel="push" data-sidebar-right-open="true"></div>
    <div data-phase="hero">
      <div class="composerHero">
        <div>
          <div class="headline">旧居中文案</div>
        </div>
      </div>
    </div>
  `)

  const dispose = installWelcomeGreetingObserver(doc)
  assert.ok(doc.querySelector(WELCOME_HEADER_SELECTOR))

  dispose()
  assert.equal(doc.querySelector(WELCOME_HEADER_SELECTOR), null)
})
