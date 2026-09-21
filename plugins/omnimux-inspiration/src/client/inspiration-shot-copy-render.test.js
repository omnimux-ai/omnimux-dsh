import assert from 'node:assert/strict'
import { after, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { zh } from './locales.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const cache = join(here, '.esbuild-cache', 'shot-copy-render')
mkdirSync(cache, { recursive: true })
after(() => rmSync(cache, { recursive: true, force: true }))
const result = await build({
  entryPoints: [join(here, 'InspirationPreviewModal.jsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  write: false,
  external: ['react', 'react/jsx-runtime'],
  alias: { 'dsh-ui-kit': join(here, 'test-fixtures/ui-kit-shim.mjs') },
})
const bundle = join(cache, 'preview.mjs')
writeFileSync(bundle, result.outputFiles[0].text)
const { InspirationPreviewModal } = await import(bundle)

const shots = [
  {
    id: 's1',
    time_range: '00:00 - 00:03',
    stage: 'HOOK',
    title: '开场悬念',
    description: '快速举起产品贴近镜头',
    script: '这真的是我今年发现最绝的宝藏',
    prompt: 'Young creator holding a towel, close-up',
  },
  {
    id: 's2',
    time_range: '00:03 - 00:07',
    stage: 'BODY',
    description: '细致涂抹推开',
    script: '质地超级清爽细腻',
    prompt: 'Close-up hands dispersing cream',
  },
  {
    id: 's3',
    time_range: '00:07 - 00:11',
    stage: 'BODY',
    description: '手指轻弹面部',
    script: '连续用了一周之后',
    prompt: 'Macro split comparison',
  },
  {
    id: 's4',
    time_range: '00:11 - 00:13',
    stage: 'CTA',
    description: '引导评论',
    script: '评论区扣 Cowboy',
    prompt: 'Creator pointing at comment box',
  },
]

it('shows a human shots title and no per-shot copy button', () => {
  const markup = renderToStaticMarkup(React.createElement(InspirationPreviewModal, {
    row: {
      id: 'shot-copy',
      title: 'Cowboy costume',
      type: 'video',
      analysis: {
        shots,
        hook_highlight: '开场 0-3 秒抓注意力',
        target_goal: '引导评论区转化',
      },
    },
    t: (key) => zh[key] || key,
    onClose() {},
  }))
  const dom = new JSDOM(markup)
  try {
    const heading = dom.window.document.querySelector('.omnimux-inspiration-modal-script-panel h3')
    assert.equal(heading?.textContent?.trim(), '逐镜头分镜脚本 (4)')
    assert.doesNotMatch(markup, /modal\.deconstruction\.shotsTitle/)
    assert.doesNotMatch(markup, /modal\.deconstruction\.copyPrompt/)
    const cards = dom.window.document.querySelectorAll('.omnimux-inspiration-shot-card')
    assert.equal(cards.length, 4)
    assert.equal(dom.window.document.querySelectorAll('.omnimux-inspiration-shot-copy-btn').length, 0)
    const perShotCopies = [...cards].flatMap((card) => [...card.querySelectorAll('button')])
      .filter((button) => /复制/.test(button.textContent || '') || /copyPrompt/.test(button.getAttribute('aria-label') || ''))
    assert.equal(perShotCopies.length, 0, '分镜卡片内不得出现复制按钮')
    const actionButtons = [...dom.window.document.querySelectorAll('.omnimux-inspiration-modal-script-panel .omnimux-inspiration-modal-panel-actions button')]
    const panelCopy = actionButtons.find((button) => (button.textContent || '').trim() === '复制')
    assert.ok(panelCopy, '中栏标题旁整段复制必须保留')
    const deconCopy = [...dom.window.document.querySelectorAll('.omnimux-inspiration-modal-deconstruction-panel .omnimux-inspiration-deconstruct-heading button')]
      .find((button) => (button.textContent || '').trim() === '复制')
    assert.ok(deconCopy, '右栏内容解构复制必须保留')
  } finally {
    dom.window.close()
  }
})
