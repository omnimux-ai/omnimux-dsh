import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareVideoForAnalyze, ANALYZE_MAX_VIDEO_BYTES } from './prepareAnalyzeVideo.ts';

function fakeDeps(over = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'pv-'));
  return {
    store: { workspacesDir: tmp, get: () => ({}), resolveProjectRoot: () => null },
    mediaDir: tmp,
    ...over,
  };
}

test('small local file → null (no prepare needed)', async () => {
  const deps = fakeDeps();
  const small = join(deps.mediaDir, 'small.mp4');
  writeFileSync(small, Buffer.alloc(1024));
  const calls = [];
  deps.getSeam = () => ({ execute: async (a) => (calls.push(a), {}) });
  const out = await prepareVideoForAnalyze(deps, 'ws1', small);
  assert.equal(out, null);
  assert.equal(calls.length, 0);
});

test('oversized local file → prepare 产物路径被采纳', async () => {
  const deps = fakeDeps();
  const big = join(deps.mediaDir, 'big.mp4');
  writeFileSync(big, Buffer.alloc(ANALYZE_MAX_VIDEO_BYTES + 1));
  const prepared = join(deps.mediaDir, 'prepared.mp4');
  deps.getSeam = () => ({
    execute: async (args) => {
      assert.equal(args.capability, 'video_inline_analysis_prepare');
      assert.equal(args.input.videoUrl, big);
      writeFileSync(prepared, Buffer.alloc(4096));
      return { files: [{ path: prepared, kind: 'video', meta: { bytes: 4096 } }] };
    },
  });
  const out = await prepareVideoForAnalyze(deps, 'ws1', big);
  assert.equal(out, prepared);
});

test('remote URL → prepare 被调用并返回产物', async () => {
  const deps = fakeDeps();
  const prepared = join(deps.mediaDir, 'remote.mp4');
  deps.getSeam = () => ({
    execute: async (args) => {
      assert.equal(args.input.videoUrl, 'https://cdn.example.com/v.mp4');
      writeFileSync(prepared, Buffer.alloc(4096));
      return { files: [{ path: prepared, kind: 'video' }] };
    },
  });
  const out = await prepareVideoForAnalyze(deps, 'ws1', 'https://cdn.example.com/v.mp4');
  assert.equal(out, prepared);
});

test('prepare overshoot → null（回退原错误）', async () => {
  const deps = fakeDeps();
  deps.getSeam = () => ({
    execute: async () => ({ files: [{ path: '/x.mp4', kind: 'video', meta: { overshoot: true } }] }),
  });
  const out = await prepareVideoForAnalyze(deps, 'ws1', 'https://cdn.example.com/v.mp4');
  assert.equal(out, null);
});

test('videoProcess 不可用 → null', async () => {
  const deps = fakeDeps();
  const out = await prepareVideoForAnalyze(deps, 'ws1', 'https://cdn.example.com/v.mp4');
  assert.equal(out, null);
});
