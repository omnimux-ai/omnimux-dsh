/**
 * paramSchemaFilter 单测（T04）：白名单 ∩ schema 投影、四层结构、写入硬闸。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertVideoParamWriteKey,
  filterWrite,
  projectParamControl,
  resolveParamControlPolicy,
  schemaSupportsParam,
  visibleKeys,
} from './paramSchemaFilter.ts';
import { DEFAULT_PARAM_CONTROL_POLICY } from './paramControlTable.ts';

const fullSchema = {
  aspectRatio: { options: [{ value: '16:9', label: '16:9' }], defaultValue: '16:9' },
  resolution: { options: [{ value: '1080p', label: '1080P' }], defaultValue: '1080p' },
  duration: { options: [{ value: 5, label: '5s' }], defaultValue: 5 },
  sound: { supported: true, defaultValue: false },
  seed: { type: 'integer' },
  watermark: { supported: true, defaultValue: false },
  nsfwCheck: { supported: true, defaultValue: true },
  webSearch: { supported: false, defaultValue: false },
  outputFormat: { options: [{ value: 'mp4', label: 'MP4' }], defaultValue: 'mp4' },
};

describe('paramSchemaFilter - 声明式参数过滤 (T04)', () => {
  it('未知 operation 回落默认策略', () => {
    assert.equal(resolveParamControlPolicy('not_listed'), DEFAULT_PARAM_CONTROL_POLICY);
    assert.equal(resolveParamControlPolicy(undefined), DEFAULT_PARAM_CONTROL_POLICY);
  });

  it('trigger 严格四段；schema 不支持的分辨率被投影剔除', () => {
    const projected = projectParamControl({ operationId: 'text_to_video', schema: fullSchema, operationCount: 3 });
    assert.deepEqual(projected.trigger, ['operation', 'aspectRatio', 'resolution', 'duration']);

    const noResolution = projectParamControl({
      operationId: 'text_to_video',
      schema: { ...fullSchema, resolution: undefined },
      operationCount: 3,
    });
    assert.deepEqual(noResolution.trigger, ['operation', 'aspectRatio', 'duration']);
  });

  it('单 operation 时 mode 段不可见（不留悬空分隔符）', () => {
    const projected = projectParamControl({ operationId: 'text_to_video', schema: fullSchema, operationCount: 1 });
    assert.equal(projected.trigger.includes('operation'), false);
    assert.equal(projected.popover.includes('operation'), false);
  });

  it('popover = trigger + sound（sound 需 schema 支持）', () => {
    const projected = projectParamControl({ operationId: 'first_last_frame', schema: fullSchema, operationCount: 2 });
    assert.deepEqual(projected.popover, ['operation', 'aspectRatio', 'resolution', 'duration', 'sound']);

    const silent = projectParamControl({
      operationId: 'first_last_frame',
      schema: { ...fullSchema, sound: { supported: false, defaultValue: false } },
      operationCount: 2,
    });
    assert.equal(silent.popover.includes('sound'), false);
  });

  it('advanced 只留 schema 实际支持的高级项（webSearch 声明不支持即隐藏）', () => {
    const advanced = visibleKeys('advanced', { operationId: 'text_to_video', schema: fullSchema });
    assert.ok(advanced.includes('seed'));
    assert.ok(advanced.includes('watermark'));
    assert.ok(advanced.includes('nsfwCheck'));
    assert.ok(!advanced.includes('webSearch'), 'schema.supported=false → 高级项也隐藏');
    assert.ok(!advanced.includes('generationType'), '无 options → 隐藏');
  });

  it('hidden 永不进入任何可见层', () => {
    const projected = projectParamControl({ operationId: 'digital_human', schema: fullSchema, operationCount: 2 });
    assert.ok(projected.hidden.includes('generationMode'));
    for (const layer of ['trigger', 'popover', 'advanced']) {
      assert.ok(!projected[layer].includes('generationMode'));
    }
  });

  it('assertVideoParamWriteKey：白名单键放行，hidden / 非白名单抛错', () => {
    assert.doesNotThrow(() => assertVideoParamWriteKey('sound', 'text_to_video'));
    assert.throws(() => assertVideoParamWriteKey('generationMode', 'text_to_video'), /hidden/);
    assert.throws(() => assertVideoParamWriteKey('fooBar', 'text_to_video'), /allowlist/);
  });

  it('filterWrite：剥离 hidden 与非白名单键，保留合法写入', () => {
    const out = filterWrite({ sound: true, generationMode: 'x', hacker: 1, duration: 8 }, 'text_to_video');
    assert.deepEqual(out, { sound: true, duration: 8 });
  });

  it('无 schema 时仅 operation 可见（operationCount≥2）', () => {
    const projected = projectParamControl({ operationId: 'text_to_video', schema: null, operationCount: 2 });
    assert.deepEqual(projected.trigger, ['operation']);
    assert.deepEqual(projected.popover, ['operation']);
    assert.deepEqual(projected.advanced, []);
  });
});
