import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const requireHub = createRequire(new URL('../../../omnimux/package.json', import.meta.url));
const { JSDOM } = requireHub('jsdom');
const bundle = await build({
  stdin: { contents: `export { CanvasBridge } from './CanvasBridge.jsx';
    export * as island from '../canvas/index.tsx';
    export { useCanvasStore } from '../canvas/store/canvasStore';
    export { createElement, act } from 'react';
    export { createRoot } from 'react-dom/client';`,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', globalName: 'testApi', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'non-lifecycle-boundaries', setup(build) {
    build.onResolve({ filter: /^dsh-ui-kit$|\/apiClient(?:\.ts)?$|^\.\/api\.js$|^\.\/styles\.js$|\/injectStyles$|\/CanvasEditor$|\/useExecutionController$|\/useTablePersistence$|\/useModelParameterSchema$|^\.\/i18n$/ },
      ({ path, importer }) => {
        if ((path === './api.js' || path === './styles.js') && !importer.endsWith('/CanvasBridge.jsx')) return;
        return { path, namespace: 'test' };
      });
    build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ loader: 'js', contents:
      path === 'dsh-ui-kit' ? 'export const Button = () => null;'
      : path === './api.js' ? 'export const fetchCanvasHash = () => window.fixture.hash();'
      : path === './styles.js' ? 'export const injectWorkflowStyles = () => {};'
      : path.endsWith('/injectStyles') ? 'export const injectCanvasStyles = () => {};'
      : path.endsWith('/CanvasEditor') ? 'export default function CanvasEditor() { return null; }'
      : path.endsWith('/useExecutionController') ? 'export const useExecutionController = () => ({});'
      : path.endsWith('/useTablePersistence') ? 'export const useTablePersistence = () => ({ saveNow: async () => {} });'
      : path.endsWith('/useModelParameterSchema') ? `export const getCachedCatalog = () => null;
        export const getCachedFingerprint = () => null; export const invalidateCachedCatalog = () => {};
        export const setCachedCatalog = () => {}; export const shouldReplaceCatalogCache = () => true;`
      : path === './i18n' ? `export const setLocale = () => {}; export const useT = () => key => key;`
      : `export const getWorkspaceTable = async () => ({ ok: false, body: {} });
        export const getWorkspace = id => window.fixture.get(id);
        export const createWorkspace = (_name, id) => window.fixture.get(id);
        export const saveWorkspace = (id, payload) => window.fixture.save(id, payload);
        export const getWorkspaceVersion = id => Promise.resolve({ ok: true, body: { version: window.fixture.docs[id].version } });
        export const fetchCapabilities = async () => ({ ok: true, body: { text: [], image: [], video: [], audio: [], fingerprint: 'test' } });
        export const probeLocalFiles = async () => ({ ok: true, body: { items: [] } });
        export const fetchGenerationPreferences = async () => ({ ok: true, body: { lastModelByType: {} } });
        export const saveGenerationPreference = fetchGenerationPreferences;`,
    }));
  } }],
});

