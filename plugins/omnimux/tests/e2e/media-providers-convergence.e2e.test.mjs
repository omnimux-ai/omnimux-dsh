/**
 * E2E: 插件配置双栏目解耦：分离「对话与媒体生成模型」与「创作画布模型」双独立卡片 (Issue #2605)
 *
 * 真实渲染 ModelsSettingsCard 组件（esbuild 打包 -> jsdom -> React），UI 原子组件使用轻量桩，
 * 验证：
 * 1. 结构彻底解耦：页面呈现出两个并列独立的 .omnimux-models-card 卡片；
 * 2. 栏目标题准确：第一个卡片标题严格为“对话与媒体生成模型”，第二个卡片标题严格为“创作画布模型”；
 * 3. 栏目一（对话与媒体）：承载顶置 OmniMux Cloud 横幅、双分段选项卡（本机 CLI ｜ 媒体生成提供商）与全局底栏；
 * 4. 栏目二（创作画布）：纯粹承载文本、图片、视频、音频各模态新建节点默认模型及思考等级。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const CARD_PATH = new URL('../../src/client/ModelsSettingsCard.jsx', import.meta.url).pathname

const ZH = {
  'models.title': '创作画布模型',
  'models.description': '管理创作画布右侧面板各类型节点的新建默认模型与参数规则',
  'models.composerTitle': '输入框可见模型',
  'models.composerHint': '只列出执行中枢当前上架的模型',
  'models.composerKeepOne': '至少保留一个模型',
  'models.groupText': '文本',
  'models.groupImage': '图片',
  'models.groupVideo': '视频',
  'models.groupAudio': '音频',
  'models.rowModel': '默认模型',
  'models.rowMode': '默认模式',
  'models.rowReasoning': '思考等级',
  'models.reset': '恢复默认',
  'models.loading': '加载模型列表…',
  'runtime.cardTitle': '对话与媒体生成模型',
  'runtime.cardDesc': '管理用于执行对话提示词的本地命令行助手，以及图片、视频、音频的媒体生成提供商',
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
  'runtime.cliDefaultSetting': 'CLI 默认设置',
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

async function loadCardComponent() {
  globalThis.React = React
  const output = await build({
    entryPoints: [CARD_PATH],
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
        Button: ({ children, onClick, className, variant, disabled, role, 'aria-selected': selected, 'aria-expanded': expanded }) =>
          React.createElement('button', {
            type: 'button',
            onClick,
            className,
            disabled,
            role,
            'aria-selected': selected,
            'aria-expanded': expanded != null ? String(expanded) : undefined,
          }, children),
        InputField: ({ value, onChange, placeholder, type }) =>
          React.createElement('input', { value, onChange, placeholder, type, className: 'omx-stub-input' }),
        DropdownSelect: ({ value, onChange, options, id }) =>
          React.createElement('select', { id, value, onChange: (e) => onChange(e.target.value), className: 'omx-stub-select' },
            (options || []).map(o => React.createElement('option', { key: o.value, value: o.value }, o.label))
          ),
        SelectableTile: ({ title, selected, onChange }) =>
          React.createElement('div', { onClick: () => onChange(!selected), className: 'omx-stub-tile' }, title),
      }
    }
    return require(id)
  }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(stubRequire, mod, mod.exports)
  return mod.exports
}

describe('settings-sections-split.e2e', () => {
  it('renders two separate cards: Conversation & Media Generation Models vs Creative Canvas Models', async () => {
    const { ModelsSettingsCard } = await loadCardComponent()

    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'http://localhost:43120/',
    })

    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.fetch = async (url) => {
      if (url.includes('/omnimux/model-catalog')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            text: [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }],
            image: [{ id: 'gpt-image-2.5', label: 'GPT Image 2.5' }],
            video: [{ id: 'seedance-2-5', label: 'Seedance 2.5' }],
            audio: [{ id: 'suno', label: 'Suno' }],
            defaults: {
              text: 'gemini-3.8-flash',
              image: 'gpt-image-2.5',
              video: 'seedance-2-5',
              audio: 'suno',
            },
            defaultOperations: {},
            models: [],
          }),
        }
      }
      if (url.includes('/omnimux/agents')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            agents: [
              { id: 'claude', name: 'Claude Code', installed: true, version: '2.1.223', models: ['claude-3-7-sonnet', 'claude-3-5-sonnet'] },
              { id: 'codex', name: 'Codex CLI', installed: true, version: '0.156.0', models: ['gpt-4o', 'o3-mini'] },
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
      defaultTextModel: 'gemini-3.8-flash',
      defaultImageModel: 'gpt-image-2.5',
      defaultVideoModel: 'seedance-2-5',
      defaultAudioModel: 'suno',
    })

    const root = dom.window.document.getElementById('root')
    const { createRoot } = require('react-dom/client')
    const reactRoot = createRoot(root)

    await act(async () => {
      reactRoot.render(React.createElement(ModelsSettingsCard, { t, scope }))
    })

    // Assert S1: Two separate cards rendered
    const cards = root.querySelectorAll('.omnimux-models-card')
    assert.equal(cards.length, 2, 'Must render exactly two distinct cards')

    // Assert S2: Card titles and descriptions
    const runtimeCard = cards[0]
    const canvasCard = cards[1]

    assert.equal(runtimeCard.getAttribute('data-section'), 'runtime')
    assert.ok(runtimeCard.querySelector('.omnimux-models-card__title').textContent.includes('对话与媒体生成模型'), 'Card 1 title is 对话与媒体生成模型')
    assert.ok(runtimeCard.querySelector('.omnimux-models-card__desc').textContent.includes('管理用于执行对话提示词'), 'Card 1 desc is correct')

    assert.equal(canvasCard.getAttribute('data-section'), 'canvas-models')
    assert.ok(canvasCard.querySelector('.omnimux-models-card__title').textContent.includes('创作画布模型'), 'Card 2 title is 创作画布模型')
    assert.ok(canvasCard.querySelector('.omnimux-models-card__desc').textContent.includes('管理创作画布右侧面板各类型节点'), 'Card 2 desc is correct')

    // Assert S3: Card 1 has tabs, banner, and status bar
    assert.ok(runtimeCard.querySelector('.omx-cloud-banner'), 'Card 1 contains OmniMux Cloud banner')
    assert.ok(runtimeCard.querySelector('.omx-segmented-tabs'), 'Card 1 contains dual tabs')
    assert.ok(runtimeCard.querySelector('.omx-status-bar'), 'Card 1 contains bottom status bar')

    // Tab 1: Agent CLI models dropdown assertion
    const agentModelSelect = runtimeCard.querySelector('#omx-agent-model-codex')
    assert.ok(agentModelSelect, 'Must render DropdownSelect for selected CLI agent')
    const agentModelOptions = [...agentModelSelect.querySelectorAll('option')].map((o) => ({
      value: o.getAttribute('value'),
      label: o.textContent,
    }))
    assert.equal(agentModelOptions[0].value, '', 'First option value is empty for default')
    assert.equal(agentModelOptions[0].label, 'CLI 默认设置', 'First option label is CLI 默认设置')
    assert.ok(agentModelOptions.some((o) => o.value === 'gpt-4o'), 'Contains gpt-4o option from agent models')
    assert.ok(agentModelOptions.some((o) => o.value === 'o3-mini'), 'Contains o3-mini option from agent models')
    assert.equal(agentModelOptions.some((o) => o.value.includes('claude')), false, 'Codex options must not contain claude models')

    // Switch to Tab 2 (媒体生成提供商)
    const tabs = runtimeCard.querySelectorAll('.omx-tab-btn')
    assert.equal(tabs.length, 2, 'Must have two tabs')
    await act(async () => {
      tabs[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })

    // Assert: Models mapping dropdowns are initially COLLAPSED by default
    assert.equal(runtimeCard.querySelectorAll('.omx-stub-select').length, 0, 'Models mapping should be collapsed by default')
    const trigger = runtimeCard.querySelector('.omx-collapsible-trigger')
    assert.ok(trigger, 'Collapsible trigger must be present')
    assert.equal(trigger.getAttribute('aria-expanded'), 'false')

    // Click trigger to EXPAND
    await act(async () => {
      trigger.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(trigger.getAttribute('aria-expanded'), 'true')

    // Assert: Models dropdowns are rendered in a vertical column container (上下排列，非左右并排)
    const columnContainer = runtimeCard.querySelector('.omx-caps-column')
    assert.ok(columnContainer, 'Must use .omx-caps-column for vertical stacking')
    const selects = columnContainer.querySelectorAll('.omx-stub-select')
    assert.equal(selects.length, 3, 'Must render image, video, audio selects vertically in column')

    // Assert S4: Card 2 contains canvas groups
    const groups = canvasCard.querySelectorAll('.omnimux-models-card__group')
    assert.ok(groups.length >= 4, 'Card 2 contains text, image, video, audio model groups')

    await act(async () => {
      reactRoot.unmount()
    })
  })
})
