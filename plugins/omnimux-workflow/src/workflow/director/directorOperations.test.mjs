import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync, readdirSync, realpathSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
import { createProjectAssetsStore } from '../workspace/ProjectAssetsStore.ts';
import { createDirectorHost } from './directorHost.ts';
import { createDirectorTools } from '../agent/directorTools.ts';
import { createDirectorOperations } from './directorOperations.ts';
import { persistDirectorMedia } from './directorMedia.ts';
import { mutateWorkspaceGraph } from '../graph/GraphMutator.ts';

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'director-operations-'));
  const project = join(root, 'project'); mkdirSync(project);
  let bound = project;
  const store = createWorkspaceStore({ workspacesDir: join(root, 'workspaces'), resolveProjectRoot: () => ({ path: bound }) });
  const workspace = store.create('导演操作');
  const host = createDirectorHost({ store });
  const assetsStore = createProjectAssetsStore({ workspacesDir: join(root, 'workspaces'), resolveProjectRoot: () => ({ path: bound }) });
  const tool = createDirectorTools({ store, host, getActiveView: () => ({ uiContext: { view: { kind: 'canvas', extra: { workspaceId: workspace.id } } } }) })[0];
  const created = await tool.execute({ action: 'create' }); assert.equal(created.ok, true);
  const request = { schemaVersion: 1, operationId: 'operation_first', workspaceId: workspace.id, nodeId: created.nodeId,
    sceneId: created.document.scene.id, projectKey: createHash('sha256').update(project).digest('hex'),
    sourceRevision: 1, workspaceVersion: store.get(workspace.id).version, action: 'open' };
  const deps = { host, store, assetsStore };
  t.after(() => { assert.ok(root.startsWith(`${resolve(tmpdir())}/`)); rmSync(root, { recursive: true, force: true }); });
  return { root, project, workspace, host, store, assetsStore, request, deps, operations: createDirectorOperations(deps), setProject: path => { bound = path; } };
}
// A trusted browser public receipt dependency: protocol evidence only, no actual capture.
const browser = {
  open(operations, request, claim) {
    return operations.complete({ receipt: { ...request, status: 'completed', confirmed: true, opened: true },
      ownerId: claim.ownerId, claimToken: claim.claimToken });
  },
};
function query(request, version = request.workspaceVersion) {
  const { action, kind, shot, ...identity } = request;
  return { ...identity, workspaceVersion: version };
}

test('video receipt must keep authoritative shot duration MIME and source revision', async t => {
  const h = await fixture(t);
  const shot = h.host.getScene(h.request.workspaceId, h.request.nodeId).scene.shots[0];
  const request = { ...h.request, action: 'export', kind: 'video', shot: { id: shot.id, cameraId: shot.cameraId, duration: 5, fps: 30 } };
  h.operations.request(request); const claim = h.operations.claim({ request, ownerId: 'browser_capture' });
  const saved = await persistDirectorMedia({ host: h.host, assetsStore: h.assetsStore, workspaceId: request.workspaceId, nodeId: request.nodeId,
    kind: 'video', bytes: Buffer.from('synthetic-public-video-protocol'), expectedRevision: 1, signal: new AbortController().signal,
    inspector: { async inspect() { return { mime: 'video/webm', sizeBytes: 31, width: 640, height: 360, duration: 5 }; } } });
  const resource = { confirmed: true, assetId: saved.assetId, outputNodeId: 'output_video', storageKey: saved.storageKey,
    mimeType: saved.mimeType, bytes: saved.bytes, width: 640, height: 360, durationSec: 5 };
  const receipt = { ...request, status: 'completed', resource };
  const data = { materialType: 'video', status: 'completed', assetId: resource.assetId, relativePath: resource.storageKey,
    mimeType: resource.mimeType, sizeBytes: resource.bytes, dimensions: { width: 640, height: 360 }, durationSec: 5,
    directorSourceNodeId: request.nodeId, directorSourceRevision: 1 };
  const added = mutateWorkspaceGraph(h.store, request.workspaceId, { addNodes: [{ id: resource.outputNodeId, type: 'material', position: { x: 1, y: 1 }, data }] }); assert.equal(added.ok, true);
  const complete = value => h.operations.complete({ receipt: value, ownerId: claim.ownerId, claimToken: claim.claimToken });
  for (const change of [{ durationSec: 7 }, { durationSec: undefined }, { mimeType: 'video/mp4' }]) {
    assert.throws(() => complete({ ...receipt, resource: { ...resource, ...change } }), /unconfirmed/);
  }
  assert.throws(() => complete({ ...receipt, shot: { ...receipt.shot, fps: 24 } }), /identity-mismatch/);
  assert.equal(complete(receipt).status, 'completed');
});

