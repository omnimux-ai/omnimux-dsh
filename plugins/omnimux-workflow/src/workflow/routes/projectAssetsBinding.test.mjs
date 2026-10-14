import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const bundle = await build({ stdin: { contents: [
  "export { createWorkflowDispatcher } from './src/workflow/routes/canvasRoutes.ts';",
  "export { createWorkspaceStore } from './src/workflow/workspace/WorkspaceStore.ts';",
  "export { createProjectAssetsStore } from './src/workflow/workspace/ProjectAssetsStore.ts';",
  "export { createProjectStore } from './src/projects/ProjectStore.ts';",
  "export { bindEnsureProjectBound } from './src/projects/ensureProjectBound.ts';",
].join('\n'), resolveDir: new URL('../../..', import.meta.url).pathname }, bundle: true, platform: 'node', format: 'esm', define: { 'import.meta.url': JSON.stringify(new URL('./pluginRoot.ts', import.meta.url).href) }, write: false });
const host = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wf-asset-bind-'));
  const projectStore = host.createProjectStore({ libraryRoot: join(root, 'library') });
  const resolveProjectRoot = id => projectStore.findByCanvasWorkspaceId(id);
  const store = host.createWorkspaceStore({ workspacesDir: join(root, 'workspaces'), resolveProjectRoot });
  const source = join(root, 'hero.png');
  writeFileSync(source, 'test-image');
  const assetsStore = host.createProjectAssetsStore({ workspacesDir: store.workspacesDir, resolveProjectRoot,
    fetchLibraryDetail: async () => ({ files: [{ real_path: source, visible: true }] }) });
  const dispatcher = host.createWorkflowDispatcher({ store, projectStore, assetsStore,
    ensureProjectBound: host.bindEnsureProjectBound(projectStore), libraryRoot: join(root, 'library'),
    mediaDir: join(root, 'media'), gateway: {}, executionManager: {} });
  return { root, source, store, projectStore, assetsStore, dispatcher };
}

for (const action of ['instantiate', 'ingest']) {
  test(action + ': unbound canvas binds one reusable project and preserves graph', async () => {
    const f = fixture();
    try {
      const ws = f.store.create('角色复刻');
      const before = f.store.get(ws.id);
      const request = { method: 'POST', url: '/omnimux-workflow/api/workspaces/' + ws.id + '/assets/' + action,
        origin: 'http://localhost:3000', body: action === 'instantiate'
          ? { globalSubjectId: 'subject_a', expectedRev: 0 } : { paths: [f.source], expectedRev: 0 } };
      const result = await f.dispatcher.dispatch(request);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.assets.items.length, 1);
      const project = f.projectStore.findByCanvasWorkspaceId(ws.id);
      assert.ok(project);
      assert.equal(project.title, '角色复刻');
      assert.deepEqual(f.store.get(ws.id), before);
      assert.equal(readFileSync(f.assetsStore.resolveProjectFile(ws.id, result.body.assets.items[0].relative_path), 'utf8'), 'test-image');
      const second = await f.dispatcher.dispatch({ ...request, body: { ...request.body, expectedRev: 1 } });
      assert.equal(second.status, 200);
      assert.equal(f.projectStore.list().length, 1);
      assert.equal(f.projectStore.findByCanvasWorkspaceId(ws.id).id, project.id);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
}

test('missing canvas, malformed body and foreign requests do not create projects', async () => {
  const f = fixture();
  try {
    const ws = f.store.create('角色');
    for (const request of [
      { method: 'POST', url: '/omnimux-workflow/api/workspaces/ws_missing/assets/instantiate', origin: 'http://localhost:3000', body: { globalSubjectId: 'subject_a' } },
      { method: 'POST', url: '/omnimux-workflow/api/workspaces/' + ws.id + '/assets/instantiate', origin: 'http://localhost:3000', body: null },
      { method: 'POST', url: '/omnimux-workflow/api/workspaces/' + ws.id + '/assets/instantiate', origin: 'https://foreign.example', body: { globalSubjectId: 'subject_a' } },
    ]) {
      const result = await f.dispatcher.dispatch(request);
      assert.ok(result.status >= 400);
      assert.equal(f.projectStore.list().length, 0);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
