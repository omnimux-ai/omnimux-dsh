import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createDirectorHost } from './directorHost.ts';
import { createProjectAssetsStore } from '../workspace/ProjectAssetsStore.ts';
import { createDirectorAssistant } from './directorAssistant.ts';
import { persistDirectorMedia } from './directorMedia.ts';
import { createDirectorSessionFactory } from './directorSession.ts';

const workspaceId = 'ws_assistant';
const nodeId = 'director-1';
function scene() {
  return { id: 'scene-1', version: 1, title: '镜头', background: '#151515', environmentIntensity: 1, gridVisible: true,
    objects: [], cameras: [{ id: 'camera-1', name: '机位', transform: { position: [0, 2, 5], rotation: [0, 0, 0], scale: [1, 1, 1] }, target: [0, 1, 0], focalLength: 35, fov: 50, aperture: 2.8, focusDistance: 5, near: 0.1, far: 100, keyframes: [] }],
    lights: [], shots: [{ id: 'shot-1', name: '镜头', cameraId: 'camera-1', duration: 5, fps: 30, shotSize: 'medium', cameraMove: 'static', prompt: '' }], activeShotId: 'shot-1', createdAt: '2026-10-14', updatedAt: '2026-10-14' };
}
function catalog() {
  const op = (id, type, seam, inputs) => ({ id, output: { type }, inputs: inputs.map(input => ({ slot: input.type === 'text' ? 'prompt' : 'reference_images', role: input.type === 'text' ? 'prompt' : 'reference', source: input.type === 'text' ? 'node_field' : 'upstream_edge', min: 1, max: 1, ...input })), listed: true, implementation: { status: 'ready', profileId: seam, seam } });
  return { defaults: { text: 'chat-only' }, models: [
    { id: 'chat-only', operations: [op('chat', 'text', 'textComplete', [{ type: 'text' }])], channelGroups: [{ id: 'chat' }] },
    { id: 'visual', operations: [op('vision_chat', 'text', 'textComplete', [{ type: 'text' }, { type: 'image', min: 0, max: 1 }])], channelGroups: [{ id: 'visual-group', enabled: true }] },
    { id: 'picture', operations: [op('text_to_image', 'image', 'imageGenerate', [{ type: 'text' }]), op('image_to_image', 'image', 'imageGenerate', [{ type: 'text' }, { type: 'image', min: 1, max: 1 }])], channelGroups: [{ id: 'picture-group', enabled: true, operations: ['text_to_image', 'image_to_image'] }] },
  ] };
}
function fixture(t) {
  const scratch = resolve('.tmp/director-assistant'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'run-')); const project = join(root, 'project'); mkdirSync(project);
  const state = { project, nodes: [{ id: nodeId, type: 'director' }] };
  const resolveProjectRoot = () => ({ path: state.project });
  const host = createDirectorHost({ store: { get: () => state, resolveProjectRoot } });
  host.saveScene(workspaceId, nodeId, { expectedRevision: 0, scene: scene() });
  mkdirSync(join(project, '.omnimux/canvases'), { recursive: true });
  writeFileSync(join(project, '.omnimux/canvases', `${workspaceId}.json`), '{}');
  const assetsStore = createProjectAssetsStore({ workspacesDir: join(root, 'workspaces'), resolveProjectRoot });
  const seams = { modelCatalog: { list: () => catalog() }, textComplete: { execute: async () => ({ mode: 'live', text: '{"elements":[{"name":"人物","type":"person","x":0.25,"depth":0.5}]}' }) }, imageGenerate: { execute: async () => ({ mode: 'submitted', taskRef: 'mtask_original' }), findAccepted: () => null }, mediaInspect: { inspect: async ({ path }) => ({ mime: 'image/png', sizeBytes: readFileSync(path).length, width: 4, height: 2 }) } };
  const make = (taskScope = () => 'director-model-task:offline-trusted-epoch-1') => createDirectorAssistant({ host, assetsStore, getSeam: name => seams[name], taskScope });
  t.after(() => { assert.ok(root.startsWith(scratch + '/')); rmSync(root, { recursive: true, force: true }); });
  return { host, assetsStore, seams, make, state, project };
}
function trustedSessions(f) {
  const stateDir = join(f.project, '.omnimux/session');
  const sessions = createDirectorSessionFactory({ stateDir });
  let current;
  const login = (id = 'account-a', rawCookie = 'session=a') => current = sessions.fromAuthenticatedRequest({ authenticated: true, rawCookie,
    publicIdentityStatus: { logged_in: true, verified: true, id, base_url: 'https://account.example.test' } });
  login();
  const make = () => { const admitted = current; return createDirectorAssistant({ host: f.host, assetsStore: f.assetsStore, getSeam: name => f.seams[name],
    taskScope: () => sessions.isCurrent(admitted) ? admitted.modelTaskScope : null,
    taskOwner: () => sessions.isCurrent(admitted) ? admitted.modelTaskOwner : null }); };
  return { login, make, sessions };
}
function managedImage(f) {
  const ref = 'assets/reference.png'; mkdirSync(join(f.project, 'assets'), { recursive: true });
  writeFileSync(join(f.project, ref), Buffer.from('offline-image-fixture'));
  f.assetsStore.registerGenerated(workspaceId, { relative_path: ref, name: '参考图', type: 'image' });
  return ref;
}
test('analyzeImage inspects a managed reference and returns strict bounded suggestions without editing the scene', async t => {
  const f = fixture(t); const imageRef = managedImage(f); const before = f.host.getScene(workspaceId, nodeId);
  const calls = []; f.seams.textComplete.execute = async req => { calls.push(req); return { mode: 'live', text: '{"elements":[{"name":"人物","type":"person","x":0.25,"depth":0.5}]}' }; };
  const result = await f.make().analyzeImage(workspaceId, nodeId, { imageRef, expectedRevision: 1 });
  assert.deepEqual(result.elements, [{ name: '人物', type: 'person', x: 0.25, depth: 0.5 }]);
  assert.equal(result.mode, 'live'); assert.equal(result.empty, false); assert.equal(result.sceneChanged, false);
  assert.equal(calls[0].model, 'visual@visual-group'); assert.equal(calls[0].image, join(f.project, imageRef));
  assert.match(calls[0].prompt, /16/); assert.deepEqual(f.host.getScene(workspaceId, nodeId), before);
  f.seams.textComplete.execute = async () => ({ mode: 'live', text: '{"elements":[]}' });
  assert.equal((await f.make().analyzeImage(workspaceId, nodeId, { imageRef, expectedRevision: 1 })).empty, true);
});
test('analyzeImage rejects unregistered paths, unsafe references, malformed or oversized JSON and stale results', async t => {
  const f = fixture(t); const imageRef = managedImage(f); const assistant = f.make();
  const input = { imageRef, expectedRevision: 1 };
  for (const ref of ['../outside.png', '/tmp/no.png', 'https://example.org/p.png', 'assets/no.png']) {
    await assert.rejects(assistant.analyzeImage(workspaceId, nodeId, { ...input, imageRef: ref }));
  }
  for (const text of ['```json\n{"elements":[]}\n```', '{"elements":[],"extra":true}', '{"elements":[{"name":"a","type":"person","x":1.1,"depth":0}]}', '{"elements":[{"name":"a","type":"object","x":0,"depth":0,"extra":1}]}', JSON.stringify({ elements: Array.from({ length: 17 }, () => ({ name: 'a', type: 'object', x: 0, depth: 1 })) }), ' '.repeat(65537)]) {
    f.seams.textComplete.execute = async () => ({ mode: 'live', text });
    await assert.rejects(assistant.analyzeImage(workspaceId, nodeId, input), { code: 'director-analysis-invalid' });
  }
  f.seams.textComplete.execute = async () => { f.host.saveScene(workspaceId, nodeId, { expectedRevision: 1, scene: scene() }); return { mode: 'live', text: '{"elements":[]}' }; };
  await assert.rejects(assistant.analyzeImage(workspaceId, nodeId, input), { code: 'version_conflict' });
  assert.equal(f.host.getScene(workspaceId, nodeId).revision, 2);
});
test('analyzeImage rejects missing seams and preserves explicit simulated provenance', async t => {
  const f = fixture(t); const imageRef = managedImage(f);
  f.seams.textComplete.execute = async () => ({ mode: 'simulated', text: '{"elements":[]}' });
  assert.equal((await f.make().analyzeImage(workspaceId, nodeId, { imageRef, expectedRevision: 1 })).simulated, true);
  delete f.seams.textComplete;
  await assert.rejects(f.make().analyzeImage(workspaceId, nodeId, { imageRef, expectedRevision: 1 }), { code: 'director-capability-unavailable' });
});
test('panorama submission owns one durable intent across factories and history/query never collect', async t => {
  const f = fixture(t); const calls = [];
  f.seams.imageGenerate.execute = async req => { calls.push(req); return { mode: 'submitted', taskRef: 'mtask_original' }; };
  const input = { requestId: 'request-one', prompt: '海边', expectedRevision: 1 };
  const [a, b] = await Promise.all([f.make().submitPanorama(workspaceId, nodeId, input), f.make().submitPanorama(workspaceId, nodeId, input)]);
  assert.equal(calls.length, 1); assert.equal(a.requestId, input.requestId);
  assert.equal((await f.make().queryPanorama(workspaceId, nodeId, input)).taskRef, 'mtask_original');
  assert.equal(calls[0].wait, false); assert.match(calls[0].requestKey, /^director-panorama-/);
  assert.equal(calls[0].model, 'picture@picture-group'); assert.match(calls[0].prompt, /2:1/);
  const history = await f.make().panoramaHistory(workspaceId, nodeId);
  assert.equal(history.live.length, 1); assert.equal(history.simulated.length, 0); assert.equal(calls.length, 1);
  await assert.rejects(f.make().submitPanorama(workspaceId, nodeId, { ...input, prompt: '另一内容' }), { code: 'director-request-conflict' });
  assert.equal(calls.length, 1); assert.equal(f.host.getScene(workspaceId, nodeId).revision, 1);
});
test('recoverPanorama finds the originally accepted task after lost acknowledgement and only collects that task', async t => {
  const f = fixture(t); let paid = 0; const calls = [];
  f.seams.imageGenerate.execute = async req => {
    calls.push(req);
    if (!req.taskRef) { paid++; throw Object.assign(new Error('offline acknowledgement lost'), { code: 'network' }); }
    assert.equal(req.taskRef, 'mtask_original'); assert.equal(req.prompt, undefined); assert.equal(req.model, undefined); assert.equal(req.image, undefined);
    writeFileSync(req.dest, Buffer.from('offline-panorama-fixture')); return { mode: 'live', taskRef: 'mtask_original' };
  };
  const input = { requestId: 'lost-ack', prompt: '海边', expectedRevision: 1 };
  await assert.rejects(f.make().submitPanorama(workspaceId, nodeId, input), /acknowledgement/);
  const originalKey = calls[0].requestKey;
  f.seams.imageGenerate.findAccepted = key => { assert.equal(key, originalKey); return { taskRef: 'mtask_original', status: 'submitted' }; };
  const before = f.host.saveScene(workspaceId, nodeId, { expectedRevision: 1, scene: { ...scene(), title: '回执丢失后继续编辑' } });
  const result = await f.make().recoverPanorama(workspaceId, nodeId, { requestId: input.requestId });
  assert.equal(result.status, 'ready'); assert.equal(result.media.width, 4); assert.equal(result.media.height, 2);
  assert.equal(f.assetsStore.get(workspaceId).items.length, 1); assert.deepEqual(f.host.getScene(workspaceId, nodeId), before);
  assert.equal(paid, 1); assert.equal(calls.length, 2);
  assert.equal((await f.make().recoverPanorama(workspaceId, nodeId, input)).status, 'ready'); assert.equal(calls.length, 2);
  assert.equal(f.make().panoramaHistory(workspaceId, nodeId).live[0].media.assetId, result.media.assetId);
});
test('autosaved scenes can collect the original panorama as history without refreshing its input or source revision', async t => {
  const f = fixture(t); const calls = []; let catalogs = 0;
  f.seams.modelCatalog.list = () => { catalogs++; return catalog(); };
  f.seams.imageGenerate.execute = async req => {
    calls.push(req);
    if (!req.taskRef) return { mode: 'submitted', taskRef: 'mtask_original' };
    assert.deepEqual(Object.keys(req).sort(), ['dest', 'signal', 'taskRef', 'wait']);
    writeFileSync(req.dest, Buffer.from('offline-autosave-panorama'));
    return { mode: 'live', taskRef: 'mtask_original' };
  };
  const input = { requestId: 'autosaved-history', prompt: '原来的海边', expectedRevision: 1 };
  const submitted = await f.make().submitPanorama(workspaceId, nodeId, input);
  const intentFile = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId, `${input.requestId}.intent.json`);
  const originalIntent = readFileSync(intentFile, 'utf8');
  const edited = scene(); edited.title = '已经编辑的新构图';
  const before = f.host.saveScene(workspaceId, nodeId, { expectedRevision: 1, scene: edited });
  const result = await f.make().recoverPanorama(workspaceId, nodeId, input);
  assert.equal(calls.length, 2); assert.equal(calls[1].taskRef, submitted.taskRef);
  assert.equal(result.status, 'ready'); assert.equal(result.sourceRevision, 1);
  assert.equal(result.media.sourceRevision, 1); assert.equal(result.media.sourceSceneId, 'scene-1');
  assert.equal(result.requestKey, submitted.requestKey); assert.equal(catalogs, 1);
  assert.equal(readFileSync(intentFile, 'utf8'), originalIntent);
  assert.deepEqual(f.host.getScene(workspaceId, nodeId), before);
  const ledger = JSON.parse(readFileSync(join(f.project, '.omnimux/assets.json'), 'utf8'));
  assert.equal(ledger.items.length, 1);
  assert.deepEqual(ledger.items[0].lineage.directorPanoramaSources, [{
    requestId: input.requestId, requestKey: submitted.requestKey, workspaceId, nodeId, sceneId: 'scene-1', sourceRevision: 1,
    taskRef: 'mtask_original', prompt: input.prompt, choice: { model: 'picture', operation: 'text_to_image', profile: 'imageGenerate', group: 'picture-group' },
    createdAt: submitted.createdAt,
  }]);
  assert.equal((await f.make().recoverPanorama(workspaceId, nodeId, input)).media.assetId, result.media.assetId);
  assert.equal(calls.length, 2); assert.equal(f.assetsStore.get(workspaceId).items.length, 1);
});
test('capabilities require accepted-task recovery and never combine incompatible group input support', async t => {
  const f = fixture(t); delete f.seams.imageGenerate.findAccepted;
  assert.equal((await f.make().capabilities(workspaceId, nodeId)).panorama.available, false);
  const body = catalog(); body.models[1].channelGroups[0].constraints = { inputs: { image: { max: 0 } } };
  f.seams.modelCatalog.list = () => body;
  const ref = managedImage(f); let executed = 0; f.seams.textComplete.execute = async () => { executed++; return { mode: 'live', text: '{"elements":[]}' }; };
  await assert.rejects(f.make().analyzeImage(workspaceId, nodeId, { imageRef: ref, expectedRevision: 1 }), { code: 'director-capability-unavailable' });
  assert.equal(executed, 0);
});
test('panorama recovery without an acceptance handle never resubmits, and query/history have no effects', async t => {
  const f = fixture(t); let calls = 0;
  f.seams.imageGenerate.execute = async () => { calls++; throw new Error('lost'); };
  const input = { requestId: 'no-handle', prompt: '山间', expectedRevision: 1 };
  await assert.rejects(f.make().submitPanorama(workspaceId, nodeId, input), /lost/);
  assert.equal((await f.make().recoverPanorama(workspaceId, nodeId, input)).status, 'recoverable');
  await f.make().submitPanorama(workspaceId, nodeId, input);
  assert.equal(f.make().queryPanorama(workspaceId, nodeId, input).diagnostic, 'accepted-task-not-found');
  assert.equal(f.make().panoramaHistory(workspaceId, nodeId).live.length, 1); assert.equal(calls, 1);
});
test('panorama validates real 2:1 bytes before registering and retains original task on all failures', async t => {
  const f = fixture(t); let submits = 0;
  f.seams.imageGenerate.execute = async req => { if (!req.taskRef) { submits++; return { mode: 'submitted', taskRef: 'mtask_original' }; }
    writeFileSync(req.dest, Buffer.from('offline-fixture')); return { mode: 'live', taskRef: 'mtask_original' }; };
  const input = { requestId: 'bad-ratio', prompt: '全景', expectedRevision: 1 };
  await f.make().submitPanorama(workspaceId, nodeId, input);
  f.seams.mediaInspect.inspect = async ({ path }) => ({ mime: 'image/png', sizeBytes: readFileSync(path).length, width: 3, height: 2 });
  await assert.rejects(f.make().recoverPanorama(workspaceId, nodeId, input), { code: 'director-panorama-invalid' });
  assert.equal(f.assetsStore.get(workspaceId).items.length, 0); assert.equal(f.make().queryPanorama(workspaceId, nodeId, input).taskRef, 'mtask_original');
  f.seams.imageGenerate.execute = async () => { throw Object.assign(new Error('auth refused'), { code: 'auth' }); };
  await assert.rejects(f.make().recoverPanorama(workspaceId, nodeId, input), { code: 'auth' }); assert.equal(submits, 1);
  f.host.saveScene(workspaceId, nodeId, { expectedRevision: 1, scene: { ...scene(), id: 'replacement-scene' } });
  await assert.rejects(f.make().recoverPanorama(workspaceId, nodeId, input), { code: 'version_conflict' });
  assert.equal(f.assetsStore.get(workspaceId).items.length, 0);
});
test('simulated panorama stays separate and observer abort does not claim upstream cancellation', async t => {
  const f = fixture(t); const input = { requestId: 'simulation', prompt: '全景', expectedRevision: 1 };
  f.seams.imageGenerate.execute = async () => ({ mode: 'simulated' });
  await f.make().submitPanorama(workspaceId, nodeId, input);
  assert.equal(f.make().panoramaHistory(workspaceId, nodeId).simulated.length, 1);
  assert.equal(f.make().panoramaHistory(workspaceId, nodeId).live.length, 0); assert.equal(f.assetsStore.get(workspaceId).items.length, 0);
  await f.make().recoverPanorama(workspaceId, nodeId, input); assert.equal(f.assetsStore.get(workspaceId).items.length, 0);
  const live = { ...input, requestId: 'observer' };
  f.seams.imageGenerate.execute = async () => ({ mode: 'submitted', taskRef: 'mtask_original' });
  await f.make().submitPanorama(workspaceId, nodeId, live);
  let started; const start = new Promise(resolve => { started = resolve; });
  f.seams.imageGenerate.execute = req => new Promise((resolve, reject) => { started(); req.signal.addEventListener('abort', () => reject(req.signal.reason), { once: true }); });
  const assistant = f.make(); const pending = assistant.recoverPanorama(workspaceId, nodeId, live); await start;
  const cancelled = f.make().cancelPanoramaObserver(workspaceId, nodeId, live);
  assert.deepEqual(cancelled, { observerAborted: true, upstreamCancelled: false, taskRetained: true });
  await assert.rejects(pending); assert.equal(f.make().queryPanorama(workspaceId, nodeId, live).taskRef, 'mtask_original');
  assert.equal(f.make().queryPanorama(workspaceId, nodeId, live).diagnostic, 'observer-aborted');
});
test('panorama rejects missing inspect/recovery seams before submission', async t => {
  const f = fixture(t); let count = 0; f.seams.imageGenerate.execute = async () => { count++; };
  delete f.seams.imageGenerate.findAccepted;
  await assert.rejects(f.make().submitPanorama(workspaceId, nodeId, { requestId: 'missing', prompt: '全景', expectedRevision: 1 }), { code: 'director-recovery-unavailable' });
  assert.equal(count, 0); assert.equal(f.make().queryPanorama(workspaceId, nodeId, { requestId: 'missing' }), null);
});
test('one current catalog snapshot determines selection and disabled groups cannot leak availability', async t => {
  const f = fixture(t); const ref = managedImage(f); let reads = 0;
  f.seams.modelCatalog.list = () => { reads++; return reads === 1 ? catalog() : { models: [] }; };
  assert.equal((await f.make().analyzeImage(workspaceId, nodeId, { imageRef: ref, expectedRevision: 1 })).mode, 'live');
  assert.equal(reads, 1);
});
test('panorama recovery survives a dead local observer lock without refreshing the paid task', async t => {
  const f = fixture(t); const input = { requestId: 'crashed', prompt: '山间', expectedRevision: 1 };
  await f.make().submitPanorama(workspaceId, nodeId, input);
  const lock = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId, `${input.requestId}.collect.lock`);
  writeFileSync(lock, JSON.stringify({ pid: 2147483647, token: 'dead-observer' }));
  let paid = 0; f.seams.imageGenerate.execute = async req => { if (!req.taskRef) paid++; writeFileSync(req.dest, Buffer.from('fixture')); return { mode: 'live', taskRef: 'mtask_original' }; };
  assert.equal((await f.make().recoverPanorama(workspaceId, nodeId, input)).status, 'ready'); assert.equal(paid, 0);
});
test('late submit acknowledgement cannot overwrite already collected panorama success', async t => {
  const f = fixture(t); let accepted; const started = new Promise(resolve => { accepted = resolve; }); let release;
  f.seams.imageGenerate.findAccepted = () => ({ taskRef: 'mtask_original' });
  f.seams.imageGenerate.execute = req => {
    if (!req.taskRef) { accepted(); return new Promise(resolve => { release = resolve; }); }
    writeFileSync(req.dest, Buffer.from('fixture')); return Promise.resolve({ mode: 'live', taskRef: 'mtask_original' });
  };
  const input = { requestId: 'late-submit', prompt: '海边', expectedRevision: 1 };
  const submitting = f.make().submitPanorama(workspaceId, nodeId, input); await started;
  const recovered = await f.make().recoverPanorama(workspaceId, nodeId, input); assert.equal(recovered.status, 'ready');
  release({ mode: 'submitted', taskRef: 'mtask_original' }); await submitting;
  assert.equal(f.make().queryPanorama(workspaceId, nodeId, input).status, 'ready');
});
test('submission errors carrying a public task handle retain it even if acceptance lookup is unavailable', async t => {
  const f = fixture(t); let calls = 0;
  f.seams.imageGenerate.execute = async req => { calls++; if (!req.taskRef) throw Object.assign(new Error('download failed after acceptance'), { taskRef: 'mtask_original' });
    writeFileSync(req.dest, Buffer.from('fixture')); return { mode: 'live', taskRef: 'mtask_original' }; };
  const input = { requestId: 'error-handle', prompt: '全景', expectedRevision: 1 };
  await assert.rejects(f.make().submitPanorama(workspaceId, nodeId, input));
  assert.equal(f.make().queryPanorama(workspaceId, nodeId, input).taskRef, 'mtask_original');
  assert.equal((await f.make().recoverPanorama(workspaceId, nodeId, input)).status, 'ready'); assert.equal(calls, 2);
});
test('analyzeImage rechecks the source after catalog selection before consuming a model', async t => {
  const f = fixture(t); const imageRef = managedImage(f); let calls = 0;
  f.seams.modelCatalog.list = async () => { f.host.saveScene(workspaceId, nodeId, { expectedRevision: 1, scene: scene() }); return catalog(); };
  f.seams.textComplete.execute = async () => { calls++; return { mode: 'live', text: '{"elements":[]}' }; };
  await assert.rejects(f.make().analyzeImage(workspaceId, nodeId, { imageRef, expectedRevision: 1 }), { code: 'version_conflict' }); assert.equal(calls, 0);
});
test('image-referenced panorama selects one image-input operation and rejects mismatched collection identity', async t => {
  const f = fixture(t); const imageRef = managedImage(f); const calls = [];
  f.seams.imageGenerate.execute = async req => { calls.push(req); return { mode: req.taskRef ? 'live' : 'submitted', taskRef: req.taskRef ? 'mtask_other' : 'mtask_original' }; };
  const input = { requestId: 'image-reference', prompt: '全景', imageRef, expectedRevision: 1 };
  await f.make().submitPanorama(workspaceId, nodeId, input);
  assert.equal(calls[0].operation, 'image_to_image'); assert.equal(calls[0].image, join(f.project, imageRef));
  await assert.rejects(f.make().recoverPanorama(workspaceId, nodeId, input), { code: 'director-task-mismatch' });
  assert.equal(f.assetsStore.get(workspaceId).items.length, 1); assert.equal(f.make().queryPanorama(workspaceId, nodeId, input).taskRef, 'mtask_original');
});
test('deleted director nodes reject late collection and never register the output', async t => {
  const f = fixture(t); const input = { requestId: 'deleted', prompt: '全景', expectedRevision: 1 };
  await f.make().submitPanorama(workspaceId, nodeId, input);
  f.seams.imageGenerate.execute = async req => { writeFileSync(req.dest, Buffer.from('fixture')); f.state.nodes = []; return { mode: 'live', taskRef: 'mtask_original' }; };
  await assert.rejects(f.make().recoverPanorama(workspaceId, nodeId, input), { code: 'director-node-not-found' });
  assert.equal(f.assetsStore.get(workspaceId).items.length, 0);
});
test('submit rejects missing request identity instead of creating an undefined intent', async t => {
  const f = fixture(t); let count = 0; f.seams.imageGenerate.execute = async () => { count++; };
  await assert.rejects(f.make().submitPanorama(workspaceId, nodeId, { prompt: '全景', expectedRevision: 1 }), { code: 'director-request-invalid' });
  assert.equal(count, 0);
});
test('corrupt local receipt cannot fabricate ready panorama without registered media evidence', async t => {
  const f = fixture(t); const input = { requestId: 'corrupt', prompt: '全景', expectedRevision: 1 };
  await f.make().submitPanorama(workspaceId, nodeId, input);
  writeFileSync(join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId, `${input.requestId}.receipt.json`), '{"status":"ready"}');
  assert.throws(() => f.make().queryPanorama(workspaceId, nodeId, input), { code: 'director-ledger-invalid' });
});
test('autosave during original-task collection is allowed but registration keeps its strict current-revision guard', async t => {
  const f = fixture(t); const input = { requestId: 'late-autosave', prompt: '原全景', expectedRevision: 1 };
  await f.make().submitPanorama(workspaceId, nodeId, input);
  let calls = 0;
  f.seams.imageGenerate.execute = async req => {
    calls++; assert.equal(req.taskRef, 'mtask_original'); assert.equal(req.prompt, undefined);
    const document = f.host.getScene(workspaceId, nodeId);
    f.host.saveScene(workspaceId, nodeId, { expectedRevision: document.revision, scene: { ...document.scene, title: `编辑${calls}` } });
    writeFileSync(req.dest, Buffer.from('late-autosave-bytes')); return { mode: 'live', taskRef: req.taskRef };
  };
  let race = true;
  f.seams.mediaInspect.inspect = async ({ path }) => {
    if (race && path.endsWith('.tmp')) {
      race = false; const document = f.host.getScene(workspaceId, nodeId);
      f.host.saveScene(workspaceId, nodeId, { expectedRevision: document.revision, scene: document.scene });
    }
    return { mime: 'image/png', sizeBytes: readFileSync(path).length, width: 4, height: 2 };
  };
  await assert.rejects(f.make().recoverPanorama(workspaceId, nodeId, input), { code: 'version_conflict' });
  assert.equal(f.assetsStore.get(workspaceId).items.length, 0);
  assert.equal(f.make().queryPanorama(workspaceId, nodeId, input).taskRef, 'mtask_original');
  const result = await f.make().recoverPanorama(workspaceId, nodeId, input);
  assert.equal(result.status, 'ready'); assert.equal(result.media.sourceRevision, 1); assert.equal(calls, 2);
  assert.equal(f.host.getScene(workspaceId, nodeId).revision, 4);
  assert.equal(f.host.getScene(workspaceId, nodeId).scene.panorama, undefined);
});
test('different scene, deleted node and moved project reject both collection and late media registration', async t => {
  for (const phase of ['collect', 'inspect']) for (const change of ['scene', 'node', 'project']) {
    const f = fixture(t); const input = { requestId: `${phase}-${change}`, prompt: '原全景', expectedRevision: 1 };
    await f.make().submitPanorama(workspaceId, nodeId, input);
    const receiptFile = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId, `${input.requestId}.receipt.json`);
    const originalReceipt = readFileSync(receiptFile, 'utf8');
    function mutate() {
      if (change === 'scene') f.host.saveScene(workspaceId, nodeId, { expectedRevision: 1, scene: { ...scene(), id: 'other-scene' } });
      if (change === 'node') f.state.nodes = [];
      if (change === 'project') { f.state.project = join(f.project, '../other-project'); mkdirSync(f.state.project); f.host.saveScene(workspaceId, nodeId, { expectedRevision: 0, scene: scene() }); }
    }
    f.seams.imageGenerate.execute = async req => { assert.equal(req.taskRef, 'mtask_original'); writeFileSync(req.dest, Buffer.from('identity-change-bytes')); if (phase === 'collect') mutate(); return { mode: 'live', taskRef: req.taskRef }; };
    f.seams.mediaInspect.inspect = async ({ path }) => { if (phase === 'inspect' && path.endsWith('.tmp')) mutate(); return { mime: 'image/png', sizeBytes: readFileSync(path).length, width: 4, height: 2 }; };
    await assert.rejects(f.make().recoverPanorama(workspaceId, nodeId, input), { code: change === 'node' ? 'director-node-not-found' : 'version_conflict' });
    assert.equal(readFileSync(receiptFile, 'utf8'), originalReceipt);
    assert.equal(existsSync(join(f.project, '.omnimux/assets.json')), false);
  }
});
test('ready panorama cannot be recovered or queried under a replacement scene identity', async t => {
  const f = fixture(t); const input = { requestId: 'ready-old-scene', prompt: '原全景', expectedRevision: 1 };
  await f.make().submitPanorama(workspaceId, nodeId, input); let calls = 0;
  f.seams.imageGenerate.execute = async req => { calls++; writeFileSync(req.dest, Buffer.from('ready-old-scene')); return { mode: 'live', taskRef: req.taskRef }; };
  await f.make().recoverPanorama(workspaceId, nodeId, input);
  f.host.saveScene(workspaceId, nodeId, { expectedRevision: 1, scene: { ...scene(), id: 'new-scene' } });
  await assert.rejects(f.make().recoverPanorama(workspaceId, nodeId, input), { code: 'version_conflict' });
  assert.throws(() => f.make().queryPanorama(workspaceId, nodeId, input), { code: 'version_conflict' });
  assert.equal(calls, 1); assert.equal(f.assetsStore.get(workspaceId).items.length, 1);
});
test('panorama provenance appends without replacing existing lineage or losing sources for shared bytes', async t => {
  const f = fixture(t); const first = { requestId: 'source-one', prompt: '第一次', expectedRevision: 1 };
  await f.make().submitPanorama(workspaceId, nodeId, first);
  f.seams.imageGenerate.execute = async req => { writeFileSync(req.dest, Buffer.from('shared-panorama')); return { mode: 'live', taskRef: req.taskRef }; };
  const result = await f.make().recoverPanorama(workspaceId, nodeId, first);
  const ledger = f.assetsStore.get(workspaceId);
  f.assetsStore.save(workspaceId, { expectedRev: ledger.rev, folders: ledger.folders, items: ledger.items.map(item => ({ ...item, lineage: { ...item.lineage, upstream: { original: 'preserved' } } })) });
  f.host.saveScene(workspaceId, nodeId, { expectedRevision: 1, scene: scene() });
  const second = { requestId: 'source-two', prompt: '第二次', expectedRevision: 2 };
  f.seams.imageGenerate.execute = async req => { if (req.taskRef) writeFileSync(req.dest, Buffer.from('shared-panorama')); return { mode: req.taskRef ? 'live' : 'submitted', taskRef: 'mtask_second' }; };
  await f.make().submitPanorama(workspaceId, nodeId, second);
  const other = await f.make().recoverPanorama(workspaceId, nodeId, second);
  assert.equal(other.media.assetId, result.media.assetId);
  const item = f.assetsStore.get(workspaceId).items[0];
  assert.deepEqual(item.lineage.upstream, { original: 'preserved' });
  assert.deepEqual(item.lineage.directorPanoramaSources.map(row => [row.requestId, row.sourceRevision, row.taskRef]), [['source-one', 1, 'mtask_original'], ['source-two', 2, 'mtask_second']]);
  await f.make().recoverPanorama(workspaceId, nodeId, second);
  assert.equal(f.assetsStore.get(workspaceId).items[0].lineage.directorPanoramaSources.length, 2);
});
test('ordinary media export still rejects stale revisions before and after inspection', async t => {
  const f = fixture(t); const bytes = Buffer.from('ordinary-media');
  f.host.saveScene(workspaceId, nodeId, { expectedRevision: 1, scene: scene() });
  const request = { host: f.host, assetsStore: f.assetsStore, inspector: f.seams.mediaInspect, workspaceId, nodeId, kind: 'image', bytes, expectedRevision: 1, signal: new AbortController().signal };
  await assert.rejects(persistDirectorMedia(request), { code: 'version_conflict' });
  f.seams.mediaInspect.inspect = async ({ path }) => { f.host.saveScene(workspaceId, nodeId, { expectedRevision: 2, scene: scene() }); return { mime: 'image/png', sizeBytes: readFileSync(path).length, width: 4, height: 2 }; };
  await assert.rejects(persistDirectorMedia({ ...request, expectedRevision: 2 }), { code: 'version_conflict' });
  assert.equal(f.assetsStore.get(workspaceId).items.length, 0);
});
test('panorama receipt source metadata cannot be relabeled as the newer scene revision', async t => {
  const f = fixture(t); const input = { requestId: 'source-tamper', prompt: '原全景', expectedRevision: 1 };
  await f.make().submitPanorama(workspaceId, nodeId, input);
  f.seams.imageGenerate.execute = async req => { writeFileSync(req.dest, Buffer.from('source-tamper')); return { mode: 'live', taskRef: req.taskRef }; };
  await f.make().recoverPanorama(workspaceId, nodeId, input);
  f.host.saveScene(workspaceId, nodeId, { expectedRevision: 1, scene: scene() });
  const receiptFile = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId, `${input.requestId}.receipt.json`);
  const receipt = JSON.parse(readFileSync(receiptFile, 'utf8')); receipt.media.sourceRevision = 2;
  writeFileSync(receiptFile, JSON.stringify(receipt));
  assert.throws(() => f.make().queryPanorama(workspaceId, nodeId, input), { code: 'director-ledger-invalid' });
});
test('panorama history isolates a damaged task and other original tasks remain independently recoverable', async t => {
  const f = fixture(t);
  for (const requestId of ['damaged-history', 'good-history']) await f.make().submitPanorama(workspaceId, nodeId, { requestId, prompt: requestId, expectedRevision: 1 });
  const directory = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId);
  writeFileSync(join(directory, 'damaged-history.receipt.json'), '{"status":"ready"}');
  const history = f.make().panoramaHistory(workspaceId, nodeId);
  assert.deepEqual(history.live.map(row => row.requestId), ['good-history']);
  assert.deepEqual(history.failed, [{ requestId: 'damaged-history', diagnostic: 'director-ledger-invalid' }]);
  let collected = 0;
  f.seams.imageGenerate.execute = async req => { collected++; assert.equal(req.taskRef, 'mtask_original'); writeFileSync(req.dest, Buffer.from('good-history-bytes')); return { mode: 'live', taskRef: req.taskRef }; };
  assert.equal((await f.make().recoverPanorama(workspaceId, nodeId, { requestId: 'good-history' })).status, 'ready');
  assert.equal(collected, 1); assert.equal(f.assetsStore.get(workspaceId).items.length, 1);
  assert.equal(readFileSync(join(directory, 'damaged-history.receipt.json'), 'utf8'), '{"status":"ready"}');
});
test('late submit acknowledgement and accepted-task lookup cannot write or collect after a trusted epoch change', async t => {
  for (const phase of ['submit', 'lookup', 'collect']) {
    const f = fixture(t); let scope = 'director-model-task:offline-A-epoch-1'; const make = () => f.make(() => scope);
    const input = { requestId: `late-${phase}`, prompt: '原全景', expectedRevision: 1 };
    const directory = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId);
    const intentFile = join(directory, `${input.requestId}.intent.json`), receiptFile = join(directory, `${input.requestId}.receipt.json`);
    if (phase === 'submit') {
      f.seams.imageGenerate.execute = async () => { scope = 'director-model-task:offline-A-epoch-3'; return { mode: 'submitted', taskRef: 'mtask_original' }; };
      await assert.rejects(make().submitPanorama(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
      assert.equal(existsSync(receiptFile), false); assert.equal(JSON.parse(readFileSync(intentFile, 'utf8')).modelTaskScope, 'director-model-task:offline-A-epoch-1');
    } else {
      f.seams.imageGenerate.execute = async () => { if (phase === 'lookup') throw Error('lost acknowledgement'); return { mode: 'submitted', taskRef: 'mtask_original' }; };
      if (phase === 'lookup') await assert.rejects(make().submitPanorama(workspaceId, nodeId, input), /lost acknowledgement/);
      else await make().submitPanorama(workspaceId, nodeId, input);
      const originalIntent = readFileSync(intentFile, 'utf8'), originalReceipt = readFileSync(receiptFile, 'utf8'); let collects = 0;
      f.seams.imageGenerate.findAccepted = async () => { scope = 'director-model-task:offline-A-epoch-3'; return { taskRef: 'mtask_original' }; };
      f.seams.imageGenerate.execute = async req => { collects++; assert.equal(req.prompt, undefined); writeFileSync(req.dest, Buffer.from('late-account-bytes')); scope = 'director-model-task:offline-A-epoch-3'; return { mode: 'live', taskRef: req.taskRef }; };
      await assert.rejects(make().recoverPanorama(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
      assert.equal(collects, phase === 'lookup' ? 0 : 1); assert.equal(readFileSync(intentFile, 'utf8'), originalIntent); assert.equal(readFileSync(receiptFile, 'utf8'), originalReceipt);
    }
    assert.equal(f.assetsStore.get(workspaceId).items.length, 0); assert.equal(existsSync(join(directory, `${input.requestId}.collect.lock`)), false);
  }
});
test('bound panorama request keys cannot be relabeled to a different trusted scope in the local ledger', async t => {
  const f = fixture(t); const input = { requestId: 'scope-key', prompt: '全景', expectedRevision: 1 };
  await f.make(() => 'director-model-task:offline-A-epoch-1').submitPanorama(workspaceId, nodeId, input);
  const directory = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId);
  for (const suffix of ['intent', 'receipt']) {
    const file = join(directory, `${input.requestId}.${suffix}.json`), value = JSON.parse(readFileSync(file, 'utf8'));
    value.actor = 'director-model-task:offline-B-epoch-2'; value.modelTaskScope = value.actor; writeFileSync(file, JSON.stringify(value));
  }
  let calls = 0; f.seams.imageGenerate.execute = async () => { calls++; }; f.seams.imageGenerate.findAccepted = () => { calls++; return null; };
  await assert.rejects(f.make(() => 'director-model-task:offline-B-epoch-2').recoverPanorama(workspaceId, nodeId, input), { code: 'director-ledger-invalid' });
  assert.equal(calls, 0);
});
test('capability discovery rejects a changed epoch rather than advertising another account mid-request', async t => {
  const f = fixture(t); let scope = 'director-model-task:offline-A-epoch-1';
  f.seams.modelCatalog.list = async () => { scope = 'director-model-task:offline-A-epoch-3'; return catalog(); };
  await assert.rejects(f.make(() => scope).capabilities(workspaceId, nodeId), { code: 'director-task-scope-mismatch' });
});
test('omitted constructor scope is labeled offline unbound and production never guesses legacy ownership', async t => {
  const f = fixture(t); const unbound = () => createDirectorAssistant({ host: f.host, assetsStore: f.assetsStore, getSeam: name => f.seams[name] });
  assert.equal((await unbound().capabilities(workspaceId, nodeId)).accountBinding, 'not-account-bound');
  const input = { requestId: 'legacy-unscoped', prompt: '旧全景', expectedRevision: 1 };
  const legacy = await unbound().submitPanorama(workspaceId, nodeId, input);
  assert.equal(legacy.accountBinding, 'not-account-bound');
  assert.equal(unbound().panoramaHistory(workspaceId, nodeId).accountBinding, 'not-account-bound');
  let calls = 0; f.seams.imageGenerate.execute = async () => { calls++; }; f.seams.imageGenerate.findAccepted = () => { calls++; return null; };
  assert.deepEqual(f.make().panoramaHistory(workspaceId, nodeId).failed, [{ requestId: input.requestId, diagnostic: 'legacy-unverified' }]);
  await assert.rejects(f.make().recoverPanorama(workspaceId, nodeId, input), { code: 'legacy-unverified' });
  await assert.rejects(f.make().submitPanorama(workspaceId, nodeId, input), { code: 'legacy-unverified' });
  assert.equal(calls, 0);
});
test('panorama registration rechecks identity after the inspection promise resolves and never rewrites an old receipt', async t => {
  const f = fixture(t); let scope = 'director-model-task:offline-A-epoch-1'; const make = () => f.make(() => scope);
  const input = { requestId: 'registration-epoch', prompt: '全景', expectedRevision: 1 };
  await make().submitPanorama(workspaceId, nodeId, input);
  const receiptFile = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId, `${input.requestId}.receipt.json`);
  const original = readFileSync(receiptFile, 'utf8'); let collected = 0;
  f.seams.imageGenerate.execute = async req => { collected++; assert.equal(req.taskRef, 'mtask_original'); writeFileSync(req.dest, Buffer.from('scope-late-register')); return { mode: 'live', taskRef: req.taskRef }; };
  f.seams.mediaInspect.inspect = async ({ path }) => {
    if (path.endsWith('.tmp')) queueMicrotask(() => queueMicrotask(() => { scope = 'director-model-task:offline-A-epoch-3'; }));
    return { mime: 'image/png', sizeBytes: readFileSync(path).length, width: 4, height: 2 };
  };
  await assert.rejects(make().recoverPanorama(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
  assert.equal(collected, 1); assert.equal(f.assetsStore.get(workspaceId).items.length, 0);
  assert.equal(readFileSync(receiptFile, 'utf8'), original);
});
test('analysis rejects account changes at each async boundary including A to B to A with a new epoch', async t => {
  for (const phase of ['inspect', 'catalog', 'execute']) {
    const f = fixture(t); const imageRef = managedImage(f); let scope = 'director-model-task:offline-A-epoch-1', consumed = 0;
    const mutate = () => { scope = 'director-model-task:offline-B-epoch-2'; scope = 'director-model-task:offline-A-epoch-3'; };
    const inspect = f.seams.mediaInspect.inspect;
    f.seams.mediaInspect.inspect = async req => { const result = await inspect(req); if (phase === 'inspect') mutate(); return result; };
    f.seams.modelCatalog.list = async () => { if (phase === 'catalog') mutate(); return catalog(); };
    f.seams.textComplete.execute = async () => { consumed++; if (phase === 'execute') mutate(); return { mode: 'live', text: '{"elements":[]}' }; };
    const before = f.host.getScene(workspaceId, nodeId);
    await assert.rejects(f.make(() => scope).analyzeImage(workspaceId, nodeId, { imageRef, expectedRevision: 1 }), { code: 'director-task-scope-mismatch' });
    assert.equal(consumed, phase === 'execute' ? 1 : 0); assert.deepEqual(f.host.getScene(workspaceId, nodeId), before);
  }
});
test('panorama ownership is immutable across factories and rejects another account before lookup or collection', async t => {
  const f = fixture(t); let scope = 'director-model-task:offline-A-epoch-1'; const make = () => f.make(() => scope);
  const input = { requestId: 'owned-task', prompt: '全景', expectedRevision: 1 };
  const submitted = await make().submitPanorama(workspaceId, nodeId, input);
  const directory = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId);
  const intentFile = join(directory, `${input.requestId}.intent.json`), receiptFile = join(directory, `${input.requestId}.receipt.json`);
  const intent = JSON.parse(readFileSync(intentFile, 'utf8')), receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
  assert.equal(intent.actor, scope); assert.equal(intent.modelTaskScope, scope); assert.equal(receipt.actor, scope); assert.equal(receipt.modelTaskScope, scope);
  const originalIntent = readFileSync(intentFile, 'utf8'), originalReceipt = readFileSync(receiptFile, 'utf8');
  let executed = 0, lookedUp = 0; f.seams.imageGenerate.execute = async () => { executed++; throw Error('must not execute'); }; f.seams.imageGenerate.findAccepted = () => { lookedUp++; return null; };
  scope = 'director-model-task:offline-B-epoch-2';
  await assert.rejects(make().submitPanorama(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
  await assert.rejects(make().recoverPanorama(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
  assert.throws(() => make().queryPanorama(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
  assert.throws(() => make().cancelPanoramaObserver(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
  const history = make().panoramaHistory(workspaceId, nodeId);
  assert.equal(history.live.length, 0); assert.deepEqual(history.failed, [{ requestId: input.requestId, diagnostic: 'director-task-scope-mismatch' }]);
  assert.equal(executed, 0); assert.equal(lookedUp, 0); assert.equal(readFileSync(intentFile, 'utf8'), originalIntent); assert.equal(readFileSync(receiptFile, 'utf8'), originalReceipt);
  scope = 'director-model-task:offline-A-epoch-1'; assert.equal(make().queryPanorama(workspaceId, nodeId, input).requestKey, submitted.requestKey);
  receipt.actor = 'forged'; writeFileSync(receiptFile, JSON.stringify(receipt));
  assert.throws(() => make().queryPanorama(workspaceId, nodeId, input), { code: 'director-ledger-invalid' });
});
test('trusted null scope blocks only model actions and cannot be overridden by JSON identity', async t => {
  const f = fixture(t); const assistant = f.make(() => null);
  const capability = await assistant.capabilities(workspaceId, nodeId);
  assert.equal(capability.localEditing, true); assert.equal(capability.analyzeImage.available, false); assert.equal(capability.panorama.available, false);
  assert.equal(capability.analyzeImage.diagnostic, 'needsidentity'); assert.equal(capability.analyzeImage.models[0].model, 'visual');
  await assert.rejects(assistant.analyzeImage(workspaceId, nodeId, { imageRef: 'unused.png', expectedRevision: 1 }), { code: 'needsidentity' });
  await assert.rejects(assistant.submitPanorama(workspaceId, nodeId, { requestId: 'null-scope', prompt: '全景', expectedRevision: 1, actor: 'fake', modelTaskScope: 'fake', taskScope: 'fake' }), { code: 'needsidentity' });
  await assert.rejects(assistant.recoverPanorama(workspaceId, nodeId, { requestId: 'null-scope' }), { code: 'needsidentity' });
  assert.throws(() => assistant.panoramaHistory(workspaceId, nodeId), { code: 'needsidentity' });
  assert.throws(() => assistant.queryPanorama(workspaceId, nodeId, { requestId: 'null-scope' }), { code: 'needsidentity' });
});
test('same account fresh login recovers the paid task without replacing original source or submitting again', async t => {
  const f = fixture(t); const stateDir = join(f.project, '.omnimux/session');
  const account = { logged_in: true, verified: true, id: 'account-a', base_url: 'https://account.example.test' };
  const sessions = createDirectorSessionFactory({ stateDir });
  let current = sessions.fromAuthenticatedRequest({ authenticated: true, rawCookie: 'session=old', publicIdentityStatus: account });
  const make = () => { const admitted = current; return createDirectorAssistant({ host: f.host, assetsStore: f.assetsStore, getSeam: name => f.seams[name],
    taskScope: () => sessions.isCurrent(admitted) ? admitted.modelTaskScope : null,
    taskOwner: () => sessions.isCurrent(admitted) ? admitted.modelTaskOwner : null }); };
  let paid = 0; const calls = [];
  f.seams.imageGenerate.execute = async req => { calls.push(req); if (!req.taskRef) { paid++; return { mode: 'submitted', taskRef: 'mtask_original' }; }
    writeFileSync(req.dest, Buffer.from('same-account-paid-panorama')); return { mode: 'live', taskRef: req.taskRef }; };
  const input = { requestId: 'stable-login', prompt: '原全景', expectedRevision: 1 };
  const original = await make().submitPanorama(workspaceId, nodeId, input);
  const intentFile = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId, `${input.requestId}.intent.json`);
  const intentBytes = readFileSync(intentFile, 'utf8');
  current = createDirectorSessionFactory({ stateDir }).fromAuthenticatedRequest({ authenticated: true, rawCookie: 'session=new', publicIdentityStatus: account });
  const duplicate = await make().submitPanorama(workspaceId, nodeId, input);
  assert.equal(duplicate.requestKey, original.requestKey); assert.equal(paid, 1);
  f.host.saveScene(workspaceId, nodeId, { expectedRevision: 1, scene: { ...scene(), title: '重登后继续编辑' } });
  const recovered = await make().recoverPanorama(workspaceId, nodeId, input);
  assert.equal(recovered.status, 'ready'); assert.equal(recovered.taskRef, 'mtask_original');
  assert.equal(recovered.requestKey, original.requestKey); assert.equal(recovered.sourceRevision, 1); assert.equal(paid, 1);
  assert.deepEqual(Object.keys(calls[1]).sort(), ['dest', 'signal', 'taskRef', 'wait']);
  assert.equal(readFileSync(intentFile, 'utf8'), intentBytes);
  const intent = JSON.parse(intentBytes); assert.equal(intent.actor, current.modelTaskOwner); assert.equal(intent.modelTaskOwner, current.modelTaskOwner);
  assert.equal(intent.modelTaskScope, undefined); assert.equal(recovered.modelTaskScope, undefined);
  assert.equal(f.assetsStore.get(workspaceId).items[0].lineage.directorPanoramaSources[0].sourceRevision, 1);
});
test('stable account return never reauthorizes an in-flight observer at submit, lookup, collect or registration', async t => {
  for (const phase of ['submit', 'lookup', 'collect', 'register']) {
    const f = fixture(t); const trusted = trustedSessions(f); const old = trusted.make();
    const input = { requestId: `stable-stale-${phase}`, prompt: '原全景', expectedRevision: 1 };
    const directory = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId);
    const intentFile = join(directory, `${input.requestId}.intent.json`), receiptFile = join(directory, `${input.requestId}.receipt.json`);
    const aba = () => { trusted.login('account-b', 'session=a'); trusted.login('account-a', 'session=a'); };
    let paid = 0, collects = 0;
    f.seams.imageGenerate.execute = async req => { if (!req.taskRef) { paid++; if (phase === 'lookup') throw Error('lost ack'); if (phase === 'submit') aba(); return { mode: 'submitted', taskRef: 'mtask_original' }; }
      collects++; writeFileSync(req.dest, Buffer.from('stable-stale-panorama')); if (phase === 'collect') aba(); return { mode: 'live', taskRef: req.taskRef }; };
    if (phase === 'submit') await assert.rejects(old.submitPanorama(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
    else if (phase === 'lookup') await assert.rejects(old.submitPanorama(workspaceId, nodeId, input), /lost ack/);
    else await old.submitPanorama(workspaceId, nodeId, input);
    const intentBytes = readFileSync(intentFile, 'utf8'); const originalReceipt = existsSync(receiptFile) ? readFileSync(receiptFile, 'utf8') : null;
    f.seams.imageGenerate.findAccepted = async key => { assert.equal(key, JSON.parse(intentBytes).requestKey); if (phase === 'lookup') aba(); return { taskRef: 'mtask_original' }; };
    f.seams.mediaInspect.inspect = async ({ path }) => { if (phase === 'register' && path.endsWith('.tmp')) queueMicrotask(() => queueMicrotask(aba));
      return { mime: 'image/png', sizeBytes: readFileSync(path).length, width: 4, height: 2 }; };
    if (phase !== 'submit') await assert.rejects(old.recoverPanorama(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
    assert.equal(readFileSync(intentFile, 'utf8'), intentBytes);
    assert.equal(existsSync(receiptFile) ? readFileSync(receiptFile, 'utf8') : null, originalReceipt);
    assert.equal(f.assetsStore.get(workspaceId).items.length, 0);
    assert.equal(collects, phase === 'collect' || phase === 'register' ? 1 : 0);
    f.seams.imageGenerate.execute = async req => { assert.equal(req.taskRef, 'mtask_original'); writeFileSync(req.dest, Buffer.from('stable-fresh-panorama')); return { mode: 'live', taskRef: req.taskRef }; };
    f.seams.imageGenerate.findAccepted = key => { assert.equal(key, JSON.parse(intentBytes).requestKey); return { taskRef: 'mtask_original' }; };
    f.seams.mediaInspect.inspect = async ({ path }) => ({ mime: 'image/png', sizeBytes: readFileSync(path).length, width: 4, height: 2 });
    assert.equal((await trusted.make().recoverPanorama(workspaceId, nodeId, input)).status, 'ready');
    assert.equal(paid, 1); assert.equal(readFileSync(intentFile, 'utf8'), intentBytes);
    assert.equal(existsSync(join(directory, `${input.requestId}.collect.lock`)), false);
  }
});
test('different cloud account with the same cookie cannot query, cancel or collect a stable-owned task', async t => {
  const f = fixture(t); const trusted = trustedSessions(f);
  const input = { requestId: 'stable-cross-account', prompt: '原全景', expectedRevision: 1 };
  const original = await trusted.make().submitPanorama(workspaceId, nodeId, input);
  const directory = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId);
  const before = ['intent', 'receipt'].map(suffix => readFileSync(join(directory, `${input.requestId}.${suffix}.json`), 'utf8'));
  trusted.login('account-b', 'session=a'); let calls = 0;
  f.seams.imageGenerate.execute = async () => { calls++; throw Error('must not execute'); }; f.seams.imageGenerate.findAccepted = () => { calls++; return null; };
  const other = trusted.make();
  await assert.rejects(other.submitPanorama(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
  await assert.rejects(other.recoverPanorama(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
  assert.throws(() => other.queryPanorama(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
  assert.throws(() => other.cancelPanoramaObserver(workspaceId, nodeId, input), { code: 'director-task-scope-mismatch' });
  assert.deepEqual(other.panoramaHistory(workspaceId, nodeId).failed, [{ requestId: input.requestId, diagnostic: 'director-task-scope-mismatch' }]);
  assert.equal(calls, 0); assert.deepEqual(['intent', 'receipt'].map(suffix => readFileSync(join(directory, `${input.requestId}.${suffix}.json`), 'utf8')), before);
  trusted.login('account-a', 'session=fresh'); assert.equal(trusted.make().queryPanorama(workspaceId, nodeId, input).requestKey, original.requestKey);
});
test('production stable owner refuses matching legacy epoch-scope intent without guessing or resubmitting', async t => {
  const f = fixture(t); const trusted = trustedSessions(f); const admitted = trusted.login();
  const input = { requestId: 'legacy-matching-scope', prompt: '原全景', expectedRevision: 1 };
  const legacy = await f.make(() => admitted.modelTaskScope).submitPanorama(workspaceId, nodeId, input);
  assert.equal(legacy.ownershipProtocol, 'testlegacy-scope');
  const directory = join(f.project, '.omnimux/director', workspaceId, 'panorama', nodeId);
  // Actual older epoch-scope ledgers predate the compatibility tag as well.
  for (const suffix of ['intent', 'receipt']) { const file = join(directory, `${input.requestId}.${suffix}.json`); const value = JSON.parse(readFileSync(file, 'utf8'));
    delete value.ownershipProtocol; writeFileSync(file, JSON.stringify(value)); }
  const before = ['intent', 'receipt'].map(suffix => readFileSync(join(directory, `${input.requestId}.${suffix}.json`), 'utf8'));
  let calls = 0; f.seams.imageGenerate.execute = async () => { calls++; }; f.seams.imageGenerate.findAccepted = () => { calls++; return null; };
  const production = trusted.make();
  await assert.rejects(production.submitPanorama(workspaceId, nodeId, input), { code: 'legacy-unverified' });
  await assert.rejects(production.recoverPanorama(workspaceId, nodeId, input), { code: 'legacy-unverified' });
  assert.throws(() => production.queryPanorama(workspaceId, nodeId, input), { code: 'legacy-unverified' });
  assert.deepEqual(production.panoramaHistory(workspaceId, nodeId).failed, [{ requestId: input.requestId, diagnostic: 'legacy-unverified' }]);
  assert.equal(calls, 0); assert.deepEqual(['intent', 'receipt'].map(suffix => readFileSync(join(directory, `${input.requestId}.${suffix}.json`), 'utf8')), before);
});
test('a scope-only compatibility constructor cannot claim a stable-owner task even with an equal string', async t => {
  const f = fixture(t); const trusted = trustedSessions(f); const admitted = trusted.login();
  const input = { requestId: 'stable-not-legacy', prompt: '原全景', expectedRevision: 1 };
  await trusted.make().submitPanorama(workspaceId, nodeId, input);
  const compatibility = f.make(() => admitted.modelTaskOwner);
  await assert.rejects(compatibility.recoverPanorama(workspaceId, nodeId, input), { code: 'legacy-unverified' });
  assert.throws(() => compatibility.queryPanorama(workspaceId, nodeId, input), { code: 'legacy-unverified' });
});
test('provided null stable owner blocks smart actions only despite an available observer scope', async t => {
  const f = fixture(t); const assistant = createDirectorAssistant({ host: f.host, assetsStore: f.assetsStore, getSeam: name => f.seams[name],
    taskScope: () => 'trusted-current-observer', taskOwner: () => null });
  const capability = await assistant.capabilities(workspaceId, nodeId);
  assert.equal(capability.localEditing, true); assert.equal(capability.panorama.available, false); assert.equal(capability.analyzeImage.available, false);
  assert.equal(capability.panorama.diagnostic, 'needsidentity'); assert.equal(capability.panorama.models[0].model, 'picture');
  await assert.rejects(assistant.submitPanorama(workspaceId, nodeId, { requestId: 'null-owner', prompt: '全景', expectedRevision: 1 }), { code: 'needsidentity' });
  assert.equal(f.host.getScene(workspaceId, nodeId).revision, 1);
});
test('capabilities select visual/image operations across scenarios, not the chat default', async t => {
  const f = fixture(t); const result = await f.make().capabilities(workspaceId, nodeId);
  assert.equal(result.localEditing, true);
  assert.equal(result.analyzeImage.available, true);
  assert.deepEqual(result.analyzeImage.models[0], { model: 'visual', operation: 'vision_chat', profile: 'textComplete', group: 'visual-group' });
  assert.equal(result.panorama.available, true);
  delete f.seams.imageGenerate; delete f.seams.textComplete;
  const absent = await f.make().capabilities(workspaceId, nodeId);
  assert.equal(absent.localEditing, true); assert.equal(absent.analyzeImage.available, false); assert.equal(absent.panorama.available, false);
});