test('tampered durable receipts cannot manufacture completed open without a claim', async t => {
  const h = await fixture(t); h.operations.request(h.request);
  const file = join(h.project, '.omnimux', 'director-operations', h.workspace.id, h.request.operationId, '0.json');
  const stored = JSON.parse(readFileSync(file, 'utf8'));
  stored.receipt = { ...h.request, status: 'completed', confirmed: true, opened: true };
  writeFileSync(file, JSON.stringify(stored));
  assert.throws(() => h.operations.get(query(h.request)), /invalid-record/);
});

test('public director tools use the durable handoff factory without exposing claim authority', async t => {
  const h = await fixture(t);
  const tool = createDirectorTools({ store: h.store, host: h.host, operations: h.operations,
    getActiveView: () => ({ uiContext: { view: { kind: 'canvas', extra: { workspaceId: h.workspace.id } } } }) })[0];
  const pending = await tool.execute({ action: 'open', node_id: h.request.nodeId, expected_revision: 1 });
  assert.equal(pending.completed, false); assert.equal(pending.status, 'pending');
  assert.equal(pending.claimToken, undefined); assert.equal(pending.receipt.claimToken, undefined);
  const entry = h.operations.list({ workspaceId: h.workspace.id })[0];
  const claim = h.operations.claim({ request: entry.request, ownerId: 'browser_one' });
  browser.open(h.operations, entry.request, claim);
  const status = await tool.execute({ action: 'status', node_id: h.request.nodeId, operation_id: pending.operationId });
  assert.equal(status.completed, true); assert.equal(status.receipt.opened, true);
});

test('real public create and queued open survive same-node graph bookkeeping before claim completion and status', async t => {
  const h = await fixture(t);
  const tool = createDirectorTools({ store: h.store, host: h.host, operations: h.operations,
    getActiveView: () => ({ uiContext: { view: { kind: 'canvas', extra: { workspaceId: h.workspace.id } } } }) })[0];
  const document = h.host.getScene(h.workspace.id, h.request.nodeId);
  const pending = await tool.execute({ action: 'open', node_id: h.request.nodeId, expected_revision: 1 });
  const request = h.operations.list({ workspaceId: h.workspace.id })[0].request;
  const patch = data => {
    const result = mutateWorkspaceGraph(h.store, h.workspace.id, { nodePatches: [{ nodeId: request.nodeId, data,
      node: { position: { x: 700, y: 310 }, selected: true, measured: { width: 330, height: 220 } } }] });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(h.host.getScene(h.workspace.id, request.nodeId), document);
  };
  patch({ directorRevision: 1, directorSceneId: document.scene.id, directorActiveShotId: 'shot_1',
    directorCover: 'cover-before-claim', boardMetadata: { arbitrary: 'not-scene-content' } });
  assert.equal(h.operations.list({ workspaceId: h.workspace.id })[0].request.operationId, pending.operationId);
  const claim = h.operations.claim({ request, ownerId: 'browser_one' });
  patch({ directorRevision: 0, directorCover: 'cover-before-completion', status: 'idle', directorDescriptionApplied: 'mirror-only' });
  assert.equal(browser.open(h.operations, request, claim).status, 'completed');
  patch({ directorRevision: 1, directorCover: 'cover-before-status', boardMetadata: { arbitrary: 'changed-again' } });
  const status = await tool.execute({ action: 'status', node_id: request.nodeId, operation_id: pending.operationId });
  assert.equal(status.ok, true, JSON.stringify(status)); assert.equal(status.completed, true);
  assert.equal(status.receipt.workspaceVersion, request.workspaceVersion);
  assert.equal(h.operations.get(query(request, h.store.get(h.workspace.id).version)).status, 'completed');
});

