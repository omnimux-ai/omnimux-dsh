import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bundle = await build({ stdin: { contents: `
  export { createExecutionManager } from '../src/workflow/execution/ExecutionManager.ts';
  export { createExecutionRoutes } from '../src/workflow/routes/executionRoutes.ts';
  export { executionInputSignatures } from '../src/workflow/execution/executionTypes.ts';
  export { createMaterialGatewayExecutor } from '../src/workflow/execution/materialGatewayExecutor.ts';
  export { mockCatalog } from '../src/workflow/seam/mockCatalog.ts';
  export { SeamGatewayError } from '../src/workflow/seam/SeamGatewayError.ts';
`, resolveDir: fileURLToPath(new URL('.', import.meta.url)) }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { createExecutionManager, createExecutionRoutes, executionInputSignatures, createMaterialGatewayExecutor,
  mockCatalog, SeamGatewayError } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function harness(t, { kind = 'image', source = false, error = new Error('temporary 401') } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'workflow-recovery-3054-'));
  let manager;
  const calls = { submit: 0, collect: [], catalog: 0, source: 0 };
  let catalogAvailable = true;
  let sourceAvailable = true;
  const snapshot = { id: 'ws_recovery', name: 'recovery', version: 1, settings: {}, nodes: [
    ...(source ? [{ id: 'source', type: 'material', data: { nodeKind: 'import', materialType: 'text', content: 'source body' } }] : []),
    { id: 'target', type: 'material', data: { materialType: kind, prompt: 'original request', inputBindingVersion: 1,
      params: { model: kind === 'image' ? 'mock-image-1' : 'mock-video-1', operation: kind === 'image' ? 'text_to_image' : 'text_to_video' } } },
  ], edges: source ? [{ id: 'edge', source: 'source', target: 'target' }] : [] };
  const gateway = {
    capabilities: async () => { calls.catalog++; if (!catalogAvailable) throw new Error('catalog unavailable'); return mockCatalog(); },
    submit: async () => { calls.submit++; return { mode: 'submitted', taskId: `upstream-${calls.submit}`, taskRef: `mtask_original_${calls.submit}`, owner: 'omnimux' }; },
    awaitTask: async () => { throw error; },
    reconcileTask: async (ref, dest) => { calls.collect.push(ref); return { url: dest,
      type: kind, mimeType: kind === 'image' ? 'image/png' : 'video/mp4', sizeBytes: 100 }; },
  };
  const newManager = () => createExecutionManager({ executionsDir: join(root, 'executions'), mediaDir: join(root, 'media'), gateway });
  manager = newManager();
  const request = async (body = {}) => createExecutionRoutes({
    store: { get: () => snapshot, resolveProjectRoot: () => root }, executionManager: manager,
    getCatalog: gateway.capabilities, resolveProjectFile: () => { calls.source++; if (!sourceAvailable) throw new Error('source gone'); return root; },
  }).tryHandle('POST', '/omnimux-workflow/api/workspaces/ws_recovery/executions', { body: { mode: 'single', nodeIds: ['target'], expectedVersion: 1, ...body } });
  const ended = async id => {
    const entry = manager.getEntry(id);
    if (!['completed', 'error', 'cancelled'].includes(entry.context.status)) await new Promise(resolve => {
      entry.context.events.on('execution_complete', resolve);
      entry.context.events.on('execution_error', resolve);
      entry.context.events.on('execution_cancelled', resolve);
    });
    return entry;
  };
  t.after(() => { manager.disposeAll(); rmSync(root, { recursive: true, force: true }); });
  return { root, snapshot, calls, request, ended, gateway, get manager() { return manager; },
    catalogOff: () => { catalogAvailable = false; }, sourceOff: () => { sourceAvailable = false; },
    restart: () => { manager.disposeAll(); manager = newManager(); } };
}

for (const kind of ['image', 'video']) test(`${kind}: error retry creates fresh execution but collects original persisted task before catalog`, async t => {
  const h = harness(t, { kind });
  const first = await h.request(); assert.equal(first.status, 200);
  const failed = await h.ended(first.body.execution.id);
  assert.equal(failed.context.status, 'error');
  const original = failed.context.readNodeUpstreamTask('target'); assert.equal(original.taskRef, 'mtask_original_1');
  h.restart(); h.catalogOff();
  h.snapshot.nodes[0].data.executionStatus = 'error'; h.snapshot.nodes[0].data.executionError = 'temporary 401';
  const catalogCalls = h.calls.catalog;
  const second = await h.request(); assert.equal(second.status, 200);
  assert.notEqual(second.body.execution.id, first.body.execution.id);
  const recovered = await h.ended(second.body.execution.id);
  assert.equal(recovered.context.status, 'completed');
  assert.deepEqual(h.calls.collect, [original]); assert.equal(h.calls.submit, 1);
  assert.equal(h.calls.catalog, catalogCalls);
  assert.equal(recovered.context.get('executionInputsChanged').target, false);
  assert.equal(recovered.context.readNodeUpstreamTask('target'), undefined);
});

