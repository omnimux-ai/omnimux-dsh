// @vitest-environment jsdom
//
// CAPTURE_POST 消息契约（Issue #3472, spec §3.1）：background 用
// chrome.tabs.sendMessage 询问顶层 frame，content script 回
// { ok: true, post: CapturedPost } 或 { ok: false }。
//
// 断言使用 node:assert/strict；本文件不使用 TS 专有语法（写入门禁做 acorn 静态检查）。
// content script 在模块加载时就注册监听，所以先用 vi.hoisted 装好 chrome 桩再静态导入。
import { afterEach, describe, it, vi } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const chromeStub = vi.hoisted(() => {
  const addListener = vi.fn()
  globalThis.chrome = {
    runtime: {
      onMessage: { addListener, removeListener: vi.fn() },
      sendMessage: vi.fn(async () => undefined),
    },
  }
  return { addListener }
})

// 静态导入：content/index.ts 顶层就调用 chrome.runtime.onMessage.addListener。
import '../src/content/index.ts'

afterEach(() => {
  delete globalThis.__dshBrowserContentScriptListener__
  delete globalThis.__dshBrowserSelectionWatcher__
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.title = ''
})

describe('CAPTURE_POST 消息契约 (#3472)', () => {
  it('content/index.ts 注册 CAPTURE_POST 并复用 capturePost', () => {
    const source = readFileSync('src/content/index.ts', 'utf8')
    assert.match(source, /CAPTURE_POST/)
    assert.match(source, /capturePost/)
  })

  it('作品页应答 { ok: true, post }', async () => {
    document.head.innerHTML = '<meta property="og:title" content="消息契约标题">'
    document.body.innerHTML = '<article><img src="https://cdn.example.com/m1.jpg" width="800" height="600"></article>'
    assert.equal(chromeStub.addListener.mock.calls.length >= 1, true)
    const listener = chromeStub.addListener.mock.calls[0][0]
    assert.equal(typeof listener, 'function')

    const response = await new Promise((resolve) => {
      const returned = listener({ action: 'CAPTURE_POST' }, {}, (value) => resolve(value))
      assert.equal(returned, undefined, '同步应答不需要保持消息通道')
    })
    assert.equal(response.ok, true)
    assert.equal(response.post.platform, 'web')
    assert.equal(response.post.title, '消息契约标题')
    assert.deepEqual(response.post.media, [{ type: 'image', url: 'https://cdn.example.com/m1.jpg' }])
  })

  it('空页面应答 { ok: false }，不返回假作品', async () => {
    const listener = chromeStub.addListener.mock.calls[0][0]
    const response = await new Promise((resolve) => {
      listener({ type: 'CAPTURE_POST' }, {}, (value) => resolve(value))
    })
    assert.deepEqual(response, { ok: false })
  })
})
