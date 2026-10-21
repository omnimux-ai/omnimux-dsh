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
import { createVideoDepthRoutes } from '../routes/videoDepthRoutes.ts';

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

  const withTried = mapVideoDepthExecutionError(
    Object.assign(new Error('cannot import'), {
      code: 'video-depth-deps-missing',
      hint: 'Install them',
      tried: ['python3.16', 'python3.15', 'python3.14'],
    }),
  );
  assert.equal(withTried.code, 'deps-missing');
  assert.match(withTried.message, /已尝试：python3\.16 \/ python3\.15 \/ python3\.14/);

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


test('service: 远程 http(s) 视频交给能力层下载，不按本地文件 404', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'video-depth-service-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { deps, calls } = makeDeps(root);
  deps.resolveVideoPath = () => 'https://example.com/clip.mp4';
  const result = await createVideoDepthService(deps)('ws_ok', {
    nodeId: 'n1',
    videoPath: 'https://example.com/clip.mp4',
    title: '远程视频 深度视频',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.videoUrl, 'https://example.com/clip.mp4');
  assert.ok(result.depthPath.endsWith('.mp4'));
});

const ROUTE_PATH = (workspaceId) => `/omnimux-workflow/api/workspaces/${workspaceId}/video-depth`;

function makeRoute(root, overrides = {}) {
  const { deps, calls } = makeDeps(root, overrides);
  return { handler: createVideoDepthRoutes(deps), calls };
}

test('route: 200 成功返回 depthPath/mediaUrl 并调用 video_depth', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'video-depth-route-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source.mp4');
  writeFileSync(source, 'FAKE_VIDEO');
  const { handler, calls } = makeRoute(root);

  const res = await handler.tryHandle('POST', ROUTE_PATH('ws_ok'), {
    origin: 'http://127.0.0.1:43120',
    body: { nodeId: 'n1', videoPath: source, title: '产品视频 深度视频' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.message, '深度视频生成成功');
  assert.ok(res.body.data.depthPath.endsWith('.mp4'));
  assert.ok(res.body.data.mediaUrl.includes('/omnimux-workflow/media/video-depth/ws_ok/'));
  assert.equal(calls[0].capability, 'video_depth');
});

test('route: 非本地来源 403 not-local，且不触达视频能力', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'video-depth-route-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source.mp4');
  writeFileSync(source, 'FAKE_VIDEO');
  const { handler, calls } = makeRoute(root);

  const res = await handler.tryHandle('POST', ROUTE_PATH('ws_ok'), {
    origin: 'http://evil.com',
    body: { nodeId: 'n1', videoPath: source },
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'not-local');
  assert.equal(calls.length, 0);
});

test('route: 缺 Python 依赖 503 deps-missing，响应带 upstream 明细', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'video-depth-route-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source.mp4');
  writeFileSync(source, 'FAKE_VIDEO');
  const { handler } = makeRoute(root, {
    processExecute: async () => {
      throw Object.assign(new Error('video_depth requires Python packages'), {
        code: 'video-depth-deps-missing',
        hint: 'Install them with `pip install onnxruntime opencv-python`',
      });
    },
  });

  const res = await handler.tryHandle('POST', ROUTE_PATH('ws_ok'), {
    origin: 'http://127.0.0.1:43120',
    body: { nodeId: 'n1', videoPath: source },
  });

  assert.equal(res.status, 503);
  assert.equal(res.body.error, 'deps-missing');
  assert.match(res.body.message, /onnxruntime/);
  assert.equal(res.body.upstream.code, 'video-depth-deps-missing');
});

test('route: 视频不存在 404 video-not-found', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'video-depth-route-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { handler } = makeRoute(root);

  const res = await handler.tryHandle('POST', ROUTE_PATH('ws_ok'), {
    origin: 'http://127.0.0.1:43120',
    body: { nodeId: 'n1', videoPath: join(root, 'missing.mp4') },
  });

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'video-not-found');
});

test('route: 请求体非法 400 invalid-request', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'video-depth-route-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { handler } = makeRoute(root);

  const res = await handler.tryHandle('POST', ROUTE_PATH('ws_ok'), {
    origin: 'http://127.0.0.1:43120',
    body: { nodeId: '', videoPath: '' },
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid-request');
});
