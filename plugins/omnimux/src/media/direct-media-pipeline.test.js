import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeOmnimuxMedia } from './execute.js';
import { registerDirectMediaRoutes, DIRECT_MEDIA_GENERATE_ROUTE } from './direct-http.js';

describe('直连媒体生成路由与官方渠道自适应测试', () => {

  it('契约 1: direct-http 必须将 body 中的 group 或 channel 透传给底层 executor', async () => {
    let capturedReq = null;
    const fakeServer = {
      register(route) {
        this.route = route;
        return () => {};
      }
    };

    registerDirectMediaRoutes(fakeServer, {
      executeImage: async (req) => {
        capturedReq = req;
        return { mode: 'live', url: 'https://cdn.test/cat.png' };
      },
      executeVideo: async () => {},
    });

    assert.equal(fakeServer.route.path, DIRECT_MEDIA_GENERATE_ROUTE);

    // 构造请求与响应 mock
    const mockReq = {
      method: 'POST',
      body: JSON.stringify({
        prompt: '画一只猫',
        kind: 'image',
        model: 'gpt-image-2.5',
        channel: 'official-standard',
      }),
    };
    // 模拟 stream 读取
    mockReq[Symbol.asyncIterator] = async function* () {
      yield Buffer.from(mockReq.body);
    };

    let responseData = null;
    const mockRes = {
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      end(payload) {
        responseData = JSON.parse(payload);
      }
    };

    await fakeServer.route.handler(mockReq, mockRes);

    assert.equal(mockRes.status, 200);
    assert.equal(responseData.ok, true);
    assert.ok(capturedReq, 'executor 必须接收到请求 payload');
    assert.equal(capturedReq.group, 'official-standard', '必须正确透传 group/channel 字段');
  });

  it('契约 2: 当主对话运行在 agent 模式且请求官方媒体模型时，严禁误杀抛出“本机助手只承接文字”', async () => {
    // 模拟 runtime.mode === 'agent'，未配 BYOK，但请求官方支持的模型 gpt-image-2.5
    const mockStore = {
      resolve: async () => 'test-token',
    };

    // 如果未被“本机助手只承接文字”拦截，说明自适应放行生效，会进入底层鉴权或路由阶段
    try {
      await executeOmnimuxMedia('image', {
        dest: '/tmp/test-out.png',
        prompt: 'a white cat',
        model: 'gpt-image-2.5',
        store: mockStore,
        runtimeSettings: {
          runtimeMode: 'agent', // 本机 CLI 模式
        },
        env: {
          OMNIMUX_API_KEY: 'test-key',
        },
      });
    } catch (err) {
      // 只要不是“本机助手只承接文字，图片、视频和音频需要配置媒体生成提供商或改用官方”，即证明已成功放行官方专线！
      assert.notEqual(
        err.message,
        '本机助手只承接文字，图片、视频和音频需要配置媒体生成提供商或改用官方',
        '严禁因为主对话是 agent 模式就粗暴误杀官方媒体生成请求'
      );
    }
  });

});
