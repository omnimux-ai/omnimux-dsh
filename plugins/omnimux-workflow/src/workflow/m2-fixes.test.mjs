/**
 * M2 fix regression tests (QA report 建议-1..5 + route prefix migration).
 *
 * Each test maps to one M1 QA finding:
 *   ① create() schema validation  -> name-too-long 400, no zombie workspace
 *   ② readJsonBody size cap       -> 413 body-too-large
 *   ③ media route realpath        -> symlink escape refused (403)
 *   ④ assertLocalWrite scope      -> documented behavior (localhost any port ok)
 *   ⑤ 409 current from error obj  -> conflict body carries `current`
 * Plus: /omnimux-workflow canonical prefix + /dsh-workflow legacy alias.
 *
 * Runs against the built dist/index.js (npm run build first).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';

const host = await import('../../dist/index.js');

/** Real Writable with the ServerResponse surface the routes touch. */
class FakeRes extends Writable {
  constructor() {
    super();
    this.state = { status: 0, headers: {}, body: '' };
  }

  writeHead(status, headers) {
    this.state.status = status;
    this.state.headers = headers ?? {};
    return this;
  }

  _write(chunk, _encoding, callback) {
    this.state.body += chunk.toString();
    callback();
  }

  end(text) {
    if (typeof text === 'string') this.state.body += text;
    super.end();
    return this;
  }
}

function fakeReq({ method = 'GET', url = '/', headers = {}, body = undefined }) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function makeHarness() {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-workflow-m2-'));
  const libraryRoot = join(dir, 'library');
  mkdirSync(libraryRoot, { recursive: true });
  const registered = [];
  const webServer = {
    register(route) {
      registered.push({ path: route.path, handler: route.handler });
      return () => {};
    },
  };
  const dispose = host.mountWorkflowHost(
    { webServer },
    {
      paths: {
        root: dir,
        workspacesDir: join(dir, 'workspaces'),
        executionsDir: join(dir, 'executions'),
        mediaDir: join(dir, 'media'),
      },
      libraryRoot,
    },
  );
  // Both registered handlers dispatch identically (canonical + legacy).
  const handler = registered[0].handler;
  const localHeaders = { origin: 'http://localhost:3000' };
  const call = async ({ method, url, body, headers, rawBody }) => {
    const res = new FakeRes();
    const req = rawBody === undefined
      ? fakeReq({ method, url, headers, body })
      : { method, url, headers, async *[Symbol.asyncIterator]() { yield rawBody; } };
    await handler(req, res);
    if (!res.writableEnded) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1000);
        res.once('finish', () => { clearTimeout(timer); resolve(); });
        res.once('close', () => { clearTimeout(timer); resolve(); });
      });
    }
    let json = null;
    try {
      json = JSON.parse(res.state.body);
    } catch {
      json = null;
    }
    return { status: res.state.status, body: json, raw: res.state.body };
  };
  return { dir, call, localHeaders, dispose };
}

async function createWorkspace(h, name = 'm2') {
  const created = await h.call({
    method: 'POST',
    url: '/omnimux-workflow/api/workspaces',
    body: { name },
    headers: h.localHeaders,
  });
  assert.equal(created.status, 200, `workspace create failed: ${created.raw}`);
  return created.body.workspace;
}

