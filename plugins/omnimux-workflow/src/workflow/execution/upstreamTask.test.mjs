/**
 * Issue #1382 T03 regression: an upstream task reference must survive in the
 * persisted execution record.
 *
 * Defect as shipped: `PersistedExecutionRecord` carried nodeStates / nodeOutputs
 * / mediaAssets / nodes / edges but nothing about an upstream task, so after a
 * restart the only thing the executor could do was submit again — discarding an
 * artifact the hub may already hold and paying for the work twice.
 *
 * The source is bundled directly (`esbuild` + a `data:` URL), the same pattern as
 * `nodeStatusConvergence.test.mjs`, so no `dist` build is involved.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { test } from 'node:test';

const here = fileURLToPath(new URL('.', import.meta.url));
const bundle = buildSync({
  stdin: {
    contents: [
      "export { ExecutionContext, NodeStatus } from './ExecutionContext.ts';",
      "export { buildExecutionRecord, loadExecutionRecord, saveExecutionRecord } from './executionStore.ts';",
      "export { readUpstreamTaskRef } from './upstreamTask.ts';",
      "export { UPSTREAM_TASK_DEADLINE_MS, upstreamTaskDeadlineAt } from './upstreamReconcile.ts';",
      "export { EXECUTION_TIMEOUT_MS } from './executionTypes.ts';",
    ].join('\n'),
    resolveDir: here,
    sourcefile: 'upstream-task-runtime.ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const {
  ExecutionContext,
  NodeStatus,
  buildExecutionRecord,
  loadExecutionRecord,
  saveExecutionRecord,
  readUpstreamTaskRef,
  UPSTREAM_TASK_DEADLINE_MS,
  upstreamTaskDeadlineAt,
  EXECUTION_TIMEOUT_MS,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const REF = { taskId: 'task-1382', capability: 'video', submittedAt: 1_800_000_000_000 };

/** A context whose persistence hook writes the record the way the manager does. */
function persistedContext(executionsDir, executionId, workflowId = 'ws_1382') {
  const context = new ExecutionContext({ workflowId, id: executionId });
  const entry = {
    nodes: [{ id: 'n1', type: 'material', data: {} }],
    edges: [],
    maxParallel: 2,
    createdAt: new Date().toISOString(),
  };
  const persist = () => saveExecutionRecord(executionsDir, buildExecutionRecord({
    context: context.toJSON(),
    nodes: entry.nodes,
    edges: entry.edges,
    maxParallel: entry.maxParallel,
    createdAt: entry.createdAt,
    progress: { total: 1, completed: 0, percentage: 0 },
    eventLog: [],
  }));
  context.onPersistRequested = persist;
  return { context, persist };
}

