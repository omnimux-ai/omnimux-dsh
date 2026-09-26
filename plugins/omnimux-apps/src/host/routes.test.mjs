/**
 * plugins/omnimux-apps/src/host/routes.test.mjs
 *
 * Tests for omnimux-apps routes & preset workflow snapshot auto-hydration.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAppsRoutes } from './routes.ts';
import { prepareAndInjectWorkflowSnapshot } from './executionBridge.ts';

describe('omnimux-apps Routes & Preset Snapshot Hydration', () => {
  test('R01: 预设应用缺少内联 snapshot 时能够自动从 catalog/presets 补齐并成功注入参数', () => {
    const manifest = {
      schemaVersion: '1.0.0',
      appId: 'app-creatify-app-demo',
      version: '1.0.0',
      workflowBinding: {
        workspaceId: 'ws-app-creatify-app-demo',
        workflowVersion: 1,
      },
      metadata: {
        name: '手机与网页交互实机演示',
        category: 'video',
      },
      fieldMappings: {
        product_image: {
          nodeId: 'node-slot-product-image',
          targetField: 'mediaUrl',
          mappingType: 'media',
          required: true,
        },
        copywriting: {
          nodeId: 'node-slot-copywriting',
          targetField: 'prompt',
          mappingType: 'prompt',
          required: true,
        },
      },
    };

    const formValues = {
      product_image: 'https://example.com/my-test-product.png',
      copywriting: '我的测试商品卖点文案',
    };

    const injected = prepareAndInjectWorkflowSnapshot(manifest, formValues);
    assert.ok(injected, '注入快照必须成功返回');
    assert.ok(Array.isArray(injected.nodes) && injected.nodes.length >= 3, '必须包含预设节点');

    const voiceNode = injected.nodes.find((n) => n.id === 'node-slot-voice-tts');
    assert.equal(voiceNode, undefined, '未连线的孤立声音槽节点必须被彻底剔除');

    const textNode = injected.nodes.find((n) => n.id === 'node-slot-copywriting');
    assert.ok(textNode, '必须包含文案槽节点');
    assert.equal(textNode.data.prompt, '我的测试商品卖点文案', '文案必须成功注入');
  });

  test('R02: POST /omnimux-apps/api/apps/:appId/executions 路由能够正确校验并调度 executeApp', async () => {
    let executed = false;
    const fakeService = {
      getManifest: async () => null, // 走 builtin 兜底
      executeApp: async (manifest, inputs, seam) => {
        executed = true;
        return {
          taskId: 'task_123',
          executionId: 'exec_abc',
          jobId: 'exec_abc',
          workspaceId: manifest.workflowBinding.workspaceId,
          status: 'QUEUED',
          rawStatus: 'QUEUED',
          createdAt: new Date().toISOString(),
          streamUrl: '/stream',
          eventsUrl: '/events',
          pollUrl: '/poll',
          injectedSnapshot: { nodes: [], edges: [] },
        };
      },
    };

    const fakeSeam = {
      executeHeadless: async () => ({}),
      getJobStatus: async () => null,
      cancelJob: async () => ({ success: true, canceledAt: '' }),
    };

    const routes = createAppsRoutes({
      service: fakeService,
      getHeadlessSeam: () => fakeSeam,
    });

    let statusCode = 0;
    let responseBody = '';
    const fakeRes = {
      writeHead(status, headers) {
        statusCode = status;
      },
      end(chunk) {
        responseBody = chunk;
      },
    };

    const fakeReq = {
      url: '/omnimux-apps/api/apps/app-creatify-app-demo/executions',
      method: 'POST',
      body: {
        inputs: {
          product_image: 'https://example.com/test.png',
          copywriting: '测试文案',
        },
      },
    };

    const handled = await routes.handle(fakeReq, fakeRes);
    assert.equal(handled, true, '路由必须成功处理');
    assert.equal(statusCode, 200, 'HTTP 状态码必须是 200');
    assert.equal(executed, true, '必须调用 executeApp');

    const parsed = JSON.parse(responseBody);
    assert.equal(parsed.executionId, 'exec_abc');
  });

  test('R03: GET /omnimux-apps/api/apps/:appId/executions/:executionId 查询状态', async () => {
    const fakeService = {
      getJobStatus: async (executionId) => ({
        executionId,
        jobId: executionId,
        status: 'COMPLETED',
        rawStatus: 'COMPLETED',
        artifacts: [{ url: 'https://example.com/out.mp4' }],
      }),
    };

    const fakeSeam = {
      executeHeadless: async () => ({}),
      getJobStatus: async () => null,
      cancelJob: async () => ({ success: true, canceledAt: '' }),
    };

    const routes = createAppsRoutes({
      service: fakeService,
      getHeadlessSeam: () => fakeSeam,
    });

    let statusCode = 0;
    let responseBody = '';
    const fakeRes = {
      writeHead(status) {
        statusCode = status;
      },
      end(chunk) {
        responseBody = chunk;
      },
    };

    const fakeReq = {
      url: '/omnimux-apps/api/apps/app-creatify-app-demo/executions/exec_999',
      method: 'GET',
    };

    const handled = await routes.handle(fakeReq, fakeRes);
    assert.equal(handled, true);
    assert.equal(statusCode, 200);
    const parsed = JSON.parse(responseBody);
    assert.equal(parsed.status, 'COMPLETED');
    assert.equal(parsed.artifacts[0].url, 'https://example.com/out.mp4');
  });
});
