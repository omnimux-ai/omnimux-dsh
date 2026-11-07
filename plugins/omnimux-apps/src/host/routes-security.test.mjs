import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { Readable } from 'node:stream';
import { createAppsRoutes, registerAppsApiRoutes } from './routes.ts';

function fakeRes() {
  const state = { status: 0, body: '' };
  return {
    state,
    writableEnded: false,
    writeHead(status) { state.status = status; },
    end(chunk) { state.body = chunk; this.writableEnded = true; },
  };
}

function makeRoutes(connection, service = {}) {
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
    getConnection: () => connection,
  });
}

describe('omnimux-apps HTTP trust boundary', () => {
  test('rejects browser requests when the host connection rejects them', async () => {
    let dispatched = false;
    const routes = makeRoutes({ requestRejection: () => 403 }, {
      saveManifest: async () => { dispatched = true; return { success: true, filePath: '' }; },
    });
    const res = fakeRes();
    const handled = await routes.handle({
      method: 'POST',
      url: '/omnimux-apps/api/apps/manifest',
      headers: { origin: 'https://evil.example' },
      body: { appId: 'evil', version: '1.0.0' },
    }, res);
    assert.equal(handled, true);
    assert.equal(res.state.status, 403);
    assert.equal(dispatched, false);
  });

  test('fails closed when the connection service is unavailable', async () => {
    const routes = makeRoutes(undefined);
    const res = fakeRes();
    const handled = await routes.handle({ url: '/omnimux-apps/api/apps', method: 'GET', headers: {} }, res);
    assert.equal(handled, true);
    assert.equal(res.state.status, 503);
  });

  test('registerAppsApiRoutes fails closed when the host connection is not wired', async () => {
    let route;
    const dispose = registerAppsApiRoutes({
      register(candidate) { route = candidate; return () => {}; },
    }, {
      service: {
        getManifest: async () => null,
        saveManifest: async () => ({ success: true, filePath: '' }),
        executeApp: async () => ({}),
        getJobStatus: async () => null,
        cancelJob: async () => ({ success: true, canceledAt: '' }),
      },
      getHeadlessSeam: () => null,
    });
    const res = fakeRes();
    await route.handler({ url: '/omnimux-apps/api/apps', method: 'GET', headers: {} }, res);
    assert.equal(res.state.status, 503);
    dispose();
  });

  test('accepts same-origin reads and rejects oversized bodies', async () => {
    const routes = makeRoutes({ requestRejection: () => undefined });
    const ok = fakeRes();
    await routes.handle({
      url: '/omnimux-apps/api/apps',
      method: 'GET',
      headers: { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' },
    }, ok);
    assert.equal(ok.state.status, 200);

    const req = Readable.from([Buffer.alloc(1024 * 1024 + 1)]);
    req.method = 'POST';
    req.url = '/omnimux-apps/api/apps/manifest';
    req.headers = { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' };
    const tooLarge = fakeRes();
    await routes.handle(req, tooLarge);
    assert.equal(tooLarge.state.status, 413);

    const prepared = fakeRes();
    await routes.handle({
      method: 'POST',
      url: '/omnimux-apps/api/apps/manifest',
      headers: { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' },
      body: { appId: 'x', note: 'x'.repeat(1024 * 1024 + 1) },
    }, prepared);
    assert.equal(prepared.state.status, 413);
  });
});
