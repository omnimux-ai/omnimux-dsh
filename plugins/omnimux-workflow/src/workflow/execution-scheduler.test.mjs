/**
 * M3 execution engine unit tests (scheduler semantics ported from Gxgen).
 *
 * Covers: topological layering, maxParallel throttling, pause/resume,
 * cancel, abort/skip failure strategies, fromPersistedState recovery,
 * subgraph resolution (full/subset), and the gateway-backed material
 * executor (mock success + failure paths).
 *
 * Runs against the built dist/index.js (npm run build first).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const host = await import('../../dist/index.js');
const {
  ExecutionContext,
  ExecutionScheduler,
  resolveExecutionSubgraph,
  toExecutionMode,
  normalizeNodeIds,
  createExecutionManager,
  createMockGateway,
} = host;

// ============================================================================
// Helpers
// ============================================================================

const linearNodes = ['a', 'b', 'c'].map((id) => ({
  id,
  type: 'material',
  data: { label: id },
}));
const linearEdges = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
];

/** Executor with manually-controlled per-node gates. */
function makeDeferredExecutor() {
  const gates = new Map();
  const started = [];
  return {
    started,
    executor: async (node) => {
      started.push(node.id);
      await new Promise((resolve) => gates.set(node.id, resolve));
      return { text: `out:${node.id}` };
    },
    resolveNode: (id) => {
      gates.get(id)?.();
      gates.delete(id);
    },
  };
}

const waitUntil = async (predicate, { timeoutMs = 3000, intervalMs = 10 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return predicate();
};

function makeManager() {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-exec-test-'));
  const mediaDir = join(dir, 'media');
  mkdirSync(mediaDir, { recursive: true });
  const manager = createExecutionManager({
    executionsDir: join(dir, 'executions'),
    gateway: createMockGateway({ minLatencyMs: 10, maxLatencyMs: 30 }),
    mediaDir,
  });
  return { dir, manager };
}

// ============================================================================
// Topology
// ============================================================================

test('getTopologicalGroups layers linear and diamond DAGs correctly', () => {
  const context = new ExecutionContext({ workflowId: 'ws_test' });
  const scheduler = new ExecutionScheduler({
    nodes: linearNodes,
    edges: linearEdges,
    context,
    nodeExecutor: async () => ({}),
  });
  assert.deepEqual(scheduler.getTopologicalGroups(), [['a'], ['b'], ['c']]);

  // Diamond: a -> b, a -> c, b -> d, c -> d
  const diamondNodes = ['a', 'b', 'c', 'd'].map((id) => ({ id, type: 'material', data: {} }));
  const diamondEdges = [
    { source: 'a', target: 'b' },
    { source: 'a', target: 'c' },
    { source: 'b', target: 'd' },
    { source: 'c', target: 'd' },
  ];
  const scheduler2 = new ExecutionScheduler({
    nodes: diamondNodes,
    edges: diamondEdges,
    context: new ExecutionContext({ workflowId: 'ws_test' }),
    nodeExecutor: async () => ({}),
  });
  assert.deepEqual(scheduler2.getTopologicalGroups(), [['a'], ['b', 'c'], ['d']]);
});

test('maxParallel throttles concurrent node executions', async () => {
  const nodes = ['n1', 'n2', 'n3', 'n4', 'n5'].map((id) => ({ id, type: 'material', data: {} }));
  let inFlight = 0;
  let maxInFlight = 0;
  const context = new ExecutionContext({ workflowId: 'ws_test' });
  const scheduler = new ExecutionScheduler({
    nodes,
    edges: [],
    context,
    maxParallel: 2,
    nodeExecutor: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 25));
      inFlight -= 1;
      return {};
    },
  });
  await scheduler.execute();
  assert.equal(context.status, 'completed');
  assert.ok(maxInFlight <= 2, `concurrency exceeded (max ${maxInFlight})`);
  assert.ok(maxInFlight === 2, `expected saturation at 2 (got ${maxInFlight})`);
});

// ============================================================================
// Pause / resume / cancel
// ============================================================================

test('pause suspends the loop and resume completes the run', async () => {
  const gate = makeDeferredExecutor();
  const events = [];
  const context = new ExecutionContext({ workflowId: 'ws_test' });
  const scheduler = new ExecutionScheduler({
    nodes: linearNodes,
    edges: linearEdges,
    context,
    nodeExecutor: gate.executor,
  });
  for (const name of ['execution_paused', 'execution_resumed', 'execution_complete']) {
    context.events.on(name, (payload) => events.push({ name, payload }));
  }

  const running = scheduler.execute();
  await waitUntil(() => gate.started.includes('a'));
  scheduler.pause();
  assert.equal(context.status, 'paused');
  gate.resolveNode('a');

  // Node b never starts while paused.
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(gate.started, ['a']);

  scheduler.resume();
  assert.equal(context.status, 'running');
  await waitUntil(() => gate.started.includes('b'));
  gate.resolveNode('b');
  await waitUntil(() => gate.started.includes('c'));
  gate.resolveNode('c');
  await running;

  assert.equal(context.status, 'completed');
  const names = events.map((event) => event.name);
  assert.deepEqual(names, ['execution_paused', 'execution_resumed', 'execution_complete']);
});

