import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const here = fileURLToPath(new URL('.', import.meta.url))
const shimEntry = join(here, 'test-fixtures', 'ui-kit-shim.mjs')

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
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:3000',
    pretendToBeVisual: true,
  })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document

  return {
    dom,
    cleanup() {
      dom.window.close()
      globalThis.window = previous.window
      globalThis.document = previous.document
    },
  }
}

test('E2E: registerPreviewService 挂载全局服务并在 open 调用时渲染顶层 PreviewModalLayer 弹窗', async () => {
  const { dom, cleanup } = setupDom()
  const { registerPreviewService } = await loadComponent('./preview-service.jsx')

  try {
    let closed = false
    let replicated = false

    const dispose = registerPreviewService((k, fb) => fb || k, dom.window)
    assert.ok(dom.window.__omnimuxInspirationPreview, '服务已挂载在全局 window 上')
    assert.equal(typeof dom.window.__omnimuxInspirationPreview.open, 'function', '提供 open 方法')

    const close = dom.window.__omnimuxInspirationPreview.open({
      row: {
        id: 'insp_101',
        title: '测试灵感视频',
        video_url: 'https://example.com/video.mp4',
        cover_url: 'https://example.com/cover.jpg',
      },
      onClose: () => { closed = true },
      onReplicate: () => { replicated = true },
    })

    // 等待 microtask 渲染
    await new Promise(r => setTimeout(r, 60))

    const dialog = dom.window.document.querySelector('dialog.omnimux-inspiration-preview-layer')
    assert.ok(dialog, '原生 dialog 顶层隔离层已插入 document.body')

    // 触发 close
    close()
    await new Promise(r => setTimeout(r, 60))

    assert.equal(closed, true, '关闭回调已触发')
    dispose()
  } finally {
    cleanup()
  }
})
