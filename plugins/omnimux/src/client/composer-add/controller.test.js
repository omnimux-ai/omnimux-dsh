import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAttachmentStore } from '../attachments/store.ts'
import { zh } from '../locales.js'
import { createComposerAddController } from './controller.js'

const INSTANTIATE = '/omnimux/composer/attachments/instantiate'
const ok = body => ({ ok: true, status: 200, body })
const asset = id => ({
  ok: true, sourcePath: id, relativePath: 'assets/imported/' + id + '/hero.png',
  title: id, kind: 'asset', entityId: id,
})
function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function setup(handle) {
  const store = createAttachmentStore()
  // The tray's last-mounted session must not replace the official current one.
  store.setActiveSessionId('last-mounted-tray')
  let current = 'a'
  let model = null
  const listeners = new Set()
  const notices = []
  const requests = []
  const focused = []
  const controller = createComposerAddController({
    store,
    t: key => zh[key] || key,
    getCurrentSessionId: () => current,
    subscribeCurrentSession(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    renderLibrary(next) { model = next },
    notify(message) { notices.push(message) },
    restoreFocus(id) { focused.push(id) },
    async request(path, body, signal) {
      requests.push({ path, body, signal })
      const custom = handle?.(path, body, signal)
      if (custom !== undefined) return custom
      if (path === INSTANTIATE) return ok({ results: body.assetIds.map(asset) })
      throw new Error('Unexpected request: ' + path)
    },
  })
  return {
    controller, store, requests, notices, focused, listeners,
    get model() { return model },
    switchTo(id) { current = id; for (const listener of listeners) listener() },
  }
}

function occupy(store, sessionId, count) {
  for (let i = 0; i < count; i++) store.addAttachment(sessionId, {
    sourcePlugin: 'omnimux-assets', entityId: 'existing-' + i,
    title: 'existing-' + i, kind: 'asset', relativePath: 'assets/existing-' + i,
  })
}

describe('composer add controller', () => {
  it('blocks same-session reentry until an admitted library import settles', async () => {
    const pending = deferred()
    const f = setup(path => {
      if (path === INSTANTIATE) return pending.promise
    })
    occupy(f.store, 'a', 6)
    f.controller.openLibrary('a')
    const importing = f.model.onConfirm([{ id: 'pending' }])
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(f.requests.filter(row => row.path === INSTANTIATE).length, 1)
    f.switchTo('b')
    f.controller.openLibrary('b')
    assert.ok(f.model)
    f.switchTo('a')
    f.controller.openLibrary('a')
    assert.equal(f.model, null)
    assert.equal(f.requests.filter(row => row.path === INSTANTIATE).length, 1)
    assert.equal(f.notices.at(-1), zh['composerAdd.busy'])
    pending.resolve(ok({ results: [asset('pending')] }))
    await importing
    assert.equal(f.store.getSnapshot('a').length, 7)
    assert.equal(f.store.getSnapshot('b').length, 0)
    f.controller.openLibrary('a')
    assert.ok(f.model)
    f.controller.dispose()
  })

  it('surfaces network errors and allows a later attempt', async () => {
    let attempts = 0
    const f = setup(() => {
      if (attempts++ === 0) throw new Error('offline')
      if (attempts === 2) return ok({})
    })
    f.controller.openLibrary('a')
    await assert.rejects(f.model.onConfirm([{ id: 'hero' }]), /offline/)
    await assert.rejects(f.model.onConfirm([{ id: 'hero' }]), new RegExp(zh['composerAdd.invalidResponse']))
    await f.model.onConfirm([{ id: 'hero' }])
    assert.equal(f.store.getSnapshot('a').length, 1)
    f.controller.dispose()
  })

  it('does not open UI for an acknowledgment belonging to a previously selected session', () => {
    const f = setup()
    f.switchTo('b')
    f.controller.openLibrary('a')
    assert.equal(f.requests.length, 0)
    assert.equal(f.model, null)
    f.controller.dispose()
  })

  it('allows only one visible operation and ignores a closed modal confirmation', async () => {
    const f = setup()
    f.controller.openLibrary('a')
    const first = f.model
    f.controller.openLibrary('a')
    assert.equal(f.model, first)
    assert.equal(f.requests.length, 0)
    first.onClose()
    f.controller.openLibrary('a')
    assert.notEqual(f.model.key, first.key)
    await first.onConfirm([{ id: 'old' }])
    assert.equal(f.requests.length, 0)
    f.controller.dispose()
  })

  it('retains a wholly failed asset selection for retry and reports partial success', async () => {
    let calls = 0
    const f = setup(path => {
      if (path !== INSTANTIATE) return
      if (++calls === 1) return ok({ results: [{ ok: false, message: 'asset missing' }] })
      return ok({ results: [asset('hero'), { ok: false, message: 'asset missing' }] })
    })
    f.controller.openLibrary('a')
    const model = f.model
    await assert.rejects(model.onConfirm([{ id: 'hero' }]), /asset missing/)
    assert.equal(f.model, model)
    await model.onConfirm([{ id: 'hero' }, { id: 'gone' }])
    assert.equal(f.model, null)
    assert.equal(f.store.getSnapshot('a')[0].entityId, 'hero')
    assert.match(f.notices.at(-1), /已添加 1 项/)
    assert.match(f.notices.at(-1), /1 项添加失败/)
    f.controller.dispose()
  })

  it('keeps an admitted asset import owned by A after the selection is closed', async () => {
    const pending = deferred()
    const f = setup(path => path === INSTANTIATE ? pending.promise : undefined)
    f.controller.openLibrary('a')
    const model = f.model
    const work = model.onConfirm([{ id: 'hero' }])
    model.onClose()
    f.switchTo('b')
    f.controller.openLibrary('b')
    const next = f.model
    pending.resolve(ok({ results: [asset('hero')] }))
    await work
    assert.equal(f.model, next)
    assert.equal(f.store.getSnapshot('a').length, 1)
    assert.equal(f.store.getSnapshot('b').length, 0)
    f.controller.dispose()
  })

  it('updates the library quota from the originating session and disposes every observer', () => {
    const f = setup()
    f.controller.openLibrary('a')
    occupy(f.store, 'a', 1)
    assert.equal(f.model.occupied, 1)
    f.controller.dispose()
    f.controller.dispose()
    assert.equal(f.listeners.size, 0)
    occupy(f.store, 'a', 2)
    assert.equal(f.model, null)
  })

  it('ignores an import completion after plugin disposal', async () => {
    const pending = deferred()
    const started = deferred()
    const f = setup(path => {
      if (path === INSTANTIATE) { started.resolve(); return pending.promise }
    })
    f.controller.openLibrary('a')
    const work = f.model.onConfirm([{ id: 'hero' }])
    await started.promise
    f.controller.dispose()
    pending.resolve(ok({ results: [asset('hero')] }))
    await work
    assert.equal(f.store.getSnapshot('a').length, 0)
    assert.equal(f.notices.length, 0)
    assert.equal(f.listeners.size, 0)
  })
})
