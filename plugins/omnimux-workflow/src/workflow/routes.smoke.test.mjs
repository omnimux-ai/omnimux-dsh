/**
 * Route smoke test: drives the REAL HTTP handler (mounted through
 * mountWorkflowHost with a fake webServer seat) over a temp $DSH_HOME.
 * Covers: manifest, workspace create/get/save, optimistic-lock 409,
 * list, delete, media traversal guard, cross-origin write refusal.
 *
 * Runs against the built dist/index.js (npm run build first).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
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
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-workflow-test-'));
  const libraryRoot = join(dir, 'library');
  mkdirSync(libraryRoot, { recursive: true });
  const registered = [];
  const captured = { handler: null, path: '' };
  const webServer = {
    register(route) {
      registered.push({ path: route.path, handler: route.handler });
      captured.handler = route.handler;
      captured.path = route.path;
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
  const localHeaders = { origin: 'http://localhost:3000' };
  const call = async ({ method, url, body, headers }) => {
    const res = new FakeRes();
    await captured.handler(fakeReq({ method, url, headers, body }), res);
    // File routes stream via pipe(): wait for the response to finish.
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
  return { dir, captured, registered, call, localHeaders, dispose };
}

test('routes mount under /omnimux-workflow with the /dsh-workflow legacy alias', () => {
  const h = makeHarness();
  try {
    const paths = h.registered.map((route) => route.path);
    assert.ok(paths.includes('/omnimux-workflow'), 'canonical prefix registered');
    assert.ok(paths.includes('/dsh-workflow'), 'legacy alias registered');
    assert.equal(typeof h.captured.handler, 'function');
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('workspace CRUD round-trip with optimistic lock', async () => {
  const h = makeHarness();
  try {
    // manifest
    const manifest = await h.call({ url: '/dsh-workflow/api/manifest', headers: h.localHeaders });
    assert.equal(manifest.status, 200);
    assert.match(manifest.body.canvasHash, /^[0-9a-f]{16}$/);

    // create
    const created = await h.call({
      method: 'POST',
      url: '/dsh-workflow/api/workspaces',
      body: { name: '冒烟工作区' },
      headers: h.localHeaders,
    });
    assert.equal(created.status, 200);
    const ws = created.body.workspace;
    assert.equal(ws.version, 0);
    assert.equal(ws.name, '冒烟工作区');
    assert.deepEqual(ws.nodes, []);

    // get
    const got = await h.call({ url: `/dsh-workflow/api/workspaces/${ws.id}`, headers: h.localHeaders });
    assert.equal(got.status, 200);
    assert.equal(got.body.workspace.id, ws.id);

    // save with correct version
    const saved = await h.call({
      method: 'PUT',
      url: `/dsh-workflow/api/workspaces/${ws.id}`,
      body: {
        expectedVersion: 0,
        nodes: [{ id: 'n1', type: 'material', position: { x: 0, y: 0 }, data: { label: '文本' } }],
        edges: [],
      },
      headers: h.localHeaders,
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.workspace.version, 1);
    assert.equal(saved.body.workspace.nodes.length, 1);

    // save with stale version -> 409 + current
    const conflict = await h.call({
      method: 'PUT',
      url: `/dsh-workflow/api/workspaces/${ws.id}`,
      body: { expectedVersion: 0, headers: h.localHeaders },
      headers: h.localHeaders,
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, 'version_conflict');
    assert.equal(conflict.body.current, 1);

    // list
    const listed = await h.call({ url: '/dsh-workflow/api/workspaces', headers: h.localHeaders });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.workspaces.length, 1);
    assert.equal(listed.body.workspaces[0].nodeCount, 1);

    // delete + get -> 404
    const deleted = await h.call({
      method: 'DELETE',
      url: `/dsh-workflow/api/workspaces/${ws.id}`,
      headers: h.localHeaders,
    });
    assert.equal(deleted.status, 200);
    const missing = await h.call({ url: `/dsh-workflow/api/workspaces/${ws.id}`, headers: h.localHeaders });
    assert.equal(missing.status, 404);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('invalid save payload and unknown routes', async () => {
  const h = makeHarness();
  try {
    const created = await h.call({
      method: 'POST',
      url: '/dsh-workflow/api/workspaces',
      body: { name: 'x' },
      headers: h.localHeaders,
    });
    const ws = created.body.workspace;

    // missing expectedVersion
    const noVersion = await h.call({
      method: 'PUT',
      url: `/dsh-workflow/api/workspaces/${ws.id}`,
      body: {},
      headers: h.localHeaders,
    });
    assert.equal(noVersion.status, 400);

    // schema-invalid snapshot
    const badSnapshot = await h.call({
      method: 'PUT',
      url: `/dsh-workflow/api/workspaces/${ws.id}`,
      body: { expectedVersion: 0, nodes: [{ bad: 'node' }] },
      headers: h.localHeaders,
    });
    assert.equal(badSnapshot.status, 400);
    assert.equal(badSnapshot.body.error, 'invalid-snapshot');

    // unknown route
    const unknown = await h.call({ url: '/dsh-workflow/api/nope', headers: h.localHeaders });
    assert.equal(unknown.status, 404);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('cross-origin write refused and media traversal guarded', async () => {
  const h = makeHarness();
  try {
    // cross-site write -> 403
    const cross = await h.call({
      method: 'POST',
      url: '/dsh-workflow/api/workspaces',
      body: {},
      headers: { origin: 'http://evil.example.com' },
    });
    assert.equal(cross.status, 403);
    assert.equal(cross.body.error, 'not-local');

    // media traversal -> 403
    const escape = await h.call({
      url: '/dsh-workflow/media/..%2f..%2f..%2fetc%2fpasswd',
      headers: h.localHeaders,
    });
    assert.equal(escape.status, 403);

    // media file in-root -> 200 with correct mime
    mkdirSync(join(h.dir, 'media', 'ws_x'), { recursive: true });
    writeFileSync(join(h.dir, 'media', 'ws_x', 'a.svg'), '<svg/>');
    const ok = await h.call({ url: '/dsh-workflow/media/ws_x/a.svg', headers: h.localHeaders });
    assert.equal(ok.status, 200);
    assert.equal(ok.raw, '<svg/>');
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('capabilities stub served from the mock gateway', async () => {
  const h = makeHarness();
  try {
    const caps = await h.call({ url: '/dsh-workflow/api/capabilities', headers: h.localHeaders });
    assert.equal(caps.status, 200);
    assert.equal(caps.body.source, 'static-stub');
    assert.ok(Array.isArray(caps.body.text));
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('project assets.json GET/PUT/mkdir via dispatcher (canonical + legacy)', async () => {
  const h = makeHarness();
  try {
    const created = await h.call({
      method: 'POST',
      url: '/omnimux-workflow/api/workspaces',
      body: { name: '项目资产' },
      headers: h.localHeaders,
    });
    const ws = created.body.workspace;
    const canvasVersion = ws.version;

    const unbound = await h.call({
      url: `/omnimux-workflow/api/workspaces/${ws.id}/assets`,
      headers: h.localHeaders,
    });
    assert.equal(unbound.status, 200);
    assert.equal(unbound.body.assets?.items?.length ?? 0, 0);

    const seeded = await h.call({
      method: 'POST',
      url: '/omnimux-workflow/api/projects',
      body: { title: '项目资产包', canvasWorkspaceIds: [ws.id] },
      headers: h.localHeaders,
    });
    assert.equal(seeded.status, 200);
    assert.ok(seeded.body.project?.path);

    const empty = await h.call({
      url: `/omnimux-workflow/api/workspaces/${ws.id}/assets`,
      headers: h.localHeaders,
    });
    assert.equal(empty.status, 200);
    assert.equal(empty.body.assets.rev, 0);

    const blob = await h.call({
      method: 'PUT',
      url: `/omnimux-workflow/api/workspaces/${ws.id}/assets`,
      body: {
        expectedRev: 0,
        folders: [],
        items: [{
          id: 'ast_x',
          name: 'x.png',
          type: 'image',
          parentId: null,
          real_path: 'blob:https://local/x',
          updatedAt: 1,
        }],
      },
      headers: h.localHeaders,
    });
    assert.equal(blob.status, 400);
    assert.equal(blob.body.error, 'blob-url-forbidden');

    const mkdir = await h.call({
      method: 'POST',
      url: `/dsh-workflow/api/workspaces/${ws.id}/assets/mkdir`,
      body: { name: '道具', expectedRev: 0 },
      headers: h.localHeaders,
    });
    assert.equal(mkdir.status, 200);
    assert.equal(mkdir.body.assets.folders[0].name, '道具');
    assert.equal(mkdir.body.assets.rev, 1);

    const source = join(h.dir, 'hero.png');
    writeFileSync(source, 'PNG-BYTES');
    const ingested = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${ws.id}/assets/ingest`,
      body: { paths: [source], parentId: mkdir.body.assets.folders[0].id, expectedRev: mkdir.body.assets.rev },
      headers: h.localHeaders,
    });
    assert.equal(ingested.status, 200);
    assert.equal(ingested.body.assets.items[0].relative_path, 'assets/imported/hero.png');
    assert.equal(ingested.body.assets.items[0].real_path, undefined);
    assert.equal(existsSync(join(seeded.body.project.path, 'assets', 'imported', 'hero.png')), true);
    assert.equal(existsSync(source), true);

    const streamed = await h.call({
      url: `/omnimux-workflow/api/workspaces/${ws.id}/file?rel=assets/imported/hero.png`,
      headers: h.localHeaders,
    });
    assert.equal(streamed.status, 200);
    assert.equal(streamed.raw, 'PNG-BYTES');

    const escaped = await h.call({
      url: `/omnimux-workflow/api/workspaces/${ws.id}/file?rel=../secret.png`,
      headers: h.localHeaders,
    });
    assert.equal(escaped.status, 400);
    assert.equal(escaped.body.error, 'path-denied');

    const conflict = await h.call({
      method: 'POST',
      url: `/omnimux-workflow/api/workspaces/${ws.id}/assets/mkdir`,
      body: { name: '道具', expectedRev: ingested.body.assets.rev },
      headers: h.localHeaders,
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, 'name-conflict');

    const missingWs = await h.call({
      url: '/omnimux-workflow/api/workspaces/ws_nope/assets',
      headers: h.localHeaders,
    });
    assert.equal(missingWs.status, 404);
    assert.equal(missingWs.body.error, 'workspace-not-found');

    const stillCanvas = await h.call({
      url: `/omnimux-workflow/api/workspaces/${ws.id}`,
      headers: h.localHeaders,
    });
    assert.equal(stillCanvas.body.workspace.version, canvasVersion);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});

test('PR3: GET /api/workspaces/:id/version tracks saves (canonical prefix)', async () => {
  const h = makeHarness();
  try {
    const created = await h.call({
      method: 'POST',
      url: '/omnimux-workflow/api/workspaces',
      body: { name: '版本探测' },
      headers: h.localHeaders,
    });
    const ws = created.body.workspace;

    const v0 = await h.call({ url: `/omnimux-workflow/api/workspaces/${ws.id}/version`, headers: h.localHeaders });
    assert.equal(v0.status, 200);
    assert.deepEqual(v0.body, { id: ws.id, version: 0 });

    const saved = await h.call({
      method: 'PUT',
      url: `/omnimux-workflow/api/workspaces/${ws.id}`,
      body: { expectedVersion: 0, nodes: [], edges: [] },
      headers: h.localHeaders,
    });
    assert.equal(saved.status, 200);

    const v1 = await h.call({ url: `/omnimux-workflow/api/workspaces/${ws.id}/version`, headers: h.localHeaders });
    assert.equal(v1.body.version, 1);

    // The plain workspace route must not eat the /version suffix.
    const stillWorkspace = await h.call({ url: `/omnimux-workflow/api/workspaces/${ws.id}`, headers: h.localHeaders });
    assert.equal(stillWorkspace.body.workspace.id, ws.id);
  } finally {
    h.dispose();
    rmSync(h.dir, { recursive: true, force: true });
  }
});
