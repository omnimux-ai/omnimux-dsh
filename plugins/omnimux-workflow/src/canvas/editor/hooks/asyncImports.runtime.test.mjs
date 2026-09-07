import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const requireHub = createRequire(new URL('../../../../../omnimux/package.json', import.meta.url));
const { JSDOM } = requireHub('jsdom');
const bundle = await build({
  stdin: { contents: `
    import React from 'react';
    import { useResourcePicker } from './useResourcePicker.ts';
    import { useProjectAssets } from './useProjectAssets.ts';
    export { AssetsDrawer } from '../components/AssetsDrawer.tsx';
    export { default as LocalUploadPane } from '../components/ResourcePickerModal/LocalUploadPane.tsx';
    export function HookHost({ workspaceId }) {
      window.currentPicker = useResourcePicker('target', workspaceId);
      window.currentAssets = useProjectAssets(workspaceId);
      return null;
    }
    export { createElement, act, StrictMode } from 'react';
    export { createRoot } from 'react-dom/client';`,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', globalName: 'testApi', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'io-and-presentation', setup(build) {
    build.onResolve({ filter: /\/apiClient(?:\.ts)?$|\/canvasStore$|\/ui$|\/i18n$|\/assetsLibraryClient$|\/useSubjectLibrary$|\/useAddToConversation$|^\.\/assets$/ },
      ({ path }) => ({ path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'jsx', contents:
      path.endsWith('/canvasStore') ? `export const useCanvasStore = selector => selector(window.fixture.state);
        useCanvasStore.getState = () => window.fixture.state;`
      : path.endsWith('/i18n') ? 'export const useT = () => key => key;'
      : path.endsWith('/ui') ? `export const toast = Object.fromEntries(['success','error','warning','info'].map(level => [level, message => window.fixture.toasts.push({level, message})]));`
      : path.endsWith('/assetsLibraryClient') ? `export const createAssetsLibraryClient = () => ({ pickAssets: () => window.fixture.libraryPick() });`
      : path.endsWith('/useSubjectLibrary') ? `export const useSubjectLibrary = () => ({ subjects: [], error: null, createSubject: async () => null });`
      : path.endsWith('/useAddToConversation') ? `export const useAddToConversation = () => ({ addToConversation() {} });`
      : path === './assets' ? `export const extractCanvasAssets = () => [];
        export const ProjectAssetsView = props => { window.drawerAssets = props; return null; };
        export const CanvasOutlineView = () => null;
        export const SubjectLibraryView = () => null;
        export const HoverInspector = () => null;
        export const CanvasItemContextMenu = () => null;
        export const AssetItemContextMenu = () => null;
        export const FolderContextMenu = () => null;`
      : `export const pickLocalFiles = () => window.fixture.pick();
        export const getWorkspaceAssets = (...args) => window.fixture.get(...args);
        export const indexWorkspaceAssets = (...args) => window.fixture.mutate('index', ...args);
        export const instantiateWorkspaceAssets = (...args) => window.fixture.mutate('instantiate', ...args);
        export const mkdirWorkspaceAsset = (...args) => window.fixture.mutate('mkdir', ...args);
        export const saveWorkspaceAssets = (...args) => window.fixture.mutate('save', ...args);`,
    }));
  } }],
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const document = (rev = 1, name = 'asset') => ({ schemaVersion: 1, rev, folders: [], items: [
  { id: name, name: `${name}.png`, type: 'image', relative_path: `assets/${name}.png`, parentId: null, updatedAt: 1 },
] });
const assetsResponse = (rev, name) => ({ ok: true, body: { assets: document(rev, name) } });
const picked = path => ({ ok: true, body: { path, paths: path ? [path] : [] } });

