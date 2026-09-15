import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'

const here = fileURLToPath(new URL('.', import.meta.url))
const cache = join(here, '.esbuild-cache', 'share-render')
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

describe('InspirationPreviewModal share button', () => {
  it('renders the share button in header actions area', () => {
    const markup = renderToStaticMarkup(React.createElement(InspirationPreviewModal, {
      row: { id: 'insp-1', title: '测试灵感分享素材' },
      t: (key) => {
        if (key === 'modal.share.btn') return '分享'
        if (key === 'modal.share.title') return '分享灵感'
        return key
      },
      onClose() {},
    }))
    const dom = new JSDOM(markup)
    try {
      const shareBtn = dom.window.document.querySelector('.omnimux-inspiration-share-trigger-btn')
      assert.ok(shareBtn, '头部右上角操作区应包含分享按钮')
      assert.match(shareBtn.textContent, /分享/)

      const actions = dom.window.document.querySelector('.omnimux-inspiration-modal-header-actions')
      assert.ok(actions, '弹窗 header 应具有 header-actions 容器')
      assert.ok(actions.contains(shareBtn), '分享按钮应位于 header-actions 容器内')
    } finally {
      dom.window.close()
    }
  })
})
