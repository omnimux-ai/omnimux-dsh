import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cascadePath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/ModelCascadeMenu.tsx');
const cascadeSrc = readFileSync(cascadePath, 'utf8');

test('static: model cascade menu removes redundant "选择模型" section title in brand column', () => {
  // 1. 确认第一列品牌列表已不再包含 "选择模型" section title
  assert.doesNotMatch(cascadeSrc, /wf-loomi-section-title/, 'wf-loomi-section-title must be completely removed');
  assert.doesNotMatch(cascadeSrc, /<div[^>]*>\s*选择模型\s*<\/div>/, 'Title "选择模型" must not exist in brand column');

  // 2. 确认品牌与模型列的容器结构完整
  assert.match(cascadeSrc, /aria-label="选择品牌"/, 'Brand group container must be preserved');
  assert.match(cascadeSrc, /aria-label="选择模型版本"/, 'Model version group container must be preserved');
  assert.match(cascadeSrc, /aria-label="选择渠道策略"/, 'Channel strategy group container must be preserved');
});
