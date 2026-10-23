/**
 * 中间帧预览链路行为测试（Issue #3625 工作流 3）。
 *
 * 断言的是**行为契约**，不是实现复述：
 * 1. 节点数据线字段名被常量钉住（控制器写入 / 组件读取共用同一契约）；
 * 2. 真实进度能落成节点数据补丁，且缺数据时**不写**（不伪造 0 / 空串）；
 * 3. 终态清理补丁确实清空中间帧字段（「完成后不被中间帧覆盖」的数据层保证）；
 * 4. 渲染闸门只在生成中放行，完成/失败一律拒绝（即使帧地址还在）；
 * 5. 写入与读取对同一份节点数据互洽。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXECUTION_PREVIEW_URL_FIELD,
  EXECUTION_PROGRESS_FIELD,
  EXECUTION_PROGRESS_MESSAGE_FIELD,
  buildNodeProgressPatch,
  hasLiveProgress,
  normalizeProgressValue,
  progressClearPatch,
  readNodeExecutionProgress,
  shouldRenderIntermediateFrame,
} from './intermediateFrame.ts';

const hasKey = (target, key) => Object.keys(target).includes(key);

test('节点数据线字段名被常量钉住（控制器与组件共用同一契约）', () => {
  assert.equal(EXECUTION_PROGRESS_FIELD, 'executionProgress');
  assert.equal(EXECUTION_PROGRESS_MESSAGE_FIELD, 'executionProgressMessage');
  assert.equal(EXECUTION_PREVIEW_URL_FIELD, 'executionPreviewUrl');
});

test('真实 node_progress payload（progress + message）落成节点数据补丁', () => {
  // 与 ExecutionContext.reportProgress 的实际 payload 同形。
  const patch = buildNodeProgressPatch({ progress: 40, message: '生成中…' });
  assert.deepEqual(patch, {
    executionProgress: 40,
    executionProgressMessage: '生成中…',
  });
  // 上游不下发帧时，补丁里不得出现任何帧字段。
  assert.equal(hasKey(patch, 'executionPreviewUrl'), false);
});

test('无有效字段的进度事件不产生写入（避免空 patch 触发画布脏标记）', () => {
  assert.equal(buildNodeProgressPatch(undefined), null);
  assert.equal(buildNodeProgressPatch({}), null);
  assert.equal(buildNodeProgressPatch({ progress: '40', message: '   ' }), null);
  assert.equal(buildNodeProgressPatch({ progress: Number.NaN, message: null }), null);
});

test('进度值只接受有限数字并夹到 [0,100]，非法值不补 0', () => {
  assert.equal(normalizeProgressValue(150), 100);
  assert.equal(normalizeProgressValue(-20), 0);
  assert.equal(normalizeProgressValue(40.6), 41);
  assert.equal(normalizeProgressValue(0), 0);
  assert.equal(normalizeProgressValue('40'), undefined);
  assert.equal(normalizeProgressValue(Number.NaN), undefined);
  assert.equal(normalizeProgressValue(Number.POSITIVE_INFINITY), undefined);
  assert.equal(normalizeProgressValue(null), undefined);
  assert.equal(normalizeProgressValue(undefined), undefined);

  // 非法进度不得变成 0：字段直接缺席。
  const patch = buildNodeProgressPatch({ progress: '80', message: '生成中…' });
  assert.deepEqual(patch, { executionProgressMessage: '生成中…' });
});

test('帧字段防御式读取：有则写、无则完全不出现该键', () => {
  const withFrame = buildNodeProgressPatch({ progress: 10, previewUrl: '  blob:frame-1  ' });
  assert.equal(withFrame.executionPreviewUrl, 'blob:frame-1');

  const withAlias = buildNodeProgressPatch({ frameUrl: 'blob:frame-2' });
  assert.equal(withAlias.executionPreviewUrl, 'blob:frame-2');

  const withoutFrame = buildNodeProgressPatch({ progress: 10 });
  assert.equal(hasKey(withoutFrame, 'executionPreviewUrl'), false);
});

test('终态清理补丁清空进度与中间帧字段（完成/失败/取消共用）', () => {
  const clear = progressClearPatch();
  assert.equal(hasKey(clear, 'executionProgress'), true);
  assert.equal(hasKey(clear, 'executionProgressMessage'), true);
  assert.equal(hasKey(clear, 'executionPreviewUrl'), true);
  assert.equal(clear.executionProgress, undefined);
  assert.equal(clear.executionProgressMessage, undefined);
  assert.equal(clear.executionPreviewUrl, undefined);
  // 每次调用返回独立对象，避免调用方互相污染。
  assert.notEqual(progressClearPatch(), clear);
});

test('渲染闸门：仅生成中 + 有真实帧才渲染', () => {
  assert.equal(shouldRenderIntermediateFrame({ isLoading: true, hasFrame: true }), true);
  // 生成中但上游没有帧 → 不渲染帧层（走真实进度骨架）。
  assert.equal(shouldRenderIntermediateFrame({ isLoading: true, hasFrame: false }), false);
  // 完成态：即使帧地址还没被清掉，也绝不渲染中间帧——这是「不覆盖最终产物」的关键。
  assert.equal(
    shouldRenderIntermediateFrame({ isLoading: false, hasFrame: true, isTerminal: true }),
    false,
  );
  assert.equal(shouldRenderIntermediateFrame({ isLoading: false, hasFrame: true }), false);
  assert.equal(shouldRenderIntermediateFrame({ isLoading: false, hasFrame: false }), false);
});

test('生成中无真实进度时不渲染空进度行', () => {
  assert.equal(hasLiveProgress(40, ''), true);
  assert.equal(hasLiveProgress(undefined, '生成中…'), true);
  assert.equal(hasLiveProgress(undefined, '   '), false);
  assert.equal(hasLiveProgress(undefined, undefined), false);
  assert.equal(hasLiveProgress('40', null), false);
});

test('写入与读取互洽：补丁 → 节点数据 → 进度视图', () => {
  const nodeData = { label: '图片节点' };
  Object.assign(nodeData, buildNodeProgressPatch({ progress: 62, message: '生成中…', previewUrl: 'blob:f' }));

  assert.deepEqual(readNodeExecutionProgress(nodeData), {
    progress: 62,
    progressMessage: '生成中…',
    previewUrl: 'blob:f',
  });

  // 终态清理后，同一读取路径不再给出任何进度/帧。
  Object.assign(nodeData, progressClearPatch());
  assert.deepEqual(readNodeExecutionProgress(nodeData), {});

  // 字段完全缺失的节点（空节点/历史节点）同样安全。
  assert.deepEqual(readNodeExecutionProgress(undefined), {});
  assert.deepEqual(readNodeExecutionProgress({ label: '空节点' }), {});
});
