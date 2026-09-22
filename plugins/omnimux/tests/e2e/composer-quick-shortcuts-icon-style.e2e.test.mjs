import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

/**
 * E2E：输入框下方四条快捷方式的最终形态（Issue #2572）。
 *
 * 断言来源是**真实浏览器**里量到的 DOM 与计算样式（见
 * `.agent-reports/quick-shortcuts-icon-style/browser-geometry.json` 与同名截图）：
 * 四条按钮无边框、每项 = 图标 + 文字 + 箭头、点击照旧预填提示语与链接、复刻与
 * 带货仍出现模型与参数控件。JSDOM 不做排版，因此「整行居中」的几何证据在浏览器
 * 侧，本文件只钉结构与行为不回退。
 *
 * 只在这里跑的独立夹具：假宿主输入框（`window.__omnimuxComposerActions`）
 * 与假技能库通道（`window.__omnimuxSkillLibrary`），不连任何真实服务。
 */
const output = await build({
  entryPoints: [new URL('../../src/client/composer-quick-shortcuts/ComposerQuickShortcuts.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
)
const { ComposerQuickShortcuts } = module.exports

const LABELS = {
  'quickShortcuts.clone': '复刻爆款视频',
  'quickShortcuts.breakdown': '拆解爆款视频',
  'quickShortcuts.selling': '一键创作带货视频',
  'quickShortcuts.reverse': '反推视频提示词',
  'quickShortcuts.link.video': '视频',
  'quickShortcuts.link.product': '商品',
}

/**
 * 每条快捷方式的图标名，以及它在真实 DOM 里必须渲染出的**逐节点逐属性**图形
 * （lucide 源逐字照抄；只对拍标签名抓不住「数值被改」这类事故）。
 */
const ICON_SHAPE = {
  clone: {
    icon: 'film',
    glyphs: [
      ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }],
      ['path', { d: 'M7 3v18' }],
      ['path', { d: 'M3 7.5h4' }],
      ['path', { d: 'M3 12h18' }],
      ['path', { d: 'M3 16.5h4' }],
      ['path', { d: 'M17 3v18' }],
      ['path', { d: 'M17 7.5h4' }],
      ['path', { d: 'M17 16.5h4' }],
    ],
  },
  breakdown: {
    icon: 'text-search',
    glyphs: [
      ['path', { d: 'M21 5H3' }],
      ['path', { d: 'M10 12H3' }],
      ['path', { d: 'M10 19H3' }],
      ['circle', { cx: '17', cy: '15', r: '3' }],
      ['path', { d: 'm21 19-1.9-1.9' }],
    ],
  },
  selling: {
    icon: 'workflow',
    glyphs: [
      ['rect', { width: '8', height: '8', x: '3', y: '3', rx: '2' }],
      ['path', { d: 'M7 11v4a2 2 0 0 0 2 2h4' }],
      ['rect', { width: '8', height: '8', x: '13', y: '13', rx: '2' }],
    ],
  },
  reverse: {
    icon: 'sparkles',
    glyphs: [
      ['path', {
        d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
      }],
      ['path', { d: 'M20 2v4' }],
      ['path', { d: 'M22 4h-4' }],
      ['circle', { cx: '4', cy: '20', r: '2' }],
    ],
  },
}

/** 行尾箭头（四条共用）：move-up-right 的两段路径。 */
const ARROW_SHAPE = [
  ['path', { d: 'M13 5H19V11' }],
  ['path', { d: 'M19 5L5 19' }],
]

/** 把「标签 + 属性」规范成可比字符串（属性按名排序，与书写顺序无关）。 */
function canonical(tag, attributes) {
  const pairs = Object.entries(attributes).map(([key, value]) => `${key}=${value}`).sort()
  return `${tag}|${pairs.join('|')}`
}

/** 从真实 DOM 节点读出同样的规范化字符串。 */
function readNode(node) {
  const attributes = {}
  for (const name of node.getAttributeNames()) attributes[name] = node.getAttribute(name)
  return canonical(node.tagName.toLowerCase(), attributes)
}

function expectedNodes(shape) {
  return shape.map(([tag, attributes]) => canonical(tag, attributes))
}

/**
 * 起一套 JSDOM 夹具并渲染组件，返回 DOM 与宿主侧的读写句柄。
 */
async function mount() {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="host"></div></body></html>', {
    url: 'http://localhost/',
  })
  global.window = dom.window
  global.document = dom.window.document
  global.CustomEvent = dom.window.CustomEvent
  global.IS_REACT_ACT_ENVIRONMENT = true
  global.fetch = async () => ({ ok: false, json: async () => ({}) })

  let draft = ''
  const writes = []
  dom.window.__omnimuxComposerActions = {
    setDraft: (text) => { draft = String(text ?? ''); writes.push(draft); return true },
    getDraft: () => draft,
  }
  dom.window.__omnimuxSkillLibrary = { resolvePresetSkill: (slug) => ({ slug, title: slug }) }

  const container = document.getElementById('host')
  const root = createRoot(container)
  const session = { id: 'e2e-session', blank: true }
  await act(async () => {
    root.render(React.createElement(ComposerQuickShortcuts, {
      t: (key, fallback) => LABELS[key] || fallback || key,
      sessionId: 'e2e-session',
      session,
      useSession: (selector) => selector(session),
      useConversation: (selector) => selector({ activeTargets: new Set() }),
    }))
  })

  const click = async (id) => {
    const button = document.querySelector(`[data-omx-quick-shortcut="${id}"]`)
    assert.ok(button, `找不到快捷方式 ${id}`)
    await act(async () => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })
  }

  return { dom, root, click, writes, getDraft: () => draft }
}

