import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./useCanvasBoot.ts', import.meta.url))],
  bundle: true, write: false, format: 'iife', globalName: 'hooks', platform: 'node',
  plugins: [{ name: 'boot-boundaries', setup(build) {
    build.onResolve({ filter: /^react$|\/canvasStore$|\/generationPreferencesStore$|\/apiClient$|\/i18n$|useModelParameterSchema$|\/tableDocumentCache$/ },
      ({ path }) => ({ path, namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents:
      path === 'react' ? `export const useRef = value => ({ current: value });
        export const useState = value => [typeof value === 'function' ? value() : value, () => {}];
        export const useEffect = effect => { env.cleanups.push(effect()); };`
      : path.endsWith('canvasStore') ? 'export const useCanvasStore = env.store;'
      : path.endsWith('generationPreferencesStore') ? 'export const loadGenerationPreferences = async () => { env.preferencesLoads++; };'
      : path.endsWith('i18n') ? 'export const t = key => key;'
      : path.endsWith('tableDocumentCache') ? 'export const tableDocumentCache = { resetAll: () => env.resets++ };'
      : path.endsWith('useModelParameterSchema') ? `export const getCachedCatalog = () => null;
        export const getCachedFingerprint = () => null; export const invalidateCachedCatalog = () => {};
        export const setCachedCatalog = body => { env.catalog = body; };
        export const shouldReplaceCatalogCache = () => true;`
      : `export const getWorkspace = id => env.load(id);
        export const createWorkspace = () => { throw new Error('unexpected create'); };
        export const fetchCapabilities = () => env.capabilities();
        export const probeLocalFiles = () => env.probe();`,
    }));
  } }],
});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const node = id => ({ id, type: 'text', position: { x: 0, y: 0 }, data: {} });

for (const boundary of ['load', 'probe']) test(`retired boot ignores delayed A ${boundary} and catalog after B hydrates`, async () => {
  const pending = deferred(), catalog = deferred();
  const canvas = {
    nodes: [], edges: [],
    hydrateGraph(nodes, edges) { canvas.nodes = nodes; canvas.edges = edges; },
    resetStore() { canvas.nodes = []; canvas.edges = []; },
    setNodes(nodes) { canvas.nodes = nodes; },
    setCatalogRuntime(body) { canvas.catalog = body; },
  };
  const aNode = boundary === 'probe'
    ? { ...node('A'), type: 'image', data: { url: 'file:///tmp/a.png', realPath: '/tmp/a.png' } }
    : node('A');
  const workspace = id => ({ ok: true, body: { workspace: { id, version: 1, nodes: [id === 'A' ? aNode : node(id)], edges: [] } } });
  const store = selector => selector(canvas); store.getState = () => canvas;
  const env = { store, cleanups: [], resets: 0, preferencesLoads: 0, probes: 0,
    load: id => id === 'A' && boundary === 'load' ? pending.promise : Promise.resolve(workspace(id)),
    capabilities: () => catalog.promise,
    probe: () => { env.probes++; return pending.promise; },
  };
  const ctx = vm.createContext({ env, window: { addEventListener() {}, removeEventListener() {} } });
  vm.runInContext(bundle.outputFiles[0].text, ctx);
  let captured;
  ctx.hooks.useCanvasBoot({ workspaceId: 'A', beforeReset: () => { captured = canvas.nodes.map(n => n.id); } });
  await settle();
  env.cleanups.shift()();
  env.capabilities = async () => ({ ok: true, body: { fingerprint: 'B', text: [], image: [], video: [], audio: [] } });
  ctx.hooks.useCanvasBoot({ workspaceId: 'B' }); await settle();
  pending.resolve(boundary === 'load' ? workspace('A') : { ok: true, body: { items: [] } });
  catalog.resolve({ ok: true, body: { fingerprint: 'A', text: [], image: [], video: [], audio: [] } });
  await settle();
  assert.equal(canvas.nodes[0].id, 'B');
  assert.equal(canvas.catalog.fingerprint, 'B');
  assert.equal(env.catalog.fingerprint, 'B');
  assert.equal(env.preferencesLoads, 2);
  if (boundary === 'probe') {
    assert.equal(env.probes, 1);
    assert.deepEqual(captured, ['A']);
  }
  for (const cleanup of env.cleanups) cleanup();
});
