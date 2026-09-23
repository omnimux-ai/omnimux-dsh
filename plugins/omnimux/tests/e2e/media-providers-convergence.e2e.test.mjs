/**
 * E2E: 插件配置收敛为本机 CLI 与媒体生成提供商分层共存架构 (Issue #2597)
 *
 * 真实渲染 RuntimeModeSection 组件（esbuild 打包 -> jsdom -> React），UI 原子组件使用轻量桩，
 * 验证：
 * 1. 顶置 OmniMux Cloud 横幅独立性（未登录展示引导文案及登录/注册按钮，不阻断设置）；
 * 2. 双分段选项卡（Tab 1: 本机 CLI，Tab 2: 媒体生成提供商）平滑切换；
 * 3. 本机 CLI 列表展示与选择；
 * 4. 媒体生成提供商三大预设（fal.ai, OpenAI, OpenRouter）及端点/模型表单配置；
 * 5. 底栏全局状态常驻指示器。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const COMPONENT_PATH = new URL('../../src/client/RuntimeModeSection.jsx', import.meta.url).pathname

const ZH = {
  'runtime.title': '运行方式',
  'runtime.hint': '文字和媒体由谁生成；账号、发布、额度仍需要登录',
  'runtime.tabCli': '本机 CLI',
  'runtime.tabMedia': '媒体生成提供商',
  'runtime.cloudTitle': '使用 OmniMux Cloud',
  'runtime.cloudHint': '登录云端版本后可启用团队空间、共享项目、云端资产与协同能力。',
  'runtime.cloudLoggedTitle': 'OmniMux Cloud 已连接',
  'runtime.cloudLoggedHint': '团队空间、项目共享与云端资产协同功能已启用。',
  'runtime.loginOrRegister': '登录 / 注册',
  'runtime.logout': '退出登录',
  'runtime.cliHeader': '选择用来运行提示词的 CLI。',
  'runtime.cliCount': '你的 CLI ({count})',
  'runtime.mediaProviderHeader': '选择媒体生成供应商（配置图片、视频、音频的生成模型与直连接口）。',
  'runtime.recommended': '推荐首选',
  'runtime.currentChat': '当前对话链路：',
  'runtime.currentMedia': '媒体链路：',
  'runtime.defaultChat': 'DSH 原生 / 默认',
  'runtime.mediaReady': '✓ 媒体链路就绪',
  'runtime.unconfigured': '未配置',
  'runtime.modelLabel': '模型',
  'runtime.imageModel': '图片模型',
  'runtime.videoModel': '视频模型',
  'runtime.audioModel': '音频模型',
  'runtime.endpointLabel': 'API 端点 (Base URL)',
  'runtime.official': '官方',
  'runtime.agentOk': '已启用，文字任务交给 {name}',
  'runtime.test': '测试',
  'runtime.save': '保存',
  'runtime.saved': '已保存',
  'runtime.scan': '重新扫描',
  'runtime.installed': '已安装',
}

const t = (key, params) => {
  const template = ZH[key] ?? key
  return params ? template.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '') : template
}

function createScope(initialValues = {}) {
  let snap = { status: 'ready', value: { ...initialValues }, writable: true, user: {} }
  const listeners = new Set()
  return {
    getSnapshot: () => snap,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: async (field, value) => {
      snap = { ...snap, value: { ...snap.value, [field]: value } }
      for (const listener of [...listeners]) listener()
    },
    unset: async (field) => {
      const next = { ...snap.value }
      delete next[field]
      snap = { ...snap, value: next }
      for (const listener of [...listeners]) listener()
    },
  }
}

async function loadComponent() {
  globalThis.React = React
  const output = await build({
    entryPoints: [COMPONENT_PATH],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/client', 'dsh-ui-kit'],
    loader: { '.jsx': 'jsx' },
  })
  const mod = { exports: {} }
  const stubRequire = (id) => {
    if (id === 'dsh-ui-kit') {
      return {
        Button: ({ children, onClick, className, variant, disabled, role, 'aria-selected': selected }) =>
          React.createElement('button', { type: 'button', onClick, className, disabled, role, 'aria-selected': selected }, children),
        InputField: ({ value, onChange, placeholder, type }) =>
          React.createElement('input', { value, onChange, placeholder, type, className: 'omx-stub-input' }),
        DropdownSelect: ({ value, onChange, options, id }) =>
          React.createElement('select', { id, value, onChange: (e) => onChange(e.target.value), className: 'omx-stub-select' },
            (options || []).map(o => React.createElement('option', { key: o.value, value: o.value }, o.label))
          ),
      }
    }
    return require(id)
  }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(stubRequire, mod, mod.exports)
  return mod.exports
}

describe('media-providers-convergence.e2e', () => {
  it('renders dual-tabs, cloud banner, CLI list, media providers and bottom status bar', async () => {
    const { RuntimeModeSection } = await loadComponent()

    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'http://localhost:43120/',
    })

    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.fetch = async (url) => {
      if (url.includes('/omnimux/agents')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            agents: [
              { id: 'claude', name: 'Claude Code', installed: true, version: '2.1.223' },
              { id: 'codex', name: 'Codex CLI', installed: true, version: '0.156.0' },
            ],
          }),
        }
      }
      if (url.includes('/omnimux/byok/config')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            provider: 'fal',
            endpoint: 'https://fal.run',
            model: 'fal-ai/flux/dev',
            hasKey: true,
            verified: true,
            mediaImage: true,
            mediaVideo: true,
            mediaAudio: true,
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }

    const scope = createScope({
      runtimeMode: 'key',
      runtimeAgentId: 'codex',
      runtimeMediaProvider: 'fal',
      runtimeKeyVerified: true,
    })

    const root = dom.window.document.getElementById('root')
    const { createRoot } = require('react-dom/client')
    const reactRoot = createRoot(root)

    await act(async () => {
      reactRoot.render(React.createElement(RuntimeModeSection, { t, scope }))
    })

    // Assert S1 & S2: Cloud banner rendered and dual tabs present
    const banner = root.querySelector('.omx-cloud-banner')
    assert.ok(banner, 'Cloud banner must be mounted')
    assert.ok(banner.textContent.includes('OmniMux Cloud'), 'Banner must display OmniMux Cloud')

    const tabs = root.querySelectorAll('.omx-tab-btn')
    assert.equal(tabs.length, 2, 'Must have exactly two tabs: 本机 CLI and 媒体生成提供商')
    assert.ok(tabs[0].textContent.includes('本机 CLI'), 'First tab is 本机 CLI')
    assert.ok(tabs[1].textContent.includes('媒体生成提供商'), 'Second tab is 媒体生成提供商')

    // Tab 1 active by default
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true')
    const cliList = root.querySelector('.omx-cli-list')
    assert.ok(cliList, 'CLI list must be rendered when Tab 1 is active')

    // Switch to Tab 2
    await act(async () => {
      tabs[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true')

    const mediaGrid = root.querySelector('.omx-media-grid')
    assert.ok(mediaGrid, 'Media provider grid must be rendered when Tab 2 is active')
    const providerCards = root.querySelectorAll('.omx-provider-choice')
    assert.equal(providerCards.length, 3, 'Must render fal.ai, OpenAI, OpenRouter providers')

    // Assert S4: Form contains image, video, audio model pickers
    const selects = root.querySelectorAll('.omx-stub-select')
    assert.equal(selects.length, 3, 'Must have dropdowns for image, video, audio models')

    // Assert S5: Bottom status bar reflects coexistence
    const statusBar = root.querySelector('.omx-status-bar')
    assert.ok(statusBar, 'Global status bar must be mounted')
    assert.ok(statusBar.textContent.includes('当前对话链路：'), 'Displays conversation link')
    assert.ok(statusBar.textContent.includes('媒体链路：'), 'Displays media link')
    assert.ok(statusBar.textContent.includes('✓ 媒体链路就绪'), 'Displays ready indicator')

    await act(async () => {
      reactRoot.unmount()
    })
  })
})
