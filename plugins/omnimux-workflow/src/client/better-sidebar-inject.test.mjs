/**
 * 回归：顶层 apply 不得读 ctx.betterSidebar。
 *
 * 事故：Failed to load plugins / cannot get property "betterSidebar" without inject
 * 根因：Cordis 客户端 Proxy 对未 inject 的服务直接 throw；方案 C 在 apply
 * 里把 ctx.betterSidebar 塞进 mountNewProjectEntry / stageFace。
 *
 * 可选依赖只能 ctx.inject(['betterSidebar'], …)；不要写进顶层 export const inject。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { pathToFileURL, fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { bindBetterSidebar, getBetterSidebar } from './projects/projectCanvas.js'

const here = dirname(fileURLToPath(import.meta.url))
const applySource = readFileSync(join(here, 'index.js'), 'utf8')

function createCordisCtx(services, injected) {
  const allowed = new Set(injected)
  return new Proxy(services, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver)
      if (Object.prototype.hasOwnProperty.call(target, prop)) {
        return target[prop]
      }
      if (!allowed.has(prop)) {
        throw new Error(`cannot get property "${prop}" without inject`)
      }
      return target[prop]
    },
  })
}

function stubDom() {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  }
  let nextTimer = 1
  const timers = new Set()
  globalThis.setInterval = () => {
    const id = nextTimer++
    timers.add(id)
    return id
  }
  globalThis.clearInterval = (id) => { timers.delete(id) }
  const listeners = []
  const fakeWindow = {
    addEventListener(type, fn) { listeners.push([type, fn]) },
    removeEventListener() {},
    __omnimuxStage: {
      claim() {},
      release() {},
      PRODUCT_STAGE_EVENT: 'dsh-product-stage',
      readBox: () => ({ top: 0, left: 0, width: 0, height: 0 }),
    },
  }
  const fakeDocument = {
    head: { appendChild() {} },
    getElementById() { return null },
    querySelector() { return null },
    createElement() {
      return {
        type: '',
        dataset: {},
        className: '',
        innerHTML: '',
        style: {},
        textContent: '',
        addEventListener() {},
        setAttribute() {},
        querySelector() { return { textContent: '' } },
      }
    },
  }
  globalThis.window = fakeWindow
  globalThis.document = fakeDocument
  return () => {
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.setInterval = previous.setInterval
    globalThis.clearInterval = previous.clearInterval
  }
}

async function loadApply() {
  const result = await esbuild.build({
    absWorkingDir: join(here, '..', '..'),
    entryPoints: ['src/client/index.js'],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      '@deepseek-ai/dsh-client-ui-primitives',
    ],
  })
  const code = result.outputFiles[0]?.text
  if (!code) throw new Error('esbuild produced no apply bundle')
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-workflow-apply-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  writeFileSync(join(dir, 'react.js'), `
    export function createElement() { return null }
    export function useState(init) { return [typeof init === 'function' ? init() : init, () => {}] }
    export function useEffect() {}
    export function useLayoutEffect() {}
    export function useCallback(fn) { return fn }
    export function useRef(init) { return { current: init } }
    export function useMemo(fn) { return fn() }
    export function useId() { return 'id' }
    export function useImperativeHandle() {}
    export function useSyncExternalStore(_sub, getSnapshot) { return getSnapshot() }
    export function forwardRef(fn) { return fn }
    export const Fragment = 'Fragment'
    export default {
      createElement, useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo,
      useId, useImperativeHandle, useSyncExternalStore, forwardRef, Fragment,
    }
  `)
  writeFileSync(join(dir, 'jsx-runtime.js'), `
    export const jsx = (type, props) => ({ type, props })
    export const jsxs = (type, props) => ({ type, props })
    export const Fragment = 'Fragment'
    export const jsxDEV = (type, props) => ({ type, props })
  `)
  writeFileSync(join(dir, 'react-dom.js'), `
    export function createPortal(children) { return children }
    export default { createPortal }
  `)
  writeFileSync(join(dir, 'primitives.js'), `
    export function IconEditOutline16() { return null }
    export function IconTrashOutline16() { return null }
    export function IconCloseOutline16() { return null }
    export function IconRefreshOutline16() { return null }
    export function IconPlusOutline16() { return null }
    export function IconLoadingOutline16() { return null }
    export function IconSearchOutline16() { return null }
    export function IconCloseFill14() { return null }
    export function IconChevronDownOutline14() { return null }
    export function IconChevronUpOutline14() { return null }
    export function IconCheckOutline16() { return null }
    export function IconCopyOutline16() { return null }
    export function Tooltip({ children }) { return children }
    export function Modal({ children }) { return children }
    export function Menu({ children }) { return children }
  `)
  const rewritten = code
    .replaceAll("from \"react/jsx-runtime\"", "from \"./jsx-runtime.js\"")
    .replaceAll("from 'react/jsx-runtime'", "from './jsx-runtime.js'")
    .replaceAll("from \"react/jsx-dev-runtime\"", "from \"./jsx-runtime.js\"")
    .replaceAll("from 'react/jsx-dev-runtime'", "from './jsx-runtime.js'")
    .replaceAll("from \"react\"", "from \"./react.js\"")
    .replaceAll("from 'react'", "from './react.js'")
    .replaceAll("from \"@deepseek-ai/dsh-client-ui-primitives\"", "from \"./primitives.js\"")
    .replaceAll("from '@deepseek-ai/dsh-client-ui-primitives'", "from './primitives.js'")
    .replaceAll('from "react-dom"', 'from "./react-dom.js"')
    .replaceAll("from 'react-dom'", "from './react-dom.js'")
  const file = join(dir, 'apply.mjs')
  writeFileSync(file, rewritten)
  return import(pathToFileURL(file).href)
}

function applyBodyWithoutComments(source) {
  const start = source.indexOf('export function apply(ctx)')
  const body = start >= 0 ? source.slice(start) : source
  return body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function createApplyServices({ callInject = false, sidebar = null } = {}) {
  const injectCalls = []
  const effects = []
  const services = {
    locale: {
      register() { return () => {} },
      bind() { return (key) => key },
      subscribe() { return () => {} },
    },
    slots: {
      inject() {},
      register() { return () => {} },
    },
    sessions: { create: async () => 'sess', open() {}, list: { getSnapshot: () => [] } },
    workspaces: { list: { getSnapshot: () => [] } },
    layout: { openDetails() {}, closeDetails() {} },
    effect(fn) {
      const dispose = fn()
      effects.push(typeof dispose === 'function' ? dispose : () => {})
      return dispose
    },
    inject(deps, cb) {
      injectCalls.push(deps)
      if (callInject) cb(createCordisCtx({ betterSidebar: sidebar }, ['betterSidebar']))
    },
  }
  return { services, injectCalls, effects }
}

describe('omnimux-workflow betterSidebar inject', () => {
  it('源码：顶层 inject 列表不含 betterSidebar', () => {
    const match = applySource.match(/export const inject = \[([^\]]*)\]/)
    assert.ok(match, 'missing export const inject')
    assert.equal(match[1].includes('betterSidebar'), false)
  })

  it('源码：apply 不得读 ctx.betterSidebar，只能 ctx.inject', () => {
    const body = applyBodyWithoutComments(applySource)
    assert.doesNotMatch(body, /ctx\.betterSidebar/)
    assert.match(body, /ctx\.inject\(\['betterSidebar'\]/)
    assert.doesNotMatch(
      body,
      /betterSidebar:\s*ctx\.betterSidebar/,
      'stageFace / mountNewProjectEntry must not close over ctx.betterSidebar',
    )
    assert.match(body, /inner\.betterSidebar/)
  })

  it('getBetterSidebar：未 inject 的 Proxy 不抛，回落到 bind', () => {
    bindBetterSidebar(null)
    const ctx = createCordisCtx({}, [])
    assert.equal(getBetterSidebar(ctx), null)
    const service = { openTab() {} }
    bindBetterSidebar(service)
    assert.equal(getBetterSidebar(ctx), service)
    const plain = { betterSidebar: { openTab() {}, id: 'plain' } }
    assert.equal(getBetterSidebar(plain).id, 'plain')
    bindBetterSidebar(null)
  })
})

describe('apply(ctx) 未 inject betterSidebar', () => {
  let restore
  let mod

  before(async () => {
    restore = stubDom()
    mod = await loadApply()
  })

  after(() => {
    restore?.()
    bindBetterSidebar(null)
  })

  it('未就绪时 apply 不抛，也不读 betterSidebar', () => {
    const { services, injectCalls, effects } = createApplyServices({ callInject: false })
    const ctx = createCordisCtx(services, ['slots', 'locale', 'sessions', 'workspaces', 'layout', 'effect', 'inject'])
    assert.doesNotThrow(() => { mod.apply(ctx) })
    assert.deepEqual(injectCalls, [['betterSidebar']])
    assert.equal(mod.inject.includes('betterSidebar'), false)
    for (const dispose of effects) dispose()
  })

  it('inject 回调里才碰 betterSidebar 并 registerTab', () => {
    const registered = []
    const sidebar = {
      registerTab(tab) {
        registered.push(tab)
        return () => {}
      },
    }
    const { services, effects } = createApplyServices({ callInject: true, sidebar })
    const ctx = createCordisCtx(services, ['slots', 'locale', 'sessions', 'workspaces', 'layout', 'effect', 'inject'])
    assert.doesNotThrow(() => { mod.apply(ctx) })
    assert.equal(registered.length, 2)
    assert.ok(registered.some((t) => t.id === 'omnimux-workflow:canvas'))
    assert.ok(registered.some((t) => t.id === 'omnimux-workflow:library'))
    for (const dispose of effects) dispose()
  })
})
