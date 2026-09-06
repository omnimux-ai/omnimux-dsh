import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { buildSync } from 'esbuild';

const here = fileURLToPath(new URL('.', import.meta.url));
const buildDir = mkdtempSync(join(tmpdir(), 'generation-preferences-build-'));
const bundle = join(buildDir, 'runtime.mjs');
buildSync({
  stdin: { contents: `
    export { createGenerationPreferencesStore } from '../workspace/GenerationPreferencesStore.ts';
    export { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
    export { createWorkflowDispatcher } from './canvasRoutes.ts';
  `, resolveDir: here },
  bundle: true, platform: 'node', format: 'esm', outfile: bundle,
});
const { createGenerationPreferencesStore, createWorkspaceStore, createWorkflowDispatcher } = await import(pathToFileURL(bundle).href);
after(() => rmSync(buildDir, { recursive: true, force: true }));
const url = '/omnimux-workflow/api/generation-preferences';

function harness(t) {
  const root = mkdtempSync(join(tmpdir(), 'generation-preferences-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, 'generation-preferences.json');
  const preferences = createGenerationPreferencesStore(file);
  const workspaces = createWorkspaceStore({ workspacesDir: join(root, 'workspaces') });
  const catalog = { source: 'omnimux', text: [{ id: 'claude-opus-4-6' }, { id: 'gpt-5.5' }], image: [{ id: 'gpt-image-2' }], video: [], audio: [] };
  const dispatcher = createWorkflowDispatcher({
    store: workspaces,
    generationPreferences: preferences,
    gateway: { capabilities: async () => catalog },
    mediaDir: join(root, 'media'),
    libraryRoot: join(root, 'library'),
    executionManager: {},
  });
  const call = (method = 'GET', body, origin = 'http://127.0.0.1:45120') => dispatcher.dispatch({ method, url, body, origin });
  return { root, file, preferences, workspaces, catalog, call };
}

test('manual choices survive restart across workspaces without changing existing graphs', async (t) => {
  const h = harness(t);
  const first = h.workspaces.create('Project A');
  const second = h.workspaces.create('Project B');
  assert.deepEqual((await h.call()).body, { lastModelByType: {} });
  assert.equal((await h.call('PATCH', { kind: 'text', modelId: 'claude-opus-4-6' })).status, 200);
  assert.equal((await h.call('PATCH', { kind: 'image', modelId: 'gpt-image-2' })).status, 200);
  const restored = createGenerationPreferencesStore(h.file);
  assert.deepEqual(restored.get(), { lastModelByType: { text: 'claude-opus-4-6', image: 'gpt-image-2' } });
  assert.deepEqual(h.workspaces.get(first.id), first);
  assert.deepEqual(h.workspaces.get(second.id), second);
  const isolated = createGenerationPreferencesStore(join(h.root, 'other-profile', 'generation-preferences.json'));
  assert.deepEqual(isolated.get(), { lastModelByType: {} });
});

test('PATCH accepts only listed canonical ids of the requested generation kind', async (t) => {
  const h = harness(t);
  for (const body of [null, [], {}, { kind: 'unknown', modelId: 'gpt-5.5' }, { kind: 'image', modelId: 'gpt-5.5' }, { kind: 'text', modelId: 'GPT 5.5' }, { kind: 'audio', modelId: 'suno' }, { kind: 'text', modelId: 'outside-policy' }]) {
    const response = await h.call('PATCH', body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.deepEqual(h.preferences.get(), { lastModelByType: {} });
  h.catalog.text = [];
  assert.equal((await h.call('PATCH', { kind: 'text', modelId: 'gpt-5.5' })).status, 400);
});

test('PATCH uses the dispatcher local-write guard', async (t) => {
  const h = harness(t);
  const result = await h.call('PATCH', { kind: 'text', modelId: 'gpt-5.5' }, 'https://attacker.example');
  assert.equal(result.status, 403);
  assert.deepEqual(h.preferences.get(), { lastModelByType: {} });
});

test('corrupt preference data is reported, never reset or overwritten', async (t) => {
  const h = harness(t);
  writeFileSync(h.file, '{bad json');
  assert.equal((await h.call()).status, 500);
  const result = await h.call('PATCH', { kind: 'text', modelId: 'gpt-5.5' });
  assert.equal(result.status, 500);
  assert.equal(result.body.error, 'preference-save-failed');
  assert.equal(readFileSync(h.file, 'utf8'), '{bad json');
});

test('independent store instances merge distinct kinds and newest choice persists', (t) => {
  const h = harness(t);
  const second = createGenerationPreferencesStore(h.file);
  h.preferences.set('text', 'claude-opus-4-6');
  second.set('image', 'gpt-image-2');
  h.preferences.set('text', 'gpt-5.5');
  assert.deepEqual(second.get().lastModelByType, { text: 'gpt-5.5', image: 'gpt-image-2' });
  const copy = second.get();
  copy.lastModelByType.text = 'mutated';
  assert.equal(second.get().lastModelByType.text, 'gpt-5.5');
});

test('filesystem write failures propagate instead of acknowledging the new preference', (t) => {
  const h = harness(t);
  const blocker = join(h.root, 'file-not-directory');
  writeFileSync(blocker, 'not a directory');
  const broken = createGenerationPreferencesStore(join(blocker, 'preferences.json'));
  assert.throws(() => broken.set('text', 'gpt-5.5'));
});
