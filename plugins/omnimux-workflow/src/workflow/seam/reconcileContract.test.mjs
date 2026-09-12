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

// ============================================================================
// #1386: provenance — a reconcile must return to the backend that took the task
// ============================================================================

/** The request the seam-less auto-mode mock accepts and owns. */
function mockSubmitRequest(dest) {
  return { capability: 'video', prompt: 'a cat', operation: 'text_to_video', dest, wait: false };
}

test('#1386：submit 结果自带 owner，落盘的就是路由依据', async () => {
  const gateway = createAutoSwitchGateway({ getSeam: () => undefined });
  const result = await gateway.submit(mockSubmitRequest(DEST));
  assert.equal(result.mode, 'submitted');
  assert.equal(result.owner, 'mock', 'auto 模式解析到 mock 就必须在结果上说明');
});

test('#1386 修复前失败：重启后 mock 拥有的任务须回退重投，而非 needs-provider 失败', async () => {
  // The real assembly path, not the mock backend in isolation — testing only the
  // mock is exactly why this defect shipped green. Auto mode without hub seams,
  // the task submitted through instance #1, the reconcile run by instance #2: a
  // fresh object whose `taskOwners` is empty, i.e. a host restart.
  const before = createAutoSwitchGateway({ getSeam: () => undefined });
  const submitted = await before.submit(mockSubmitRequest(DEST));

  const afterRestart = createAutoSwitchGateway({ getSeam: () => undefined });
  const ref = {
    taskId: submitted.taskId,
    capability: 'video',
    submittedAt: Date.now(),
    ...(submitted.owner ? { owner: submitted.owner } : {}),
  };

  // Before the fix this rejected with `needs-provider`: the empty task table
  // defaulted to the hub, auto mode had no hub seam, and `isNotReconcilableError`
  // does not recognize that code — so the node was reported failed instead of
  // resubmitting.
  let error;
  try {
    await afterRestart.reconcileTask(ref, DEST);
  } catch (caught) {
    error = caught;
  }

  assert.ok(error, 'mock 的任务不跨进程存活，复核必须抛错而不是假装成功');
  assert.equal(error.code, 'omnimux-invalid-request', '必须是 mock 的「不可复核」答案');
  assert.notEqual(error.code, 'needs-provider', '不能是 hub 缺席的错误码');
  assert.equal(
    isNotReconcilableError(error),
    true,
    '调用方必须把它读成「不可复核 → 回退重投」',
  );
});

test('#1386：无 owner 的旧引用仍默认走 hub（向后兼容）', async () => {
  const seam = hubSeam();
  const gateway = createAutoSwitchGateway({
    getSeam: getSeamWith(seam),
    omnimuxGateway: createOmnimuxSeamClient({ getSeam: getSeamWith(seam) }),
  });

  // A reference written before #1386 has no `owner` at all; the added field must
  // not change what such a record does — it still routes to the hub.
  const result = await gateway.reconcileTask(REF, DEST);

  assert.equal(seam.requests.length, 1);
  assert.equal(result.url, DEST);
});

test('#1386：owner 为未知值时不报错，按无 provenance 处理（默认 hub）', async () => {
  const seam = hubSeam();
  const gateway = createAutoSwitchGateway({
    getSeam: getSeamWith(seam),
    omnimuxGateway: createOmnimuxSeamClient({ getSeam: getSeamWith(seam) }),
  });

  const result = await gateway.reconcileTask({ ...REF, owner: 'not-a-backend' }, DEST);

  assert.equal(seam.requests.length, 1, '未知 owner 不能中断复核');
  assert.equal(result.url, DEST);
});

test('#1386：owner=omnimux 的引用显式走 hub，不依赖缺省值', async () => {
  const seam = hubSeam();
  const gateway = createAutoSwitchGateway({
    getSeam: getSeamWith(seam),
    omnimuxGateway: createOmnimuxSeamClient({ getSeam: getSeamWith(seam) }),
  });

  const result = await gateway.reconcileTask({ ...REF, owner: 'omnimux' }, DEST);

  assert.equal(seam.requests.length, 1);
  assert.equal(result.url, DEST);
});