test('#1382 修复前失败：setNodeUpstreamTask 立即落盘到 execution.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-1382-ref-'));
  try {
    const { context, persist } = persistedContext(dir, 'exec_ref');
    context.start(1);
    context.startNode('n1');
    persist();
    assert.equal(loadExecutionRecord(dir, 'exec_ref').nodeStates.n1.upstreamTask, undefined);

    context.setNodeUpstreamTask('n1', REF);

    // No second explicit persist: the hook must have written it already.
    const record = loadExecutionRecord(dir, 'exec_ref');
    assert.deepEqual(record.nodeStates.n1.upstreamTask, REF);
    assert.equal(record.schemaVersion, 1, 'the record schema version stays 1 (additive optional field)');
    assert.deepEqual(context.readNodeUpstreamTask('n1'), REF);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('clearNodeUpstreamTask 立即从记录里移除引用', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-1382-clear-'));
  try {
    const { context, persist } = persistedContext(dir, 'exec_clear');
    context.start(1);
    context.startNode('n1');
    context.setNodeUpstreamTask('n1', REF);
    persist();
    assert.ok(loadExecutionRecord(dir, 'exec_clear').nodeStates.n1.upstreamTask);

    context.clearNodeUpstreamTask('n1');

    assert.equal(loadExecutionRecord(dir, 'exec_clear').nodeStates.n1.upstreamTask, undefined);
    assert.equal(context.readNodeUpstreamTask('n1'), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('旧记录（无 upstreamTask）照常装载，读作「无引用」', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-1382-legacy-'));
  try {
    const executionId = 'exec_legacy';
    mkdirSync(join(dir, executionId), { recursive: true });
    writeFileSync(join(dir, executionId, 'execution.json'), JSON.stringify({
      schemaVersion: 1,
      id: executionId,
      workspaceId: 'ws_legacy',
      status: 'running',
      createdAt: new Date().toISOString(),
      startedAt: Date.now(),
      completedAt: null,
      error: null,
      totalNodes: 1,
      completedNodes: 0,
      variables: {},
      nodeStates: { n1: { status: 'running', startedAt: Date.now(), completedAt: null, error: null } },
      nodeOutputs: {},
      mediaAssets: {},
      breakpoints: [],
      maxParallel: 2,
      nodes: [{ id: 'n1', type: 'material', data: {} }],
      edges: [],
      progress: { total: 1, completed: 0, percentage: 0 },
      eventLog: [],
    }));

    const record = loadExecutionRecord(dir, executionId);
    assert.ok(record, 'a pre-#1382 record must still load');
    assert.equal(record.schemaVersion, 1);
    const context = ExecutionContext.fromJSON({
      id: record.id,
      workflowId: record.workspaceId,
      status: record.status,
      variables: record.variables,
      nodeOutputs: record.nodeOutputs,
      nodeStates: record.nodeStates,
      mediaAssets: record.mediaAssets,
      breakpoints: record.breakpoints,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      error: record.error,
      totalNodes: record.totalNodes,
      completedNodes: record.completedNodes,
    });
    assert.equal(context.readNodeUpstreamTask('n1'), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('持久化的引用按「可用/不可用」校验，坏值等于无引用', () => {
  assert.deepEqual(readUpstreamTaskRef(REF), REF);
  // Whitespace is trimmed, not treated as part of the id.
  assert.equal(readUpstreamTaskRef({ ...REF, taskId: '  t  ' }).taskId, 't');
  for (const bad of [
    undefined,
    null,
    'task',
    { ...REF, taskId: '' },
    { ...REF, taskId: 42 },
    { ...REF, capability: 'audio2' },
    { ...REF, capability: undefined },
    { ...REF, submittedAt: 'yesterday' },
    { ...REF, submittedAt: Number.NaN },
  ]) {
    assert.equal(readUpstreamTaskRef(bad), undefined, JSON.stringify(bad));
  }
  // A malformed value must not reach a reconcile through fromJSON either.
  const context = ExecutionContext.fromJSON({
    id: 'exec_bad', workflowId: 'ws', status: 'running',
    variables: {}, nodeOutputs: {}, mediaAssets: {}, breakpoints: [],
    startedAt: null, completedAt: null, error: null, totalNodes: 1, completedNodes: 0,
    nodeStates: {
      n1: { status: 'running', startedAt: null, completedAt: null, error: null, upstreamTask: { taskId: 'x' } },
      n2: { status: 'running', startedAt: null, completedAt: null, error: null, upstreamTask: REF },
    },
  });
  assert.equal('upstreamTask' in context.nodeStates.get('n1'), false);
  assert.deepEqual(context.nodeStates.get('n2').upstreamTask, REF);
});

test('startNode 保留已恢复的引用（否则调度器会抹掉复核依据）', () => {
  const context = new ExecutionContext({ workflowId: 'ws_start' });
  // Recovery re-pends the node with its reference, then the scheduler starts it.
  context.nodeStates.set('n1', {
    status: NodeStatus.PENDING, startedAt: null, completedAt: null, error: null, upstreamTask: REF,
  });

  context.startNode('n1');

  assert.equal(context.nodeStates.get('n1').status, NodeStatus.RUNNING);
  assert.deepEqual(context.readNodeUpstreamTask('n1'), REF);
});

test('节点终态与快照都不丢字段', () => {
  const context = new ExecutionContext({ workflowId: 'ws_terminal' });
  context.start(1);
  context.startNode('n1');
  context.setNodeUpstreamTask('n1', REF);
  context.completeNode('n1', { text: 'done' });
  // The executor clears on completion; until then the field rides along.
  assert.deepEqual(context.toJSON().nodeStates.n1.upstreamTask, REF);
  context.clearNodeUpstreamTask('n1');
  assert.equal(context.toJSON().nodeStates.n1.upstreamTask, undefined);
});

test('#1382 不变式：复核用的 deadline 严格小于整轮执行超时', () => {
  assert.equal(UPSTREAM_TASK_DEADLINE_MS, 20 * 60 * 1000);
  assert.equal(EXECUTION_TIMEOUT_MS, 30 * 60 * 1000);
  assert.ok(UPSTREAM_TASK_DEADLINE_MS < EXECUTION_TIMEOUT_MS);
  // The deadline is anchored at the persisted submit time, never at "now".
  assert.equal(upstreamTaskDeadlineAt(REF), REF.submittedAt + UPSTREAM_TASK_DEADLINE_MS);
  assert.equal(upstreamTaskDeadlineAt(REF, 1000), REF.submittedAt + 1000);
});
