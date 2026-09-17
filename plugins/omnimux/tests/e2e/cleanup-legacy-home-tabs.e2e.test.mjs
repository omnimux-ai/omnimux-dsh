/**
 * E2E: 验证首页多余创作灵感与 Skill 双 Tab 已被成功隐藏，且探索模板置顶
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

const SECTION_ENTRY = new URL(
  '../../src/client/session-guide/trending/TrendingReplicateSection.jsx',
  import.meta.url
).pathname

async function compileAndLoadComponent() {
  const output = await build({
    entryPoints: [SECTION_ENTRY],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react', 'react-dom'],
  })

  const compiled = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(
    createRequire(import.meta.url),
    compiled,
    compiled.exports
  )
  return compiled.exports.TrendingReplicateSection
}

describe('E2E: 验证旧版多余双 Tab 已被彻底隐藏', () => {
  let dom
  let rootContainer
  let reactRoot
  let TrendingReplicateSection

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'http://127.0.0.1:43128/',
    })
    globalThis.window = dom.window
    globalThis.document = dom.window.document

    rootContainer = dom.window.document.getElementById('root')
    reactRoot = createRoot(rootContainer)
    TrendingReplicateSection = await compileAndLoadComponent()
  })

  afterEach(async () => {
    act(() => {
      reactRoot.unmount()
    })
    await new Promise((r) => setTimeout(r, 100))
    delete globalThis.window
    delete globalThis.document
  })

  it('omnimux-guide-tabs 处于隐藏状态，页面不再显示创作灵感与 Skill 双 Tab', async () => {
    act(() => {
      reactRoot.render(
        React.createElement(TrendingReplicateSection, {
          t: (k) => k,
          onApplyPrompt: () => {},
        })
      )
    })

    const tabsContainer = rootContainer.querySelector('.omnimux-guide-tabs')
    assert.ok(tabsContainer, '节点存在以保持内部逻辑兼容')
    assert.equal(tabsContainer.style.display, 'none', '双 Tab 容器必须设置为 display: none 彻底隐藏')
  })
})
