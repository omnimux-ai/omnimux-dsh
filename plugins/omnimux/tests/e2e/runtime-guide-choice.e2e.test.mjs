/**
 * E2E: 首次运行引导三选一（Issue #2557）
 *
 * 真实渲染引导组件（esbuild 打包 -> jsdom -> React），UI 原子组件使用轻量桩，
 * 验证：未选过运行方式时引导出现；选「自己的密钥」出表单；测试通过后写入
 * 运行方式并关闭引导；已有选择的安装永远不再出现。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const GUIDE = new URL('../../src/client/RuntimeGuideGate.jsx', import.meta.url).pathname;

const ZH = {
  'runtime.title': '运行方式',
  'runtime.hint': '文字和媒体由谁生成；账号、发布、额度仍需要登录',
  'runtime.official': '官方',
  'runtime.officialCta': '登录 OmniMux',
  'runtime.or': '或',
  'runtime.officialHint': '登录后使用官方默认模型',
  'runtime.agent': '本机助手',
  'runtime.agentHint': '使用已安装的 Claude、Codex、Kimi、Qwen',
  'runtime.key': '自己的密钥',
  'runtime.keyCta': '使用自己的密钥',
  'runtime.keyHint': '使用自己的接口地址和密钥',
  'runtime.endpoint': '接口地址',
  'runtime.endpointPlaceholder': 'https://',
  'runtime.keyField': '密钥',
  'runtime.keyPlaceholder': '粘贴密钥，只保存在本机',
  'runtime.keyStored': '已保存，重新填写可替换',
  'runtime.model': '模型',
  'runtime.modelPlaceholder': '模型名',
  'runtime.mediaTitle': '媒体',
  'runtime.mediaImage': '图片',
  'runtime.mediaVideo': '视频',
  'runtime.mediaAudio': '音频',
  'runtime.test': '测试',
  'runtime.testing': '测试中…',
  'runtime.testOk': '测试通过，下一次生成走这里',
  'runtime.testFail': '测试未通过（{status}）',
  'runtime.save': '保存',
  'runtime.saved': '已保存',
  'runtime.clear': '清除配置',
  'runtime.back': '上一步',
};
const t = (key, params) => {
  const template = ZH[key] ?? key;
  return params ? template.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '') : template;
};

function createScope(initialValues = {}) {
  let snap = { status: 'ready', value: { ...initialValues }, writable: true, user: {} };
  const listeners = new Set();
  return {
    getSnapshot: () => snap,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set: async (field, value) => {
      // A fresh snapshot object every change: useSyncExternalStore compares
      // identity, a mutated-in-place snapshot silently breaks the update.
      snap = { ...snap, value: { ...snap.value, [field]: value } };
      for (const listener of [...listeners]) listener();
    },
    unset: async (field) => {
      const next = { ...snap.value };
      delete next[field];
      snap = { ...snap, value: next };
      for (const listener of [...listeners]) listener();
    },
  };
}

const calls = [];
function installFetchStub() {
  calls.length = 0;
  globalThis.fetch = async (path, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : {};
    calls.push({ path, method: init.method || 'GET', body });
    if (path === '/omnimux/byok/config' && (init.method === 'PUT')) {
      return { ok: true, json: async () => ({ endpoint: body.endpoint, model: body.model, verified: false, hasKey: true }) };
    }
    if (path === '/omnimux/byok/config') {
      return { ok: true, json: async () => ({ endpoint: '', model: '', verified: false, hasKey: false }) };
    }
    if (path === '/omnimux/byok/test') {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (path === '/omnimux/runtime/mode') {
      return { ok: true, json: async () => ({ ok: true, mode: body.mode }) };
    }
    if (path === '/omnimux/agents') {
      return { ok: true, json: async () => ({ agents: [] }) };
    }
    return { ok: true, json: async () => ({}) };
  };
}

async function loadGuide() {
  globalThis.React = React;
  const output = await build({
    entryPoints: [GUIDE],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'dsh-ui-kit'],
    loader: { '.jsx': 'jsx' },
  });
  const mod = { exports: {} };
  const tile = ({ id, title, description, selected, disabled, onChange }) => React.createElement(
    'div',
    {
      id,
      role: 'radio',
      'aria-checked': selected ? 'true' : 'false',
      'aria-disabled': disabled ? 'true' : undefined,
      onClick: disabled ? undefined : onChange,
    },
    React.createElement('span', null, title),
    description ? React.createElement('small', null, description) : null,
  );
  const stubRequire = (id) => {
    if (id === 'dsh-ui-kit') {
      return {
        Button: ({ children, ...rest }) => React.createElement('button', rest, children),
        InputField: ({ value, placeholder, disabled, onChange, type }) => React.createElement('input', {
          type: type || 'text',
          value,
          placeholder,
          disabled,
          onChange,
        }),
        SelectableTile: tile,
      };
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(stubRequire, mod, mod.exports);
  return mod.exports.RuntimeGuideGate;
}

async function renderGuide(initialValues = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  installFetchStub();
  const { createRoot } = await import('react-dom/client');
  const Guide = await loadGuide();
  const container = document.createElement('main');
  document.body.appendChild(container);
  const root = createRoot(container);
  const scope = createScope(initialValues);
  await act(async () => {
    root.render(React.createElement(Guide, { t, scope }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { document: dom.window.document, root, scope };
}

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

describe('首次运行引导（Issue #2557）', () => {
  it('未选过运行方式时出现三选一', async () => {
    const { document, root } = await renderGuide({});
    const guide = document.querySelector('[data-omnimux-runtime-guide]');
    assert.ok(guide, 'guide must render on a fresh install');
    const text = guide.textContent;
    assert.ok(text.includes('登录 OmniMux'), 'the official path leads with the sign-in action');
    assert.ok(text.includes('本机助手'));
    assert.ok(text.includes('使用自己的密钥'));
    await act(async () => { root.unmount(); });
  });

  it('已有选择的安装永远不再出现', async () => {
    for (const mode of ['official', 'agent', 'key']) {
      const { document, root } = await renderGuide({ runtimeMode: mode });
      assert.equal(document.querySelector('[data-omnimux-runtime-guide]'), null, `${mode} must hide the guide`);
      await act(async () => { root.unmount(); });
    }
  });

  it('选「自己的密钥」出表单，测试通过后写入运行方式并关闭', async () => {
    const { document, root, scope } = await renderGuide({});
    const buttons = [...document.querySelectorAll('[data-omnimux-runtime-guide] button')];
    const keyButton = buttons.find((el) => el.textContent.trim() === '使用自己的密钥');
    assert.ok(keyButton, 'BYOK entry must exist');
    await act(async () => { keyButton.click(); });

    const endpoint = document.querySelector('input[placeholder="https://"]');
    const apiKey = document.querySelector('input[type="password"]');
    const model = document.querySelector('input[placeholder="模型名"]');
    assert.ok(endpoint && apiKey && model, 'endpoint / key / model fields must render');
    await act(async () => {
      setInputValue(endpoint, 'http://127.0.0.1:9/v1');
      setInputValue(apiKey, 'sk-stub');
      setInputValue(model, 'stub-model');
    });

    const clickByText = (label) => {
      const target = [...document.querySelectorAll('[data-omnimux-runtime-guide] button')]
        .find((el) => el.textContent.trim() === label);
      assert.ok(target, `button ${label} must exist`);
      return target;
    };
    await act(async () => { clickByText('保存').click(); });
    await act(async () => { clickByText('测试').click(); });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const putConfig = calls.find((call) => call.path === '/omnimux/byok/config' && call.method === 'PUT');
    assert.ok(putConfig, 'config must be saved through the host face');
    assert.equal(putConfig.body.endpoint, 'http://127.0.0.1:9/v1');
    assert.equal(putConfig.body.model, 'stub-model');
    assert.ok(!document.body.textContent.includes('sk-stub'), 'the key must never echo into the page');

    const testCall = calls.find((call) => call.path === '/omnimux/byok/test');
    assert.ok(testCall, 'the test must hit the host face');

    const modeCall = calls.find((call) => call.path === '/omnimux/runtime/mode' && call.method === 'PUT');
    assert.ok(modeCall, 'passing the test must write the runtime choice');
    assert.equal(modeCall.body.mode, 'key');

    // The guide's core promise: once a mode is stored, it never shows again.
    await scope.set('runtimeMode', 'key');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(document.querySelector('[data-omnimux-runtime-guide]'), null, 'guide must close after the choice is written');
    await act(async () => { root.unmount(); });
  });
});
