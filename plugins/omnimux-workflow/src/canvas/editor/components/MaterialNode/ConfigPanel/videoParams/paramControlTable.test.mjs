import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PARAM_CONTROL_POLICY, PARAM_CONTROL_TABLE } from './paramControlTable.ts';

test('all five modes share catalog-intersected controls and exclude legacy generationMode writes', () => {
  assert.deepEqual(Object.keys(PARAM_CONTROL_TABLE), ['text_to_video', 'first_frame', 'first_last_frame', 'video_multi_ref', 'digital_human']);
  for (const policy of Object.values(PARAM_CONTROL_TABLE)) {
    assert.equal(policy, DEFAULT_PARAM_CONTROL_POLICY);
    assert.deepEqual(policy.trigger, ['operation', 'aspectRatio', 'resolution', 'duration']);
    assert.deepEqual(policy.popover, [...policy.trigger, 'sound']);
    assert.equal(policy.hidden.includes('generationMode'), true);
    assert.equal(policy.writeAllowlist.includes('generationMode'), false);
    assert.deepEqual(new Set([...policy.popover, ...policy.advanced]), new Set(policy.writeAllowlist));
    assert.ok(Object.isFrozen(policy)); assert.ok(Object.isFrozen(policy.writeAllowlist));
  }
});
