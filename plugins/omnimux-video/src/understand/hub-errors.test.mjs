import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VideoError } from '../errors.js';
import { mapHubError } from './hub-errors.js';

test('mapHubError: 码被替换时保留原始码', () => {
  const error = Object.assign(new Error('tool model only accepts text and image input'), {
    code: 'omnimux-invalid-request',
  });
  const mapped = mapHubError(error);
  assert.equal(mapped.code, 'video-invalid-input');
  assert.equal(mapped.upstreamCode, 'omnimux-invalid-request');
  // 文案必须原样保留，真因不能被替换掉
  assert.equal(mapped.message, 'tool model only accepts text and image input');
});

test('mapHubError: 不支持视频输入的分支同样保留原始码', () => {
  const mapped = mapHubError(
    Object.assign(new Error('model x does not accept video input'), { code: 'omnimux-invalid-request' }),
  );
  assert.equal(mapped.code, 'video-understand-unsupported');
  assert.equal(mapped.upstreamCode, 'omnimux-invalid-request');
});

test('mapHubError: unknown-model 保留原始码', () => {
  const mapped = mapHubError(Object.assign(new Error('not on whitelist'), { code: 'unknown-model' }));
  assert.equal(mapped.code, 'video-invalid-input');
  assert.equal(mapped.upstreamCode, 'unknown-model');
});

test('mapHubError: 码未替换时不带 upstreamCode', () => {
  const mapped = mapHubError(Object.assign(new Error('no channel'), { code: 'needs-provider' }));
  assert.equal(mapped.code, 'needs-provider');
  assert.equal(mapped.upstreamCode, undefined);
});

test('mapHubError: omnimux-unconfigured 归一为 needs-omnimux 并保留原始码', () => {
  const mapped = mapHubError(Object.assign(new Error('unconfigured'), { code: 'omnimux-unconfigured' }));
  assert.equal(mapped.code, 'needs-omnimux');
  assert.equal(mapped.upstreamCode, 'omnimux-unconfigured');
});

test('mapHubError: 兜底码替换同样保留原始码', () => {
  const mapped = mapHubError(Object.assign(new Error('odd failure'), { code: 'some-new-code' }));
  assert.equal(mapped.code, 'video-analyze-failed');
  assert.equal(mapped.upstreamCode, 'some-new-code');
});

test('mapHubError: 已是 VideoError 时原样返回，不叠加 upstreamCode', () => {
  const original = new VideoError('video-invalid-input', 'local check failed');
  const mapped = mapHubError(original);
  assert.equal(mapped, original);
  assert.equal(mapped.upstreamCode, undefined);
});
