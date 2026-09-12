/**
 * Issue #1382 T04/T05 regression: the reconcile state machine.
 *
 * `reconcileUpstreamTask` is the decision layer between "the hub already has
 * this task" and "submit it fresh". Each of its outcomes is asserted here with a
 * fake gateway, including the two that must NOT be turned into a silent
 * resubmit (a genuinely failed task, and one whose window already closed) and
 * the two that must (no reference, or a task the hub does not know).
 *
 * Source is bundled directly (esbuild + `data:` URL); no `dist` build involved.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { test } from 'node:test';

const here = fileURLToPath(new URL('.', import.meta.url));
const bundle = buildSync({
  stdin: {
    contents: [
      "export { reconcileUpstreamTask, isNotReconcilableError, UPSTREAM_TASK_DEADLINE_MS } from './upstreamReconcile.ts';",
      "export { SeamGatewayError } from '../seam/SeamGatewayError.ts';",
    ].join('\n'),
    resolveDir: here,
    sourcefile: 'reconcile-runtime.ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const {
  reconcileUpstreamTask,
  isNotReconcilableError,
  UPSTREAM_TASK_DEADLINE_MS,
  SeamGatewayError,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const NOW = Date.now();
const FRESH_REF = { taskId: 'task-fresh', capability: 'video', submittedAt: NOW - 60_000 };
const DEST = '/tmp/omnimux-1382/reconciled.mp4';

/** Gateway double: records reconcile calls, answers with a scripted outcome. */
function fakeGateway({ result, error } = {}) {
  const calls = [];
  return {
    calls,
    submitCalls: 0,
    async submit() { this.submitCalls += 1; return { taskId: 'unused', mode: 'submitted' }; },
    async awaitTask() { throw new Error('awaitTask must not be used for a reconcile'); },
    async reconcileTask(ref, dest, signal) {
      calls.push({ ref, dest, hasSignal: signal instanceof AbortSignal });
      if (error) throw error;
      return result ?? { url: dest, type: ref.capability, mimeType: 'video/mp4' };
    },
    async capabilities() { return { models: [] }; },
  };
}

test('上游完成后复核成功：不产生任何新的 submit', async () => {
  const gateway = fakeGateway();
  const outcome = await reconcileUpstreamTask({
    gateway, ref: FRESH_REF, dest: DEST, signal: new AbortController().signal, capability: 'video',
  });
  assert.equal(outcome.kind, 'downloaded');
  assert.equal(outcome.result.url, DEST);
  assert.equal(outcome.result.type, 'video');
  assert.equal(gateway.calls.length, 1);
  assert.equal(gateway.submitCalls, 0, 'reconciling must never submit again');
  assert.equal(gateway.calls[0].ref.taskId, 'task-fresh');
  assert.equal(gateway.calls[0].hasSignal, true);
});

