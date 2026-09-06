import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, afterEach, test } from 'node:test';
import { buildSync } from 'esbuild';
const here = fileURLToPath(new URL('.', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'generation-preferences-ui-'));
const bundle = join(root, 'runtime.mjs');
buildSync({
  stdin: { contents: `export * from './generationPreferencesStore.ts'; export { useCanvasStore } from './canvasStore.ts';`, resolveDir: here },
  bundle: true, platform: 'node', format: 'esm', outfile: bundle,
});
const { loadGenerationPreferences, rememberGenerationModel, useGenerationPreferencesStore, useCanvasStore } = await import(pathToFileURL(bundle).href);
const originalFetch = globalThis.fetch;
after(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => { globalThis.fetch = originalFetch; useGenerationPreferencesStore.setState({ lastModelByType: {} }); useCanvasStore.getState().resetStore(); });
const response = (lastModelByType, status = 200) => ({ ok: status === 200, status, json: async () => ({ lastModelByType, ...(status !== 200 ? { message: '保存失败' } : {}) }) });

test('load restores profile preferences and canvas reset leaves them available in another project', async () => {
  globalThis.fetch = async () => response({ text: 'gpt-5.5' });
  await loadGenerationPreferences();
  const canvas = useCanvasStore.getState();
  canvas.hydrateGraph([{ id: 'old', type: 'material', position: { x: 0, y: 0 }, data: { params: { model: 'existing' } } }], []);
  const oldNodes = useCanvasStore.getState().nodes;
  globalThis.fetch = async () => response({ text: 'claude-opus-4-6' });
  await rememberGenerationModel('text', 'claude-opus-4-6');
  assert.equal(useCanvasStore.getState().nodes, oldNodes, 'manual preference must not reconcile existing nodes');
  canvas.resetStore();
  assert.deepEqual(useGenerationPreferencesStore.getState().lastModelByType, { text: 'claude-opus-4-6' });
});

test('rapid choices save in click order and failed writes are visible without poisoning later saves', async () => {
  const calls = [];
  let release;
  globalThis.fetch = async (_url, opts) => {
    const model = JSON.parse(opts.body).modelId;
    calls.push(model);
    if (model === 'first') return new Promise((resolve) => { release = () => resolve(response({}, 500)); });
    return response({ text: model });
  };
  const first = rememberGenerationModel('text', 'first');
  const firstFailure = assert.rejects(first, /保存失败/);
  const second = rememberGenerationModel('text', 'second');
  await Promise.resolve();
  assert.deepEqual(calls, ['first']);
  release();
  await firstFailure;
  await second;
  assert.deepEqual(calls, ['first', 'second']);
  assert.deepEqual(useGenerationPreferencesStore.getState().lastModelByType, { text: 'second' });
});

test('late boot response cannot overwrite a newer manual choice', async () => {
  let release;
  globalThis.fetch = async (_url, opts) => opts.method === 'PATCH'
    ? response({ text: 'new' })
    : new Promise((resolve) => { release = () => resolve(response({ text: 'old' })); });
  const loading = loadGenerationPreferences();
  await rememberGenerationModel('text', 'new');
  release();
  await loading;
  assert.deepEqual(useGenerationPreferencesStore.getState().lastModelByType, { text: 'new' });
});

test('load and malformed payload failures reject instead of pretending preferences are empty', async () => {
  globalThis.fetch = async () => response({}, 500);
  await assert.rejects(loadGenerationPreferences(), /保存失败/);
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  await assert.rejects(loadGenerationPreferences(), /模型偏好格式无效/);
});

test('immediate new-node reads see the manual choice; save failure restores the persisted choice', async () => {
  globalThis.fetch = async () => response({ text: 'persisted' });
  await loadGenerationPreferences();
  let release;
  globalThis.fetch = async () => new Promise((resolve) => { release = () => resolve(response({}, 500)); });
  const pending = rememberGenerationModel('text', 'new-choice');
  const failure = assert.rejects(pending, /保存失败/);
  assert.equal(useGenerationPreferencesStore.getState().lastModelByType.text, 'new-choice');
  await Promise.resolve();
  release();
  await failure;
  assert.equal(useGenerationPreferencesStore.getState().lastModelByType.text, 'persisted');
});

test('a read started during a pending write cannot overwrite the acknowledged choice', async () => {
  let finishRead;
  let finishSave;
  globalThis.fetch = async (_url, opts) => opts.method === 'PATCH'
    ? new Promise((resolve) => { finishSave = () => resolve(response({ text: 'newest' })); })
    : new Promise((resolve) => { finishRead = () => resolve(response({ text: 'stale' })); });
  const saving = rememberGenerationModel('text', 'newest');
  await Promise.resolve();
  const loading = loadGenerationPreferences();
  finishSave();
  await saving;
  finishRead();
  await loading;
  assert.equal(useGenerationPreferencesStore.getState().lastModelByType.text, 'newest');
});
