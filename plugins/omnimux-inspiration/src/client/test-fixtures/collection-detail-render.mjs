/**
 * jsdom + esbuild harness for the collection detail render gate.
 *
 * Bundling lives here rather than in the test file so the assertion module stays
 * a plain evaluation contract: the gate bundles the real stage, mounts it with a
 * UI-kit leaf shim (the production kit imports `.module.css`, which esbuild cannot
 * inline) and hands back the query surface.
 *
 * This module is imported only by tests, never by the client entry.
 */

import './dom-bootstrap.mjs'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { DOM_RENDER_LOADERS } from './dom-render-build.mjs'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const hereUrl = new URL('.', import.meta.url)
const stageEntry = fileURLToPath(new URL('collection-detail-stage.jsx', hereUrl))
const shimEntry = fileURLToPath(new URL('ui-kit-shim.mjs', hereUrl))
const pluginRoot = fileURLToPath(new URL('../../../', hereUrl))

/** Build output directory; callers remove it after the suite. */
export const COLLECTION_DETAIL_CACHE_URL = new URL('../.esbuild-cache/collection-detail/', hereUrl)

let bundleCounter = 0

async function bundleStage() {
  bundleCounter += 1
  const outUrl = new URL(`collection-detail-stage-${bundleCounter}.mjs`, COLLECTION_DETAIL_CACHE_URL)
  await esbuild.build({
    loader: DOM_RENDER_LOADERS,
    absWorkingDir: pluginRoot,
    entryPoints: [stageEntry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    write: true,
    outfile: fileURLToPath(outUrl),
    logLevel: 'silent',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    plugins: [{
      name: 'ui-kit-shim',
      setup(build) {
        build.onResolve({ filter: /^dsh-ui-kit$/ }, () => ({ path: shimEntry }))
      },
    }],
  })
  return outUrl
}

/**
 * @param {string} exportName
 * @param {Record<string, any>} props
 */
async function mountStage(exportName, props) {
  const outUrl = await bundleStage()
  const stageModule = await import(`${outUrl.href}?mount=${bundleCounter}`)
  const Component = stageModule[exportName]
  if (typeof Component !== 'function') throw new Error(`stage must export ${exportName}`)

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const container = dom.window.document.getElementById('host')
  const reactRoot = createRoot(container)
  try {
    await act(async () => {
      reactRoot.render(React.createElement(Component, props))
    })
  } catch (error) {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    dom.window.close()
    throw error
  }

  return {
    document: dom.window.document,
    window: dom.window,
    container,
    async click(node) {
      await act(async () => {
        node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      })
    },
    async unmount() {
      await act(async () => reactRoot.unmount())
      globalThis.window = previousWindow
      globalThis.document = previousDocument
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    },
    close() {
      dom.window.close()
    },
  }
}

/**
 * Mount the inspiration cover card with a (possibly media-first) descriptor.
 * @param {{ card: Record<string, any>, descriptor?: Record<string, any> }} props
 */
export function mountCoverCard(props) {
  return mountStage('CoverCardStage', props)
}

/**
 * Mount the collection detail header.
 * @param {Record<string, any>} props
 */
export function mountCollectionHeader(props) {
  return mountStage('CollectionHeaderStage', props)
}
