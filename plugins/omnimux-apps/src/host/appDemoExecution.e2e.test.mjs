/**
 * plugins/omnimux-apps/src/host/appDemoExecution.e2e.test.mjs
 *
 * 端到端验收测试：
 * 验证「手机与网页交互实机演示」（app-creatify-app-demo）等独立应用
 * 能够自动补齐预设工程快照、完成参数注入、发起真实无头执行并支持状态轮询。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAppsRoutes } from './routes.ts';
import { createAppsService } from './index.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('E2E: 独立应用真实调度与状态对账闭环', () => {
  test('E01: AppTab.jsx 源码与渲染契约中彻底清除 exempt-ui04 注释泄漏', () => {
    const appTabPath = resolve(
      process.cwd(),
      'plugins/omnimux-workflow/src/client/projects/AppTab.jsx',
    );
    const code = readFileSync(appTabPath, 'utf-8');
    assert.doesNotMatch(code, /exempt-ui04/, 'AppTab 严禁包含 exempt-ui04');
    assert.match(code, /IconSpinner/, '必须使用矢量 SVG Spinner 图标');
    assert.match(code, /IconCheck/, '必须使用矢量 SVG Check 图标');
    assert.match(code, /IconAlert/, '必须使用矢量 SVG Alert 图标');
  });

  test('E02: 完整发起真实任务并完成轮询终态对账', async () => {
    const service = createAppsService();

    let jobExecutionCount = 0;
    let registeredParams = null;
    const mockExecutionId = `exec_test_${Date.now()}`;

    const fakeHeadlessSeam = {
      async executeHeadless(params) {
        jobExecutionCount++;
        registeredParams = params;
        return {
          executionId: mockExecutionId,
          jobId: mockExecutionId,
          workspaceId: params.workspaceId,
          status: 'QUEUED',
          rawStatus: 'QUEUED',
          createdAt: new Date().toISOString(),
          streamUrl: `/events/${mockExecutionId}`,
          eventsUrl: `/events/${mockExecutionId}`,
          pollUrl: `/poll/${mockExecutionId}`,
        };
      },
      async getJobStatus(jobId) {
        assert.equal(jobId, mockExecutionId);
        return {
          executionId: mockExecutionId,
          jobId: mockExecutionId,
          status: 'COMPLETED',
          rawStatus: 'COMPLETED',
          artifacts: [
            {
              nodeId: 'node-video-generation-core',
              type: 'video',
              url: 'https://cdn.example.com/rendered-video-1080p.mp4',
            },
          ],
          outputs: {
            mediaUrl: 'https://cdn.example.com/rendered-video-1080p.mp4',
          },
        };
      },
      async cancelJob(jobId) {
        return { success: true, canceledAt: new Date().toISOString() };
      },
    };

    const routes = createAppsRoutes({
      service,
      getHeadlessSeam: () => fakeHeadlessSeam,
    });

    // 1. 发起 POST /omnimux-apps/api/apps/app-creatify-app-demo/executions
    let postStatus = 0;
    let postBody = '';
    const postRes = {
      writeHead(s) {
        postStatus = s;
      },
      end(b) {
        postBody = b;
      },
    };

    const postReq = {
      url: '/omnimux-apps/api/apps/app-creatify-app-demo/executions',
      method: 'POST',
      body: {
        version: '1.0.0',
        inputs: {
          product_image: 'https://my-brand.com/hero-screenshot.png',
          copywriting: '极致丝滑的次世代 SaaS 交互演示体验',
          voice: 'zh_male_calm',
        },
      },
    };

    const postHandled = await routes.handle(postReq, postRes);
    assert.equal(postHandled, true);
    assert.equal(postStatus, 200);

    const postJson = JSON.parse(postBody);
    assert.equal(postJson.executionId, mockExecutionId);
    assert.equal(jobExecutionCount, 1, '必须触发 1 次真实 executeHeadless 调度');

    // 验证注入参数是否正确进入 DAG 节点
    assert.ok(registeredParams.snapshot, '必须包含注入快照');
    const nodes = registeredParams.snapshot.nodes;
    const copywritingNode = nodes.find((n) => n.id === 'node-slot-copywriting');
    assert.ok(copywritingNode, '必须存在文案槽节点');
    assert.equal(
      copywritingNode.data.prompt,
      '极致丝滑的次世代 SaaS 交互演示体验',
      '文案必须真实注入到 prompt',
    );

    const voiceNode = nodes.find((n) => n.id === 'node-slot-voice-tts');
    assert.ok(voiceNode, '必须存在解说声音槽节点');
    assert.equal(
      voiceNode.data.params.voice,
      'zh_male_calm',
      '人声配置必须真实注入到 params.voice',
    );

    // 2. 轮询 GET /omnimux-apps/api/apps/app-creatify-app-demo/executions/:executionId
    let getStatus = 0;
    let getBody = '';
    const getRes = {
      writeHead(s) {
        getStatus = s;
      },
      end(b) {
        getBody = b;
      },
    };

    const getReq = {
      url: `/omnimux-apps/api/apps/app-creatify-app-demo/executions/${mockExecutionId}`,
      method: 'GET',
    };

    const getHandled = await routes.handle(getReq, getRes);
    assert.equal(getHandled, true);
    assert.equal(getStatus, 200);

    const getJson = JSON.parse(getBody);
    assert.equal(getJson.status, 'COMPLETED');
    assert.equal(
      getJson.artifacts[0].url,
      'https://cdn.example.com/rendered-video-1080p.mp4',
    );
  });
});