test('cancel stops the run with cancelled status', async () => {
  const gate = makeDeferredExecutor();
  const context = new ExecutionContext({ workflowId: 'ws_test' });
  const scheduler = new ExecutionScheduler({
    nodes: linearNodes,
    edges: linearEdges,
    context,
    nodeExecutor: gate.executor,
  });
  const running = scheduler.execute();
  await waitUntil(() => gate.started.includes('a'));
  scheduler.cancel();
  gate.resolveNode('a');
  await running;
  assert.equal(context.status, 'cancelled');
  assert.deepEqual(gate.started, ['a'], 'downstream nodes must not start after cancel');
});

test('#1386 竞态：executor 在 abort 前已 resolve，取消后不得把它写成 completed', async () => {
  // Two writers on one node: `cancel()` converges the in-flight node to
  // `skipped` (the state the persisted record is built from), while the success
  // path called `completeNode` whenever the executor resolved — the catch branch
  // checked `isCancelled`, this one did not. Resolving the gate with no await in
  // between is the window where that happens: the executor's promise is already
  // settled when the abort lands, so the loop's cancel check never runs first.
  const gate = makeDeferredExecutor();
  const context = new ExecutionContext({ workflowId: 'ws_cancel_race' });
  const scheduler = new ExecutionScheduler({
    nodes: linearNodes,
    edges: linearEdges,
    context,
    nodeExecutor: gate.executor,
  });

  const running = scheduler.execute();
  await waitUntil(() => gate.started.includes('a'));

  scheduler.cancel();
  gate.resolveNode('a');
  await running;

  assert.equal(context.status, 'cancelled');
  assert.equal(
    context.nodeStates.get('a').status,
    'skipped',
    'a 应保持取消收敛的 skipped，而不是被成功路径改写成 completed',
  );
  assert.equal(
    Object.values(context.toJSON().nodeStates).some((state) => state.status === 'completed'),
    false,
    '取消的执行不能留下 completed 节点（磁盘 cancelled/skipped 与内存 completed 会分叉）',
  );
  assert.deepEqual(gate.started, ['a'], 'downstream nodes must not start after cancel');
});

// ============================================================================
// Failure strategies
// ============================================================================

test('node failure with abort strategy fails the execution', async () => {
  const started = [];
  const context = new ExecutionContext({ workflowId: 'ws_test' });
  const scheduler = new ExecutionScheduler({
    nodes: linearNodes,
    edges: linearEdges,
    context,
    nodeExecutor: async (node) => {
      started.push(node.id);
      if (node.id === 'b') throw new Error('boom');
      return {};
    },
  });
  await scheduler.execute();
  assert.equal(context.status, 'error');
  assert.equal(context.error, 'boom');
  assert.deepEqual(started, ['a', 'b'], 'downstream node c must not run after abort');
});

test('node failure with skip strategy continues the run', async () => {
  const started = [];
  const nodes = linearNodes.map((node) =>
    node.id === 'b' ? { ...node, data: { ...node.data, failStrategy: 'skip' } } : node,
  );
  const context = new ExecutionContext({ workflowId: 'ws_test' });
  const scheduler = new ExecutionScheduler({
    nodes,
    edges: linearEdges,
    context,
    nodeExecutor: async (node) => {
      started.push(node.id);
      if (node.id === 'b') throw new Error('boom');
      return {};
    },
  });
  await scheduler.execute();
  assert.equal(context.status, 'completed');
  assert.deepEqual(started, ['a', 'b', 'c']);
  assert.equal(context.nodeStates.get('b').status, 'error');
});

// ============================================================================
// fromPersistedState recovery
// ============================================================================

