import test from 'node:test'
import assert from 'node:assert/strict'
import {
  confirmNativeFileNames,
  installNativeFilesBridge,
  listNativeFileNames,
  resolveNativeFilesBridge,
} from './native-files-bridge.js'

function file(name) {
  return new File(['# body'], name, { type: 'text/markdown' })
}

function setup(options = {}) {
  const win = {}
  const calls = []
  let attachments = []
  const stop = installNativeFilesBridge(win, {
    sessionId: 's1',
    canAcceptDrop: options.canAcceptDrop === undefined ? true : options.canAcceptDrop,
    getAttachments: () => attachments,
    addFiles: options.addFiles || (files => {
      calls.push(files)
      attachments = attachments.concat(files.map(item => ({ file: { name: item.name } })))
    }),
    confirmTimeout: options.confirmTimeout === undefined ? 80 : options.confirmTimeout,
    confirmInterval: 5,
    unconfirmedTtl: options.unconfirmedTtl === undefined ? 3000 : options.unconfirmedTtl,
  })
  return {
    win,
    calls,
    stop,
    bridge: resolveNativeFilesBridge(win, 's1'),
    setAttachments: next => { attachments = next },
    getAttachments: () => attachments,
  }
}

test('listNativeFileNames prefers file.name and falls back to title', () => {
  const names = listNativeFileNames([
    { file: { name: 'a.md' }, title: 'ignored' },
    { title: 'b.md' },
    { file: {} },
    null,
  ])
  assert.deepEqual(names, ['a.md', 'b.md'])
})

test('confirmNativeFileNames waits for the attachment to appear', async () => {
  let attachments = []
  const pending = confirmNativeFileNames(() => attachments, ['x.md'], { timeout: 100, interval: 5 })
  setTimeout(() => { attachments = [{ file: { name: 'x.md' } }] }, 15)
  assert.equal(await pending, true)
})

test('confirmNativeFileNames gives up when the intake silently drops the file', async () => {
  const confirmed = await confirmNativeFileNames(() => [], ['x.md'], { timeout: 30, interval: 5 })
  assert.equal(confirmed, false)
})

test('add reports success only after the attachment list shows the file', async () => {
  const f = setup()
  const result = await f.bridge.add([file('test · collection.md')])
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(f.bridge.list(), ['test · collection.md'])
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0][0].name, 'test · collection.md')
  f.stop()
})

test('add reports failure when the void intake accepts nothing and keeps a short dedupe window', async () => {
  const f = setup({ addFiles: () => {}, unconfirmedTtl: 3000 })
  const result = await f.bridge.add([file('test · collection.md')])
  assert.deepEqual(result, { ok: false, message: '' })
  assert.ok(f.bridge.list().includes('test · collection.md'), 'a retry must not upload a second copy after a timeout')
  f.stop()
})

test('the unconfirmed dedupe window expires', async () => {
  const f = setup({ addFiles: () => {}, unconfirmedTtl: 20 })
  await f.bridge.add([file('late.md')])
  assert.ok(f.bridge.list().includes('late.md'))
  await new Promise(resolve => setTimeout(resolve, 40))
  assert.deepEqual(f.bridge.list(), [])
  f.stop()
})

test('add refuses before calling a composer that cannot accept files', async () => {
  const f = setup({ canAcceptDrop: false })
  const result = await f.bridge.add([file('test · collection.md')])
  assert.deepEqual(result, { ok: false, message: '' })
  assert.equal(f.calls.length, 0)
  f.stop()
})

test('add rejects a missing intake instead of pretending success', async () => {
  const win = {}
  const stop = installNativeFilesBridge(win, { sessionId: 's1', canAcceptDrop: true })
  const bridge = resolveNativeFilesBridge(win, 's1')
  assert.deepEqual(await bridge.add([file('a.md')]), { ok: false, message: '' })
  stop()
})

test('a thrown intake reaches the caller', async () => {
  const f = setup({
    addFiles: () => {
      throw new Error('upload bridge crashed')
    },
  })
  await assert.rejects(() => f.bridge.add([file('a.md')]), /upload bridge crashed/)
  assert.deepEqual(f.bridge.list(), [])
  f.stop()
})

test('list exposes the pending name while the official intake is still propagating', async () => {
  const f = setup({
    addFiles: files => {
      setTimeout(() => {
        f.setAttachments(files.map(item => ({ file: { name: item.name } })))
      }, 25)
    },
  })
  const pendingAdd = f.bridge.add([file('test.md')])
  assert.ok(f.bridge.list().includes('test.md'), 'a rapid second click must see the in-flight file')
  assert.deepEqual(await pendingAdd, { ok: true })
  f.stop()
})

test('a newer install replaces the entry and the stale cleanup cannot delete it', () => {
  const win = {}
  let attachments = []
  const stopOld = installNativeFilesBridge(win, {
    sessionId: 's1',
    canAcceptDrop: true,
    getAttachments: () => attachments,
    addFiles: files => { attachments = files.map(item => ({ file: { name: item.name } })) },
  })
  const stopNew = installNativeFilesBridge(win, {
    sessionId: 's1',
    canAcceptDrop: false,
    getAttachments: () => attachments,
    addFiles: () => {},
  })
  stopOld()
  assert.ok(resolveNativeFilesBridge(win, 's1'), 'old cleanup must not delete the newer entry')
  stopNew()
  assert.equal(resolveNativeFilesBridge(win, 's1'), null)
})

test('a missing session publishes nothing', () => {
  const win = {}
  const stop = installNativeFilesBridge(win, { sessionId: '' })
  assert.equal(resolveNativeFilesBridge(win, ''), null)
  assert.equal(win.__omnimuxComposerFiles, undefined)
  stop()
})
