import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const { JSDOM } = createRequire(new URL('../../../../../omnimux/package.json', import.meta.url))('jsdom');
const bundle = await build({
  stdin: { contents: `export { useSaveRemoteAudio as useSave } from './useSaveRemoteAudio.ts'; export { useCanvasStore as store } from '../../store/canvasStore'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';`, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', globalName: 'api', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
});
const remote = 'https://audio.example.test/a.wav';
const item = { id: 'ast_a', type: 'audio', name: 'audio.wav', relative_path: 'assets/imported/audio.wav', mimeType: 'audio/wav', size: 44, durationSec: null };
async function fixture(t) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', runScripts: 'outside-only' });
  const win = dom.window;
  win.IS_REACT_ACT_ENVIRONMENT = true;
  win.MessageChannel = class { port1 = { onmessage: null }; port2 = { postMessage: () => setImmediate(() => this.port1.onmessage?.()) }; };
  win.eval(bundle.outputFiles[0].text);
  const root = win.api.createRoot(win.document.getElementById('root'));
  let save;
  function Parent(props) { save = win.api.useSave(props.id, props.workspaceId, props.source); return null; }
  const flush = fn => win.api.act(async () => { await fn?.(); for (let i = 0; i < 8; i++) await Promise.resolve(); });
  const render = props => flush(() => root.render(win.api.createElement(Parent, { id: 'audio', workspaceId: 'ws_audio', source: remote, ...props })));
  win.api.store.setState({ nodes: [{ id: 'audio', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'audio', nodeKind: 'import', mediaUrl: remote, sttText: 'transcript', params: { model: 'keep' } } }], edges: [] });
  t.after(async () => { await flush(() => root.unmount()); win.close(); });
  await render();
  return { win, flush, render, save: () => save(), store: win.api.store };
}

test('stable save hook adopts through input mutation and reuses registered asset after apply failure', async t => {
  const f = await fixture(t);
  let downloads = 0; let uploads = 0;
  f.win.fetch = async (url) => {
    if (url === remote) { downloads++; return new Response(new Uint8Array(44)); }
    uploads++; return Response.json({ item, rev: 1 });
  };
  const original = f.store.getState().applyCanvasInputMutation;
  f.store.setState({ applyCanvasInputMutation: () => ({ status: 'rejected' }) });
  await assert.rejects(f.save(), /audio-save-apply/);
  f.store.setState({ applyCanvasInputMutation: original });
  await f.save();
  const data = f.store.getState().nodes[0].data;
  assert.equal(downloads, 1); assert.equal(uploads, 1);
  assert.equal(data.assetId, 'ast_a'); assert.equal(data.mediaAssets[0].relativePath, item.relative_path);
  assert.equal(data.sttText, 'transcript'); assert.equal(data.params.model, 'keep');
});

test('source/workspace changes and deletion cancel download without late node writes', async t => {
  for (const change of ['source', 'workspace', 'delete']) {
    const f = await fixture(t);
    let requestSignal;
    f.win.fetch = (_url, options) => { requestSignal = options.signal; return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new f.win.Error('cancelled')))); };
    const pending = f.save(); const rejected = assert.rejects(pending);
    if (change === 'delete') f.store.setState({ nodes: [] });
    else await f.render(change === 'source' ? { source: 'https://audio.example.test/b.wav' } : { workspaceId: 'ws_other' });
    await rejected;
    assert.equal(requestSignal.aborted, true);
    assert.equal(f.store.getState().nodes[0]?.data.assetId, undefined);
  }
});
