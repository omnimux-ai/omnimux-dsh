import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useNativeFilesBridge } from './useNativeFilesBridge.js'
import { resolveNativeFilesBridge } from './native-files-bridge.js'

/**
 * The hook is the only thing that publishes the tray's official file intake.
 * Mount it for real (React + jsdom) so the registry cannot drift away from the
 * shipped tray wiring: props change every render, the entry must stay stable
 * per session, confirm an attachment actually appeared, and be removed on
 * unmount.
 */
function Harness(props) {
  useNativeFilesBridge(props.windowObject, props.options)
  return null
}

function withDom(run) {
  const dom = new JSDOM('<div id="root"></div>')
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return Promise.resolve(run(dom)).finally(() => {
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  })
}

test('mounts a session entry, confirms the added file and reads the latest attachment names', async () => {
  await withDom(async dom => {
    const win = dom.window
    const attachments = []
    const calls = []
    const options = {
      sessionId: 's1',
      attachments,
      canAcceptDrop: true,
      onAddFiles: files => {
        calls.push(files)
        // The official intake is void; the composer state updates through props.
        for (const item of files) attachments.push({ file: { name: item.name } })
      },
    }
    const root = createRoot(document.querySelector('#root'))
    await act(async () => root.render(React.createElement(Harness, { windowObject: win, options })))
    const bridge = resolveNativeFilesBridge(win, 's1')
    assert.ok(bridge, 'the tray must publish its native file intake')
    assert.deepEqual(bridge.list(), [])

    const file = new File(['# collection'], '测试合集 · 灵感库合集.md', { type: 'text/markdown' })
    const result = await bridge.add([file])
    assert.deepEqual(result, { ok: true })
    assert.equal(calls.length, 1)
    assert.equal(calls[0][0], file)
    assert.deepEqual(bridge.list(), ['测试合集 · 灵感库合集.md'])

    await act(async () => root.unmount())
    assert.equal(resolveNativeFilesBridge(win, 's1'), null, 'unmount must remove the bridge entry')
  })
})

test('refuses while the composer cannot accept files', async () => {
  await withDom(async dom => {
    const win = dom.window
    const calls = []
    const options = {
      sessionId: 's1',
      attachments: [],
      canAcceptDrop: false,
      onAddFiles: files => calls.push(files),
    }
    const root = createRoot(document.querySelector('#root'))
    await act(async () => root.render(React.createElement(Harness, { windowObject: win, options })))
    const result = await resolveNativeFilesBridge(win, 's1').add([new File(['x'], 'x.md')])
    assert.deepEqual(result, { ok: false, message: '' })
    assert.equal(calls.length, 0)
    await act(async () => root.unmount())
  })
})

test('switching session moves the entry instead of leaking the previous one', async () => {
  await withDom(async dom => {
    const win = dom.window
    const root = createRoot(document.querySelector('#root'))
    const first = { sessionId: 's1', attachments: [], canAcceptDrop: true, onAddFiles: () => {} }
    await act(async () => root.render(React.createElement(Harness, { windowObject: win, options: first })))
    assert.ok(resolveNativeFilesBridge(win, 's1'))
    const second = { sessionId: 's2', attachments: [], canAcceptDrop: true, onAddFiles: () => {} }
    await act(async () => root.render(React.createElement(Harness, { windowObject: win, options: second })))
    assert.equal(resolveNativeFilesBridge(win, 's1'), null)
    assert.ok(resolveNativeFilesBridge(win, 's2'))
    await act(async () => root.unmount())
  })
})

test('no session id publishes nothing', async () => {
  await withDom(async dom => {
    const win = dom.window
    const root = createRoot(document.querySelector('#root'))
    await act(async () => root.render(React.createElement(Harness, {
      windowObject: win,
      options: { sessionId: '', attachments: [], canAcceptDrop: true, onAddFiles: () => {} },
    })))
    assert.equal(resolveNativeFilesBridge(win, ''), null)
    assert.equal(win.__omnimuxComposerFiles, undefined)
    await act(async () => root.unmount())
  })
})
