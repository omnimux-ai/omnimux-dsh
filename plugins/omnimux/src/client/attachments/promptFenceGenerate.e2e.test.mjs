import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { installPromptFenceGenerate } from './promptFenceGenerate.ts'
import { peekComposerPrefill, resetComposerPrefill } from '../media-viewer/composer-prefill.js'

function page(lang = 'zh') {
  return new JSDOM(`<!DOCTYPE html><html lang="${lang}"><body>
    <div data-conversation-scroll>
      <div class="md-code-block">
        <div data-code-block-banner><div class="info">prompt-image</div><div class="action"><button type="button" class="copy">复制</button></div></div>
        <div data-code-block-content><pre><code>a tiny red perfume bottle</code></pre></div>
      </div>
      <div class="md-code-block">
        <div data-code-block-banner><div class="info">markdown</div><div class="action"><button type="button" class="copy">复制</button></div></div>
        <div data-code-block-content><pre><code>普通说明</code></pre></div>
      </div>
    </div>
  </body></html>`, { pretendToBeVisual: true, runScripts: 'dangerously' })
}

function ruleText(dom, className) {
  const sheet = [...dom.window.document.styleSheets].at(-1)
  const rule = [...(sheet?.cssRules || [])].find((item) => item.selectorText?.includes(className))
  return rule?.cssText || ''
}

test('端到端：底栏按钮填入图片提示词，普通说明没有按钮', async () => {
  const dom = page('zh')
  const doc = dom.window.document
  const opened = []
  dom.window.__omnimuxWorkbench = {
    openWorkbench(opts) { opened.push(opts.tabId); return true },
  }
  resetComposerPrefill()
  const stop = installPromptFenceGenerate(doc)
  await new Promise((resolve) => setTimeout(resolve, 80))

  const cards = [...doc.querySelectorAll('.md-code-block')]
  assert.equal(cards[1].querySelector('.omx-prompt-generate'), null)
  assert.equal(cards[0].querySelector('.omx-prompt-caption')?.textContent, '图片提示词')
  assert.match(ruleText(dom, 'omx-prompt-mark'), /position:\s*absolute/)

  const button = cards[0].querySelector('.omx-prompt-generate')
  const foot = button?.closest('.omx-prompt-foot')
  assert.equal(button?.textContent, '使用提示词生成')
  assert.equal(foot?.querySelector('.omx-prompt-foot-kind')?.textContent, '图片')
  assert.match(ruleText(dom, 'omx-prompt-generate'), /height:\s*32px/)

  button?.click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const filled = peekComposerPrefill()
  assert.equal(filled?.prompt, 'a tiny red perfume bottle')
  assert.equal(filled?.kind, 'image')
  assert.deepEqual(opened, ['omnimux:media-viewer'])
  assert.equal(button?.textContent, '已填入')
  stop()
  resetComposerPrefill()
})

test('端到端：英文页面按钮换成英文', async () => {
  const dom = page('en')
  const stop = installPromptFenceGenerate(dom.window.document)
  await new Promise((resolve) => setTimeout(resolve, 80))
  const button = dom.window.document.querySelector('.omx-prompt-generate')
  assert.equal(button?.textContent, 'Generate with prompt')
  assert.equal(dom.window.document.querySelector('.omx-prompt-foot-kind')?.textContent, 'Image')
  stop()
})
