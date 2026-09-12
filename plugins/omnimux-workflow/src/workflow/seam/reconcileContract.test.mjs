/**
 * Issue #1382 T04 regression: `reconcileTask` is a contract, not one
 * implementation's private method.
 *
 * All three gateway implementations must honour it — the hub seam client
 * reconciles for real (no in-process task table involved), the mock declares
 * itself unable to (its tasks die with the process) and the auto-switch wrapper
 * routes without losing the task's owner. Fix-before, none of them had the
 * method, so a recovered node had nothing to call but `submit`.
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
      "export { createOmnimuxSeamClient, seamNameFor } from './omnimuxGateway.ts';",
      "export { createMockGateway } from './mockGateway.ts';",
      "export { createAutoSwitchGateway, probeSeams } from './gatewaySelection.ts';",
      "export { SeamGatewayError } from './SeamGatewayError.ts';",
      "export { isNotReconcilableError } from '../execution/upstreamReconcile.ts';",
    ].join('\n'),
    resolveDir: here,
    sourcefile: 'reconcile-contract-runtime.ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const {
  createOmnimuxSeamClient,
  seamNameFor,
  createMockGateway,
  createAutoSwitchGateway,
  probeSeams,
  SeamGatewayError,
  isNotReconcilableError,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const REF = { taskId: 'task-1382', capability: 'video', submittedAt: 1_700_000_000_000 };
const DEST = '/tmp/omnimux-1382/contract.mp4';

/** Hub seam double: records every execute() request and answers with a mode. */
function hubSeam({ mode = 'live', error } = {}) {
  const requests = [];
  return {
    requests,
    async execute(request) {
      requests.push(request);
      if (error) throw error;
      return { mode, url: DEST, type: 'video', mimeType: 'video/mp4', taskId: request.taskId };
    },
  };
}

const getSeamWith = (seam) => (name) => (name === 'videoGenerate' ? seam : undefined);

test('三个实现都提供 reconcileTask', () => {
  for (const gateway of [
    createOmnimuxSeamClient({ getSeam: () => undefined }),
    createMockGateway(),
    createAutoSwitchGateway({ getSeam: () => undefined }),
  ]) {
    assert.equal(typeof gateway.reconcileTask, 'function');
    assert.equal(typeof gateway.submit, 'function');
    assert.equal(typeof gateway.awaitTask, 'function');
  }
});

test('omnimux：按已持久化的 taskId 复核，走 { taskId, dest } 且不提交', async () => {
  const seam = hubSeam();
  const gateway = createOmnimuxSeamClient({ getSeam: getSeamWith(seam) });

  const result = await gateway.reconcileTask(REF, DEST, new AbortController().signal);

  assert.equal(seam.requests.length, 1);
  assert.equal(seam.requests[0].taskId, REF.taskId);
  assert.equal(seam.requests[0].dest, DEST);
  assert.equal(seam.requests[0].submittedAt, REF.submittedAt, 'the deadline anchor reaches the hub');
  assert.equal(seam.requests[0].wait, undefined, 'a reconcile polls, it does not re-submit');
  assert.ok(seam.requests[0].signal instanceof AbortSignal);
  assert.equal(result.url, DEST);
  assert.equal(result.type, 'video');
  // Nothing about the request requires the client's own task table: this call
  // works in a process that never submitted the task.
  assert.equal(seamNameFor(REF.capability), 'videoGenerate');
});

test('omnimux：hub 未知任务 → omnimux-invalid-request（不可复核）', async () => {
  const seam = hubSeam({ error: Object.assign(new Error('未知任务'), { code: 'omnimux-invalid-request' }) });
  const gateway = createOmnimuxSeamClient({ getSeam: getSeamWith(seam) });

  await assert.rejects(
    () => gateway.reconcileTask(REF, DEST),
    (error) => error instanceof SeamGatewayError
      && error.code === 'omnimux-invalid-request'
      && isNotReconcilableError(error) === true,
  );
});

test('omnimux：hub 报任务失败 → 原样透出，且不视为不可复核', async () => {
  const seam = hubSeam({ error: Object.assign(new Error('video task t failed'), { code: 'omnimux-failed' }) });
  const gateway = createOmnimuxSeamClient({ getSeam: getSeamWith(seam) });

  await assert.rejects(
    () => gateway.reconcileTask(REF, DEST),
    (error) => error.code === 'omnimux-failed' && isNotReconcilableError(error) === false,
  );
});

test('omnimux：复核返回非 live → omnimux-invalid-response', async () => {
  const gateway = createOmnimuxSeamClient({ getSeam: getSeamWith(hubSeam({ mode: 'submitted' })) });
  await assert.rejects(() => gateway.reconcileTask(REF, DEST), { code: 'omnimux-invalid-response' });
});

test('omnimux：awaitTask 的未知任务语义不受影响（仍需重新提交）', async () => {
  const gateway = createOmnimuxSeamClient({ getSeam: getSeamWith(hubSeam()) });
  await assert.rejects(
    () => gateway.awaitTask('never-submitted-here', DEST),
    (error) => error.code === 'omnimux-invalid-request' && /未知任务/.test(error.message),
  );
});

test('mock：明确声明不可跨进程复核', async () => {
  const gateway = createMockGateway();
  await assert.rejects(
    () => gateway.reconcileTask(REF, DEST),
    (error) => error instanceof SeamGatewayError
      && error.code === 'omnimux-invalid-request'
      && /does not survive a restart/.test(error.message)
      && isNotReconcilableError(error) === true,
  );
});

test('auto-switch：复核默认路由到 hub（taskOwners 重启后必为空）', async () => {
  const seam = hubSeam();
  const mock = createMockGateway();
  const gateway = createAutoSwitchGateway({
    getSeam: getSeamWith(seam),
    mockGateway: mock,
    omnimuxGateway: createOmnimuxSeamClient({ getSeam: getSeamWith(seam) }),
  });
  assert.deepEqual(probeSeams(getSeamWith(seam)), { video: true, image: false, audio: false, text: false });

  const result = await gateway.reconcileTask(REF, DEST);

  assert.equal(seam.requests.length, 1);
  assert.equal(result.url, DEST);
  // A second reconcile must still route the same way (no stale owner left behind).
  await gateway.reconcileTask(REF, DEST);
  assert.equal(seam.requests.length, 2);
});

test('auto-switch：hub 缺席时复核如实报 needs-provider，不伪装成功', async () => {
  const gateway = createAutoSwitchGateway({ getSeam: () => undefined });
  await assert.rejects(
    () => gateway.reconcileTask(REF, DEST),
    (error) => error.code === 'needs-provider',
  );
});
