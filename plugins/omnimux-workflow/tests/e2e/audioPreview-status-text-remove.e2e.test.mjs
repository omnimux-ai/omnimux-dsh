import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const previewPath = join(here, '../../src/canvas/editor/components/MaterialNode/AudioPreview.tsx');
const cssPath = join(here, '../../src/canvas/theme/components.css');

const previewSrc = readFileSync(previewPath, 'utf8');
const cssSrc = readFileSync(cssPath, 'utf8');

test('E2E: 音频卡片底部控制栏内联文本提示元素移除契约 (Issue #3081)', () => {
  // 1. 结构与语义契约：下载按钮为纯图标按钮，不包含内嵌文本标签破坏纯图标对齐
  assert.doesNotMatch(
    previewSrc,
    /<span className="wf-audio__btn-text">/,
    '下载按钮不得包含内嵌文本标签，保持纯图标极简动作对齐',
  );

  // 2. 状态提示元素在视觉上必须隐藏，不得以可见文本撑大右侧动作区
  assert.match(
    cssSrc,
    /\.wf-audio__status\s*span\s*\{\s*display:\s*none;?\s*\}/,
    '状态提示文本必须通过 display: none 彻底从布局流中隐藏，防止撑大右侧并挤压居中播放按钮',
  );

  // 3. 控制栏三段式平衡：居中实心大播放按钮与左右两侧布局结构健全
  assert.match(
    cssSrc,
    /\.wf-audio__transport\s*\{[^}]*justify-content:\s*space-between;/,
    '控制栏必须维持 space-between 三段式平衡布局',
  );
  assert.match(
    cssSrc,
    /\.wf-audio__play\s*\{[^}]*width:\s*38px;/,
    '核心播放按钮必须具备固定几何尺寸，禁止被外部文本挤压形变',
  );
});
