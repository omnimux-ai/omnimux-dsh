/**
 * Issue #1379 回归（前端）：execution_cancelled / execution_error 到达时必须收敛
 * 仍在飞的节点。
 *
 * 缺陷原状：`node_start` 把 `node.data.executionStatus` 写成 `running`（单节点
 * 模式先写 `pending`），终态事件不带 per-node 事件，取消 / 失败时无人清除 →
 * GSC 恒显「生成中…」，且该瞬时态随画布文档自动保存，重载后依旧存在。
 *
 * 直接 exercisable 的模块级事件分发（`dispatchExecutionEvent`），不经 dist。
 * 另含岛屿重载守卫（`shouldConvergeInFlightOnReload`）的回归：只有 idle 且无
 * 「启动在飞」窗口时才允许收敛，否则画布上的 pending 节点会被瞬时误写成
 * skipped。
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { test } from 'node:test';

const here = fileURLToPath(new URL('.', import.meta.url));
const bundle = join(mkdtempSync(join(tmpdir(), 'omnimux-execution-terminal-')), 'runtime.mjs');
buildSync({
  stdin: {
    contents: [
      "export { dispatchExecutionEvent, settleInFlightNodes, shouldConvergeInFlightOnReload } from './useExecutionController.ts';",
      "export { useCanvasStore } from '../store/canvasStore.ts';",
      "export { useExecutionStore } from '../store/executionStore.ts';",
      "export { mapNodeToGenerationStatus } from '../editor/utils/nodeVisualMath.ts';",
    ].join('\n'),
    resolveDir: here,
    sourcefile: 'runtime.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
});
const {
  dispatchExecutionEvent,
  settleInFlightNodes,
  shouldConvergeInFlightOnReload,
  useCanvasStore,
  useExecutionStore,
  mapNodeToGenerationStatus,
} = await import(pathToFileURL(bundle).href);

/** 画布上放若干「执行中」节点，等价于 node_start 之后的节点数据。 */
function arrangeCanvas(nodeIds, executionStatus = 'running') {
  useExecutionStore.getState().resetExecution();
  useCanvasStore.setState({
    nodes: nodeIds.map((id) => ({
      id,
      type: 'material',
      position: { x: 0, y: 0 },
      data: { executionStatus },
    })),
    edges: [],
  });
  for (const id of nodeIds) useExecutionStore.getState().setNodeStatus(id, executionStatus);
}

function nodeData(nodeId) {
  const node = useCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId);
  assert.ok(node, `节点 ${nodeId} 应存在`);
  return node.data;
}

test('取消终态：execution_cancelled 收敛在飞节点，GSC 不再停留在 generating', () => {
  arrangeCanvas(['n1', 'n2']);
  useExecutionStore.getState().setExecution({ status: 'running', executionId: 'exec_1' });

  // 缺陷态：executionStatus='running' 就是「生成中…」的来源。
  assert.equal(mapNodeToGenerationStatus('running', undefined, false), 'generating');

  let closed = 0;
  dispatchExecutionEvent(
    'execution_cancelled',
    JSON.stringify({ executionId: 'exec_1', cancelledAt: Date.now() }),
    () => { closed += 1; },
  );

  const exec = useExecutionStore.getState();
  assert.equal(exec.status, 'cancelled');
  assert.equal(exec.progress.running, 0);
  assert.equal(closed, 1);
  assert.equal(exec.nodeStatuses.n1, 'skipped');
  assert.equal(exec.nodeStatuses.n2, 'skipped');
  for (const nodeId of ['n1', 'n2']) {
    const data = nodeData(nodeId);
    assert.equal(data.executionStatus, 'skipped', `${nodeId} 不应残留在飞态`);
    assert.notEqual(
      mapNodeToGenerationStatus(data.executionStatus, undefined, false),
      'generating',
      `${nodeId} 不应继续显示「生成中…」`,
    );
  }
});

test('失败终态：execution_error 收敛在飞节点为 error 并带上错误信息', () => {
  arrangeCanvas(['n1', 'n2'], 'running');
  useExecutionStore.getState().setExecution({ status: 'running', executionId: 'exec_2' });

  dispatchExecutionEvent(
    'execution_error',
    JSON.stringify({
      executionId: 'exec_2',
      workflowId: 'ws_1',
      error: '节点执行中断，执行不完整',
      failedNode: 'n1',
      duration: 1200,
    }),
    () => {},
  );

  const exec = useExecutionStore.getState();
  assert.equal(exec.status, 'error');
  assert.equal(exec.error, '节点执行中断，执行不完整');
  assert.equal(exec.progress.running, 0);
  for (const nodeId of ['n1', 'n2']) {
    const data = nodeData(nodeId);
    assert.equal(data.executionStatus, 'error');
    assert.equal(data.executionError, '节点执行中断，执行不完整');
    assert.notEqual(mapNodeToGenerationStatus(data.executionStatus, undefined, false), 'generating');
  }
});

test('单节点模式：pending 标记同样随终态收敛', () => {
  arrangeCanvas(['n3'], 'pending');

  dispatchExecutionEvent(
    'execution_cancelled',
    JSON.stringify({ executionId: 'exec_3', cancelledAt: Date.now() }),
    () => {},
  );

  assert.equal(nodeData('n3').executionStatus, 'skipped');
});

