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

function setup() {
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
  win.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', body: options.body === undefined ? undefined : JSON.parse(options.body) });
    assert.equal(url, '/omnimux/generation-products');
    return { ok: true, status: 200, json: async () => catalog };
  };
  return { dom, win, api, calls, catalog };
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
    await api.act(async () => button.click());
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
