import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { installPromptFenceGenerate } from './promptFenceGenerate.ts'

// Issue #2999：按钮所在插件与图像生成页所在插件各自打包 composer-prefill.js。
// 这里用带 query 的导入得到一份独立模块实例，模拟查看器插件里的那份副本。
const viewerCopy = await import('../media-viewer/composer-prefill.js?bundle=viewer-e2e')

function page() {
  return new JSDOM(`<!DOCTYPE html><html lang="zh"><body>
    <div data-conversation-scroll>
      <div class="md-code-block">
        <div data-code-block-banner><div class="info">prompt-video</div><div class="action"><button type="button" class="copy">复制</button></div></div>
        <div data-code-block-content><pre><code>15s vertical 9:16 phone-shot street interview</code></pre></div>
      </div>
    </div>
  </body></html>`, { pretendToBeVisual: true, runScripts: 'dangerously' })
}

test('端到端：点「使用提示词生成」后，另一份打包副本的图像生成页收到视频提示词（Issue #2999）', async () => {
  const dom = page()
  const doc = dom.window.document
  const opened = []
  dom.window.__omnimuxWorkbench = {
    openWorkbench(opts) { opened.push(opts.tabId); return Promise.resolve(true) },
  }
  viewerCopy.resetComposerPrefill()
  const received = []
  const stopListen = viewerCopy.subscribeComposerPrefill((value) => received.push(value))
  const stop = installPromptFenceGenerate(doc)
  try {
    await new Promise((resolve) => setTimeout(resolve, 80))

    const button = doc.querySelector('.omx-prompt-generate')
    assert.equal(button?.textContent, '使用提示词生成')
    assert.equal(doc.querySelector('.omx-prompt-foot-kind')?.textContent, '视频')

    button.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepEqual(opened, ['omnimux:media-viewer'])
    assert.equal(received.length, 1)
    assert.equal(received[0]?.kind, 'video')
    const pending = viewerCopy.peekComposerPrefill()
    assert.equal(pending?.prompt, '15s vertical 9:16 phone-shot street interview')
    assert.equal(viewerCopy.takeComposerPrefill(pending.token)?.kind, 'video')
    assert.equal(viewerCopy.peekComposerPrefill(), null)
    assert.equal(button.textContent, '已填入')
  } finally {
    stop()
    stopListen()
    viewerCopy.resetComposerPrefill()
  }
})
