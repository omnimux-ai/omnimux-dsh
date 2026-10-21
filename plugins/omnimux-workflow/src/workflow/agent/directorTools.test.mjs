import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
import { createDirectorHost } from '../director/directorHost.ts';
import { createDirectorTools } from './directorTools.ts';
import { mutateWorkspaceGraph } from '../graph/GraphMutator.ts';
import { createProjectStore } from '../../projects/ProjectStore.ts';
import { validateToolContract } from '../../../../../scripts/agent-tools-suite/schema-lint.mjs';

function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'director-tools-'));
  const project = join(root, 'project'); mkdirSync(project);
  const store = createWorkspaceStore({ workspacesDir: join(root, 'workspaces'), resolveProjectRoot: () => options.unbound ? null : { path: project } });
  const workspace = store.create('镜头画布');
  let active = workspace.id;
  const deps = { store, host: createDirectorHost({ store }), getActiveView: () => ({ uiContext: { view: { kind: 'canvas', extra: { workspaceId: active } } } }), ...options.deps };
  t.after(() => { assert.ok(root.startsWith(`${resolve(tmpdir())}/`)); rmSync(root, { recursive: true, force: true }); });
  const tool = createDirectorTools(deps).find(item => item.name === 'workflow_director');
  assert.ok(tool);
  return { deps, store, workspace, root, project, tool, setActive: id => { active = id; }, execute: (args, exec) => tool.execute(args, exec) };
}

test('public director create on current canvas is readable after host restart without embedding a second scene', async t => {
  const h = fixture(t);
  const created = await h.execute({ action: 'create', title: '追逐镜头', description: '角色从左向右移动' });
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(created.workspaceId, h.workspace.id);
  assert.equal(created.revision, 1);
  assert.equal(created.workspaceVersion, 2);
  const restarted = createDirectorTools({ ...h.deps, host: createDirectorHost({ store: h.store }) })[0];
  const loaded = await restarted.execute({ action: 'read', node_id: created.nodeId });
  assert.equal(loaded.ok, true, JSON.stringify(loaded));
  assert.equal(loaded.document.scene.title, '追逐镜头');
  assert.equal(loaded.document.revision, 1);
  assert.equal(loaded.document.scene.objects.length, 0);
  assert.equal(loaded.document.scene.shots[0].fps, 30);
  const node = h.store.get(h.workspace.id).nodes.find(node => node.id === created.nodeId);
  assert.equal(node.type, 'director');
  assert.equal(node.data.description, '角色从左向右移动');
  assert.equal(node.data.scene, undefined);
});

test('public save edits the same authoritative scene and rejects stale revisions without changing the saved scene', async t => {
  const h = fixture(t);
  const created = await h.execute({ action: 'create', title: '追逐镜头' });
  const scene = structuredClone(created.document.scene);
  scene.title = '确认的运镜'; scene.cameras[0].transform.position = [3, 4, 8];
  const saved = await h.execute({ action: 'save', node_id: created.nodeId, expected_revision: 1, scene });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.revision, 2);
  const stale = await h.execute({ action: 'save', node_id: created.nodeId, expected_revision: 1, scene: { ...scene, title: '迟到编辑' } });
  assert.equal(stale.error, 'version_conflict');
  const read = await h.execute({ action: 'read', node_id: created.nodeId });
  assert.equal(read.document.scene.title, '确认的运镜');
  assert.deepEqual(read.document.scene.cameras[0].transform.position, [3, 4, 8]);
  assert.equal(read.workspaceVersion, 3);
  assert.equal(read.workspaceVersion, saved.workspaceVersion);
});

test('public save confirms the same-node scene summary and future operations use the confirmed revision', async t => {
  const operations = operationAdapter();
  const h = fixture(t, { deps: { operations } });
  const created = await h.execute({ action: 'create', title: 'original title', description: 'graph user intent' });
  const before = h.store.get(h.workspace.id).nodes.find(node => node.id === created.nodeId);
  const scene = { ...created.document.scene, title: 'saved scene title', activeShotId: 'shot_second',
    shots: [...created.document.scene.shots, { ...created.document.scene.shots[0], id: 'shot_second', prompt: 'confirmed prompt' }] };
  const saved = await h.execute({ action: 'save', node_id: created.nodeId, expected_revision: 1, scene });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const node = h.store.get(h.workspace.id).nodes.find(node => node.id === created.nodeId);
  assert.equal(node.data.directorRevision, saved.document.revision);
  assert.equal(node.data.directorSceneId, saved.document.scene.id);
  assert.equal(node.data.directorActiveShotId, saved.document.scene.activeShotId);
  assert.equal(node.data.title, before.data.title); assert.equal(node.data.label, before.data.label);
  assert.equal(node.data.description, before.data.description);
  assert.equal(node.data.scene, undefined);
  assert.equal(saved.workspaceVersion, h.store.get(h.workspace.id).version);
  const pending = await h.execute({ action: 'open', node_id: created.nodeId, expected_revision: 2 });
  assert.equal(pending.ok, true, JSON.stringify(pending));
  assert.equal(pending.receipt.sourceRevision, 2); assert.equal(pending.receipt.workspaceVersion, saved.workspaceVersion);
  const stale = await h.execute({ action: 'save', node_id: created.nodeId, expected_revision: 1, scene: created.document.scene });
  assert.equal(stale.error, 'version_conflict');
  assert.deepEqual(h.store.get(h.workspace.id).nodes.find(node => node.id === created.nodeId), node);
});

