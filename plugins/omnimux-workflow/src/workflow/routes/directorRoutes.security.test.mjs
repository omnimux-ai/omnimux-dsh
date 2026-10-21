import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

// Bundle current production sources in memory, resolving their extensionless TS imports.
// This is a real HTTP transport regression, not an installed App/normal UI test.
const output = buildSync({
  stdin: { contents: `
    export { createWorkflowDispatcher, registerWorkflowRoutes } from './canvasRoutes.ts';
    export { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
    export { createProjectAssetsStore } from '../workspace/ProjectAssetsStore.ts';
    export { createProjectStore } from '../../projects/ProjectStore.ts';
    export { createDirectorHost } from '../director/directorHost.ts';
    export { createDirectorOperations } from '../director/directorOperations.ts';
    export { createDirectorSessionFactory } from '../director/directorSession.ts';
    export { directorOperationSourceHash } from '../agent/directorTools.ts';
  `, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
  bundle: true, platform: 'node', format: 'esm', write: false,
  define: { 'import.meta.url': JSON.stringify(import.meta.url) },
}).outputFiles[0].text;
const { createWorkflowDispatcher, registerWorkflowRoutes, createWorkspaceStore,
  createProjectAssetsStore, createProjectStore, createDirectorHost,
  createDirectorOperations, createDirectorSessionFactory, directorOperationSourceHash } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

const COOKIE_A = 'dsh_session=trusted-fixture-A';
const COOKIE_B = 'dsh_session=trusted-fixture-B';
const FOUR_MIB = 4 * 1024 * 1024;
const hash = text => createHash('sha256').update(text).digest('hex');
const account = id => ({ logged_in: true, verified: true, id, base_url: 'https://account.example.test' });
function scene() {
  return { id: 'scene-security', version: 1, title: '安全回归镜头', background: '#151515', environmentIntensity: 1, gridVisible: true,
    objects: [], cameras: [{ id: 'camera-1', name: '机位', transform: { position: [0, 2, 5], rotation: [0, 0, 0], scale: [1, 1, 1] },
      target: [0, 1, 0], focalLength: 35, fov: 50, aperture: 2.8, focusDistance: 5, near: 0.1, far: 100, keyframes: [] }],
    lights: [], shots: [{ id: 'shot-1', name: '镜头', cameraId: 'camera-1', duration: 5, fps: 30, shotSize: 'medium', cameraMove: 'static', prompt: '' }],
    activeShotId: 'shot-1', createdAt: '2026-10-14', updatedAt: '2026-10-14' };
}
function catalog() {
  const op = (id, type, seam, inputs) => ({ id, output: { type }, inputs: inputs.map(input => ({ slot: input.type === 'text' ? 'prompt' : 'reference_images',
    role: input.type === 'text' ? 'prompt' : 'reference', source: input.type === 'text' ? 'node_field' : 'upstream_edge', min: 1, max: 1, ...input })),
    listed: true, implementation: { status: 'ready', profileId: seam, seam } });
  return { models: [
    { id: 'offline-vision', operations: [op('vision_chat', 'text', 'textComplete', [{ type: 'text' }, { type: 'image', min: 0 }])], channelGroups: [{ id: 'offline', enabled: true }] },
    { id: 'offline-image', operations: [op('text_to_image', 'image', 'imageGenerate', [{ type: 'text' }])], channelGroups: [{ id: 'offline', enabled: true }] },
  ] };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

async function fixture(t, { identity = account('A'), connection = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'director-http-security-')));
  assert.ok(root.startsWith(`${realpathSync(tmpdir())}/director-http-security-`));
  const libraryRoot = join(root, 'library');
  const projectStore = createProjectStore({ libraryRoot });
  const workspaceId = 'ws_route_security';
  const nodeId = 'director-security';
  const project = projectStore.create('安全回归项目', { canvasWorkspaceIds: [workspaceId] });
  const resolveProjectRoot = id => projectStore.findByCanvasWorkspaceId(id);
  const store = createWorkspaceStore({ workspacesDir: join(root, 'workspaces'), resolveProjectRoot });
  store.create('安全回归工作区', workspaceId);
  store.save(workspaceId, { expectedVersion: 0, nodes: [{ id: nodeId, type: 'director', position: { x: 0, y: 0 }, data: {} }], edges: [] });
  const assetsStore = createProjectAssetsStore({ workspacesDir: store.workspacesDir, resolveProjectRoot });
  const host = createDirectorHost({ store });
  const operations = createDirectorOperations({ host, store, assetsStore });
  const state = { identity, admit: true, catalog: () => catalog(), modelExecutions: 0, taskLookups: 0, mediaInspections: 0 };
  const denyExecution = async () => { state.modelExecutions++; throw new Error('real or simulated model execution is forbidden by this HTTP security fixture'); };
  const getPublicIdentitySnapshot = () => state.identity;
  // Explicit trusted Connection test contract only. It does not prove installed auth.
  // Crucially it does NOT implement Origin checks: production raw handler must do that.
  const connectionFixture = { requestRejection(req) {
    return state.admit && [COOKIE_A, COOKIE_B].includes(req.headers.cookie) ? undefined : 401;
  } };
  const seams = {
    connection: connection ? connectionFixture : undefined,
    // The formal Hub seam is identity.getSnapshot (Host apply.js); this is its
    // trusted public snapshot fixture, never data taken from an HTTP body.
    identity: { getSnapshot: getPublicIdentitySnapshot },
    modelCatalog: { list: () => state.catalog() },
    textComplete: { execute: denyExecution },
    imageGenerate: { execute: denyExecution, findAccepted: () => { state.taskLookups++; throw new Error('task collection forbidden'); } },
    mediaInspect: { inspect: async () => { state.mediaInspections++; throw new Error('media inspection forbidden'); } },
  };
  const sessionFactory = createDirectorSessionFactory({ stateDir: join(root, 'director-auth') });
  const dispatcher = createWorkflowDispatcher({ store, projectStore, assetsStore, libraryRoot, mediaDir: join(root, 'media'),
    directorOperations: operations, directorSessionFactory: sessionFactory, getSeam: name => seams[name] });
  const routes = [];
  const unregister = registerWorkflowRoutes({ register(route) { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1); }; } }, dispatcher);
  const server = createServer((req, res) => {
    const route = routes.find(row => new URL(req.url, 'http://127.0.0.1').pathname.startsWith(row.path));
    if (!route) { res.writeHead(404); res.end(); return; }
    route.handler(req, res).catch(error => { res.destroy(error); });
  });
  t.after(async () => {
    unregister();
    await new Promise((done, fail) => server.close(error => error ? fail(error) : done()));
    assert.equal(state.modelExecutions, 0, 'security regressions must never execute a model');
    assert.equal(state.taskLookups, 0, 'read-only HTTP must never look up or collect an upstream task');
    assert.equal(state.mediaInspections, 0, 'read-only HTTP must never inspect or register generated media');
    assert.ok(root.startsWith(`${realpathSync(tmpdir())}/director-http-security-`));
    rmSync(root, { recursive: true, force: true });
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base = `/omnimux-workflow/api/workspaces/${workspaceId}/director/${nodeId}`;
  async function send(path = base, { method = 'GET', cookie = COOKIE_A, originHeader = origin, referer, body, raw, headers = {} } = {}) {
    const content = raw ?? (body === undefined ? undefined : JSON.stringify(body));
    return new Promise((done, fail) => {
      const req = httpRequest(`${origin}${path}`, { method, agent: false, headers: {
        ...(cookie === null ? {} : { Cookie: cookie }), ...(originHeader === null ? {} : { Origin: originHeader }),
        ...(referer ? { Referer: referer } : {}), ...(content === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(content) }), ...headers,
      } }, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', fail);
        res.on('end', () => { try { done({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') }); } catch (error) { fail(error); } });
      });
      req.setTimeout(10000, () => req.destroy(new Error('loopback HTTP request timed out')));
      req.on('error', fail); req.end(content);
    });
  }
  async function save(input = scene(), expectedRevision = 0, options = {}) {
    return send(base, { method: 'PUT', body: { expectedRevision, scene: input }, ...options });
  }
  async function session(options = {}) {
    const response = await send(`${base}/session`, options); assert.equal(response.status, 200); return response.body;
  }
  return { root, project, store, assetsStore, host, operations, state, seams, dispatcher, base, origin, workspaceId, nodeId, send, save, session };
}

test('encoded director route spelling cannot bypass Connection or exact Origin admission', async t => {
  const f = await fixture(t);
  const encoded = f.base.replace('/director/', '/%64irector/');
  const missingCookie = await f.send(encoded, { cookie: null });
  assert.equal(missingCookie.status, 401);
  const foreignOrigin = await f.send(encoded, { originHeader: 'https://other.example.test' });
  assert.equal(foreignOrigin.status, 403);
  const operations = '/omnimux-workflow/api/workspaces/ws_route_security/%64irector-operations';
  assert.equal((await f.send(operations, { cookie: null })).status, 401);
});

// Tracer 1: admission is tested at the registered raw handler, before any JSON DTO.
test('raw director HTTP denies no/invalid cookie even if JSON claims authentication', async t => {
  const f = await fixture(t);
  for (const cookie of [null, 'dsh_session=untrusted']) {
    const response = await f.save(scene(), 0, { cookie, body: { expectedRevision: 0, scene: scene(), authenticated: true,
      browserOwner: 'forged-owner', directorSession: { cloudAccount: { status: 'known' }, modelTaskScope: 'forged-scope' } } });
    assert.equal(response.status, 401); assert.equal(response.body.error, 'unauthorized');
    assert.equal((await f.send(`${f.base}/session`, { cookie })).status, 401);
  }
  assert.equal((await f.send()).status, 404, 'rejected writes must not create a scene');
});

test('raw director HTTP fails closed when Connection admission is unavailable', async t => {
  const f = await fixture(t, { connection: false });
  const response = await f.send(`${f.base}/session`);
  assert.equal(response.status, 503); assert.equal(response.body.error, 'auth-unavailable');
});

test('cross-port Origin denies GET even with admitted cookie', async t => {
  const f = await fixture(t); assert.equal((await f.save()).status, 200);
  const foreign = `http://127.0.0.1:${new URL(f.origin).port === '1' ? '2' : '1'}`;
  for (const [path, method, body] of [[f.base, 'GET'], [`${f.base}/session`, 'GET'], [`${f.base}/capabilities`, 'GET'],
    [`${f.base}/panorama/history`, 'GET']]) {
    const response = await f.send(path, { method, body, originHeader: foreign });
    assert.equal(response.status, 403, `${method} ${path} must reject a different loopback port`);
    assert.equal(response.body.error, 'not-local');
  }
});

test('cross-port Origin POST returns a deliberate denial rather than an internal error', async t => {
  const f = await fixture(t); assert.equal((await f.save()).status, 200);
  const response = await f.send(`${f.base}/panorama/query`, { method: 'POST', body: { requestId: 'foreign' }, originHeader: 'http://127.0.0.1:1' });
  assert.equal(response.status, 403); assert.equal(response.body.error, 'not-local');
});

test('same-origin and same-origin Referer GET admit cookie; missing/conflicting origins deny', async t => {
  const f = await fixture(t); assert.equal((await f.save()).status, 200);
  assert.equal((await f.send()).status, 200);
  assert.equal((await f.send(f.base, { originHeader: null, referer: `${f.origin}/workbench` })).status, 200);
  assert.equal((await f.send(f.base, { originHeader: null })).status, 403);
  assert.equal((await f.send(f.base, { referer: 'http://127.0.0.1:1/foreign' })).status, 403);
});

test('legacy director route alias has the same admission and exact Origin policy', async t => {
  const f = await fixture(t); assert.equal((await f.save()).status, 200);
  const alias = f.base.replace('/omnimux-workflow/', '/dsh-workflow/');
  assert.equal((await f.send(alias)).status, 200);
  assert.equal((await f.send(`${alias}/session`, { cookie: null })).status, 401);
  const foreign = await f.send(`${alias}/session`, { originHeader: 'http://127.0.0.1:1' });
  assert.equal(foreign.status, 403); assert.equal(foreign.body.error, 'not-local');
});

test('local scene JSON above 1 MiB saves, exact 4 MiB is admitted, excess rejects without overwriting', async t => {
  const f = await fixture(t);
  const input = scene();
  input.shots = Array.from({ length: 80 }, (_, index) => ({ ...input.shots[0], id: `shot-${index}`, prompt: 'p'.repeat(18000) }));
  input.activeShotId = 'shot-0';
  const payload = JSON.stringify({ expectedRevision: 0, scene: input });
  assert.ok(Buffer.byteLength(payload) > 1024 * 1024 && Buffer.byteLength(payload) < FOUR_MIB);
  assert.equal((await f.send(f.base, { method: 'PUT', raw: payload })).status, 200);
  const boundary = JSON.stringify({ expectedRevision: 1, scene: scene() });
  const exact = boundary + ' '.repeat(FOUR_MIB - Buffer.byteLength(boundary));
  assert.equal(Buffer.byteLength(exact), FOUR_MIB);
  assert.equal((await f.send(f.base, { method: 'PUT', raw: exact })).status, 200);
  const tooLarge = await f.send(f.base, { method: 'PUT', raw: exact + ' ' });
  assert.equal(tooLarge.status, 413); assert.equal(tooLarge.body.error, 'body-too-large');
  const current = await f.send(); assert.equal(current.status, 200); assert.equal(current.body.document.revision, 2);
  assert.equal(current.body.document.scene.title, scene().title);
});

test('unknown Host identity cannot become cloud-true from arbitrary client JSON', async t => {
  const f = await fixture(t, { identity: null });
  assert.equal((await f.save()).status, 200);
  const unknown = await f.session();
  assert.equal(unknown.cloudAccount.status, 'unknown'); assert.equal(unknown.modelTaskScope, null);
  const fake = await f.send(`${f.base}/panorama/query`, { method: 'POST', body: { requestId: 'fake',
    authenticated: true, identity: account('fake'), modelTaskScope: 'fake', cloudAccount: { status: 'known' } } });
  assert.equal(fake.status, 400);
  assert.equal((await f.session()).cloudAccount.status, 'unknown');
  const caps = await f.send(`${f.base}/capabilities`);
  assert.equal(caps.status, 200); assert.equal(caps.body.localEditing, true); assert.equal(caps.body.accountBinding, 'needsidentity');
  assert.equal(caps.body.analyzeImage.available, false); assert.equal(caps.body.panorama.available, false);
  assert.equal(caps.body.analyzeImage.diagnostic, 'needsidentity'); assert.equal(caps.body.panorama.diagnostic, 'needsidentity');
  assert.ok(caps.body.analyzeImage.models.length > 0 && caps.body.panorama.models.length > 0, 'no-scope denial must hold even when model catalog advertises support');
  for (const [action, body] of [['analyze', { imageRef: 'assets/imported/reference.png', expectedRevision: 1 }],
    ['panorama', { requestId: 'unknown-account', prompt: '不能执行的模型任务', expectedRevision: 1 }]]) {
    const denied = await f.send(`${f.base}/${action}`, { method: 'POST', body });
    assert.equal(denied.status, 400); assert.equal(denied.body.error, 'needsidentity');
  }
  assert.equal((await f.save({ ...scene(), title: '身份未知仍可编辑' }, 1)).status, 200);
});

test('operation lease owner comes from authenticated session, never body fake owner', async t => {
  const f = await fixture(t); assert.equal((await f.save()).status, 200);
  const request = { schemaVersion: 1, operationId: 'owner-security', workspaceId: f.workspaceId, nodeId: f.nodeId,
    sceneId: scene().id, projectKey: hash(f.project.path), sourceRevision: 1, workspaceVersion: f.store.get(f.workspaceId).version, action: 'open' };
  f.operations.request(request);
  const operationsPath = `/omnimux-workflow/api/workspaces/${f.workspaceId}/director-operations`;
  const forgedClaim = await f.send(`${operationsPath}/claim`, { method: 'POST', body: { request, browserOwner: 'forged', ownerId: 'forged' } });
  assert.equal(forgedClaim.status, 400);
  const a = await f.session();
  const claim = await f.send(`${operationsPath}/claim`, { method: 'POST', body: { request } });
  assert.equal(claim.status, 200); assert.equal(claim.body.ownerId, hash(a.owner)); assert.notEqual(claim.body.ownerId, hash('forged'));
  const b = await f.session({ cookie: COOKIE_B }); assert.notEqual(a.owner, b.owner);
  const forgery = await f.send(`${operationsPath}/renew`, { method: 'POST', cookie: COOKIE_B,
    body: { request, claimToken: claim.body.claimToken, browserOwner: a.owner, ownerId: claim.body.ownerId } });
  assert.equal(forgery.status, 400);
  const denied = await f.send(`${operationsPath}/renew`, { method: 'POST', cookie: COOKIE_B, body: { request, claimToken: claim.body.claimToken } });
  assert.equal(denied.status, 400); assert.equal(denied.body.error, 'director-operation-owner-mismatch');
});

function seedHistoricalTask(f, scope) {
  const requestId = 'old-epoch-task';
  const directory = join(f.project.path, '.omnimux', 'director', f.workspaceId, 'panorama', f.nodeId);
  mkdirSync(directory, { recursive: true });
  const intent = { schemaVersion: 1, requestId,
    requestKey: `director-panorama-${hash(JSON.stringify([f.project.path, f.workspaceId, f.nodeId, requestId, scope]))}`,
    workspaceId: f.workspaceId, nodeId: f.nodeId, root: f.project.path, sceneId: scene().id, revision: 1, prompt: '离线历史任务',
    choice: { model: 'offline-image', operation: 'text_to_image', profile: 'imageGenerate', group: 'offline' }, createdAt: 1,
    actor: scope, modelTaskScope: scope };
  const intentFile = join(directory, `${requestId}.intent.json`);
  const receiptFile = join(directory, `${requestId}.receipt.json`);
  writeFileSync(intentFile, JSON.stringify(intent));
  writeFileSync(receiptFile, JSON.stringify({ status: 'submitted', mode: 'submitted', taskRef: 'mtask_offline_history', actor: scope, modelTaskScope: scope }));
  return { requestId, intentFile, receiptFile };
}

test('scope-only legacy task is never claimed in production, including after A-B-A; history stays read-only', async t => {
  const f = await fixture(t); assert.equal((await f.save()).status, 200);
  const a = await f.session(); assert.equal(a.cloudAccount.status, 'known'); assert.ok(a.modelTaskScope);
  const task = seedHistoricalTask(f, a.modelTaskScope);
  const beforeIntent = readFileSync(task.intentFile); const beforeReceipt = readFileSync(task.receiptFile);
  async function rejectsLegacy() {
    for (const action of ['query', 'recover', 'cancel']) {
      const denied = await f.send(`${f.base}/panorama/${action}`, { method: 'POST', body: { requestId: task.requestId } });
      assert.equal(denied.status, 400); assert.equal(denied.body.error, 'legacy-unverified');
    }
    const history = await f.send(`${f.base}/panorama/history`);
    assert.equal(history.status, 200); assert.deepEqual(history.body.live, []); assert.deepEqual(history.body.simulated, []);
    assert.deepEqual(history.body.failed, [{ requestId: task.requestId, diagnostic: 'legacy-unverified' }]);
  }
  await rejectsLegacy(); // A matching ephemeral scope is not stable ownership proof.
  f.state.identity = account('B'); const b = await f.session(); assert.ok(b.epoch > a.epoch);
  assert.notEqual(b.modelTaskOwner, a.modelTaskOwner); await rejectsLegacy();
  f.state.identity = account('A'); const returned = await f.session(); assert.ok(returned.epoch > b.epoch);
  assert.equal(returned.cloudAccount.scope, a.cloudAccount.scope); assert.notEqual(returned.modelTaskScope, a.modelTaskScope);
  assert.equal(returned.modelTaskOwner, a.modelTaskOwner); await rejectsLegacy();
  assert.deepEqual(readFileSync(task.intentFile), beforeIntent); assert.deepEqual(readFileSync(task.receiptFile), beforeReceipt);
});

// Offline ledger protocol fixture only: no fake provider result, submission or collection.
// The immutable shape/key is the production stable-account intent contract, not an epoch migration.
function seedStableTask(f, owner) {
  assert.match(owner, /^director-model-owner:[a-f0-9]{64}$/);
  const requestId = 'stable-account-task';
  const directory = join(f.project.path, '.omnimux', 'director', f.workspaceId, 'panorama', f.nodeId);
  mkdirSync(directory, { recursive: true });
  const intent = { schemaVersion: 1, requestId,
    requestKey: `director-panorama-${hash(JSON.stringify([f.project.path, f.workspaceId, f.nodeId, requestId, owner]))}`,
    workspaceId: f.workspaceId, nodeId: f.nodeId, root: f.project.path, sceneId: scene().id, revision: 1, prompt: '离线稳定归属任务',
    choice: { model: 'offline-image', operation: 'text_to_image', profile: 'imageGenerate', group: 'offline' }, createdAt: 1,
    actor: owner, modelTaskOwner: owner, ownershipProtocol: 'stable-account' };
  const receipt = { status: 'submitted', mode: 'submitted', taskRef: 'mtask_offline_stable',
    actor: owner, modelTaskOwner: owner, ownershipProtocol: 'stable-account' };
  const intentFile = join(directory, `${requestId}.intent.json`); const receiptFile = join(directory, `${requestId}.receipt.json`);
  writeFileSync(intentFile, JSON.stringify(intent)); writeFileSync(receiptFile, JSON.stringify(receipt));
  return { requestId, requestKey: intent.requestKey, intentFile, receiptFile };
}
async function authoritySnapshot(f, options = {}) {
  const response = await f.send(f.base, options); assert.equal(response.status, 200);
  const graph = await f.send(`/omnimux-workflow/api/workspaces/${f.workspaceId}`, options); assert.equal(graph.status, 200);
  const node = graph.body.workspace.nodes.find(row => row.id === f.nodeId);
  return { document: response.body.document, sourceHash: directorOperationSourceHash(node, response.body.document.scene.id) };
}
async function assertStableRead(f, task, owner, options = {}) {
  const query = await f.send(`${f.base}/panorama/query`, { method: 'POST', body: { requestId: task.requestId }, ...options });
  assert.equal(query.status, 200); assert.equal(query.body.requestKey, task.requestKey);
  assert.equal(query.body.taskRef, 'mtask_offline_stable'); assert.equal(query.body.status, 'submitted');
  assert.equal(query.body.ownershipProtocol, 'stable-account'); assert.equal(query.body.accountBinding, 'account-bound');
  assert.equal(query.body.actor, owner); assert.equal(query.body.modelTaskOwner, owner);
  assert.equal(query.body.sourceRevision, 1); assert.equal(query.body.sceneId, scene().id);
  assert.equal(Object.hasOwn(query.body, 'modelTaskScope'), false);
  const history = await f.send(`${f.base}/panorama/history`, options);
  assert.equal(history.status, 200); assert.deepEqual(history.body.live, [query.body]);
  assert.deepEqual(history.body.failed, []); assert.deepEqual(history.body.simulated, []);
  // "live" is the history's non-simulated bucket; this submitted offline receipt proves no live model generation.
}

test('same cloud principal with a fresh admitted cookie reads the original stable task without executing models', async t => {
  const f = await fixture(t); assert.equal((await f.save()).status, 200);
  const before = await authoritySnapshot(f); const a = await f.session();
  assert.equal(a.cloudAccount.status, 'known'); assert.ok(a.modelTaskScope); assert.ok(a.modelTaskOwner);
  assert.equal(a.localProjects, 'installation-shared');
  const task = seedStableTask(f, a.modelTaskOwner);
  const intentBytes = readFileSync(task.intentFile); const receiptBytes = readFileSync(task.receiptFile);
  await assertStableRead(f, task, a.modelTaskOwner);
  const fresh = await f.session({ cookie: COOKIE_B });
  assert.ok(fresh.epoch > a.epoch); assert.notEqual(fresh.owner, a.owner); assert.notEqual(fresh.sessionDigest, a.sessionDigest);
  assert.notEqual(fresh.modelTaskScope, a.modelTaskScope); assert.equal(fresh.modelTaskOwner, a.modelTaskOwner);
  assert.equal(fresh.operatorScope, a.operatorScope); assert.deepEqual(fresh.cloudAccount, a.cloudAccount);
  await assertStableRead(f, task, a.modelTaskOwner, { cookie: COOKIE_B });
  assert.deepEqual(await authoritySnapshot(f, { cookie: COOKIE_B }), before);
  assert.deepEqual(readFileSync(task.intentFile), intentBytes); assert.deepEqual(readFileSync(task.receiptFile), receiptBytes);
  assert.equal(f.state.modelExecutions, 0);
});

test('stable task rejects another cloud account but fresh returned A reads the original key; historical files remain immutable', async t => {
  const f = await fixture(t); assert.equal((await f.save()).status, 200);
  const before = await authoritySnapshot(f); const a = await f.session(); const task = seedStableTask(f, a.modelTaskOwner);
  const intentBytes = readFileSync(task.intentFile); const receiptBytes = readFileSync(task.receiptFile);
  await assertStableRead(f, task, a.modelTaskOwner);
  f.state.identity = account('B'); const b = await f.session();
  assert.ok(b.epoch > a.epoch); assert.notEqual(b.modelTaskScope, a.modelTaskScope); assert.notEqual(b.modelTaskOwner, a.modelTaskOwner);
  for (const action of ['query', 'recover', 'cancel']) {
    const denied = await f.send(`${f.base}/panorama/${action}`, { method: 'POST', body: { requestId: task.requestId } });
    assert.equal(denied.status, 400); assert.equal(denied.body.error, 'director-task-scope-mismatch');
  }
  const history = await f.send(`${f.base}/panorama/history`); assert.equal(history.status, 200);
  assert.deepEqual(history.body.live, []); assert.deepEqual(history.body.simulated, []);
  assert.deepEqual(history.body.failed, [{ requestId: task.requestId, diagnostic: 'director-task-scope-mismatch' }]);
  f.state.identity = account('A'); const returned = await f.session({ cookie: COOKIE_B });
  assert.ok(returned.epoch > b.epoch); assert.notEqual(returned.modelTaskScope, a.modelTaskScope);
  assert.equal(returned.modelTaskOwner, a.modelTaskOwner); assert.deepEqual(returned.cloudAccount, a.cloudAccount);
  await assertStableRead(f, task, a.modelTaskOwner, { cookie: COOKIE_B });
  assert.deepEqual(await authoritySnapshot(f, { cookie: COOKIE_B }), before);
  assert.deepEqual(readFileSync(task.intentFile), intentBytes); assert.deepEqual(readFileSync(task.receiptFile), receiptBytes);
  assert.equal(f.state.modelExecutions, 0);
});

test('in-flight capability lookup rechecks Connection admission and current epoch', async t => {
  const f = await fixture(t); assert.equal((await f.save()).status, 200);
  const before = await authoritySnapshot(f); const a = await f.session();
  const entered = deferred(); const resume = deferred();
  f.state.catalog = async () => { entered.resolve(); await resume.promise; return catalog(); };
  const pending = f.send(`${f.base}/capabilities`);
  await entered.promise;
  try {
    f.state.identity = account('B'); const b = await f.session();
    assert.ok(b.epoch > a.epoch); assert.notEqual(b.modelTaskOwner, a.modelTaskOwner);
    f.state.identity = account('A'); const returned = await f.session();
    assert.ok(returned.epoch > b.epoch); assert.notEqual(returned.modelTaskScope, a.modelTaskScope);
    assert.equal(returned.modelTaskOwner, a.modelTaskOwner);
  } finally { resume.resolve(); }
  const stale = await pending; assert.equal(stale.status, 400); assert.equal(stale.body.error, 'director-task-scope-mismatch');
  f.state.catalog = () => catalog();
  const current = await f.send(`${f.base}/capabilities`); assert.equal(current.status, 200); assert.equal(current.body.localEditing, true);
  assert.equal(current.body.analyzeImage.available, true); assert.equal(current.body.panorama.available, true);
  const enteredAgain = deferred(); const resumeAgain = deferred();
  f.state.catalog = async () => { enteredAgain.resolve(); await resumeAgain.promise; return catalog(); };
  const revoked = f.send(`${f.base}/capabilities`); await enteredAgain.promise;
  f.state.admit = false; resumeAgain.resolve();
  const denied = await revoked; assert.equal(denied.status, 400); assert.equal(denied.body.error, 'director-task-scope-mismatch');
  assert.equal((await f.send(`${f.base}/capabilities`)).status, 401, 'new request with revoked admission remains unauthorized');
  f.state.admit = true; f.state.catalog = () => catalog();
  assert.deepEqual(await authoritySnapshot(f), before);
});

test('same stable owner never revives an old HTTP admission paused in catalog lookup', async t => {
  const f = await fixture(t); assert.equal((await f.save()).status, 200);
  const before = await authoritySnapshot(f); const a = await f.session(); const task = seedStableTask(f, a.modelTaskOwner);
  const intentBytes = readFileSync(task.intentFile); const receiptBytes = readFileSync(task.receiptFile);
  const entered = deferred(); const resume = deferred();
  f.state.catalog = async () => { entered.resolve(); await resume.promise; return catalog(); };
  const pending = f.send(`${f.base}/capabilities`); await entered.promise;
  try {
    const fresh = await f.session({ cookie: COOKIE_B });
    assert.ok(fresh.epoch > a.epoch); assert.notEqual(fresh.modelTaskScope, a.modelTaskScope);
    assert.equal(fresh.modelTaskOwner, a.modelTaskOwner); assert.deepEqual(fresh.cloudAccount, a.cloudAccount);
    // A new admitted request reads the same task while the old request is still suspended.
    await assertStableRead(f, task, a.modelTaskOwner, { cookie: COOKIE_B });
  } finally { resume.resolve(); }
  const stale = await pending; assert.equal(stale.status, 400); assert.equal(stale.body.error, 'director-task-scope-mismatch');
  const after = await f.session({ cookie: COOKIE_B });
  assert.equal(after.modelTaskOwner, a.modelTaskOwner); assert.notEqual(after.modelTaskScope, a.modelTaskScope);
  f.state.catalog = () => catalog();
  const current = await f.send(`${f.base}/capabilities`, { cookie: COOKIE_B });
  assert.equal(current.status, 200); assert.equal(current.body.localEditing, true);
  assert.equal(current.body.analyzeImage.available, true); assert.equal(current.body.panorama.available, true);
  await assertStableRead(f, task, a.modelTaskOwner, { cookie: COOKIE_B });
  assert.deepEqual(await authoritySnapshot(f, { cookie: COOKIE_B }), before);
  assert.deepEqual(readFileSync(task.intentFile), intentBytes); assert.deepEqual(readFileSync(task.receiptFile), receiptBytes);
  assert.equal(f.state.modelExecutions, 0);
});
