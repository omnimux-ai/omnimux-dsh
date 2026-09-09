import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioFileAction } from './audioFileAction.ts';
import { createProjectAssetsStore } from './workspace/ProjectAssetsStore.ts';
import { createProjectAssetsRoutes } from './routes/projectAssetsRoutes.ts';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wf-audio-qa-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  const workspacesDir = join(root, 'workspaces');
  mkdirSync(join(workspacesDir, 'ws_audio'), { recursive: true });
  writeFileSync(join(workspacesDir, 'ws_audio', 'canvas.json'), '{}');
  mkdirSync(join(project, 'assets'), { recursive: true });
  const wav = Buffer.alloc(44);
  wav.write('RIFF'); wav.write('WAVE', 8); wav.write('fmt ', 12);
  writeFileSync(join(project, 'assets/a.wav'), wav);
  writeFileSync(join(project, 'assets/b.wav'), wav);
  const store = createProjectAssetsStore({ workspacesDir, resolveProjectRoot: id => id === 'ws_audio' ? { path: project } : null });
  const calls = [];
  const deps = { platform: 'darwin', run: async (...args) => { calls.push(args); } };
  return { project, store, deps, calls };
}
const body = { action: 'open', relativePath: 'assets/a.wav' };

test('QA native actions serialize globally and release their lock after rejection', async t => {
  const f = fixture(t);
  let reject;
  const first = audioFileAction(f.store, 'ws_audio', body, { ...f.deps, run: () => new Promise((_resolve, fail) => { reject = fail; }) });
  await assert.rejects(audioFileAction(f.store, 'ws_audio', body, f.deps), { code: 'audio-action-busy', status: 409 });
  reject(new Error('native process failed'));
  await assert.rejects(first, { code: 'audio-action-failed', status: 500 });
  await audioFileAction(f.store, 'ws_audio', body, f.deps);
  assert.equal(f.calls.length, 1);
});

test('QA changed target between resolver calls refuses native launch', async t => {
  const f = fixture(t);
  let resolved = 0;
  const store = { resolveProjectFile: () => join(f.project, ++resolved === 1 ? 'assets/a.wav' : 'assets/b.wav') };
  await assert.rejects(audioFileAction(store, 'ws_audio', body, f.deps), { code: 'audio-file-changed', status: 409 });
  assert.equal(f.calls.length, 0);
});

test('QA in-project symlink resolves to the validated canonical project file', async t => {
  const f = fixture(t);
  symlinkSync(join(f.project, 'assets/a.wav'), join(f.project, 'assets/link.wav'));
  await audioFileAction(f.store, 'ws_audio', { action: 'reveal', relativePath: 'assets/link.wav' }, f.deps);
  assert.deepEqual(f.calls, [['/usr/bin/open', ['-R', '--', join(f.project, 'assets/a.wav')]]]);
});

test('QA malformed JSON and action payloads are rejected without resolving paths', async () => {
  let resolved = 0;
  const store = { resolveProjectFile() { resolved += 1; throw new Error('must not resolve'); } };
  const route = createProjectAssetsRoutes(store, { platform: 'darwin', run: async () => { throw new Error('must not launch'); } });
  const path = '/omnimux-workflow/api/workspaces/ws_audio/audio-file-action';
  for (const payload of [null, undefined, [], 'open', 1, true, {}, { action: 'delete', relativePath: 'a.wav' }, { action: 'open', relativePath: 1 }, { action: 'open', relativePath: 'a\0.wav' }]) {
    const result = await route.tryHandle('POST', path, { body: payload, url: path, origin: 'http://localhost' });
    assert.equal(result.status, 400);
  }
  assert.equal(resolved, 0);
});

test('QA route applies external-origin guard before malformed body or filesystem errors', async () => {
  let resolved = 0;
  const route = createProjectAssetsRoutes({ resolveProjectFile() { resolved += 1; throw new Error('not reachable'); } });
  const path = '/omnimux-workflow/api/workspaces/ws_audio/audio-file-action';
  for (const headers of [{ origin: 'null' }, { origin: 'https://localhost.evil.test' }, { origin: 'https://evil.test', secFetchSite: 'same-origin' }, { referer: 'https://evil.test/a' }, { secFetchSite: 'cross-site', origin: 'http://localhost' }]) {
    const result = await route.tryHandle('POST', path, { url: path, body: null, ...headers });
    assert.equal(result.status, 403);
  }
  assert.equal(resolved, 0);
});
