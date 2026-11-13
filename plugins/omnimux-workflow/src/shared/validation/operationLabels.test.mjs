/**
 * Issue #4103 — operation 展示名解析规则。
 *
 * 覆盖 AC1/AC4/AC5/AC6/AC8：
 * - Catalog label 非空且 ≠ id → 用它（型号 YAML 的具体文案优先）；
 * - label 缺失或等于 id → 查已审校目录（zh/en）；
 * - 目录也没有 → 回落 id（不空白、不抛错）；
 * - 空 id → 空串（调用方隐藏该段）。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OPERATION_LABELS,
  resolveOperationLabel,
} from './operationLabels.ts';

test('#4103 label 非空且 ≠ id 时原样使用（型号 YAML 文案优先）', () => {
  assert.equal(
    resolveOperationLabel({ id: 'first_frame', label: '首帧生视频' }),
    '首帧生视频',
  );
});

test('#4103 label 等于 id（gateway-only 旧行为）时改用已审校目录', () => {
  assert.equal(resolveOperationLabel({ id: 'text_to_video', label: 'text_to_video' }), '文生视频');
  assert.equal(resolveOperationLabel({ id: 'first_last_frame', label: 'first_last_frame' }), '首尾帧过渡');
});

test('#4103 六个视频 operation 中英齐备，document/webpage 不再回落 id', () => {
  const videoOps = [
    'text_to_video',
    'first_frame',
    'first_last_frame',
    'video_multi_ref',
    'document_to_video',
    'webpage_to_video',
  ];
  assert.deepEqual(
    videoOps.map((id) => resolveOperationLabel({ id })),
    ['文生视频', '首帧驱动', '首尾帧过渡', '全能参考', '文档参考', '网页参考'],
  );
  assert.deepEqual(
    videoOps.map((id) => resolveOperationLabel({ id }, 'en')),
    [
      'Text to video',
      'First-frame driven',
      'First-last frame transition',
      'All-reference video',
      'Document to video',
      'Webpage to video',
    ],
  );
});

test('#4103 目录缺失时回落 id（不空白、不抛错）', () => {
  assert.equal(resolveOperationLabel({ id: 'brand_new_operation' }), 'brand_new_operation');
  assert.equal(resolveOperationLabel({ id: 'brand_new_operation', label: '' }), 'brand_new_operation');
  assert.equal(resolveOperationLabel({ id: 'brand_new_operation', label: 'brand_new_operation' }), 'brand_new_operation');
  assert.equal(resolveOperationLabel('brand_new_operation', 'en'), 'brand_new_operation');
});

test('#4103 空 id 返回空串，调用方据此隐藏该段', () => {
  assert.equal(resolveOperationLabel({ id: '' }), '');
  assert.equal(resolveOperationLabel({}), '');
  assert.equal(resolveOperationLabel(null), '');
  assert.equal(resolveOperationLabel(undefined, 'en'), '');
  // 只有 label、没有 id：仍可用 label（不因缺 id 丢文案）
  assert.equal(resolveOperationLabel({ label: '自定义模式' }), '自定义模式');
});

test('#4103 字典内每条都同时具备中英文案（无空值）', () => {
  for (const [id, entry] of Object.entries(OPERATION_LABELS)) {
    assert.equal(typeof entry.zh, 'string', `${id} 缺中文`);
    assert.equal(typeof entry.en, 'string', `${id} 缺英文`);
    assert.notEqual(entry.zh.trim(), '', `${id} 中文为空`);
    assert.notEqual(entry.en.trim(), '', `${id} 英文为空`);
    assert.notEqual(entry.zh, id, `${id} 中文不得等于 id`);
  }
});

test('#4103 中文目录名在 en locale 下切换成英文（不混语言）', () => {
  // matchToOption 先用默认 locale 解析成中文，SegmentControls/摘要条再按当前 locale 展示
  assert.equal(resolveOperationLabel({ id: 'text_to_video', label: '文生视频' }, 'en'), 'Text to video');
  assert.equal(resolveOperationLabel({ id: 'document_to_video', label: '文档参考' }, 'en'), 'Document to video');
  // 型号 YAML 的具体文案不是目录镜像，切语言也不改写
  assert.equal(resolveOperationLabel({ id: 'first_frame', label: '首帧生视频' }, 'en'), '首帧生视频');
  // zh 保持原样
  assert.equal(resolveOperationLabel({ id: 'text_to_video', label: '文生视频' }, 'zh'), '文生视频');
});
