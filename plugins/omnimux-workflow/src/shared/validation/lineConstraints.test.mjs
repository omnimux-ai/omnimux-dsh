import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { narrowModelByLineConstraints } from './lineConstraints.ts';

/** 契约级的模型声明：这是「模型最宽集合」，不分线路。 */
function baseModel() {
  return {
    id: 'seedance-2-5',
    operations: [
      { id: 'text_to_video', listed: true, output: { type: 'video' }, inputs: [{ slot: 'prompt', type: 'text', min: 1, max: 1 }], parameters: {} },
      { id: 'first_frame', listed: true, output: { type: 'video' }, inputs: [{ slot: 'first_frame', type: 'image', min: 1, max: 1 }], parameters: {} },
      {
        id: 'video_multi_ref',
        listed: true,
        output: { type: 'video' },
        inputs: [
          { slot: 'prompt', type: 'text', min: 1, max: 1 },
          { slot: 'reference_images', type: 'image', role: 'reference', min: 0, max: 30 },
          { slot: 'reference_videos', type: 'video', role: 'reference', min: 0, max: 10 },
          { slot: 'reference_audios', type: 'audio', role: 'reference', min: 0, max: 10 },
        ],
        parameters: {},
      },
    ],
    parameters: {
      duration: { range: { min: 4, max: 30, step: 1 }, defaultValue: 5, allowAuto: true },
      resolution: { options: [{ value: '480p' }, { value: '720p' }, { value: '1080p' }], defaultValue: '720p' },
      aspectRatio: {
        options: [{ value: 'adaptive' }, { value: '16:9' }, { value: '4:3' }, { value: '1:1' }, { value: '3:4' }, { value: '9:16' }, { value: '21:9' }],
        defaultValue: 'adaptive',
      },
    },
  };
}

/** 特惠按次线的真实规格：9 图 / 全能参考 / 720p / 16:9 与 9:16 / 固定 30 秒，其他不支持。 */
const CHEAP_LINE = {
  operations: ['video_multi_ref'],
  parameters: {
    duration: { fixed: 30 },
    resolution: { only: ['720p'] },
    aspectRatio: { only: ['16:9', '9:16'] },
  },
  inputs: { image: { max: 9 }, video: { max: 0 }, audio: { max: 0 } },
};

describe('线路约束收窄（Issue #1818）', () => {
  it('把参考图收到线路上限，并去掉线路不接受的输入类型', () => {
    const narrowed = narrowModelByLineConstraints(baseModel(), 'seedance-2-5', CHEAP_LINE);
    const op = narrowed.operations.find((o) => o.id === 'video_multi_ref');

    const images = op.inputs.find((i) => i.slot === 'reference_images');
    assert.equal(images.max, 9, '参考图上限应收到 9');

    assert.equal(op.inputs.some((i) => i.type === 'video'), false, '不接受的视频槽必须整条移除');
    assert.equal(op.inputs.some((i) => i.type === 'audio'), false, '不接受的音频槽必须整条移除');
    assert.ok(op.inputs.some((i) => i.slot === 'prompt'), '文本槽保留');
  });

  it('只保留线路可用的生成方式', () => {
    const narrowed = narrowModelByLineConstraints(baseModel(), 'seedance-2-5', CHEAP_LINE);
    assert.deepEqual(narrowed.operations.map((o) => o.id), ['video_multi_ref']);
  });

  it('把参数收敛到线路允许的范围，且拒绝值仍不合法', () => {
    const narrowed = narrowModelByLineConstraints(baseModel(), 'seedance-2-5', CHEAP_LINE);

    assert.deepEqual(narrowed.parameters.resolution.options.map((o) => o.value), ['720p']);
    assert.deepEqual(narrowed.parameters.aspectRatio.options.map((o) => o.value), ['16:9', '9:16']);

    // 固定时长：只剩一个取值，且必须是该值
    const duration = narrowed.parameters.duration;
    assert.equal(duration.defaultValue, 30);
    assert.deepEqual(duration.options.map((o) => o.value), [30]);
    assert.equal(duration.range, undefined, '固定值不再保留范围');
  });

  it('空约束与未指定线路时不改变模型', () => {
    const model = baseModel();
    assert.deepEqual(narrowModelByLineConstraints(model, 'seedance-2-5', undefined), model);
    assert.deepEqual(narrowModelByLineConstraints(model, 'seedance-2-5', {}), model);
  });

  it('限定集只做收窄：契约没有的取值不会被引入', () => {
    const narrowed = narrowModelByLineConstraints(baseModel(), 'seedance-2-5', {
      parameters: { resolution: { only: ['720p', '4k'] } },
    });
    assert.deepEqual(narrowed.parameters.resolution.options.map((o) => o.value), ['720p'], '4k 不在契约里，不得凭空加入');
  });

  it('收窄结果为空集时放弃该约束，而不是产出无选项的参数', () => {
    const narrowed = narrowModelByLineConstraints(baseModel(), 'seedance-2-5', {
      parameters: { resolution: { only: ['4k'] } },
    });
    assert.deepEqual(narrowed.parameters.resolution.options.map((o) => o.value), ['480p', '720p', '1080p'], '无交集时保持契约原状');
  });

  it('不修改传入的模型对象', () => {
    const model = baseModel();
    const snapshot = JSON.stringify(model);
    narrowModelByLineConstraints(model, 'seedance-2-5', CHEAP_LINE);
    assert.equal(JSON.stringify(model), snapshot, '必须返回新对象，不得就地改写契约');
  });
});
