import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: `export { useTablePersistence } from './useTablePersistence';
    export { tableDocumentCache } from '../store/tableDocumentCache';`,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'ts' },
  bundle: true, write: false, format: 'iife', globalName: 'hooks', platform: 'node',
  plugins: [{ name: 'table-boundaries', setup(build) {
    build.onResolve({ filter: /^react$|\/apiClient\.ts$/ }, ({ path }) => ({ path, namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents:
      path === 'react' ? `export const useRef = value => ({ current: value });
        export const useState = value => [value, () => {}];
        export const useCallback = callback => callback;
        export const useEffect = effect => { const cleanup = effect(); if (cleanup) env.cleanups.push(cleanup); };`
      : `export const saveWorkspaceTable = (...args) => env.save(...args);
         export const getWorkspaceTable = (...args) => env.load(...args);`,
    }));
  } }],
});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function setup() {
  const env = { cleanups: [], writes: [],
    load: async () => ({ ok: false, status: 404, body: {} }),
    save: async (...args) => { env.writes.push(args); return { ok: true, body: { table: { contentRev: 1 } } }; },
  };
  const timers = new Map(); let timerId = 0;
  const ctx = vm.createContext({ env,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }, window: { addEventListener() {}, removeEventListener() {} },
  });
  vm.runInContext(bundle.outputFiles[0].text, ctx);
  return { env, cache: ctx.hooks.tableDocumentCache,
    mount: workspaceId => ctx.hooks.useTablePersistence({ workspaceId }),
    unmount() { for (const fn of env.cleanups.splice(0)) fn(); },
  };
}

for (const result of ['success', 'error']) test(`late A table ${result} does not modify B with the same table id`, async () => {
  const h = setup(); const a = h.mount('A');
  await h.cache.ensure('', 'shared');
  h.cache.mutate('shared', doc => ({ ...doc, title: 'A' }));
  const pending = deferred(); h.env.save = () => pending.promise;
  const saving = a.saveNow();
  h.unmount(); h.cache.resetAll(); h.mount('B');
  await h.cache.ensure('', 'shared');
  h.cache.mutate('shared', doc => ({ ...doc, title: 'B' }));
  const before = JSON.stringify(h.cache.getSession('shared'));
  pending.resolve(result === 'success' ? { ok: true, body: { table: { contentRev: 9 } } }
    : { ok: false, body: { message: 'A failed' } });
  await saving;
  assert.equal(JSON.stringify(h.cache.getSession('shared')), before);
  h.unmount();
});

test('A final table edit is captured before reset and saved behind pending PUT at returned revision', async () => {
  const h = setup(); const a = h.mount('A');
  await h.cache.ensure('', 'shared'); h.cache.mutate('shared', doc => ({ ...doc, title: 'A first' }));
  const pending = deferred();
  h.env.save = (...args) => { h.env.writes.push(args); return pending.promise; };
  const first = a.saveNow();
  h.cache.mutate('shared', doc => ({ ...doc, title: 'A final' }));
  a.flushDirtyTables({ force: true });
  h.unmount(); h.cache.resetAll(); h.mount('B');
  await h.cache.ensure('', 'shared'); h.cache.mutate('shared', doc => ({ ...doc, title: 'B' }));
  const before = JSON.stringify(h.cache.getSession('shared'));
  h.env.save = async (...args) => { h.env.writes.push(args); return { ok: true, body: { table: { contentRev: 2 } } }; };
  pending.resolve({ ok: true, body: { table: { contentRev: 1 } } });
  await first; await settle();
  assert.equal(h.env.writes.length, 2);
  assert.equal(h.env.writes[1][0], 'A');
  assert.equal(h.env.writes[1][2].document.title, 'A final');
  assert.equal(h.env.writes[1][2].expectedRev, 1);
  assert.equal(JSON.stringify(h.cache.getSession('shared')), before);
  h.unmount();
});
