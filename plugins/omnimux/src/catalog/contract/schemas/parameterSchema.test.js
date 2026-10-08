/**
 * Parameter domain (`parameters`) structural validation tests.
 * Covers model-level and operation-level wiring plus every emitted error code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARAMETER_ERROR_CODES,
  validateParameterDomain,
  validateModel,
  validateOperation,
} from '../schema.js';
import { ADMISSION_ERROR_CODES } from '../admission.js';
import { evaluateDeclaredParameters } from '../../../../lib/generation-core.js';
import { materializeVoiceOptions, readVoiceIndexSnapshot } from '../../voices/options.js';
import { loadAll, resetContractCache, DEFAULT_SPECS_DIR } from '../load.js';

/**
 * @param {object[]} issues
 * @returns {string[]}
 */
function codesOf(issues) {
  return issues.map((i) => i.code);
}

test('parameterSchema: real-world parameter shapes pass unchanged', () => {
  const parameters = {
    prompt: { minLength: 1, maxLength: 8000 },
    aspectRatio: {
      options: [
        { value: 'auto', label: '自适应' },
        { value: '1:1', label: '1:1' },
        { value: '16:9', label: '16:9' },
      ],
      defaultValue: '16:9',
      caseInsensitive: true,
    },
    duration: {
      options: [
        { value: 30, label: '30s' },
        { value: 60, label: '60s' },
      ],
      range: { min: 4, max: 30, step: 1 },
      defaultValue: 5,
      unit: 's',
      allowAuto: true,
    },
    resolution: { options: ['1K', '2K', '4K'], defaultValue: '2K', caseInsensitive: true },
    sound: { supported: true, defaultValue: true },
    watermark: { supported: false, defaultValue: false },
    seed: { type: 'integer', range: { min: 0, max: 2147483647, step: 1 } },
    voice: { optionsFrom: 'volcengine-voice-index', defaultValue: 'zh_female' },
    speed: { range: {}, defaultValue: 1.0 },
  };
  const issues = validateParameterDomain(parameters, 'parameters', 'model-a', 'video-models.yaml');
  assert.deepEqual(issues, []);
});

test('parameterSchema: registered raw source is structural only while materialized defaults remain strict', () => {
  const source = 'volcengine-voice-index'
  const valid = 'zh_male_guanggaojieshuo_uranus_bigtts'
  const raw = { voice: { optionsFrom: source, defaultValue: valid } }
  assert.deepEqual(validateParameterDomain(raw, 'parameters'), [])
  assert.equal(evaluateDeclaredParameters({}, raw).result.diagnostic, 'unresolved_options')
  const resolved = materializeVoiceOptions({ models: [{ parameters: raw }] }, readVoiceIndexSnapshot()).models[0].parameters
  assert.equal(Object.hasOwn(resolved.voice, 'optionsFrom'), false)
  assert.ok(resolved.voice.options.some((option) => option.value === valid))
  assert.deepEqual(validateParameterDomain(resolved, 'parameters'), [])
  assert.deepEqual(codesOf(validateParameterDomain({ voice: { ...resolved.voice, defaultValue: 'missing' } }, 'parameters')), ['parameter_default_unmatched'])
  assert.deepEqual(codesOf(validateParameterDomain({ voice: { ...resolved.voice, type: 'integer' } }, 'parameters')), ['parameter_default_unmatched'])
  assert.throws(() => materializeVoiceOptions({ models: [{ parameters: { voice: { optionsFrom: 'unregistered' } } }] }), /unregistered parameter optionsFrom/)
  assert.throws(() => materializeVoiceOptions({ models: [{ parameters: { voice: { optionsFrom: source, defaultValue: 'missing' } } }] }, readVoiceIndexSnapshot()), /voice defaultValue is not present/)
  for (const definition of [
    { options: [valid], defaultValue: 'missing' },
    { options: [valid], type: 'integer', defaultValue: valid },
    { optionsFrom: source, type: 'integer', defaultValue: 1.5 },
    { optionsFrom: source, type: 'future', defaultValue: valid },
    { optionsFrom: source, maxLength: 1, defaultValue: valid },
    { optionsFrom: source, range: { min: 0, max: 1 }, defaultValue: 2 },
    { optionsFrom: source, options: [valid], defaultValue: 'missing' },
    { optionsFrom: 'unregistered', defaultValue: valid },
    { optionsFrom: source, futureUiHint: true, defaultValue: valid },
  ]) assert.deepEqual(codesOf(validateParameterDomain({ voice: definition }, 'parameters')), ['parameter_default_unmatched'])
  assert.deepEqual(codesOf(validateParameterDomain({ voice: {
    optionsFrom: source, range: { step: 0 }, defaultValue: valid,
  } }, 'parameters')), ['parameter_step_invalid'])
})

