import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'GenerationStateContainer.tsx'), 'utf8');

test('GenerationStateContainer 源码中严禁无脑匹配 adapter openai-compatible 作为渠道维护', () => {
  // 不得出现 normalized.includes('adapter openai-compatible') => channelUnavailable
  assert.doesNotMatch(src, /normalized\.includes\(['"]adapter openai-compatible['"]\)/);
  assert.doesNotMatch(src, /errorMessage\.includes\(['"]adapter openai-compatible['"]\)/);
});

test('GenerationStateContainer 包含素材公网地址与格式报错的精准解析与提示', () => {
  assert.match(src, /error\.assetUrlMustBeHttp/);
  assert.match(src, /invalid format for image_urls/i);
  assert.match(src, /invalid format for video_urls/i);
  assert.match(src, /only http\/https/i);
});

test('GenerationStateContainer 正确解构嵌套 JSON error 并保留真实业务消息', () => {
  assert.match(src, /JSON\.parse/);
  assert.match(src, /cleanMsg/);
});
