import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { runInNewContext } from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(here, name), 'utf8')

const mediaJsx = read('ProductMediaSection.jsx')
const stylesJs = read('styles.js')
const localesJs = read('locales.js')

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./ProductMediaSection.jsx', import.meta.url))],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'dsh-ui-kit'],
  logLevel: 'silent',
})

const bundleText = bundle.outputFiles[0].text

function exportsOf() {
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === 'react') return React
      if (name === 'react/jsx-runtime') return awaitImportJsx()
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
  function awaitImportJsx() {
    return {
      jsx: (type, props) => React.createElement(type, props),
      jsxs: (type, props) => React.createElement(type, props),
      Fragment: React.Fragment,
    }
  }
  runInNewContext(bundleText, context)
  return context.module.exports
}

const { ImageLightbox, MediaThumb, MediaItem, MediaList } = exportsOf()

describe('Product media thumbnail hover zoom preview and click lightbox contract', () => {
  it('ProductMediaSection exports ImageLightbox, MediaThumb, MediaItem and MediaList', () => {
    assert.match(mediaJsx, /export function ImageLightbox\b/)
    assert.match(mediaJsx, /export function MediaThumb\b/)
    assert.match(mediaJsx, /export function MediaItem\b/)
    assert.match(mediaJsx, /export function MediaList\b/)
  })

  it('declares all preview and lightbox classes in styles.js', () => {
    const requiredClasses = [
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
    for (const cls of requiredClasses) {
      assert.match(stylesJs, new RegExp(`\\.${cls}\\b`), `styles.js must declare .${cls}`)
    }
  })

  it('locales.js contains zoomPreview and closePreview keys in both zh and en', () => {
    assert.match(localesJs, /'detail\.zoomPreview':\s*'点击查看大图'/)
    assert.match(localesJs, /'detail\.closePreview':\s*'关闭大图预览'/)
    assert.match(localesJs, /'detail\.zoomPreview':\s*'Click to view full image'/)
    assert.match(localesJs, /'detail\.closePreview':\s*'Close preview'/)
  })

  it('MediaThumb renders file icon when src is empty', () => {
    const html = renderToString(React.createElement(MediaThumb, { src: '', label: 'test.png' }))
    assert.match(html, /omnimux-products-icon/)
    assert.doesNotMatch(html, /omnimux-products-thumb-wrap/)
  })

  it('MediaThumb renders hover popover and clickable button when src is present', () => {
    const html = renderToString(React.createElement(MediaThumb, {
      src: 'https://example.com/item.webp',
      label: 'item.webp',
      t: (k) => (k === 'detail.zoomPreview' ? '点击查看大图' : k),
    }))
    assert.match(html, /omnimux-products-thumb-wrap/)
    assert.match(html, /omnimux-products-thumb-button/)
    assert.match(html, /omnimux-products-media-thumb/)
    assert.match(html, /omnimux-products-thumb-popover/)
    assert.match(html, /omnimux-products-popover-image/)
    assert.match(html, /omnimux-products-popover-hint/)
    assert.match(html, /点击查看大图/)
    assert.match(html, /https:\/\/example\.com\/item\.webp/)
  })

  it('ImageLightbox renders full backdrop, image, caption and close button', () => {
    const html = renderToString(React.createElement(ImageLightbox, {
      src: 'https://example.com/big.webp',
      label: 'big.webp',
      onClose: () => {},
      t: (k) => (k === 'detail.closePreview' ? '关闭大图预览' : k),
    }))
    assert.match(html, /omnimux-products-lightbox-backdrop/)
    assert.match(html, /omnimux-products-lightbox-container/)
    assert.match(html, /omnimux-products-lightbox-image/)
    assert.match(html, /omnimux-products-lightbox-caption/)
    assert.match(html, /omnimux-products-lightbox-close/)
    assert.match(html, /big\.webp/)
    assert.match(html, /https:\/\/example\.com\/big\.webp/)
  })

  it('ImageLightbox returns null when src is empty', () => {
    const html = renderToString(React.createElement(ImageLightbox, {
      src: '',
      label: '',
      onClose: () => {},
    }))
    assert.equal(html, '')
  })
})

