import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./useWorkspacePersistence.ts', import.meta.url))],
  bundle: true, write: false, format: 'iife', globalName: 'hooks', platform: 'node',
  plugins: [{ name: 'boundaries', setup(build) {
    build.onResolve({ filter: /^react$|\/canvasStore$|\/apiClient$/ }, ({ path }) => ({ path, namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === 'react'
      ? 'export const { useRef, useState, useCallback, useEffect } = env.react;'
      : path.endsWith('canvasStore') ? 'export const useCanvasStore = env.store;'
      : `export const saveWorkspace = (...args) => env.save(...args);
         export const getWorkspace = (...args) => env.get(...args);
         export const getWorkspaceVersion = (...args) => env.version(...args);`,
    }));
  } }],
});

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const workspace = (id, version) => ({ id, name: id, version,
  nodes: [{ id: `${id}-node`, type: 'text', position: { x: 0, y: 0 }, data: { prompt: id } }], edges: [],
});

function setup() {
  const slots = [], effects = [], listeners = new Set(), timers = new Map(), intervals = new Map();
  let cursor = 0, id = 0, selected = workspace('A', 3), controller;
  const state = { nodes: selected.nodes, edges: selected.edges,
    hydrateGraph(nodes, edges) { this.nodes = nodes; this.edges = edges; for (const fn of listeners) fn(); },
  };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
  const env = { calls: [], saved: [],
    react: {
      useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
      useState(value) {
        const index = cursor++; slots[index] ??= { value };
        return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
      },
      useCallback(fn, deps) {
        const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, fn };
        return slots[index].fn;
      },
      useEffect(fn, deps) {
        const index = cursor++;
        if (!same(slots[index]?.deps, deps)) effects.push(() => {
          slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() };
        });
      },
    },
    store: { getState: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } },
    save: async (wsId, payload) => {
      env.calls.push({ wsId, payload });
      return { ok: true, body: { workspace: { ...selected, ...payload, id: wsId, version: payload.expectedVersion + 1 } } };
    },
    get: async () => ({ ok: true, body: { workspace: selected } }),
    version: async () => ({ ok: true, body: { version: selected.version } }),
  };
  const context = vm.createContext({ env,
    setTimeout(fn, delay) { const key = ++id; timers.set(key, { fn, delay }); return key; },
    clearTimeout(key) { timers.delete(key); },
    setInterval(fn) { const key = ++id; intervals.set(key, fn); return key; },
    clearInterval(key) { intervals.delete(key); },
    window: { addEventListener() {}, removeEventListener() {} },
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  const render = () => {
    cursor = 0;
    controller = context.hooks.useWorkspacePersistence(selected, { enabled: Boolean(selected), onSaved: snapshot => env.saved.push(snapshot) });
    while (effects.length) effects.shift()();
    return controller;
  };
  render();
  return { env, state, render,
    get controller() { return controller; },
    switchTo(snapshot) { selected = snapshot; state.nodes = snapshot?.nodes ?? []; state.edges = snapshot?.edges ?? []; render(); },
    edit(prompt) { state.nodes = state.nodes.map(node => ({ ...node, data: { ...node.data, prompt } })); for (const fn of listeners) fn(); },
    autosave() { for (const [key, timer] of timers) if (timer.delay === 1000) { timers.delete(key); timer.fn(); } },
    poll() { for (const fn of intervals.values()) fn(); },
  };
}

for (const response of ['success', 'reject', 'error', '409']) {
  test(`late A PUT ${response} does not change B identity, dirty state or save version`, async () => {
    const h = setup(), pending = deferred(), save = h.env.save;
    h.env.save = () => pending.promise; h.edit('A edit'); h.autosave();
    h.switchTo(workspace('B', 20)); h.edit('B edit');
    const before = h.render(); assert.equal(before.status, 'pending'); assert.equal(before.isDirty, true);
    if (response === 'reject') pending.reject(new Error('late network failure'));
    else pending.resolve(response === 'success' ? { ok: true, body: { workspace: workspace('A', 4) } }
      : { ok: false, status: response === '409' ? 409 : 500, body: {} });
    await settle();
    const after = h.render(); assert.equal(after.status, 'pending'); assert.equal(after.isDirty, true);
    assert.equal(h.env.saved.length, 0); assert.equal(h.state.nodes[0].id, 'B-node');
    h.env.save = save; await h.controller.saveNow();
    assert.equal(h.env.calls[0].wsId, 'B'); assert.equal(h.env.calls[0].payload.expectedVersion, 20);
  });
}

test('A to B to A ignores the first A generation response', async () => {
  const h = setup(), pending = deferred(), save = h.env.save;
  h.env.save = () => pending.promise; h.edit('old A'); h.autosave();
  h.switchTo(workspace('B', 20)); h.switchTo(workspace('A', 30)); h.edit('new A');
  pending.resolve({ ok: true, body: { workspace: workspace('A', 4) } }); await settle();
  assert.equal(h.render().isDirty, true); assert.equal(h.env.saved.length, 0);
  h.env.save = save; await h.controller.saveNow();
  assert.equal(h.env.calls[0].payload.expectedVersion, 30);
  assert.equal(h.env.calls[0].payload.nodes[0].data.prompt, 'new A');
});

for (const response of ['success', 'reject', 'error']) {
  test(`late 409 GET ${response} cannot mark B as conflicted`, async () => {
    const h = setup(), pending = deferred(), save = h.env.save;
    h.env.save = async () => ({ ok: false, status: 409, body: {} });
    h.env.get = () => pending.promise; h.edit('A edit'); h.autosave(); await settle();
    h.switchTo(workspace('B', 20)); h.edit('B edit');
    if (response === 'reject') pending.reject(new Error('late GET failure'));
    else pending.resolve(response === 'success' ? { ok: true, body: { workspace: workspace('A', 8) } } : { ok: false, body: {} });
    await settle(); assert.equal(h.render().status, 'pending'); assert.equal(h.controller.isDirty, true);
    h.env.save = save; await h.controller.saveNow();
    assert.equal(h.env.calls[0].wsId, 'B'); assert.equal(h.env.calls[0].payload.expectedVersion, 20);
  });
}

test('late poll version does not request or reconcile the new workspace', async () => {
  const h = setup(), pending = deferred(); let gets = 0;
  h.env.version = () => pending.promise; h.env.get = async () => { gets++; return { ok: false, body: {} }; };
  h.poll(); h.switchTo(workspace('B', 20)); h.edit('B edit');
  pending.resolve({ ok: true, body: { version: 99 } }); await settle();
  assert.equal(gets, 0); assert.equal(h.render().status, 'pending');
});

test('late explicit reload cannot hydrate or reset dirty state in B', async () => {
  const h = setup(), pending = deferred(); h.env.get = () => pending.promise;
  const reload = h.controller.reloadFromServer();
  h.switchTo(workspace('B', 20)); h.edit('B edit');
  pending.resolve({ ok: true, body: { workspace: workspace('A', 9) } }); await reload;
  assert.equal(h.state.nodes[0].id, 'B-node'); assert.equal(h.render().isDirty, true);
  assert.equal(h.env.saved.length, 0);
});

test('App saved callback retains B boot identity after a late A snapshot', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const callback = app.slice(app.indexOf('const handleSaved'), app.indexOf('// hydrate 完成'));
  const update = callback.slice(callback.indexOf('setBoot(') + 'setBoot('.length, callback.indexOf(');', callback.indexOf('setBoot(')));
  const apply = vm.runInNewContext(update, { snapshot: workspace('A', 4) });
  const bootB = { phase: 'ready', workspace: workspace('B', 20) };
  assert.equal(apply(bootB), bootB);
});

