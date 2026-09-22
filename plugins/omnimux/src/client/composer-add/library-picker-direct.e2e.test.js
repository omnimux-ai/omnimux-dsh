import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import { createAttachmentStore } from '../attachments/store.ts'
import { zh } from '../locales.js'
import { createComposerAddController } from './controller.js'
import { installComposerAddCommands, LIBRARY_COMMAND } from './commands.js'
import { LIBRARY_TABS } from './library-stage-model.js'

function mountJourney(current = 'session-a') {
  const dom = new JSDOM('<!doctype html><html><body><textarea id="composer"></textarea></body></html>')
  const doc = dom.window.document
  const store = createAttachmentStore()
  let stage = null
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
      stage?.remove()
      stage = null
      if (!model) return
      stage = doc.createElement('section')
      stage.setAttribute('data-omnimux-library-stage', '')
      stage.setAttribute('aria-label', '挑选素材')
      stage.dataset.tab = model.tab || 'assets'
      stage.dataset.presentation = model.presentation || 'stage'
      const tabs = doc.createElement('div')
      tabs.className = 'omnimux-library-stage-tabs'
      for (const item of LIBRARY_TABS) {
        const button = doc.createElement('button')
        button.type = 'button'
        button.className = `omnimux-library-stage-tab${item.id === stage.dataset.tab ? ' is-active' : ''}`
        button.textContent = item.label
        button.addEventListener('click', () => model.onTab?.(item.id))
        tabs.appendChild(button)
      }
      const close = doc.createElement('button')
      close.type = 'button'
      close.className = 'omnimux-library-stage-close'
      close.setAttribute('aria-label', '关闭素材')
      close.addEventListener('click', () => model.onClose())
      tabs.appendChild(close)
      stage.appendChild(tabs)
      doc.body.appendChild(stage)
    },
  })
  const stop = installComposerAddCommands({ commandUi, on() { return () => {} } }, controller)
  return {
    doc,
    notices,
    commandUi,
    clickLibrary() {
      commandUi.spec.ui.run({ sessionId: current })
    },
    dispose() {
      stop()
      controller.dispose()
    },
  }
}

describe('e2e: 从资产库选择点击即打开整页浏览', () => {
  it('菜单点选后同一操作内出现整页分类，取消不留附件', () => {
    const f = mountJourney()
    assert.equal(f.commandUi.spec.name, LIBRARY_COMMAND)
    assert.equal(f.commandUi.spec.ui.kind, 'action')
    assert.equal(f.doc.querySelector('[data-omnimux-library-stage]'), null)

    f.clickLibrary()
    const stage = f.doc.querySelector('[data-omnimux-library-stage]')
    assert.ok(stage)
    assert.equal(stage.dataset.presentation, 'stage')
    assert.equal(stage.dataset.tab, 'assets')
    assert.equal(f.doc.querySelectorAll('.omnimux-library-stage-tab').length, LIBRARY_TABS.length)
    assert.equal(f.doc.querySelector('.omnimux-library-stage-tab.is-active')?.textContent, '资产库')
    const box = stage.getBoundingClientRect()
    assert.ok(typeof box.width === 'number')
    assert.ok(typeof box.height === 'number')

    f.doc.querySelector('.omnimux-library-stage-close').click()
    assert.equal(f.doc.querySelector('[data-omnimux-library-stage]'), null)
    f.dispose()
  })

  it('没有可用会话时给出提示，不打开整页', () => {
    const f = mountJourney('default')
    f.commandUi.spec.ui.run({ sessionId: 'default' })
    assert.equal(f.doc.querySelector('[data-omnimux-library-stage]'), null)
    assert.equal(f.notices.at(-1), zh['composerAdd.needSession'])
    f.dispose()
  })
})
