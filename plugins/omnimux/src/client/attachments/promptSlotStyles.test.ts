import test from 'node:test';
import assert from 'node:assert/strict';
import { DOCK_STYLES } from './dockStyles.ts';

test('DOCK_STYLES: provides Aurora Purple prompt slot capsule styles', () => {
  assert.ok(DOCK_STYLES.includes('::highlight(omx-prompt-slot)'), 'contains CSS highlight selector for prompt slot');
  assert.ok(DOCK_STYLES.includes('.omx-prompt-slots-dock'), 'contains slots dock container');
  assert.ok(DOCK_STYLES.includes('.omx-prompt-slot-chip'), 'contains slot capsule chip style');
  assert.ok(DOCK_STYLES.includes('rgba(121, 97, 242,'), 'uses brand aurora purple background');
  assert.ok(DOCK_STYLES.includes('#c4b5fd'), 'uses light violet text color');
  assert.ok(DOCK_STYLES.includes('border-radius: 9999px'), 'uses pill capsule border-radius');
  assert.ok(DOCK_STYLES.includes('.omx-prompt-slot-chip.is-active'), 'contains active/focused state style');
});