test('fromPersistedState resumes without re-running completed nodes', async () => {
  // Phase 1: run a -> b, pause before c.
  const gate1 = makeDeferredExecutor();
  const context1 = new ExecutionContext({ workflowId: 'ws_test' });
  const scheduler1 = new ExecutionScheduler({
    nodes: linearNodes,
    edges: linearEdges,
    context: context1,
    nodeExecutor: gate1.executor,
  });
  const phase1 = scheduler1.execute();
  assert.ok(await waitUntil(() => gate1.started.includes('a')));
  gate1.resolveNode('a');
  assert.ok(await waitUntil(() => gate1.started.includes('b')));
  scheduler1.pause();
  gate1.resolveNode('b');
  // Wait until b lands in completedNodes, then tear the phase-1 run down
  // (cancel releases the suspended loop without running c).
  assert.ok(await waitUntil(() => scheduler1.getDagState().completedNodes.includes('b')));
  scheduler1.cancel();
  await phase1;

  const dagState = scheduler1.getDagState();
  assert.deepEqual([...dagState.completedNodes].sort(), ['a', 'b']);
  assert.deepEqual(dagState.pendingNodes, ['c']);

  // Phase 2: rebuild context + scheduler from persisted state, continue.
  const gate2 = makeDeferredExecutor();
  const context2 = new ExecutionContext({ workflowId: 'ws_test' });
  const scheduler2 = ExecutionScheduler.fromPersistedState({
    dagState,
    nodes: linearNodes,
    edges: linearEdges,
    context: context2,
    nodeExecutor: gate2.executor,
  });
  assert.equal(scheduler2.isPaused === false, true, 'fresh context is not paused');
  const phase2 = scheduler2.execute({ isRecovery: true });
  await waitUntil(() => gate2.started.includes('c'));
  gate2.resolveNode('c');
  await phase2;

  assert.equal(context2.status, 'completed');
  assert.deepEqual(gate2.started, ['c'], 'completed nodes must not re-run');
});

test('fromPersistedState re-pends nodes that were in-flight at the crash', async () => {
  const gate = makeDeferredExecutor();
  const context = new ExecutionContext({ workflowId: 'ws_test' });
  const scheduler = ExecutionScheduler.fromPersistedState({
    dagState: { pendingNodes: ['c'], completedNodes: ['a'], runningNodes: ['b'] },
    nodes: linearNodes,
    edges: linearEdges,
    context,
    nodeExecutor: gate.executor,
  });
  const progress = scheduler.getProgress();
  assert.equal(progress.pending, 2, 'in-flight b re-pended alongside c');
  assert.equal(progress.completed, 1);

  const running = scheduler.execute({ isRecovery: true });
  await waitUntil(() => gate.started.includes('b'));
  gate.resolveNode('b');
  await waitUntil(() => gate.started.includes('c'));
  gate.resolveNode('c');
  await running;
  assert.equal(context.status, 'completed');
});

// ============================================================================
// Subgraph (full / subset / single)
// ============================================================================

test('resolveExecutionSubgraph handles full, subset, and single modes', () => {
  const nodes = linearNodes.map((node) => ({ ...node }));
  const edges = linearEdges.map((edge) => ({ ...edge }));

  const full = resolveExecutionSubgraph({
    nodes,
    edges,
    executionMode: toExecutionMode(undefined),
    nodeIds: [],
  });
  assert.equal(full.nodes.length, 3);

  const subset = resolveExecutionSubgraph({
    nodes,
    edges,
    executionMode: 'subset',
    nodeIds: ['c'],
  });
  assert.deepEqual(
    [...subset.nodeIdSet].sort(),
    ['a', 'b', 'c'],
    'subset includes the transitive upstream closure',
  );

  const head = resolveExecutionSubgraph({
    nodes,
    edges,
    executionMode: 'subset',
    nodeIds: ['b'],
  });
  assert.deepEqual([...head.nodeIdSet].sort(), ['a', 'b']);

  // Single mode: only the specified node, but keeps incoming edges from upstream
  const singleC = resolveExecutionSubgraph({
    nodes,
    edges,
    executionMode: 'single',
    nodeIds: ['c'],
  });
  assert.deepEqual([...singleC.nodeIdSet], ['c'], 'single contains only target node c');
  assert.equal(singleC.nodes.length, 1);
  assert.equal(singleC.nodes[0].id, 'c');
  assert.equal(singleC.edges.length, 1, 'single retains incoming edge b -> c for upstream wiring');
  assert.equal(singleC.edges[0].source, 'b');
  assert.equal(singleC.edges[0].target, 'c');

  assert.throws(
    () => resolveExecutionSubgraph({ nodes, edges, executionMode: 'subset', nodeIds: [] }),
    /subset/,
  );
  assert.throws(
    () => resolveExecutionSubgraph({ nodes, edges, executionMode: 'single', nodeIds: [] }),
    /single/,
  );
  assert.throws(
    () => resolveExecutionSubgraph({ nodes, edges, executionMode: 'single', nodeIds: ['zz'] }),
    /无效节点/,
  );
  assert.deepEqual(normalizeNodeIds(['a', ' a ', 42, '']), ['a']);
  assert.equal(toExecutionMode('single'), 'single');
  assert.throws(() => toExecutionMode('invalid'), /mode 必须是 full、subset 或 single/);

  // Group container exclusion in execution subgraph
  const nodesWithGroup = [
    { id: 'grp1', type: 'group', data: { title: 'Group 1' } },
    { id: 'n1', type: 'material', data: {} },
    { id: 'n2', type: 'material', data: {} },
  ];
  const edgesWithGroup = [{ source: 'n1', target: 'n2' }];
  const fullWithGroup = resolveExecutionSubgraph({
    nodes: nodesWithGroup,
    edges: edgesWithGroup,
    executionMode: 'full',
    nodeIds: [],
  });
  assert.equal(fullWithGroup.nodes.some((n) => n.type === 'group'), false, 'full 模式自动过滤 group 容器');
  assert.equal(fullWithGroup.nodes.length, 2);
});

