import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioFileAction, isAudioHeader } from './audioFileAction.ts';
import { createProjectAssetsStore } from './workspace/ProjectAssetsStore.ts';
import { createProjectAssetsRoutes } from './routes/projectAssetsRoutes.ts';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wf-audio-action-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  const workspacesDir = join(root, 'workspaces');
  mkdirSync(join(workspacesDir, 'ws_audio'), { recursive: true });
  writeFileSync(join(workspacesDir, 'ws_audio', 'canvas.json'), '{}');
  mkdirSync(join(project, 'assets'), { recursive: true });
  const wav = Buffer.alloc(44);
  wav.write('RIFF'); wav.write('WAVE', 8); wav.write('fmt ', 12);
  const relativePath = 'assets/音频 ; $(touch bad) -R.wav';
  writeFileSync(join(project, relativePath), wav);
  const store = createProjectAssetsStore({ workspacesDir, resolveProjectRoot: (id) => id === 'ws_audio' ? { path: project } : null });
  const calls = [];
  const deps = { platform: 'darwin', run: async (...args) => { calls.push(args); } };
  return { root, project, relativePath, store, calls, deps, wav };
}

test('open/reveal pass exact project filename as one argument without a shell', async (t) => {
  const f = fixture(t);
  await audioFileAction(f.store, 'ws_audio', { action: 'open', relativePath: f.relativePath }, f.deps);
  await audioFileAction(f.store, 'ws_audio', { action: 'reveal', relativePath: f.relativePath }, f.deps);
  assert.deepEqual(f.calls, [['/usr/bin/open', ['--', join(f.project, f.relativePath)]], ['/usr/bin/open', ['-R', '--', join(f.project, f.relativePath)]]]);
});

test('path traversal, absolute paths, URLs, directories and foreign workspace are rejected', async (t) => {
  const f = fixture(t);
  for (const relativePath of ['../outside.wav', join(f.project, f.relativePath), 'https://example.com/a.wav', 'assets', 'assets/missing.wav']) {
    await assert.rejects(audioFileAction(f.store, 'ws_audio', { action: 'open', relativePath }, f.deps));
  }
  await assert.rejects(audioFileAction(f.store, 'ws_other', { action: 'open', relativePath: f.relativePath }, f.deps));
  assert.equal(f.calls.length, 0);
});

test('symlink escaping project never launches a native application', async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'outside.wav'), f.wav);
  symlinkSync(join(f.root, 'outside.wav'), join(f.project, 'assets/escape.wav'));
  await assert.rejects(audioFileAction(f.store, 'ws_audio', { action: 'reveal', relativePath: 'assets/escape.wav' }, f.deps));
  assert.equal(f.calls.length, 0);
});

test('renamed scripts and non-audio extensions fail closed', async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.project, 'assets/fake.wav'), '#!/bin/sh\necho bad');
  writeFileSync(join(f.project, 'assets/fake.command'), f.wav);
  for (const relativePath of ['assets/fake.wav', 'assets/fake.command']) {
    await assert.rejects(audioFileAction(f.store, 'ws_audio', { action: 'open', relativePath }, f.deps), { code: 'unsupported-audio' });
  }
  assert.equal(f.calls.length, 0);
});

test('invalid actions, unsupported platforms and launch failures have explicit errors', async (t) => {
  const f = fixture(t);
  await assert.rejects(audioFileAction(f.store, 'ws_audio', { action: 'delete', relativePath: f.relativePath }, f.deps), { code: 'audio-action-invalid' });
  await assert.rejects(audioFileAction(f.store, 'ws_audio', { action: 'open', relativePath: f.relativePath }, { ...f.deps, platform: 'linux' }), { code: 'audio-action-unsupported' });
  await assert.rejects(audioFileAction(f.store, 'ws_audio', { action: 'open', relativePath: f.relativePath }, { ...f.deps, run: async () => { throw Error('failure'); } }), { code: 'audio-action-failed' });
});

test('route refuses cross-site requests and bad JSON before touching the filesystem', async (t) => {
  const f = fixture(t);
  const route = createProjectAssetsRoutes(f.store, f.deps);
  const path = '/omnimux-workflow/api/workspaces/ws_audio/audio-file-action';
  const req = { method: 'POST', url: path, body: { action: 'open', relativePath: f.relativePath } };
  for (const headers of [{ origin: 'https://evil.test' }, { secFetchSite: 'cross-site' }, { referer: 'https://evil.test/x' }]) {
    assert.equal((await route.tryHandle('POST', path, { ...req, ...headers })).status, 403);
  }
  assert.equal((await route.tryHandle('POST', path, { ...req, body: null })).status, 400);
  assert.equal((await route.tryHandle('GET', path, req)).status, 404);
  assert.equal(f.calls.length, 0);
  assert.equal((await route.tryHandle('POST', path, { ...req, origin: 'http://127.0.0.1:45120' })).status, 200);
  assert.equal(f.calls.length, 1);
});

test('signature validation distinguishes audio containers from video and HTML', () => {
  assert.equal(isAudioHeader('.mp3', Buffer.from('ID3\x04')), true);
  assert.equal(isAudioHeader('.flac', Buffer.from('fLaC')), true);
  assert.equal(isAudioHeader('.opus', Buffer.from('OggSxxxxOpusHead')), true);
  assert.equal(isAudioHeader('.ogg', Buffer.from('OggSxxxxvideo')), false);
  assert.equal(isAudioHeader('.m4a', Buffer.from('\0\0\0\0ftypM4A ')), true);
  assert.equal(isAudioHeader('.m4a', Buffer.from('\0\0\0\0ftypisom')), false);
  assert.equal(isAudioHeader('.mp3', Buffer.from('<html>')), false);
});
