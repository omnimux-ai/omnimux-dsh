import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCK_STYLES } from './dockStyles.ts';

const here = dirname(fileURLToPath(import.meta.url));
const chipsSource = readFileSync(join(here, 'PromptSlotChips.tsx'), 'utf8');

test('DOCK_STYLES: provides subtle black/white theme slot capsule styles and removes wavy underline', () => {
  assert.ok(DOCK_STYLES.includes('::highlight(omx-prompt-slot)'), 'contains CSS highlight selector for prompt slot');
  assert.doesNotMatch(DOCK_STYLES, /underline wavy/, 'ensures wavy underline is removed');
  assert.ok(DOCK_STYLES.includes('.omx-prompt-slots-dock'), 'contains slots dock container');
  assert.ok(DOCK_STYLES.includes('.omx-prompt-slot-chip'), 'contains slot capsule chip style');
  assert.ok(DOCK_STYLES.includes('border-radius: 9999px'), 'uses pill capsule border-radius');
  assert.ok(DOCK_STYLES.includes('.omx-prompt-slot-chip.is-active'), 'contains active/focused state style');
  assert.ok(DOCK_STYLES.includes('border: 1px dashed'), 'uses dashed border style');
});

test('PromptSlotChips: removes "变量槽位" text, removes brackets from text, uses SVG icon instead of emoji', () => {
  assert.doesNotMatch(chipsSource, /变量槽位:/, 'removes 变量槽位: label text');
  assert.doesNotMatch(chipsSource, /✏️/, 'removes pencil emoji');
  assert.ok(chipsSource.includes('<SlotTagIcon'), 'uses clean SVG vector icon');
  assert.doesNotMatch(chipsSource, /\[\$\{slot\.placeholder\}\]/, 'slot text should not have square brackets');
});
