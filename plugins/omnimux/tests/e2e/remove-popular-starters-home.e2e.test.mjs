/**
 * E2E: 首页移除热门入门方式整块，探索模板标题对齐原字号
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createGuideStore } from '../../src/client/session-guide/state.js'
import { guideZh } from '../../src/client/session-guide/catalog.js'

async function loadSessionGuide() {
  const output = await build({
    entryPoints: [new URL('../../src/client/session-guide/SessionGuide.jsx', import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react'],
  })
  const compiled = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(
    createRequire(import.meta.url),
    compiled,
    compiled.exports,
  )
  return compiled.exports.SessionGuide
}

test('E2E: 首页不再渲染热门入门方式，探索模板与胶囊保留且标题对齐 16px/600', async () => {
  const SessionGuide = await loadSessionGuide()
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root" data-phase="hero"><div id="guide"></div><div data-composer-input="true" contenteditable="true"></div></div></body></html>',
    { url: 'http://127.0.0.1:43128/' },
  )
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const style = document.createElement('style')
  style.textContent = `
    .omnimux-explore-title { font-size: 16px; font-weight: 600; color: #f4f4f5; margin: 0; }
  `
  document.head.appendChild(style)

  const store = createGuideStore()
  const root = createRoot(document.querySelector('#guide'))
  const workbench = {
    subscribe: () => () => {},
    getSnapshot: () => ({ sessionId: 'A', state: { panelOpen: false } }),
  }

  try {
    await act(async () => {
      root.render(
        React.createElement(SessionGuide, {
          sessionId: 'A',
          useSession: (s) => s({ blank: true }),
          useConversation: (s) => s({ activeTargets: new Set() }),
          useInput: (s) => s({ draft: '', phase: 'plain' }),
          inputActions: { setDraft() {} },
          getCurrentSessionId: () => 'A',
          store,
          workbench,
          t: (key) => guideZh[key] || key,
        }),
      )
    })

    assert.equal(document.querySelectorAll('[data-popular-starter-id]').length, 0, '首页不得渲染热门入门卡片')
    assert.equal(document.querySelector('.omnimux-popular-section'), null, '首页不得渲染热门入门整块')
    assert.ok(!document.body.textContent.includes('热门入门方式'), '首页可见文案不得出现热门入门方式')

    assert.equal(document.querySelectorAll('.omnimux-pill-btn').length, 4, '顶部胶囊必须保留 4 个')
    const exploreRoot = document.querySelector('[data-omnimux-explore-section], .omnimux-explore-templates-root')
    assert.ok(exploreRoot, '探索模板专区必须保留')

    const title = document.querySelector('[data-explore-title], .omnimux-explore-title')
    assert.ok(title, '探索模板标题必须存在')
    assert.equal(title.textContent.trim(), '探索模板')
    const cs = dom.window.getComputedStyle(title)
    assert.equal(cs.fontSize, '16px', '探索模板标题字号必须对齐原热门入门级 16px')
    assert.ok(['600', 'bold'].includes(cs.fontWeight), '探索模板标题字重必须为 600')
  } finally {
    await act(async () => root.unmount())
    store.dispose()
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})