test('graph user intent edits remain invalid at claim completion and completed status with unchanged Host documents', async t => {
  const changes = [{ title: 'new user title' }, { label: 'new user label' }, { description: 'new graph description' },
    { directorDescriptionEdit: 'new_user_edit' }, { directorDescriptionSourceRevision: 0 },
    { directorDescriptionSceneId: 'another_scene' }, { directorDescriptionShotId: 'another_shot' },
    { directorSceneId: 'replacement_scene' }];
  for (const stage of ['claim', 'complete', 'status']) for (const data of changes) {
    const h = await fixture(t); const document = h.host.getScene(h.workspace.id, h.request.nodeId);
    h.operations.request(h.request);
    const claim = stage === 'claim' ? null : h.operations.claim({ request: h.request, ownerId: 'browser_one' });
    if (stage === 'status') browser.open(h.operations, h.request, claim);
    const patched = mutateWorkspaceGraph(h.store, h.workspace.id, { nodePatches: [{ nodeId: h.request.nodeId, data }] });
    assert.equal(patched.ok, true, JSON.stringify(patched));
    assert.deepEqual(h.host.getScene(h.workspace.id, h.request.nodeId), document);
    const action = stage === 'claim' ? () => h.operations.claim({ request: h.request, ownerId: 'browser_one' })
      : stage === 'complete' ? () => browser.open(h.operations, h.request, claim)
        : () => h.operations.get(query(h.request, h.store.get(h.workspace.id).version));
    assert.throws(action, error => error.code === 'director-operation-identity-mismatch', `${stage}: ${JSON.stringify(data)}`);
  }
});

test('same-id replacements cannot reuse an old operation with a different title label scene or node type', async t => {
  for (const change of [{ data: { title: 'replacement title' } }, { data: { label: 'replacement label' } },
    { data: { directorSceneId: 'replacement_scene' } }, { type: 'material' }]) {
    const h = await fixture(t); h.operations.request(h.request);
    const claim = h.operations.claim({ request: h.request, ownerId: 'browser_one' });
    const original = h.store.get(h.workspace.id).nodes.find(node => node.id === h.request.nodeId);
    assert.equal(mutateWorkspaceGraph(h.store, h.workspace.id, { removeNodeIds: [original.id] }).ok, true);
    const replacement = { ...original, ...change, data: { ...original.data, ...change.data } };
    assert.equal(mutateWorkspaceGraph(h.store, h.workspace.id, { addNodes: [replacement] }).ok, true);
    if (!change.type) assert.deepEqual(h.host.getScene(h.workspace.id, original.id).scene.id, h.request.sceneId);
    assert.throws(() => browser.open(h.operations, h.request, claim), /identity-mismatch|director-node-not-found/);
  }
});

test('legacy whole-node records are explicitly unverified and never upgraded or accepted after graph updates', async t => {
  const h = await fixture(t); h.operations.request(h.request);
  const file = join(h.project, '.omnimux', 'director-operations', h.workspace.id, h.request.operationId, '0.json');
  const stored = JSON.parse(readFileSync(file, 'utf8')); delete stored.validationVersion;
  stored.sourceNodeHash = createHash('sha256').update(JSON.stringify(h.store.get(h.workspace.id).nodes[0])).digest('hex');
  const legacy = JSON.stringify(stored); writeFileSync(file, legacy);
  assert.equal(mutateWorkspaceGraph(h.store, h.workspace.id, { nodePatches: [{ nodeId: h.request.nodeId,
    data: { directorRevision: 1, directorSceneId: h.request.sceneId } }] }).ok, true);
  const restarted = createDirectorOperations(h.deps);
  for (const action of [() => restarted.request(h.request), () => restarted.claim({ request: h.request, ownerId: 'browser_one' }),
    () => restarted.get(query(h.request)), () => restarted.list({ workspaceId: h.workspace.id }),
    () => restarted.complete({ receipt: { ...h.request, status: 'completed', opened: true, confirmed: true }, ownerId: 'browser_one', claimToken: 'arbitrary' })]) {
    assert.throws(action, error => error.code === 'director-operation-legacy-unverified');
  }
  assert.equal(readFileSync(file, 'utf8'), legacy);
  assert.deepEqual(readdirSync(join(h.project, '.omnimux', 'director-operations', h.workspace.id, h.request.operationId)), ['0.json']);
  const fresh = { ...h.request, operationId: 'operation_fresh', workspaceVersion: h.store.get(h.workspace.id).version };
  assert.equal(restarted.request(fresh).status, 'pending');
});