for (const response of ['error', 'reject']) test(`late reload ${response} cannot change B status`, async () => {
  const h = setup(), pending = deferred(); h.env.get = () => pending.promise;
  const reload = h.controller.reloadFromServer(); h.switchTo(workspace('B', 20)); h.edit('B edit');
  if (response === 'reject') pending.reject(new Error('late reload'));
  else pending.resolve({ ok: false, body: {} });
  await reload;
  assert.equal(h.render().status, 'pending'); assert.equal(h.controller.isDirty, true);
});

test('B can save before A finishes and retains its saved version after the late response', async () => {
  const h = setup(), pending = deferred(), save = h.env.save;
  h.env.save = () => pending.promise; h.edit('A edit'); h.autosave();
  h.switchTo(workspace('B', 20)); h.env.save = save; h.edit('B edit');
  assert.equal(await h.controller.saveNow(), 21);
  pending.resolve({ ok: true, body: { workspace: workspace('A', 4) } }); await settle();
  assert.equal(h.render().status, 'saved'); assert.equal(h.controller.isDirty, false);
  assert.deepEqual(h.env.saved.map(snapshot => snapshot.id), ['B']);
  h.edit('B again'); await h.controller.saveNow();
  assert.equal(h.env.calls[1].wsId, 'B'); assert.equal(h.env.calls[1].payload.expectedVersion, 21);
});

