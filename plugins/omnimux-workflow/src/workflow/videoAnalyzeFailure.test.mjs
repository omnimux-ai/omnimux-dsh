import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeVideoAnalyzeFailure } from './videoAnalyzeFailure.ts';
import { VideoDeconstructError, videoDeconstructFailure } from './videoDeconstruct/errors.ts';
import { VideoStoryboardError, videoStoryboardFailure } from './videoStoryboard/errors.ts';

test('videoAnalyzeFailure: 上游错误码映射为可读中文，未知错误收敛为通用失败', () => {
  const provider = describeVideoAnalyzeFailure(Object.assign(new Error('boom'), { code: 'needs-provider' }));
  assert.equal(provider.code, 'analyze-unavailable');
  assert.match(provider.message, /模型渠道/);

  const unsupported = describeVideoAnalyzeFailure(
    Object.assign(new Error('model does not accept video input'), { code: 'video-understand-unsupported' }),
  );
  assert.equal(unsupported.code, 'analyze-unsupported');
  assert.match(unsupported.message, /不支持视频输入/);

  const invalid = describeVideoAnalyzeFailure(Object.assign(new Error('too large'), { code: 'video-invalid-input' }));
  assert.equal(invalid.code, 'analyze-invalid-input');

  const unknown = describeVideoAnalyzeFailure(new Error('kaboom'));
  assert.equal(unknown.code, 'analyze-failed');
  assert.equal(unknown.message, '视频理解调用失败，请稍后重试');

  // 上游文本绝不外发：未知错误的原始 message 不得出现在用户可见文案里
  assert.equal(unknown.message.includes('kaboom'), false);
  assert.equal(describeVideoAnalyzeFailure(null).code, 'analyze-failed');
});

test('videoAnalyzeFailure: upstream 保留真实错误码与脱敏摘要', () => {
  const failure = describeVideoAnalyzeFailure(
    Object.assign(new Error("model 'gpt-x' does not accept video input"), { code: 'omnimux-invalid-request' }),
  );
  assert.equal(failure.upstream?.code, 'omnimux-invalid-request');
  assert.equal(failure.upstream?.detail, "model 'gpt-x' does not accept video input");
});

test('videoAnalyzeFailure: detail 剔除路径、URL 与密文', () => {
  const failure = describeVideoAnalyzeFailure(
    Object.assign(
      new Error('failed: /Users/x/secret/video.mp4 via https://api.example.com/v1 Bearer abcdef123456 sk-live-KEYDATA12345'),
      { code: 'video-invalid-input' },
    ),
  );
  const detail = failure.upstream?.detail ?? '';
  assert.equal(failure.code, 'analyze-invalid-input');
  assert.ok(!detail.includes('/Users/'), `path leaked: ${detail}`);
  assert.ok(!detail.includes('https://'), `url leaked: ${detail}`);
  assert.ok(!detail.includes('abcdef123456'), `bearer leaked: ${detail}`);
  assert.ok(!detail.includes('sk-live'), `key leaked: ${detail}`);
});

test('videoAnalyzeFailure: detail 超长截断且缺 message 时兜底空串', () => {
  const long = describeVideoAnalyzeFailure(Object.assign(new Error('x'.repeat(500)), { code: 'c' }));
  assert.ok((long.upstream?.detail ?? '').length <= 200);

  const noMsg = describeVideoAnalyzeFailure({ code: 'weird-code' });
  assert.equal(noMsg.upstream?.code, 'weird-code');
  assert.equal(noMsg.upstream?.detail, '');
});

test('videoAnalyzeFailure: 非对象错误无 upstream', () => {
  const failure = describeVideoAnalyzeFailure('plain string');
  assert.equal(failure.code, 'analyze-failed');
  assert.equal(failure.upstream, undefined);
});

test('videoDeconstructFailure: 带 upstream 的错误写入响应体', () => {
  const { body } = videoDeconstructFailure(
    new VideoDeconstructError('analyze-invalid-input', '视频文件不满足理解要求', 502, {
      code: 'omnimux-invalid-request',
      detail: 'tool model only accepts text and image input',
    }),
  );
  assert.equal(body.error, 'analyze-invalid-input');
  assert.deepEqual(body.upstream, {
    code: 'omnimux-invalid-request',
    detail: 'tool model only accepts text and image input',
  });
});

test('videoDeconstructFailure: 无 upstream 时字段缺省', () => {
  const { body } = videoDeconstructFailure(new VideoDeconstructError('workspace-not-found', '工作区不存在', 404));
  assert.equal('upstream' in body, false);
});

test('videoStoryboardFailure: 带 upstream 的错误写入响应体', () => {
  const { body } = videoStoryboardFailure(
    new VideoStoryboardError('analyze-invalid-input', '视频文件不满足理解要求', 502, {
      code: 'unknown-model',
      detail: "model 'x' is not on the enabled text whitelist",
    }),
  );
  assert.deepEqual(body.upstream, {
    code: 'unknown-model',
    detail: "model 'x' is not on the enabled text whitelist",
  });
});

test('videoStoryboardFailure: 非本类错误不带 upstream', () => {
  const { body } = videoStoryboardFailure(new Error('boom'));
  assert.equal('upstream' in body, false);
});

test('videoAnalyzeFailure: 码被上游替换时优先透传原始码', () => {
  // video 层把 omnimux-invalid-request 改写成 video-invalid-input，原始码挂在 upstreamCode
  const mapped = Object.assign(new Error('tool model only accepts text and image input'), {
    code: 'video-invalid-input',
    upstreamCode: 'omnimux-invalid-request',
  });
  const failure = describeVideoAnalyzeFailure(mapped);
  assert.equal(failure.code, 'analyze-invalid-input');
  assert.equal(failure.upstream?.code, 'omnimux-invalid-request');
  assert.equal(failure.upstream?.detail, 'tool model only accepts text and image input');
});

test('videoAnalyzeFailure: 无 upstreamCode 时退回自身码', () => {
  const failure = describeVideoAnalyzeFailure(
    Object.assign(new Error('file is too large'), { code: 'video-invalid-input' }),
  );
  assert.equal(failure.upstream?.code, 'video-invalid-input');
});