test('failed summary graph confirmation preserves the saved Host document but is explicitly not a successful save result', async t => {
  const h = fixture(t); const created = await h.execute({ action: 'create' });
  const nodeBefore = h.store.get(h.workspace.id).nodes.find(node => node.id === created.nodeId);
  t.mock.method(h.store, 'save', () => { throw new Error('summary-write-failed'); });
  const result = await h.execute({ action: 'save', node_id: created.nodeId, expected_revision: 1,
    scene: { ...created.document.scene, title: 'Host confirmed before summary failure' } });
  assert.notEqual(result.ok, true); assert.equal(result.error, 'mutation-failed');
  assert.equal(result.sceneSaved, true); assert.equal(result.revision, 2);
  assert.equal(result.next, 'read-director-scene-and-sync-summary');
  assert.deepEqual(h.deps.host.getScene(h.workspace.id, created.nodeId), result.document);
  assert.deepEqual(h.store.get(h.workspace.id).nodes.find(node => node.id === created.nodeId), nodeBefore);
});

test('public scene inputs reject unknown nested fields and arbitrary writes while preserving the host scene', async t => {
  const h = fixture(t);
  const created = await h.execute({ action: 'create' });
  const scene = structuredClone(created.document.scene);
  scene.cameras[0].transform.script = 'arbitrary-code';
  const rejected = await h.execute({ action: 'save', node_id: created.nodeId, expected_revision: 1, scene });
  assert.equal(rejected.error, 'invalid-args');
  for (const args of [
    { action: 'save', node_id: created.nodeId, expected_revision: 1, scene: created.document.scene, path: '/outside.json' },
    { action: 'save', node_id: created.nodeId, expected_revision: 1, data: { title: '任意补丁' } },
    { action: 'save', node_id: created.nodeId, scene: created.document.scene },
    { action: 'create', scene: { ...created.document.scene, js: 'arbitrary-code' } },
  ]) assert.equal((await h.execute(args)).error, 'invalid-args');
  const changedId = await h.execute({ action: 'save', node_id: created.nodeId, expected_revision: 1,
    scene: { ...created.document.scene, id: 'another_scene' } });
  assert.equal(changedId.error, 'director-scene-identity-mismatch');
  const read = await h.execute({ action: 'read', node_id: created.nodeId });
  assert.equal(read.document.revision, 1);
  assert.equal(read.document.scene.title, '3D 导演台');
});

test('open export and status disclose an unavailable browser bridge rather than infer capture from a saved scene', async t => {
  const h = fixture(t);
  const created = await h.execute({ action: 'create' });
  for (const args of [
    { action: 'open', node_id: created.nodeId, expected_revision: 1 },
    { action: 'export', node_id: created.nodeId, expected_revision: 1, kind: 'video' },
    { action: 'status', node_id: created.nodeId, operation_id: 'operation_unknown' },
  ]) {
    const result = await h.execute(args);
    assert.equal(result.error, 'director-operations-unavailable', JSON.stringify(result));
    assert.equal(result.status, 'unavailable');
    assert.equal(result.next, 'connect-director-browser-operations');
    assert.notEqual(result.ok, true);
  }
  const status = await h.execute({ action: 'status', node_id: created.nodeId });
  assert.equal(status.ok, true);
  assert.equal(status.sceneStatus, 'saved');
  assert.equal(status.operationsStatus, 'unavailable');
  assert.equal(status.revision, 1);
  assert.equal(status.exportStatus, 'unknown');
});

// This trusted public adapter proves handoff protocol only, not browser/UI acceptance.
function operationAdapter() {
  const receipts = new Map();
  return {
    receipts,
    request(request) { const receipt = { ...request, status: 'pending' }; receipts.set(request.operationId, receipt); return receipt; },
    get(query) { return receipts.get(query.operationId) ?? null; },
  };
}

