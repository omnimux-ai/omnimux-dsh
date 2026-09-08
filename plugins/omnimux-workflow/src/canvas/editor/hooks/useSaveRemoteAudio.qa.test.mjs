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
  function Parent() { save = win.api.useSave('audio', 'ws_audio', remote); return null; }
  const flush = fn => win.api.act(async () => { await fn?.(); });
  win.api.store.setState({ nodes: [{ id: 'audio', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'audio', nodeKind: 'import', mediaUrl: remote } }], edges: [] });
  t.after(async () => { await flush(() => root.unmount()); win.close(); });
  await flush(() => root.render(win.api.createElement(Parent)));
  return { win, store: win.api.store, save: () => save() };
}

test('QA2 store source replacement before a React rerender cancels upload and rejects its late receipt', async t => {
  const f = await fixture(t);
  let finishUpload; let uploadSignal; let started;
  const uploaded = new Promise(resolve => { started = resolve; });
  f.win.fetch = async (url, options) => {
    if (url === remote) return new Response(new Uint8Array(44));
    uploadSignal = options.signal; started();
    return new Promise(resolve => { finishUpload = resolve; });
  };
  const pending = f.save(); const rejected = assert.rejects(pending);
  await uploaded;
  f.store.setState(state => ({ nodes: state.nodes.map(node => ({ ...node, data: { ...node.data, mediaUrl: 'https://audio.example.test/replaced.wav' } })) }));
  assert.equal(uploadSignal.aborted, true);
  finishUpload(Response.json({ item, rev: 1 }));
  await rejected;
  assert.equal(f.store.getState().nodes[0].data.assetId, undefined);
  assert.equal(f.store.getState().nodes[0].data.mediaUrl, 'https://audio.example.test/replaced.wav');
});

test('QA2 same-node duplicate clicks reject while unrelated edits survive successful adoption', async t => {
  const f = await fixture(t);
  let finishDownload; let downloads = 0; let uploads = 0;
  f.win.fetch = async url => {
    if (url === remote) { downloads++; return new Promise(resolve => { finishDownload = resolve; }); }
    uploads++; return Response.json({ item, rev: 1 });
  };
  const pending = f.save();
  await assert.rejects(f.save(), /audio-save-busy/);
  f.store.setState(state => ({ nodes: state.nodes.map(node => ({ ...node, data: { ...node.data, sttText: 'new ASR', params: { model: 'keep' } } })) }));
  finishDownload(new Response(new Uint8Array(44))); await pending;
  const data = f.store.getState().nodes[0].data;
  assert.equal(downloads, 1); assert.equal(uploads, 1);
  assert.equal(data.assetId, item.id); assert.equal(data.sttText, 'new ASR');
  assert.equal(data.params.model, 'keep');
});