function setup() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost', runScripts: 'outside-only' });
  const win = dom.window;
  win.IS_REACT_ACT_ENVIRONMENT = true;
  win.MessageChannel = class {
    port1 = { onmessage: null };
    port2 = { postMessage: () => setImmediate(() => this.port1.onmessage?.()) };
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const timers = new Map(); let timerId = 10000;
  const realTimeout = win.setTimeout.bind(win), realClear = win.clearTimeout.bind(win);
  win.setTimeout = (fn, delay, ...args) => {
    if (delay !== 1000 && delay !== 2500) return realTimeout(fn, delay, ...args);
    const id = ++timerId; timers.set(id, { fn, delay }); return id;
  };
  win.clearTimeout = id => { timers.delete(id); realClear(id); };
  const docs = Object.fromEntries(['C', 'D'].map(id => [id, { id, name: id, version: 0, nodes: [], edges: [] }]));
  const writes = [];
  win.fixture = { docs, hash: async () => 'fixture',
    get: async id => ({ ok: true, body: { workspace: clone(docs[id]) } }),
    save: async (id, payload) => {
      writes.push({ id, payload: clone(payload) });
      docs[id] = { ...docs[id], ...clone(payload), version: docs[id].version + 1 };
      return { ok: true, body: { workspace: clone(docs[id]) } };
    },
  };
  win.eval(bundle.outputFiles[0].text);
  const api = win.testApi;
  const islandContainers = new Set();
  win.__omnimuxWorkflowCanvas = {
    ...api.island,
    mountCanvas(el, props) { islandContainers.add(el); api.island.mountCanvas(el, props); },
    unmountCanvas(el) { islandContainers.delete(el); api.island.unmountCanvas(el); },
  };
  const script = win.document.createElement('script'); script.id = 'omnimux-workflow-canvas-island';
  script.src = '/omnimux-workflow/canvas.js?v=fixture'; script.dataset.loaded = '1'; win.document.head.append(script);
  const flush = async fn => api.act(async () => { fn?.(); for (let i = 0; i < 20; i++) await Promise.resolve(); });
  const roots = new Set();
  return { dom, win, api, docs, writes, flush,
    async mount(id) {
      const el = win.document.createElement('div'); win.document.body.append(el);
      const root = api.createRoot(el); roots.add(root);
      await flush(() => root.render(api.createElement(api.CanvasBridge, { workspaceId: id, t: key => key })));
      return { el, root, async unmount() { await flush(() => root.unmount()); roots.delete(root); el.remove(); } };
    },
    async editAndSave(id) {
      await flush(() => api.useCanvasStore.getState().setNodes([{ id: `${id}-node`, type: 'text', position: { x: 0, y: 0 }, data: { prompt: id } }]));
      await flush(() => { for (const [id, timer] of timers) if (timer.delay === 1000) { timers.delete(id); timer.fn(); } });
    },
    async close() {
      await flush(() => { for (const root of roots) root.unmount(); });
      // Teardown also releases a leaked island when testing a broken Bridge.
      await flush(() => { for (const el of islandContainers) api.island.unmountCanvas(el); });
      dom.window.close();
    },
  };
}

test('detached bridge unmounts its real App and store subscriptions before the next project', async () => {
  const h = setup();
  try {
    const c = await h.mount('C'); await h.editAndSave('C');
    assert.equal(h.docs.C.nodes[0].id, 'C-node');
    const oldIsland = c.el.querySelector('.omnimux-workflow-canvas-root');
    await c.unmount();
    await h.mount('D'); await h.editAndSave('D');
    assert.equal(h.docs.D.nodes[0].id, 'D-node');
    assert.equal(h.docs.C.nodes[0].id, 'C-node');
    assert.equal(Boolean(oldIsland.querySelector('.wf-canvas-root')), false, 'detached container must release the island root');
    assert.equal(h.writes.filter(row => row.id === 'C' && row.payload.nodes.some(node => node.id === 'D-node')).length, 0);
  } finally { await h.close(); }
});

test('cleanup uses the API that mounted the island even if the global bundle was replaced', async () => {
  const h = setup();
  try {
    const c = await h.mount('C'); const oldIsland = c.el.querySelector('.omnimux-workflow-canvas-root');
    let wrongApiCalls = 0;
    h.win.__omnimuxWorkflowCanvas = { unmountCanvas() { wrongApiCalls++; } };
    await c.unmount();
    assert.equal(wrongApiCalls, 0); assert.equal(Boolean(oldIsland.querySelector('.wf-canvas-root')), false);
  } finally { await h.close(); }
});

test('late manifest loading cannot mount after the bridge lifetime ended', async () => {
  const h = setup();
  try {
    let resolveHash; h.win.fixture.hash = () => new Promise(resolve => { resolveHash = resolve; });
    let mounts = 0;
    h.win.__omnimuxWorkflowCanvas = { mountCanvas() { mounts++; } };
    const c = await h.mount('C'); await c.unmount();
    await h.flush(() => resolveHash('fixture'));
    assert.equal(mounts, 0);
  } finally { await h.close(); }
});
