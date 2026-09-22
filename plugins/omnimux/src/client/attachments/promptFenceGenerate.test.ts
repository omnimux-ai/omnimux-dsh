import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  enhancePromptFence,
  parsePromptFenceKind,
  readFencePrompt,
  scanPromptFences,
} from './promptFenceGenerate.ts'
import { peekComposerPrefill, resetComposerPrefill } from '../media-viewer/composer-prefill.js'

function fence(doc: Document, lang: string, body: string) {
  const block = doc.createElement('div')
  block.className = 'md-code-block'
  block.innerHTML = `
    <div data-code-block-banner>
      <div class="info">${lang}</div>
      <div class="action"><button type="button" class="copy">复制</button></div>
    </div>
    <div data-code-block-content><pre><code>${body}</code></pre></div>`
  doc.body.appendChild(block)
  return block
}

test('parsePromptFenceKind 只认图片和视频两种标记', () => {
  assert.equal(parsePromptFenceKind('prompt-image'), 'image')
  assert.equal(parsePromptFenceKind('PROMPT-VIDEO 分镜'), 'video')
  for (const lang of ['markdown', 'json', 'prompt', 'prompt-image-extra', '', '  ']) {
    assert.equal(parsePromptFenceKind(lang), null, lang)
  }
})

test('只有标记过的代码块出现底栏按钮，点击只填入不发起生成', async () => {
  const dom = new JSDOM('<!DOCTYPE html><body></body>')
  const doc = dom.window.document
  const opened: string[] = []
  ;(dom.window as unknown as { __omnimuxWorkbench: object }).__omnimuxWorkbench = {
    openWorkbench(opts: { tabId: string }) { opened.push(opts.tabId); return Promise.resolve(true) },
  }
  const marked = fence(doc, 'prompt-image', 'a glass perfume bottle')
  const plain = fence(doc, 'markdown', '这是一段说明')
  resetComposerPrefill()
  const fetches: string[] = []
  dom.window.fetch = ((url: string) => { fetches.push(url); return Promise.resolve({ ok: false }) }) as typeof fetch

  assert.equal(scanPromptFences(doc), 1)
  assert.equal(plain.querySelectorAll('.omx-prompt-generate').length, 0)
  const button = marked.querySelector('.omx-prompt-generate') as HTMLButtonElement
  assert.equal(button.textContent, '使用提示词生成')
  assert.equal(button.closest('.omx-prompt-foot')?.querySelector('.omx-prompt-foot-kind')?.textContent, '图片')
  assert.equal(marked.querySelector('[data-code-block-banner] .omx-prompt-generate'), null)
  assert.equal(marked.querySelector('.omx-prompt-caption')?.textContent, '图片提示词')
  assert.equal(marked.querySelector('.omx-prompt-mark')?.textContent, 'prompt-image')
  assert.equal(marked.querySelectorAll('.copy').length, 1)

  button.click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const pending = peekComposerPrefill()
  assert.equal(pending?.kind, 'image')
  assert.equal(pending?.prompt, 'a glass perfume bottle')
  assert.deepEqual(opened, ['omnimux:media-viewer'])
  assert.deepEqual(fetches, [])
  resetComposerPrefill()
})

test('视频标记切到视频，重复扫描不重复加按钮', async () => {
  const dom = new JSDOM('<!DOCTYPE html><body></body>')
  const doc = dom.window.document
  ;(dom.window as unknown as { __omnimuxWorkbench: object }).__omnimuxWorkbench = {
    openWorkbench() { return Promise.resolve(true) },
  }
  const block = fence(doc, 'prompt-video', 'slow push in\n')
  assert.equal(readFencePrompt(block), 'slow push in')
  assert.equal(enhancePromptFence(block, doc), true)
  block.removeAttribute('data-omx-prompt-fence')
  assert.equal(enhancePromptFence(block, doc), true)
  assert.equal(block.querySelector('.omx-prompt-mark')?.textContent, 'prompt-video')
  assert.equal(block.querySelectorAll('.omx-prompt-generate').length, 1)
  ;(block.querySelector('.omx-prompt-generate') as HTMLButtonElement).click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(peekComposerPrefill()?.kind, 'video')
  assert.equal(block.querySelector('.omx-prompt-foot-kind')?.textContent, '视频')
  resetComposerPrefill()
})

test('英文界面按钮写成 Generate with prompt', () => {
  const dom = new JSDOM('<!DOCTYPE html><html lang="en"><body></body>')
  const doc = dom.window.document
  const block = fence(doc, 'prompt-image', 'a glass bottle')
  assert.equal(enhancePromptFence(block, doc), true)
  assert.equal(block.querySelector('.omx-prompt-generate')?.textContent, 'Generate with prompt')
  assert.equal(block.querySelector('.omx-prompt-foot-kind')?.textContent, 'Image')
  assert.equal(block.querySelector('.omx-prompt-caption')?.textContent, 'Image prompt')
})
