import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Real production component and picker interaction. This is offline DOM evidence,
// not a browser, byte-format probe or supplier-generation acceptance.
const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '../../../..');
const require = createRequire(import.meta.url);
let scratch, production;
before(async () => {
  mkdirSync(join(rootDir, '.tmp'), { recursive: true });
  scratch = mkdtempSync(join(rootDir, '.tmp', 'mime-selection-dom-3278-'));
  const output = join(scratch, 'production.mjs');
  await build({
    stdin: { contents: `export { MediaViewerComposer } from './MediaViewerComposer.jsx'; export { ensureReferenceTab, resetReferenceAssetCache } from './reference-asset-cache.js'; export { createMediaViewerStore } from '../../../omnimux/src/client/media-viewer/media-viewer-store.js';`, resolveDir: here },
    bundle: true, format: 'esm', platform: 'node', outfile: output,
    plugins: [{ name: 'same-react', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: require.resolve('react'), external: true }));
    } }],
  });
  production = await import(pathToFileURL(output).href);
});
after(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); });

const promptSlot = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 };
function catalog(kind, limits = {}) {
  const inputs = [promptSlot, { slot: 'reference', type: kind, role: 'reference', min: 0, max: 4, allowedMimes: kind === 'image' ? ['image/png', 'image/jpeg'] : [kind === 'video' ? 'video/mp4' : 'audio/mpeg'], ...limits }];
  const image = { id: 'synthetic-image-3278', family: 'qa', parameters: {}, channelGroups: [{ id: 'synthetic-group', label: '测试组', default: true }], operations: [{ id: 'multi_reference', output: { type: 'image' }, inputs: kind === 'image' ? inputs : [promptSlot, { slot: 'reference', type: 'image', role: 'reference', min: 0, max: 4 }] }] };
  const video = { id: 'synthetic-video-3278', family: 'qa', parameters: {}, channelGroups: [{ id: 'synthetic-group', label: '测试组', default: true }], operations: [{ id: 'video_multi_ref', output: { type: 'video' }, inputs }] };
  return { image: [image], video: [video] };
}
async function withProduction({ kind = 'image', assets = [], limits = {} }, run) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://synthetic.example.test' });
  const prior = new Map();
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) { prior.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  const storeKey = Symbol.for('omnimux.mediaViewer.store'), previousStore = globalThis[storeKey];
  globalThis[storeKey] = production.createMediaViewerStore();
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || 'GET' });
    if (url === '/omnimux/model-catalog') return new Response(JSON.stringify(catalog(kind, limits)), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url === '/omnimux/assets/state') return new Response(JSON.stringify({ assets: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    throw new Error('Unplanned request ' + url);
  };
  const React = require('react');
  const { act } = require('react-dom/test-utils');
  const { createRoot } = require('react-dom/client');
  let mounted;
  const submissions = [];
  production.resetReferenceAssetCache();
  try {
    mounted = createRoot(document.getElementById('root'));
    await act(async () => { mounted.render(React.createElement(production.MediaViewerComposer, { initialMode: kind === 'image' ? 'image' : 'video', onDirectSubmit: value => submissions.push(value) })); });
    const click = async selector => { const target = document.querySelector(selector); assert.ok(target, selector); await act(async () => target.click()); };
    const setPrompt = async value => {
      const target = document.querySelector('textarea'); assert.ok(target);
      await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(target, value); target.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
      assert.equal(target.value, value);
    };
    const open = async () => {
      await click('.omx-slot-btn');
      assert.ok(document.querySelector('[aria-label="选择参考素材"]'));
      await act(async () => { await production.ensureReferenceTab('local', async () => assets); });
    };
    const select = async id => {
      const asset = assets.find(value => value.id === id); assert.ok(asset);
      const target = [...document.querySelectorAll('.omx-ref-picker-asset-card')].find(value => value.getAttribute('aria-label') === asset.title); assert.ok(target, id);
      await act(async () => target.click());
    };
    const snapshot = () => ({ prompt: document.querySelector('textarea').value, items: [...document.querySelectorAll('.omx-slot-card')].map(value => ({ url: value.querySelector('img,video')?.getAttribute('src') || null, html: value.outerHTML })) });
    await run({ dom, act, open, select, snapshot, setPrompt, click, requests, submissions });
    assert.deepEqual(submissions, [], 'Selection must never submit generation');
    assert.deepEqual(requests.filter(value => value.method !== 'GET'), [], 'Selection must never upload or write a task');
  } finally {
    if (mounted) await act(async () => mounted.unmount());
    production.resetReferenceAssetCache();
    globalThis.fetch = previousFetch;
    if (previousStore === undefined) delete globalThis[storeKey]; else globalThis[storeKey] = previousStore;
    for (const [key, descriptor] of prior) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    dom.window.close();
  }
}

for (const kind of ['image', 'video', 'audio']) {
  test(`#3278 production picker rejects unknown ${kind} without changing the draft or existing item`, async () => {
    const mime = kind === 'image' ? 'image/png' : kind === 'video' ? 'video/mp4' : 'audio/mpeg';
    const known = { id: 'known', title: '明确格式', name: '明确格式', type: kind, mime, url: 'https://synthetic.example.test/known' };
    const unknown = { id: 'unknown', title: '未知格式', name: '未知格式', type: kind, url: 'https://synthetic.example.test/opaque' };
    await withProduction({ kind, assets: [known, unknown] }, async ({ open, select, snapshot, setPrompt }) => {
      const draft = '角色说明与补充要求';
      await setPrompt(draft); await open(); await select('known');
      assert.equal(document.querySelector('.omx-ref-picker-popover'), null);
      assert.equal(snapshot().items.length, 1);
      await open(); const previous = snapshot(); await select('unknown');
      assert.equal(document.querySelector('[role="status"]').textContent, '当前素材格式不明，请换用带格式信息的文件');
      assert.deepEqual(snapshot(), previous);
      assert.ok(document.querySelector('.omx-ref-picker-popover'), 'Rejected selection must keep the picker open');
      await select('known'); assert.equal(snapshot().items.length, 2); assert.equal(snapshot().prompt, draft);
    });
  });
}

test('#3278 production picker does not borrow the target image slot for missing or generic type', async () => {
  const assets = [
    { id: 'absent', title: '缺少类型', name: '缺少类型', url: 'https://synthetic.example.test/opaque-a' },
    { id: 'generic', title: '泛图片格式', name: '泛图片格式', type: 'image/', url: 'https://synthetic.example.test/opaque-b' },
  ];
  await withProduction({ assets }, async ({ open, select, snapshot, setPrompt }) => {
    await setPrompt('保留草稿'); await open(); const previous = snapshot();
    for (const asset of assets) { await select(asset.id); assert.equal(document.querySelector('[role="status"]').textContent, '当前素材格式不明，请换用带格式信息的文件'); assert.deepEqual(snapshot(), previous); }
  });
});

test('#3278 known MIME sources still follow the real picker and existing whitelist', async () => {
  const assets = [
    { id: 'declared', title: '显式格式', mimeType: 'image/png', url: 'https://synthetic.example.test/opaque' },
    { id: 'url', title: '网址扩展', type: 'image', url: 'https://synthetic.example.test/image.png?original=1' },
    { id: 'data', title: '可推泛声明', type: 'image/', url: 'data:image/png;base64,AA==' },
    { id: 'blocked', title: '已知不兼容', type: 'image', url: 'https://synthetic.example.test/image.svg' },
  ];
  await withProduction({ assets }, async ({ open, select, snapshot }) => {
    for (const id of ['declared', 'url', 'data']) { await open(); await select(id); assert.equal(document.querySelector('.omx-ref-picker-popover'), null); }
    assert.equal(snapshot().items.length, 3); await open(); const previous = snapshot(); await select('blocked');
    assert.equal(document.querySelector('[role="status"]').textContent, '当前文件格式不符合要求'); assert.deepEqual(snapshot(), previous);
  });
});
