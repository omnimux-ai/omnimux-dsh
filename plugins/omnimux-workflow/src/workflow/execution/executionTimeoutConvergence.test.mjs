/**
 * Issue #1386 P1/P4 regression — the *in-process* deadline must converge a run
 * exactly the way a post-restart recovery converges the same deadline.
 *
 * The defect the source-level teardown tests could not see: `cleanupExecution`
 * (`'timed-out'`) fails the run and aborts the executors, and the scheduler
 * loop then reaches its own `context.cancel()` while unwinding. `cancel()` only
 * guarded against `CANCELLED`, so it overwrote the recorded `error` with
 * `cancelled` — the persisted record said `status='cancelled'` with
 * `error='执行超时（超过 30 分钟）'` while the restart path recorded `error` for
 * the same deadline. Same event, two terminal states.
 *
 * The earlier regression tests used a stub scheduler or a context that was never
 * driven by a loop, so neither reproduced it. This file drives the production
 * path end to end: a real `ExecutionManager`, a real `ExecutionScheduler`, and
 * the manager's real `EXECUTION_TIMEOUT_MS` deadline callback (captured by
 * intercepting `setTimeout` — the 30-minute wait itself is the only thing
 * replaced).
 *
 * Source is bundled directly (`esbuild` + a `data:` URL), the same pattern as
 * `nodeStatusConvergence.test.mjs`, so no `dist` build is involved.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { test } from 'node:test';

const here = fileURLToPath(new URL('.', import.meta.url));
const bundle = buildSync({
  stdin: {
    contents: [
      "export { createExecutionManager } from './ExecutionManager.ts';",
      "export { createMockGateway } from '../seam/mockGateway.ts';",
      "export { recoverExecution } from './executionRecovery.ts';",
      "export { loadExecutionRecord, saveExecutionRecord } from './executionStore.ts';",
      "export { EXECUTION_TIMEOUT_MESSAGE, EXECUTION_TIMEOUT_MS } from './executionTypes.ts';",
    ].join('\n'),
    resolveDir: here,
    sourcefile: 'execution-timeout-runtime.ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const {
  createExecutionManager,
  createMockGateway,
  recoverExecution,
  loadExecutionRecord,
  saveExecutionRecord,
  EXECUTION_TIMEOUT_MESSAGE,
  EXECUTION_TIMEOUT_MS,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

/** Poll helper: the scheduler free-runs its executors. */
async function waitUntil(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return predicate();
}

/**
 * Capture the manager's real `EXECUTION_TIMEOUT_MS` timers instead of waiting
 * 30 minutes for them.
 *
 * The captured callbacks are the production ones (`startTimeout` → the
 * `cleanupExecution(…, 'timed-out')` closure, and the terminal retention reaper);
 * only the firing moment changes, and the test chooses it deterministically.
 */
function captureDeadlineTimers() {
  const realSetTimeout = globalThis.setTimeout;
  const callbacks = [];
  globalThis.setTimeout = (fn, ms, ...rest) => {
    if (ms === EXECUTION_TIMEOUT_MS) {
      callbacks.push(fn);
      // A handle that clears nothing: these callbacks fire from the test body.
      return realSetTimeout(() => {}, 0);
    }
    return realSetTimeout(fn, ms, ...rest);
  };
  return {
    callbacks,
    restore: () => {
      globalThis.setTimeout = realSetTimeout;
    },
  };
}

/** The persisted outcome, in one line, so a failure shows what was recorded. */
function recordDump(record) {
  if (!record) return '<no record>';
  return JSON.stringify({
    status: record.status,
    error: record.error,
    nodes: Object.fromEntries(
      Object.entries(record.nodeStates ?? {}).map(([id, state]) => [
        id,
        { status: state.status, error: state.error, skipReason: state.skipReason },
      ]),
    ),
  });
}

/** A running record whose `startedAt` is already past the deadline. */
function staleRunningRecord(id) {
  const startedAt = Date.now() - 31 * 60 * 1000;
  return {
    schemaVersion: 1,
    id,
    workspaceId: 'ws_restart',
    status: 'running',
    createdAt: new Date(startedAt).toISOString(),
    startedAt,
    completedAt: null,
    error: null,
    totalNodes: 1,
    completedNodes: 0,
    variables: {},
    nodeStates: {
      n1: { status: 'running', startedAt, completedAt: null, error: null },
    },
    nodeOutputs: {},
    mediaAssets: {},
    breakpoints: [],
    maxParallel: 1,
    nodes: [{ id: 'n1', type: 'material', data: {} }],
    edges: [],
    progress: { total: 1, completed: 0, percentage: 0 },
    eventLog: [],
  };
}

