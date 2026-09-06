import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { resolveExecutionMediaSource } from './executionMediaSource.ts';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'media-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const mediaDir = join(root, 'media');
  mkdirSync(mediaDir);
  const file = join(mediaDir, 'source.png');
  writeFileSync(file, 'fixture');
  return { root, file, mediaDir, workspaceId: 'ws_source' };
}

test('project-relative identity overrides stale absolute cache and resolves URL-only assets', (t) => {
  const options = fixture(t);
  const calls = [];
  options.resolveProjectFile = (workspaceId, relativePath) => {
    calls.push([workspaceId, relativePath]);
    return options.file;
  };
  assert.equal(resolveExecutionMediaSource({ relativePath: 'assets/image.png', path: '/stale/file' }, options), options.file);
  assert.equal(resolveExecutionMediaSource({ url: '/omnimux-workflow/api/workspaces/ws_source/file?rel=assets%2Fimage.png' }, options), options.file);
  assert.deepEqual(calls, [['ws_source', 'assets/image.png'], ['ws_source', 'assets/image.png']]);
});

test('unresolvable projects and missing project files never fall back to preview URL', (t) => {
  const options = fixture(t);
  const source = { relativePath: 'missing.png', url: '/omnimux-workflow/api/workspaces/ws_source/file?rel=missing.png' };
  assert.throws(() => resolveExecutionMediaSource(source, options), { code: 'project-required' });
  options.resolveProjectFile = () => { throw new Error('file unavailable'); };
  assert.throws(() => resolveExecutionMediaSource(source, options), /file unavailable/);
  assert.throws(() => resolveExecutionMediaSource({ url: '/omnimux-workflow/api/workspaces/ws_other/file?rel=a.png' }, options), { code: 'path-denied' });
});

test('local-file and plugin media URLs resolve to readable local files', (t) => {
  const options = fixture(t);
  for (const asset of [
    { path: options.file },
    { url: `/omnimux-workflow/api/local-file?path=${encodeURIComponent(options.file)}` },
    { url: '/omnimux-workflow/media/source.png' },
    { url: '/media/source.png' },
  ]) assert.equal(resolveExecutionMediaSource(asset, options), options.file);
  assert.throws(() => resolveExecutionMediaSource({ path: join(options.root, 'absent.png') }, options), { code: 'not-found' });
});

test('media traversal, symlink escape and unknown previews fail closed', (t) => {
  const options = fixture(t);
  const outside = join(options.root, 'outside.png');
  writeFileSync(outside, 'outside');
  symlinkSync(outside, join(options.mediaDir, 'escape.png'));
  for (const url of ['/media/../outside.png', '/media/%2e%2e/outside.png', '/media/escape.png']) {
    assert.throws(() => resolveExecutionMediaSource({ url }, options), { code: 'path-denied' });
  }
  for (const url of ['blob:preview', '/omnimux-workflow/not-a-file', '/unknown/preview']) {
    assert.throws(() => resolveExecutionMediaSource({ url }, options), { code: 'invalid-path' });
  }
});

test('remote URLs and media data remain consumable without local filesystem resolution', (t) => {
  const options = fixture(t);
  for (const url of ['https://example.test/a.png', 'data:image/png;base64,YQ==']) {
    assert.equal(resolveExecutionMediaSource({ url }, options), url);
  }
});
