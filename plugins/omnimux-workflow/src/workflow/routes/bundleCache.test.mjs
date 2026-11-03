/**
 * Island bundle delivery over the real mounted host routes:
 * `?v=<build hash>` is immutable, carries a strong ETag (304 on If-None-Match)
 * and travels gzip/br compressed; unversioned requests, Range requests and
 * user media keep the original no-cache behavior.
 *
 * Runs against the built host (dist/index.js), like routes.smoke.test.mjs;
 * CI rebuilds the host bundle from src before the plugin suites.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Writable } from 'node:stream';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { mountWorkflowHost } from '../../../dist/index.js';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const canvasFile = join(pluginRoot, 'lib', 'canvas.js');
const directorFile = join(pluginRoot, 'lib', 'director.js');

/** ServerResponse stand-in that keeps the raw bytes (compressed bodies included). */
class FakeRes extends Writable {
  constructor() {
    super();
    this.status = 0;
    this.headers = {};
    this.chunks = [];
  }

  writeHead(status, headers) {
    this.status = status;
    this.headers = headers ?? {};
    return this;
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  get body() {
    return Buffer.concat(this.chunks);
  }
}

async function request(handler, url, headers = {}) {
  const res = new FakeRes();
  await handler({ method: 'GET', url, headers }, res);
  if (!res.writableFinished) {
    await new Promise((resolve) => res.once('finish', resolve));
  }
  return res;
}

/** Mounts the real host over a temp state root and captures its route handler. */
function harness(t) {
  const root = mkdtempSync(join(tmpdir(), 'omnimux-bundle-cache-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = {
    root: join(root, 'workflow'),
    workspacesDir: join(root, 'workflow', 'workspaces'),
    executionsDir: join(root, 'workflow', 'executions'),
    mediaDir: join(root, 'workflow', 'media'),
    templatesDir: join(root, 'workflow', 'templates'),
  };
  let handler = null;
  const dispose = mountWorkflowHost(
    {
      webServer: {
        register(route) {
          if (route.path === '/omnimux-workflow') handler = route.handler;
          return () => {};
        },
      },
    },
    { paths, libraryRoot: join(root, 'library') },
  );
  t.after(dispose);
  assert.equal(typeof handler, 'function', 'workflow routes not mounted');
  return {
    mediaDir: paths.mediaDir,
    request: (url, headers) => request(handler, url, headers),
    async manifest() {
      const res = await request(handler, '/omnimux-workflow/api/manifest');
      assert.equal(res.status, 200);
      return JSON.parse(res.body.toString('utf8'));
    },
  };
}

/** The build hash the client reads from the manifest. */
function manifestHash(manifest, artifact) {
  const hash = artifact === 'canvas.js' ? manifest.canvasHash : manifest.directorHash;
  assert.match(hash, /^[0-9a-f]{16}$/, `${artifact} build hash missing — run the workflow build`);
  return hash;
}

test('canvas.js?v=<hash>：immutable 长缓存 + 强 ETag + gzip 压缩传输', async (t) => {
  assert.ok(existsSync(canvasFile), 'lib/canvas.js missing — run the workflow build');
  const h = harness(t);
  const hash = manifestHash(await h.manifest(), 'canvas.js');
  const raw = readFileSync(canvasFile);
  const res = await h.request(`/omnimux-workflow/canvas.js?v=${hash}`, { 'accept-encoding': 'gzip' });

  assert.equal(res.status, 200);
  assert.equal(res.headers['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.equal(res.headers.ETag, `"${hash}"`);
  assert.equal(res.headers.Vary, 'Accept-Encoding');
  assert.equal(res.headers['Content-Encoding'], 'gzip');
  assert.equal(res.headers['Content-Type'], 'application/javascript; charset=utf-8');
  assert.ok(
    Number(res.headers['Content-Length']) < raw.length / 2,
    `gzip ${res.headers['Content-Length']} should be far below ${raw.length}`,
  );
  assert.deepEqual(gunzipSync(res.body), raw);
});

test('canvas.js?v=<hash>：Accept-Encoding 同时支持时优先 br', async (t) => {
  const h = harness(t);
  const hash = manifestHash(await h.manifest(), 'canvas.js');
  const raw = readFileSync(canvasFile);
  const res = await h.request(`/omnimux-workflow/canvas.js?v=${hash}`, { 'accept-encoding': 'gzip, deflate, br' });

  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Encoding'], 'br');
  assert.ok(Number(res.headers['Content-Length']) < raw.length / 2);
  assert.deepEqual(brotliDecompressSync(res.body), raw);
});

test('If-None-Match 命中强 ETag → 304 且无 body', async (t) => {
  const h = harness(t);
  const hash = manifestHash(await h.manifest(), 'canvas.js');
  const etag = `"${hash}"`;

  const notModified = await h.request(`/omnimux-workflow/canvas.js?v=${hash}`, {
    'accept-encoding': 'gzip',
    'if-none-match': etag,
  });
  assert.equal(notModified.status, 304);
  assert.equal(notModified.body.length, 0);
  assert.equal(notModified.headers.ETag, etag);
  assert.equal(notModified.headers['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.equal(notModified.headers['Content-Encoding'], undefined);

  const fresh = await h.request(`/omnimux-workflow/canvas.js?v=${hash}`, {
    'accept-encoding': 'gzip',
    'if-none-match': '"0000000000000000"',
  });
  assert.equal(fresh.status, 200);
  assert.equal(gunzipSync(fresh.body).length, statSync(canvasFile).size);
});

test('无 Accept-Encoding 时回退原文', async (t) => {
  const h = harness(t);
  const hash = manifestHash(await h.manifest(), 'canvas.js');
  const raw = readFileSync(canvasFile);
  const res = await h.request(`/omnimux-workflow/canvas.js?v=${hash}`);

  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Encoding'], undefined);
  assert.equal(res.headers['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.equal(res.headers.ETag, `"${hash}"`);
  assert.equal(Number(res.headers['Content-Length']), raw.length);
  assert.deepEqual(res.body, raw);
});

test('未带 ?v= 与版本不匹配时保持原 no-cache 行为', async (t) => {
  const h = harness(t);
  const raw = readFileSync(canvasFile);

  const plain = await h.request('/omnimux-workflow/canvas.js', { 'accept-encoding': 'gzip' });
  assert.equal(plain.status, 200);
  assert.equal(plain.headers['Cache-Control'], 'no-cache');
  assert.equal(plain.headers.ETag, undefined);
  assert.equal(plain.headers['Content-Encoding'], undefined);
  assert.deepEqual(plain.body, raw);

  const stale = await h.request('/omnimux-workflow/canvas.js?v=0000000000000000', { 'accept-encoding': 'gzip' });
  assert.equal(stale.status, 200);
  assert.equal(stale.headers['Cache-Control'], 'no-cache');
  assert.equal(stale.headers.ETag, undefined);
  assert.equal(stale.headers['Content-Encoding'], undefined);
});

test('director.js 走同一套缓存语义（含 /dsh-workflow 旧前缀）', async (t) => {
  assert.ok(existsSync(directorFile), 'lib/director.js missing — run the workflow build');
  const h = harness(t);
  const hash = manifestHash(await h.manifest(), 'director.js');
  const raw = readFileSync(directorFile);
  const res = await h.request(`/dsh-workflow/director.js?v=${hash}`, { 'accept-encoding': 'br' });

  assert.equal(res.status, 200);
  assert.equal(res.headers['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.equal(res.headers.ETag, `"${hash}"`);
  assert.equal(res.headers['Content-Encoding'], 'br');
  assert.deepEqual(brotliDecompressSync(res.body), raw);
});

test('Range 请求仍走 206 identity 与 no-cache（版本化 URL 也不压缩）', async (t) => {
  const h = harness(t);
  const hash = manifestHash(await h.manifest(), 'canvas.js');
  const raw = readFileSync(canvasFile);

  const ranged = await h.request('/omnimux-workflow/canvas.js', {
    'accept-encoding': 'gzip',
    range: 'bytes=0-9',
  });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers['Cache-Control'], 'no-cache');
  assert.equal(ranged.headers['Content-Range'], `bytes 0-9/${raw.length}`);
  assert.equal(ranged.headers['Content-Encoding'], undefined);
  assert.deepEqual(ranged.body, raw.subarray(0, 10));

  const rangedVersioned = await h.request(`/omnimux-workflow/canvas.js?v=${hash}`, {
    'accept-encoding': 'gzip',
    range: 'bytes=0-9',
  });
  assert.equal(rangedVersioned.status, 206);
  assert.equal(rangedVersioned.headers['Content-Encoding'], undefined);
  assert.deepEqual(rangedVersioned.body, raw.subarray(0, 10));
});

test('用户媒体文件（视频）保持 no-cache、不压缩', async (t) => {
  const h = harness(t);
  const video = Buffer.from('fake video bytes for the media route');
  mkdirSync(h.mediaDir, { recursive: true });
  writeFileSync(join(h.mediaDir, 'clip.mp4'), video);

  const full = await h.request('/omnimux-workflow/media/clip.mp4', { 'accept-encoding': 'gzip' });
  assert.equal(full.status, 200);
  assert.equal(full.headers['Cache-Control'], 'no-cache');
  assert.equal(full.headers.ETag, undefined);
  assert.equal(full.headers['Content-Encoding'], undefined);
  assert.deepEqual(full.body, video);

  const ranged = await h.request('/omnimux-workflow/media/clip.mp4', {
    'accept-encoding': 'gzip',
    range: 'bytes=0-3',
  });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers['Cache-Control'], 'no-cache');
  assert.deepEqual(ranged.body, video.subarray(0, 4));
});
