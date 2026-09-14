import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findDeclaredParameterFailure } from './declaredParameterValidation.ts';

const modelParameters = {
  aspectRatio: { options: [{ value: '16:9' }, { value: '9:16' }], defaultValue: '16:9' },
  resolution: { options: [{ value: '720p' }, { value: '1080p' }], defaultValue: '720p' },
};

test('declared parameter validation rejects kept values outside operation/model contract', () => {
  assert.deepEqual(
    findDeclaredParameterFailure({ aspectRatio: 'auto', resolution: '480p' }, undefined, modelParameters),
    { field: 'aspectRatio', message: '参数“aspectRatio”不支持值 "auto"' },
  );
});

test('operation declarations override model declarations and preserve documented automatic duration', () => {
  assert.equal(
    findDeclaredParameterFailure(
      { duration: -1 },
      { duration: { options: [{ value: -1 }], defaultValue: -1, allowAuto: true } },
      { duration: { options: [{ value: 5 }], defaultValue: 5 } },
    ),
    null,
  );
});

// 真实契约片段：seedance-2-5 的 duration 同时声明范围（4~30 秒）与选项（-1 自适应）。
// 中枢 submit-guard 对二者取「或」——命中选项或落在范围内即合法；画布镜像必须同义，
// 否则除 -1 外任何时长（含契约默认值 5）都会被画布自己拒掉。
const seedance25Duration = {
  duration: {
    range: { min: 4, max: 30, step: 1 },
    defaultValue: 5,
    unit: 's',
    allowAuto: true,
    options: [{ value: -1, label: '自适应 (-1)' }],
  },
};

test('#1804 range and options are alternatives in the hub-guard mirror', () => {
  for (const accepted of [5, 4, 30, -1]) {
    assert.equal(
      findDeclaredParameterFailure({ duration: accepted }, undefined, seedance25Duration),
      null,
      `duration ${accepted} must be accepted, matching the hub submit guard`,
    );
  }
  for (const rejected of [3, 31]) {
    assert.deepEqual(
      findDeclaredParameterFailure({ duration: rejected }, undefined, seedance25Duration),
      { field: 'duration', message: `参数“duration”不支持值 ${rejected}` },
      `duration ${rejected} must stay rejected`,
    );
  }
});

test('#1804 a declaration with neither options nor range stays unconstrained', () => {
  assert.equal(
    findDeclaredParameterFailure({ seed: 42 }, undefined, { seed: { type: 'integer' } }),
    null,
  );
  assert.deepEqual(
    findDeclaredParameterFailure({ seed: 4.2 }, undefined, { seed: { type: 'integer' } }),
    { field: 'seed', message: '参数“seed”必须为整数' },
  );
});

test('#1804 an options-only declaration still enforces its whitelist', () => {
  const resolutionOnly = { resolution: { options: [{ value: '720p' }, { value: '1080p' }] } };
  assert.equal(findDeclaredParameterFailure({ resolution: '720p' }, undefined, resolutionOnly), null);
  assert.deepEqual(
    findDeclaredParameterFailure({ resolution: '480p' }, undefined, resolutionOnly),
    { field: 'resolution', message: '参数“resolution”不支持值 "480p"' },
  );
});
