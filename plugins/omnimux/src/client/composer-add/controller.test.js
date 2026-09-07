import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAttachmentStore } from '../attachments/store.ts'
import { zh } from '../locales.js'
import { createComposerAddController } from './controller.js'

const PICK = '/omnimux/composer/attachments/pick-files'
const MATERIALIZE = '/omnimux/composer/attachments/materialize'
const INSTANTIATE = '/omnimux/composer/attachments/instantiate'
const ok = body => ({ ok: true, status: 200, body })
const failure = (status, error, message = error) => ({ ok: false, status, body: { error, message } })
const file = path => ({
  ok: true, sourcePath: path, relativePath: 'assets/imported/' + path.split('/').at(-1),
  title: path.split('/').at(-1), kind: 'document', extension: 'TXT',
})
const asset = id => ({ ...file('/' + id + '.txt'), kind: 'asset', entityId: id })
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
      if (path === PICK) return ok({ paths: ['/tmp/a.txt', '/tmp/b.txt'] })
      if (path === MATERIALIZE) return ok({ results: body.paths.map(file) })
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
  it('materializes selected files once, preserves source identity and routes to the event session', async () => {
    const f = setup()
    await f.controller.addFiles('a')
    assert.deepEqual(f.requests.map(row => row.path), [PICK, MATERIALIZE])
    assert.deepEqual(f.requests[1].body, {
      sessionId: 'a', paths: ['/tmp/a.txt', '/tmp/b.txt'], filesOnly: true,
    })
    assert.deepEqual(f.store.getSnapshot('a').map(row => row.metadata.sourcePath), ['/tmp/a.txt', '/tmp/b.txt'])
    assert.equal(f.store.getSnapshot('last-mounted-tray').length, 0)
    await f.controller.addFiles('a')
    assert.equal(f.requests.filter(row => row.path === MATERIALIZE).length, 1)
    assert.equal(f.store.getSnapshot('a').length, 2)
    assert.match(f.notices.at(-1), /2 项已在会话中/)
    f.controller.dispose()
  })

  it('deduplicates a selection and trims excess paths before copying', async () => {
    const f = setup(path => path === PICK ? ok({ paths: ['/tmp/a.txt', '/tmp/a.txt', '/tmp/b.txt', '/tmp/c.txt'] }) : undefined)
    occupy(f.store, 'a', 6)
    await f.controller.addFiles('a')
    assert.deepEqual(f.requests[1].body.paths, ['/tmp/a.txt', '/tmp/b.txt'])
    assert.equal(f.store.getSnapshot('a').length, 8)
    assert.match(f.notices[0], /1 项已在会话中/)
    assert.match(f.notices[0], /8 项上限/)
    const count = f.requests.length
    await f.controller.addFiles('a')
    assert.equal(f.requests.length, count)
    f.controller.dispose()
  })

  it('cancellation produces no materialization, toast or attachment', async () => {
    const f = setup(path => path === PICK ? ok({ paths: [] }) : undefined)
    await f.controller.addFiles('a')
    assert.equal(f.requests.length, 1)
    assert.equal(f.store.getSnapshot('a').length, 0)
    assert.deepEqual(f.notices, [])
    f.controller.dispose()
  })

  for (const kind of ['file', 'library']) {
    it(`blocks same-session reentry until an admitted ${kind} import settles`, async () => {
      const pending = deferred()
      const endpoint = kind === 'file' ? MATERIALIZE : INSTANTIATE
      const f = setup(path => {
        if (path === PICK) return ok({ paths: ['/tmp/pending.txt'] })
        if (path === endpoint) return pending.promise
      })
      occupy(f.store, 'a', 6)
      let importing
      if (kind === 'file') importing = f.controller.addFiles('a')
      else {
        f.controller.openLibrary('a')
        importing = f.model.onConfirm([{ id: 'pending' }])
      }
      await Promise.resolve()
      await Promise.resolve()
      assert.equal(f.requests.filter(row => row.path === endpoint).length, 1)
      f.switchTo('b')
      f.controller.openLibrary('b')
      assert.ok(f.model)
      f.switchTo('a')
      f.controller.openLibrary('a')
      await f.controller.addFiles('a')
      assert.equal(f.model, null)
      assert.equal(f.requests.filter(row => row.path === endpoint).length, 1)
      assert.equal(f.requests.filter(row => row.path === PICK).length, kind === 'file' ? 1 : 0)
      assert.equal(f.notices.at(-1), zh['composerAdd.busy'])
      pending.resolve(ok({ results: [kind === 'file' ? file('/tmp/pending.txt') : asset('pending')] }))
      await importing
      assert.equal(f.store.getSnapshot('a').length, 7)
      assert.equal(f.store.getSnapshot('b').length, 0)
      f.controller.openLibrary('a')
      assert.ok(f.model)
      f.controller.dispose()
    })
  }

  it('a discarded picker cannot unlock a later import in the same session', async () => {
    const selection = deferred()
    const copy = deferred()
    let picks = 0
    const f = setup(path => {
      if (path === PICK && ++picks === 1) return selection.promise
      if (path === MATERIALIZE) return copy.promise
    })
    const old = f.controller.addFiles('a')
    f.switchTo('b')
    f.switchTo('a')
    const importing = f.controller.addFiles('a')
    await Promise.resolve()
    await Promise.resolve()
    f.switchTo('b')
    f.switchTo('a')
    selection.resolve(ok({ paths: ['/tmp/stale.txt'] }))
    await old
    f.controller.openLibrary('a')
    assert.equal(f.model, null)
    assert.equal(f.notices.at(-1), zh['composerAdd.busy'])
    copy.resolve(ok({ results: [file('/tmp/a.txt')] }))
    await importing
    f.controller.openLibrary('a')
    assert.ok(f.model)
    f.controller.dispose()
  })

  it('falls back exactly once only for a missing desktop capability', async () => {
    const f = setup(path => {
      if (path === PICK) return failure(501, 'native-picker-unavailable')
      if (path === '/omnimux/assets/pick') return ok({ paths: ['/tmp/legacy.txt'] })
    })
    await f.controller.addFiles('a')
    assert.deepEqual(f.requests.map(row => row.path), [PICK, '/omnimux/assets/pick', MATERIALIZE])
    assert.deepEqual(f.requests[1].body, { kind: 'file' })
    f.controller.dispose()
    for (const [status, error] of [[501, 'other'], [409, 'native-picker-busy'], [403, 'not-local'], [503, 'auth-unavailable'], [500, 'internal']]) {
      const denied = setup(() => failure(status, error))
      await denied.controller.addFiles('a')
      assert.equal(denied.requests.length, 1)
      assert.equal(denied.notices.length, 1)
      denied.controller.dispose()
    }
  })

  it('reports network and malformed results and allows a later attempt', async () => {
    let attempts = 0
    const f = setup(path => {
      if (path === PICK && attempts++ === 0) throw new Error('offline')
      if (path === PICK && attempts === 2) return ok({})
    })
    await f.controller.addFiles('a')
    assert.equal(f.notices[0], 'offline')
    await f.controller.addFiles('a')
    assert.equal(f.notices[1], zh['composerAdd.invalidResponse'])
    await f.controller.addFiles('a')
    assert.equal(f.store.getSnapshot('a').length, 2)
    f.controller.dispose()
  })

  it('does not open UI for an acknowledgment belonging to a previously selected session', async () => {
    const f = setup()
    f.switchTo('b')
    await f.controller.addFiles('a')
    f.controller.openLibrary('a')
    assert.equal(f.requests.length, 0)
    assert.equal(f.model, null)
    f.controller.dispose()
  })

  it('drops a late chooser response on session switch without copying', async () => {
    const pending = deferred()
    const f = setup(path => path === PICK ? pending.promise : undefined)
    const work = f.controller.addFiles('a')
    f.switchTo('b')
    assert.equal(f.requests[0].signal.aborted, true)
    pending.resolve(ok({ paths: ['/tmp/a.txt'] }))
    await work
    assert.equal(f.requests.length, 1)
    assert.equal(f.store.getSnapshot('a').length, 0)
    assert.equal(f.store.getSnapshot('b').length, 0)
    assert.deepEqual(f.focused, [])
    f.controller.dispose()
  })

  it('writes an admitted import only to A while preserving a newer B library dialog', async () => {
    const pending = deferred()
    const started = deferred()
    const f = setup(path => {
      if (path === MATERIALIZE) { started.resolve(); return pending.promise }
    })
    const work = f.controller.addFiles('a')
    await started.promise
    f.switchTo('b')
    f.controller.openLibrary('b')
    const b = f.model
    pending.resolve(ok({ results: [file('/tmp/a.txt')] }))
    await work
    assert.equal(f.model, b)
    assert.equal(f.store.getSnapshot('a').length, 1)
    assert.equal(f.store.getSnapshot('b').length, 0)
    assert.deepEqual(f.focused, [])
    f.controller.dispose()
  })

  it('allows only one visible operation and ignores a closed modal confirmation', async () => {
    const f = setup()
    f.controller.openLibrary('a')
    const first = f.model
    f.controller.openLibrary('a')
    await f.controller.addFiles('a')
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
      if (path === MATERIALIZE) { started.resolve(); return pending.promise }
    })
    const work = f.controller.addFiles('a')
    await started.promise
    f.controller.dispose()
    pending.resolve(ok({ results: [file('/tmp/a.txt')] }))
    await work
    assert.equal(f.store.getSnapshot('a').length, 0)
    assert.equal(f.notices.length, 0)
    assert.equal(f.listeners.size, 0)
  })
})
