import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const here = fileURLToPath(new URL('.', import.meta.url))
const shimEntry = join(here, '../../tests/fixtures', 'ui-kit-shim.mjs')

async function loadComponent(entry) {
  const output = await build({
    entryPoints: [new URL(entry, import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: [
      'react',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/dsh-client-ui-primitives',
    ],
    plugins: [{
      name: 'ui-kit-shim',
      setup(b) {
        b.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: shimEntry }))
      },
    }],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, module, module.exports)
  return module.exports
}

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><button id="opener">打开灵感</button><div id="root"></div></body></html>', {
    url: 'http://localhost:3000',
    pretendToBeVisual: true,
  })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT,
    fetch: globalThis.fetch,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // Verified with Ego for #3412 (browser/01-pending.png through 07-result.png).
  // This legacy top-layer lifecycle probe supplies only the new status read.
  globalThis.fetch = async (url, init) => String(url) === '/omnimux/analysis/service'
    ? { ok: true, status: 200, json: async () => ({ revision: 1, channel: 'official', configured: true, imageToolConfigured: false }) }
    : previous.fetch(url, init)
  const nativeCalls = { showModal: 0, close: 0 }
  // jsdom cannot verify native top-layer paint order. This shim only verifies
  // that each entry owns one dialog and releases its lifecycle resources;
  // actual library/sidebar isolation is covered by retained browser evidence.
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    nativeCalls.showModal += 1
    this.setAttribute('open', '')
  }
  dom.window.HTMLDialogElement.prototype.close = function () {
    nativeCalls.close += 1
    this.removeAttribute('open')
  }

  return {
    dom,
    nativeCalls,
    cleanup() {
      dom.window.close()
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment
      globalThis.fetch = previous.fetch
    },
  }
}

const row = {
  id: 'insp_101',
  title: '测试灵感视频',
  video_url: 'https://example.com/video.mp4',
  cover_url: 'https://example.com/cover.jpg',
}
const t = (key, fallback) => fallback || key

test('E2E: 直接详情入口独占一个原生层，Escape 仅经 cancel 关闭并恢复页面状态', async () => {
  const { dom, nativeCalls, cleanup } = setupDom()
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const { InspirationPreviewModal } = await loadComponent('./InspirationPreviewModal.jsx')
  const opener = dom.window.document.getElementById('opener')
  dom.window.document.documentElement.style.overflow = 'auto'
  opener.focus()
  const root = createRoot(dom.window.document.getElementById('root'))
  let closeCount = 0

  try {
    // Library and account owners mount the detail directly rather than using
    // the global preview service. The detail must therefore own its isolation.
    await React.act(async () => root.render(React.createElement(InspirationPreviewModal, {
      row, t, onClose: () => { closeCount += 1 },
    })))
    const dialogs = dom.window.document.querySelectorAll('dialog.omnimux-inspiration-preview-layer')
    assert.equal(dialogs.length, 1, '直接挂载也必须有且只有一个原生隔离层')
    const dialog = dialogs[0]
    assert.equal(nativeCalls.showModal, 1)
    assert.equal(dialog.open, true)
    assert.equal(dom.window.document.documentElement.style.overflow, 'hidden')

    const insideControl = dialog.querySelector('button')
    assert.ok(insideControl)
    insideControl.focus()
    await React.act(async () => insideControl.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    })))
    assert.equal(closeCount, 0, '普通 Escape 事件不能与原生 cancel 重复关闭')
    const cancel = new dom.window.Event('cancel', { bubbles: true, cancelable: true })
    await React.act(async () => dialog.dispatchEvent(cancel))
    assert.equal(cancel.defaultPrevented, true)
    assert.equal(closeCount, 1, '一次原生取消只触发一次关闭回调')
  } finally {
    try {
      await React.act(async () => root.unmount())
      assert.equal(nativeCalls.close, 1, '卸载时释放原生层')
      assert.equal(dom.window.document.documentElement.style.overflow, 'auto', '恢复原有滚动设置')
      assert.equal(dom.window.document.activeElement, opener, '焦点回到打开详情的控件')
    } finally {
      cleanup()
    }
  }
})

test('E2E: 全局预览服务只渲染一个原生层，重复清理只通知关闭一次', async () => {
  const { dom, nativeCalls, cleanup } = setupDom()
  const React = require('react')
  const { registerPreviewService } = await loadComponent('./preview-service.jsx')
  let dispose

  try {
    let closeCount = 0

    dispose = registerPreviewService(t, dom.window)
    assert.ok(dom.window.__omnimuxInspirationPreview, '服务已挂载在全局 window 上')
    assert.equal(typeof dom.window.__omnimuxInspirationPreview.open, 'function', '提供 open 方法')

    let close
    await React.act(async () => {
      close = dom.window.__omnimuxInspirationPreview.open({
        row, onClose: () => { closeCount += 1 }, onReplicate() {},
      })
    })

    const dialogs = dom.window.document.querySelectorAll('dialog.omnimux-inspiration-preview-layer')
    assert.equal(dialogs.length, 1, '服务入口不得再包一层重复的原生弹窗')
    assert.equal(nativeCalls.showModal, 1)
    await React.act(async () => {
      dialogs[0].dispatchEvent(new dom.window.Event('cancel', { cancelable: true }))
      close()
      dispose()
    })

    assert.equal(closeCount, 1, '原生取消、返回的关闭函数和服务清理共用一次关闭通知')
    assert.equal(nativeCalls.close, 1)
    assert.equal(dom.window.document.querySelectorAll('dialog.omnimux-inspiration-preview-layer').length, 0)
    assert.equal(dom.window.__omnimuxInspirationPreview, undefined)
  } finally {
    try {
      if (dispose) await React.act(async () => dispose())
    } finally {
      cleanup()
    }
  }
})