test('parameterSchema: minLength > maxLength and non-positive bounds', () => {
  const inverted = validateParameterDomain({ prompt: { minLength: 10, maxLength: 5 } }, 'parameters');
  assert.equal(inverted.length, 1);
  assert.equal(inverted[0].code, 'parameter_length_bound_invalid');
  assert.equal(inverted[0].path, 'parameters.prompt');
  assert.equal(inverted[0].level, 'error');

  const nonPositive = validateParameterDomain({ prompt: { maxLength: 0 } }, 'parameters');
  assert.deepEqual(codesOf(nonPositive), ['parameter_length_bound_invalid']);
  assert.equal(nonPositive[0].path, 'parameters.prompt.maxLength');

  const fractional = validateParameterDomain({ prompt: { minLength: 1.5 } }, 'parameters');
  assert.deepEqual(codesOf(fractional), ['parameter_length_bound_invalid']);
});

test('parameterSchema: options non-empty, scalar-or-{value}, unique values', () => {
  const duplicated = validateParameterDomain(
    { resolution: { options: ['1K', '2K', '1K'], defaultValue: '1K' } },
    'parameters',
  );
  assert.deepEqual(codesOf(duplicated), ['parameter_options_invalid']);
  assert.equal(duplicated[0].path, 'parameters.resolution.options[2].value');

  const duplicatedObjects = validateParameterDomain(
    { quality: { options: [{ value: 'hd' }, { value: 'hd' }] } },
    'parameters',
  );
  assert.deepEqual(codesOf(duplicatedObjects), ['parameter_options_invalid']);

  const duplicatedCaseFold = validateParameterDomain(
    { quality: { options: ['HD', 'hd'], caseInsensitive: true } },
    'parameters',
  );
  assert.deepEqual(codesOf(duplicatedCaseFold), ['parameter_options_invalid']);

  const empty = validateParameterDomain({ quality: { options: [] } }, 'parameters');
  assert.deepEqual(codesOf(empty), ['parameter_options_invalid']);

  const notArray = validateParameterDomain({ quality: { options: 'hd' } }, 'parameters');
  assert.deepEqual(codesOf(notArray), ['parameter_options_invalid']);

  const missingValue = validateParameterDomain({ quality: { options: [{ label: 'HD' }] } }, 'parameters');
  assert.deepEqual(codesOf(missingValue), ['parameter_options_invalid']);
});

test('parameterSchema: defaultValue must be declared by options/range', () => {
  const unmatched = validateParameterDomain(
    { resolution: { options: ['1K', '2K'], defaultValue: '4K' } },
    'parameters',
  );
  assert.deepEqual(codesOf(unmatched), ['parameter_default_unmatched']);
  assert.equal(unmatched[0].path, 'parameters.resolution.defaultValue');

  const unmatchedType = validateParameterDomain(
    { duration: { options: [30, 60], defaultValue: '30' } },
    'parameters',
  );
  assert.deepEqual(codesOf(unmatchedType), ['parameter_default_unmatched']);

  const caseFoldedHit = validateParameterDomain(
    { resolution: { options: ['1K', '2K'], defaultValue: '2k', caseInsensitive: true } },
    'parameters',
  );
  assert.deepEqual(caseFoldedHit, []);

  const caseSensitiveMiss = validateParameterDomain(
    { resolution: { options: ['1K', '2K'], defaultValue: '2k' } },
    'parameters',
  );
  assert.deepEqual(codesOf(caseSensitiveMiss), ['parameter_default_unmatched']);

  const outOfRange = validateParameterDomain(
    { duration: { range: { min: 4, max: 15 }, defaultValue: 30 } },
    'parameters',
  );
  assert.deepEqual(codesOf(outOfRange), ['parameter_default_unmatched']);

  const outsideOptionsInsideRange = validateParameterDomain(
    { duration: { options: [{ value: -1 }], range: { min: 4, max: 30 }, defaultValue: 5, allowAuto: true } },
    'parameters',
  );
  assert.deepEqual(outsideOptionsInsideRange, []);
});

