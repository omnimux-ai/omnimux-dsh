import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { installGuideSubmitGuard } from './submit-guard.js'

function fixture(check) {
  const dom = new JSDOM('<div id="root"><div data-composer-input="true" contenteditable="true"></div><button aria-label="Send message">Send</button><input id="url"></div><button id="other" aria-label="Send message">Other</button>')
  const { window } = dom
  const doc = window.document
  const root = doc.getElementById('root')
  const button = root.querySelector('button')
  let sends = 0
  doc.addEventListener('click', () => sends++, true)
  doc.addEventListener('keydown', () => sends++, true)
  const stop = installGuideSubmitGuard(root, check)
  return { window, doc, root, button, stop, sends: () => sends, close: () => dom.window.close() }
}

describe('starter submit guard', () => {
  it('blocks both pointer and its subsequent click even after synchronization', () => {
    let ready = false
    const f = fixture(() => { const before = ready; ready = true; return before })
    f.button.dispatchEvent(new f.window.Event('pointerdown', { bubbles: true, cancelable: true }))
    f.button.click()
    assert.equal(f.sends(), 0)
    f.button.dispatchEvent(new f.window.Event('pointerdown', { bubbles: true, cancelable: true }))
    f.button.click()
    assert.equal(f.sends(), 1)
    f.stop(); f.close()
  })
  it('guards keyboard and synthetic clicks before existing document handlers', () => {
    const f = fixture(() => false)
    f.button.click()
    const event = new f.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    f.root.querySelector('[data-composer-input]').dispatchEvent(event)
    assert.equal(event.defaultPrevented, true)
    assert.equal(f.sends(), 0)
    f.stop(); f.close()
  })
  it('guards modified Enter that the official editor can submit', () => {
    const f = fixture(() => false)
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      const event = new f.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...modifier })
      f.root.querySelector('[data-composer-input]').dispatchEvent(event)
      assert.equal(event.defaultPrevented, true)
    }
    assert.equal(f.sends(), 0)
    f.stop(); f.close()
  })
  it('preserves Shift+Enter, IME, and other conversations', () => {
    const f = fixture(() => false)
    const editor = f.root.querySelector('[data-composer-input]')
    for (const key of [{ shiftKey: true }, { isComposing: true }]) {
      const event = new f.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...key })
      editor.dispatchEvent(event)
      assert.equal(event.defaultPrevented, false)
    }
    f.doc.getElementById('other').click()
    assert.equal(f.sends(), 3)
    f.stop(); f.button.click(); assert.equal(f.sends(), 4)
    f.close()
  })
})
