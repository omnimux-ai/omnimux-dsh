/**
 * plugins/omnimux-workflow/src/workflow/execution/HeadlessExecutionSeam.test.mjs
 *
 * Comprehensive integration and unit tests for Canvas HeadlessExecutionSeam (T05).
 * Tests Fail-Closed invariants, graph resolution, readiness gates,
 * multi-node artifact flattening, and cancellation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import {
  createHeadlessExecutionSeam,
  HeadlessExecutionError,
  TASK_STATUS_BY_EXECUTION_STATUS,
} from './HeadlessExecutionSeam.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

// #1390 端到端用例的源码定位：默认本目录；`OMNIMUX_WORKFLOW_SEAM_SRC_DIR` 只用于
// 把该用例指向另一份源码副本（复现修复前行为），常规测试不设置该变量。
const runtimeBundle = buildSync({
  stdin: {
    contents: [
      "export { createHeadlessExecutionSeam } from './HeadlessExecutionSeam.ts';",
      "export { ExecutionContext } from './ExecutionContext.ts';",
      "export { cleanupExecution, setupExecutionListeners, stopSyncTimer } from './executionTimers.ts';",
      "export { EXECUTION_TIMEOUT_MESSAGE } from './executionTypes.ts';",
      "export { loadExecutionRecord } from './executionStore.ts';",
    ].join('\n'),
    resolveDir: process.env.OMNIMUX_WORKFLOW_SEAM_SRC_DIR || here,
    sourcefile: 'headlessSeamRuntime.ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const runtime = await import(
  `data:text/javascript;base64,${Buffer.from(runtimeBundle.outputFiles[0].text).toString('base64')}`
);

function createMockExecutionManager() {
  const executions = new Map();
  let counter = 1;

  return {
    executions,
    createExecution(opts) {
      const id = `exec_${counter++}`;
      const entry = {
        context: {
          id,
          workflowId: opts.workspaceId,
          status: 'running',
        },
        createdAt: new Date().toISOString(),
        nodes: opts.nodes,
        edges: opts.edges,
      };
      executions.set(id, {
        id,
        workspaceId: opts.workspaceId,
        status: 'running',
        nodes: opts.nodes,
        edges: opts.edges,
        createdAt: entry.createdAt,
        progress: {
          total: opts.nodes.length,
          completed: 0,
          running: 1,
          pending: opts.nodes.length - 1,
          percentage: 0,
        },
        mediaAssets: {},
        nodeOutputs: {},
      });
      return entry;
    },
    async getSnapshot(id) {
      return executions.get(id) || null;
    },
    async cancelExecution(id) {
      const exec = executions.get(id);
      if (!exec) return { ok: false, message: 'not found' };
      exec.status = 'cancelled';
      return { ok: true };
    },
  };
}

describe('T05: Canvas HeadlessExecutionSeam Integration Tests', () => {
  it('T05.1: Fail-Closed: executeHeadless with empty graph rejects and throws empty_graph error', async () => {
    const mockExecutionManager = createMockExecutionManager();
    const seam = createHeadlessExecutionSeam({
      executionManager: mockExecutionManager,
    });

    await assert.rejects(
      async () => {
        await seam.executeHeadless({
          workspaceId: 'ws_test_empty',
          snapshot: { nodes: [], edges: [] },
        });
      },
      (err) => {
        assert.ok(err instanceof HeadlessExecutionError);
        assert.equal(err.code, 'empty_graph');
        assert.match(err.message, /Cannot execute empty workflow graph/);
        return true;
      },
    );
  });

  it('T05.2: Fail-Closed: executeHeadless without workspaceId rejects and throws workspace_required error', async () => {
    const mockExecutionManager = createMockExecutionManager();
    const seam = createHeadlessExecutionSeam({
      executionManager: mockExecutionManager,
    });

    await assert.rejects(
      async () => {
        await seam.executeHeadless({
          workspaceId: '',
          snapshot: {
            nodes: [{ id: 'n1', type: 'text', data: { content: 'hello' } }],
            edges: [],
          },
        });
      },
      (err) => {
        assert.ok(err instanceof HeadlessExecutionError);
        assert.equal(err.code, 'workspace_required');
        return true;
      },
    );
  });

  it('T05.3: Fail-Closed: executeHeadless readiness failure triggers and throws readiness_failure error', async () => {
    const mockExecutionManager = createMockExecutionManager();
    const seam = createHeadlessExecutionSeam({
      executionManager: mockExecutionManager,
      getCatalog: async () => ({
        available: true,
        defaults: { image: 'test-model' },
        models: { 'test-model': { id: 'test-model', name: 'Test Model' } },
      }),
    });

    // Node 2 depends on Node 1, but Node 1 has no text and is unavailable
    const unreadySnapshot = {
      nodes: [
        {
          id: 'upstream_source',
          type: 'material',
          data: {
            label: '提示词来源',
            materialType: 'text',
            status: 'failed', // unready / failed
          },
        },
        {
          id: 'generator_node',
          type: 'material',
          data: {
            label: '生成器',
            materialType: 'image',
            params: {
              model: 'test-model',
            },
          },
        },
      ],
      edges: [
        {
          id: 'edge_1',
          source: 'upstream_source',
          target: 'generator_node',
          data: { feedType: 'text' },
        },
      ],
    };

    await assert.rejects(
      async () => {
        await seam.executeHeadless({
          workspaceId: 'ws_unready',
          snapshot: unreadySnapshot,
        });
      },
      (err) => {
        assert.ok(err instanceof HeadlessExecutionError);
        assert.equal(err.code, 'readiness_failure');
        assert.match(err.message, /readiness check failed/i);
        return true;
      },
    );
  });

  it('T05.4: Success Path: Valid DAG starts real execution and returns descriptor with workspace-segmented URLs', async () => {
    const mockExecutionManager = createMockExecutionManager();
    const seam = createHeadlessExecutionSeam({
      executionManager: mockExecutionManager,
    });

    const validSnapshot = {
      nodes: [
        {
          id: 'prompt_node',
          type: 'text',
          data: {
            content: 'A futuristic skyline in cyberpunk style',
          },
        },
      ],
      edges: [],
    };

    const result = await seam.executeHeadless({
      workspaceId: 'ws_valid_123',
      snapshot: validSnapshot,
      caller: {
        pluginId: 'omnimux-apps',
        appId: 'cyberpunk-app',
      },
    });

    assert.ok(result.executionId, 'Must return valid executionId');
    assert.equal(result.jobId, result.executionId);
    assert.equal(result.workspaceId, 'ws_valid_123');
    assert.equal(result.status, 'RUNNING');
    assert.equal(result.totalNodes, 1);

    // Contract: URLs must include workspaceId segment (not guessed or root-level)
    assert.equal(
      result.streamUrl,
      `/omnimux-workflow/api/workspaces/ws_valid_123/executions/${result.executionId}/events`,
    );
    assert.equal(
      result.pollUrl,
      `/omnimux-workflow/api/workspaces/ws_valid_123/executions/${result.executionId}`,
    );
  });

  it('T05.5: Multi-node multi-artifact unpacking in getJobStatus conforms to Record<string, MediaAsset[]> contract', async () => {
    const mockExecutionManager = createMockExecutionManager();
    const seam = createHeadlessExecutionSeam({
      executionManager: mockExecutionManager,
    });

    const snapshot = {
      nodes: [{ id: 'n1', type: 'text', data: { content: 'test' } }],
      edges: [],
    };

    const job = await seam.executeHeadless({
      workspaceId: 'ws_artifacts_test',
      snapshot,
    });

    // Populate execution record with multi-node multi-artifact array
    const record = mockExecutionManager.executions.get(job.executionId);
    record.status = 'completed';
    record.mediaAssets = {
      node_generator_1: [
        {
          id: 'asset_vid_1',
          type: 'video',
          url: 'https://cdn.omnimux.com/out/video_1.mp4',
          durationSec: 15,
        },
        {
          id: 'asset_vid_2',
          type: 'video',
          url: 'https://cdn.omnimux.com/out/video_2.mp4',
          durationSec: 10,
        },
      ],
      node_generator_2: [
        {
          id: 'asset_img_1',
          type: 'image',
          url: 'https://cdn.omnimux.com/out/poster.png',
        },
      ],
    };

    const status = await seam.getJobStatus(job.executionId);
    assert.ok(status);
    assert.equal(status.status, 'COMPLETED');
    assert.equal(status.rawStatus, 'completed');
    assert.equal(status.artifacts.length, 3, 'Must flatten all 3 assets across all nodes');

    assert.deepEqual(status.artifacts[0], {
      nodeId: 'node_generator_1',
      id: 'asset_vid_1',
      type: 'video',
      url: 'https://cdn.omnimux.com/out/video_1.mp4',
      mimeType: undefined,
      sizeBytes: undefined,
      durationSec: 15,
    });

    assert.deepEqual(status.artifacts[1], {
      nodeId: 'node_generator_1',
      id: 'asset_vid_2',
      type: 'video',
      url: 'https://cdn.omnimux.com/out/video_2.mp4',
      mimeType: undefined,
      sizeBytes: undefined,
      durationSec: 10,
    });

    assert.deepEqual(status.artifacts[2], {
      nodeId: 'node_generator_2',
      id: 'asset_img_1',
      type: 'image',
      url: 'https://cdn.omnimux.com/out/poster.png',
      mimeType: undefined,
      sizeBytes: undefined,
      durationSec: undefined,
    });
  });

  it('T05.6: cancelJob successfully cancels active execution', async () => {
    const mockExecutionManager = createMockExecutionManager();
    const seam = createHeadlessExecutionSeam({
      executionManager: mockExecutionManager,
    });

    const job = await seam.executeHeadless({
      workspaceId: 'ws_cancel_test',
      snapshot: {
        nodes: [{ id: 'n1', type: 'text', data: { content: 'cancel test' } }],
        edges: [],
      },
    });

    const cancelRes = await seam.cancelJob(job.executionId);
    assert.equal(cancelRes.success, true);
    assert.ok(cancelRes.canceledAt);

    const status = await seam.getJobStatus(job.executionId);
    assert.equal(status.status, 'CANCELED');
  });
});

/**
 * #1390: `getJobStatus` must report the engine's terminal states as terminal.
 *
 * Reproduced before the fix by the `error` case below: the mapping had a branch
 * for `'failed'`, which no engine path produces, and none for the engine's real
 * failure terminal `error`, so a failed or timed-out run fell through to the
 * silent default and was reported as `QUEUED` — observed `'QUEUED' !== 'FAILED'`.
 * A caller polling the job could therefore never conclude it should stop waiting
 * for a run that had already failed.
 */