test('parameterSchema: stepped default is checked by the original schema entry', () => {
  const issues = validateParameterDomain({ duration: { range: { min: 4, max: 30, step: 2 }, defaultValue: 7 } }, 'parameters')
  assert.deepEqual(codesOf(issues), ['parameter_default_unmatched'])
  assert.equal(issues[0].path, 'parameters.duration.defaultValue')
})

test('parameterSchema: range bounds and step', () => {
  const inverted = validateParameterDomain({ duration: { range: { min: 30, max: 4, step: 1 } } }, 'parameters');
  assert.deepEqual(codesOf(inverted), ['parameter_range_invalid']);
  assert.equal(inverted[0].path, 'parameters.duration.range');

  const nonNumeric = validateParameterDomain({ duration: { range: { min: '4', max: 15 } } }, 'parameters');
  assert.deepEqual(codesOf(nonNumeric), ['parameter_range_invalid']);
  assert.equal(nonNumeric[0].path, 'parameters.duration.range.min');

  const badShape = validateParameterDomain({ duration: { range: [4, 15] } }, 'parameters');
  assert.deepEqual(codesOf(badShape), ['parameter_range_invalid']);

  const zeroStep = validateParameterDomain(
    { duration: { range: { min: 4, max: 15, step: 0 } } },
    'parameters',
  );
  assert.deepEqual(codesOf(zeroStep), ['parameter_step_invalid']);
  assert.equal(zeroStep[0].path, 'parameters.duration.range.step');

  const negativeStep = validateParameterDomain({ seed: { range: { step: -1 } } }, 'parameters');
  assert.deepEqual(codesOf(negativeStep), ['parameter_step_invalid']);
});

test('parameterSchema: boolean flags and unit', () => {
  const badFlag = validateParameterDomain(
    { duration: { options: [5, 10], allowAuto: 'true' } },
    'parameters',
  );
  assert.deepEqual(codesOf(badFlag), ['parameter_flag_invalid']);
  assert.equal(badFlag[0].path, 'parameters.duration.allowAuto');

  const badCaseFlag = validateParameterDomain({ resolution: { options: ['1K'], caseInsensitive: 1 } }, 'parameters');
  assert.deepEqual(codesOf(badCaseFlag), ['parameter_flag_invalid']);

  const badSupported = validateParameterDomain({ sound: { supported: 'yes' } }, 'parameters');
  assert.deepEqual(codesOf(badSupported), ['parameter_flag_invalid']);

  const switchWithNonBooleanDefault = validateParameterDomain(
    { watermark: { supported: true, defaultValue: 'false' } },
    'parameters',
  );
  assert.deepEqual(codesOf(switchWithNonBooleanDefault), ['parameter_flag_invalid']);
  assert.equal(switchWithNonBooleanDefault[0].path, 'parameters.watermark.defaultValue');

  const emptyUnit = validateParameterDomain({ duration: { unit: '  ' } }, 'parameters');
  assert.deepEqual(codesOf(emptyUnit), ['parameter_unit_invalid']);
  assert.equal(emptyUnit[0].path, 'parameters.duration.unit');
});

test('parameterSchema: parameters block and definitions must be objects', () => {
  const arrayBlock = validateParameterDomain([{ options: ['1K'] }], 'parameters', 'model-a', 'image-models.yaml');
  assert.deepEqual(codesOf(arrayBlock), ['parameter_definition_invalid']);
  assert.equal(arrayBlock[0].path, 'parameters');

  const scalarBlock = validateParameterDomain('resolution', 'parameters');
  assert.deepEqual(codesOf(scalarBlock), ['parameter_definition_invalid']);

  const arrayDefinition = validateParameterDomain({ resolution: ['1K', '2K'] }, 'parameters');
  assert.deepEqual(codesOf(arrayDefinition), ['parameter_definition_invalid']);
  assert.equal(arrayDefinition[0].path, 'parameters.resolution');

  const scalarDefinition = validateParameterDomain({ resolution: '1K' }, 'parameters');
  assert.deepEqual(codesOf(scalarDefinition), ['parameter_definition_invalid']);

  const missingBlock = validateParameterDomain(undefined, 'parameters');
  assert.deepEqual(missingBlock, []);
});