test('trusted browser adapter receives versioned open and explicit shot export, and status returns only its pending receipt', async t => {
  const operations = operationAdapter();
  const h = fixture(t, { deps: { operations } });
  const created = await h.execute({ action: 'create' });
  const opened = await h.execute({ action: 'open', node_id: created.nodeId, expected_revision: 1 });
  assert.equal(opened.ok, true, JSON.stringify(opened));
  assert.equal(opened.status, 'pending');
  assert.equal(opened.completed, false);
  assert.equal(opened.receipt.action, 'open');
  const exported = await h.execute({ action: 'export', node_id: created.nodeId, expected_revision: 1, kind: 'video', shot_id: 'shot_1' });
  assert.equal(exported.ok, true, JSON.stringify(exported));
  assert.equal(exported.status, 'pending');
  assert.equal(exported.receipt.schemaVersion, 1);
  assert.equal(exported.receipt.workspaceId, h.workspace.id);
  assert.equal(exported.receipt.nodeId, created.nodeId);
  assert.equal(exported.receipt.sceneId, created.document.scene.id);
  assert.match(exported.receipt.projectKey, /^[a-f0-9]{64}$/);
  assert.equal(exported.receipt.sourceRevision, 1);
  assert.equal(exported.receipt.workspaceVersion, 2);
  assert.equal(exported.receipt.kind, 'video');
  assert.deepEqual(exported.receipt.shot, { id: 'shot_1', cameraId: 'camera_1', duration: 5, fps: 30 });
  assert.notEqual(opened.operationId, exported.operationId);
  const status = await h.execute({ action: 'status', node_id: created.nodeId, operation_id: exported.operationId });
  assert.equal(status.status, 'pending');
  assert.equal(status.completed, false);
  assert.equal((await h.execute({ action: 'status', node_id: created.nodeId, operation_id: 'operation_unknown' })).error, 'director-operation-not-found');
  assert.equal((await h.execute({ action: 'export', node_id: created.nodeId, expected_revision: 1, kind: 'image', shot_id: 'missing' })).error, 'director-shot-not-found');
});

test('completed export requires a confirmed managed resource and matching output node, not a completed flag or static scene', async t => {
  const operations = operationAdapter();
  const h = fixture(t, { deps: { operations } });
  const created = await h.execute({ action: 'create' });
  const request = await h.execute({ action: 'export', node_id: created.nodeId, expected_revision: 1, kind: 'video' });
  const pending = request.receipt;
  const resource = { confirmed: true, outputNodeId: 'output_video', assetId: 'asset_video',
    storageKey: `artifacts/director/${h.workspace.id}/${created.nodeId}/capture.webm`, mimeType: 'video/webm',
    bytes: 18000, width: 1280, height: 720, durationSec: 5.1 };
  const query = () => h.execute({ action: 'status', node_id: created.nodeId, operation_id: pending.operationId });
  operations.receipts.set(pending.operationId, { ...pending, status: 'completed' });
  assert.equal((await query()).error, 'director-operation-unconfirmed');
  const result = mutateWorkspaceGraph(h.store, h.workspace.id, { addNodes: [{ id: resource.outputNodeId, type: 'material',
    position: { x: 500, y: 120 }, data: { label: '白膜参考视频', materialType: 'video', status: 'completed',
      assetId: resource.assetId, relativePath: resource.storageKey, mimeType: resource.mimeType, sizeBytes: resource.bytes,
      dimensions: { width: 1280, height: 720 }, durationSec: resource.durationSec,
      directorSourceNodeId: created.nodeId, directorSourceRevision: 1 } }] });
  assert.equal(result.ok, true, JSON.stringify(result));
  operations.receipts.set(pending.operationId, { ...pending, status: 'completed', resource });
  const completed = await query();
  assert.equal(completed.ok, true, JSON.stringify(completed));
  assert.equal(completed.completed, true);
  assert.equal(completed.resource.outputNodeId, 'output_video');
  for (const changed of [{ confirmed: false }, { storageKey: '../../escape.webm' }, { assetId: 'other_asset' },
    { outputNodeId: created.nodeId }, { mimeType: 'image/png' }, { durationSec: 20 }, { bytes: 0 }]) {
    operations.receipts.set(pending.operationId, { ...pending, status: 'completed', resource: { ...resource, ...changed } });
    assert.notEqual((await query()).ok, true, JSON.stringify(changed));
  }
});

