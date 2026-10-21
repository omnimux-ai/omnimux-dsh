import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { VideoDepthError, videoDepthFailure } from './errors.ts';
import { parseVideoDepthRequest } from './schema.ts';
import {
  createVideoDepthService,
  mapVideoDepthExecutionError,
} from './service.ts';

function makeStore(root) {
  return {
    workspacesDir: join(root, 'workspaces'),
    get(id) {
      if (id !== 'ws_ok') {
        throw Object.assign(new Error('workspace missing'), { code: 'workspace-not-found' });
      }
      return { id, name: '深度视频测试' };
    },
  };
}

function makeDeps(root, overrides = {}) {
  const calls = [];
  const videoProcess = {
    async execute(args) {
      calls.push(args);
      if (overrides.processExecute) return overrides.processExecute(args);
      mkdirSync(join(args.dest, '..'), { recursive: true });
      writeFileSync(args.dest, Buffer.from('FAKE_DEPTH_MP4'));
      return {
        mode: 'live',
        files: [{ path: args.dest, kind: 'video', meta: { model: 'depth-anything-v2-small' } }],
        result: { model: 'depth-anything-v2-small' },
      };
    },
  };
  const deps = {
    store: makeStore(root),
    mediaDir: join(root, 'media'),
    resolveVideoPath: (_workspaceId, videoPath) => videoPath,
    getSeam: (name) => (name === 'videoProcess' && !overrides.noVideoProcess ? videoProcess : undefined),
    getTool: () => undefined,
  };
  return { deps, calls };
}

test('parseVideoDepthRequest: 校验 nodeId / videoPath，title 缺省为 深度视频', () => {
  assert.throws(() => parseVideoDepthRequest(null), VideoDepthError);
  assert.throws(() => parseVideoDepthRequest({ nodeId: '', videoPath: '/a.mp4' }), VideoDepthError);
  assert.throws(() => parseVideoDepthRequest({ nodeId: 'n1', videoPath: '' }), VideoDepthError);
  assert.throws(() => parseVideoDepthRequest({ nodeId: 'n1', videoPath: '/a.mp4', title: 42 }), VideoDepthError);

  const parsed = parseVideoDepthRequest({ nodeId: ' n1 ', videoPath: ' /a.mp4 ' });
  assert.equal(parsed.nodeId, 'n1');
  assert.equal(parsed.videoPath, '/a.mp4');
  assert.equal(parsed.title, '深度视频');

  const titled = parseVideoDepthRequest({
    nodeId: 'n1',
    videoPath: '/a.mp4',
    title: '  产品视频 深度视频  ',
  });
  assert.equal(titled.title, '产品视频 深度视频');
});

test('mapVideoDepthExecutionError: 能力错误映射为可行动的路由码', () => {
  const deps = mapVideoDepthExecutionError(
    Object.assign(new Error('cannot import'), {
      code: 'video-depth-deps-missing',
      hint: 'Install them with `pip install onnxruntime opencv-python`',
    }),
  );
  assert.ok(deps instanceof VideoDepthError);
  assert.equal(deps.code, 'deps-missing');
  assert.equal(deps.status, 503);
  assert.match(deps.message, /onnxruntime/);
  assert.equal(deps.upstream.code, 'video-depth-deps-missing');
  assert.match(deps.upstream.detail, /pip install onnxruntime/);

  assert.equal(mapVideoDepthExecutionError(Object.assign(new Error('x'), { code: 'ffmpeg-missing' })).status, 503);
  assert.equal(mapVideoDepthExecutionError(Object.assign(new Error('x'), { code: 'video-timeout' })).status, 504);
  const unknown = mapVideoDepthExecutionError(new Error('boom'));
  assert.equal(unknown.code, 'depth-failed');
  assert.equal(unknown.status, 502);
});