/** Manager + a gateway whose submit never settles (keeps the node in flight). */
function makeInFlightManager(root) {
  const executionsDir = join(root, 'executions');
  const mediaDir = join(root, 'media');
  mkdirSync(mediaDir, { recursive: true });
  const gateway = createMockGateway({ minLatencyMs: 1, maxLatencyMs: 1 });
  // A submit that never resolves holds the node in `running` — the state the
  // deadline actually finds it in.
  gateway.submit = () => new Promise(() => {});
  const manager = createExecutionManager({ executionsDir, mediaDir, gateway });
  return { manager, executionsDir };
}

test('#1386 P1：进程内超时终态必须是 error，与重启后恢复同解（真实 manager + 真实 scheduler）', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-1386-timeout-'));
  const timers = captureDeadlineTimers();
  let manager = null;
  try {
    // ---------------------------------------------------------------- (a) 重启路径
    // The same deadline, reached through the post-restart entry point.
    const restartDir = join(root, 'restart');
    saveExecutionRecord(restartDir, staleRunningRecord('exec_restart'));
    const recovered = await recoverExecution(
      {
        executionsDir: restartDir,
        gateway: {},
        mediaDir: restartDir,
        entries: new Map(),
        onSetupEntry: () => {},
      },
      'exec_restart',
    );
    assert.equal(recovered, null, '重启路径不复活已超时的执行');
    const restartRecord = loadExecutionRecord(restartDir, 'exec_restart');

    // ------------------------------------------------------------ (b) 进程内路径
    const { manager: liveManager, executionsDir } = makeInFlightManager(root);
    manager = liveManager;
    const entry = manager.createExecution({
      workspaceId: 'ws_p1',
      nodes: [{
        id: 'n1',
        type: 'material',
        data: { materialType: 'text', selectedTool: 'text-to-text', prompt: '慢任务' },
      }],
      edges: [],
      maxParallel: 1,
    });

    assert.ok(
      await waitUntil(() => manager.getSnapshot(entry.context.id)?.nodeStates?.n1?.status === 'running'),
      '节点应处于在飞状态',
    );
    assert.equal(timers.callbacks.length, 1, '生产路径必须挂上一个真实 deadline 定时器');
    // From here the deadline is fired by the test, not by the 30-minute timer.
    timers.restore();
    // 生产时序：scheduler.cancel() → abortController.abort() → context.fail(TIMEOUT)
    timers.callbacks[0]();

    // The loop only leaves after the abort unwinds the in-flight executor, and
    // on its way out it still calls its own context.cancel().
    assert.ok(await waitUntil(() => entry.loopRunning === false), '调度循环应已退出');

    const record = loadExecutionRecord(executionsDir, entry.context.id);
    const dump = recordDump(record);
    // Evidence hook: `OMNIMUX_1386_DUMP=1 node --test …` prints the persisted
    // fields this test is about (status / error / node states).
    if (process.env.OMNIMUX_1386_DUMP) {
      console.log(`[#1386 P1] in-process record: ${dump}`);
      console.log(`[#1386 P1] restart record:    ${recordDump(restartRecord)}`);
    }
    assert.ok(record, `execution.json 应已落盘（${dump}）`);
    assert.equal(
      record.status,
      'error',
      `进程内超时必须记为 error（修复前被调度循环的 cancel() 覆写成 cancelled）：${dump}`,
    );
    assert.equal(record.error, EXECUTION_TIMEOUT_MESSAGE, `超时文案必须保留：${dump}`);
    assert.equal(record.nodeStates.n1.status, 'error', `在飞节点应收敛为 error：${dump}`);
    assert.equal(record.nodeStates.n1.error, EXECUTION_TIMEOUT_MESSAGE, `节点应带同一文案：${dump}`);
    // What a client reads back (the entry left the in-memory table, so this is
    // the persisted record).
    assert.equal(manager.getSnapshot(entry.context.id).status, 'error', `快照必须是 error：${dump}`);

    // ------------------------------------------------- F2：两条路径必须同解
    const restartDump = recordDump(restartRecord);
    assert.equal(
      record.status,
      restartRecord.status,
      `同一 deadline 的终态必须一致：in-process=${dump} restart=${restartDump}`,
    );
    assert.equal(
      record.error,
      restartRecord.error,
      `同一 deadline 的文案必须一致：in-process=${dump} restart=${restartDump}`,
    );
    assert.equal(
      record.nodeStates.n1.error,
      restartRecord.nodeStates.n1.error,
      `节点文案必须一致：in-process=${dump} restart=${restartDump}`,
    );
  } finally {
    timers.restore();
    if (manager) manager.disposeAll();
    rmSync(root, { recursive: true, force: true });
  }
});

