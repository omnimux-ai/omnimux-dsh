/**
 * E2E: 设置页分组卡片与「默认模式 / 思考等级」下拉（Issue #2003）
 *
 * 真实渲染设置卡片组件（esbuild 打包 -> jsdom -> React），UI 原子组件使用轻量桩，
 * 验证分组卡片结构、选项构造、无「自动」前缀的纯模式名呈现以及思考等级档位。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const CARD = new URL('../../src/client/ModelsSettingsCard.jsx', import.meta.url).pathname;

const CATALOG = {
  text: [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }],
  image: [{ id: 'gpt-image-2.5', label: 'GPT Image 2.5' }],
  video: [
    { id: 'minimax-h3', label: 'MiniMax H3' },
    { id: 'seedance-2-5', label: 'Seedance 2.5' },
    { id: 'seedance-2-0', label: 'Seedance 2.0' },
  ],
  audio: [{ id: 'seed-audio-1.0', label: 'Seed Audio 1.0' }],
  defaults: {
    text: 'gemini-3.8-flash',
    image: 'gpt-image-2.5',
    video: 'minimax-h3',
    audio: 'seed-audio-1.0',
  },
  defaultOperations: {
    video: { modelId: 'minimax-h3', operationId: 'video_multi_ref', rule: 'auto' },
    image: { modelId: 'gpt-image-2.5', operationId: 'text_to_image', rule: 'first_operation' },
  },
  models: [
    {
      id: 'minimax-h3',
      operations: [
        { id: 'text_to_video', label: '文生视频', listed: true, output: { type: 'video' } },
        { id: 'video_multi_ref', label: '全能参考', listed: true, output: { type: 'video' } },
      ],
    },
    {
      id: 'gpt-image-2.5',
      operations: [
        { id: 'text_to_image', label: '文生图', listed: true, output: { type: 'image' } },
        { id: 'multi_reference', label: '垫图参考', listed: false, output: { type: 'image' } },
      ],
    },
  ],
};

const ZH = {
  'models.title': '创作画布默认模型',
  'models.description': '仅影响新建节点',
  'models.groupText': '文本',
  'models.groupImage': '图片',
  'models.groupVideo': '视频',
  'models.groupAudio': '音频',
  'models.rowModel': '默认模型',
  'models.rowMode': '默认模式',
  'models.rowReasoning': '思考等级',
  'models.reasoning.low': '低',
  'models.reasoning.medium': '中',
  'models.reasoning.high': '高',
  'models.reasoning.max': '最高',
  'models.loading': '加载模型列表…',
  'models.reset': '恢复默认',
};
const t = (key) => ZH[key] ?? key;

function createScope(initialValues = {}) {
  const snap = { status: 'ready', value: initialValues, writable: true, user: {} };
  return {
    getSnapshot: () => snap,
    subscribe: () => () => {},
    set: async () => {},
    unset: async () => {},
  };
}

async function loadCard() {
  globalThis.React = React;
  const output = await build({
    entryPoints: [CARD],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/client', 'dsh-ui-kit'],
    loader: { '.jsx': 'jsx' },
  });
  const mod = { exports: {} };
  const stubRequire = (id) => {
    if (id === 'dsh-ui-kit') {
      return {
        Button: ({ children, ...rest }) => React.createElement('button', rest, children),
        InputField: ({ value, ...rest }) => React.createElement('input', { value, ...rest }),
        DropdownSelect: ({ id, value, options, onChange, ...rest }) => React.createElement(
          'select',
          { id, 'data-testid': id, value, onChange: (event) => onChange(event.target.value), ...rest },
          options.map((option) => React.createElement('option', { key: option.value, value: option.value }, option.label)),
        ),
        SelectableTile: ({ title, selected, onChange }) => React.createElement('div', { onClick: () => onChange && onChange(!selected) }, title),
      };
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(stubRequire, mod, mod.exports);
  return mod.exports.ModelsSettingsCard;
}

async function renderCard(initialValues = {}) {
  const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => ({ ok: true, json: async () => CATALOG });
  const { createRoot } = await import('react-dom/client');
  const Card = await loadCard();
  const root = createRoot(document.querySelector('main'));
  await act(async () => {
    root.render(React.createElement(Card, { t, scope: createScope(initialValues) }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { document: dom.window.document, root };
}

describe('E2E: 设置页分组卡片与默认模式', () => {
  it('renders four grouped cards with concise row labels and no auto prefix in mode select', async () => {
    const { document, root } = await renderCard();

    // 1. 分组标题断言
    const groupTitles = [...document.querySelectorAll('.omnimux-models-card__group-title')].map((el) => el.textContent.trim());
    assert.deepEqual(groupTitles.slice(0, 4), ['文本', '图片', '视频', '音频']);

    // 2. 文本组思考等级行
    const textReasoning = document.querySelector('[data-testid="omnimux-defaultTextReasoning"]');
    assert.ok(textReasoning, 'text group must render defaultTextReasoning select');
    const reasoningOptions = [...textReasoning.querySelectorAll('option')].map((opt) => opt.textContent);
    assert.deepEqual(reasoningOptions, ['低', '中', '高', '最高']);
    assert.equal(textReasoning.value, 'max');

    // 3. 视频默认模式行：仅显示纯模式名，无“自动”前缀
    const videoMode = document.querySelector('[data-testid="omnimux-defaultVideoOperation"]');
    assert.ok(videoMode, 'video group must render defaultVideoOperation select');
    const videoOptions = [...videoMode.querySelectorAll('option')].map((opt) => opt.textContent);
    assert.ok(videoOptions.includes('全能参考'));
    assert.ok(videoOptions.includes('文生视频'));
    assert.equal(videoOptions.some((opt) => opt.includes('自动')), false, 'mode options must not contain auto prefix');
    assert.equal(videoMode.value, 'video_multi_ref', 'unconfigured video mode resolves to recommended multi-ref');

    // 4. 图片默认模式行：不含未上架模式
    const imageMode = document.querySelector('[data-testid="omnimux-defaultImageOperation"]');
    assert.ok(imageMode, 'image group must render defaultImageOperation select');
    const imageOptions = [...imageMode.querySelectorAll('option')].map((opt) => opt.textContent);
    assert.ok(imageOptions.includes('文生图'));
    assert.equal(imageOptions.some((opt) => opt.includes('垫图参考')), false, 'unlisted mode must not appear in picker');

    await act(() => root.unmount());
  });
});