// ============================================================================
// Material executor via the mock gateway (manager-level)
// ============================================================================

test('material nodes run through the mock gateway (success + media URL)', async () => {
  const { dir, manager } = makeManager();
  try {
    const entry = manager.createExecution({
      workspaceId: 'ws_gateway',
      nodes: [
        {
          id: 't1',
          type: 'material',
          data: { materialType: 'text', selectedTool: 'text-to-text', prompt: '写一句话' },
        },
        {
          id: 'i1',
          type: 'material',
          data: { materialType: 'image', selectedTool: 'text-to-image', prompt: '一张图' },
        },
      ],
      edges: [],
      maxParallel: 2,
    });
    const done = await waitUntil(
      () => manager.getSnapshot(entry.context.id)?.status === 'completed',
    );
    assert.ok(done, 'execution should complete');
    const snapshot = manager.getSnapshot(entry.context.id);

    const textOutput = snapshot.nodeOutputs.t1;
    assert.match(String(textOutput?.text ?? ''), /mock 生成结果/);
    assert.equal(textOutput?.simulated, true);

    const imageOutput = snapshot.nodeOutputs.i1;
    const url = imageOutput?.mediaAssets?.[0]?.url ?? '';
    assert.match(url, /^\/omnimux-workflow\/media\/executions\/[^/]+\/i1\.png$/);
    assert.equal(imageOutput?.simulated, true);
    assert.equal(snapshot.mediaAssets.i1?.length, 1);
  } finally {
    manager.disposeAll();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an in-flight execution retains its submitted graph and upstream output after caller edits', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-input-snapshot-'));
  const sent = [];
  let releaseGate;
  const gate = new Promise((resolve) => { releaseGate = resolve; });
  const gateway = createMockGateway({ minLatencyMs: 1, maxLatencyMs: 1 });
  const submit = gateway.submit.bind(gateway);
  gateway.submit = async (request) => {
    sent.push(request);
    if (request.prompt === 'gate instruction') await gate;
    return submit(request);
  };
  const manager = createExecutionManager({ executionsDir: join(dir, 'executions'), mediaDir: join(dir, 'media'), gateway });
  try {
    const nodes = [
      { id: 'gate', type: 'material', data: { materialType: 'text', prompt: 'gate instruction' } },
      { id: 'target', type: 'material', data: { materialType: 'text', prompt: '', params: { model: 'mock-text-flash' } } },
    ];
    const edges = [{ source: 'source', target: 'target' }, { source: 'gate', target: 'target' }];
    const initialOutputs = { source: { text: 'submitted text' } };
    const entry = manager.createExecution({ workspaceId: 'ws_snapshot', nodes, edges, initialOutputs });
    assert.ok(await waitUntil(() => sent.length === 1));
    nodes[1].data.prompt = 'new instruction';
    nodes[1].data.params.model = 'new model';
    edges[0].source = 'other';
    initialOutputs.source.text = 'new text';
    releaseGate();
    assert.ok(await waitUntil(() => manager.getSnapshot(entry.context.id)?.status === 'completed'));
    assert.equal(sent.length, 2);
    assert.match(sent[1].prompt, /submitted text/);
    assert.doesNotMatch(sent[1].prompt, /new instruction|new text/);
    assert.equal(sent[1].model, 'mock-text-flash');
  } finally {
    releaseGate();
    manager.disposeAll();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mockFail node fails the execution with node_error', async () => {
  const { dir, manager } = makeManager();
  try {
    const entry = manager.createExecution({
      workspaceId: 'ws_gateway_fail',
      nodes: [
        {
          id: 'bad',
          type: 'material',
          data: {
            materialType: 'image',
            selectedTool: 'text-to-image',
            prompt: 'x',
            mockFail: true,
          },
        },
      ],
      edges: [],
    });
    const settled = await waitUntil(() => {
      const status = manager.getSnapshot(entry.context.id)?.status;
      return status === 'error' || status === 'completed';
    });
    assert.ok(settled, 'execution should settle');
    const snapshot = manager.getSnapshot(entry.context.id);
    assert.equal(snapshot.status, 'error');
    assert.match(snapshot.error, /mockFail/);
    assert.equal(snapshot.nodeStates.bad.status, 'error');
  } finally {
    manager.disposeAll();
    rmSync(dir, { recursive: true, force: true });
  }
});