test('request stays pending when another writer creates a previously missing queue directory', async t => {
  const h = await fixture(t);
  const target = join(h.project, '.omnimux', 'director-operations');
  const canonicalTarget = join(realpathSync(h.project), '.omnimux', 'director-operations');
  const lstat = fs.lstatSync;
  let created = false;
  const observed = [];
  t.mock.method(fs, 'lstatSync', function(path, ...options) {
    try { return lstat(path, ...options); }
    catch (error) {
      if ([target, canonicalTarget].includes(path) && error.code === 'ENOENT' && !created) {
        observed.push({ path, firstProbe: error.code });
        mkdirSync(target); created = true;
        observed.push({ secondProbeIsDirectory: lstat(target).isDirectory() });
      }
      throw error;
    }
  });
  syncBuiltinESMExports();
  try {
    assert.deepEqual(h.operations.request(h.request), { ...h.request, status: 'pending' });
    assert.equal(created, true);
    assert.equal(h.operations.get(query(h.request)).status, 'pending');
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    t.diagnostic(JSON.stringify(observed));
  }
});

test('queue rejects symlink directories and durable version leaves including dangling links', async t => {
  for (const position of ['queue', 'workspace', 'operation', 'version', 'dangling-version']) {
    const h = await fixture(t);
    const queue = join(h.project, '.omnimux', 'director-operations');
    const workspace = join(queue, h.workspace.id);
    const operation = join(workspace, h.request.operationId);
    const outside = join(h.root, `outside-${position}`); mkdirSync(outside);
    const linked = position === 'queue' ? queue : position === 'workspace' ? workspace : position === 'operation' ? operation : join(operation, '0.json');
    const parent = position === 'queue' ? join(h.project, '.omnimux') : position === 'workspace' ? queue : position === 'operation' ? workspace : operation;
    mkdirSync(parent, { recursive: true });
    const destination = position === 'version' ? join(outside, '0.json') : position === 'dangling-version' ? join(outside, 'missing.json') : outside;
    if (position === 'version') writeFileSync(destination, 'not-a-receipt');
    symlinkSync(destination, linked);
    const before = readdirSync(outside);
    assert.throws(() => h.operations.request(h.request), error => error.code === 'path-denied', position);
    assert.throws(() => h.operations.get(query(h.request)), error => error.code === 'path-denied', position);
    assert.deepEqual(readdirSync(outside), before, position);
  }
});

