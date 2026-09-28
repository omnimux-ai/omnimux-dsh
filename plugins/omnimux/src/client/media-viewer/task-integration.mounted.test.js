import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { writeFile, unlink } from 'node:fs/promises';
import { createMediaViewerStore } from './media-viewer-store.js';

const target = new URL('./.task-integration-bundle.mjs', import.meta.url);
const bundle = await build({
  stdin: { contents: "export { MediaViewerTab } from './MediaViewerTab.jsx'; export { GenerationTasks } from './GenerationTasks.jsx';", resolveDir: new URL('.', import.meta.url).pathname, loader: 'js' },
  bundle: true, write: false, format: 'esm', platform: 'node', external: ['react', 'react-dom'],
  plugins: [{ name: 'host-seams', setup(b) {
    b.onResolve({ filter: /MediaViewerComposer\.jsx$/ }, () => ({ path: 'composer', namespace: 'seam' }));
    b.onLoad({ filter: /.*/, namespace: 'seam' }, () => ({ contents: 'export function MediaViewerComposer(props) { globalThis.__composerProps = props; return null; }' }));
  } }],
});
await writeFile(target, bundle.outputFiles[0].text);
const { MediaViewerTab, GenerationTasks } = await import(target.href);
await unlink(target);
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function mount(initialSession = 'a') {
  const store = createMediaViewerStore();
  globalThis[Symbol.for('omnimux.mediaViewer.store')] = store;
  let current = initialSession;
  const listeners = new Set();
  const sessions = { list: { getSnapshot: () => ({ current }), subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } } };
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(h(MediaViewerTab, { sessions })));
  return { store, root, async session(value) { await act(async () => { current = value; listeners.forEach(fn => fn()); }); } };
}

test('parent/store retains request slot and submission ratio through loaded completion', async () => {
  const { store, root } = await mount();
  try {
    await act(async () => store.updateGeneration({ sessionId: 'a', requestId: 'r', status: 'pending', ratio: '9:16' }));
    const slot = document.querySelector('.omx-media-slot');
    assert.ok(slot);
    await act(async () => store.updateGeneration({ sessionId: 'a', requestId: 'r', status: 'running', ratio: '16:9' }));
    assert.equal(document.querySelector('.omx-media-slot'), slot);
    assert.equal(slot.dataset.ratio, '9:16');
    await act(async () => store.updateGeneration({ sessionId: 'a', requestId: 'r', status: 'success', media: [{ type: 'image', url: '/result.png' }] }));
    assert.equal(document.querySelector('.omx-media-slot'), slot);
    assert.equal(slot.querySelector('.omx-media-result.active'), null);
    await act(async () => slot.querySelector('img').dispatchEvent(new window.Event('load')));
    assert.ok(slot.querySelector('.omx-media-result.active'));
    await act(async () => new Promise(resolve => setTimeout(resolve, 320)));
    assert.equal(slot.querySelector('.wf-organic-shimmer'), null);
  } finally { await act(async () => root.unmount()); }
});

test('parent isolates concurrent requests and sessions from legacy global generation state', async () => {
  const { store, root, session } = await mount();
  try {
    await act(async () => {
      store.updateGeneration({ sessionId: 'a', requestId: 'r1', status: 'running' });
      store.updateGeneration({ sessionId: 'a', requestId: 'r2', status: 'running' });
      store.updateGeneration({ sessionId: 'b', requestId: 'r1', status: 'running' });
      store.setGenerating(true, { sessionId: 'b', requestId: 'r1', ratio: '16:9' });
    });
    assert.equal(document.querySelectorAll('.omx-media-slot').length, 2);
    await session('b');
    assert.equal(document.querySelectorAll('.omx-media-slot').length, 1);
    await session('empty');
    assert.equal(document.querySelectorAll('.omx-media-slot').length, 0);
  } finally { await act(async () => root.unmount()); }
});

test('store accepts late unresolved results, merges unique media, and preserves partial abnormal output', () => {
  const store = createMediaViewerStore();
  const patch = data => store.updateGeneration({ sessionId: 'a', requestId: 'r', ...data });
  const image = { type: 'image', url: '/one.png' };
  patch({ status: 'pending', ratio: '9:16' });
  patch({ status: 'unresolved' });
  patch({ status: 'success', media: [image, image] });
  assert.equal(store.getSnapshot().generationTasks[0].status, 'success');
  assert.equal(store.getSnapshot().generationTasks[0].media.length, 1);
  patch({ status: 'success', media: [image, { type: 'image', url: '/two.png' }] });
  assert.equal(store.getSnapshot().generationTasks[0].media.length, 2);
  const second = { sessionId: 'a', requestId: 'partial' };
  store.updateGeneration({ ...second, status: 'running', media: [image] });
  store.updateGeneration({ ...second, status: 'failure', media: [] });
  assert.equal(store.getSnapshot().generationTasks[1].media.length, 1);
});

test('silent task media retains attachment/local-file loaders and releases owned blobs', async () => {
  const root = createRoot(document.getElementById('root'));
  const revoked = [];
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:owned';
  URL.revokeObjectURL = url => revoked.push(url);
  let signal;
  const tasks = [
    { sessionId: 'a', requestId: 'image', status: 'success', media: [{ type: 'image', attachment: { attachmentId: 'att' } }] },
    { sessionId: 'a', requestId: 'video', status: 'failure', prompt: 'private prompt', message: 'private error', media: [{ type: 'video', path: '/result.mp4' }] },
    { sessionId: 'a', requestId: 'empty', status: 'unresolved', prompt: 'private prompt' },
  ];
  try {
    await act(async () => {
      root.render(h(GenerationTasks, { tasks, imageUrl: async (session, attachment) => { assert.equal(session, 'a'); assert.equal(attachment.attachmentId, 'att'); return '/attachment.png'; }, readFile: async (session, path, abort) => { assert.equal(session, 'a'); assert.equal(path, '/result.mp4'); signal = abort; return { ok: true, value: { offset: 0, eof: true, data: 'AQID', bytes: 3 } }; } }));
      await tick();
    });
    assert.equal(document.getElementById('root').textContent, '');
    assert.equal(document.querySelector('button, [role="alert"], [role="status"]'), null);
    assert.equal(document.querySelector('img').getAttribute('src'), '/attachment.png');
    assert.equal(document.querySelector('video').getAttribute('src'), 'blob:owned');
    await act(async () => root.unmount());
    assert.equal(signal.aborted, true);
    assert.deepEqual(revoked, ['blob:owned']);
  } finally {
    await act(async () => root.unmount());
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
  }
});