test('#1386 完成终态：execution_complete 同样收敛在飞节点（三个终态分支对称）', () => {
  // Before the fix only error / cancelled converged, so a node whose
  // `node_complete` was lost stayed 「生成中…」 on a run that had already
  // finished — the same permanent marker #1379 removed for the other two.
  arrangeCanvas(['n6'], 'running');
  useExecutionStore.getState().setExecution({ status: 'running', executionId: 'exec_6' });

  let closed = 0;
  dispatchExecutionEvent(
    'execution_complete',
    JSON.stringify({ executionId: 'exec_6', completedAt: Date.now() }),
    () => { closed += 1; },
  );

  const exec = useExecutionStore.getState();
  assert.equal(exec.status, 'completed');
  assert.equal(closed, 1);
  assert.equal(exec.nodeStatuses.n6, 'completed');
  assert.equal(nodeData('n6').executionStatus, 'completed');
  assert.notEqual(
    mapNodeToGenerationStatus(nodeData('n6').executionStatus, undefined, false),
    'generating',
    'n6 不应继续显示「生成中…」',
  );
});

test('#1386 完成终态：已完成节点不被改写（收敛只碰在飞态）', () => {
  arrangeCanvas(['n7'], 'completed');
  useExecutionStore.getState().setExecution({ status: 'running', executionId: 'exec_7' });

  dispatchExecutionEvent(
    'execution_complete',
    JSON.stringify({ executionId: 'exec_7', completedAt: Date.now() }),
    () => {},
  );

  assert.equal(nodeData('n7').executionStatus, 'completed');
});

test('重载：无存活执行时收敛画布文档里残留的在飞态', () => {
  arrangeCanvas(['n4'], 'running');

  const settled = settleInFlightNodes('skipped');

  assert.deepEqual(settled, ['n4']);
  assert.equal(nodeData('n4').executionStatus, 'skipped');
  assert.equal(
    mapNodeToGenerationStatus(nodeData('n4').executionStatus, undefined, false),
    null,
  );
});

test('无在飞节点时收敛是空操作（不误伤已完成节点）', () => {
  arrangeCanvas(['n5'], 'completed');

  const settled = settleInFlightNodes('skipped');

  assert.deepEqual(settled, []);
  assert.equal(nodeData('n5').executionStatus, 'completed');
});

/**
 * 等价于 hook 里 `workspaceId` effect 的「无存活执行」分支：`listExecutions`
 * 未返回存活执行时才会走到这里，守卫通过才收敛。
 */
function runIslandReloadBranch(startInFlight) {
  if (shouldConvergeInFlightOnReload(startInFlight)) settleInFlightNodes('skipped');
}

test('重载守卫：idle 且无存活执行时收敛画布文档里残留的在飞态', () => {
  arrangeCanvas(['g1', 'g2'], 'running');
  useExecutionStore.getState().setExecution({ status: 'idle' });

  runIslandReloadBranch(false);

  for (const nodeId of ['g1', 'g2']) {
    assert.equal(nodeData(nodeId).executionStatus, 'skipped');
    assert.equal(
      mapNodeToGenerationStatus(nodeData(nodeId).executionStatus, undefined, false),
      null,
      `${nodeId} 不应继续显示「生成中…」`,
    );
  }
});

test('重载守卫：执行待启动（pending）时不收敛，交给 SSE / snapshot', () => {
  arrangeCanvas(['g3'], 'running');
  useExecutionStore.getState().setExecution({ status: 'pending', executionId: 'exec_pending' });

  assert.equal(shouldConvergeInFlightOnReload(false), false);
  runIslandReloadBranch(false);

  assert.equal(nodeData('g3').executionStatus, 'running');
  assert.equal(mapNodeToGenerationStatus(nodeData('g3').executionStatus, undefined, false), 'generating');
});

test('重载守卫：执行运行中（running）时不收敛', () => {
  arrangeCanvas(['g4'], 'running');
  useExecutionStore.getState().setExecution({ status: 'running', executionId: 'exec_running' });

  assert.equal(shouldConvergeInFlightOnReload(false), false);
  runIslandReloadBranch(false);

  assert.equal(nodeData('g4').executionStatus, 'running');
  assert.equal(mapNodeToGenerationStatus(nodeData('g4').executionStatus, undefined, false), 'generating');
});

test('重载守卫：启动在飞窗口（createExecution 未返回、store 仍为 idle）不收敛', () => {
  // startExecution 已置 startingRef，但 status 要等 POST 返回才写成 'pending'：
  // 这一窗口若被当作「无存活执行」，画布上的 pending 节点会被瞬时误写成 skipped。
  arrangeCanvas(['g5'], 'pending');
  useExecutionStore.getState().setExecution({ status: 'idle' });

  assert.equal(shouldConvergeInFlightOnReload(true), false);
  runIslandReloadBranch(true);

  assert.equal(nodeData('g5').executionStatus, 'pending', '启动在飞窗口内不应被误写成 skipped');
});
