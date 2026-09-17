import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const require = createRequire(import.meta.url)

/**
 * 端到端：技能页面不得出现任何品牌署名行。
 *
 * 用户旅程：打开会话页「Skill」标签 → 卡片网格渲染 → 卡片底部只有标题与描述，
 * 没有任何 `@MiniMax Design官方` 文本、署名节点或认证勾图标。
 */

const FIXTURE_HTML = `
<!doctype html>
<html>
  <body>
    <div id="root" data-phase="hero">
      <div id="seat"></div>
    </div>
  </body>
</html>
`

function withDom(html) {
  const dom = new JSDOM(html, { url: 'http://localhost/' })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    sessionStorage: globalThis.sessionStorage,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Event = dom.window.Event
  globalThis.MouseEvent = dom.window.MouseEvent
  globalThis.sessionStorage = dom.window.sessionStorage
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return {
    dom,
    restore() {
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.HTMLElement = previous.HTMLElement
      globalThis.Event = previous.Event
      globalThis.MouseEvent = previous.MouseEvent
      globalThis.sessionStorage = previous.sessionStorage
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
      dom.window.close()
    },
  }
}

async function loadComponent(entry) {
  const output = await build({
    entryPoints: [new URL(entry, import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react'],
    loader: { '.json': 'json' },
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, module, module.exports)
  return module.exports
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const click = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })

test('e2e: 技能页面全局无 MiniMax 署名元素，且卡片布局不塌陷', async () => {
  const { TrendingReplicateSection } = await loadComponent('../../src/client/session-guide/trending/TrendingReplicateSection.jsx')
  const env = withDom(FIXTURE_HTML)
  const host = document.querySelector('#root')
  const root = createRoot(host.querySelector('#seat'))

  try {
    await act(async () => {
      root.render(React.createElement(TrendingReplicateSection, {
        t: (key) => key,
        onApplyPrompt: () => {},
      }))
    })
    await flush()

    // 1. 切到「Skill」标签
    const tabSkills = host.querySelector('#tab-skills')
    assert.ok(tabSkills, '会话页必须渲染 Skill 标签')
    await click(tabSkills)
    await flush()

    // 2. 卡片网格渲染
    const panel = host.querySelector('.omnimux-skills-panel')
    assert.ok(panel, '切换后必须挂载技能面板')
    const cards = host.querySelectorAll('.omnimux-skill-card')
    assert.ok(cards.length > 0, `技能面板必须渲染卡片，实际 ${cards.length} 张`)

    // 3. 全页无任何 MiniMax 署名痕迹
    assert.equal(/MiniMax/i.test(host.textContent), false, '技能页面不得出现 MiniMax 字样')
    assert.equal(host.querySelectorAll('.omnimux-skill-card-attribution').length, 0, '不得渲染署名行容器')
    assert.equal(host.querySelectorAll('.omnimux-skill-card-author').length, 0, '不得渲染署名文本节点')
    assert.equal(host.querySelectorAll('.omnimux-skill-verified-icon').length, 0, '不得渲染认证勾图标')

    // 4. 卡片其余内容规范仍在（布局不塌陷）
    const firstCard = cards[0]
    assert.ok(firstCard.querySelector('.omnimux-skill-card-cover-img'), '卡片仍必须渲染真实封面')
    assert.equal(firstCard.querySelector('.omnimux-skill-card-badge')?.textContent?.trim(), 'H3', '卡片仍必须渲染 H3 角标')
    assert.ok(firstCard.querySelector('.omnimux-skill-card-title')?.textContent?.trim(), '卡片仍必须渲染标题')
    assert.ok(firstCard.querySelector('.omnimux-skill-card-summary')?.textContent?.trim(), '卡片仍必须渲染描述')
    assert.ok(firstCard.querySelector('.omnimux-skill-card-btn'), '卡片仍必须保留「使用 Skill」按钮')

    // 5. 分类切换后同样干净
    const chips = host.querySelectorAll('.omnimux-skills-chip')
    assert.ok(chips.length > 1, '必须渲染分类胶囊')
    await click(chips[1])
    await flush()
    const filtered = host.querySelectorAll('.omnimux-skill-card')
    assert.ok(filtered.length > 0, '分类过滤后仍有卡片')
    assert.equal(/MiniMax/i.test(host.textContent), false, '任一分类下都不得出现 MiniMax 字样')
  } finally {
    await act(async () => { root.unmount() })
    env.restore()
  }
})