describe('E2E: 四条快捷方式的无边框「图标 + 文字 + 箭头」', () => {
  it('四条都在，每项固定是图标 + 文字 + 箭头，且没有按钮框', async () => {
    const env = await mount()
    try {
      const buttons = [...document.querySelectorAll('.omx-quick-shortcut-btn')]
      assert.equal(buttons.length, 4, '必须渲染四条快捷方式')

      for (const button of buttons) {
        const id = button.dataset.omxQuickShortcut
        const icon = button.querySelector('.omx-quick-shortcut-icon')
        const label = button.querySelector('.omx-quick-shortcut-label')
        const arrow = button.querySelector('.omx-quick-shortcut-arrow')

        assert.ok(icon, `${id} 必须有图标`)
        assert.ok(label, `${id} 必须有文字`)
        assert.ok(arrow, `${id} 必须行尾有箭头`)
        assert.equal(button.querySelectorAll('svg').length, 2, `${id} 只应有图标与箭头两枚 svg`)
        assert.equal(label.textContent, LABELS[`quickShortcuts.${id}`], `${id} 文案必须取字典`)
        assert.equal(button.getAttribute('aria-pressed'), 'false', `${id} 默认未选中`)

        assert.equal(icon.getAttribute('width'), '14', `${id} 图标必须是 14px`)
        assert.equal(icon.getAttribute('height'), '14', `${id} 图标必须是 14px`)
        assert.equal(arrow.getAttribute('width'), '12', `${id} 箭头必须是 12px`)
        assert.equal(arrow.getAttribute('height'), '12', `${id} 箭头必须是 12px`)
        assert.equal(icon.getAttribute('viewBox'), '0 0 24 24', `${id} 图标 viewBox 必须逐字保留`)

        // 图标由条目决定：数据属性与查表名一致，图形逐节点逐属性对拍（改一个数值就红）
        const expected = ICON_SHAPE[id]
        assert.equal(button.dataset.omxQuickShortcutIcon, expected.icon, `${id} 的图标名必须来自 catalog`)
        assert.deepEqual(
          [...icon.children].map(readNode),
          expectedNodes(expected.glyphs),
          `${id} 的 lucide 图形必须逐节点逐属性一致，不得增删或改写`,
        )
        assert.deepEqual(
          [...arrow.children].map(readNode),
          expectedNodes(ARROW_SHAPE),
          `${id} 的箭头必须是 move-up-right 的两段原样路径`,
        )
      }
    } finally {
      await act(async () => env.root.unmount())
    }
  })

  it('样式表里没有胶囊边框，整行居中，箭头有透明态与实心态', async () => {
    const env = await mount()
    try {
      const css = document.getElementById('omnimux-quick-shortcuts-style').textContent
      assert.match(css, /\.omx-quick-shortcuts \{[\s\S]*?justify-content: center;/, '整行必须居中')
      assert.match(css, /\.omx-quick-shortcut-btn \{[\s\S]*?border: 0;[\s\S]*?background: transparent;/, '按钮不得有边框与底色')
      assert.match(css, /\.omx-quick-shortcut-btn \{[\s\S]*?border-radius: 0;/, '按钮不得有圆角底')
      assert.match(css, /\.omx-quick-shortcut-arrow \{[\s\S]*?opacity: 0\.5;/, '箭头默认半透明')
      assert.match(css, /\.omx-quick-shortcut-btn:hover \.omx-quick-shortcut-arrow[\s\S]*?opacity: 1;/, '悬停箭头变实')
      assert.match(css, /\[data-phase='hero'\] \.omx-quick-shortcuts \{[\s\S]*?order: 3;/, '整行必须排在输入框之后（输入框那块 order: 2）')
    } finally {
      await act(async () => env.root.unmount())
    }
  })

  it('点复刻：预填提示语与链接、选中态生效、模型与参数出现', async () => {
    const env = await mount()
    try {
      await env.click('clone')
      assert.equal(env.getDraft(), '请用我的产品复刻这个爆款视频\n\n[视频] [商品]', '必须预填提示语与两个链接令牌')

      const clone = document.querySelector('[data-omx-quick-shortcut="clone"]')
      assert.equal(clone.getAttribute('aria-pressed'), 'true', '选中态必须可被读屏')
      assert.ok(clone.classList.contains('is-active'), '选中态必须有类名')
      assert.ok(document.querySelector('.omx-quick-shortcut-controls'), '复刻必须出现模型与参数控件')

      // 再点同一条 = 撤回：草稿剥掉本快捷方式写入的内容，技能与控件同步撤下
      await env.click('clone')
      assert.equal(clone.getAttribute('aria-pressed'), 'false', '再点同一条必须撤回')
      assert.equal(document.querySelector('.omx-quick-shortcut-controls'), null, '撤回后控件必须消失')
      assert.equal(env.writes[env.writes.length - 1], '', '撤回必须剥掉本快捷方式写入的提示语与令牌')
    } finally {
      await act(async () => env.root.unmount())
    }
  })

  it('切到拆解：提示语与链接整组替换，且不出现模型与参数', async () => {
    const env = await mount()
    try {
      await env.click('clone')
      await env.click('breakdown')
      assert.equal(env.getDraft(), '请帮我分析拆解这个视频。\n\n[视频]', '切换必须整组替换提示语与链接')
      assert.equal(document.querySelectorAll('.omx-quick-shortcut-btn.is-active').length, 1, '任何时候只允许一条选中')
      assert.equal(document.querySelector('[data-omx-quick-shortcut="breakdown"]').getAttribute('aria-pressed'), 'true')
      assert.equal(document.querySelector('.omx-quick-shortcut-controls'), null, '拆解不得出现模型与参数')
    } finally {
      await act(async () => env.root.unmount())
    }
  })
})