describe('#1390: execution status → TaskStatus mapping', () => {
  /**
   * Start a real execution through the seam, then force the engine status of
   * its record — the seam reads only `ExecutionManager.getSnapshot`, so this
   * exercises the mapping itself rather than the scheduler.
   */
  async function jobWithEngineStatus(engineStatus, extra = {}) {
    const mockExecutionManager = createMockExecutionManager();
    const seam = createHeadlessExecutionSeam({ executionManager: mockExecutionManager });
    const job = await seam.executeHeadless({
      workspaceId: `ws_status_${engineStatus}`,
      snapshot: { nodes: [{ id: 'n1', type: 'text', data: { content: 'status mapping' } }], edges: [] },
    });
    Object.assign(mockExecutionManager.executions.get(job.executionId), { status: engineStatus }, extra);
    return { seam, job };
  }

  // All six engine states (`ExecutionStatus` in ExecutionContext.ts) and the
  // task status each one owes the caller.
  const EXPECTED_TASK_STATUS = {
    pending: 'QUEUED',
    running: 'RUNNING',
    paused: 'RUNNING',
    completed: 'COMPLETED',
    error: 'FAILED',
    cancelled: 'CANCELED',
  };

  for (const [engineStatus, expected] of Object.entries(EXPECTED_TASK_STATUS)) {
    it(`#1390: ${engineStatus} reports ${expected}`, async () => {
      const { seam, job } = await jobWithEngineStatus(engineStatus);
      const status = await seam.getJobStatus(job.executionId);

      assert.ok(status);
      assert.equal(status.status, expected);
      assert.equal(status.rawStatus, engineStatus, 'rawStatus must keep the engine spelling');
    });
  }

  it('#1390 regression: a failed or timed-out run reports FAILED and carries its error text', async () => {
    const { seam, job } = await jobWithEngineStatus('error', { error: '执行超时（超过 30 分钟）' });
    const status = await seam.getJobStatus(job.executionId);

    // Before the fix this read 'QUEUED', i.e. the defect itself.
    assert.equal(status.status, 'FAILED');
    assert.ok(status.error && status.error.length > 0, 'error text must reach the caller');
    assert.equal(status.error, '执行超时（超过 30 分钟）');
  });

  it('#1390: the mapping is total over the engine status set', () => {
    // Mirrors `ExecutionStatus` in ExecutionContext.ts. Totality against the
    // engine is enforced at compile time by the table's
    // `satisfies Record<ExecutionStatusValue, TaskStatus>` (tsc -p
    // tsconfig.host.json fails on a missing or unknown state); this asserts the
    // runtime table did not shrink, and that no producerless 'failed' returns.
    assert.deepEqual(
      Object.keys(TASK_STATUS_BY_EXECUTION_STATUS).sort(),
      ['cancelled', 'completed', 'error', 'paused', 'pending', 'running'],
      'every ExecutionStatus needs an explicit task-level meaning',
    );
  });

  it('#1390: an unknown status (including the producerless "failed") falls back to QUEUED and stays diagnosable', async () => {
    // 'failed' is not an engine state — the failure terminal is 'error' — so it
    // must not be treated as a second spelling of failure.
    const { seam, job } = await jobWithEngineStatus('failed');
    const status = await seam.getJobStatus(job.executionId);

    assert.ok(status);
    assert.equal(status.status, 'QUEUED');
    assert.equal(status.rawStatus, 'failed');
  });
});

