import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./index.tsx', import.meta.url))],
  bundle: true, write: false, format: 'iife', globalName: 'island', platform: 'node', jsx: 'automatic',
  plugins: [{ name: 'root-boundaries', setup(build) {
    build.onResolve({ filter: /react-dom\/client|react\/jsx-runtime|^\.\/App$|injectStyles|textStageStore/ },
      ({ path }) => ({ path, namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents:
      path === 'react-dom/client' ? 'export const createRoot = el => env.createRoot(el);'
      : path === 'react/jsx-runtime' ? 'export const jsx = (type, props) => props;'
      : path === './App' ? 'export default function App() {}'
      : path.includes('injectStyles') ? 'export const injectCanvasStyles = () => {};'
      : 'export const useTextStageStore = {};',
    }));
  } }],
});

test('new root retires the old owner before rendering; late unmount cannot reset the new owner', () => {
  const events = [];
  const env = { createRoot: el => ({
    render(props) { events.push(['render', el, props.workspaceId, props.locale]); },
    unmount() { events.push(['unmount', el]); },
  }) };
  const ctx = vm.createContext({ env }); vm.runInContext(bundle.outputFiles[0].text, ctx);
  const a = {}, b = {};
  ctx.island.mountCanvas(a, { workspaceId: 'A' });
  ctx.island.mountCanvas(b, { workspaceId: 'B' });
  ctx.island.unmountCanvas(a);
  ctx.island.updateCanvas(a, { workspaceId: 'stale' });
  assert.deepEqual(events.map(event => event.slice(0, 1).concat(event[2] ?? [])), [
    ['render', 'A'], ['unmount'], ['render', 'B'],
  ]);
  ctx.island.updateCanvas(b, { workspaceId: 'B', locale: 'en' });
  assert.equal(events.at(-1)[0], 'render');
  assert.equal(events.filter(event => event[0] === 'unmount').length, 1);
  ctx.island.updateCanvas(b, { workspaceId: 'C', locale: 'en' });
  assert.deepEqual(events.slice(-2).map(event => event[0]), ['unmount', 'render']);
  assert.equal(events.at(-1)[2], 'C');
});