test('QA① create() rejects over-long names -> 400, no zombie workspace', async () => {
  const h = makeHarness();
  try {
    const longName = 'x'.repeat(201);
    const created = await h.call({
      method: 'POST',
      url: '/omnimux-workflow/api/workspaces',
      body: { name: longName },
      headers: h.localHeaders,
    });
    assert.equal(created.status, 400);
    assert.equal(created.body.error, 'name-too-long');

    // No zombie: the rejected workspace is fully absent from every read path.
    const listed = await h.call({ url: '/omnimux-workflow/api/workspaces', headers: h.localHeaders });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.workspaces.length, 0);

    // 200-char name is still accepted (boundary).
    const boundary = await h.call({
      method: 'POST',
      url: '/omnimux-workflow/api/workspaces',
      body: { name: 'y'.repeat(200) },
      headers: h.localHeaders,
    });
    assert.equal(boundary.status, 200);
    assert.equal(boundary.body.workspace.name.length, 200);
    const got = await h.call({
      url: `/omnimux-workflow/api/workspaces/${boundary.body.workspace.id}`,
      headers: h.localHeaders,
    });
    assert.equal(got.status, 200);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('QA② readJsonBody caps request bodies at 1MB -> 413', async () => {
  const h = makeHarness();
  try {
    const ws = await createWorkspace(h);
    const bigPayload = Buffer.from(JSON.stringify({
      expectedVersion: 0,
      name: 'z'.repeat(1024 * 1024 + 4096),
    }));
    const oversize = await h.call({
      method: 'PUT',
      url: `/omnimux-workflow/api/workspaces/${ws.id}`,
      rawBody: bigPayload,
      headers: h.localHeaders,
    });
    assert.equal(oversize.status, 413);
    assert.equal(oversize.body.error, 'body-too-large');

    // The workspace is untouched.
    const got = await h.call({ url: `/omnimux-workflow/api/workspaces/${ws.id}`, headers: h.localHeaders });
    assert.equal(got.status, 200);
    assert.equal(got.body.workspace.version, 0);

    // Just-under-the-cap body still parses normally (small payload sanity).
    const small = await h.call({
      method: 'PUT',
      url: `/omnimux-workflow/api/workspaces/${ws.id}`,
      body: { expectedVersion: 0, nodes: [], edges: [] },
      headers: h.localHeaders,
    });
    assert.equal(small.status, 200);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('QA③ media route resolves symlinks (realpath) -> escape refused', async () => {
  const h = makeHarness();
  try {
    // A secret file OUTSIDE the media root.
    writeFileSync(join(h.dir, 'secret-outside.txt'), 'secret');
    mkdirSync(join(h.dir, 'media', 'ws_x'), { recursive: true });
    writeFileSync(join(h.dir, 'media', 'ws_x', 'inside.svg'), '<svg/>');

    // Symlink inside media/ pointing outside -> must NOT be served.
    symlinkSync(join(h.dir, 'secret-outside.txt'), join(h.dir, 'media', 'escape.txt'));
    const escape = await h.call({
      url: '/omnimux-workflow/media/escape.txt',
      headers: h.localHeaders,
    });
    assert.equal(escape.status, 403);
    assert.equal(escape.body.error, 'path-denied');
    assert.notEqual(escape.raw, 'secret');

    // A symlink pointing at a file INSIDE the media root still works.
    symlinkSync(join(h.dir, 'media', 'ws_x', 'inside.svg'), join(h.dir, 'media', 'alias.svg'));
    const viaLink = await h.call({
      url: '/omnimux-workflow/media/alias.svg',
      headers: h.localHeaders,
    });
    assert.equal(viaLink.status, 200);
    assert.equal(viaLink.raw, '<svg/>');

    // Regular in-root file still works (GET + HEAD).
    const direct = await h.call({
      url: '/omnimux-workflow/media/ws_x/inside.svg',
      headers: h.localHeaders,
    });
    assert.equal(direct.status, 200);
    assert.equal(direct.raw, '<svg/>');

    const directHead = await h.call({
      method: 'HEAD',
      url: '/omnimux-workflow/media/ws_x/inside.svg',
      headers: h.localHeaders,
    });
    assert.equal(directHead.status, 200);

    // Missing file -> 404 (realpath failure path).
    const missing = await h.call({
      url: '/omnimux-workflow/media/ws_x/nope.svg',
      headers: h.localHeaders,
    });
    assert.equal(missing.status, 404);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('QA④ assertLocalWrite accepts localhost on any port (documented scope)', async () => {
  const h = makeHarness();
  try {
    // Same-origin-ish local writes on arbitrary ports are accepted.
    for (const origin of ['http://localhost:57331', 'https://127.0.0.1:8443', 'http://[::1]:3000']) {
      const ok = await h.call({
        method: 'POST',
        url: '/omnimux-workflow/api/workspaces',
        body: { name: `ws-${origin}` },
        headers: { origin },
      });
      assert.equal(ok.status, 200, `origin ${origin} should be allowed`);
    }
    // Remote origins are refused.
    const remote = await h.call({
      method: 'POST',
      url: '/omnimux-workflow/api/workspaces',
      body: {},
      headers: { origin: 'https://example.com' },
    });
    assert.equal(remote.status, 403);
    assert.equal(remote.body.error, 'not-local');
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('QA⑤ 409 body carries `current` from the error object (no regex parsing)', async () => {
  const h = makeHarness();
  try {
    const ws = await createWorkspace(h);
    await h.call({
      method: 'PUT',
      url: `/omnimux-workflow/api/workspaces/${ws.id}`,
      body: { expectedVersion: 0, nodes: [], edges: [] },
      headers: h.localHeaders,
    });
    const stale = await h.call({
      method: 'PUT',
      url: `/omnimux-workflow/api/workspaces/${ws.id}`,
      body: { expectedVersion: 0, nodes: [], edges: [] },
      headers: h.localHeaders,
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, 'version_conflict');
    assert.equal(stale.body.current, 1, 'server version must ride on the error object');
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('prefix migration: canonical /omnimux-workflow works, /dsh-workflow alias kept', async () => {
  const h = makeHarness();
  try {
    // Canonical prefix: create.
    const ws = await createWorkspace(h, 'prefix-check');
    assert.equal(ws.version, 0);

    // Read the same workspace through the LEGACY prefix.
    const viaLegacy = await h.call({
      url: `/dsh-workflow/api/workspaces/${ws.id}`,
      headers: h.localHeaders,
    });
    assert.equal(viaLegacy.status, 200);
    assert.equal(viaLegacy.body.workspace.id, ws.id);

    // Save via legacy prefix, read back via canonical (mixed usage).
    const saved = await h.call({
      method: 'PUT',
      url: `/dsh-workflow/api/workspaces/${ws.id}`,
      body: {
        expectedVersion: 0,
        nodes: [{ id: 'n1', type: 'material', position: { x: 0, y: 0 }, data: { label: 'a' } }],
        edges: [],
      },
      headers: h.localHeaders,
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.workspace.version, 1);

    const viaCanonical = await h.call({
      url: `/omnimux-workflow/api/workspaces/${ws.id}`,
      headers: h.localHeaders,
    });
    assert.equal(viaCanonical.status, 200);
    assert.equal(viaCanonical.body.workspace.version, 1);
    assert.equal(viaCanonical.body.workspace.nodes.length, 1);

    // Manifest reachable on both prefixes.
    for (const prefix of ['/omnimux-workflow', '/dsh-workflow']) {
      const manifest = await h.call({ url: `${prefix}/api/manifest`, headers: h.localHeaders });
      assert.equal(manifest.status, 200, `${prefix}/api/manifest`);
      assert.match(manifest.body.canvasHash, /^[0-9a-f]{16}$/);
    }
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});