test('source becomes unavailable after submit: retry collects without catalog/readiness/source admission', async t => {
  const h = harness(t, { source: true });
  const first = await h.request(); assert.equal(first.status, 200); await h.ended(first.body.execution.id);
  h.snapshot.nodes[0].data.isMissing = true; h.catalogOff(); h.sourceOff();
  const second = await h.request(); assert.equal(second.status, 200);
  assert.equal((await h.ended(second.body.execution.id)).context.status, 'completed');
  assert.equal(h.calls.submit, 1); assert.equal(h.calls.collect.length, 1); assert.equal(h.calls.source, 0);
});

for (const [label, mutate] of [
  ['prompt', h => { h.snapshot.nodes.at(-1).data.prompt = 'edited'; }],
  ['model', h => { h.snapshot.nodes.at(-1).data.params.model = 'other-model'; }],
  ['operation', h => { h.snapshot.nodes.at(-1).data.params.operation = 'image_to_image'; }],
  ['routing', h => { h.snapshot.nodes.at(-1).data.params.routing = { allowedGroups: ['new-group'] }; }],
  ['slot binding', h => { h.snapshot.nodes.at(-1).data.slotBindings = { reference_images: [{ edgeId: 'edge', sourceNodeId: 'source', use: 'active' }] }; }],
  ['connection', h => { h.snapshot.edges[0].targetHandle = 'different'; }],
  ['source text', h => { h.snapshot.nodes[0].data.content = 'edited upstream'; }],
]) test(`changed ${label} never automatically inherits old task and new submit admission stays strict`, async t => {
  const h = harness(t, { source: true }); const first = await h.request(); assert.equal(first.status, 200); await h.ended(first.body.execution.id);
  mutate(h); h.catalogOff();
  const second = await h.request(); assert.equal(second.status, 400); assert.equal(h.calls.collect.length, 0); assert.equal(h.calls.submit, 1);
  const options = { workspaceId: h.snapshot.id, nodes: [h.snapshot.nodes.at(-1)], edges: h.snapshot.edges,
    inputSignatures: executionInputSignatures(h.snapshot) };
  assert.deepEqual(h.manager.findRecoverableTasks(options), {});
});

test('unchanged signature is key-order independent but all unknown input fields matter', () => {
  const graph = { nodes: [{ id: 'n', type: 'material', data: { prompt: 'p', params: { seed: 1, model: 'm' } } }], edges: [] };
  const reordered = structuredClone(graph); reordered.nodes[0].data.params = { model: 'm', seed: 1 };
  assert.deepEqual(executionInputSignatures(graph), executionInputSignatures(reordered));
  reordered.nodes[0].data.futureInput = 'new'; assert.notDeepEqual(executionInputSignatures(graph), executionInputSignatures(reordered));
});

test('confirmed upstream terminal failure clears ref; stale local taskId and other workspace cannot recover', async t => {
  const h = harness(t, { error: new SeamGatewayError('omnimux-failed', 'terminal upstream failure') });
  const first = await h.request(); const entry = await h.ended(first.body.execution.id);
  assert.equal(entry.context.readNodeUpstreamTask('target'), undefined);
  h.snapshot.nodes[0].data.taskId = `exec-${first.body.execution.id}`;
  const options = { workspaceId: 'other-workspace', nodes: h.snapshot.nodes, edges: [], inputSignatures: executionInputSignatures(h.snapshot) };
  assert.deepEqual(h.manager.findRecoverableTasks(options), {});
  h.catalogOff(); assert.equal((await h.request()).status, 400); assert.equal(h.calls.collect.length, 0);
});

test('a newer completed execution prevents reviving an older error task', async t => {
  const h = harness(t); const first = await h.request(); await h.ended(first.body.execution.id);
  const second = await h.request(); assert.equal((await h.ended(second.body.execution.id)).context.status, 'completed');
  h.catalogOff(); const third = await h.request(); assert.equal(third.status, 400);
  assert.equal(h.calls.collect.length, 1); assert.equal(h.calls.submit, 1);
});

