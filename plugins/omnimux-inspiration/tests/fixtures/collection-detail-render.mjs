/**
 * jsdom + esbuild harness for the collection detail render gate.
 *
 * Bundling lives here rather than in the test file so the assertion module stays
 * a plain evaluation contract: the gate bundles the real stage, mounts it with a
 * UI-kit leaf shim (the production kit imports `.module.css`, which esbuild cannot
 * inline) and hands back the query surface.
 *
 * Memory safety is part of the contract: the stage bundle is built ONCE per
 * process and reused by every mount (the stage module only exports components,
 * so it carries no per-mount state), and mountStage owns its own cleanup — a
 * failed render still unmounts the root, restores the globals and closes the
 * jsdom window. A suite asserts `activeMountCount()` is back to zero, so a
 * forgotten cleanup fails loudly instead of quietly accumulating windows.
 *
 * This module is imported only by tests, never by the client entry.
 */

import './dom-bootstrap.mjs'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { DOM_RENDER_LOADERS } from './dom-render-build.mjs'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const hereUrl = new URL('.', import.meta.url)
const stageEntry = fileURLToPath(new URL('collection-detail-stage.jsx', hereUrl))
const shimEntry = fileURLToPath(new URL('ui-kit-shim.mjs', hereUrl))
const pluginRoot = fileURLToPath(new URL('../../', hereUrl))

/** Build output directory; callers remove it after the suite. */
export const COLLECTION_DETAIL_CACHE_URL = new URL('../../src/client/.esbuild-cache/collection-detail/', hereUrl)

/** One artifact name: a second mount must reuse it, never build a sibling. */
const BUNDLE_NAME = 'collection-detail-stage.mjs'

/** Ceiling for simultaneously open mounts; a leak trips this before the heap. */
const MAX_ACTIVE_MOUNTS = 32

let bundledUrl
let activeMounts = 0

async function bundleStage() {
  if (bundledUrl !== undefined && existsSync(fileURLToPath(bundledUrl))) return bundledUrl
  const outUrl = new URL(BUNDLE_NAME, COLLECTION_DETAIL_CACHE_URL)
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
  bundledUrl = outUrl
  return outUrl
}

/**
 * Live mounts in this process. The spec's lifecycle contract is
 * `activeMountCount() === 0` after the suite; a mismatch means a test leaked a
 * mount instead of unmounting it.
 * @returns {number}
 */
export function activeMountCount() {
  return activeMounts
}

/**
 * @param {string} exportName
 * @param {Record<string, any>} props
 */
async function mountStage(exportName, props) {
  const outUrl = await bundleStage()
  // Same URL => Node's ESM cache hands back the same module instance; no mount
  // should ever create a second copy of the stage graph.
  const stageModule = await import(outUrl.href)
  const Component = stageModule[exportName]
  if (typeof Component !== 'function') throw new Error(`stage must export ${exportName}`)
  if (activeMounts >= MAX_ACTIVE_MOUNTS) {
    throw new Error(`collection-detail harness: ${activeMounts} mounts are still open; unmount the previous card`)
  }

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
  activeMounts += 1
  let released = false
  // The ONE release path: idempotent, so unmount/close/the error path can all
  // call it without double-decrementing or closing a window twice.
  const release = () => {
    if (released) return
    released = true
    activeMounts -= 1
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    dom.window.close()
  }

  try {
    await act(async () => {
      reactRoot.render(React.createElement(Component, props))
    })
  } catch (error) {
    // A render that throws must not leave the window, globals or mount count
    // behind: the caller only receives the rethrown error.
    try {
      await act(async () => reactRoot.unmount())
    } catch {
      // The failed tree may already be torn down; release() still runs.
    }
    release()
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
      try {
        await act(async () => reactRoot.unmount())
      } finally {
        release()
      }
    },
    close() {
      release()
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
