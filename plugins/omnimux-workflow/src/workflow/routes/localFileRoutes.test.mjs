/**
 * Native pick + local-file probe/stream. Picker is injected; no osascript.
 * Import TS sources directly (no dist build required).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createLocalFileRoutes } from './localFileRoutes.ts';
import { parseByteRange } from '../byteRange.ts';
import { parsePickedPaths, pickNativePath, PickerError } from '../picker.ts';

const local = { origin: 'http://127.0.0.1:43120' };

function getReq(path) {
  return {
    method: 'GET',
    url: `/omnimux-workflow/api/local-file?path=${encodeURIComponent(path)}`,
    origin: local.origin,
  };
}

test('parseByteRange：bytes=0-1 与 suffix / 越界', () => {
  assert.deepEqual(parseByteRange('bytes=0-1', 10), { start: 0, end: 1 });
  assert.deepEqual(parseByteRange('bytes=8-', 10), { start: 8, end: 9 });
  assert.deepEqual(parseByteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.equal(parseByteRange('bytes=20-30', 10).invalid, true);
  assert.equal(parseByteRange(undefined, 10), null);
});

test('parsePickedPaths 拆 POSIX 行并丢掉空行', () => {
  assert.deepEqual(parsePickedPaths('/a.png\n/b.mp4\n'), ['/a.png', '/b.mp4']);
  assert.deepEqual(parsePickedPaths(''), []);
  assert.deepEqual(parsePickedPaths('\n\n'), []);
});

test('pickNativePath：invalid-kind / 非 darwin / 取消 / 失败', async () => {
  await assert.rejects(
    () => pickNativePath('folder', { platform: 'darwin', run: async () => ({ stdout: '', stderr: '' }) }),
    (error) => error instanceof PickerError && error.code === 'picker-invalid-kind',
  );
  await assert.rejects(
    () => pickNativePath('file', { platform: 'linux' }),
    (error) => error instanceof PickerError && error.code === 'picker-unsupported',
  );
  const cancelled = await pickNativePath('file', {
    platform: 'darwin',
    run: async () => {
      throw Object.assign(new Error('User canceled. (-128)'), { stderr: '' });
    },
  });
  assert.deepEqual(cancelled, { path: null, paths: [] });
  await assert.rejects(
    () => pickNativePath('file', {
      platform: 'darwin',
      run: async () => {
        throw Object.assign(new Error('osascript exited with code 1'), { stderr: 'syntax error' });
      },
    }),
    (error) => error instanceof PickerError && error.code === 'picker-failed',
  );
});

test('pickNativePath：darwin 注入 run 返回多选路径', async () => {
  const result = await pickNativePath('file', {
    platform: 'darwin',
    run: async (command, argv) => {
      assert.equal(command, 'osascript');
      assert.equal(argv[0], '-e');
      assert.match(argv[1], /choose file/);
      return { stdout: '/Users/x/a.png\n/Users/x/b.jpg\n', stderr: '' };
    },
  });
  assert.equal(result.path, '/Users/x/a.png');
  assert.deepEqual(result.paths, ['/Users/x/a.png', '/Users/x/b.jpg']);
});

test('POST /api/pick 注入 picker：取消 / 多选 / invalid-kind / unsupported', async () => {
  const cancelled = await createLocalFileRoutes({
    picker: async () => ({ path: null, paths: [] }),
  }).tryHandle('POST', '/omnimux-workflow/api/pick', {
    method: 'POST',
    url: '/omnimux-workflow/api/pick',
    origin: local.origin,
    body: { kind: 'file' },
  });
  assert.equal(cancelled.status, 200);
  assert.deepEqual(cancelled.body, { path: null, paths: [] });

  const picked = await createLocalFileRoutes({
    picker: async (kind) => {
      assert.equal(kind, 'file');
      return { path: '/tmp/a.png', paths: ['/tmp/a.png', '/tmp/b.mp4'] };
    },
  }).tryHandle('POST', '/omnimux-workflow/api/pick', {
    method: 'POST',
    url: '/omnimux-workflow/api/pick',
    origin: local.origin,
    body: { kind: 'file' },
  });
  assert.equal(picked.status, 200);
  assert.deepEqual(picked.body, { path: '/tmp/a.png', paths: ['/tmp/a.png', '/tmp/b.mp4'] });

  const invalid = await createLocalFileRoutes({
    picker: async () => ({ path: null, paths: [] }),
  }).tryHandle('POST', '/omnimux-workflow/api/pick', {
    method: 'POST',
    url: '/omnimux-workflow/api/pick',
    origin: local.origin,
    body: { kind: 'folder' },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'picker-invalid-kind');

  const unsupported = await createLocalFileRoutes({
    picker: async () => {
      throw new PickerError('picker-unsupported', 'native picker not supported on linux');
    },
  }).tryHandle('POST', '/omnimux-workflow/api/pick', {
    method: 'POST',
    url: '/omnimux-workflow/api/pick',
    origin: local.origin,
    body: { kind: 'file' },
  });
  assert.equal(unsupported.status, 501);
  assert.equal(unsupported.body.error, 'picker-unsupported');
});

test('GET /api/local-file：存在 200、缺文件 404、目录拒绝、非白名单、NUL/相对路径、跨域 403', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wf-local-file-'));
  const png = join(dir, 'hero.png');
  const pdf = join(dir, 'notes.pdf');
  writeFileSync(png, 'PNG');
  writeFileSync(pdf, 'PDF');
  const routes = createLocalFileRoutes({ picker: async () => ({ path: null, paths: [] }) });

  const ok = await routes.tryHandle('GET', '/omnimux-workflow/api/local-file', getReq(png));
  assert.equal(ok.status, 200);
  assert.equal(ok.file, realpathSync(png));

  const missing = await routes.tryHandle(
    'GET',
    '/omnimux-workflow/api/local-file',
    getReq(join(dir, 'gone.png')),
  );
  assert.equal(missing.status, 404);

  const relative = await routes.tryHandle('GET', '/omnimux-workflow/api/local-file', getReq('hero.png'));
  assert.equal(relative.status, 400);

  const nulPath = await routes.tryHandle(
    'GET',
    '/omnimux-workflow/api/local-file',
    getReq(`/tmp/a\0.png`),
  );
  assert.equal(nulPath.status, 400);

  const folder = await routes.tryHandle('GET', '/omnimux-workflow/api/local-file', getReq(dir));
  assert.equal(folder.status, 400);

  const deniedType = await routes.tryHandle('GET', '/omnimux-workflow/api/local-file', getReq(pdf));
  assert.equal(deniedType.status, 415);

  const remote = await routes.tryHandle('GET', '/omnimux-workflow/api/local-file', {
    ...getReq(png),
    origin: 'https://evil.example',
  });
  assert.equal(remote.status, 403);

  const noOrigin = await routes.tryHandle('GET', '/omnimux-workflow/api/local-file', {
    method: 'GET',
    url: `/omnimux-workflow/api/local-file?path=${encodeURIComponent(png)}`,
  });
  assert.equal(noOrigin.status, 200);

  rmSync(dir, { recursive: true, force: true });
});

test('POST /api/local-file/probe exists/missing，上限 64', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wf-probe-'));
  const png = join(dir, 'hero.png');
  writeFileSync(png, 'PNG');
  const routes = createLocalFileRoutes({ picker: async () => ({ path: null, paths: [] }) });
  const result = await routes.tryHandle('POST', '/omnimux-workflow/api/local-file/probe', {
    method: 'POST',
    url: '/omnimux-workflow/api/local-file/probe',
    origin: local.origin,
    body: { paths: [png, join(dir, 'gone.mp4')] },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.items[0].exists, true);
  assert.equal(result.body.items[0].path, png);
  assert.equal(result.body.items[0].name, 'hero.png');
  assert.equal(result.body.items[1].exists, false);

  const overflow = Array.from({ length: 80 }, (_, i) => `${png}-${i}`);
  const capped = await routes.tryHandle('POST', '/omnimux-workflow/api/local-file/probe', {
    method: 'POST',
    url: '/omnimux-workflow/api/local-file/probe',
    origin: local.origin,
    body: { paths: overflow },
  });
  assert.equal(capped.status, 200);
  assert.equal(capped.body.items.length, 64);
  rmSync(dir, { recursive: true, force: true });
});

test('POST /api/browse-directory lists one layer of folders and refuses files', async () => {
  const dir = mkdtempSync(join(homedir(), 'wf-browse-'));
  mkdirSync(join(dir, 'alpha'));
  mkdirSync(join(dir, 'beta'));
  writeFileSync(join(dir, 'note.txt'), 'x');
  const routes = createLocalFileRoutes({ picker: async () => ({ path: null, paths: [] }) });
  const listed = await routes.tryHandle('POST', '/omnimux-workflow/api/browse-directory', {
    method: 'POST',
    url: '/omnimux-workflow/api/browse-directory',
    origin: local.origin,
    body: { path: dir },
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.path, realpathSync(dir));
  assert.deepEqual(listed.body.entries.map((row) => row.name).sort(), ['alpha', 'beta']);
  const asFile = await routes.tryHandle('POST', '/omnimux-workflow/api/browse-directory', {
    method: 'POST',
    url: '/omnimux-workflow/api/browse-directory',
    origin: local.origin,
    body: { path: join(dir, 'note.txt') },
  });
  assert.equal(asFile.status, 400);
  assert.equal(asFile.body.error, 'not-directory');
  const missing = await routes.tryHandle('POST', '/omnimux-workflow/api/browse-directory', {
    method: 'POST',
    url: '/omnimux-workflow/api/browse-directory',
    origin: local.origin,
    body: { path: join(dir, 'nope') },
  });
  assert.equal(missing.status, 404);
  const outside = await routes.tryHandle('POST', '/omnimux-workflow/api/browse-directory', {
    method: 'POST',
    url: '/omnimux-workflow/api/browse-directory',
    origin: local.origin,
    body: { path: tmpdir() },
  });
  assert.equal(outside.status, 403);
  rmSync(dir, { recursive: true, force: true });
});

test('GET /api/local-file 不把文件 copy 进 mediaDir（只返回 file 路径）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wf-local-no-copy-'));
  mkdirSync(join(dir, 'media'));
  const png = join(dir, 'hero.png');
  writeFileSync(png, 'PNG');
  const routes = createLocalFileRoutes({ picker: async () => ({ path: null, paths: [] }) });
  const ok = await routes.tryHandle('GET', '/omnimux-workflow/api/local-file', getReq(png));
  assert.equal(ok.file, realpathSync(png));
  assert.equal(String(ok.file).includes(`${dir}/media/`), false);
  rmSync(dir, { recursive: true, force: true });
});