test('public request and status callbacks tolerate graph mirrors but reject graph intent changed during the callback', async t => {
  for (const action of ['request', 'status']) for (const intent of [false, true]) {
    const operations = operationAdapter(); const h = fixture(t, { deps: { operations } });
    const created = await h.execute({ action: 'create' });
    const pending = await h.execute({ action: 'open', node_id: created.nodeId, expected_revision: 1 });
    const before = h.deps.host.getScene(h.workspace.id, created.nodeId);
    const callback = input => {
      const patched = mutateWorkspaceGraph(h.store, h.workspace.id, { nodePatches: [{ nodeId: created.nodeId,
        data: { directorRevision: 1, directorSceneId: before.scene.id, directorCover: 'normal mirror',
          ...(intent ? { title: 'user changed while awaiting callback' } : { boardUnknown: 'non-scene metadata' }) } }] });
      assert.equal(patched.ok, true, JSON.stringify(patched));
      assert.deepEqual(h.deps.host.getScene(h.workspace.id, created.nodeId), before);
      return action === 'request' ? { ...input, status: 'pending' } : operations.receipts.get(input.operationId);
    };
    if (action === 'request') operations.request = callback; else operations.get = callback;
    const result = await h.execute(action === 'request' ? { action: 'open', node_id: created.nodeId, expected_revision: 1 }
      : { action: 'status', node_id: created.nodeId, operation_id: pending.operationId });
    if (intent) assert.equal(result.error, 'director-operation-identity-mismatch', `${action}: ${JSON.stringify(result)}`);
    else { assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.status, 'pending'); }
  }
});

test('late browser request and status receipts cannot cross a changed authoritative scene revision', async t => {
  const operations = operationAdapter();
  const h = fixture(t, { deps: { operations } });
  const created = await h.execute({ action: 'create' });
  const change = async () => h.execute({ action: 'save', node_id: created.nodeId, expected_revision: 1,
    scene: { ...created.document.scene, title: '新修订' } });
  operations.request = async request => { await change(); return { ...request, status: 'pending' }; };
  const late = await h.execute({ action: 'open', node_id: created.nodeId, expected_revision: 1 });
  assert.equal(late.error, 'version_conflict');
  assert.notEqual(late.ok, true);
  const second = await h.execute({ action: 'create' });
  operations.request = request => { const receipt = { ...request, status: 'pending' }; operations.receipts.set(request.operationId, receipt); return receipt; };
  const pending = await h.execute({ action: 'open', node_id: second.nodeId, expected_revision: 1 });
  operations.get = async query => {
    await h.execute({ action: 'save', node_id: second.nodeId, expected_revision: 1, scene: { ...second.document.scene, title: '查询期间改动' } });
    return operations.receipts.get(query.operationId);
  };
  const status = await h.execute({ action: 'status', node_id: second.nodeId, operation_id: pending.operationId });
  assert.equal(status.error, 'version_conflict');
});

test('public director rejects a named foreign canvas even when the current project page cannot resolve', async t => {
  const h = fixture(t);
  const projectStore = createProjectStore({ libraryRoot: join(h.root, 'library') });
  projectStore.create('当前项目', { projectRoot: h.project, canvasWorkspaceIds: ['ws_deleted_page'] });
  const foreign = h.store.create('其他项目画布');
  h.setActive(undefined);
  const tool = createDirectorTools({ ...h.deps, projectStore })[0];
  const exec = { session: { id: 'session-current', header: { cwd: h.project } } };
  for (const args of [{ action: 'create', workspace_name: foreign.name }, { action: 'create', workspace_id: foreign.id }]) {
    const result = await tool.execute(args, exec);
    assert.equal(result.error, 'outside-project-boundary', JSON.stringify(result));
  }
  assert.equal(h.store.get(foreign.id).nodes.length, 0);
});