for (const queueAutosave of [false, true]) test(`captured trailing flush saves A after switch with its own version${queueAutosave ? ' across a skipped autosave' : ''}`, async () => {
  const h = setup(), pending = deferred(), save = h.env.save;
  h.env.save = (wsId, payload) => { h.env.calls.push({ wsId, payload }); return pending.promise; };
  h.edit('A older'); h.autosave();
  if (queueAutosave) { h.edit('A middle'); h.autosave(); }
  h.edit('A latest'); h.controller.flushPendingSave();
  h.switchTo(workspace('B', 20)); h.edit('B local'); h.env.save = save;
  pending.resolve({ ok: true, body: { workspace: workspace('A', 4) } }); await settle();
  assert.equal(h.env.calls.length, 2);
  assert.equal(h.env.calls[1].wsId, 'A');
  assert.equal(h.env.calls[1].payload.expectedVersion, 4);
  assert.equal(h.env.calls[1].payload.nodes[0].data.prompt, 'A latest');
  assert.equal(h.render().status, 'pending'); assert.equal(h.controller.isDirty, true);
  assert.equal(h.env.saved.length, 0);
  await h.controller.saveNow();
  assert.equal(h.env.calls[2].wsId, 'B'); assert.equal(h.env.calls[2].payload.expectedVersion, 20);
});

for (const failure of ['409', '500', 'reject']) test(`detached flush does not continue after prior PUT ${failure}`, async () => {
  const h = setup(), pending = deferred(), save = h.env.save;
  h.env.save = (wsId, payload) => { h.env.calls.push({ wsId, payload }); return pending.promise; };
  h.edit('A older'); h.autosave(); h.edit('A latest'); h.controller.flushPendingSave();
  h.switchTo(workspace('B', 20)); h.edit('B local'); h.env.save = save;
  if (failure === 'reject') pending.reject(new Error('save failed'));
  else pending.resolve({ ok: false, status: Number(failure), body: {} });
  await settle();
  assert.equal(h.env.calls.length, 1); assert.equal(h.env.saved.length, 0);
  assert.equal(h.render().status, 'pending'); assert.equal(h.controller.isDirty, true);
});

test('detached flush 409 blocks the rest of the captured flush queue', async () => {
  const h = setup(), pending = deferred();
  h.env.save = (wsId, payload) => { h.env.calls.push({ wsId, payload }); return pending.promise; };
  h.edit('A older'); h.autosave();
  h.edit('A middle'); h.controller.flushPendingSave();
  h.edit('A latest'); h.controller.flushPendingSave();
  h.switchTo(workspace('B', 20)); h.edit('B local');
  h.env.save = async (wsId, payload) => {
    h.env.calls.push({ wsId, payload }); return { ok: false, status: 409, body: {} };
  };
  pending.resolve({ ok: true, body: { workspace: workspace('A', 4) } }); await settle();
  assert.equal(h.env.calls.length, 2); assert.equal(h.env.calls[1].payload.expectedVersion, 4);
  assert.equal(h.render().status, 'pending'); assert.equal(h.env.saved.length, 0);
});

test('old A flush never borrows version from a later A visit', async () => {
  const h = setup(), pending = deferred();
  h.env.save = (wsId, payload) => { h.env.calls.push({ wsId, payload }); return pending.promise; };
  h.edit('old A'); h.autosave(); h.edit('old A latest'); h.controller.flushPendingSave();
  h.switchTo(workspace('B', 20)); h.switchTo(workspace('A', 30)); h.edit('new A edit');
  h.env.save = async (wsId, payload) => {
    h.env.calls.push({ wsId, payload });
    return { ok: false, status: 409, body: {} };
  };
  pending.resolve({ ok: true, body: { workspace: workspace('A', 4) } }); await settle();
  assert.equal(h.env.calls[1].payload.expectedVersion, 4);
  assert.equal(h.state.nodes[0].data.prompt, 'new A edit');
  assert.equal(h.render().status, 'pending'); assert.equal(h.controller.isDirty, true);
});

test('late A finally does not release the B in-flight save guard', async () => {
  const h = setup(), pendingA = deferred(), pendingB = deferred();
  h.env.save = (wsId, payload) => {
    h.env.calls.push({ wsId, payload });
    return wsId === 'A' ? pendingA.promise : pendingB.promise;
  };
  h.edit('A edit'); h.autosave();
  h.switchTo(workspace('B', 20)); h.edit('B edit'); h.autosave();
  pendingA.resolve({ ok: true, body: { workspace: workspace('A', 4) } }); await settle();
  h.edit('B trailing'); h.autosave(); await settle();
  assert.equal(h.env.calls.length, 2, 'B keeps the original single-save-in-flight behavior');
  pendingB.resolve({ ok: true, body: { workspace: workspace('B', 21) } }); await settle();
});
