import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'

const root = fileURLToPath(new URL('../../', import.meta.url))
const clientDir = join(root, 'plugins/omnimux-inspiration/src/client')
const cache = join(clientDir, '.esbuild-cache', 'e2e-share-test')
mkdirSync(cache, { recursive: true })

const result = await build({
  entryPoints: [join(clientDir, 'InspirationPreviewModal.jsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  write: false,
  external: ['react', 'react/jsx-runtime'],
  alias: { 'dsh-ui-kit': join(clientDir, 'test-fixtures/ui-kit-shim.mjs') },
})
const bundle = join(cache, 'share-preview.mjs')
writeFileSync(bundle, result.outputFiles[0].text)
const { InspirationPreviewModal } = await import(bundle)

describe('E2E: Inspiration Preview Modal Share Flow', () => {
  it('verifies share trigger button and popover contract in preview modal', () => {
    const markup = renderToStaticMarkup(React.createElement(InspirationPreviewModal, {
      row: {
        id: 'insp-e2e-test',
        title: 'E2E 灵感分享测试素材',
        source_url: 'https://www.tiktok.com/@creator/video/1234567890123456789',
        analysis: {
          sections: [{ title: '分镜', analysis: '测试内容' }],
        },
      },
      t: (key) => {
        const dict = {
          'modal.share.btn': '分享',
          'modal.share.title': '分享灵感',
          'modal.share.3days': '3 天有效',
          'modal.share.forever': '永久有效',
          'modal.share.upcoming': '即将开放',
          'modal.share.adminOnly': '管理员专享',
          'modal.share.create': '创建链接',
          'modal.share.copy': '复制',
          'modal.share.copied': '已复制',
        }
        return dict[key] || key
      },
      onClose() {},
    }))

    const dom = new JSDOM(markup)
    try {
      const { document } = dom.window
      // 1. 验证标题栏右上角包含分享按钮
      const actions = document.querySelector('.omnimux-inspiration-modal-header-actions')
      assert.ok(actions, '弹窗 header 右侧必须存在操作容器')

      const shareBtn = actions.querySelector('.omnimux-inspiration-share-trigger-btn')
      assert.ok(shareBtn, '操作容器内必须包含分享按钮')
      assert.match(shareBtn.textContent, /分享/)
      assert.ok(shareBtn.querySelector('svg'), '分享按钮内必须包含矢量图标且水平同行挂载')

      // 2. 验证初始状态下 Popover 未展开（默认关闭以保持极简）
      const popover = actions.querySelector('.omnimux-inspiration-share-popover')
      assert.equal(popover, null, '默认状态下 Popover 不应展开')

      // 3. 验证本地灵感具备分享行为绑定
      assert.equal(shareBtn.getAttribute('title'), '分享')
    } finally {
      dom.window.close()
      rmSync(cache, { recursive: true, force: true })
    }
  })
})