test('browser receipts keep lifecycle meanings strict and reject every foreign identity', async t => {
  const operations = operationAdapter();
  const h = fixture(t, { deps: { operations } });
  const created = await h.execute({ action: 'create' });
  const opened = await h.execute({ action: 'open', node_id: created.nodeId, expected_revision: 1 });
  const pending = opened.receipt;
  const query = () => h.execute({ action: 'status', node_id: created.nodeId, operation_id: pending.operationId });
  operations.receipts.set(pending.operationId, { ...pending, status: 'error' });
  assert.equal((await query()).error, 'director-operation-invalid-receipt');
  for (const changed of [{ operationId: 'foreign_operation' }, { workspaceId: 'ws_foreign' }, { nodeId: 'foreign_node' },
    { sceneId: 'foreign_scene' }, { projectKey: 'a'.repeat(64) }, { sourceRevision: 2 }, { workspaceVersion: 99 }]) {
    operations.receipts.set(pending.operationId, { ...pending, ...changed });
    assert.equal((await query()).error, 'director-operation-identity-mismatch', JSON.stringify(changed));
  }
  operations.receipts.set(pending.operationId, { ...pending, kind: 'image' });
  assert.equal((await query()).error, 'director-operation-invalid-receipt');
  operations.receipts.set(pending.operationId, { ...pending, status: 'completed' });
  assert.equal((await query()).error, 'director-operation-unconfirmed');
  operations.receipts.set(pending.operationId, { ...pending, status: 'completed', confirmed: true, opened: true });
  assert.equal((await query()).completed, true);
  operations.receipts.set(pending.operationId, { ...pending, status: 'error', error: 'webgl-unavailable' });
  const failed = await query(); assert.equal(failed.ok, false); assert.equal(failed.receipt.error, 'webgl-unavailable');
  operations.receipts.set(pending.operationId, { ...pending, status: 'cancelled' });
  assert.equal((await query()).completed, false);
});

test('pending export receipts cannot substitute another shot or carry open-only confirmations', async t => {
  const operations = operationAdapter();
  const h = fixture(t, { deps: { operations } });
  const created = await h.execute({ action: 'create' });
  const request = await h.execute({ action: 'export', node_id: created.nodeId, expected_revision: 1, kind: 'image' });
  const pending = request.receipt;
  operations.receipts.set(pending.operationId, { ...pending, shot: { ...pending.shot, cameraId: 'foreign_camera' } });
  const query = { action: 'status', node_id: created.nodeId, operation_id: pending.operationId };
  assert.equal((await h.execute(query)).error, 'director-operation-identity-mismatch');
  operations.receipts.set(pending.operationId, { ...pending, status: 'completed', opened: true, confirmed: true });
  assert.equal((await h.execute(query)).error, 'director-operation-invalid-receipt');
});

test('published argument JSON schema exposes only six strict actions and documents browser handoff without arbitrary data', t => {
  const h = fixture(t);
  const contract = validateToolContract(h.tool);
  assert.equal(contract.valid, true, JSON.stringify(contract.errors));
  const schema = h.tool.parameters;
  assert.deepEqual(schema.oneOf.map(branch => branch.properties.action.const), ['create', 'read', 'save', 'open', 'export', 'status']);
  for (const branch of schema.oneOf) assert.equal(branch.additionalProperties, false);
  const save = schema.oneOf.find(branch => branch.properties.action.const === 'save');
  assert.deepEqual(save.required, ['action', 'node_id', 'expected_revision', 'scene']);
  assert.equal(save.properties.scene.additionalProperties, false);
  assert.match(h.tool.description, /保存/);
  assert.match(h.tool.description, /打开/);
  assert.match(h.tool.description, /导出/);
  assert.match(h.tool.description, /状态/);
  assert.match(h.tool.description, /浏览器/);
});

test('missing or incomplete browser capability and absent project or canvas fail closed without creating another authority', async t => {
  const h = fixture(t, { deps: { operations: {} } });
  const created = await h.execute({ action: 'create' });
  assert.equal((await h.execute({ action: 'open', node_id: created.nodeId, expected_revision: 1 })).error, 'director-operations-unavailable');
  assert.equal((await h.execute({ action: 'status', node_id: created.nodeId })).operationsStatus, 'unavailable');
  h.setActive(undefined);
  assert.equal((await h.execute({ action: 'create' })).error, 'no-current-workspace');
  const unbound = fixture(t, { unbound: true });
  assert.equal((await unbound.execute({ action: 'create' })).error, 'project-required');
  assert.equal(unbound.store.get(unbound.workspace.id).nodes.length, 0);
  assert.equal((await h.execute({ action: 'read', workspace_id: h.workspace.id, node_id: 'missing_node' })).error, 'director-node-not-found');
});

test('save revision zero can initialize a director node whose scene has never been confirmed', async t => {
  const h = fixture(t);
  const created = await h.execute({ action: 'create' });
  assert.equal(mutateWorkspaceGraph(h.store, h.workspace.id, { addNodes: [{ id: 'director_uninitialized', type: 'director',
    position: { x: 500, y: 120 }, data: { label: '待初始化' } }] }).ok, true);
  const saved = await h.execute({ action: 'save', node_id: 'director_uninitialized', expected_revision: 0,
    scene: { ...created.document.scene, id: 'scene_initialized', title: '恢复初始化' } });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.revision, 1);
  assert.equal((await h.execute({ action: 'read', node_id: 'director_uninitialized' })).document.scene.title, '恢复初始化');
});
