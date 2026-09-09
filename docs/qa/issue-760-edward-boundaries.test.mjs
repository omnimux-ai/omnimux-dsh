import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { catalogFor, operation, slot } from '../../plugins/omnimux-workflow/src/workflow/seam/submissionFixtures.mjs';

const workflow = new URL('../../plugins/omnimux-workflow/', import.meta.url);
const { JSDOM } = createRequire(new URL('../../plugins/omnimux/package.json', import.meta.url))('jsdom');
const bundle = await build({
  stdin: { contents: `export { useResourcePicker as usePicker } from './src/canvas/editor/hooks/useResourcePicker.ts';
    export { useCanvasStore as store } from './src/canvas/store/canvasStore.ts';
    export { default as Editor } from './src/canvas/editor/components/PromptTokenEditor/PromptTokenEditor.tsx';
    export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';`,
    resolveDir: workflow.pathname, loader: 'tsx' },
  bundle: true, write: false, format: 'iife', globalName: 'qa', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'presentation-only', setup(b) {
    b.onResolve({ filter: /\/ui$|\/i18n$/ }, ({ path }) => ({ path, namespace: 'qa' }));
    b.onLoad({ filter: /.*/, namespace: 'qa' }, ({ path }) => ({ contents: path.endsWith('/ui')
      ? 'export const toast = { warning() {}, error() {}, success() {} };'
      : 'export const useT = () => key => key;' }));
  } }],
});
const image = id => ({ id, type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'import', mediaUrl: `https://example.test/${id}.png` } });
const occupant = id => ({ sourceNodeId: id, edgeId: `e-${id}`, pinned: true });
function fixture(t, max = 2, connected = true) {
  const dom = new JSDOM('<main></main>', { url: 'http://localhost', runScripts: 'outside-only' });
  const w = dom.window;
  w.IS_REACT_ACT_ENVIRONMENT = true;
  w.MessageChannel = class { port1 = { onmessage: null }; port2 = { postMessage: () => setImmediate(() => this.port1.onmessage?.()) }; };
  w.eval(bundle.outputFiles[0].text);
  const api = w.qa;
  const root = api.createRoot(w.document.querySelector('main'));
  const flush = fn => api.act(async () => { await fn?.(); });
  const target = { ...image('target'), data: { materialType: 'image', nodeKind: 'generate', prompt: 'initial', slotStandbyEdgeIds: connected ? ['e-c'] : [], params: { model: 'refs', operation: 'image_to_image' }, slotBindings: { refs: [occupant('a'), occupant('b')] } } };
  const catalog = catalogFor('image', 'refs', [operation('image_to_image', 'image', [slot('image', 'reference', 0, max, 'refs')])]);
  api.store.getState().setCatalogRuntime(catalog);
  api.store.getState().hydrateGraph([target, ...['a', 'b', 'c', 'd'].map(image)], ['a', 'b', ...(connected ? ['c'] : [])].map(id => ({ id: `e-${id}`, source: id, target: 'target' })));
  api.store.getState().clearHistory();
  let picker;
  function Host() { picker = api.usePicker('target', 'qa-only'); return null; }
  t.after(async () => { await flush(() => root.unmount()); w.close(); });
  return { w, api, root, flush, store: api.store, picker: () => picker,
    mount: () => flush(() => root.render(api.createElement(Host))),
    snapshot: () => JSON.stringify({ nodes: api.store.getState().nodes, edges: api.store.getState().edges }),
    open: () => flush(() => picker.openPicker('canvas', { slot: 'refs', acceptedTypes: ['image'], max, replaceEdgeId: 'e-a' })),
  };
}
for (const max of [2, 3, null]) for (const connected of [true, false]) {
  test(`actual picker/store preserves independent undo/redo for ${connected ? 'Feed' : 'new'} source, max=${max}`, async t => {
    const f = fixture(t, max, connected); await f.mount(); await f.open();
    assert.equal(f.picker().mode, 'replace');
    f.store.getState().applyCanvasInputMutation({ nodePatches: [{ nodeId: 'target', data: { prompt: 'typing before replacement' } }] });
    f.store.getState().pushHistory();
    const before = f.snapshot();
    await f.flush(() => assert.equal(f.picker().commit({ selectedCanvasNodeIds: ['c'], localFiles: [] }), true));
    const after = f.snapshot();
    assert.deepEqual(JSON.parse(after).nodes[0].data.slotBindings.refs.map(x => x.sourceNodeId), ['c', 'b']);
    assert.deepEqual(JSON.parse(after).nodes[0].data.slotStandbyEdgeIds, ['e-a']);
    assert.equal(JSON.parse(after).edges.length, 3);
    assert.equal(f.picker().open, false);
    f.store.getState().undo(); assert.equal(f.snapshot(), before);
    f.store.getState().redo(); assert.equal(f.snapshot(), after);
    // A subsequent replacement must retain a separate history boundary even within debounce.
    await f.flush(() => f.picker().openPicker('canvas', { slot: 'refs', acceptedTypes: ['image'], max, replaceEdgeId: f.store.getState().nodes[0].data.slotBindings.refs[0].edgeId }));
    await f.flush(() => assert.equal(f.picker().commit({ selectedCanvasNodeIds: ['d'], localFiles: [] }), true));
    const second = f.snapshot();
    f.store.getState().undo(); assert.equal(f.snapshot(), after);
    f.store.getState().undo(); assert.equal(f.snapshot(), before);
    f.store.getState().redo(); assert.equal(f.snapshot(), after);
    f.store.getState().redo(); assert.equal(f.snapshot(), second);
  });
}
test('actual picker rejects disappeared occupant and duplicate source without graph/history writes', async t => {
  const f = fixture(t); await f.mount(); await f.open();
  let before = f.snapshot(); const past = f.store.getState().past.length;
  await f.flush(() => assert.equal(f.picker().commit({ selectedCanvasNodeIds: ['b'], localFiles: [] }), false));
  assert.equal(f.snapshot(), before); assert.equal(f.store.getState().past.length, past);
  f.store.getState().applyCanvasInputMutation({ removeEdgeIds: ['e-a'] }); before = f.snapshot();
  await f.flush(() => assert.equal(f.picker().commit({ selectedCanvasNodeIds: ['c'], localFiles: [] }), false));
  assert.equal(f.snapshot(), before); assert.equal(f.store.getState().past.length, past);
});
test('actual picker cancellation makes retained commit callback inert', async t => {
  const f = fixture(t); await f.mount(); await f.open();
  const stale = f.picker().commit; const before = f.snapshot();
  await f.flush(() => f.picker().closePicker());
  assert.equal(stale({ selectedCanvasNodeIds: ['c'], localFiles: [] }), false);
  assert.equal(f.snapshot(), before);
});
test('two media tokens refresh latest references after composition with text and selection intact', async t => {
  const f = fixture(t); const changes = [];
  const value = 'prefix @ref[a:-2:a.png] middle @ref[b:-2:b.png] suffix';
  const refs = version => ['a', 'b'].map(nodeId => ({ nodeId, slotIndex: -2, label: `${nodeId}.png`, materialType: 'image', mediaUrl: `https://example.test/${nodeId}-${version}.png` }));
  const render = version => f.flush(() => f.root.render(f.api.createElement(f.api.Editor, { value, currentReferences: refs(version), onChange: x => changes.push(x) })));
  await render('old');
  const editor = f.w.document.querySelector('.wf-prompt-token-editor');
  const spans = [...editor.querySelectorAll('.wf-prompt-token')];
  const text = editor.lastChild;
  const select = () => { const r = f.w.document.createRange(); r.setStart(text, 2); r.setEnd(text, 5); f.w.getSelection().removeAllRanges(); f.w.getSelection().addRange(r); };
  select();
  await f.flush(() => editor.dispatchEvent(new f.w.CompositionEvent('compositionstart', { bubbles: true })));
  text.textContent = ' suffix中文'; select();
  await render('intermediate'); await render('latest');
  assert.ok(spans[0].querySelector('img').src.endsWith('a-old.png'));
  await f.flush(() => editor.dispatchEvent(new f.w.CompositionEvent('compositionend', { bubbles: true, data: '中文' })));
  assert.equal(changes.at(-1), value + '中文');
  for (const [i, id] of ['a', 'b'].entries()) {
    assert.equal(editor.querySelectorAll('.wf-prompt-token')[i], spans[i]);
    assert.ok(spans[i].querySelector('img').src.endsWith(`${id}-latest.png`));
  }
  assert.equal(editor.lastChild, text);
  assert.equal(f.w.getSelection().anchorNode, text); assert.equal(f.w.getSelection().anchorOffset, 2);
  assert.equal(f.w.getSelection().focusOffset, 5);
  await f.flush(() => spans[0].querySelector('button').click());
  assert.equal(changes.at(-1), 'prefix  middle @ref[b:-2:b.png] suffix中文');
});
