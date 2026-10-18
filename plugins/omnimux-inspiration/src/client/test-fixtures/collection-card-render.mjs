/**
 * jsdom + esbuild harness for `collection-card-actions.test.js`.
 *
 * The gate under test is plugin code — the collection card decides whether it
 * renders an action layer and what each button does — so the real `.jsx` is
 * bundled and mounted. `dsh-ui-kit` leaf components are replaced by the
 * existing `ui-kit-shim.mjs` (the production kit's lib imports `.module.css`,
 * which esbuild cannot inline); the shim keeps the kit's button DOM contract.
 *
 * The harness lives in `test-fixtures/` on purpose: the test file stays a plain
 * assertion module, and the build/mount plumbing (which must import the fresh
 * bundle dynamically) stays here instead of in an evaluation contract. This
 * module is imported only by tests, never by the client entry; it keeps no
 * Node-native imports so the client boundary check stays meaningful.
 */

import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { DOM_RENDER_LOADERS } from './dom-render-build.mjs'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const hereUrl = new URL('.', import.meta.url)
const stageEntry = fileURLToPath(new URL('collection-card-stage.jsx', hereUrl))
const shimEntry = fileURLToPath(new URL('ui-kit-shim.mjs', hereUrl))
const pluginRoot = fileURLToPath(new URL('../../../', hereUrl))

/** Build output directory; the gate removes it in `after`. */
export const COLLECTION_CARD_CACHE_URL = new URL('../.esbuild-cache/collection-card-stage/', hereUrl)

let bundleCounter = 0

/** Bundle the stage with the UI-kit shim; a fresh file per mount isolates module state. */
async function bundleStage() {
  bundleCounter += 1
  const outUrl = new URL(`collection-card-stage-${bundleCounter}.mjs`, COLLECTION_CARD_CACHE_URL)
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
 * Mount one stage variant and return the query/click surface the gate needs.
 *
 * @param {{
 *   kind?: 'collection' | 'inspiration',
 *   collection?: Record<string, any>,
 *   row?: Record<string, any>,
 *   t: (key: string) => string,
 *   preview?: boolean,
 *   addToSessionBusy?: boolean,
 * }} options
 */
export async function mountCollectionCard(options) {
  const outUrl = await bundleStage()
  const stageModule = await import(`${outUrl.href}?mount=${bundleCounter}`)

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost:3000',
  })
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const calls = { open: [], add: [] }
  const container = dom.window.document.getElementById('host')
  const reactRoot = createRoot(container)

  await act(async () => {
    reactRoot.render(React.createElement(stageModule.CollectionCardStage, {
      kind: options.kind || 'collection',
      collection: options.collection,
      row: options.row,
      t: options.t,
      preview: options.preview === true,
      addToSessionBusy: options.addToSessionBusy === true,
      onOpen: collection => calls.open.push(collection),
      onAddToSession: collection => calls.add.push(collection),
    }))
  })

  return {
    document: dom.window.document,
    container,
    calls,
    group: () => container.querySelector('.omnimux-inspiration-collection-actions'),
    card: () => container.querySelector('article'),
    buttons: () => Array.from(container.querySelectorAll('.omnimux-inspiration-collection-actions button')),
    allButtons: () => Array.from(container.querySelectorAll('button')),
    async click(node) {
      await act(async () => {
        node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      })
    },
    async press(node, key) {
      let prevented = false
      await act(async () => {
        const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        node.dispatchEvent(event)
        prevented = event.defaultPrevented
      })
      return { prevented }
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
