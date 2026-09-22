import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { orderAfterRemoval, rejectionOf, slotPlan } from './media-slot.js';

const imageModel = {
  id: 'grok-imagine-image-2-0',
  operations: [
    { id: 'text_to_image', output: { type: 'image' }, inputs: [{ type: 'text', role: 'prompt', max: 1 }] },
    {
      id: 'multi_reference',
      output: { type: 'image' },
      inputs: [
        { type: 'text', role: 'prompt', max: 1 },
        { slot: 'reference_images', type: 'image', role: 'reference', max: 4, allowedMimes: ['image/png', 'image/jpeg'] },
      ],
    },
  ],
};

const videoModel = {
  id: 'seedance-2-0-fast',
  operations: [
    { id: 'text_to_video', label: '文生视频', output: { type: 'video' }, inputs: [{ type: 'text', role: 'prompt' }] },
    {
      id: 'first_frame',
      output: { type: 'video' },
      inputs: [{ slot: 'first_frame', type: 'image', role: 'first_frame', max: 1 }],
    },
    {
      id: 'first_last_frame',
      output: { type: 'video' },
      inputs: [
        { slot: 'first_frame', type: 'image', role: 'first_frame', max: 1 },
        { slot: 'last_frame', type: 'image', role: 'last_frame', max: 1 },
      ],
    },
    {
      id: 'video_multi_ref',
      output: { type: 'video' },
      inputs: [
        { slot: 'reference_images', type: 'image', role: 'reference', max: 9 },
        { slot: 'reference_videos', type: 'video', role: 'reference', max: 3, totalMaxDurationSec: 15.2 },
        { slot: 'reference_audios', type: 'audio', role: 'reference', max: 3, totalMaxDurationSec: 15 },
      ],
    },
  ],
};

describe('素材卡槽槽位', () => {
  it('图像模型用带参考图的操作，上限来自契约', () => {
    const plan = slotPlan(imageModel, 'image');
    assert.equal(plan.length, 1);
    assert.equal(plan[0].type, 'image');
    assert.equal(plan[0].max, 4);
  });

  it('只有文生图的模型不显示卡槽', () => {
    assert.deepEqual(slotPlan({ operations: [imageModel.operations[0]] }, 'image'), []);
  });

  it('视频四种模式各自对应契约槽位', () => {
    assert.deepEqual(slotPlan(videoModel, 'video', 'text_to_video'), []);
    assert.deepEqual(slotPlan(videoModel, 'video', 'first_frame').map((slot) => slot.label), ['首帧']);
    assert.deepEqual(slotPlan(videoModel, 'video', 'first_last_frame').map((slot) => slot.label), ['首帧', '尾帧']);
    const ref = slotPlan(videoModel, 'video', 'video_multi_ref');
    assert.deepEqual(ref.map((slot) => slot.type), ['image', 'video', 'audio']);
    assert.deepEqual(ref.map((slot) => slot.max), [9, 3, 3]);
    assert.equal(ref[1].durationMax, 15.2);
  });

  it('选中的模式不在这个模型里时，退回它的第一个操作', () => {
    assert.deepEqual(slotPlan(videoModel, 'video', 'video_edit'), []);
  });

  it('读不到契约时不显示卡槽', () => {
    assert.deepEqual(slotPlan(null, 'image'), []);
    assert.deepEqual(slotPlan({ id: 'unknown' }, 'video', 'video_multi_ref'), []);
  });

  it('格式不符与超时长分别给出原因', () => {
    const videoSlot = slotPlan(videoModel, 'video', 'video_multi_ref')[1];
    assert.match(rejectionOf({ type: 'image/png' }, videoSlot), /视频/);
    assert.match(rejectionOf({ type: 'video/mp4' }, videoSlot, 18), /15\.2/);
    assert.equal(rejectionOf({ type: 'video/mp4' }, videoSlot, 10), '');
  });

  it('删除后右侧左移，左侧保持原位', () => {
    assert.deepEqual(orderAfterRemoval(['a', 'b', 'c', 'd'], 1), ['a', 'c', 'd']);
    assert.deepEqual(orderAfterRemoval(['a'], 0), []);
  });
});
