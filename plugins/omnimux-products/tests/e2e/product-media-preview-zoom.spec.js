/**
 * @file plugins/omnimux-products/tests/e2e/product-media-preview-zoom.spec.js
 * @description 产品库详情媒体缩略图悬停放大与点击查看大图灯箱端到端回归测试 (AC-101 ~ AC-104)。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'

const mediaJsxPath = fileURLToPath(new URL('../../src/client/ProductMediaSection.jsx', import.meta.url))
const stylesJsPath = fileURLToPath(new URL('../../src/client/styles.js', import.meta.url))
const localesJsPath = fileURLToPath(new URL('../../src/client/locales.js', import.meta.url))

const mediaJsx = readFileSync(mediaJsxPath, 'utf8')
const stylesJs = readFileSync(stylesJsPath, 'utf8')
const localesJs = readFileSync(localesJsPath, 'utf8')

const bundle = await build({
  entryPoints: [mediaJsxPath],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'dsh-ui-kit'],
  logLevel: 'silent',
})

const bundleText = bundle.outputFiles[0].text

function createRenderContext() {
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === 'react') return React
      if (name === 'react/jsx-runtime') {
        return {
          jsx: (type, props) => React.createElement(type, props),
          jsxs: (type, props) => React.createElement(type, props),
          Fragment: React.Fragment,
        }
      }
      if (name === 'dsh-ui-kit') {
        return {
          Button: (props) => React.createElement('button', { ...props, className: [props.className, 'dsh-btn'].filter(Boolean).join(' ') }),
          IconButton: (props) => React.createElement('button', { ...props, className: [props.className, 'dsh-icon-btn'].filter(Boolean).join(' ') }),
          InputField: (props) => React.createElement('input', props),
        }
      }
      throw new Error(`unexpected dependency ${name}`)
    },
  }
  runInNewContext(bundleText, context)
  return context.module.exports
}

const { ImageLightbox, MediaThumb, MediaItem, MediaList } = createRenderContext()

describe('e2e · product media preview zoom & lightbox (AC-101 ~ AC-104)', () => {
  it('AC-101: MediaThumb mounts hover popover and interactive trigger button', () => {
    const html = renderToString(React.createElement(MediaThumb, {
      src: 'https://cdn.example.com/item-01.webp',
      label: 'item-01.webp',
      t: (k) => (k === 'detail.zoomPreview' ? '点击查看大图' : k),
    }))

    assert.match(html, /class="omnimux-products-thumb-wrap"/, 'must wrap in relative container')
    assert.match(html, /class="omnimux-products-thumb-button"/, 'must provide accessible trigger')
    assert.match(html, /class="omnimux-products-media-thumb"/, 'must render thumbnail image')
    assert.match(html, /class="omnimux-products-thumb-popover"/, 'must render hover popover container')
    assert.match(html, /class="omnimux-products-popover-image"/, 'must render popover image')
    assert.match(html, /class="omnimux-products-popover-hint"/, 'must render popover action hint')
  })

  it('AC-102: ImageLightbox renders full backdrop, centered image, caption and close button', () => {
    const html = renderToString(React.createElement(ImageLightbox, {
      src: 'https://cdn.example.com/item-01.webp',
      label: 'perfume-bottle-01.webp',
      onClose: () => {},
      t: (k) => (k === 'detail.closePreview' ? '关闭大图预览' : k),
    }))

    assert.match(html, /class="omnimux-products-lightbox-backdrop"/, 'must render fixed backdrop')
    assert.match(html, /class="omnimux-products-lightbox-container"/, 'must render centered container')
    assert.match(html, /class="omnimux-products-lightbox-image"/, 'must render full image')
    assert.match(html, /class="omnimux-products-lightbox-caption"/, 'must render caption capsule')
    assert.match(html, /omnimux-products-lightbox-close/, 'must render close action button')
    assert.match(html, /perfume-bottle-01\.webp/, 'must display filename')
  })

  it('AC-103: styles.js declares all required styles with official design tokens', () => {
    const classes = [
      'omnimux-products-thumb-wrap',
      'omnimux-products-thumb-button',
      'omnimux-products-media-thumb',
      'omnimux-products-thumb-popover',
      'omnimux-products-popover-image',
      'omnimux-products-popover-footer',
      'omnimux-products-popover-hint',
      'omnimux-products-lightbox-backdrop',
      'omnimux-products-lightbox-container',
      'omnimux-products-lightbox-image',
      'omnimux-products-lightbox-caption',
      'omnimux-products-lightbox-close',
    ]
    for (const c of classes) {
      assert.match(stylesJs, new RegExp(`\\.${c}\\b`), `styles.js must define .${c}`)
    }
    assert.match(stylesJs, /var\(--dsw-alias-bg-elevated\)/, 'must use bg-elevated token')
    assert.match(stylesJs, /var\(--dsw-alias-bg-mask-1\)/, 'must use bg-mask-1 token')
    assert.match(stylesJs, /var\(--dsw-alias-border-l3\)/, 'must use border-l3 token')
  })

  it('AC-104: locales.js supports zoom and close copy in both zh and en', () => {
    assert.match(localesJs, /'detail\.zoomPreview':\s*'点击查看大图'/)
    assert.match(localesJs, /'detail\.closePreview':\s*'关闭大图预览'/)
    assert.match(localesJs, /'detail\.zoomPreview':\s*'Click to view full image'/)
    assert.match(localesJs, /'detail\.closePreview':\s*'Close preview'/)
  })
})