test('existing legitimate ref collects even with unreadable bound source and no catalog; no-ref still rejects', async t => {
  const h = harness(t); const executor = createMaterialGatewayExecutor({ gateway: h.gateway, resolveProjectFile: () => { throw new Error('must not read source'); } });
  h.catalogOff();
  const node = { id: 'target', type: 'material', data: { materialType: 'image', inputBindingVersion: 1,
    params: { model: 'gone-model' }, slotBindings: { reference_images: [{ edgeId: 'edge', sourceNodeId: 'missing-source', use: 'active' }] } } };
  let ref = { taskId: 'original-task', taskRef: 'mtask_original', capability: 'image', owner: 'omnimux', submittedAt: Date.now() };
  const ctx = { upstreamOutputs: new Map(), upstreamBindings: [], signal: new AbortController().signal, mediaDir: tmpdir(),
    readUpstreamTask: () => ref, clearUpstreamTask: () => { ref = undefined; } };
  const result = await executor.execute(node, ctx); assert.equal(result.mediaAssets[0].type, 'image'); assert.equal(h.calls.collect.length, 1);
  await assert.rejects(executor.execute(node, ctx), /catalog unavailable/); assert.equal(h.calls.submit, 0);
});

test('edited intent creates a genuinely new task when normal admission succeeds and records inputsChanged', async t => {
  const h = harness(t); const first = await h.request(); await h.ended(first.body.execution.id);
  h.snapshot.nodes[0].data.prompt = 'a different request';
  const second = await h.request(); assert.equal(second.status, 200);
  const entry = await h.ended(second.body.execution.id);
  assert.equal(h.calls.submit, 2); assert.equal(h.calls.collect.length, 0);
  assert.equal(entry.context.get('executionInputsChanged').target, true);
  assert.equal(entry.context.readNodeUpstreamTask('target').taskId, 'upstream-2');
});

test('legacy records without signatures and scheduled dependencies cannot be guessed into recovery', async t => {
  const h = harness(t, { source: true }); const first = await h.request(); const entry = await h.ended(first.body.execution.id);
  const options = { workspaceId: h.snapshot.id, nodes: h.snapshot.nodes, edges: h.snapshot.edges,
    inputSignatures: executionInputSignatures(h.snapshot) };
  assert.deepEqual(h.manager.findRecoverableTasks(options), {});
  entry.context.variables.delete('executionInputSignatures');
  options.nodes = [h.snapshot.nodes.at(-1)];
  assert.deepEqual(h.manager.findRecoverableTasks(options), {});
});

test('local artifact persistence interruption retains the collected task for another retry', async t => {
  const h = harness(t); const executor = createMaterialGatewayExecutor({ gateway: h.gateway }); h.catalogOff();
  const ref = { taskId: 'original-task', taskRef: 'mtask_original', capability: 'image', owner: 'omnimux', submittedAt: Date.now() };
  let cleared = false;
  await assert.rejects(executor.execute({ id: 'n', type: 'material', data: { materialType: 'image' } }, {
    upstreamOutputs: new Map(), signal: new AbortController().signal, mediaDir: tmpdir(), readUpstreamTask: () => ref,
    clearUpstreamTask: () => { cleared = true; }, persistGenerated: async () => { throw new Error('disk temporarily unavailable'); },
  }), /disk temporarily unavailable/);
  assert.equal(cleared, false); assert.equal(h.calls.submit, 0); assert.equal(h.calls.collect.length, 1);
});

// Each counterexample was walked through offline against the production route before solidification.
test('same absolute path with replaced bytes persists identity across restart and never inherits the old task', async t => {
  const h = harness(t, { source: true });
  const path = join(h.root, 'reference.png');
  writeFileSync(path, Buffer.from([1, 2, 3, 4]));
  h.snapshot.nodes[0].data = { nodeKind: 'import', materialType: 'image', path, mimeType: 'image/png', sizeBytes: 4 };
  h.snapshot.nodes[1].data.params.operation = 'image_to_image';
  const first = await h.request(); assert.equal(first.status, 200);
  const failed = await h.ended(first.body.execution.id);
  const original = failed.context.readNodeUpstreamTask('target'); assert.ok(original);
  const signatures = executionInputSignatures(h.snapshot);
  const savedBytes = failed.context.get('executionSourceIdentities');
  assert.equal(savedBytes.target[path], '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a');
  h.restart();
  writeFileSync(path, Buffer.from([5, 6, 7, 8]));
  assert.deepEqual(executionInputSignatures(h.snapshot), signatures, 'graph identity alone is unchanged');
  const second = await h.request(); assert.equal(second.status, 200);
  const changed = await h.ended(second.body.execution.id);
  assert.equal(h.calls.submit, 2); assert.deepEqual(h.calls.collect, []);
  assert.equal(changed.context.get('executionInputsChanged').target, true);
  assert.equal(changed.context.readNodeUpstreamTask('target').taskId, 'upstream-2');
  assert.notEqual(changed.context.get('executionSourceIdentities').target[path], savedBytes.target[path]);
});

