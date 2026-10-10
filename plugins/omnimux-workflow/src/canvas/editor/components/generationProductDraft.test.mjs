import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const pluginRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const { build } = require('esbuild');
const bundle = await build({
  absWorkingDir: pluginRoot,
  stdin: { contents: `export { default as HeaderControls } from './src/canvas/editor/components/HeaderControls';
    export { ReactFlowProvider } from '@xyflow/react';
    export { createElement, act } from 'react';
    export { createRoot } from 'react-dom/client';
    export { useCanvasStore } from './src/canvas/store/canvasStore';`, resolveDir: pluginRoot, loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'draftTest', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  nodePaths: [pluginRoot + '/node_modules'],
  loader: { '.css': 'text' },
});

function setup(options = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  win.IS_REACT_ACT_ENVIRONMENT = true;
  win.MessageChannel = class {
    port1 = { onmessage: null };
    port2 = { postMessage: () => queueMicrotask(() => this.port1.onmessage?.()) };
  };
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  win.eval(bundle.outputFiles[0].text);
  const api = win.draftTest;
  const calls = [];
  const catalog = { schemaVersion: 1, currentFingerprint: 'a'.repeat(64), products: [
    { productId: 'generation.image', label: '生图', status: 'pending', intents: [{ intent: 'multi_reference', label: '垫图参考', status: 'pending', alternatives: [] }] },
    { productId: 'generation.video', label: '生视频', status: 'pending', intents: [{ intent: 'first_last_frame', label: '首尾帧', status: 'pending', alternatives: [] }] },
  ] };
  if (options.alternatives) catalog.products[0].intents[0].alternatives = envJson(options.alternatives);
  function envJson(value) { return win.JSON.parse(JSON.stringify(value)); }
  const fixtureFetch = async (url, fetchOptions = {}) => {
    calls.push({ url, method: fetchOptions.method ?? 'GET', body: fetchOptions.body === undefined ? undefined : JSON.parse(fetchOptions.body) });
    if (options.respond) return options.respond(url, fetchOptions, catalog, calls);
    if (url === '/omnimux/generation-products') return { ok: true, status: 200, json: async () => catalog };
    assert.equal(url, '/omnimux/generation-products/preview');
    return { ok: true, status: 200, json: async () => ({ schemaVersion: 1, currentFingerprint: catalog.currentFingerprint, status: 'ready', executable: false, issues: [] }) };
  };
  win.fetch = async (...args) => {
    const response = await fixtureFetch(...args);
    return { ...response, json: async () => envJson(await response.json()) };
  };
  return { dom, win, api, calls, catalog };
}

const tick = env => env.api.act(async () => { await new Promise(resolve => env.win.setTimeout(resolve, 0)); });
const buttonByText = (env, text) => [...env.win.document.querySelectorAll('button[role="option"]')].find(item => item.textContent === text)
  ?? [...env.win.document.querySelectorAll('button')].find(item => item.textContent === text);
async function click(env, text) {
  const button = buttonByText(env, text); assert.ok(button, `missing button: ${text}`);
  await env.api.act(async () => button.click()); await tick(env);
}
async function choose(env, placeholder, label) { await click(env, placeholder); await click(env, label); }
async function mount(env) {
  env.root = env.api.createRoot(env.win.document.getElementById('root'));
  await env.api.act(async () => env.root.render(env.api.createElement(env.api.ReactFlowProvider, null,
    env.api.createElement(env.api.HeaderControls, { isMinimapOpen: false, onToggleMinimap() {} }))));
  await click(env, '检查生成输入');
}
async function cleanup(env) { await env.api.act(async () => env.root.unmount()); env.win.close(); }
async function change(env, selector, value) {
  const input = env.win.document.querySelector(selector); assert.ok(input, selector);
  await env.api.act(async () => {
    Object.getOwnPropertyDescriptor(input instanceof env.win.HTMLTextAreaElement ? env.win.HTMLTextAreaElement.prototype : env.win.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new env.win.Event('input', { bubbles: true }));
  });
  await tick(env);
}

// These HTTP fixtures are synthetic directory data, never live generation proof.
test('#3274 existing creation-page controls reach the authoritative product directory without executing', async () => {
  const env = setup();
  const { api, win } = env;
  const root = api.createRoot(win.document.getElementById('root'));
  try {
    await api.act(async () => root.render(api.createElement(api.ReactFlowProvider, null,
      api.createElement(api.HeaderControls, { isMinimapOpen: false, onToggleMinimap() {} }))));
    const button = [...win.document.querySelectorAll('button')].find(item => item.textContent === '检查生成输入');
    assert.ok(button, 'the existing creation-page controls must expose the explicit input-check entry');
    await api.act(async () => { button.click(); await new Promise(resolve => win.setTimeout(resolve, 0)); });
    await api.act(async () => { await new Promise(resolve => win.setTimeout(resolve, 0)); });
    assert.equal(env.calls.length, 1);
    assert.deepEqual(env.calls[0], { url: '/omnimux/generation-products', method: 'GET', body: undefined });
    assert.match(win.document.body.textContent, /生图/);
    assert.match(win.document.body.textContent, /生视频/);
    assert.equal(env.calls.filter(call => call.method === 'POST').length, 0);
  } finally {
    await api.act(async () => root.unmount());
    win.close();
  }
});

test('#3274 explicitly selected array items preserve order, repetitions, identities and raw metadata', async () => {
  const env = setup();
  const assets = [
    { type: 'image', pathOrUrl: '/raw/A', mimeType: 'IMAGE/unknown', role: 'first_frame', targetSlot: 'first', sizeBytes: 0, durationSec: null, sourceNodeId: 'roles', outputId: 'out-A', outputVersion: 'v-A', originalName: ' A ', dimensions: { width: 33, height: 22 } },
    { type: 'alien', pathOrUrl: '/raw/B', mime: 'custom/opaque', sizeBytes: null, durationSec: 0, outputId: 'out-B', outputVersion: 'v-B' },
  ];
  env.api.useCanvasStore.setState({ nodes: env.win.JSON.parse(JSON.stringify([{ id: 'roles', type: 'image', position: { x: 0, y: 0 }, data: { mediaAssets: assets, params: { operation: 'edit', prompt: 'do not inherit' }, taskRef: { taskId: 'legacy' } } }])), edges: [] });
  const original = JSON.stringify(env.api.useCanvasStore.getState().nodes);
  try {
    await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考');
    await click(env, '添加 roles [0]'); await click(env, '添加 roles [1]'); await click(env, '添加 roles [0]');
    await click(env, '检查输入');
    const expectedA = { ...assets[0], mime: 'IMAGE/unknown' }; delete expectedA.mimeType;
    assert.deepEqual(env.calls.at(-1).body.assets, [expectedA, { ...assets[1], sourceNodeId: 'roles' }, expectedA]);
    assert.equal(JSON.stringify(env.api.useCanvasStore.getState().nodes), original);
    assert.equal(Object.hasOwn(env.calls.at(-1).body, 'prompt'), false);
    assert.equal(env.calls.length, 2);
  } finally { await cleanup(env); }
});

test('#3274 branches remain separate and explicit primitive values are transported without defaults or clamp', async () => {
  const alternatives = [
    { status: 'pending', inputs: [{ slot: 'first', role: 'first_frame' }], inputGroups: [], parameters: { seed: { range: [3, 6] }, sound: { options: [true] }, resolution: { options: ['720p'] }, note: { type: 'string' }, omitted: { defaultValue: 8 } }, output: { type: 'image' }, constraints: { parameters: { seed: { fixed: 4 } } } },
    { status: 'available', inputs: [{ slot: 'last', role: 'last_frame' }], inputGroups: [{ slots: ['last'], min: 1 }], parameters: { seed: { range: [20, 30] }, resolution: { options: ['1080p'] } }, output: { type: 'image' }, constraints: { parameters: { resolution: { only: ['1080p'] } } } },
  ];
  const env = setup({ alternatives });
  try {
    await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考');
    const branches = [...env.win.document.querySelectorAll('[data-generation-branch] pre')].map(item => JSON.parse(item.textContent));
    assert.deepEqual(branches, alternatives);
    for (const [key, type, value] of [['seed', '数值', '0'], ['sound', '开关', 'false'], ['resolution', '空值'], ['note', '文字', '']]) {
      const row = env.win.document.querySelector(`[data-parameter="${key}"]`); assert.ok(row, key);
      await env.api.act(async () => row.querySelector('button').click()); await click(env, type);
      if (value !== undefined) await change(env, `[data-parameter="${key}"] input`, value);
    }
    await click(env, '检查输入');
    assert.deepEqual(env.calls.at(-1).body.parameters, { seed: 0, sound: false, resolution: null, note: '' });
    assert.equal(Object.hasOwn(env.calls.at(-1).body.parameters, 'omitted'), false);
    await change(env, '[data-parameter="seed"] input', '4x'); await click(env, '检查输入');
    assert.equal(env.calls.length, 2); assert.match(env.win.document.body.textContent, /参数待填写/);
  } finally { await cleanup(env); }
});

test('#3274 source changes and disconnected selected edges invalidate results and require reconfirmation', async () => {
  const env = setup();
  const node = env.win.JSON.parse(JSON.stringify({ id: 'role', data: { mediaAssets: [{ type: 'image', pathOrUrl: '/role', outputVersion: 'v1' }] } }));
  env.api.useCanvasStore.setState({ nodes: [node], edges: env.win.JSON.parse(JSON.stringify([{ id: 'e', source: 'role', target: 'target', targetHandle: 'input' }])) });
  try {
    await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考'); await click(env, '添加 role [0] / e');
    await click(env, '检查输入'); assert.match(env.win.document.body.textContent, /输入预检通过/);
    node.data.mediaAssets[0].outputVersion = 'v2';
    await env.api.act(async () => env.api.useCanvasStore.setState({ nodes: [node] }));
    assert.doesNotMatch(env.win.document.body.textContent, /输入预检通过/);
    assert.match(env.win.document.body.textContent, /来源已变化/);
    await click(env, '检查输入'); assert.equal(env.calls.length, 2);
    await click(env, '重新确认'); await click(env, '检查输入'); assert.equal(env.calls.at(-1).body.assets[0].outputVersion, 'v2');
    await env.api.act(async () => env.api.useCanvasStore.setState({ edges: [] }));
    assert.doesNotMatch(env.win.document.body.textContent, /输入预检通过/);
    await click(env, '检查输入'); assert.equal(env.calls.length, 3);
    assert.equal(env.win.document.querySelectorAll('[data-selected-asset]').length, 1);
  } finally { await cleanup(env); }
});

test('#3274 address and MIME ambiguity require explicit choices; mismatched source identity is never rewritten', async () => {
  const env = setup();
  env.api.useCanvasStore.setState({ nodes: env.win.JSON.parse(JSON.stringify([{ id: 'real', data: { mediaAssets: [{ type: 'image', pathOrUrl: '/first', url: '/second', mime: 'raw/a', mimeType: 'raw/b', sourceNodeId: 'other', outputId: 'output', outputVersion: 'version' }] } }])), edges: [] });
  try {
    await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考'); await click(env, '添加 real [0]');
    await click(env, '检查输入'); assert.equal(env.calls.length, 1);
    assert.match(env.win.document.body.textContent, /地址待确认/); assert.match(env.win.document.body.textContent, /格式声明冲突/);
    await choose(env, '地址', 'url: /second'); await choose(env, '格式声明', 'mimeType: raw/b');
    await click(env, '检查输入'); assert.equal(env.calls.length, 1);
    await click(env, '确认原来源身份'); await click(env, '检查输入');
    assert.deepEqual(env.calls.at(-1).body.assets, [{ type: 'image', pathOrUrl: '/second', mime: 'raw/b', sourceNodeId: 'other', outputId: 'output', outputVersion: 'version' }]);
  } finally { await cleanup(env); }
});

test('#3274 unsafe original descriptors and non-JSON values retain rows without invoking getters or posting', async () => {
  for (const kind of ['getter', 'symbol', 'hidden', 'prototype', 'sparse', 'extra', 'undefined', 'infinite', 'cycle', 'nestedGetter', 'toJSON']) {
    const env = setup(); let reads = 0;
    const raw = env.win.JSON.parse('{"type":"image","pathOrUrl":"/raw"}');
    let mediaAssets = env.win.Array.of(raw);
    if (kind === 'getter') env.win.Object.defineProperty(raw, 'mime', { enumerable: true, get() { reads++; return 'image/png'; } });
    if (kind === 'symbol') raw[env.win.Symbol('hidden')] = true;
    if (kind === 'hidden') env.win.Object.defineProperty(raw, 'mime', { value: 'image/png', enumerable: false });
    if (kind === 'prototype') env.win.Object.setPrototypeOf(raw, env.win.Object.create(null));
    if (kind === 'sparse') mediaAssets = new env.win.Array(2);
    if (kind === 'extra') mediaAssets.extra = true;
    if (kind === 'undefined') raw.mime = undefined;
    if (kind === 'infinite') raw.durationSec = Infinity;
    if (kind === 'cycle') { raw.dimensions = env.win.Object.create(null); raw.dimensions.self = raw.dimensions; }
    if (kind === 'nestedGetter') { raw.dimensions = env.win.Object.create(null); env.win.Object.defineProperty(raw.dimensions, 'width', { enumerable: true, get() { reads++; return 1; } }); }
    if (kind === 'toJSON') raw.toJSON = () => { reads++; return {}; };
    const node = env.win.JSON.parse('{"id":"unsafe","data":{}}'); node.data.mediaAssets = mediaAssets;
    env.api.useCanvasStore.setState({ nodes: env.win.Array.of(node), edges: [] });
    try {
      await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考'); await click(env, '添加 unsafe [0]');
      await click(env, '检查输入');
      assert.equal(env.calls.length, 1, kind); assert.equal(reads, 0, kind);
      assert.equal(env.win.document.querySelectorAll('[data-selected-asset]').length, 1, kind);
      assert.equal(env.api.useCanvasStore.getState().nodes[0], node, kind);
      assert.match(env.win.document.body.textContent, /无法安全运输/, kind);
    } finally { await cleanup(env); }
  }
});

test('#3274 repeated media gets explicit roles from one chosen branch only, and reorder/remove never edits the graph', async () => {
  const env = setup({ alternatives: [{ status: 'pending', inputs: [{ slot: 'first', role: 'first_frame' }, { slot: 'last', role: 'last_frame' }], inputGroups: [], parameters: {}, output: { type: 'image' }, constraints: {} }] });
  env.api.useCanvasStore.setState({ nodes: env.win.JSON.parse(JSON.stringify([{ id: 'role', data: { mediaAssets: [{ type: 'image', pathOrUrl: '/same' }] } }])), edges: [] });
  const original = JSON.stringify(env.api.useCanvasStore.getState().nodes);
  try {
    await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考'); await click(env, '添加 role [0]'); await click(env, '添加 role [0]');
    for (const [index, role, slot] of [[0, 'first_frame', 'first'], [1, 'last_frame', 'last']]) {
      const row = env.win.document.querySelector(`[data-selected-asset="${index}"]`);
      const branch = [...row.querySelectorAll('button')].find(b => b.textContent === '角色方案'); assert.ok(branch, 'explicit role branch selector');
      await env.api.act(async () => branch.click()); await click(env, '方案 1');
      await env.api.act(async () => [...row.querySelectorAll('button')].find(b => b.textContent === '角色').click()); await click(env, role);
      await env.api.act(async () => [...row.querySelectorAll('button')].find(b => b.textContent === '位置').click()); await click(env, slot);
    }
    await click(env, '检查输入');
    assert.deepEqual(env.calls.at(-1).body.assets.map(item => [item.role, item.targetSlot]), [['first_frame', 'first'], ['last_frame', 'last']]);
    await env.api.act(async () => env.win.document.querySelector('[data-selected-asset="1"] button[aria-label="上移"]').click());
    assert.doesNotMatch(env.win.document.body.textContent, /输入预检通过/);
    await click(env, '检查输入'); assert.equal(env.calls.at(-1).body.assets[0].role, 'last_frame');
    await env.api.act(async () => env.win.document.querySelector('[data-selected-asset="0"] button[aria-label="移除"]').click());
    await click(env, '检查输入'); assert.equal(env.calls.at(-1).body.assets.length, 1);
    assert.equal(JSON.stringify(env.api.useCanvasStore.getState().nodes), original);
  } finally { await cleanup(env); }
});

test('#3274 stale 409 refreshes only GET then requires a second explicit complete POST', async () => {
  let posts = 0;
  const env = setup({ respond(url, options, catalog) {
    if (url === '/omnimux/generation-products') return { ok: true, status: 200, json: async () => catalog };
    posts++;
    if (posts === 1) { catalog.currentFingerprint = 'b'.repeat(64); return { ok: false, status: 409, json: async () => ({ error: 'stale_fingerprint' }) }; }
    return { ok: true, status: 200, json: async () => ({ schemaVersion: 1, currentFingerprint: catalog.currentFingerprint, status: 'pending', executable: false, issues: [{ code: 'qualification_pending' }] }) };
  } });
  try {
    await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考');
    await change(env, 'textarea', ' unchanged '); await click(env, '检查输入'); await tick(env);
    assert.deepEqual(env.calls.map(call => call.method), ['GET', 'POST', 'GET']);
    assert.match(env.win.document.body.textContent, /生成条件已更新/);
    await click(env, '检查输入');
    assert.equal(posts, 2); assert.equal(env.calls.at(-1).body.currentFingerprint, 'b'.repeat(64));
    assert.deepEqual({ ...env.calls.at(-1).body, currentFingerprint: 'a'.repeat(64) }, env.calls[1].body);
    assert.match(env.win.document.body.textContent, /生成资格待验证/);
  } finally { await cleanup(env); }
});

test('#3274 late success cannot revive edited or closed drafts; reopen reads a fresh directory', async () => {
  const pending = [];
  const env = setup({ respond(url, options, catalog) {
    if (url === '/omnimux/generation-products') return { ok: true, status: 200, json: async () => catalog };
    return new Promise(resolve => pending.push({ resolve, signal: options.signal }));
  } });
  try {
    await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考');
    await click(env, '检查输入'); await change(env, 'textarea', 'new'); await click(env, '检查输入');
    await env.api.act(async () => pending[0].resolve({ ok: true, status: 200, json: async () => ({ schemaVersion: 1, currentFingerprint: 'a'.repeat(64), status: 'ready', executable: false, issues: [] }) }));
    assert.doesNotMatch(env.win.document.body.textContent, /输入预检通过/);
    await click(env, '丢弃草稿'); assert.equal(pending[1].signal.aborted, true);
    await env.api.act(async () => pending[1].resolve({ ok: true, status: 200, json: async () => ({ schemaVersion: 1, currentFingerprint: 'a'.repeat(64), status: 'ready', executable: false, issues: [] }) }));
    assert.doesNotMatch(env.win.document.body.textContent, /输入预检通过/);
    env.catalog.currentFingerprint = 'c'.repeat(64); await click(env, '检查生成输入');
    assert.equal(env.calls.filter(call => call.method === 'GET').length, 2);
    assert.equal(env.win.document.querySelector('textarea').value, '');
    assert.equal(buttonByText(env, '检查输入').disabled, true);
  } finally { await cleanup(env); }
});

test('#3274 malformed directories and previews show unavailability without fallback or generation promises', async () => {
  for (const kind of ['badCatalog', 'badPreview']) {
    const env = setup({ respond(url, options, catalog) {
      if (url === '/omnimux/generation-products') return { ok: true, status: 200, json: async () => kind === 'badCatalog' ? { ...catalog, products: [catalog.products[0], catalog.products[0]] } : catalog };
      return { ok: true, status: 200, json: async () => ({ schemaVersion: 1, currentFingerprint: 'a'.repeat(64), status: 'ready', executable: true, issues: [] }) };
    } });
    try {
      await mount(env);
      if (kind === 'badPreview') { await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考'); await click(env, '检查输入'); }
      assert.match(env.win.document.body.textContent, /生成条件暂不可用/);
      assert.doesNotMatch(env.win.document.body.textContent, /输入预检通过/);
      assert.equal(env.calls.filter(call => !call.url.startsWith('/omnimux/generation-products')).length, 0);
    } finally { await cleanup(env); }
  }
});

test('#3274 product and intent edits keep the complete draft while saved legacy uses and task references remain untouched', async () => {
  const env = setup({ alternatives: [{ status: 'pending', inputs: [], inputGroups: [], parameters: { seed: { type: 'integer' } }, output: { type: 'image' }, constraints: {} }] });
  const legacy = ['edit', 'extend', 'digital_human', 'old_custom'].map(operation => ({ id: operation, data: { params: { operation, prompt: 'old', seed: 19 }, taskRef: { taskId: operation, originalRequest: { operation, seed: 19 } }, mediaAssets: [{ type: 'image', pathOrUrl: `/${operation}` }] } }));
  env.api.useCanvasStore.setState({ nodes: env.win.JSON.parse(JSON.stringify(legacy)), edges: [] });
  const original = JSON.stringify(env.api.useCanvasStore.getState().nodes);
  try {
    await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考'); await click(env, '添加 edit [0]');
    await change(env, 'textarea', ' explicit ');
    await env.api.act(async () => env.win.document.querySelector('[data-parameter="seed"] button').click()); await click(env, '数值'); await change(env, '[data-parameter="seed"] input', '0');
    await click(env, '检查输入'); await choose(env, '生图', '生视频');
    assert.doesNotMatch(env.win.document.body.textContent, /输入预检通过/); assert.equal(buttonByText(env, '检查输入').disabled, true);
    await choose(env, '用途', '首尾帧'); await click(env, '检查输入');
    assert.deepEqual(env.calls.at(-1).body.parameters, { seed: 0 }); assert.equal(env.calls.at(-1).body.assets.length, 1); assert.equal(env.calls.at(-1).body.prompt, ' explicit ');
    await click(env, '丢弃草稿'); assert.equal(JSON.stringify(env.api.useCanvasStore.getState().nodes), original);
    assert.equal(env.calls.filter(call => !call.url.startsWith('/omnimux/generation-products')).length, 0);
  } finally { await cleanup(env); }
});

test('#3274 version reconfirmation retains explicit repeated roles and source choices', async () => {
  const alternatives = [{ status: 'pending', inputs: [{ slot: 'first', role: 'first_frame' }, { slot: 'last', role: 'last_frame' }], inputGroups: [], parameters: {}, output: {}, constraints: {} }];
  const env = setup({ alternatives });
  const node = env.win.JSON.parse('{"id":"role","data":{"mediaAssets":[{"type":"image","pathOrUrl":"/same","outputVersion":"v1"}]}}');
  env.api.useCanvasStore.setState({ nodes: [node], edges: [] });
  try {
    await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考'); await click(env, '添加 role [0]');
    const row = env.win.document.querySelector('[data-selected-asset="0"]');
    for (const [label, value] of [['角色方案', '方案 1'], ['角色', 'first_frame'], ['位置', 'first']]) {
      await env.api.act(async () => [...row.querySelectorAll('button')].find(button => button.textContent === label).click()); await click(env, value);
    }
    await click(env, '检查输入'); node.data.mediaAssets[0].outputVersion = 'v2';
    await env.api.act(async () => env.api.useCanvasStore.setState({ nodes: [node] }));
    await click(env, '重新确认'); await click(env, '检查输入');
    assert.deepEqual([env.calls.at(-1).body.assets[0].role, env.calls.at(-1).body.assets[0].targetSlot, env.calls.at(-1).body.assets[0].outputVersion], ['first_frame', 'first', 'v2']);
  } finally { await cleanup(env); }
});

test('#3274 changing a role branch preserves visible choices but requires explicit reconfirmation', async () => {
  const alternatives = ['first', 'last'].map(slot => ({ status: 'pending', inputs: [{ slot, role: slot + '_frame' }], inputGroups: [], parameters: {}, output: {}, constraints: {} }));
  const env = setup({ alternatives });
  env.api.useCanvasStore.setState({ nodes: env.win.JSON.parse('[{"id":"role","data":{"mediaAssets":[{"type":"image","pathOrUrl":"/same"}]}}]'), edges: [] });
  try {
    await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考'); await click(env, '添加 role [0]');
    const row = env.win.document.querySelector('[data-selected-asset="0"]');
    for (const [label, value] of [['角色方案', '方案 1'], ['角色', 'first_frame'], ['位置', 'first']]) {
      await env.api.act(async () => [...row.querySelectorAll('button')].find(button => button.textContent === label).click()); await click(env, value);
    }
    await click(env, '检查输入');
    await env.api.act(async () => [...row.querySelectorAll('button')].find(button => button.textContent === '方案 1').click()); await click(env, '方案 2');
    await click(env, '检查输入'); assert.equal(env.calls.length, 2, 'changed branch cannot silently post old explicit role');
    assert.match(env.win.document.body.textContent, /角色.*待确认/);
  } finally { await cleanup(env); }
});

test('#3274 original node and edge array accessors never execute before source safety admission', async () => {
  for (const field of ['nodes', 'edges']) {
    const env = setup(); let reads = 0;
    const graph = { nodes: env.win.JSON.parse('[{"id":"role","data":{"mediaAssets":[{"type":"image","pathOrUrl":"/same"}]}}]'), edges: env.win.Array.of() };
    const originalNode = graph.nodes[0];
    const values = env.win.Array.of(); values.length = 1;
    env.win.Object.defineProperty(values, '0', { enumerable: true, get() { reads++; return originalNode; } });
    graph[field] = values; env.api.useCanvasStore.setState(graph);
    try { await mount(env); assert.equal(reads, 0, field); assert.match(env.win.document.body.textContent, /添加/); }
    finally { await cleanup(env); }
  }
});

test('#3274 changes outside transported fields and same-id edge retargeting invalidate selected sources', async () => {
  const env = setup();
  const node = env.win.JSON.parse('{"id":"role","data":{"mediaAssets":[{"type":"image","pathOrUrl":"/same","originalDescription":"before"}]}}');
  const edge = env.win.JSON.parse('{"id":"e","source":"role","target":"target","targetHandle":"input"}');
  env.api.useCanvasStore.setState({ nodes: [node], edges: [edge] });
  try {
    await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考'); await click(env, '添加 role [0] / e'); await click(env, '检查输入');
    node.data.mediaAssets[0].originalDescription = 'after'; await env.api.act(async () => env.api.useCanvasStore.setState({ nodes: [node] }));
    assert.doesNotMatch(env.win.document.body.textContent, /输入预检通过/); await click(env, '重新确认'); await click(env, '检查输入');
    edge.target = 'other'; await env.api.act(async () => env.api.useCanvasStore.setState({ edges: [edge] }));
    assert.doesNotMatch(env.win.document.body.textContent, /输入预检通过/); await click(env, '检查输入'); assert.equal(env.calls.length, 3);
  } finally { await cleanup(env); }
});

test('#3274 intent changes and refreshed directories require role confirmation without discarding previous choices', async () => {
  for (const context of ['intent', 'directory', 'originalRole']) {
    let stale = context === 'directory';
    const first = { status: 'pending', inputs: [{ slot: 'first', role: 'first_frame' }], inputGroups: [], parameters: {}, output: {}, constraints: {} };
    const last = { ...first, inputs: [{ slot: 'last', role: 'last_frame' }] };
    const env = setup({ alternatives: [first], respond(url, options, catalog) {
      if (url === '/omnimux/generation-products') return { ok: true, status: 200, json: async () => catalog };
      if (stale) { stale = false; catalog.currentFingerprint = 'b'.repeat(64); catalog.products[0].intents[0].alternatives = [last]; return { ok: false, status: 409, json: async () => ({ error: 'stale_fingerprint' }) }; }
      return { ok: true, status: 200, json: async () => ({ schemaVersion: 1, currentFingerprint: catalog.currentFingerprint, status: 'ready', executable: false, issues: [] }) };
    } });
    env.catalog.products[0].intents.push({ intent: 'other', label: '另一用途', status: 'pending', alternatives: [last] });
    const node = env.win.JSON.parse('{"id":"role","data":{"mediaAssets":[{"type":"image","pathOrUrl":"/same","role":"first_frame"}]}}');
    env.api.useCanvasStore.setState({ nodes: [node], edges: [] });
    try {
      await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考'); await click(env, '添加 role [0]');
      const row = env.win.document.querySelector('[data-selected-asset="0"]');
      for (const [label, value] of [['角色方案', '方案 1'], ['first_frame', 'first_frame'], ['位置', 'first']]) {
        await env.api.act(async () => [...row.querySelectorAll('button')].find(button => button.textContent === label).click()); await click(env, value);
      }
      if (context === 'intent') await choose(env, '垫图参考', '另一用途');
      if (context === 'directory') { await click(env, '检查输入'); await tick(env); }
      if (context === 'originalRole') { node.data.mediaAssets[0].role = 'last_frame'; await env.api.act(async () => env.api.useCanvasStore.setState({ nodes: [node] })); await click(env, '重新确认'); }
      const posts = env.calls.filter(call => call.method === 'POST').length;
      await click(env, '检查输入');
      assert.equal(env.calls.filter(call => call.method === 'POST').length, posts, context);
      assert.match(row.textContent, /first_frame/); assert.match(env.win.document.body.textContent, /角色.*待确认/);
    } finally { await cleanup(env); }
  }
});

test('#3274 unexpected preview fields fail closed while the exact public issue shape is preserved', async () => {
  for (const kind of ['message', 'privateField', 'index', 'fingerprint', 'unknownCode', 'valid']) {
    const env = setup({ respond(url, options, catalog) {
      if (url === '/omnimux/generation-products') return { ok: true, status: 200, json: async () => catalog };
      const issue = kind === 'message' ? { code: 'input_pending', message: 'unadmitted' } : kind === 'privateField' ? { code: 'input_pending', channelId: 'unadmitted' } : kind === 'index' ? { code: 'input_pending', assetIndex: -1 } : kind === 'unknownCode' ? { code: 'internal_detail' } : { code: 'input_pending', field: 'seed', assetIndex: 0 };
      return { ok: true, status: 200, json: async () => ({ schemaVersion: 1, currentFingerprint: catalog.currentFingerprint, status: 'pending', executable: false, issues: [issue], ...(kind === 'fingerprint' ? { requestFingerprint: 9 } : {}) }) };
    } });
    try {
      await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考'); await click(env, '检查输入');
      assert.match(env.win.document.body.textContent, kind === 'valid' ? /素材信息待补齐/ : /生成条件暂不可用/, kind);
      assert.doesNotMatch(env.win.document.body.textContent, /unadmitted/);
    } finally { await cleanup(env); }
  }
});

test('#3274 empty draft posts six keys with exact explicit prompt and still cannot generate', async () => {
  const env = setup();
  try {
    await mount(env);
    await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考');
    await change(env, 'textarea[aria-label="说明"]', '  原始说明\n');
    await click(env, '检查输入');
    assert.deepEqual(env.calls.at(-1), { url: '/omnimux/generation-products/preview', method: 'POST', body: {
      schemaVersion: 1, currentFingerprint: 'a'.repeat(64), productId: 'generation.image', intent: 'multi_reference', parameters: {}, assets: [], prompt: '  原始说明\n',
    } });
    assert.match(env.win.document.body.textContent, /输入预检通过，尚不能生成/);
    assert.equal(env.calls.filter(call => !call.url.startsWith('/omnimux/generation-products')).length, 0);
  } finally { await cleanup(env); }
});

test('#3276 unchanged directory reader and draft preserve nested text declarations without a second matcher', async () => {
  const slot = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1,
    valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction', localRole: 'instruction' } };
  const alternative = { status: 'pending', inputs: [slot], inputGroups: [], parameters: {}, output: { type: 'image' }, constraints: {} };
  const env = setup({ alternatives: [alternative] });
  const before = JSON.stringify(alternative);
  try {
    await mount(env); await choose(env, '产品', '生图'); await choose(env, '用途', '垫图参考');
    const declaration = env.win.document.querySelector('[data-generation-branch] pre');
    assert.ok(declaration); assert.deepEqual(JSON.parse(declaration.textContent), alternative);
    assert.equal(JSON.stringify(alternative), before);
    await change(env, 'textarea[aria-label="说明"]', '  完整最终描述\n');
    await click(env, '检查输入');
    assert.equal(env.calls.at(-1).body.prompt, '  完整最终描述\n');
    assert.deepEqual(env.calls.at(-1).body.assets, []);
    assert.equal(env.calls.filter(call => !call.url.startsWith('/omnimux/generation-products')).length, 0);
    assert.match(env.win.document.body.textContent, /输入预检通过，尚不能生成/);
  } finally { await cleanup(env); }
});