test('#1386：真实调度回路的用户主动取消仍是 cancelled', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-1386-cancel-'));
  let manager = null;
  try {
    const { manager: liveManager, executionsDir } = makeInFlightManager(root);
    manager = liveManager;
    const entry = manager.createExecution({
      workspaceId: 'ws_cancel',
      nodes: [{
        id: 'n1',
        type: 'material',
        data: { materialType: 'text', selectedTool: 'text-to-text', prompt: '取消我' },
      }],
      edges: [],
      maxParallel: 1,
    });
    assert.ok(
      await waitUntil(() => manager.getSnapshot(entry.context.id)?.nodeStates?.n1?.status === 'running'),
      '节点应处于在飞状态',
    );

    const result = await manager.cancelExecution(entry.context.id);
    assert.equal(result.ok, true, '在飞执行应可取消');
    assert.ok(await waitUntil(() => entry.loopRunning === false), '调度循环应已退出');

    const record = loadExecutionRecord(executionsDir, entry.context.id);
    const dump = recordDump(record);
    assert.equal(record.status, 'cancelled', `用户取消仍是 cancelled：${dump}`);
    assert.equal(record.error, null, `取消不是失败，不能带超时文案：${dump}`);
    assert.equal(record.nodeStates.n1.status, 'skipped', `在飞节点应收敛为 skipped：${dump}`);
    assert.equal(manager.getSnapshot(entry.context.id).status, 'cancelled', `快照仍是 cancelled：${dump}`);
  } finally {
    if (manager) manager.disposeAll();
    rmSync(root, { recursive: true, force: true });
  }
});

test('#1386 P4：终态后 deadline 定时器已停，条目改由 retention 定时器回收', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-1386-retention-'));
  const timers = captureDeadlineTimers();
  let manager = null;
  try {
    const executionsDir = join(root, 'executions');
    const mediaDir = join(root, 'media');
    mkdirSync(mediaDir, { recursive: true });
    manager = createExecutionManager({
      executionsDir,
      mediaDir,
      gateway: createMockGateway({ minLatencyMs: 1, maxLatencyMs: 1 }),
    });
    const entry = manager.createExecution({
      workspaceId: 'ws_p4',
      nodes: [{
        id: 't1',
        type: 'material',
        data: { materialType: 'text', selectedTool: 'text-to-text', prompt: '写一句话' },
      }],
      edges: [],
    });
    assert.ok(
      await waitUntil(() => manager.getSnapshot(entry.context.id)?.status === 'completed'),
      '回合应正常完成',
    );

    const live = manager.getEntry(entry.context.id);
    assert.equal(
      live.timeoutTimer,
      null,
      '终态后不得再挂着 30 分钟 deadline 定时器（修复前它一直留到 30 分钟后才被 wasRunning 挡下）',
    );
    assert.notEqual(
      live.retentionTimer,
      null,
      '终态条目必须仍有回收定时器，否则已结束的执行会永久驻留内存表',
    );

    // The real retention reaper, fired by the test: one deadline timer (armed at
    // creation, now stopped) plus one retention timer (armed at the terminal
    // event).
    assert.equal(timers.callbacks.length, 2, '应恰好一个 deadline + 一个 retention');
    timers.callbacks[1]();
    assert.equal(manager.getEntry(entry.context.id), null, 'retention 到期后条目应从内存表回收');
    const record = loadExecutionRecord(executionsDir, entry.context.id);
    assert.equal(record.status, 'completed', `回收不得改动终态记录：${recordDump(record)}`);
  } finally {
    timers.restore();
    if (manager) manager.disposeAll();
    rmSync(root, { recursive: true, force: true });
  }
});
