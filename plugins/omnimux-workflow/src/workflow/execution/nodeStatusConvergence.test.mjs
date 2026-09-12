/**
 * Issue #1379 回归：执行终止路径（取消 / 超时 / 中断 / 失败）必须把在飞的
 * 节点收敛为终态。
 *
 * 缺陷原状：`ExecutionContext.cancel()` 只置执行态 CANCELLED，`fail()` 只落
 * 失败节点；在飞的节点因此永久停留在 `running`，`snapshotOfEntry` / 持久化
 * `execution.json` 也随之残留 running（画布卡片恒显「生成中…」）。
 *
 * 直接捆绑 TS 源码（不经 dist），与 executionReadinessEntries.test.mjs 同款。
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { test } from 'node:test';

const here = fileURLToPath(new URL('.', import.meta.url));
const bundle = buildSync({
  stdin: {
    contents: [
      "export { ExecutionContext, ExecutionStatus, NodeStatus } from './ExecutionContext.ts';",
      "export { ExecutionScheduler } from './ExecutionScheduler.ts';",
      "export { cleanupExecution, setupExecutionListeners } from './executionTimers.ts';",
      "export { loadExecutionRecord, saveExecutionRecord } from './executionStore.ts';",
      "export { recoverExecution } from './executionRecovery.ts';",
    ].join('\n'),
    resolveDir: here,
    sourcefile: 'runtime.ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const {
  ExecutionContext,
  ExecutionStatus,
  NodeStatus,
  ExecutionScheduler,
  cleanupExecution,
  setupExecutionListeners,
  loadExecutionRecord,
  saveExecutionRecord,
  recoverExecution,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const NODE = NodeStatus;

/** Poll helper (the scheduler free-runs the node executors). */
async function waitUntil(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timeout waiting for condition');
}

function runningStates(context) {
  return Object.entries(context.toJSON().nodeStates)
    .filter(([, state]) => state.status === NODE.RUNNING || state.status === NODE.PENDING)
    .map(([nodeId]) => nodeId);
}

test('取消：在飞节点与重 pend 节点收敛为 skipped，快照无 running 残留', () => {
  const context = new ExecutionContext({ workflowId: 'ws_cancel' });
  context.start(3);
  context.startNode('n1');
  context.startNode('n2');
  context.completeNode('n1', { text: 'done' });
  // 崩溃恢复把在飞节点重新 pend（executionRecovery.resetInFlightNodeStates）后又被取消。
  context.nodeStates.set('n3', {
    status: NODE.PENDING,
    startedAt: null,
    completedAt: null,
    error: null,
  });

  assert.deepEqual(runningStates(context).sort(), ['n2', 'n3']);

  context.cancel();

  assert.equal(context.status, ExecutionStatus.CANCELLED);
  assert.equal(context.nodeStates.get('n1').status, NODE.COMPLETED);
  assert.equal(context.nodeStates.get('n2').status, NODE.SKIPPED);
  assert.equal(context.nodeStates.get('n3').status, NODE.SKIPPED);
  assert.equal(context.nodeStates.get('n2').skipReason, '执行已取消');
  assert.equal(context.nodeStates.get('n2').completedAt !== null, true);
  assert.deepEqual(runningStates(context), []);
  assert.equal(context.toJSON().nodeStates.n2.status, 'skipped');
});

test('取消幂等：超时清理先取消后，调度循环的再次 cancel 不重复发终态事件', () => {
  const context = new ExecutionContext({ workflowId: 'ws_cancel_once' });
  let cancelledEvents = 0;
  context.events.on('execution_cancelled', () => {
    cancelledEvents += 1;
  });
  context.start(1);
  context.startNode('n1');

  context.cancel();
  const completedAt = context.completedAt;
  context.cancel();

  assert.equal(cancelledEvents, 1);
  assert.equal(context.completedAt, completedAt);
  assert.equal(context.nodeStates.get('n1').status, NODE.SKIPPED);
});

test('失败：在飞节点收敛为 error 并带上失败原因', () => {
  const context = new ExecutionContext({ workflowId: 'ws_fail' });
  context.start(2);
  context.startNode('n1');
  context.startNode('n2');
  context.failNode('n1', new Error('节点 1 执行失败'));

  context.fail(new Error('节点 1 执行失败'), 'n1');

  assert.equal(context.status, ExecutionStatus.ERROR);
  assert.equal(context.nodeStates.get('n1').status, NODE.ERROR);
  assert.equal(context.nodeStates.get('n2').status, NODE.ERROR);
  assert.equal(context.nodeStates.get('n2').error, '节点 1 执行失败');
  assert.deepEqual(runningStates(context), []);
});

