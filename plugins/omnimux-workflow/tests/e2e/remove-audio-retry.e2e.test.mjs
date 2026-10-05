import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const previewPath = join(here, '../../src/canvas/editor/components/MaterialNode/AudioPreview.tsx');
const cardBodyPath = join(here, '../../src/canvas/editor/components/MaterialNode/CardBody/MediaCardBody.tsx');

const previewSrc = readFileSync(previewPath, 'utf8');
const cardBodySrc = readFileSync(cardBodyPath, 'utf8');

test('E2E: 彻底移除音频节点重试旋转图标契约 (Issue #3087)', () => {
  // 1. AudioPreview 组件中波形重试按钮完全移除，DOM 中不再包含 wf-audio__retry
  assert.equal(
    previewSrc.includes('wf-audio__retry'),
    false,
    'AudioPreview 组件源码中不得包含 wf-audio__retry 按钮',
  );

  // 2. MediaCardBody 中当 materialType === audio 时不传 onRetry 给 GenerationStateContainer
  assert.ok(
    cardBodySrc.includes("onRetry={materialType === 'audio' ? undefined : onRetry}"),
    '音频节点生成失败态不传递 onRetry，统一由右侧模型面板重新提交',
  );

  // 3. 核心播放/暂停按钮、保存按钮及替换按钮依然保留
  assert.ok(
    previewSrc.includes("title={t(playing ? 'audio.pause' : 'audio.play')}"),
    '核心播放/暂停按钮保留 title 悬停提示',
  );
  assert.ok(
    previewSrc.includes("title={t('audio.save')}"),
    '保存按钮保留 title 悬停提示',
  );
  assert.ok(
    previewSrc.includes("title={t('node.replace')}"),
    '素材替换按钮保留 title 悬停提示',
  );
});
