import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const sourceFile = join(here, 'ModalCloseButton.jsx')
const source = readFileSync(sourceFile, 'utf8')

// 使用 esbuild 编译 JSX
const output = await build({
  entryPoints: [sourceFile],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom']
})
const module = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const { ModalCloseButton } = module.exports

describe('ModalCloseButton L1 Static Compliance', () => {
  it('complies with UI01 exemption comment directly on button tag line', () => {
    assert.match(source, /<button[^>]*>\s*{\s*\/\*\s*\/\/\s*exempt-ui01:/)
  })

  it('complies with UI03 design token governance without bare color codes', () => {
    const bareHexOrRgb = /#(?:[0-9a-fA-F]{3,8})\b|rgb\([^)]+\)|rgba\([^)]+\)/
    assert.doesNotMatch(source, bareHexOrRgb, 'source must not contain bare color literals')
  })
})

describe('ModalCloseButton Functional & DOM Contract', () => {
  const setupDom = () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>')
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const container = document.getElementById('root')
    const root = createRoot(container)
    return {
      container,
      root,
      cleanup: () => {
        act(() => root.unmount())
        delete globalThis.window
        delete globalThis.document
        delete globalThis.IS_REACT_ACT_ENVIRONMENT
      }
    }
  }

  it('renders default button with is-external placement, SVG icon, and accessibility attributes', async () => {
    const { container, root, cleanup } = setupDom()
    try {
      await act(async () => {
        root.render(React.createElement(ModalCloseButton, { ariaLabel: 'Close Dialog' }))
      })
      const btn = container.querySelector('button')
      assert.ok(btn, 'button element should be rendered')
      assert.equal(btn.type, 'button')
      assert.ok(btn.classList.contains('omnimux-modal-close-btn'))
      assert.ok(btn.classList.contains('is-external'))
      assert.ok(btn.classList.contains('omnimux-split-modal-close'))
      assert.equal(btn.getAttribute('aria-label'), 'Close Dialog')

      const svg = btn.querySelector('svg')
      assert.ok(svg, 'default SVG icon should be present')
      assert.equal(svg.getAttribute('width'), '14')
      assert.equal(svg.getAttribute('height'), '14')
    } finally {
      cleanup()
    }
  })

  it('supports placement variants: top-right and inline', async () => {
    const { container, root, cleanup } = setupDom()
    try {
      await act(async () => {
        root.render(
          React.createElement('div', null,
            React.createElement(ModalCloseButton, { placement: 'top-right', className: 'custom-top' }),
            React.createElement(ModalCloseButton, { placement: 'inline', className: 'custom-inline' }),
          )
        )
      })
      const btnTop = container.querySelector('.custom-top')
      assert.ok(btnTop.classList.contains('is-top-right'))

      const btnInline = container.querySelector('.custom-inline')
      assert.ok(btnInline.classList.contains('is-inline'))
    } finally {
      cleanup()
    }
  })

  it('triggers onClose, onClick, and onCancel with stopPropagation', async () => {
    const { container, root, cleanup } = setupDom()
    try {
      let closed = false
      let clicked = false
      let cancelled = false
      let parentClicked = false

      await act(async () => {
        root.render(
          React.createElement('div', { onClick: () => { parentClicked = true } },
            React.createElement(ModalCloseButton, {
              onClose: () => { closed = true },
              onClick: () => { clicked = true },
              onCancel: () => { cancelled = true },
            })
          )
        )
      })

      const btn = container.querySelector('button')
      await act(async () => {
        btn.click()
      })

      assert.equal(closed, true, 'onClose should be called')
      assert.equal(clicked, true, 'onClick should be called')
      assert.equal(cancelled, true, 'onCancel should be called')
      assert.equal(parentClicked, false, 'click should not bubble to parent')
    } finally {
      cleanup()
    }
  })

  it('supports custom icon override', async () => {
    const { container, root, cleanup } = setupDom()
    try {
      await act(async () => {
        root.render(
          React.createElement(ModalCloseButton, {
            icon: React.createElement('span', { className: 'custom-close-icon' }, '✕')
          })
        )
      })
      const customIcon = container.querySelector('.custom-close-icon')
      assert.ok(customIcon, 'custom icon should be rendered instead of svg')
      assert.equal(container.querySelector('svg'), null)
    } finally {
      cleanup()
    }
  })
})
