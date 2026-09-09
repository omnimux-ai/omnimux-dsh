/**
 * plugins/omnimux-workflow/src/workflow/execution/HeadlessExecutionSeam.test.mjs
 *
 * Comprehensive integration and unit tests for Canvas HeadlessExecutionSeam (T05).
 * Tests Fail-Closed invariants, graph resolution, readiness gates,
 * multi-node artifact flattening, and cancellation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHeadlessExecutionSeam,
  HeadlessExecutionError,
} from './HeadlessExecutionSeam.ts';

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
