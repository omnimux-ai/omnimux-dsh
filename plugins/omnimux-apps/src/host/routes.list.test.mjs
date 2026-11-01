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

function makeRoutes(service = {}, options = {}) {
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
    ...options,
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

  test('内置清单读不到时回 503，不伪装成空清单', async () => {
    const routes = makeRoutes({}, { loadBuiltinApps: () => null });
    const res = fakeRes();
    const handled = await routes.handle({ url: '/omnimux-apps/api/apps', method: 'GET' }, res);
    assert.equal(handled, true);
    assert.equal(res.state.status, 503, '读不到必须回 503；回 200 空数组等于把故障说成空数据');
    assert.equal(JSON.parse(res.state.body).error, 'builtin_apps_unavailable');
  });

  test('内置清单真的为空数组时回 200（与读不到区分开）', async () => {
    const routes = makeRoutes({}, { loadBuiltinApps: () => [] });
    const res = fakeRes();
    await routes.handle({ url: '/omnimux-apps/api/apps', method: 'GET' }, res);
    assert.equal(res.state.status, 200);
    assert.deepEqual(JSON.parse(res.state.body).apps, []);
  });

  test('非 GET 方法回 405 并声明 Allow，不被误认成保存 manifest', async () => {
    const routes = makeRoutes();
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = fakeRes();
      const handled = await routes.handle({ url: '/omnimux-apps/api/apps', method, body: {} }, res);
      assert.equal(handled, true, `${method} /apps 必须由清单接口自己处理，不能落到兜底 404`);
      assert.equal(res.state.status, 405, `${method} /apps 必须回 405`);
      assert.equal(JSON.parse(res.state.body).error, 'method_not_allowed');
    }
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

    // 存储读失败必须如实报错：静默回落到出厂版本会让用户覆盖发布的应用无声变回原版。
    assert.equal(res.state.status, 500, '存储读失败必须回 500，不能伪装成拿到了官方原版');
    const parsed = JSON.parse(res.state.body);
    assert.equal(parsed.error, 'manifest_read_failed');
    assert.equal(parsed.message, '读取应用清单失败', '对外只给稳定文案，不透传可能含绝对路径的底层错误');
    assert.equal(
      res.state.body.includes('disk unavailable'),
      false,
      '底层错误文本（可能含本机绝对路径）不得回给浏览器',
    );
  });

  test('非法百分号编码回 400，不抛 URIError', async () => {
    const routes = makeRoutes();
    const res = fakeRes();
    const handled = await routes.handle({ url: '/omnimux-apps/api/apps/%E0%A4%A', method: 'GET' }, res);

    assert.equal(handled, true);
    assert.equal(res.state.status, 400, '非法编码必须是 4xx，而不是连接级异常');
    assert.equal(JSON.parse(res.state.body).error, 'invalid_app_id');
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

  test('保留路径 manifest 不被单项 GET 当成 appId 吞掉', async () => {
    const routes = makeRoutes();
    const res = fakeRes();
    const handled = await routes.handle({ url: '/omnimux-apps/api/apps/manifest', method: 'GET' }, res);
    assert.equal(handled, false, 'GET /apps/manifest 必须继续走既有语义，不能被单项接口认领成 appId=manifest');
  });

  test('%2F 路径穿越被拒：appId 只允许 [a-zA-Z0-9_-]', async () => {
    const routes = makeRoutes({
      getManifest: async (appId) => {
        // 若路由把穿越串放进来，这里会「读到」目录外的内容。
        if (String(appId).includes('/') || String(appId).includes('..')) {
          return { appId: 'SECRET-MANIFEST', version: '1.0.0', metadata: { name: '目录外内容', category: 'video' } };
        }
        return null;
      },
    });
    for (const payload of ['..%2F..%2F..%2Fsecret', 'a%2Fb', '..%2Fapp', '%2E%2E%2Fsecret']) {
      const res = fakeRes();
      const handled = await routes.handle({ url: `/omnimux-apps/api/apps/${payload}`, method: 'GET' }, res);
      assert.equal(handled, true);
      assert.equal(res.state.status, 400, `${payload} 必须在路由层被拒，不能落到存储层`);
      assert.equal(JSON.parse(res.state.body).error, 'invalid_app_id');
      assert.equal(res.state.body.includes('SECRET-MANIFEST'), false, '绝不允许返回应用目录外的内容');
    }
  });

  test('executions 子路径的非法编码同样回 400，不抛 URIError', async () => {
    const routes = makeRoutes();
    for (const [url, method] of [
      ['/omnimux-apps/api/apps/app_x/executions/%E0%A4%A', 'GET'],
      ['/omnimux-apps/api/apps/app_x/executions/%E0%A4%A/cancel', 'POST'],
      ['/omnimux-apps/api/apps/%E0%A4%A/executions', 'POST'],
    ]) {
      const res = fakeRes();
      const handled = await routes.handle({ url, method, body: {} }, res);
      assert.equal(handled, true, `${method} ${url} 必须被路由处理`);
      assert.equal(res.state.status, 400, `${method} ${url} 必须回 400，而不是连接级 URIError`);
    }
  });

  test('保留段按解码后判定：%6Danifest 与 /manifest 语义一致', async () => {
    const routes = makeRoutes();
    for (const path of ['/omnimux-apps/api/apps/manifest', '/omnimux-apps/api/apps/%6Danifest']) {
      const res = fakeRes();
      const handled = await routes.handle({ url: path, method: 'GET' }, res);
      assert.equal(handled, false, `${path} 不得被单项 GET 认领成 appId`);
    }
  });

  test('executions 路由接住存储异常，回稳定 500 而不是空响应（评审 N2）', async () => {
    const ioError = Object.assign(new Error('Failed to read app index /opt/synthetic/secret/app.json'), { code: 'io_error' });
    const routes = makeRoutes({ getManifest: async () => { throw ioError; } });
    const res = fakeRes();
    const handled = await routes.handle({
      url: '/omnimux-apps/api/apps/app_corrupt_001/executions',
      method: 'POST',
      body: { inputs: {} },
    }, res);

    assert.equal(handled, true, 'executions 必须被路由处理，不能抛到连接层');
    assert.equal(res.state.status, 500);
    const parsed = JSON.parse(res.state.body);
    assert.equal(parsed.error, 'manifest_read_failed');
    assert.equal(parsed.message, '读取应用清单失败', '对外只给稳定文案');
    assert.equal(res.state.body.includes('/opt/synthetic/secret'), false, '绝对路径不得漏给浏览器');
  });

  test('写路径 500 也不透绝对路径（评审 N5）', async () => {
    const routes = makeRoutes({
      saveManifest: async () => { throw new Error('ENOENT: /opt/synthetic/private/apps/app_x/manifest@1.json'); },
    });
    const res = fakeRes();
    await routes.handle({
      url: '/omnimux-apps/api/apps/manifest',
      method: 'POST',
      body: { appId: 'app_x', version: '1.0.0' },
    }, res);

    assert.equal(res.state.status, 500);
    assert.equal(res.state.body.includes('/opt/synthetic/private'), false, '写路径同样不得泄漏本机绝对路径');
    assert.equal(JSON.parse(res.state.body).message, '保存应用清单失败');
  });
});
