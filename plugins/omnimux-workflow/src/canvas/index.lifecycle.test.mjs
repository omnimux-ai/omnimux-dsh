import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

async function fixture() {
  const events = [];
  const result = await build({ stdin: { contents: "export * as island from './index.tsx'; export { createCanvasBridgeLifecycle, retryRetainedCanvasCleanup } from '../client/CanvasBridge.jsx';", resolveDir: new URL('.', import.meta.url).pathname, loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', format: 'iife', globalName: 'testApi', plugins: [{ name: 'dom-root-fixture', setup(build) {
    build.onResolve({ filter: /^(react|dsh-ui-kit|\.\/api\.js|\.\/styles\.js)$/ }, args => ({ path: args.path, namespace: 'host' }));
    build.onLoad({ filter: /.*/, namespace: 'host' }, ({ path }) => ({ contents: path === 'react' ? 'export const useCallback = () => {}; export const useEffect = () => {}; export const useRef = () => {}; export const useState = () => {};' : path === 'dsh-ui-kit' ? 'export const Button = () => {};' : path === './api.js' ? 'export const fetchCanvasHash = () => {};' : 'export const injectWorkflowStyles = () => {};' }));
    build.onResolve({ filter: /^(react-dom\/client|react\/jsx-runtime|\.\/App|\.\/injectStyles)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'react-dom/client' ? 'export const createRoot = globalThis.makeRoot;' : path === 'react/jsx-runtime' ? 'export const jsx = (type, props) => props; export const jsxs = jsx;' : path === './App' ? 'export default function App() {}' : 'export function injectCanvasStyles() {}' }));
    build.onResolve({ filter: /textStageStore/ }, () => ({ path: 'textStageStore', namespace: 'store' }));
    build.onLoad({ filter: /.*/, namespace: 'store' }, () => ({ contents: 'export const useTextStageStore = {};' }));
  } }] });
  const context = { makeRoot: el => { events.push(['create', el]); return { render: props => events.push(['render', el, props.workspaceId, props]), unmount: () => events.push(['unmount', el]) }; }, console };
  runInNewContext(result.outputFiles[0].text, context);
  return { api: context.testApi.island, bridge: context.testApi.createCanvasBridgeLifecycle, retry: context.testApi.retryRetainedCanvasCleanup, events };
}

test('unguarded legacy callers render, replace, update and dispose without awaiting', async () => {
  const { api, events } = await fixture();
  const a = {}, b = {};
  const mounting = api.mountCanvas(a, { workspaceId: 'A' });
  assert.equal(events.at(-1)?.[2], 'A');
  api.mountCanvas(b, { workspaceId: 'B' });
  api.unmountCanvas(a);
  api.updateCanvas(a, { workspaceId: 'stale' });
  assert.deepEqual(events.map(row => row[0]), ['create', 'render', 'unmount', 'create', 'render']);
  api.updateCanvas(b, { workspaceId: 'B', locale: 'en' });
  assert.equal(events.at(-1)[3].locale, 'en');
  api.unmountCanvas(b);
  assert.equal(events.at(-1)[0], 'unmount');
  assert.equal(await mounting, true);
});

test('bridge accepts actual legacy synchronous void ABI but not void from guarded APIs', async () => {
  const { bridge } = await fixture();
  const events = [];
  const legacy = { mountCanvas() { events.push('mount'); }, updateCanvas() { events.push('update'); }, unmountCanvas() { events.push('unmount'); } };
  const lifetime = bridge();
  assert.equal(await lifetime.mount(legacy, {}, {}), true);
  assert.equal(await lifetime.update({ locale: 'en' }), true);
  assert.equal(await lifetime.cleanup(), true);
  assert.deepEqual(events, ['mount', 'update', 'unmount']);
  const guarded = { ...legacy, registerDirectorCloseGuard() {} };
  const unsafe = bridge();
  assert.equal(await unsafe.mount(guarded, {}, {}), false);
  assert.equal(await unsafe.cleanup(), false);
});

test('receipt-dropping host wrappers use island-owned receipts and actual root proof', async () => {
  const { api, bridge, events } = await fixture();
  const errors = [];
  const wrapper = { ...api, mountCanvas(el, props) { void api.mountCanvas(el, props); }, unmountCanvas(el) { void api.unmountCanvas(el); } };
  const el = {};
  const lifetime = bridge(error => errors.push(error));
  assert.equal(await lifetime.mount(wrapper, el, { workspaceId: 'A' }), true);
  let release;
  let pending = new Promise(resolve => { release = resolve; });
  const unregister = api.registerDirectorCloseGuard({ prepareClose: () => pending });
  const closing = lifetime.close();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(events.filter(row => row[0] === 'unmount').length, 0);
  release(false);
  assert.equal(await closing, false);
  assert.equal(api.getCanvasState(el).mounted, true);
  pending = Promise.resolve(true);
  assert.equal(await lifetime.close(), true);
  assert.equal(api.getCanvasState(el).mounted, false);
  assert.equal(events.filter(row => row[0] === 'unmount').length, 1);
  assert.ok(errors.length >= 1);
  unregister();
});