test('queue rejects a version symlink inserted after the missing entry check', async t => {
  const h = await fixture(t);
  const operation = join(h.project, '.omnimux', 'director-operations', h.workspace.id, h.request.operationId);
  mkdirSync(operation, { recursive: true });
  const outside = join(h.root, 'outside.json'); writeFileSync(outside, 'not-a-receipt');
  const target = join(operation, '0.json');
  const canonicalTarget = join(realpathSync(operation), '0.json');
  const lstat = fs.lstatSync;
  let inserted = false;
  t.mock.method(fs, 'lstatSync', function(path, ...options) {
    try { return lstat(path, ...options); }
    catch (error) {
      if ([target, canonicalTarget].includes(path) && error.code === 'ENOENT' && !inserted) {
        symlinkSync(outside, target); inserted = true;
      }
      throw error;
    }
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => h.operations.request(h.request), error => error.code === 'director-operation-invalid-record');
    assert.equal(inserted, true);
    assert.equal(readFileSync(outside, 'utf8'), 'not-a-receipt');
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});

test('independent host processes share operationId and exactly one browser claim wins', async t => {
  const h = await fixture(t);
  const moduleUrl = name => new URL(name, import.meta.url).href;
  const code = `import {createWorkspaceStore} from ${JSON.stringify(moduleUrl('../workspace/WorkspaceStore.ts'))};
import {createDirectorHost} from ${JSON.stringify(moduleUrl('./directorHost.ts'))};
import {createDirectorOperations} from ${JSON.stringify(moduleUrl('./directorOperations.ts'))};
const input=JSON.parse(process.env.DIRECTOR_PROTOCOL_INPUT);
const store=createWorkspaceStore({workspacesDir:input.workspacesDir,resolveProjectRoot:()=>({path:input.project})});
const operations=createDirectorOperations({store,host:createDirectorHost({store}),assetsStore:{get(){throw Error('not-used-open');}}});
process.once('message', () => {
  try { const value=input.claim ? operations.claim({request:input.request,ownerId:input.ownerId}) : operations.request(input.request); console.log(JSON.stringify({value})); }
  catch(error){console.log(JSON.stringify({error:error.code,message:error.message,stack:error.stack}));}
  finally {process.disconnect();}
});
process.send('ready');`;
  async function runTogether(inputs) {
    const children = inputs.map(([claim, ownerId]) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code], {
        env: { ...process.env, DIRECTOR_PROTOCOL_INPUT: JSON.stringify({ request: h.request, project: h.project, workspacesDir: join(h.root, 'workspaces'), claim, ownerId }) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      const ready = new Promise((resolve, reject) => {
        child.once('message', message => message === 'ready' ? resolve() : reject(Error('unexpected child message')));
        child.once('error', reject);
        child.once('exit', () => reject(Error('child exited before release')));
      });
      const result = new Promise((resolve, reject) => {
        let output = '', stderr = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { stderr += data; });
        child.on('error', reject); child.on('close', exit => {
          if (exit !== 0) return reject(Error(stderr));
          try { resolve(JSON.parse(output)); } catch (error) { reject(error); }
        });
      });
      return { child, ready, result };
    });
    try {
      await Promise.all(children.map(item => item.ready));
      for (const { child } of children) child.send('go');
      return await Promise.all(children.map(item => item.result));
    } finally { for (const { child } of children) if (child.exitCode === null) child.kill(); }
  }
  const pending = await runTogether([[false], [false], [false]]);
  assert.equal(pending.filter(result => result.value?.status === 'pending').length, 3, JSON.stringify(pending));
  const claimed = await runTogether([[true, 'browser_one'], [true, 'browser_two']]);
  assert.equal(claimed.filter(result => result.value?.receipt.status === 'running').length, 1, JSON.stringify(claimed));
  assert.equal(claimed.filter(result => ['director-operation-busy', 'director-operation-already-claimed'].includes(result.error)).length, 1, JSON.stringify(claimed));
  const winner = claimed.find(result => result.value)?.value;
  assert.equal(browser.open(h.operations, h.request, winner).status, 'completed');
  const directory = join(h.project, '.omnimux', 'director-operations', h.workspace.id, h.request.operationId);
  assert.deepEqual(readdirSync(directory).sort(), ['0.json', '1.json', '2.json']);
  for (const [version, status] of ['pending', 'running', 'completed'].entries()) {
    const record = JSON.parse(readFileSync(join(directory, `${version}.json`), 'utf8'));
    assert.equal(record.version, version); assert.equal(record.receipt.status, status);
    assert.deepEqual(record.request, h.request);
    if (version > 0) assert.equal(record.claim.ownerId, winner.ownerId);
  }
});

