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


test('subject response immediately exposes only its newly imported project files', async t => {
  const f = setup(t); await f.hooks('A');
  const old = f.win.currentAssets.document.items[0];
  const added = { ...old, id:'new', relative_path:'subjects/subject/new.png', snapshot:{globalSubjectId:'subject'} };
  const unrelated = { ...old, id:'other', snapshot:{globalSubjectId:'other'} };
  const historical = { ...old, snapshot:{globalSubjectId:'subject'} };
  let inserted;
  const pending = f.win.currentAssets.instantiateSubject('subject', null, files => {inserted=files;});
  await f.flush(() => f.mutations[0].resolve({ok:true,body:{assets:{schemaVersion:1,rev:2,folders:[],items:[historical,unrelated,added]}}}));
  assert.equal(await pending,true);
  assert.equal(inserted.length,1);
  assert.equal(inserted[0].id,'new');
  assert.equal(inserted[0].workspaceId,'A');
  assert.equal(inserted[0].relative_path,'subjects/subject/new.png');
  assert.equal(inserted[0].previewUrl,'/omnimux-workflow/api/workspaces/A/file?rel=subjects%2Fsubject%2Fnew.png');
});
test('subject response from old canvas never fires the insertion callback', async t => {
  const f=setup(t); await f.hooks('A');
  let called=false;
  const pending=f.win.currentAssets.instantiateSubject('subject',null,()=>{called=true;});
  await f.hooks('B');
  await f.flush(()=>f.mutations[0].resolve(assetsResponse(2,'late')));
  assert.equal(await pending,false);
  assert.equal(called,false);
});
