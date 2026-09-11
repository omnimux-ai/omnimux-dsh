import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { buildSync } from 'esbuild';

const buildDir = mkdtempSync(join(tmpdir(), 'audio-extract-route-build-'));
const bundle = join(buildDir, 'runtime.mjs');
buildSync({
  stdin: {
    contents: `
      export { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
      export { createWorkflowDispatcher } from './canvasRoutes.ts';
    `,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundle,
});
const { createWorkspaceStore, createWorkflowDispatcher } =
  await import(pathToFileURL(bundle).href);
after(() => rmSync(buildDir, { recursive: true, force: true }));

function harness(t, opts = {}) {
  const root = mkdtempSync(join(tmpdir(), 'audio-extract-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = createWorkspaceStore({ workspacesDir: join(root, 'workspaces') });
  const workspace = store.create('音频提取测试工作区');

  const toolCalls = [];
  const videoProcessTool = {
    async execute(args) {
      toolCalls.push({ tool: 'video_process', args });
      if (opts.processExecute) return opts.processExecute(args);
      // 模拟默认正常生成音频文件
      if (args.dest) {
        mkdirSync(join(args.dest, '..'), { recursive: true });
        writeFileSync(args.dest, Buffer.from('FAKE_MP3_DATA'));
      }
      return {
        files: [{ path: args.dest, kind: 'audio', meta: { format: 'mp3' } }],
        result: { duration: 12.5 },
      };
    },
  };

  const dispatcher = createWorkflowDispatcher({
    store,
    mediaDir: join(root, 'media'),
    getTool: (name) => {
      if (name === 'video_process') {
        if (opts.noVideoProcess) return undefined;
        return videoProcessTool;
      }
      return undefined;
    },
    getSeam: (name) => {
      if (name === 'videoProcess') {
        if (opts.noVideoProcess) return undefined;
        return videoProcessTool;
      }
      return undefined;
    },
  });

  return { root, store, workspace, dispatcher, toolCalls };
}

test('audioExtract: 成功提取音频并返回可访问路径与媒体 URL', async (t) => {
  const { root, workspace, dispatcher, toolCalls } = harness(t);
  const videoFile = join(root, 'sample.mp4');
  writeFileSync(videoFile, 'FAKE_VIDEO_CONTENT');

  const res = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/workspaces/${workspace.id}/extract-audio`,
    origin: 'http://127.0.0.1:43120',
    body: {
      nodeId: 'node_v1',
      videoPath: videoFile,
      outputFormat: 'mp3',
      title: '精彩短视频 原声',
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.noAudioStream, false);
  assert.equal(res.body.data.title, '精彩短视频 原声');
  assert.equal(res.body.data.format, 'mp3');
  assert.equal(res.body.data.duration, 12.5);
  assert.ok(res.body.data.audioPath.endsWith('.mp3'));
  assert.ok(existsSync(res.body.data.audioPath));
  assert.ok(res.body.data.mediaUrl.includes('/omnimux-workflow/media/extracted-audio/'));

  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0].args.capability, 'audio_extract');
  assert.equal(toolCalls[0].args.input.videoUrl, videoFile);
});

test('audioExtract: 视频无音轨时返回 noAudioStream: true，不报错', async (t) => {
  const { root, workspace, dispatcher } = harness(t, {
    processExecute: async () => ({
      files: [],
      result: { no_audio_stream: true, duration: 0 },
    }),
  });
  const videoFile = join(root, 'mute.mp4');
  writeFileSync(videoFile, 'FAKE_VIDEO_CONTENT');

  const res = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/workspaces/${workspace.id}/extract-audio`,
    origin: 'http://127.0.0.1:43120',
    body: {
      nodeId: 'node_v1',
      videoPath: videoFile,
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.noAudioStream, true);
});

test('audioExtract: 拒绝非本地跨域写入 (not-local)', async (t) => {
  const { workspace, dispatcher } = harness(t);
  const res = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/workspaces/${workspace.id}/extract-audio`,
    origin: 'http://evil.com',
    body: { nodeId: 'v1', videoPath: '/any/path.mp4' },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'not-local');
});

test('audioExtract: 视频文件不存在返回 404 (video-not-found)', async (t) => {
  const { workspace, dispatcher } = harness(t);
  const res = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/workspaces/${workspace.id}/extract-audio`,
    origin: 'http://127.0.0.1:43120',
    body: { nodeId: 'v1', videoPath: '/non/existent/video.mp4' },
  });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'video-not-found');
});

test('audioExtract: 缺失视频服务返回 503 (service-unavailable)', async (t) => {
  const { root, workspace, dispatcher } = harness(t, { noVideoProcess: true });
  const videoFile = join(root, 'test.mp4');
  writeFileSync(videoFile, 'FAKE_VIDEO');

  const res = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/workspaces/${workspace.id}/extract-audio`,
    origin: 'http://127.0.0.1:43120',
    body: { nodeId: 'v1', videoPath: videoFile },
  });
  assert.equal(res.status, 503);
  assert.equal(res.body.error, 'service-unavailable');
});

test('audioExtract: 请求体格式不合法返回 400 (invalid-request)', async (t) => {
  const { workspace, dispatcher } = harness(t);
  const res = await dispatcher.dispatch({
    method: 'POST',
    url: `/omnimux-workflow/api/workspaces/${workspace.id}/extract-audio`,
    origin: 'http://127.0.0.1:43120',
    body: { nodeId: '', videoPath: '' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid-request');
});