test('late browser completion refuses stale scenes source nodes projects and workspaces', async t => {
  const h = await fixture(t); h.operations.request(h.request);
  const claim = h.operations.claim({ request: h.request, ownerId: 'browser_one' });
  const foreign = { ...h.request, operationId: 'operation_foreign' }; h.operations.request(foreign);
  assert.throws(() => h.operations.complete({ receipt: { ...foreign, status: 'completed', confirmed: true, opened: true }, ownerId: claim.ownerId, claimToken: claim.claimToken }), /not-claimed/);
  const current = h.host.getScene(h.request.workspaceId, h.request.nodeId);
  h.host.saveScene(h.request.workspaceId, h.request.nodeId, { expectedRevision: 1, scene: { ...current.scene, title: '新版本' } });
  assert.throws(() => browser.open(h.operations, h.request, claim), /identity-mismatch/);
  assert.throws(() => h.operations.get(query(h.request)), /identity-mismatch/);
  assert.deepEqual(h.operations.list({ workspaceId: h.workspace.id }), []);
  const deleted = await fixture(t); deleted.operations.request(deleted.request);
  const dc = deleted.operations.claim({ request: deleted.request, ownerId: 'browser_one' });
  mutateWorkspaceGraph(deleted.store, deleted.request.workspaceId, { removeNodeIds: [deleted.request.nodeId] });
  assert.throws(() => browser.open(deleted.operations, deleted.request, dc), /director-node-not-found/);
  const moved = await fixture(t); moved.operations.request(moved.request);
  const mc = moved.operations.claim({ request: moved.request, ownerId: 'browser_one' });
  const other = join(moved.root, 'other'); mkdirSync(other); moved.setProject(other);
  assert.throws(() => browser.open(moved.operations, moved.request, mc), /not-found/);
});

test('completed exports require the actual registered hashed file and matching material source projection', async t => {
  const h = await fixture(t);
  const shot = h.host.getScene(h.request.workspaceId, h.request.nodeId).scene.shots[0];
  const request = { ...h.request, action: 'export', kind: 'image', shot: { id: shot.id, cameraId: shot.cameraId, duration: shot.duration, fps: shot.fps } };
  h.operations.request(request);
  const claim = h.operations.claim({ request, ownerId: 'browser_capture' });
  // Public media inspection dependency is synthetic; this does not prove browser capture or decoding.
  const saved = await persistDirectorMedia({ host: h.host, assetsStore: h.assetsStore, workspaceId: request.workspaceId, nodeId: request.nodeId,
    kind: 'image', bytes: Buffer.from('trusted-protocol-fixture'), expectedRevision: 1, signal: new AbortController().signal,
    inspector: { async inspect() { return { mime: 'image/png', sizeBytes: 24, width: 640, height: 360 }; } } });
  const resource = { confirmed: true, assetId: saved.assetId, outputNodeId: 'output_first', storageKey: saved.storageKey,
    mimeType: saved.mimeType, bytes: saved.bytes, width: saved.width, height: saved.height };
  const receipt = { ...request, status: 'completed', resource };
  const complete = value => h.operations.complete({ receipt: value, ownerId: claim.ownerId, claimToken: claim.claimToken });
  assert.throws(() => complete(receipt), /unconfirmed/);
  const data = { materialType: 'image', status: 'completed', assetId: resource.assetId, relativePath: resource.storageKey,
    mimeType: resource.mimeType, sizeBytes: resource.bytes, dimensions: { width: 640, height: 360 },
    directorSourceNodeId: request.nodeId, directorSourceRevision: 1 };
  mutateWorkspaceGraph(h.store, request.workspaceId, { addNodes: [{ id: resource.outputNodeId, type: 'material', position: { x: 1, y: 1 }, data }] });
  assert.throws(() => complete({ ...receipt, resource: { ...resource, width: 641 } }), /unconfirmed/);
  assert.throws(() => complete({ ...receipt, resource: { ...resource, storageKey: resource.storageKey.replace(/[^/]+$/, 'missing.png') } }), /unconfirmed/);
  assert.equal(complete(receipt).status, 'completed');
  const bytesFile = join(h.project, resource.storageKey);
  writeFileSync(bytesFile, Buffer.from('different-protocol-bytes'));
  assert.throws(() => h.operations.get(query(request, h.store.get(request.workspaceId).version)), /unconfirmed/);
  writeFileSync(bytesFile, Buffer.from('trusted-protocol-fixture'));
  assert.equal(h.operations.get(query(request, h.store.get(request.workspaceId).version)).resource.assetId, saved.assetId);
  const ledger = h.assetsStore.get(request.workspaceId);
  h.assetsStore.save(request.workspaceId, { expectedRev: ledger.rev, folders: ledger.folders, items: [] });
  assert.throws(() => h.operations.get(query(request, h.store.get(request.workspaceId).version)), /unconfirmed/);
});

