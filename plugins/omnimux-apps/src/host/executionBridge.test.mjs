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

  it('T05.14: product-link widget picks decode to image URL and properly inject into target mediaUrl slot', () => {
    const manifest = createMockManifest();
    manifest.workflowBinding.snapshot.nodes.push({
      id: 'node-slot-product-image',
      type: 'material',
      data: { isSlot: true, label: '商品主图' },
    });
    manifest.fieldMappings.productLink = {
      nodeId: 'node-slot-product-image',
      targetField: 'mediaUrl',
      mappingType: 'media',
      widget: 'product-link',
      required: false,
    };

    const pickedValue = JSON.stringify({
      name: '智能降噪耳机',
      sub: '数码配件',
      url: 'https://cdn.omnimux.com/products/headphones.jpg',
      preview: 'https://cdn.omnimux.com/products/headphones.jpg',
      source: 'product',
      type: 'image',
    });

    const injected = prepareAndInjectWorkflowSnapshot(manifest, {
      topic: '耳机种草测评',
      productLink: pickedValue,
    });

    const slotNode = injected.nodes.find((n) => n.id === 'node-slot-product-image');
    assert.ok(slotNode);
    // 关键校验：杜绝 JSON 字符串直接赋给 mediaUrl
    assert.equal(slotNode.data.mediaUrl, 'https://cdn.omnimux.com/products/headphones.jpg');
    assert.ok(Array.isArray(slotNode.data.feedAssets) && slotNode.data.feedAssets.length === 1);
    const feedAsset = slotNode.data.feedAssets[0];
    assert.equal(feedAsset.url, 'https://cdn.omnimux.com/products/headphones.jpg');
    assert.equal(feedAsset.type, 'image');

    const virtualSource = injected.nodes.find((n) => n.id === feedAsset.sourceNodeId);
    assert.ok(virtualSource);
    assert.equal(virtualSource.data.mediaUrl, 'https://cdn.omnimux.com/products/headphones.jpg');
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

  it('T05.14: prepareAndInjectWorkflowSnapshot dynamically overrides generator node model via __model__ or model (Issue 2631)', () => {
    const manifest = createMockManifest();
    assert.equal(
      manifest.workflowBinding.snapshot.nodes.find((n) => n.id === 'node_generator').data.params.model,
      'minimax-h3',
      'Original mock model is minimax-h3',
    );

    // 1. 传入 __model__ 覆盖
    const formValues1 = {
      topic: '赛博科技前沿',
      __model__: 'seedance-2.0',
    };
    const injected1 = prepareAndInjectWorkflowSnapshot(manifest, formValues1);
    const genNode1 = injected1.nodes.find((n) => n.id === 'node_generator');
    assert.ok(genNode1);
    assert.equal(genNode1.data.model, 'seedance-2.0', 'data.model 必须被替换为 seedance-2.0');
    assert.equal(genNode1.data.params.model, 'seedance-2.0', 'data.params.model 必须同步被替换为 seedance-2.0');

    // 2. 传入 model 冗余属性覆盖
    const formValues2 = {
      topic: '赛博科技前沿',
      model: 'kling-v1-6',
    };
    const injected2 = prepareAndInjectWorkflowSnapshot(manifest, formValues2);
    const genNode2 = injected2.nodes.find((n) => n.id === 'node_generator');
    assert.ok(genNode2);
    assert.equal(genNode2.data.model, 'kling-v1-6', 'data.model 必须被替换为 kling-v1-6');
    assert.equal(genNode2.data.params.model, 'kling-v1-6', 'data.params.model 必须同步被替换为 kling-v1-6');

    // 3. 原 manifest 严格保持不可变
    assert.equal(
      manifest.workflowBinding.snapshot.nodes.find((n) => n.id === 'node_generator').data.params.model,
      'minimax-h3',
      '原 manifest 中的 snapshot 必须保持不可变',
    );
  });

  it('T05.15: strictly addresses main generator node and initializes missing params object (Issue 2631 review)', () => {
    const manifest = createMockManifest();
    manifest.fieldMappings = {
      topic: {
        nodeId: 'node_text_input',
        field: 'content',
      },
    };
    // 构造复杂图：前置 LLM 提示词节点包含自身的 model 参数，后续视频生成节点最初无 params 对象
    manifest.workflowBinding.snapshot.nodes = [
      {
        id: 'node_text_input',
        type: 'text',
        data: {
          label: '提示词大语言模型',
          tool: 'omnimux_text_chat',
          params: {
            model: 'deepseek-chat',
          },
        },
      },
      {
        id: 'node_video_engine',
        type: 'material',
        data: {
          label: '主视频生成引擎',
          materialType: 'video',
          // 故意不包含 params 对象
        },
      },
    ];

    const injected = prepareAndInjectWorkflowSnapshot(manifest, {
      topic: '科幻未来',
      __model__: 'kling-v2-master',
    });

    const llmNode = injected.nodes.find((n) => n.id === 'node_text_input');
    const videoNode = injected.nodes.find((n) => n.id === 'node_video_engine');

    // 1. LLM 节点的 model 严禁被篡改
    assert.equal(llmNode.data.params.model, 'deepseek-chat', 'LLM 文本节点的模型绝对不能被误改');

    // 2. 视频生成引擎节点正确初始化 params 并写入模型
    assert.ok(videoNode.data.params && typeof videoNode.data.params === 'object');
    assert.equal(videoNode.data.model, 'kling-v2-master');
    assert.equal(videoNode.data.params.model, 'kling-v2-master');
  });

  it('T05.16: logs warning when __model__ is specified but no generator node is found (Fail-Closed observability)', () => {
    const manifest = createMockManifest();
    manifest.fieldMappings = {
      topic: {
        nodeId: 'node_text_input',
        field: 'content',
      },
    };
    // 工作流中没有任何主生成节点（只有文本与插槽节点）
    manifest.workflowBinding.snapshot.nodes = [
      {
        id: 'node_slot_1',
        type: 'input',
        data: { isSlot: true },
      },
      {
        id: 'node_text_input',
        type: 'text',
        data: { content: '普通文本' },
      },
    ];

    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args.join(' '));
    };

    try {
      const injected = prepareAndInjectWorkflowSnapshot(manifest, {
        topic: '测试告警',
        __model__: 'seedance-2.0',
      });
      assert.ok(injected);
      assert.equal(warnings.length, 1);
      assert.ok(warnings[0].includes('未定位到主生成引擎节点'));
    } finally {
      console.warn = origWarn;
    }
  });

  it('T05.17: auto-heals undisclosed hidden parameters (duration, aspectRatio, resolution) against model contract (Issue #2642)', () => {
    const manifest = createMockManifest();
    // 移除表单中对 aspectRatio 的公开映射，仅公开 topic 字段
    // 此时主生成节点的 params.duration, params.aspectRatio, params.resolution 均为未公开的作者固定后台参数
    manifest.fieldMappings = {
      topic: {
        nodeId: 'node_text_input',
        targetPath: 'data.content',
        mappingType: 'text',
        widget: 'textarea',
        required: true,
      },
    };

    const genNode = manifest.workflowBinding.snapshot.nodes.find((n) => n.id === 'node_generator');
    // 作者后台写死未公开参数：时长 10s，比例 21:9，分辨率 4k
    genNode.data.params = {
      model: 'seedance-2.0',
      duration: 10,
      aspectRatio: '21:9',
      resolution: '4k',
    };

    // 1. 切到只支持最大 5s 的定制模型（通过 customCatalog 传入）
    const custom5sCatalog = [
      {
        id: 'fast-video-5s',
        parameters: {
          duration: {
            options: [5],
            max: 5,
            defaultValue: 5,
          },
          aspectRatio: {
            options: ['16:9', '9:16'],
            defaultValue: '16:9',
          },
          resolution: {
            options: ['720p'],
            defaultValue: '720p',
          },
        },
      },
    ];

    const injected = prepareAndInjectWorkflowSnapshot(
      manifest,
      {
        topic: '测试隐藏参数自愈',
        __model__: 'fast-video-5s',
      },
      { modelCatalog: custom5sCatalog },
    );

    const targetNode = injected.nodes.find((n) => n.id === 'node_generator');
    assert.ok(targetNode);
    // 核心断言：未公开时长 10s 在切到只支持 5s 的模型时，节点 params.duration 被安全校准为 5s，彻底避免提交被拒
    assert.equal(targetNode.data.params.duration, 5, '未公开时长 10s 必须被安全校准为 5s');
    // 比例 21:9 不被新模型支持，平滑重置为新模型默认比例 16:9
    assert.equal(targetNode.data.params.aspectRatio, '16:9', '未公开比例必须被安全校准为默认比例');
    // 分辨率 4k 不被新模型支持，平滑重置为新模型默认分辨率 720p
    assert.equal(targetNode.data.params.resolution, '720p', '未公开分辨率必须被安全校准为默认分辨率');

    // 2. 切到已知内置模型 Kling v1.6（支持 5/10s，比例 9:16/16:9/1:1，不支持 21:9）
    const injectedKling = prepareAndInjectWorkflowSnapshot(manifest, {
      topic: '切换到可灵',
      __model__: 'kling-v1-6',
    });
    const targetKlingNode = injectedKling.nodes.find((n) => n.id === 'node_generator');
    assert.equal(targetKlingNode.data.params.duration, 10, 'Kling 支持 10s，故保留 10s');
    assert.equal(targetKlingNode.data.params.aspectRatio, '9:16', 'Kling 不支持 21:9，自动平滑收敛为 Kling 默认 9:16');
    assert.equal(targetKlingNode.data.params.resolution, '1080p', 'Kling 不支持 4k，自动平滑收敛为 Kling 默认 1080p');

    // 3. 原 manifest snapshot 严格保持不可变
    assert.equal(genNode.data.params.duration, 10);
    assert.equal(genNode.data.params.aspectRatio, '21:9');
    assert.equal(genNode.data.params.resolution, '4k');
  });
});