test('receipt-dropping wrapper cannot claim a blocked replacement was mounted', async () => {
  const { api, bridge, events } = await fixture();
  const a = {}, b = {};
  await api.mountCanvas(a, { workspaceId: 'A' });
  const unregister = api.registerDirectorCloseGuard({ prepareClose: async () => false });
  const wrapper = { ...api, mountCanvas(el, props) { void api.mountCanvas(el, props); }, unmountCanvas(el) { void api.unmountCanvas(el); } };
  const lifetime = bridge();
  assert.equal(await lifetime.mount(wrapper, b, { workspaceId: 'B' }), false);
  assert.equal(api.getCanvasState(a).mounted, true);
  assert.equal(api.getCanvasState(b).mounted, false);
  assert.equal(events.filter(row => row[0] === 'unmount').length, 0);
  unregister();
  await api.closeActiveCanvas();
});

test('cleanup during a receipt-dropping asynchronous mount waits and releases the actual new root', async () => {
  const { api, bridge, events } = await fixture();
  const a = {}, b = {};
  await api.mountCanvas(a, { workspaceId: 'A' });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const unregister = api.registerDirectorCloseGuard({ prepareClose: () => gate });
  const wrapper = { ...api, mountCanvas(el, props) { void api.mountCanvas(el, props); }, unmountCanvas(el) { void api.unmountCanvas(el); } };
  const lifetime = bridge();
  const mounting = lifetime.mount(wrapper, b, { workspaceId: 'B' });
  await Promise.resolve(); await Promise.resolve();
  const cleaning = lifetime.cleanup();
  assert.equal(events.filter(row => row[0] === 'create').length, 1);
  release(true);
  assert.equal(await mounting, false);
  assert.equal(await cleaning, true);
  assert.equal(api.getCanvasState(b).mounted, false);
  assert.equal(events.filter(row => row[0] === 'create').length, 2);
  assert.equal(events.filter(row => row[0] === 'unmount').length, 2);
  unregister();
});

test('async undefined is not legacy void success and rejected guarded cleanup stays retryable', async () => {
  const { api, bridge } = await fixture();
  const invalid = { mountCanvas: async () => undefined, unmountCanvas: async () => undefined };
  const invalidLifetime = bridge();
  assert.equal(await invalidLifetime.mount(invalid, {}, {}), false);
  assert.equal(await invalidLifetime.cleanup(), false);
  const el = {};
  const wrapper = { ...api, mountCanvas(el, props) { void api.mountCanvas(el, props); }, unmountCanvas(el) { void api.unmountCanvas(el); } };
  const errors = [];
  const lifetime = bridge(error => errors.push(error));
  assert.equal(await lifetime.mount(wrapper, el, { workspaceId: 'A' }), true);
  let outcome = 'reject';
  const unregister = api.registerDirectorCloseGuard({ prepareClose: async () => { if (outcome === 'reject') throw new Error('save-failed'); return outcome; } });
  assert.equal(await lifetime.cleanup(), false);
  assert.equal(api.getCanvasState(el).mounted, true);
  outcome = true;
  assert.equal(await lifetime.cleanup(), true);
  assert.equal(api.getCanvasState(el).mounted, false);
  assert.ok(errors.length >= 1);
  unregister();
});

test('workspace replacement stays on old root and reports error when director draft cannot close', async () => {
  const { api, events } = await fixture();
  const el = {};
  const errors = [];
  await api.mountCanvas(el, { workspaceId: 'A' });
  const unregister = api.registerDirectorCloseGuard({ prepareClose: async () => false });
  assert.equal(await api.updateCanvas(el, { workspaceId: 'B', onError: error => errors.push(error) }), false);
  assert.equal(events.filter(event => event[0] === 'unmount').length, 0);
  assert.equal(events.at(-1)[2], 'A');
  assert.equal(errors.length, 1);
  unregister();
  assert.equal(await api.updateCanvas(el, { workspaceId: 'B' }), true);
  assert.equal(events.filter(event => event[0] === 'unmount').length, 1);
  assert.equal(events.at(-1)[2], 'B');
});

test('mount of another container and explicit unmount await exact true; local props retain root', async () => {
  const { api, events } = await fixture();
  const a = {}, b = {};
  await api.mountCanvas(a, { workspaceId: 'A' });
  let release;
  let pending = new Promise(resolve => { release = resolve; });
  const unregister = api.registerDirectorCloseGuard({ prepareClose: () => pending });
  const update = api.updateCanvas(a, { workspaceId: 'A', locale: 'en' });
  assert.equal(await update, true);
  const mounting = api.mountCanvas(b, { workspaceId: 'B' });
  await Promise.resolve();
  assert.equal(events.filter(event => event[0] === 'create').length, 1);
  release(true);
  assert.equal(await mounting, true);
  pending = Promise.resolve(undefined);
  assert.equal(await api.unmountCanvas(b), false);
  assert.equal(events.filter(event => event[0] === 'unmount').length, 1);
  pending = Promise.reject(new Error('draft-failed'));
  assert.equal(await api.unmountCanvas(b), false);
  unregister();
  assert.equal(await api.unmountCanvas(b), true);
});

test('plain close callback never tells the host to detach a denied child', async () => {
  const { api, events } = await fixture();
  const el = {};
  let closeCount = 0;
  await api.mountCanvas(el, { workspaceId: 'A', onClose: () => closeCount++ });
  const props = events.at(-1)[3];
  const unregister = api.registerDirectorCloseGuard({ prepareClose: async () => false });
  props.onClose();
  await api.updateCanvas(el, { workspaceId: 'A' });
  assert.equal(closeCount, 0);
  assert.equal(events.filter(event => event[0] === 'unmount').length, 0);
  unregister();
  props.onClose();
  await api.updateCanvas(el, { workspaceId: 'A' });
  assert.equal(closeCount, 1);
  assert.equal(events.filter(event => event[0] === 'unmount').length, 1);
});
