import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { buildSync } from 'esbuild';

const buildDir = mkdtempSync(join(tmpdir(), 'video-extract-route-build-'));
const bundle = join(buildDir, 'runtime.mjs');
buildSync({
  stdin: {
    contents: `
      export { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
      export { createWorkflowDispatcher } from './canvasRoutes.ts';
      export { mountWorkflowHost } from '../index.ts';
    `,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundle,
});
const { createWorkspaceStore, createWorkflowDispatcher } = await import(pathToFileURL(bundle).href);
after(() => rmSync(buildDir, { recursive: true, force: true }));

function createMockFetcher(videoBytes = Buffer.from('fake mp4 video content')) {
  return async (url) => {
    return new Response(videoBytes, {
      status: 200,
      headers: { 'Content-Type': 'video/mp4' },
    });
  };
}

function harness(t, opts = {}) {
  const root = mkdtempSync(join(tmpdir(), 'video-extract-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = createWorkspaceStore({ workspacesDir: join(root, 'workspaces') });
  const workspace = store.create('社媒提取工作区');

  const toolCalls = [];
  const socialDataTool = {
    async execute(args) {
      toolCalls.push(args);
      if (opts.toolExecute) return opts.toolExecute(args);
      return {
        platform: args.platform,
        capability: args.capability,
        data: {
          title: '精彩短视频作品',
          video_url: 'https://cdn.example.com/video_123.mp4',
          cover_url: 'https://cdn.example.com/cover_123.jpg',
          duration: 15,
        },
      };
    },
  };

  const dispatcher = createWorkflowDispatcher({
    store,
    mediaDir: join(root, 'media'),
    libraryRoot: join(root, 'library'),
    executionManager: {},
    gateway: { capabilities: async () => ({}) },
    getTool: (name) => (name === 'omnimux_social_data' ? socialDataTool : undefined),
    fetcher: opts.fetcher ?? createMockFetcher(),
  });

  const url = `/omnimux-workflow/api/workspaces/${workspace.id}/extract-video`;
  const call = (body, extra = {}) =>
    dispatcher.dispatch({
      method: 'POST',
      url,
      body,
      origin: 'http://127.0.0.1:45120',
      ...extra,
    });

  return { call, toolCalls, store, workspace, url, root };
}

test('videoExtraction: 成功调用中枢 omnimux_social_data 提取视频并落盘为本地素材', async (t) => {
  const h = harness(t);
  const response = await h.call({
    nodeId: 'node_text_1',
    url: 'https://www.tiktok.com/@creator/video/71234567890',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.title, '精彩短视频作品');
  assert.match(response.body.mediaUrl, /^\/omnimux-workflow\/media\/videos\/video_.*\.mp4$/);
  assert.match(response.body.previewUrl, /^\/omnimux-workflow\/media\/videos\/video_.*\.mp4$/);
  assert.equal(response.body.duration, 15);
  assert.equal(h.toolCalls.length, 1);
  assert.equal(h.toolCalls[0].platform, 'tiktok');
  assert.equal(h.toolCalls[0].capability, 'video');
});

test('videoExtraction: 支持直链视频 URL 直接下载入库', async (t) => {
  const h = harness(t);
  const response = await h.call({
    nodeId: 'node_text_2',
    url: 'https://example.com/sample_footage.mp4',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.match(response.body.mediaUrl, /^\/omnimux-workflow\/media\/videos\/video_.*\.mp4$/);
});

test('videoExtraction: 参数校验阻断非法请求', async (t) => {
  const h = harness(t);

  // 空请求体
  let res = await h.call(null);
  assert.equal(res.status, 400);

  // 缺少 url
  res = await h.call({});
  assert.equal(res.status, 400);

  // 非 HTTP URL
  res = await h.call({ url: 'ftp://example.com/file' });
  assert.equal(res.status, 400);

  // 跨站写入保护
  res = await h.call({ url: 'https://www.tiktok.com/@a/video/1' }, { origin: 'https://evil.com' });
  assert.equal(res.status, 403);

  // 工作区不存在
  res = await h.call({ url: 'https://www.tiktok.com/@a/video/1' }, { url: h.url.replace(h.workspace.id, 'ws_missing') });
  assert.equal(res.status, 404);
});

test('videoExtraction: 未提取到有效视频直链时返回 422 失败提示', async (t) => {
  const h = harness(t, {
    toolExecute: async () => ({
      platform: 'tiktok',
      capability: 'video',
      data: { title: '无视频作品' }, // 无 video_url
    }),
    fetcher: async () => ({ ok: false, status: 404 }),
  });

  const response = await h.call({
    url: 'https://www.tiktok.com/@creator/video/999999999',
  });

  assert.equal(response.status, 422);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, 'no-video-found');
});
