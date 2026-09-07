import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Exercise the real hooks with deterministic effects, stores and transport.
// No DOM or network is needed for the persistence/submission boundary.
const bundle = await build({
  stdin: {
    contents: `export { useWorkspacePersistence } from './useWorkspacePersistence';
      export { useExecutionController } from '../hooks/useExecutionController';`,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    loader: 'ts',
  },
  bundle: true, write: false, format: 'iife', globalName: 'hooks', platform: 'node',
  plugins: [{ name: 'hook-boundaries', setup(build) {
    build.onResolve({ filter: /^(react)$|\/canvasStore$|\/executionStore$|\/apiClient$|\/i18n$/ },
      ({ path }) => ({ path, namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents:
      path === 'react' ? `export const useRef = value => ({ current: value });
        export const useState = value => [value, () => {}];
        export const useCallback = callback => callback;
        export const useEffect = effect => { const cleanup = effect(); if (cleanup) env.cleanups.push(cleanup); };`
      : path.endsWith('canvasStore') ? 'export const useCanvasStore = env.canvasStore;'
      : path.endsWith('executionStore') ? 'export const useExecutionStore = env.executionStore;'
      : path.endsWith('i18n') ? 'export const t = key => key;'
      : `export const saveWorkspace = (...args) => env.save(...args);
        export const getWorkspace = () => Promise.resolve({ ok: true, body: { workspace: env.remote } });
        export const getWorkspaceVersion = () => Promise.resolve({ ok: true, body: { version: env.remote.version } });
        export const createExecution = (...args) => env.create(...args);
        export const listExecutions = () => Promise.resolve({ ok: true, body: { executions: [] } });
        export const getExecution = () => Promise.resolve({ ok: false });
        export const executionAction = () => Promise.resolve({ ok: true });`,
    }));
  } }],
});

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function setup({ legacy = false } = {}) {
  const node = prompt => ({ id: 'n1', type: 'text', position: { x: 0, y: 0 }, data: { prompt } });
  const remote = { id: 'ws', name: 'Canvas', version: 7, nodes: [node('initial')], edges: [] };
  const listeners = new Set();
  const timers = new Map();
  let timerId = 0;
  const canvas = { nodes: remote.nodes, edges: [],
    setNodes(update) { this.nodes = update(this.nodes); for (const fn of listeners) fn(); },
    hydrateGraph(nodes, edges) { this.nodes = nodes; this.edges = edges; },
  };
  const exec = { status: 'idle', nodeStatuses: {}, progress: {},
    setExecution(patch) { Object.assign(this, patch); },
    resetExecution() { this.status = 'idle'; this.error = null; this.nodeStatuses = {}; },
    setNodeStatus(id, state) { this.nodeStatuses[id] = state; },
    setStartNodeExecution() {},
  };
  const env = { remote, cleanups: [], saves: [], creates: [],
    canvasStore: { getState: () => canvas, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } },
    executionStore: { getState: () => exec },
    save: async (_id, payload) => {
      env.saves.push(payload);
      env.remote = { ...remote, ...payload, version: env.remote.version + 1 };
      return { ok: true, body: { workspace: env.remote } };
    },
    create: async (id, payload) => { env.creates.push({ id, payload }); return { ok: true, body: { execution: { id: 'run' } } }; },
  };
  const context = vm.createContext({ env,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() { return 0; }, clearInterval() {},
    window: { addEventListener() {}, removeEventListener() {} },
    EventSource: class { addEventListener() {} close() {} },
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  const persistence = context.hooks.useWorkspacePersistence(remote);
  const controller = context.hooks.useExecutionController('ws', legacy ? undefined : { onBeforeStart: persistence.saveNow });
  return { env, canvas, exec, persistence, controller,
    edit(prompt) { canvas.setNodes(() => [node(prompt)]); },
    autosave() { for (const [id, timer] of timers) if (timer.delay === 1000) { timers.delete(id); timer.fn(); } },
  };
}

const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('save failure prevents execution and does not leave the node pending', async () => {
  const h = setup(); h.edit('1dog');
  h.env.save = async () => ({ ok: false, status: 500, body: { message: 'disk full' } });
  await h.controller.startExecution({ mode: 'single', nodeIds: ['n1'] });
  assert.equal(h.env.creates.length, 0);
  assert.equal(h.exec.error, 'disk full');
  assert.equal(h.exec.nodeStatuses.n1, undefined);
  assert.equal(h.canvas.nodes[0].data.executionStatus, undefined);
});

test('unchanged graph submits its saved version', async () => {
  const h = setup();
  await h.controller.startExecution();
  assert.equal(h.env.saves.length, 0);
  assert.equal(h.env.creates[0].payload.expectedVersion, 7);
});

test('execution waits for in-flight autosave and sends its returned version', async () => {
  const h = setup(); h.edit('1dog');
  const pending = deferred();
  h.env.save = () => pending.promise;
  h.autosave();
  const start = h.controller.startExecution(); await settle();
  assert.equal(h.env.creates.length, 0);
  pending.resolve({ ok: true, body: { workspace: { ...h.env.remote, nodes: h.canvas.nodes, version: 8 } } });
  await start;
  assert.equal(h.env.creates[0].payload.expectedVersion, 8);
});

test('newer click snapshot saves after older in-flight autosave', async () => {
  const h = setup(); h.edit('older');
  const pending = deferred(); const normalSave = h.env.save;
  h.env.save = () => pending.promise; h.autosave(); h.edit('1dog');
  const start = h.controller.startExecution(); await settle();
  h.env.save = normalSave;
  pending.resolve({ ok: true, body: { workspace: { ...h.env.remote, version: 8 } } });
  await start;
  assert.equal(h.env.saves.length, 1);
  assert.equal(h.env.saves[0].nodes[0].data.prompt, '1dog');
  assert.equal(h.env.saves[0].expectedVersion, 8);
  assert.equal(h.env.creates.length, 1);
});

for (const inFlight of [false, true]) test(`edit while ${inFlight ? 'autosave is pending' : 'preflight saves'} prevents stale request`, async () => {
  const h = setup(); h.edit('1dog');
  const pending = deferred(); h.env.save = () => pending.promise;
  if (inFlight) h.autosave();
  const start = h.controller.startExecution(); await settle();
  h.edit('2cats');
  pending.resolve({ ok: true, body: { workspace: { ...h.env.remote, version: 8 } } });
  await start;
  assert.equal(h.env.creates.length, 0);
  assert.match(h.exec.error, /输入已变化/);
  assert.equal(h.canvas.nodes[0].data.prompt, '2cats');
});

test('409 blocks this click even if conflict recovery adopts the same graph', async () => {
  const h = setup(); h.edit('1dog');
  h.env.remote = { ...h.env.remote, nodes: h.canvas.nodes, version: 9 };
  h.env.save = async () => ({ ok: false, status: 409, body: {} });
  await h.controller.startExecution();
  assert.equal(h.env.creates.length, 0);
  assert.match(h.exec.error, /版本冲突/);
});

test('existing live execution is preserved without saving or creating another run', async () => {
  const h = setup(); h.exec.status = 'running'; h.exec.executionId = 'existing';
  await h.controller.startExecution();
  assert.equal(h.env.saves.length, 0); assert.equal(h.env.creates.length, 0);
  assert.equal(h.exec.status, 'running'); assert.equal(h.exec.executionId, 'existing');
});

test('concurrent clicks share one preflight and one execution request', async () => {
  const h = setup(); h.edit('1dog'); const pending = deferred(); h.env.save = () => pending.promise;
  const first = h.controller.startExecution(); const second = h.controller.startExecution();
  pending.resolve({ ok: true, body: { workspace: { ...h.env.remote, version: 8 } } });
  await Promise.all([first, second]);
  assert.equal(h.env.creates.length, 1);
});

test('unmount while saving prevents execution but retains the captured flush', async () => {
  const h = setup(); h.edit('1dog'); const pending = deferred(); h.env.save = () => pending.promise;
  const start = h.controller.startExecution(); await settle();
  for (const cleanup of h.env.cleanups) cleanup();
  pending.resolve({ ok: true, body: { workspace: { ...h.env.remote, version: 8 } } });
  await start; assert.equal(h.env.creates.length, 0);
});


test('legacy caller without save hook omits expectedVersion', async () => {
  const h = setup({ legacy: true });
  await h.controller.startExecution();
  assert.equal(h.env.creates.length, 1);
  assert.equal('expectedVersion' in h.env.creates[0].payload, false);
});

test('creation failure leaves no fake pending node', async () => {
  const h = setup();
  h.env.create = async () => ({ ok: false, body: { message: 'version conflict' } });
  await h.controller.startExecution({ mode: 'single', nodeIds: ['n1'] });
  assert.equal(h.exec.error, 'version conflict');
  assert.equal(h.exec.nodeStatuses.n1, undefined);
  assert.equal(h.canvas.nodes[0].data.executionStatus, undefined);
});

test('in-flight autosave failure blocks submission', async () => {
  const h = setup(); h.edit('1dog');
  const pending = deferred(); h.env.save = () => pending.promise; h.autosave();
  const start = h.controller.startExecution();
  pending.resolve({ ok: false, status: 500, body: { message: 'disk full' } });
  await start;
  assert.equal(h.env.creates.length, 0);
  assert.equal(h.exec.error, 'disk full');
});

test('late conflict response preserves edits made while saving', async () => {
  const h = setup(); h.edit('1dog');
  const pending = deferred(); h.env.save = () => pending.promise;
  const start = h.controller.startExecution(); await settle();
  h.edit('2cats');
  h.env.remote = { ...h.env.remote, version: 10 };
  pending.resolve({ ok: false, status: 409, body: {} });
  await start;
  assert.equal(h.env.creates.length, 0);
  assert.equal(h.canvas.nodes[0].data.prompt, '2cats');
});

test('autosave queued during an in-flight PUT saves the trailing edit once', async () => {
  const h = setup(); h.edit('first'); const pending = deferred(); const save = h.env.save;
  h.env.save = () => pending.promise; h.autosave();
  h.edit('second'); h.autosave(); h.env.save = save;
  pending.resolve({ ok: true, body: { workspace: { ...h.env.remote, version: 8 } } });
  await settle();
  assert.equal(h.env.saves.length, 1);
  assert.equal(h.env.saves[0].nodes[0].data.prompt, 'second');
  assert.equal(h.env.saves[0].expectedVersion, 8);
});

async function queueConflict(h) {
  h.edit('first');
  const pending = deferred();
  const save = h.env.save;
  h.env.save = (_id, payload) => { h.env.saves.push(payload); return pending.promise; };
  h.autosave();
  h.edit('trailing'); h.autosave();
  h.env.remote = { ...h.env.remote, version: 12,
    nodes: h.env.remote.nodes.map(node => ({ ...node, data: { prompt: 'remote edit' } })),
  };
  h.env.save = save;
  pending.resolve({ ok: false, status: 409, body: {} });
  await settle();
}

test('divergent 409 blocks queued and future autosaves and flush until explicit resolution', async () => {
  const h = setup();
  await queueConflict(h);
  assert.equal(h.env.saves.length, 1, 'queued trailing autosave must not PUT');
  h.edit('later edit'); h.autosave(); await settle();
  h.persistence.flushPendingSave(); await settle();
  await assert.rejects(h.persistence.saveNow(), /版本冲突/);
  assert.equal(h.env.saves.length, 1, 'new edits and flush must not bypass conflict');
  assert.equal(h.env.remote.nodes[0].data.prompt, 'remote edit');
  await h.persistence.resolveConflict();
  assert.equal(h.env.saves.length, 2);
  assert.equal(h.env.saves[1].expectedVersion, 12);
  assert.equal(h.env.saves[1].nodes[0].data.prompt, 'later edit');
  h.edit('after resolution'); h.autosave(); await settle();
  assert.equal(h.env.saves.length, 3);
});

test('failed explicit resolution retains the persistent conflict barrier', async () => {
  const h = setup(); await queueConflict(h);
  h.env.save = async (_id, payload) => {
    h.env.saves.push(payload);
    return { ok: false, status: 500, body: { message: 'disk full' } };
  };
  await h.persistence.resolveConflict();
  h.edit('later'); h.autosave(); await settle();
  assert.equal(h.env.saves.length, 2);
  await assert.rejects(h.persistence.saveNow(), /版本冲突/);
});

test('explicit reload releases conflict and next edit saves against the remote version', async () => {
  const h = setup(); await queueConflict(h);
  await h.persistence.reloadFromServer();
  assert.equal(h.canvas.nodes[0].data.prompt, 'remote edit');
  h.edit('after reload'); h.autosave(); await settle();
  assert.equal(h.env.saves.length, 2);
  assert.equal(h.env.saves[1].expectedVersion, 12);
});

test('leaving A queues its final capture behind A PUT and ignores its late response in B', async () => {
  const h = setup();
  h.edit('A first');
  const pending = deferred();
  const writes = [];
  h.env.save = (id, payload) => { writes.push({ id, payload }); return pending.promise; };
  h.autosave();
  h.edit('A final');
  h.persistence.flushPendingSave();
  for (const cleanup of h.env.cleanups) cleanup();
  h.canvas.hydrateGraph([{ id: 'B', type: 'text', data: { prompt: 'B unchanged' } }], []);
  h.env.save = async (id, payload) => {
    writes.push({ id, payload });
    return { ok: true, body: { workspace: { ...h.env.remote, ...payload, version: 9 } } };
  };
  pending.resolve({ ok: true, body: { workspace: { ...h.env.remote, version: 8 } } });
  await settle();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].id, 'ws');
  assert.equal(writes[1].payload.nodes[0].data.prompt, 'A final');
  assert.equal(writes[1].payload.expectedVersion, 8);
  assert.equal(h.canvas.nodes[0].data.prompt, 'B unchanged');
});