test('bounded leases never green on owner death and cancellation failure are durable terminal states', async t => {
  const h = await fixture(t); h.operations.request(h.request);
  t.mock.method(Date, 'now', () => 1000000);
  const claim = h.operations.claim({ request: h.request, ownerId: 'browser_one', leaseMs: 1000 });
  t.mock.method(Date, 'now', () => 1000600);
  const renewed = h.operations.renew({ request: h.request, ownerId: claim.ownerId, claimToken: claim.claimToken, leaseMs: 1000 });
  assert.equal(renewed.leaseUntil, 1001600);
  t.mock.method(Date, 'now', () => 1001700);
  const restarted = createDirectorOperations(h.deps);
  assert.equal(restarted.get(query(h.request)).status, 'error');
  assert.equal(restarted.get(query(h.request)).error, 'director-operation-lease-expired');
  assert.throws(() => browser.open(restarted, h.request, claim), /lease-expired|not-running/);
  assert.throws(() => restarted.claim({ request: h.request, ownerId: 'browser_two' }), /already-claimed/);
  const pending = { ...h.request, operationId: 'operation_cancel' }; restarted.request(pending);
  assert.equal(restarted.cancel({ request: pending }).status, 'cancelled');
  const failing = { ...h.request, operationId: 'operation_fail' }; restarted.request(failing);
  const failedClaim = restarted.claim({ request: failing, ownerId: 'browser_one' });
  assert.throws(() => restarted.cancel({ request: failing }), /owner-mismatch/);
  assert.equal(restarted.fail({ request: failing, ...failedClaim, error: 'browser-disconnected' }).status, 'error');
  assert.equal(createDirectorOperations(h.deps).get(query(failing)).error, 'browser-disconnected');
});

test('trusted browser must own a live claim to confirm opening and duplicates stay exact', async t => {
  const h = await fixture(t); h.operations.request(h.request);
  const receipt = { ...h.request, status: 'completed', confirmed: true, opened: true };
  assert.throws(() => h.operations.complete({ receipt, ownerId: 'browser_one', claimToken: 'arbitrary' }), /not-claimed/);
  const claim = h.operations.claim({ request: h.request, ownerId: 'browser_one', leaseMs: 1000 });
  assert.equal(claim.receipt.status, 'running');
  assert.match(claim.sceneHash, /^[a-f0-9]{64}$/);
  assert.throws(() => h.operations.claim({ request: h.request, ownerId: 'browser_two' }), /already-claimed/);
  assert.throws(() => h.operations.complete({ receipt, ownerId: 'browser_two', claimToken: claim.claimToken }), /owner-mismatch/);
  assert.throws(() => h.operations.complete({ receipt: { ...receipt, opened: undefined }, ...claim }), /invalid-receipt/);
  assert.equal(browser.open(h.operations, h.request, claim).status, 'completed');
  const restarted = createDirectorOperations(h.deps);
  assert.deepEqual(restarted.get(query(h.request)), receipt);
  assert.deepEqual(browser.open(restarted, h.request, claim), receipt);
  assert.throws(() => restarted.complete({ receipt: { ...receipt, arbitrary: true }, ownerId: claim.ownerId, claimToken: claim.claimToken }), /invalid-receipt/);
  assert.deepEqual(restarted.list({ workspaceId: h.workspace.id }), []);
});

test('public request is durable idempotent and queued only for its current workspace', async t => {
  const h = await fixture(t);
  assert.deepEqual(h.operations.request(h.request), { ...h.request, status: 'pending' });
  const restarted = createDirectorOperations(h.deps);
  assert.deepEqual(restarted.request(h.request), { ...h.request, status: 'pending' });
  assert.deepEqual(restarted.get(query(h.request)), { ...h.request, status: 'pending' });
  assert.equal(restarted.list({ workspaceId: h.workspace.id })[0].request.operationId, 'operation_first');
  const other = h.store.create('另一画布');
  assert.deepEqual(restarted.list({ workspaceId: other.id }), []);
  assert.throws(() => restarted.request({ ...h.request, action: 'export', kind: 'image', shot: { id: 'wrong', cameraId: 'wrong', duration: 5, fps: 30 } }), /identity-mismatch/);
});