test('route catalog pause with another recovery completed first keeps its fixed accepted handle and zero duplicate submits', async t => {
  const h = harness(t);
  h.snapshot.nodes.push({ id: 'other', type: 'material', data: { materialType: 'image', prompt: 'other request',
    inputBindingVersion: 1, params: { model: 'mock-image-1', operation: 'text_to_image' } } });
  const submittedPrompts = [];
  const submit = h.gateway.submit;
  h.gateway.submit = async req => { submittedPrompts.push(req.prompt); return submit(req); };
  const first = await h.request(); const failed = await h.ended(first.body.execution.id);
  const original = failed.context.readNodeUpstreamTask('target'); assert.ok(original);
  let releaseCatalog;
  let catalogEntered;
  const paused = new Promise(resolve => { releaseCatalog = resolve; });
  const entered = new Promise(resolve => { catalogEntered = resolve; });
  h.gateway.capabilities = async () => { h.calls.catalog++; catalogEntered(); await paused; return mockCatalog(); };
  const pending = h.request({ nodeIds: ['target', 'other'] });
  await entered;
  try {
    const concurrent = await h.request(); assert.equal(concurrent.status, 200);
    assert.equal((await h.ended(concurrent.body.execution.id)).context.status, 'completed');
  } finally { releaseCatalog(); }
  const admitted = await pending; assert.equal(admitted.status, 200);
  const resumed = await h.ended(admitted.body.execution.id);
  assert.deepEqual(submittedPrompts, ['original request', 'other request']);
  assert.deepEqual(h.calls.collect, [original, original]);
  assert.equal(resumed.context.nodeStates.get('target').status, 'completed');
  assert.equal(resumed.context.get('executionInputsChanged').target, false);
  assert.equal(h.calls.submit, 2, 'one target and one genuinely new other task only');
});

test('not-reconcilable recovery preserves upstream input and refuses fallback with zero new submits until complete admission', async t => {
  const h = harness(t, { source: true });
  const submittedPrompts = [];
  const submit = h.gateway.submit;
  h.gateway.submit = async req => { submittedPrompts.push(req.prompt); return submit(req); };
  const first = await h.request(); const failed = await h.ended(first.body.execution.id);
  const original = failed.context.readNodeUpstreamTask('target'); assert.ok(original);
  assert.deepEqual(submittedPrompts, ['来源 1：\nsource body\n\n补充要求：\noriginal request']);
  h.gateway.reconcileTask = async ref => { h.calls.collect.push(ref); throw new SeamGatewayError('omnimux-invalid-request', 'old task unknown'); };
  const retry = await h.request(); assert.equal(retry.status, 200);
  const rejected = await h.ended(retry.body.execution.id);
  assert.equal(rejected.context.status, 'error');
  assert.match(rejected.context.error, /重新确认完整输入/);
  assert.deepEqual(h.calls.collect, [original]); assert.equal(h.calls.submit, 1);
  assert.equal(rejected.context.get('executionInputsChanged').target, false);
  assert.equal(h.snapshot.nodes[0].data.content, 'source body');
  assert.equal(h.snapshot.edges.length, 1);
  // A later explicit normal attempt must re-admit every input, not reuse recovery's stripped outputs.
  h.catalogOff(); assert.equal((await h.request()).status, 400); assert.equal(h.calls.submit, 1);
  h.gateway.capabilities = async () => mockCatalog();
  h.snapshot.nodes[1].data.prompt = 'confirmed new request';
  const confirmed = await h.request(); assert.equal(confirmed.status, 200); await h.ended(confirmed.body.execution.id);
  assert.equal(h.calls.submit, 2);
  assert.match(submittedPrompts[1], /source body/);
  assert.match(submittedPrompts[1], /confirmed new request/);
});