/**
 * #1390 招牌症状回归：真实超时路径产生的记录必须经 `getJobStatus()` 报 `FAILED`。
 *
 * 上面那组用例全部由 `jobWithEngineStatus` 构造：先跑一次真实
 * `executeHeadless`，再把状态字符串直接注入记录（`Object.assign(..., { status })`）。
 * 那能钉住映射函数本身，却绕过了**全部真实生产者**——没有任何一条证明引擎真
 * 正写入的失败终态会被报成 FAILED。
 *
 * 本用例只走真实生产者：真实 `cleanupExecution(entries, id, 'timed-out')`
 * （30 分钟 deadline 的清理路径）把执行收敛为 `error` + `EXECUTION_TIMEOUT_MESSAGE`
 * 并落盘，再由接缝经「内存表 → 持久化记录」读取并映射。修复前该记录以默认值
 * 报告 `QUEUED`：调用方永远等不到终态，超时被显示成一个仍在排队的任务。
 *
 * 源码以 esbuild 现场捆绑（与 `nodeStatusConvergence.test.mjs` 同款）：`src/**`
 * 内部用无扩展名导入，源码级直测不能直接 import。
 */
describe('#1390: 超时终态端到端（真实生产者）', () => {
  /**
   * 只实现接缝真实用到的三个方法，读取语序与真实
   * `ExecutionManager.readExecutionSnapshot` 一致：内存表优先，表里没有才回落到
   * 持久化记录——超时清理会先把条目移出内存表并落盘终态记录。
   */
  function createManager(entries, executionsDir) {
    let counter = 1;
    return {
      // 同步返回：接缝不 await 这次调用，返回 Promise 会当场炸在 `entry.context.id`。
      createExecution(opts) {
        return {
          context: {
            id: `exec_timeout_real_${counter++}`,
            workflowId: opts.workspaceId,
            status: 'running',
          },
          createdAt: new Date().toISOString(),
        };
      },
      async getSnapshot(executionId) {
        const entry = entries.get(executionId);
        if (entry) return entry.snapshot;
        return runtime.loadExecutionRecord(executionsDir, executionId) || null;
      },
      async cancelExecution() {
        return { ok: true };
      },
    };
  }

  /**
   * 真实 `ExecutionEntry` 最小夹具：`cleanupExecution` 与 `setupExecutionListeners`
   * 实际会碰到的字段。`context.id` 必须等于接缝给出的 executionId —— 持久化记录以
   * `context.id` 为目录名，两者不一致就读不到（真实引擎里两者恒等）。
   */
  function buildEntry(context, nodes) {
    const abortController = new AbortController();
    return {
      context,
      scheduler: {
        cancel: () => abortController.abort(),
        getProgress: () => ({
          total: nodes.length,
          completed: 0,
          running: 1,
          pending: nodes.length - 1,
          percentage: 0,
        }),
      },
      abortController,
      nodes,
      edges: [],
      maxParallel: 1,
      createdAt: new Date().toISOString(),
      syncTimer: null,
      timeoutTimer: null,
      retentionTimer: null,
      loopRunning: true,
      isRecovered: false,
      eventLog: [],
      disposers: [],
    };
  }

  it('#1390 regression: a real timed-out run reports FAILED with the timeout message through the seam', async () => {
    const executionsDir = mkdtempSync(join(tmpdir(), 'omnimux-seam-timeout-'));
    const entries = new Map();
    let entry = null;
    try {
      const seam = runtime.createHeadlessExecutionSeam({
        executionManager: createManager(entries, executionsDir),
      });

      // 真实接缝入口，取真实 executionId。
      const nodes = [{ id: 'n1', type: 'text', data: { content: 'timeout regression' } }];
      const job = await seam.executeHeadless({
        workspaceId: 'ws_timeout_regression',
        snapshot: { nodes, edges: [] },
      });

      // 真实引擎条目：节点在飞、执行 RUNNING —— 正是 30 分钟 deadline 触发时
      // `cleanupExecution(..., 'timed-out')` 面对的状态。
      const context = new runtime.ExecutionContext({
        workflowId: 'ws_timeout_regression',
        id: job.executionId,
      });
      context.start(nodes.length);
      context.startNode('n1');

      // 内存表必须存条目本身：`cleanupExecution` 直接读 `entry.scheduler` /
      // `entry.context`，包一层 wrapper 会当场炸。快照挂在条目上供读取方使用。
      entry = buildEntry(context, nodes);
      entry.snapshot = null;
      entries.set(job.executionId, entry);

      // 真实生产者一：监听器把终态落到 execution.json。
      runtime.setupExecutionListeners(executionsDir, entry);

      // 真实生产者二：超时清理收敛为 error + 超时文案、abort、移出内存表。
      runtime.cleanupExecution(entries, job.executionId, 'timed-out');

      assert.equal(context.status, 'error');
      assert.equal(context.error, runtime.EXECUTION_TIMEOUT_MESSAGE);
      assert.equal(entries.has(job.executionId), false, '清理后条目必须已离开内存表');

      const record = runtime.loadExecutionRecord(executionsDir, job.executionId);
      assert.ok(record, '超时终态必须已落盘');
      assert.equal(record.status, 'error');
      assert.equal(record.error, runtime.EXECUTION_TIMEOUT_MESSAGE);

      // 招牌症状：修复前这里读 'QUEUED'，调用方永远等不到终态。
      const status = await seam.getJobStatus(job.executionId);
      assert.equal(status.status, 'FAILED');
      assert.equal(status.rawStatus, 'error');
      assert.equal(status.error, runtime.EXECUTION_TIMEOUT_MESSAGE);
    } finally {
      if (entry) runtime.stopSyncTimer(entry);
      rmSync(executionsDir, { recursive: true, force: true });
    }
  });
});