test('中断：调度循环观察到取消后，在飞节点不再残留 running', async () => {
  const abortController = new AbortController();
  const context = new ExecutionContext({ workflowId: 'ws_abort' });
  const nodes = [
    { id: 'n1', type: 'material', data: {} },
    { id: 'n2', type: 'material', data: {} },
  ];
  const scheduler = new ExecutionScheduler({
    nodes,
    edges: [],
    context,
    maxParallel: 2,
    nodeExecutor: () =>
      new Promise((_resolve, reject) => {
        // 上游生成在途：只有 abort 才会结束（与网关 executor 一致）。
        abortController.signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      }),
  });

  const run = scheduler.execute();
  await waitUntil(() => context.nodeStates.size === 2);

  scheduler.cancel();
  abortController.abort();
  await run;

  assert.equal(context.status, ExecutionStatus.CANCELLED);
  assert.equal(context.nodeStates.get('n1').status, NODE.SKIPPED);
  assert.equal(context.nodeStates.get('n2').status, NODE.SKIPPED);
  assert.deepEqual(runningStates(context), []);
});

test('重载超时：恢复路径把持久化记录里的在飞节点收敛为 error', async () => {
  const executionsDir = mkdtempSync(join(tmpdir(), 'omnimux-node-recovery-'));
  try {
    const executionId = 'exec_timeout_across_restart';
    saveExecutionRecord(executionsDir, {
      schemaVersion: 1,
      id: executionId,
      workspaceId: 'ws_recovery',
      status: 'running',
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      // 崩溃前落盘的 startedAt：超过 EXECUTION_TIMEOUT_MS。
      startedAt: Date.now() - 31 * 60 * 1000,
      completedAt: null,
      error: null,
      totalNodes: 2,
      completedNodes: 1,
      variables: {},
      nodeStates: {
        n1: { status: 'running', startedAt: Date.now() - 31 * 60 * 1000, completedAt: null, error: null },
        n2: { status: 'completed', startedAt: Date.now() - 31 * 60 * 1000, completedAt: Date.now() - 30 * 60 * 1000, error: null },
      },
      nodeOutputs: { n2: { text: 'done' } },
      mediaAssets: {},
      breakpoints: [],
      maxParallel: 2,
      nodes: [
        { id: 'n1', type: 'material', data: {} },
        { id: 'n2', type: 'material', data: {} },
      ],
      edges: [],
      progress: { total: 2, completed: 1, percentage: 50 },
      eventLog: [],
    });

    const recovered = await recoverExecution(
      {
        executionsDir,
        gateway: {},
        mediaDir: executionsDir,
        entries: new Map(),
        onSetupEntry: () => {},
      },
      executionId,
    );

    assert.equal(recovered, null);
    const record = loadExecutionRecord(executionsDir, executionId);
    assert.ok(record, 'execution.json 应仍在磁盘上');
    assert.equal(record.status, 'error');
    assert.equal(record.nodeStates.n1.status, 'error');
    assert.match(record.nodeStates.n1.error, /timed out after restart/);
    // 已完成的节点不被误改。
    assert.equal(record.nodeStates.n2.status, 'completed');
    assert.equal(
      Object.values(record.nodeStates).some((state) => state.status === NODE.RUNNING),
      false,
    );
  } finally {
    rmSync(executionsDir, { recursive: true, force: true });
  }
});

test('超时清理：cleanupExecution 收敛在飞节点并把终态写进持久化记录', () => {
  const executionsDir = mkdtempSync(join(tmpdir(), 'omnimux-node-convergence-'));
  try {
    const context = new ExecutionContext({ workflowId: 'ws_timeout' });
    const abortController = new AbortController();
    let schedulerCancelled = false;
    context.start(2);
    context.startNode('n1');
    context.startNode('n2');

    const entry = {
      context,
      scheduler: {
        cancel: () => { schedulerCancelled = true; },
        getProgress: () => ({ total: 2, completed: 0, running: 2, pending: 0, percentage: 0 }),
      },
      abortController,
      nodes: [
        { id: 'n1', type: 'material', data: {} },
        { id: 'n2', type: 'material', data: {} },
      ],
      edges: [],
      maxParallel: 2,
      createdAt: new Date().toISOString(),
      syncTimer: null,
      timeoutTimer: null,
      loopRunning: true,
      isRecovered: false,
      eventLog: [],
      disposers: [],
    };
    const entries = new Map([[context.id, entry]]);
    setupExecutionListeners(executionsDir, entry);

    // EXECUTION_TIMEOUT_MS 到点：取消 + abort，条目随即离开内存表。
    cleanupExecution(entries, context.id);

    assert.equal(schedulerCancelled, true);
    assert.equal(abortController.signal.aborted, true);
    assert.equal(entries.size, 0);
    assert.equal(context.status, ExecutionStatus.CANCELLED);

    const record = loadExecutionRecord(executionsDir, context.id);
    assert.ok(record, 'execution.json 应已落盘');
    assert.equal(record.status, 'cancelled');
    assert.equal(record.nodeStates.n1.status, 'skipped');
    assert.equal(record.nodeStates.n2.status, 'skipped');
    assert.equal(
      Object.values(record.nodeStates).some((state) => state.status === NODE.RUNNING),
      false,
    );
  } finally {
    rmSync(executionsDir, { recursive: true, force: true });
  }
});
