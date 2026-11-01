/**
 * plugins/omnimux-apps/src/host/routes.list.test.mjs
 *
 * 只读应用清单接口契约（Issue #3876）：
 * - GET /omnimux-apps/api/apps       官方内置清单
 * - GET /omnimux-apps/api/apps/:appId 单个 manifest（用户已发布优先，内置兜底）
 * 断言的是真实响应体与真实兜底顺序，不是路由「返回了 200」。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAppsRoutes } from './routes.ts';
import { BUILTIN_MANIFESTS } from '../shared/builtinCatalogData.ts';

function fakeRes() {
  const state = { status: 0, body: '' };
  return {
    state,
    writeHead(status) { state.status = status; },
    end(chunk) { state.body = chunk; },
  };
}

function makeRoutes(service = {}) {
  return createAppsRoutes({
    service: {
      getManifest: async () => null,
      saveManifest: async () => ({ success: true, filePath: '' }),
      executeApp: async () => ({}),
      getJobStatus: async () => null,
      cancelJob: async () => ({ success: true, canceledAt: '' }),
      ...service,
    },
    getHeadlessSeam: () => null,
  });
}

describe('GET /omnimux-apps/api/apps：官方内置清单', () => {
  test('返回随包内联的全部内置 manifest', async () => {
    const routes = makeRoutes();
    const res = fakeRes();
    const handled = await routes.handle({ url: '/omnimux-apps/api/apps', method: 'GET' }, res);

    assert.equal(handled, true, '清单接口必须由本路由处理');
    assert.equal(res.state.status, 200);
    const parsed = JSON.parse(res.state.body);
    assert.ok(Array.isArray(parsed.apps), '响应必须是 { apps: [...] }');
    assert.ok(parsed.apps.length > 0, '内置清单不得为空');
    assert.equal(parsed.apps.length, BUILTIN_MANIFESTS.length, '必须与随包清单条数一致');

    const ids = parsed.apps.map((app) => app.appId);
    assert.ok(ids.includes('app-builtin-product-video'), '必须包含内置商品生视频应用');
    assert.ok(ids.includes('app-creatify-app-demo'), '必须包含出厂 creatify 应用');
    for (const app of parsed.apps) {
      assert.ok(app.metadata?.name, `${app.appId} 必须带 metadata.name，否则卡片没有标题`);
      assert.ok(app.metadata?.category, `${app.appId} 必须带 metadata.category，否则卡片没有分类`);
    }
  });

  test('非 GET 方法不被清单接口认领（交给既有路由语义）', async () => {
    const routes = makeRoutes();
    const res = fakeRes();
    const handled = await routes.handle({ url: '/omnimux-apps/api/apps', method: 'POST', body: {} }, res);
    assert.equal(handled, false, 'POST /apps 不是清单接口，不得被误认成保存 manifest');
  });
});

describe('GET /omnimux-apps/api/apps/:appId：单个 manifest', () => {
  test('用户已发布记录优先于内置清单', async () => {
    const userManifest = {
      appId: 'app-builtin-product-video',
      version: '2.0.0',
      isUserOverridden: true,
      metadata: { name: '我的商品生视频', category: 'video' },
    };
    const routes = makeRoutes({ getManifest: async (appId) => (appId === userManifest.appId ? userManifest : null) });
    const res = fakeRes();
    const handled = await routes.handle({
      url: '/omnimux-apps/api/apps/app-builtin-product-video',
      method: 'GET',
    }, res);

    assert.equal(handled, true);
    assert.equal(res.state.status, 200);
    const parsed = JSON.parse(res.state.body);
    assert.equal(parsed.app.appId, 'app-builtin-product-video');
    assert.equal(parsed.app.metadata.name, '我的商品生视频', '用户覆盖版本必须优先返回');
  });

  test('用户存储没有记录时回落到内置 manifest', async () => {
    const routes = makeRoutes({ getManifest: async () => null });
    const res = fakeRes();
    await routes.handle({ url: '/omnimux-apps/api/apps/app-builtin-video-to-prompt', method: 'GET' }, res);

    assert.equal(res.state.status, 200);
    const parsed = JSON.parse(res.state.body);
    assert.equal(parsed.app.appId, 'app-builtin-video-to-prompt');
    assert.ok(parsed.app.formSchema, '内置应用必须带表单 schema，否则标签页无法渲染');
  });

  test('存储读取抛错时仍按内置兜底，不把整页打成 500', async () => {
    const routes = makeRoutes({ getManifest: async () => { throw new Error('disk unavailable'); } });
    const res = fakeRes();
    await routes.handle({ url: '/omnimux-apps/api/apps/app-creatify-ugc-selfie', method: 'GET' }, res);

    assert.equal(res.state.status, 200);
    assert.equal(JSON.parse(res.state.body).app.appId, 'app-creatify-ugc-selfie');
  });

  test('两边都没有时 404 并给出 app_not_found', async () => {
    const routes = makeRoutes({ getManifest: async () => null });
    const res = fakeRes();
    const handled = await routes.handle({ url: '/omnimux-apps/api/apps/app_does_not_exist', method: 'GET' }, res);

    assert.equal(handled, true);
    assert.equal(res.state.status, 404);
    assert.equal(JSON.parse(res.state.body).error, 'app_not_found');
  });

  test('单项接口不会吞掉 executions 子路径', async () => {
    const routes = makeRoutes();
    const res = fakeRes();
    const handled = await routes.handle({
      url: '/omnimux-apps/api/apps/app_x/executions/exec_1',
      method: 'GET',
    }, res);
    // 没有 headless seam 时既有语义是 503；关键是不能被单项接口当成 appId=app_x 处理。
    assert.equal(res.state.status, 503, 'executions 子路径必须继续走执行路由');
    assert.equal(handled, true);
  });
});
