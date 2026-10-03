/**
 * Issue #3045 首尾帧双槽常驻契约测试：
 * 验证在首尾帧模式下，仅填首帧时 slotPlan 保持双槽不被降级吞槽；
 * 仅在提交阶段根据实际填入的素材进行降级处理。
 * 规格：specs/3045-flf-slot-keep.spec.md
 * 浏览器证据：.agent-reports/issue-3045/first-filled-tail-slot-kept.png
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveAdaptiveOperation,
  slotPlan,
} from './media-slot.js';

const mockVideoModelWithFlf = {
  id: 'minimax-video',
  raw: {
    operations: [
      {
        id: 'text_to_video',
        label: '文生视频',
        output: { type: 'video' },
        inputs: [{ slot: 'prompt', type: 'text', role: 'prompt' }],
      },
      {
        id: 'first_frame',
        label: '首帧',
        output: { type: 'video' },
        inputs: [
          { slot: 'prompt', type: 'text', role: 'prompt' },
          { slot: 'first_frame', type: 'image', role: 'first_frame', max: 1 },
        ],
      },
      {
        id: 'first_last_frame',
        label: '首尾帧',
        output: { type: 'video' },
        inputs: [
          { slot: 'prompt', type: 'text', role: 'prompt' },
          { slot: 'first_frame', type: 'image', role: 'first_frame', max: 1 },
          { slot: 'last_frame', type: 'image', role: 'last_frame', max: 1 },
        ],
      },
    ],
  },
};

describe('Issue #3045: 首尾帧双卡槽常驻机制', () => {
  it('在无 hintOpId 时保持既有自适应行为：仅首帧 -> first_frame', () => {
    const op = deriveAdaptiveOperation(mockVideoModelWithFlf, 'video', {
      firstFrame: { id: 'ff', name: 'first.png' },
    });
    assert.equal(op?.id, 'first_frame');
  });

  it('在 hintOpId 为 first_last_frame 时：仅首帧依然返回 first_last_frame（保持尾帧槽显示）', () => {
    const op = deriveAdaptiveOperation(
      mockVideoModelWithFlf,
      'video',
      {
        firstFrame: { id: 'ff', name: 'first.png' },
      },
      'first_last_frame'
    );
    assert.equal(op?.id, 'first_last_frame');

    // 验证 slotPlan 双卡槽常驻
    const slots = slotPlan(mockVideoModelWithFlf, 'video', op?.id);
    assert.equal(slots.length, 2);
    assert.deepEqual(slots.map((s) => s.role), ['first_frame', 'last_frame']);
  });

  it('首尾帧齐备时正常返回 first_last_frame', () => {
    const op = deriveAdaptiveOperation(
      mockVideoModelWithFlf,
      'video',
      {
        firstFrame: { id: 'ff', name: 'first.png' },
        lastFrame: { id: 'lf', name: 'last.png' },
      },
      'first_last_frame'
    );
    assert.equal(op?.id, 'first_last_frame');
  });
});
