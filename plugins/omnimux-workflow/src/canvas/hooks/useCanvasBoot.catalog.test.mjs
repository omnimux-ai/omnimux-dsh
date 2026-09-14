/**
 * Catalog fingerprint refresh (#413): always fetch on boot; replace cache
 * when fingerprint changes. Pure function + boot source contract.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { sortCatalogRows } from '../../shared/sortCatalog.ts';
import { fileURLToPath } from 'node:url';
import { shouldReplaceCatalogCache } from '../editor/hooks/catalogCache.ts';

const here = dirname(fileURLToPath(import.meta.url));
const bootSrc = readFileSync(join(here, 'useCanvasBoot.ts'), 'utf8');

// Execute the production hook and cache bodies, replacing only React/IO seams.
function executable(source) {
  return stripTypeScriptTypes(source).replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?/gm, '')
    .replace(/^export \{[^}]*\};?/gm, '').replace(/\bexport /g, '');
}
const stale = { source: 'omnimux', fingerprint: 'same',
  models: [{ id: 'old', operations: [{ id: 'generate', listed: true, output: { type: 'text' } }] }],
  text: [{ id: 'old', name: 'Old' }], image: [], video: [], audio: [] };
function harness(initialCache = stale) {
  const values = new Map();
  const listeners = new Map();
  let writes = 0;
  const window = {
    localStorage: { getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { writes++; values.set(key, value); }, removeItem: (key) => values.delete(key) },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name),
  };
  const cache = runInNewContext(executable(readFileSync(join(here, '../editor/hooks/useModelParameterSchema.ts'), 'utf8'))
    + '\n({getCachedCatalog, getCachedFingerprint, setCachedCatalog, invalidateCachedCatalog, useModelParameterSchema})',
    { window, shouldReplaceCatalogCache, useMemo: (fn) => fn() });
  if (initialCache) cache.setCachedCatalog(initialCache);
  const states = [];
  const requests = [];
  const graph = { nodes: [{ id: 'saved', data: { model: 'old', prompt: 'keep' } }], edges: [{ id: 'edge' }] };
  const store = { ...graph, catalog: stale, hydrateGraph: () => {}, resetStore: () => {},
    setCatalogRuntime: (value) => { store.catalog = value; } };
  const useCanvasStore = (select) => select(store);
  useCanvasStore.getState = () => store;
  let effect;
  const useCanvasBoot = runInNewContext(executable(bootSrc) + '\nuseCanvasBoot', {
    window, ...cache, shouldReplaceCatalogCache, sortCatalogRows, useCanvasStore,
    tableDocumentCache: { resetAll: () => {} },
    useState: (initial) => { const index = states.length; states.push(typeof initial === 'function' ? initial() : initial);
      return [states[index], (value) => { states[index] = value; }]; },
    useRef: (current) => ({ current }), useEffect: (fn) => { effect = fn; },
    fetchCapabilities: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
  });
  const initial = useCanvasBoot();
  const cleanup = effect();
  return { initial, states, store, cache, graph, requests, cleanup, writes: () => writes,
    refresh: () => listeners.get('omnimux:model-catalog-updated')() };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
function assertUnavailable(catalog) {
  assert.ok(catalog, 'explicit empty catalog must block nullish cache fallback');
  for (const type of ['text', 'image', 'video', 'audio']) assert.equal(catalog[type].length, 0, type);
}

test('production boot: cached rows are unavailable before current fetch succeeds', () => {
  const h = harness();
  assertUnavailable(h.initial.catalog);
  assertUnavailable(h.states[1]);
  assertUnavailable(h.store.catalog);
  assert.strictEqual(h.store.nodes, h.graph.nodes);
  assert.strictEqual(h.store.edges, h.graph.edges);
});

test('production boot: failed response clears runtime and persisted fallback', async () => {
  const h = harness();
  h.requests[0].resolve({ ok: false, body: { message: 'offline' } });
  await flush();
  assertUnavailable(h.states[1]);
  assertUnavailable(h.store.catalog);
  assert.equal(h.cache.getCachedCatalog(), null);
  assert.strictEqual(h.store.nodes, h.graph.nodes);
  assert.strictEqual(h.store.edges, h.graph.edges);
});

test('production boot: rejected fetch clears cache and supports a later successful refresh', async () => {
  const h = harness();
  h.requests[0].reject(new Error('offline'));
  await flush();
  assertUnavailable(h.states[1]);
  assertUnavailable(h.store.catalog);
  assert.equal(h.cache.getCachedCatalog(), null);
  h.refresh();
  const fresh = { ...stale, fingerprint: 'new', text: [{ id: 'new', name: 'New' }] };
  h.requests[1].resolve({ ok: true, body: fresh });
  await flush();
  assert.equal(h.states[1].text[0].id, 'new');
  assert.equal(h.cache.getCachedCatalog().text[0].id, 'new');
  assert.equal(h.store.nodes[0].data.model, 'old', 'saved choice is not replaced');
  assert.strictEqual(h.store.nodes, h.graph.nodes);
  assert.strictEqual(h.store.edges, h.graph.edges);
});

test('production boot: successful response sorts rows and preserves fingerprint deduplication', async () => {
  const h = harness();
  const fresh = { ...stale, text: [{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }] };
  h.requests[0].resolve({ ok: true, body: fresh });
  await flush();
  assert.deepEqual(Array.from(h.states[1].text, (row) => row.id), sortCatalogRows(fresh.text).map((row) => row.id));
  assert.strictEqual(h.store.catalog, h.states[1]);
  assert.equal(h.writes(), 1, 'same fingerprint does not rewrite successful cache');
  h.refresh();
  assertUnavailable(h.states[1]);
  assertUnavailable(h.store.catalog);
  h.requests[1].resolve({ ok: true, body: fresh });
  await flush();
  assert.equal(h.writes(), 2, 'forced refresh writes successful cache');
});

test('production boot: failed refresh cannot retain a previously successful directory', async () => {
  const h = harness();
  h.requests[0].resolve({ ok: true, body: stale });
  await flush();
  h.refresh();
  h.requests[1].resolve({ ok: false, body: {} });
  await flush();
  assertUnavailable(h.states[1]);
  assertUnavailable(h.store.catalog);
  assert.equal(h.cache.getCachedCatalog(), null);
});

test('production boot: absent or empty cache fails closed and invalidates nullish schema fallback', async () => {
  for (const cached of [null, { ...stale, models: [], text: [] }]) {
    const h = harness(cached);
    h.requests[0].resolve({ ok: false, body: {} });
    await flush();
    assertUnavailable(h.states[1]);
    assertUnavailable(h.store.catalog);
    assert.equal(h.cache.getCachedCatalog(), null);
    assert.equal(h.cache.useModelParameterSchema('text', 'old', null).modelItem, undefined);
  }
});

test('production boot: explicit unavailable catalog overrides still-cached schema during loading', () => {
  const h = harness();
  assert.ok(h.cache.useModelParameterSchema('text', 'old', null).modelItem);
  assert.equal(h.cache.useModelParameterSchema('text', 'old', h.initial.catalog).modelItem, undefined);
});

test('production boot: superseded success and post-unmount failure cannot revive or clear current cache', async () => {
  const h = harness();
  h.refresh();
  h.requests[1].resolve({ ok: false, body: {} });
  await flush();
  h.requests[0].resolve({ ok: true, body: stale });
  await flush();
  assertUnavailable(h.store.catalog);
  assert.equal(h.cache.getCachedCatalog(), null);
  h.refresh();
  h.cleanup();
  h.cache.setCachedCatalog(stale);
  h.requests[2].reject(new Error('late'));
  await flush();
  assert.equal(h.cache.getCachedCatalog().fingerprint, 'same');
});

test('shouldReplaceCatalogCache: force true → replace', () => {
  assert.equal(
    shouldReplaceCatalogCache({
      cachedFingerprint: 'abc',
      nextFingerprint: 'abc',
      force: true,
    }),
    true,
  );
});

test('shouldReplaceCatalogCache: next 无 fingerprint → replace', () => {
  assert.equal(
    shouldReplaceCatalogCache({
      cachedFingerprint: 'abc',
      nextFingerprint: '',
      force: false,
    }),
    true,
  );
  assert.equal(
    shouldReplaceCatalogCache({
      cachedFingerprint: 'abc',
      nextFingerprint: null,
      force: false,
    }),
    true,
  );
});

test('shouldReplaceCatalogCache: cached 空 → replace', () => {
  assert.equal(
    shouldReplaceCatalogCache({
      cachedFingerprint: '',
      nextFingerprint: 'abc',
      force: false,
    }),
    true,
  );
  assert.equal(
    shouldReplaceCatalogCache({
      cachedFingerprint: null,
      nextFingerprint: 'abc',
    }),
    true,
  );
});

test('shouldReplaceCatalogCache: 相同 fingerprint → keep', () => {
  assert.equal(
    shouldReplaceCatalogCache({
      cachedFingerprint: 'abc',
      nextFingerprint: 'abc',
      force: false,
    }),
    false,
  );
});

test('shouldReplaceCatalogCache: 不同 fingerprint → replace', () => {
  assert.equal(
    shouldReplaceCatalogCache({
      cachedFingerprint: 'old-fp',
      nextFingerprint: 'new-fp',
      force: false,
    }),
    true,
  );
});

test('源码契约：refreshCatalog(false) 始终 fetchCapabilities，不因 TTL 提前 return', () => {
  assert.match(bootSrc, /async function refreshCatalog\(force = false\)/);
  assert.match(bootSrc, /fetchCapabilities\(\)/);
  assert.match(bootSrc, /shouldReplaceCatalogCache/);
  assert.match(bootSrc, /getCachedFingerprint/);
  assert.doesNotMatch(bootSrc, /isCatalogCacheStale/);
  const refreshStart = bootSrc.indexOf('async function refreshCatalog(force = false)');
  const refreshEnd = bootSrc.indexOf('async function probeAndPatchImportedMedia', refreshStart);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart, 'refreshCatalog 函数边界');
  const body = bootSrc.slice(refreshStart, refreshEnd);
  assert.doesNotMatch(body, /if \(!force && !isCatalogCacheStale/);
  assert.match(body, /const result = await fetchCapabilities\(\)/);
  // Runtime may only receive a directory after the current fetch succeeds.
  assert.doesNotMatch(body, /setCatalogRuntime\(cached\)/);
});
