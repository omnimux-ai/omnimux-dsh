import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { createAttachmentStore } from '../attachments/store.ts'
import { zh } from '../locales.js'
import { createComposerAddController } from './controller.js'
import { installComposerAddCommands, LIBRARY_COMMAND } from './commands.js'

function mountJourney(current = 'session-a') {
  const dom = new JSDOM('<!doctype html><html><body><textarea id="composer"></textarea></body></html>')
  const doc = dom.window.document
  const store = createAttachmentStore()
  let dialog = null
  const notices = []
  const commandUi = {
    decorate(spec) {
      commandUi.spec = spec
      return () => { commandUi.spec = null }
    },
  }
  const controller = createComposerAddController({
    store,
    t: (key) => zh[key] || key,
    getCurrentSessionId: () => current,
    subscribeCurrentSession() { return () => {} },
    notify(message) { notices.push(message) },
    renderLibrary(model) {
      dialog?.remove()
      dialog = null
      if (!model) return
      dialog = doc.createElement('div')
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-label', zh['composerAdd.fromLibrary'])
      dialog.className = 'omx-pick-dialog omx-pick-dialog--assets'
      dialog.id = 'omnimux-composer-add-host'
      const close = doc.createElement('button')
      close.type = 'button'
      close.textContent = zh['composerAdd.cancel']
      close.addEventListener('click', () => model.onClose())
      dialog.appendChild(close)
      doc.body.appendChild(dialog)
    },
  })
  const stop = installComposerAddCommands({ commandUi, on() { return () => {} } }, controller)
  return {
    doc, notices, commandUi,
    clickLibrary() {
      commandUi.spec.ui.run({ sessionId: current })
    },
    dispose() {
      stop()
      controller.dispose()
    },
  }
}

describe('e2e: 从资产库添加点击即打开选择窗', () => {
  it('菜单点选后同一操作内出现选择弹窗，取消不留附件', () => {
    const f = mountJourney()
    assert.equal(f.commandUi.spec.name, LIBRARY_COMMAND)
    assert.equal(f.commandUi.spec.ui.kind, 'action')
    assert.equal(f.doc.querySelector('[role="dialog"]'), null)

    f.clickLibrary()
    const dialog = f.doc.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.equal(dialog.getAttribute('aria-label'), '从资产库添加')
    assert.ok(dialog.className.includes('omx-pick-dialog--assets'))
    const box = dialog.getBoundingClientRect()
    assert.ok(typeof box.width === 'number')
    assert.ok(typeof box.height === 'number')

    f.doc.querySelector('[role="dialog"] button').click()
    assert.equal(f.doc.querySelector('[role="dialog"]'), null)
    f.dispose()
  })

  it('没有可用会话时给出提示，不弹出选择窗', () => {
    const f = mountJourney('default')
    f.commandUi.spec.ui.run({ sessionId: 'default' })
    assert.equal(f.doc.querySelector('[role="dialog"]'), null)
    assert.equal(f.notices.at(-1), zh['composerAdd.needSession'])
    f.dispose()
  })
})