function setup(t) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost', runScripts: 'outside-only' });
  const win = dom.window;
  win.IS_REACT_ACT_ENVIRONMENT = true;
  win.MessageChannel = class {
    port1 = { onmessage: null };
    port2 = { postMessage: () => setImmediate(() => this.port1.onmessage?.()) };
  };
  const writes = [], toasts = [], picks = [], mutations = [], reads = [];
  win.fixture = {
    toasts,
    state: { nodes: [{ id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'import' } }], edges: [],
      applyCanvasInputMutation: plan => { writes.push(plan); return { status: 'allowed' }; } },
    pick: () => { const pending = deferred(); picks.push(pending); return pending.promise; },
    libraryPick: () => { const pending = deferred(); picks.push(pending); return pending.promise; },
    get: (id, signal) => { reads.push({ id, signal }); return Promise.resolve(assetsResponse(1, id)); },
    mutate: (method, id, payload) => { const pending = deferred(); mutations.push({ method, id, payload, ...pending }); return pending.promise; },
  };
  win.eval(bundle.outputFiles[0].text);
  const api = win.testApi;
  const root = api.createRoot(win.document.getElementById('root'));
  const flush = fn => api.act(async () => { fn?.(); for (let i = 0; i < 8; i++) await Promise.resolve(); });
  const render = (Component, props) => flush(() => root.render(api.createElement(api.StrictMode, null, api.createElement(Component, props))));
  t.after(async () => { await flush(() => root.unmount()); win.close(); });
  return { win, api, writes, toasts, picks, mutations, reads, flush, render,
    hooks: id => render(api.HookHost, { workspaceId: id }),
    unmount: () => flush(() => root.render(null)),
  };
}

for (const method of ['fillImportNode', 'importLocalFiles', 'relinkLocalFile']) {
  test(`${method}: late native response cannot mutate or toast in another workspace`, async t => {
    const f = setup(t); await f.hooks('A');
    const oldPicker = f.win.currentPicker;
    const pending = oldPicker[method]('image');
    await f.hooks('B');
    await f.flush(() => f.picks[0].resolve(picked('/A.png')));
    assert.equal(await pending, false);
    assert.equal(f.writes.length, 0); assert.equal(f.toasts.length, 0);
    assert.equal(await oldPicker[method]('image'), false, 'retained old callback cannot start another picker');
    assert.equal(f.picks.length, 1);
  });
}

test('native fill uses current gateway and native path; cancellation and network error stay distinct', async t => {
  const f = setup(t); await f.hooks('B');
  let pending = f.win.currentPicker.fillImportNode();
  await f.flush(() => f.picks[0].resolve(picked('/B.png')));
  assert.equal(await pending, true); assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].nodePatches[0].nodeId, 'target');
  assert.equal(f.writes[0].nodePatches[0].data.realPath, '/B.png');
  f.toasts.length = 0;
  pending = f.win.currentPicker.fillImportNode();
  await f.flush(() => f.picks[1].resolve(picked(null)));
  assert.equal(await pending, false); assert.equal(f.toasts.length, 0);
  pending = f.win.currentPicker.fillImportNode();
  await f.flush(() => f.picks[2].reject(new Error('offline')));
  assert.equal(await pending, false); assert.equal(f.toasts[0].message, 'picker.pickFailed');
});

test('close and reopen retires pending native selection and retained canvas commit callback', async t => {
  const f = setup(t); await f.hooks('A');
  await f.flush(() => f.win.currentPicker.openPicker('local'));
  const oldPicker = f.win.currentPicker;
  const pending = oldPicker.importLocalFiles();
  await f.flush(() => {
    oldPicker.closePicker();
    assert.equal(oldPicker.commit({ selectedCanvasNodeIds: [], localFiles: [] }), false);
    oldPicker.openPicker('canvas');
  });
  await f.flush(() => f.picks[0].resolve(picked('/old.png')));
  assert.equal(await pending, false);
  assert.equal(oldPicker.commit({ selectedCanvasNodeIds: [], localFiles: [] }), false);
  assert.equal(f.win.currentPicker.open, true);
  assert.equal(f.writes.length, 0); assert.equal(f.toasts.length, 0);
});

for (const method of ['indexPaths', 'mkdir', 'instantiateSubject', 'persist']) {
  test(`${method}: prior workspace response cannot adopt a document or error`, async t => {
    const f = setup(t); await f.hooks('A');
    const oldAssets = f.win.currentAssets;
    const payload = method === 'persist' ? { folders: [], items: [] } : method === 'indexPaths' ? ['/A.png'] : 'name';
    const pending = oldAssets[method](payload);
    assert.equal(f.mutations[0].id, 'A'); assert.equal(f.mutations[0].payload.expectedRev, 1);
    await f.hooks('B');
    await f.flush(() => f.mutations[0].resolve(assetsResponse(8, 'A-late')));
    assert.equal(await pending, false);
    assert.equal(f.win.currentAssets.document.items[0].id, 'B');
    assert.equal(f.win.currentAssets.error, null);
    assert.equal(await oldAssets[method](payload), false, 'retained callback may not write A using B revision');
    assert.equal(f.mutations.length, 1);
    const current = f.win.currentAssets[method](payload);
    await f.flush(() => f.mutations[1].resolve(assetsResponse(2, 'B-current')));
    assert.equal(await current, true);
    assert.equal(f.win.currentAssets.document.items[0].id, 'B-current');
  });
}

