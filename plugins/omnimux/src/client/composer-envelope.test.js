import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attachComposerEnvelope, getComposerText, setComposerValue } from './composer-envelope.js'

describe('Composer Envelope', () => {
  it('setComposerValue sets value and triggers event on textarea', () => {
    let eventFired = false
    const fakeTextarea = {
      value: '',
      dispatchEvent: () => { eventFired = true },
    }

    setComposerValue(fakeTextarea, 'hello world')
    assert.equal(fakeTextarea.value, 'hello world')
    assert.equal(eventFired, true)
  })

  it('setComposerValue supports contenteditable div', () => {
    let eventFired = false
    const fakeDiv = {
      isContentEditable: true,
      textContent: '',
      dispatchEvent: () => { eventFired = true },
    }

    setComposerValue(fakeDiv, 'lexical input')
    assert.equal(fakeDiv.textContent, 'lexical input')
    assert.equal(eventFired, true)
    assert.equal(getComposerText(fakeDiv), 'lexical input')
  })

  it('attachComposerEnvelope does not tamper with contenteditable user text', () => {
    const fakeDiv = {
      isContentEditable: true,
      innerText: '帮我生一张图',
      textContent: '帮我生一张图',
      dispatchEvent: () => {},
    }

    const getUiContext = () => ({
      schemaVersion: 1,
      ok: true,
      surface: { tabId: 'omnimux-assets:library', panelOpen: true },
    })

    const formatBlock = () => '<ui_context schema="1">' + String.fromCharCode(10) + 'tab: omnimux-assets:library' + String.fromCharCode(10) + '</ui_context>'

    const attached = attachComposerEnvelope(fakeDiv, getUiContext, formatBlock)
    assert.equal(attached, false)
    assert.equal(fakeDiv.textContent, '帮我生一张图')
  })
})
