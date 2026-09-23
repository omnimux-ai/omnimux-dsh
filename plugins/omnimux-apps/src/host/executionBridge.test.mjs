/**
 * plugins/omnimux-apps/src/host/executionBridge.test.mjs
 *
 * Integration and unit tests for OmniMux AI Application Execution Bridge (T05).
 * Validates immutable snapshot cloning, parameter injection (content, params, slots),
 * Fail-Closed validation gates, and end-to-end execution coordination.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareAndInjectWorkflowSnapshot,
  executeAppWorkflow,
  queryExecutionStatus,
  cancelAppExecution,
  ExecutionBridgeError,
} from './executionBridge.ts';

function createMockManifest() {
  return {
    appId: 'viral-video-generator',
    version: '1.0.0',
    schemaVersion: '1.0',
    createdAt: new Date().toISOString(),
    metadata: {
      name: '爆款视频生成器',
      category: 'video',
      iconSvg: '<svg></svg>',
      coverUrl: 'https://cdn.omnimux.com/covers/viral.png',
    },
    workflowBinding: {
      workspaceId: 'ws_viral_01',
      workflowHash: 'hash_abc123',
      snapshot: {
        nodes: [
          {
            id: 'node_text_input',
            type: 'text',
            data: {
              content: '默认原始提示词',
              label: '主题描述',
            },
          },
          {
            id: 'node_generator',
            type: 'material',
            data: {
              label: '视频生成引擎',
              materialType: 'video',
              params: {
                model: 'minimax-h3',
                aspectRatio: '16:9',
              },
            },
          },
        ],
        edges: [
          {
            id: 'edge_text_to_gen',
            source: 'node_text_input',
            target: 'node_generator',
          },
        ],
      },
    },
    formSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          title: '视频主题',
        },
        aspectRatio: {
          type: 'string',
          title: '画面比例',
          enum: ['16:9', '9:16', '1:1'],
        },
        referenceMedia: {
          type: 'string',
          title: '参考素材',
          widget: 'media-uploader',
        },
      },
      required: ['topic'],
      additionalProperties: false,
    },
    fieldMappings: {
      topic: {
        nodeId: 'node_text_input',
        targetPath: 'data.content',
        mappingType: 'text',
        widget: 'textarea',
        required: true,
      },
      aspectRatio: {
        nodeId: 'node_generator',
        targetPath: 'data.params.aspectRatio',
        mappingType: 'param',
        widget: 'ratio-cards',
        required: false,
        defaultValue: '16:9',
      },
      referenceMedia: {
        nodeId: 'node_generator',
        targetPath: 'slot:reference',
        targetSlot: 'reference',
        mappingType: 'slot',
        widget: 'media-uploader',
        required: false,
      },
    },
    showcase: {
      mode: 'carousel',
      items: [
        {
          id: 'demo_1',
          mediaType: 'video',
          mediaUrl: 'https://cdn.omnimux.com/samples/demo1.mp4',
        },
      ],
    },
    demoSnapshot: {
      topic: '赛博朋克风城市宣传片',
      aspectRatio: '16:9',
    },
  };
}

describe('T05: Headless Execution Adapter & Parameter Injection Bridge', () => {
  it('T05.7: prepareAndInjectWorkflowSnapshot clones snapshot immutably and injects content, params, and slot FeedAsset', () => {
    const manifest = createMockManifest();
    const originalSnapshotContent = manifest.workflowBinding.snapshot.nodes[0].data.content;
    const originalNodeCount = manifest.workflowBinding.snapshot.nodes.length;

    const formValues = {
      topic: '超写实森林秋景延时摄影',
      aspectRatio: '9:16',
      referenceMedia: 'https://cdn.omnimux.com/inputs/forest_sample.mp4',
    };

    const injected = prepareAndInjectWorkflowSnapshot(manifest, formValues);

    // 1. Strict Immutability verification
    assert.equal(
      manifest.workflowBinding.snapshot.nodes[0].data.content,
      originalSnapshotContent,
      'Original manifest snapshot must remain completely immutable',
    );
    assert.equal(
      manifest.workflowBinding.snapshot.nodes.length,
      originalNodeCount,
      'Original manifest node count must remain unchanged',
    );

    // 2. data.content injection check
    const textNode = injected.nodes.find((n) => n.id === 'node_text_input');
    assert.ok(textNode);
    assert.equal(textNode.data.content, '超写实森林秋景延时摄影');

    // 3. data.params.<paramKey> injection check
    const genNode = injected.nodes.find((n) => n.id === 'node_generator');
    assert.ok(genNode);
    assert.equal(genNode.data.params.aspectRatio, '9:16');
    assert.equal(genNode.data.params.model, 'minimax-h3');

    // 4. Slot FeedAsset injection check
    assert.ok(genNode.data.feedAssets, 'Must construct feedAssets');
    assert.equal(genNode.data.feedAssets.length, 1);
    const feedAsset = genNode.data.feedAssets[0];
    assert.equal(feedAsset.url, 'https://cdn.omnimux.com/inputs/forest_sample.mp4');
    assert.equal(feedAsset.targetSlot, 'reference');
    assert.equal(feedAsset.type, 'video');

    // Check that virtual source node and edge are created
    const virtualSource = injected.nodes.find((n) => n.id === feedAsset.sourceNodeId);
    assert.ok(virtualSource, 'Virtual source node must be added to DAG');
    assert.equal(virtualSource.data.mediaUrl, 'https://cdn.omnimux.com/inputs/forest_sample.mp4');

    const slotEdge = injected.edges.find((e) => e.id === feedAsset.edgeId);
    assert.ok(slotEdge, 'Slot edge must be added to DAG');
    assert.equal(slotEdge.target, 'node_generator');
  });

  it('T05.11: library-picker picked values are injected as slot FeedAssets with decoded URL and type', () => {
    const manifest = createMockManifest();
    manifest.workflowBinding.snapshot.nodes.push({
      id: 'node-slot-product-image',
      type: 'material',
      data: { isSlot: true, label: '商品图' },
    });
    manifest.fieldMappings.productImage = {
      nodeId: 'node-slot-product-image',
      targetField: 'mediaUrl',
      mappingType: 'media',
      widget: 'library-picker',
      required: false,
    };

    const pickedValue = JSON.stringify({
      name: '极简连帽卫衣',
      sub: 'SKU-1001',
      url: 'https://cdn.omnimux.com/products/prd_1/cover.jpg',
      source: 'product',
      type: 'image',
    });

    const injected = prepareAndInjectWorkflowSnapshot(manifest, {
      topic: '卫衣种草短视频',
      productImage: pickedValue,
    });

    const slotNode = injected.nodes.find((n) => n.id === 'node-slot-product-image');
    assert.ok(slotNode);
    assert.ok(Array.isArray(slotNode.data.feedAssets) && slotNode.data.feedAssets.length === 1,
      'library-picker value must produce a slot FeedAsset');
    const feedAsset = slotNode.data.feedAssets[0];
    // The JSON-encoded picked card must be decoded to its media URL, not injected raw
    assert.equal(feedAsset.url, 'https://cdn.omnimux.com/products/prd_1/cover.jpg');
    assert.equal(feedAsset.type, 'image');
    assert.equal(feedAsset.targetSlot, 'input');

    const virtualSource = injected.nodes.find((n) => n.id === feedAsset.sourceNodeId);
    assert.ok(virtualSource);
    assert.equal(virtualSource.data.mediaUrl, 'https://cdn.omnimux.com/products/prd_1/cover.jpg');

    const slotEdge = injected.edges.find((e) => e.id === feedAsset.edgeId);
    assert.ok(slotEdge);
    assert.equal(slotEdge.target, 'node-slot-product-image');
  });

  it('T05.12: media-extractor library picks (JSON values) decode to their media URL as well', () => {
    const manifest = createMockManifest();
    const pickedValue = JSON.stringify({
      name: '参考视频',
      sub: '灵感库',
      url: '/omnimux/inspiration/media/videos/42.mp4',
      source: 'inspiration',
      type: 'video',
    });

    const injected = prepareAndInjectWorkflowSnapshot(manifest, {
      topic: '开箱视频复刻',
      referenceMedia: pickedValue,
    });

    const genNode = injected.nodes.find((n) => n.id === 'node_generator');
    assert.ok(genNode);
    const feedAsset = genNode.data.feedAssets[0];
    assert.equal(feedAsset.url, '/omnimux/inspiration/media/videos/42.mp4');
    assert.equal(feedAsset.type, 'video');
  });

  it('T05.13: Fail-Closed: malformed picked-card JSON is rejected, never injected as a media URL', () => {
    const manifest = createMockManifest();

    // Truncated / malformed JSON fragment (starts with '{' but does not parse)
    const truncated = '{"name":"参考视频","url":"/omnimux/inspiration/media/videos/42.mp';
    assert.throws(
      () => prepareAndInjectWorkflowSnapshot(manifest, { topic: '开箱视频复刻', referenceMedia: truncated }),
      (err) => {
        assert.ok(err instanceof ExecutionBridgeError);
        assert.equal(err.code, 'validation_failed');
        assert.match(err.message, /malformed library-picked value/);
        return true;
      },
      'Malformed picked JSON must be rejected instead of injected raw',
    );

    // Parses as an object but carries no media URL (shape mismatch)
    const shapeMismatch = JSON.stringify({ name: '无地址卡片', source: 'inspiration' });
    assert.throws(
      () => prepareAndInjectWorkflowSnapshot(manifest, { topic: '开箱视频复刻', referenceMedia: shapeMismatch }),
      (err) => {
        assert.ok(err instanceof ExecutionBridgeError);
        assert.equal(err.code, 'validation_failed');
        return true;
      },
      'Picked cards without a media URL must be rejected',
    );

    // Plain pasted links (not card-shaped) still flow through unchanged
    const injected = prepareAndInjectWorkflowSnapshot(manifest, {
      topic: '开箱视频复刻',
      referenceMedia: 'https://www.tiktok.com/@user/video/123',
    });
    const genNode = injected.nodes.find((n) => n.id === 'node_generator');
    assert.ok(genNode);
    assert.equal(genNode.data.feedAssets[0].url, 'https://www.tiktok.com/@user/video/123');
  });

  it('T05.8: Fail-Closed: executeAppWorkflow rejects when required field is missing', async () => {
    const manifest = createMockManifest();
    // Missing 'topic' which is required
    const invalidFormValues = {
      aspectRatio: '16:9',
    };

    const mockSeam = {
      async executeHeadless() {
        assert.fail('Should never invoke executeHeadless when required field is missing');
      },
    };

    await assert.rejects(
      async () => {
        await executeAppWorkflow({
          manifest,
          formValues: invalidFormValues,
          headlessSeam: mockSeam,
        });
      },
      (err) => {
        assert.ok(err instanceof ExecutionBridgeError);
        assert.equal(err.code, 'required_field_missing');
        assert.match(err.message, /Required form field "topic" is missing/);
        return true;
      },
    );
  });

  it('T05.9: Fail-Closed: executeAppWorkflow rejects when mapping specifies a non-existent nodeId', async () => {
    const manifest = createMockManifest();
    manifest.fieldMappings.topic.nodeId = 'non_existent_node_id';

    const formValues = {
      topic: '测试提示词',
    };

    const mockSeam = {
      async executeHeadless() {
        assert.fail('Should never invoke executeHeadless on invalid mapping');
      },
    };

    await assert.rejects(
      async () => {
        await executeAppWorkflow({
          manifest,
          formValues,
          headlessSeam: mockSeam,
        });
      },
      (err) => {
        assert.ok(err instanceof ExecutionBridgeError);
        assert.equal(err.code, 'node_not_found');
        assert.match(err.message, /not found in workflow snapshot/);
        return true;
      },
    );
  });

  it('T05.10: End-to-End: executeAppWorkflow coordinates launch, returns real executionId, and reconciles status', async () => {
    const manifest = createMockManifest();
    const formValues = {
      topic: '未来太空探索纪录片',
      aspectRatio: '16:9',
    };

    let executedParams = null;

    const mockSeam = {
      async executeHeadless(params) {
        executedParams = params;
        return {
          executionId: 'exec_e2e_456',
          jobId: 'exec_e2e_456',
          workspaceId: params.workspaceId,
          status: 'RUNNING',
          rawStatus: 'running',
          totalNodes: params.snapshot.nodes.length,
          createdAt: new Date().toISOString(),
          streamUrl: `/omnimux-workflow/api/workspaces/${params.workspaceId}/executions/exec_e2e_456/events`,
          eventsUrl: `/omnimux-workflow/api/workspaces/${params.workspaceId}/executions/exec_e2e_456/events`,
          pollUrl: `/omnimux-workflow/api/workspaces/${params.workspaceId}/executions/exec_e2e_456`,
        };
      },
      async getJobStatus(jobId) {
        assert.equal(jobId, 'exec_e2e_456');
        return {
          executionId: jobId,
          jobId,
          status: 'COMPLETED',
          rawStatus: 'completed',
          artifacts: [
            {
              nodeId: 'node_generator',
              id: 'media_asset_e2e_1',
              type: 'video',
              url: 'https://cdn.omnimux.com/output/space_documentary.mp4',
            },
          ],
        };
      },
      async cancelJob(jobId) {
        return { success: true, canceledAt: new Date().toISOString() };
      },
    };

    // 1. Execute
    const result = await executeAppWorkflow({
      manifest,
      formValues,
      headlessSeam: mockSeam,
    });

    assert.ok(result.taskId);
    assert.equal(result.executionId, 'exec_e2e_456');
    assert.equal(result.workspaceId, 'ws_viral_01');
    assert.equal(result.status, 'RUNNING');
    assert.equal(
      result.pollUrl,
      '/omnimux-workflow/api/workspaces/ws_viral_01/executions/exec_e2e_456',
    );

    // Verify injected parameters passed into seam
    assert.ok(executedParams);
    const injectedTextNode = executedParams.snapshot.nodes.find((n) => n.id === 'node_text_input');
    assert.equal(injectedTextNode.data.content, '未来太空探索纪录片');

    // 2. Query status
    const status = await queryExecutionStatus(result.executionId, mockSeam);
    assert.ok(status);
    assert.equal(status.status, 'COMPLETED');
    assert.equal(status.artifacts.length, 1);
    assert.equal(status.artifacts[0].url, 'https://cdn.omnimux.com/output/space_documentary.mp4');

    // 3. Cancel execution
    const cancelRes = await cancelAppExecution(result.executionId, mockSeam);
    assert.equal(cancelRes.success, true);
  });
});
