/**
 * Issue #1382 T04 regression: the material executor must reconcile an upstream
 * task it was re-pended with instead of submitting a second one.
 *
 * The two numbers that matter here are the gateway's submit and reconcile call
 * counts. Fix-before, a recovered node always submitted (submit === 1, reconcile
 * === 0) because nothing persisted that the hub already had the work.
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMaterialGatewayExecutor } from './materialGatewayExecutor.ts';
import { SeamGatewayError } from '../seam/SeamGatewayError.ts';
import { catalogFor, operation } from '../seam/submissionFixtures.mjs';

const root = mkdtempSync(join(tmpdir(), 'material-reconcile-1382-'));
after(() => rmSync(root, { recursive: true, force: true }));

const CATALOG = catalogFor('video', 'fixture-model', [
  operation('text_to_video', 'video'),
  operation('image_to_video', 'video'),
]);
const NODE = {
  id: 'output',
  type: 'material',
  data: { materialType: 'video', prompt: 'go', params: { operation: 'text_to_video' } },
};
const REF = { taskId: 'task-inflight', capability: 'video', submittedAt: Date.now() - 30_000 };

/**
 * Executor context double with a node-state store, so `recordUpstreamTask` /
 * `readUpstreamTask` / `clearUpstreamTask` behave like the real wiring.
 */
function contextWithRef(ref) {
  const state = { upstreamTask: ref };
  const calls = { record: [], clear: 0 };
  return {
    state,
    calls,
    ctx: {
      upstreamOutputs: new Map(),
      mediaDir: root,
      signal: new AbortController().signal,
      catalog: CATALOG,
      readUpstreamTask: () => state.upstreamTask,
      recordUpstreamTask: (value) => { calls.record.push(value); state.upstreamTask = value; },
      clearUpstreamTask: () => { calls.clear += 1; state.upstreamTask = undefined; },
    },
  };
}

function gateway({ reconcile } = {}) {
  const counts = { submit: 0, awaitTask: 0, reconcile: 0 };
  const seen = { reconcile: [], submit: [] };
  return {
    counts,
    seen,
    capabilities: async () => CATALOG,
    async submit(req) {
      counts.submit += 1;
      seen.submit.push(req);
      return { taskId: 'task-fresh', mode: 'submitted' };
    },
    async awaitTask(taskId, dest) {
      counts.awaitTask += 1;
      return { url: dest, type: 'video', mimeType: 'video/mp4' };
    },
    async reconcileTask(ref, dest) {
      counts.reconcile += 1;
      seen.reconcile.push(ref);
      if (reconcile) return reconcile(ref, dest);
      return { url: dest, type: 'video', mimeType: 'video/mp4' };
    },
  };
}

test('#1382 修复前失败：恢复节点的上游任务被复核而非重投', async () => {
  const gw = gateway();
  const { state, calls, ctx } = contextWithRef(REF);

  const output = await createMaterialGatewayExecutor({ gateway: gw }).execute(NODE, ctx);

  assert.equal(gw.counts.submit, 0, 'a reconciled node must not submit a second task');
  assert.equal(gw.counts.reconcile, 1);
  assert.equal(gw.counts.awaitTask, 0, 'the reconcile replaces the poll, it does not follow it');
  assert.equal(gw.seen.reconcile[0].taskId, REF.taskId);
  assert.equal(gw.seen.reconcile[0].submittedAt, REF.submittedAt, 'the deadline anchor travels with the reference');
  assert.equal(calls.clear, 1, 'a terminal node drops its reference');
  assert.equal(state.upstreamTask, undefined);
  assert.equal(output.mediaAssets[0].type, 'video');
});

test('无引用时按既有路径提交，并在提交成功后立即登记引用', async () => {
  const gw = gateway();
  const { state, calls, ctx } = contextWithRef(undefined);

  await createMaterialGatewayExecutor({ gateway: gw }).execute(NODE, ctx);

  assert.equal(gw.counts.submit, 1);
  assert.equal(gw.counts.reconcile, 0);
  assert.equal(gw.counts.awaitTask, 1);
  assert.equal(calls.record.length, 1, 'submit success must be recorded at once');
  assert.equal(calls.record[0].taskId, 'task-fresh');
  assert.equal(calls.record[0].capability, 'video');
  assert.equal(typeof calls.record[0].submittedAt, 'number');
  // The poll path clears on completion too.
  assert.equal(state.upstreamTask, undefined);
  assert.equal(calls.clear, 1);
});

test('hub 判为不可复核（未知任务）时回退重投', async () => {
  const gw = gateway({
    reconcile: () => { throw new SeamGatewayError('omnimux-invalid-request', '未知任务 task-inflight'); },
  });
  const { state, calls, ctx } = contextWithRef(REF);

  await createMaterialGatewayExecutor({ gateway: gw }).execute(NODE, ctx);

  assert.equal(gw.counts.reconcile, 1);
  assert.equal(gw.counts.submit, 1, 'an unreconcilable reference falls back to submitting');
  assert.equal(gw.seen.submit.length, 1);
  // Two clears, both intended: the first drops the unusable reference before
  // resubmitting, the second drops the fresh one when the node goes terminal.
  assert.equal(calls.clear, 2);
  assert.equal(state.upstreamTask, undefined, 'a terminal node keeps no reference');
  assert.equal(calls.record.at(-1).taskId, 'task-fresh', 'the record tracks the new task, not the stale one');
});

test('mock 网关不可复核时同样回退重投（与今天行为一致，不劣化）', async () => {
  const gw = gateway({
    reconcile: () => {
      throw new SeamGatewayError('omnimux-invalid-request', 'mock gateway: task t does not survive a restart (nothing to reconcile)');
    },
  });
  const { ctx } = contextWithRef({ taskId: 'task-inflight', capability: 'video', submittedAt: Date.now() - 1000 });

  await createMaterialGatewayExecutor({ gateway: gw }).execute(NODE, ctx);

  assert.equal(gw.counts.submit, 1);
});

test('上游真的失败时节点报错，且不再重投', async () => {
  const gw = gateway({
    reconcile: () => { throw new SeamGatewayError('omnimux-failed', 'video task task-inflight failed'); },
  });
  const { state, calls, ctx } = contextWithRef(REF);

  await assert.rejects(
    () => createMaterialGatewayExecutor({ gateway: gw }).execute(NODE, ctx),
    (error) => error.code === 'omnimux-failed',
  );

  assert.equal(gw.counts.submit, 0, 'a failed upstream task must not be resubmitted automatically');
  assert.equal(calls.clear, 1);
  assert.equal(state.upstreamTask, undefined);
});

test('越过 deadline 的引用：节点立即以超时结算，不发出复核请求、不重投', async () => {
  const gw = gateway();
  const expired = { taskId: 'task-stale', capability: 'video', submittedAt: Date.now() - 21 * 60_000 };
  const { calls, ctx } = contextWithRef(expired);

  await assert.rejects(
    () => createMaterialGatewayExecutor({ gateway: gw }).execute(NODE, ctx),
    (error) => error.code === 'omnimux-task-timeout',
  );

  assert.equal(gw.counts.reconcile, 0, 'an expired window must not reach the hub');
  assert.equal(gw.counts.submit, 0, 'and must not turn into a fresh submission either');
  assert.equal(calls.clear, 1);
});