test('parameterSchema: wired into model-level validateModel', () => {
  const model = {
    id: 'model-a',
    label: 'Model A',
    parameters: { prompt: { minLength: 9, maxLength: 3 } },
    operations: [
      {
        id: 'text_to_video',
        output: { type: 'video' },
        inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 }],
      },
    ],
  };
  const issues = validateModel(model, { file: 'video-models.yaml' });
  const parameterIssues = issues.filter((i) => PARAMETER_ERROR_CODES.has(i.code));
  assert.equal(parameterIssues.length, 1, JSON.stringify(issues));
  assert.equal(parameterIssues[0].code, 'parameter_length_bound_invalid');
  assert.equal(parameterIssues[0].path, 'parameters.prompt');
  assert.equal(parameterIssues[0].modelId, 'model-a');
  assert.equal(parameterIssues[0].file, 'video-models.yaml');
});

test('parameterSchema: wired into operation-level validateOperation', () => {
  const op = {
    id: 'text_to_video',
    output: { type: 'video' },
    inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 }],
    parameters: { duration: { range: { min: 4, max: 15, step: 0 } } },
  };
  const issues = validateOperation(op, 2, {
    modelId: 'model-a',
    opIds: new Set(['text_to_video']),
    file: 'video-models.yaml',
  });
  const parameterIssues = issues.filter((i) => PARAMETER_ERROR_CODES.has(i.code));
  assert.equal(parameterIssues.length, 1, JSON.stringify(issues));
  assert.equal(parameterIssues[0].code, 'parameter_step_invalid');
  assert.equal(parameterIssues[0].path, 'operations[2].parameters.duration.range.step');
  assert.equal(parameterIssues[0].modelId, 'model-a');
});

test('parameterSchema: every emitted code is registered for admission-strict', () => {
  for (const code of PARAMETER_ERROR_CODES) {
    assert.ok(ADMISSION_ERROR_CODES.has(code), `${code} missing from ADMISSION_ERROR_CODES`);
  }
  assert.deepEqual(codesOf(validateParameterDomain({ voice: { optionsFrom: 'volcengine-voice-index' } }, 'parameters')), []);
});

test('parameterSchema: real specs stay free of parameter-domain errors', () => {
  resetContractCache();
  const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
  const parameterIssues = (index.issues ?? []).filter((i) => PARAMETER_ERROR_CODES.has(i.code));
  assert.deepEqual(parameterIssues, [], JSON.stringify(parameterIssues, null, 2));
});

test('parameterSchema: null option and layered unresolved defaults use the packaged member kernel', () => {
  assert.deepEqual(validateParameterDomain({ choice: { options: [null, 'x'], defaultValue: null } }, 'parameters'), [])
  for (const definition of [
    { defaultValue: undefined }, { type: 'integer', defaultValue: 1.5 },
    { maxLength: 1, defaultValue: '😀😀' }, { optionsFrom: 'future', defaultValue: 'x' },
    { range: { step: 1 }, defaultValue: 5 },
  ]) {
    const issues = validateParameterDomain({ value: definition }, 'parameters')
    assert.deepEqual(codesOf(issues), ['parameter_default_unmatched'])
    assert.equal(issues[0].path, 'parameters.value.defaultValue')
  }
  const malformed = validateParameterDomain({ value: { options: [5], range: { step: 0 }, defaultValue: 5 } }, 'parameters')
  assert.deepEqual(codesOf(malformed), ['parameter_step_invalid'])
  assert.deepEqual(validateParameterDomain({ value: { options: [5], range: { step: 2 }, defaultValue: 5 } }, 'parameters'), [])
  assert.deepEqual(validateParameterDomain({ value: { futureUiHint: true } }, 'parameters'), [])
})
