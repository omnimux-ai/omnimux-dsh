/**
 * Issue #1382 T05 regression: recovery wiring.
 *
 * The persisted reference is only useful if the recovery path hands it to the
 * executor. Two places used to destroy it — `resetInFlightNodeStates` (which
 * rebuilt the node state) and `ExecutionContext.startNode` (which does the same
 * the moment the scheduler picks the node up) — so the recovered run always
 * submitted a second time.
 *
 * This drives the real `recoverExecution` → real scheduler → real material
 * executor, with a gateway double counting submits and reconciles.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { test } from 'node:test';
import { catalogFor, operation } from '../seam/submissionFixtures.mjs';

// The recovery path reaches modules with extensionless internal imports, so the
// source is bundled (esbuild + `data:` URL) rather than imported directly — the
// same pattern as nodeStatusConvergence.test.mjs, and no `dist` build involved.
const here = fileURLToPath(new URL('.', import.meta.url));
const bundle = buildSync({
  stdin: {
    contents: [
      "export { registerExecutor } from '../executors/registry.ts';",
      "export { createMaterialGatewayExecutor } from './materialGatewayExecutor.ts';",
      "export { loadExecutionRecord, saveDagState, saveExecutionRecord } from './executionStore.ts';",
      "export { recoverExecution } from './executionRecovery.ts';",
    ].join('\n'),
    resolveDir: here,
    sourcefile: 'recovery-runtime.ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const {
  registerExecutor,
  createMaterialGatewayExecutor,
  loadExecutionRecord,
  saveDagState,
  saveExecutionRecord,
  recoverExecution,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const CATALOG = catalogFor('video', 'fixture-model', [operation('text_to_video', 'video')]);

/** Gateway double: counts the two paths that make up the whole point of #1382. */
function countingGateway({ reconcile } = {}) {
  const counts = { submit: 0, reconcile: 0, awaitTask: 0, capabilities: 0 };
  const refs = [];
  return {
    counts,
    refs,
    async capabilities() { counts.capabilities += 1; return CATALOG; },
    async submit() { counts.submit += 1; return { taskId: 'task-fresh', mode: 'submitted' }; },
    async awaitTask(_taskId, dest) {
      counts.awaitTask += 1;
      return { url: dest, type: 'video', mimeType: 'video/mp4' };
    },
    async reconcileTask(ref, dest) {
      counts.reconcile += 1;
      refs.push(ref);
      if (reconcile) return reconcile(ref, dest);
      return { url: dest, type: 'video', mimeType: 'video/mp4' };
    },
  };
}

const NODES = [{ id: 'n1', type: 'material', data: { materialType: 'video', prompt: 'go', params: { operation: 'text_to_video' } } }];

function seedRecord(executionsDir, executionId, nodeStates) {
  saveExecutionRecord(executionsDir, {
    schemaVersion: 1,
    id: executionId,
    workspaceId: 'ws_1382',
    status: 'running',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    startedAt: Date.now() - 5 * 60 * 1000,
    completedAt: null,
    error: null,
    totalNodes: 1,
    completedNodes: 0,
    variables: {},
    nodeStates,
    nodeOutputs: {},
    mediaAssets: {},
    breakpoints: [],
    maxParallel: 1,
    nodes: NODES,
    edges: [],
    progress: { total: 1, completed: 0, percentage: 0 },
    eventLog: [],
  });
  // The node was in flight when the process died.
  saveDagState(executionsDir, executionId, { pendingNodes: [], completedNodes: [], runningNodes: ['n1'] });
}

/**
 * Recover one execution and run its scheduler loop.
 *
 * `recoverExecution` only rebuilds the entry (as `recoverAll` does, which then
 * hands the entry to `continueExecutionLoop`); starting the loop is the caller's
 * step, and that is where a re-pended node meets the executor.
 */
async function recoverAndRun(gateway, executionsDir, executionId) {
  registerExecutor(createMaterialGatewayExecutor({ gateway }));
  const entry = await recoverExecution({
    executionsDir,
    gateway,
    mediaDir: join(executionsDir, 'media'),
    entries: new Map(),
    onSetupEntry: () => {},
  }, executionId);
  assert.ok(entry, 'a live execution must be recovered');
  const loop = entry.scheduler.execute({ isRecovery: true });
  return { entry, loop };
}

test('#1382 修复前失败：恢复后引用仍在，节点复核而不是重投', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-1382-recovery-'));
  try {
    const executionId = 'exec_reconcile';
    const ref = { taskId: 'task-inflight', capability: 'video', submittedAt: Date.now() - 60_000 };
    seedRecord(dir, executionId, {
      n1: { status: 'running', startedAt: Date.now() - 60_000, completedAt: null, error: null, upstreamTask: ref },
    });
    const gateway = countingGateway();

    const { entry, loop } = await recoverAndRun(gateway, dir, executionId);
    // Fix-before this assertion failed: the reference had already been erased.
    assert.deepEqual(entry.context.readNodeUpstreamTask('n1'), ref);

    await loop;
    assert.equal(gateway.counts.reconcile, 1, 'the recovered node must reconcile');
    assert.equal(gateway.refs[0].taskId, 'task-inflight');
    assert.equal(gateway.counts.submit, 0, 'the hub already had this task: do not submit again');
    assert.equal(entry.context.nodeStates.get('n1').status, 'completed');
    assert.equal(entry.context.nodeStates.get('n1').upstreamTask, undefined, 'the terminal node drops its reference');
    // The P0 semantic survives: nothing is left stuck in flight.
    assert.equal(
      Object.values(entry.context.toJSON().nodeStates).some((state) => state.status === 'running'),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('越过 deadline 的引用：节点以超时结算，既不复核也不重投', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-1382-recovery-expired-'));
  try {
    const executionId = 'exec_expired';
    seedRecord(dir, executionId, {
      n1: {
        status: 'running',
        startedAt: Date.now() - 21 * 60_000,
        completedAt: null,
        error: null,
        upstreamTask: { taskId: 'task-stale', capability: 'video', submittedAt: Date.now() - 21 * 60_000 },
      },
    });
    const gateway = countingGateway();

    const { entry, loop } = await recoverAndRun(gateway, dir, executionId);
    await loop;

    assert.equal(gateway.counts.reconcile, 0, 'an expired window must not reach the hub');
    assert.equal(gateway.counts.submit, 0, 'and must not turn into a fresh submission');
    assert.equal(entry.context.nodeStates.get('n1').status, 'error');
    assert.match(String(entry.context.nodeStates.get('n1').error), /omnimux-task-timeout/);
    const record = loadExecutionRecord(dir, executionId);
    assert.equal(record.nodeStates.n1.upstreamTask, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('无引用的老记录：走既有重投路径（行为与今天一致）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-1382-recovery-legacy-'));
  try {
    const executionId = 'exec_legacy';
    seedRecord(dir, executionId, {
      n1: { status: 'running', startedAt: Date.now() - 60_000, completedAt: null, error: null },
    });
    const gateway = countingGateway();

    const { entry, loop } = await recoverAndRun(gateway, dir, executionId);
    await loop;

    assert.equal(gateway.counts.reconcile, 0);
    assert.equal(gateway.counts.submit, 1);
    assert.equal(gateway.counts.awaitTask, 1);
    assert.equal(entry.context.nodeStates.get('n1').status, 'completed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
