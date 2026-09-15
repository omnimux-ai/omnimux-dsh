import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeVideoAnalyzeFailure } from './videoAnalyzeFailure.ts';

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
