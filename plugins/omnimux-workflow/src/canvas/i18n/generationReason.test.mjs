import assert from 'node:assert/strict';
import { test } from 'node:test';
import zh from './dict.zh.ts';
import en from './dict.en.ts';
import { generationReasonText } from './generationReason.ts';

for (const [locale, dictionary] of [['zh', zh], ['en', en]]) {
  const t = (key) => dictionary[key] ?? key;
  test(`${locale}: typed generation failures preserve concrete limits without raw executor messages`, () => {
    const cases = [
      ['mime_unsupported', { allowedMimes: ['image/png', 'image/jpeg'] }, 'image/png'],
      ['size_exceeded', { maxSizeMb: 10 }, '10'],
      ['duration_exceeded', { maxDurationSec: 15 }, '15'],
      ['duration_exceeded', { minDurationSec: 3 }, '3'],
      ['slot_capacity', { max: 4 }, '4'],
      ['min_unsatisfied', { min: 2, current: 1 }, '2'],
    ];
    for (const [code, meta, expected] of cases) {
      const copy = generationReasonText(t, code, { code, meta, message: 'operation internal_slot prompt' });
      assert.ok(copy.includes(expected));
      assert.doesNotMatch(copy, /operation|internal_slot|prompt/);
    }
    assert.equal(generationReasonText(t, 'prompt_required'), dictionary['panel.reason.prompt_required']);
    assert.equal(generationReasonText(t, 'future_reason'), dictionary['panel.reason.no_compatible_model']);
    assert.equal(generationReasonText(t, undefined), undefined);
  });
}