test('videoDepthFailure: 错误体为 ok:false + 稳定 code，不泄露堆栈', () => {
  const failure = videoDepthFailure(new VideoDepthError('deps-missing', '缺少依赖', 503, {
    code: 'video-depth-deps-missing',
    detail: 'pip install onnxruntime',
  }));
  assert.equal(failure.status, 503);
  assert.equal(failure.body.ok, false);
  assert.equal(failure.body.error, 'deps-missing');
  assert.equal(failure.body.upstream.code, 'video-depth-deps-missing');
  assert.equal('stack' in failure.body, false);
});

test('service: 成功后返回落盘路径、媒体 URL，并以 video_depth 调用能力', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'video-depth-service-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source.mp4');
  writeFileSync(source, 'FAKE_VIDEO');
  const { deps, calls } = makeDeps(root);
  const generate = createVideoDepthService(deps);

  const result = await generate('ws_ok', { nodeId: 'n1', videoPath: source, title: '产品视频 深度视频' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].capability, 'video_depth');
  assert.deepEqual(calls[0].input, { videoUrl: source, keepAudio: true });
  assert.ok(result.depthPath.endsWith('.mp4'));
  assert.ok(existsSync(result.depthPath));
  assert.equal(result.mediaUrl, `/omnimux-workflow/media/video-depth/ws_ok/${result.depthPath.split('/').pop()}`);
  assert.ok(result.previewUrl.includes('/api/local-file?path='));
  assert.equal(result.title, '产品视频 深度视频');
});

test('service: 缺 Python 依赖时抛 deps-missing，源视频路径不变', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'video-depth-service-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source.mp4');
  writeFileSync(source, 'FAKE_VIDEO');
  const { deps } = makeDeps(root, {
    processExecute: async () => {
      throw Object.assign(new Error('video_depth requires Python packages'), {
        code: 'video-depth-deps-missing',
        hint: 'Install them with `pip install onnxruntime opencv-python`',
      });
    },
  });

  await assert.rejects(
    () => createVideoDepthService(deps)('ws_ok', { nodeId: 'n1', videoPath: source, title: '深度视频' }),
    (error) => {
      assert.ok(error instanceof VideoDepthError);
      assert.equal(error.code, 'deps-missing');
      assert.equal(error.status, 503);
      assert.equal(error.upstream.code, 'video-depth-deps-missing');
      return true;
    },
  );
});

test('service: 源视频不存在抛 video-not-found', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'video-depth-service-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { deps } = makeDeps(root);
  await assert.rejects(
    () => createVideoDepthService(deps)('ws_ok', {
      nodeId: 'n1',
      videoPath: join(root, 'no-such-video.mp4'),
      title: '深度视频',
    }),
    (error) => {
      assert.ok(error instanceof VideoDepthError);
      assert.equal(error.code, 'video-not-found');
      assert.equal(error.status, 404);
      return true;
    },
  );
});

test('service: 缺视频处理服务抛 service-unavailable', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'video-depth-service-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source.mp4');
  writeFileSync(source, 'FAKE_VIDEO');
  const { deps } = makeDeps(root, { noVideoProcess: true });
  await assert.rejects(
    () => createVideoDepthService(deps)('ws_ok', { nodeId: 'n1', videoPath: source, title: '深度视频' }),
    (error) => {
      assert.ok(error instanceof VideoDepthError);
      assert.equal(error.code, 'service-unavailable');
      assert.equal(error.status, 503);
      return true;
    },
  );
});

test('service: 执行未落盘时抛 depth-failed', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'video-depth-service-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source.mp4');
  writeFileSync(source, 'FAKE_VIDEO');
  const { deps } = makeDeps(root, { processExecute: async () => ({ mode: 'live', files: [] }) });
  await assert.rejects(
    () => createVideoDepthService(deps)('ws_ok', { nodeId: 'n1', videoPath: source, title: '深度视频' }),
    (error) => {
      assert.ok(error instanceof VideoDepthError);
      assert.equal(error.code, 'depth-failed');
      assert.equal(error.status, 502);
      return true;
    },
  );
});