test('manual refresh ignores a late success or failure after A → B → A', async t => {
  const f = setup(t); await f.hooks('A');
  const late = deferred(); f.win.fixture.get = () => late.promise;
  let refresh;
  await f.flush(() => { refresh = f.win.currentAssets.refresh(); });
  f.win.fixture.get = id => Promise.resolve(assetsResponse(4, id));
  await f.hooks('B'); await f.hooks('A');
  await f.flush(() => late.resolve(assetsResponse(99, 'obsolete')));
  await refresh;
  assert.equal(f.win.currentAssets.document.rev, 4);
  assert.equal(f.win.currentAssets.document.items[0].id, 'A');
  const pending = f.win.currentAssets.indexPaths(['/A.png']);
  await f.unmount(); await f.flush(() => f.mutations[0].reject(new Error('late failure')));
  assert.equal(await pending, false); assert.equal(f.toasts.length, 0);
});

test('local pane ignores selection after closing, while a new selection still adds native paths', async t => {
  const f = setup(t); const added = [];
  const props = { files: [], onAddFiles: files => added.push(...files), onRemove() {} };
  await f.render(f.api.LocalUploadPane, { ...props, active: true });
  await f.flush(() => f.win.document.querySelector('.wf-picker-dropzone').click());
  await f.render(f.api.LocalUploadPane, { ...props, active: false });
  await f.render(f.api.LocalUploadPane, { ...props, active: true });
  await f.flush(() => f.picks[0].resolve(picked('/old.png')));
  assert.equal(added.length, 0); assert.equal(f.toasts.length, 0);
  await f.flush(() => f.win.document.querySelector('.wf-picker-dropzone').click());
  await f.flush(() => f.picks[1].resolve(picked('/new.png')));
  assert.equal(added[0].realPath, '/new.png');
});

test('drawer asset-library selection and index response are isolated across workspaces', async t => {
  const f = setup(t); const inserted = [];
  const drawer = workspaceId => f.render(f.api.AssetsDrawer, { workspaceId, isOpen: true, onClose() {}, onInsertAsset: asset => inserted.push(asset), nodes: [] });
  await drawer('A');
  await f.flush(() => [...f.win.document.querySelectorAll('button')].find(button => button.textContent.trim() === '资产').click());
  await f.flush(() => f.win.drawerAssets.onImportFiles());
  await drawer('B');
  await f.flush(() => f.picks[0].resolve({ interpretation: { kind: 'ok', paths: ['/old.png'] } }));
  assert.equal(f.mutations.length, 0); assert.equal(f.toasts.length, 0);
  await f.flush(() => f.win.drawerAssets.onImportFiles());
  await f.flush(() => f.picks[1].resolve({ interpretation: { kind: 'ok', paths: ['/B.png'] } }));
  assert.equal(f.mutations[0].id, 'B');
  await drawer('C');
  await f.flush(() => f.mutations[0].resolve(assetsResponse(2, 'B-late')));
  assert.equal(f.win.drawerAssets.assets[0].id, 'C');
  assert.equal(f.toasts.length, 0); assert.equal(inserted.length, 0);
});

test('unmounted resource picker ignores native rejection without an error toast', async t => {
  const f = setup(t); await f.hooks('A');
  const pending = f.win.currentPicker.fillImportNode();
  await f.unmount();
  await f.flush(() => f.picks[0].reject(new Error('closed')));
  assert.equal(await pending, false);
  assert.equal(f.writes.length, 0); assert.equal(f.toasts.length, 0);
});

test('drawer native canvas import drops A response and inserts only B selection', async t => {
  const f = setup(t); const inserted = [];
  const drawer = workspaceId => f.render(f.api.AssetsDrawer, { workspaceId, isOpen: true, onClose() {}, onInsertAsset: asset => inserted.push(asset), nodes: [] });
  await drawer('A');
  const choose = () => f.win.document.querySelector('.wf-assets-action-primary-btn-compact').click();
  await f.flush(choose); await drawer('B');
  await f.flush(() => f.picks[0].resolve(picked('/A.png')));
  assert.equal(inserted.length, 0); assert.equal(f.toasts.length, 0);
  await f.flush(choose);
  await f.flush(() => f.picks[1].resolve(picked('/B.png')));
  assert.equal(inserted.length, 1); assert.equal(inserted[0].real_path, '/B.png');
  assert.equal(f.toasts[0].level, 'success');
});