test('上游未完成时保持等待（复核调用本身是有界的轮询）', async () => {
  // A reconcile is one blocking, hub-bounded call: the node stays `running` until
  // it returns, which is the "still in flight, keep waiting" mapping. There is no
  // separate outcome for it — the call has simply not returned yet.
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const gateway = fakeGateway();
  gateway.reconcileTask = async (ref, dest) => {
    gateway.calls.push({ ref, dest });
    await pending;
    return { url: dest, type: ref.capability };
  };
  const running = reconcileUpstreamTask({
    gateway, ref: FRESH_REF, dest: DEST, signal: new AbortController().signal, capability: 'video',
  });
  let settled = false;
  void running.then(() => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(settled, false, 'a still-running upstream keeps the node in flight');
  release();
  assert.equal((await running).kind, 'downloaded');
});

test('上游终态失败：判为 failed，不回退重投', async () => {
  const gateway = fakeGateway({ error: new SeamGatewayError('omnimux-failed', 'video task t failed') });
  const outcome = await reconcileUpstreamTask({
    gateway, ref: FRESH_REF, dest: DEST, signal: new AbortController().signal, capability: 'video',
  });
  assert.equal(outcome.kind, 'failed');
  assert.equal(outcome.error.code, 'omnimux-failed');
  assert.equal(gateway.submitCalls, 0);
});

test('配额失败：同样判为 failed，错误码原样透出', async () => {
  const gateway = fakeGateway({ error: new SeamGatewayError('quota-exceeded', '额度不足') });
  const outcome = await reconcileUpstreamTask({
    gateway, ref: FRESH_REF, dest: DEST, signal: new AbortController().signal, capability: 'video',
  });
  assert.equal(outcome.kind, 'failed');
  assert.equal(outcome.error.code, 'quota-exceeded');
});

test('无引用：回退重投（老记录与未登记节点）', async () => {
  const gateway = fakeGateway();
  const outcome = await reconcileUpstreamTask({
    gateway, ref: undefined, dest: DEST, signal: new AbortController().signal, capability: 'video',
  });
  assert.equal(outcome.kind, 'not-reconcilable');
  assert.equal(gateway.calls.length, 0, 'no reference means no hub call at all');
});

test('hub 未知任务：回退重投（omnimux-invalid-request）', async () => {
  const gateway = fakeGateway({ error: new SeamGatewayError('omnimux-invalid-request', '未知任务 task-x') });
  const outcome = await reconcileUpstreamTask({
    gateway, ref: FRESH_REF, dest: DEST, signal: new AbortController().signal, capability: 'video',
  });
  assert.equal(outcome.kind, 'not-reconcilable');
  assert.match(outcome.reason, /未知任务/);
});

test('节点能力与引用不一致：不回退重投，直接判为不可复核（请求已提交，语义已变）', async () => {
  const gateway = fakeGateway();
  const outcome = await reconcileUpstreamTask({
    gateway, ref: FRESH_REF, dest: DEST, signal: new AbortController().signal, capability: 'image',
  });
  assert.equal(outcome.kind, 'not-reconcilable');
  assert.equal(gateway.calls.length, 0);
});

test('#1382 修复前失败：重启耗时越过 deadline → 立即超时且不发任何请求', async () => {
  const gateway = fakeGateway();
  const started = Date.now();
  const outcome = await reconcileUpstreamTask({
    gateway,
    // Submitted 21 minutes ago: the window is gone, and a fresh one must not be
    // granted — otherwise every restart would extend a stuck task's life.
    ref: { ...FRESH_REF, submittedAt: NOW - UPSTREAM_TASK_DEADLINE_MS - 60_000 },
    dest: DEST,
    signal: new AbortController().signal,
    capability: 'video',
  });
  assert.equal(outcome.kind, 'failed');
  assert.equal(outcome.error.code, 'omnimux-task-timeout');
  assert.match(outcome.error.message, /exceeded its 1200000ms poll deadline before the restart/);
  assert.equal(gateway.calls.length, 0, 'an expired reference must not reach the hub');
  assert.ok(Date.now() - started < 1000);
});

test('deadline 恰好到点即视为越过（不给出第二个窗口）', async () => {
  const gateway = fakeGateway();
  const outcome = await reconcileUpstreamTask({
    gateway,
    ref: { ...FRESH_REF, submittedAt: Date.now() - UPSTREAM_TASK_DEADLINE_MS },
    dest: DEST,
    signal: new AbortController().signal,
    capability: 'video',
  });
  assert.equal(outcome.kind, 'failed');
  assert.equal(gateway.calls.length, 0);
});

test('「不可复核」判定表', () => {
  assert.equal(isNotReconcilableError(new SeamGatewayError('omnimux-invalid-request', 'unknown task')), true);
  assert.equal(isNotReconcilableError({ code: 'omnimux-invalid-request' }), true);
  // A 404 that reaches us as a bare hub error (no seam wrapper) counts too.
  assert.equal(isNotReconcilableError({ code: 'omnimux-request-failed', status: 404 }), true);
  assert.equal(isNotReconcilableError({ code: 'omnimux-request-failed', status: 410 }), true);
  for (const other of [
    null,
    undefined,
    'string',
    { code: 'omnimux-failed' },
    { code: 'quota-exceeded' },
    { code: 'omnimux-task-timeout' },
    { code: 'omnimux-request-failed', status: 500 },
    new SeamGatewayError('needs-provider', 'hub 未加载'),
  ]) {
    assert.equal(isNotReconcilableError(other), false, JSON.stringify(other));
  }
});
