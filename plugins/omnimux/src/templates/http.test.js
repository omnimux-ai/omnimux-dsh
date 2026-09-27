import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createTemplatesDispatcher, registerTemplatesRoutes } from './http.js';
import { getCreativeTemplatesSnapshot } from './snapshot.js';

const SNAPSHOT_URL = '/omnimux/templates/creative';
const RAW_BYTES = readFileSync(new URL('./creative-templates.json', import.meta.url));

const okSnapshot = () => ({
  schemaVersion: 1,
  dataVersion: 'a'.repeat(64),
  items: [{ id: 'tpl-x', title: 'T' }],
});

test('GET /omnimux/templates/creative 返回 200 版本化快照与 no-store', async () => {
  const dispatcher = createTemplatesDispatcher({ loadSnapshot: okSnapshot });
  const result = await dispatcher.dispatch({ method: 'GET', url: SNAPSHOT_URL });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, okSnapshot());
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('真实数据快照: envelope 与原始字节 SHA-256 一致', async () => {
  const dispatcher = createTemplatesDispatcher();
  const result = await dispatcher.dispatch({ method: 'GET', url: SNAPSHOT_URL });
  assert.equal(result.status, 200);
  assert.equal(result.body.schemaVersion, 1);
  assert.equal(
    result.body.dataVersion,
    createHash('sha256').update(RAW_BYTES).digest('hex')
  );
  assert.equal(result.body.items.length, 395);
  assert.equal(result.body.items[0].isApp, undefined, '原始记录不得带规范化字段');
});

test('有效空数组快照返回 200 与 items: []', async () => {
  const dispatcher = createTemplatesDispatcher({
    loadSnapshot: () => ({ schemaVersion: 1, dataVersion: 'b'.repeat(64), items: [] }),
  });
  const result = await dispatcher.dispatch({ method: 'GET', url: SNAPSHOT_URL });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items, []);
});

test('数据缺失/不可读返回 503 templates-unavailable', async () => {
  const { TemplatesDataUnavailableError } = await import('./snapshot.js');
  const dispatcher = createTemplatesDispatcher({
    loadSnapshot: () => {
      throw new TemplatesDataUnavailableError('missing file');
    },
  });
  const result = await dispatcher.dispatch({ method: 'GET', url: SNAPSHOT_URL });
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: 'templates-unavailable' });

  const coded = createTemplatesDispatcher({
    loadSnapshot: () => {
      const err = new Error('read failed');
      err.code = 'templates-unavailable';
      throw err;
    },
  });
  assert.equal((await coded.dispatch({ method: 'GET', url: SNAPSHOT_URL })).status, 503);
});

test('意外内部错误返回 500 且不泄露路径或堆栈', async () => {
  const dispatcher = createTemplatesDispatcher({
    loadSnapshot: () => {
      const err = new Error('ENOENT /secret/abs/path/creative-templates.json');
      err.stack = 'Error: ENOENT\n    at secretFrame (file.js:1:1)';
      throw err;
    },
  });
  const result = await dispatcher.dispatch({ method: 'GET', url: SNAPSHOT_URL });
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'internal error' });
  const text = JSON.stringify(result);
  assert.ok(!text.includes('/secret') && !text.includes('file.js'), '不得泄露路径或堆栈');
});

test('非 GET 方法一律 405 且无副作用', async () => {
  let calls = 0;
  const dispatcher = createTemplatesDispatcher({
    loadSnapshot: () => {
      calls += 1;
      return okSnapshot();
    },
  });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const result = await dispatcher.dispatch({ method, url: SNAPSHOT_URL });
    assert.equal(result.status, 405, `${method} 必须 405`);
    assert.deepEqual(result.body, { error: 'method not allowed' });
  }
  assert.equal(calls, 0, '405 路径不得触发数据加载');
});

test('未知路径返回 404', async () => {
  const dispatcher = createTemplatesDispatcher({ loadSnapshot: okSnapshot });
  for (const url of ['/omnimux/templates', '/omnimux/templates/unknown', '/other']) {
    const result = await dispatcher.dispatch({ method: 'GET', url });
    assert.equal(result.status, 404, `${url} 必须 404`);
  }
});

test('注册处理器写入响应头与 JSON 体，卸载后路由注销', async (t) => {
  const dispatcher = createTemplatesDispatcher({
    loadSnapshot: getCreativeTemplatesSnapshot,
  });
  const handlers = new Map();
  const webServer = {
    register(route) {
      assert.equal(route.kind, 'prefix');
      assert.equal(route.path, '/omnimux/templates');
      handlers.set(route.path, route.handler);
      return () => handlers.delete(route.path);
    },
  };
  const stop = registerTemplatesRoutes(webServer, dispatcher);
  assert.equal(handlers.size, 1);

  const fakeRes = () => {
    const res = {
      status: null,
      headers: {},
      body: null,
      setHeader(name, value) {
        res.headers[name.toLowerCase()] = value;
      },
      writeHead(status, headers = {}) {
        res.status = status;
        for (const [k, v] of Object.entries(headers)) res.headers[k.toLowerCase()] = v;
      },
      end(text) {
        res.body = text;
      },
    };
    return res;
  };

  const okRes = fakeRes();
  await handlers.get('/omnimux/templates')({ method: 'GET', url: SNAPSHOT_URL }, okRes);
  assert.equal(okRes.status, 200);
  assert.equal(okRes.headers['cache-control'], 'no-store');
  assert.equal(okRes.headers['content-type'], 'application/json; charset=utf-8');
  const body = JSON.parse(okRes.body);
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.items.length, 395);

  const postRes = fakeRes();
  await handlers.get('/omnimux/templates')({ method: 'POST', url: SNAPSHOT_URL }, postRes);
  assert.equal(postRes.status, 405);

  stop();
  assert.equal(handlers.size, 0, 'stop 必须注销路由');
});

/**
 * 测试网络守卫拦截全局 fetch，这里用 node:http 直接请求本机回环服务。
 */
function getLocal(pathname, port, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path: pathname, method },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('经真实 Node HTTP 服务响应且注册/注销生效', async () => {
  const dispatcher = createTemplatesDispatcher();
  const webServer = {
    routes: new Map(),
    register(route) {
      this.routes.set(route.path, route);
      return () => this.routes.delete(route.path);
    },
  };
  const stop = registerTemplatesRoutes(webServer, dispatcher);

  const server = createServer((req, res) => {
    const route = webServer.routes.get('/omnimux/templates');
    if (route && req.url.startsWith('/omnimux/templates')) {
      route.handler(req, res);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const response = await getLocal(SNAPSHOT_URL, port);
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    const body = JSON.parse(response.body);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.items.length, 395);
    assert.equal(
      body.dataVersion,
      createHash('sha256').update(RAW_BYTES).digest('hex')
    );

    const denied = await getLocal(SNAPSHOT_URL, port, 'POST');
    assert.equal(denied.status, 405);
  } finally {
    stop();
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(webServer.routes.size, 0);
});
