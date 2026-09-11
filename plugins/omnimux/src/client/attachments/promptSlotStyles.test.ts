import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCK_STYLES } from './dockStyles.ts';

const here = dirname(fileURLToPath(import.meta.url));
const chipsSource = readFileSync(join(here, 'PromptSlotChips.tsx'), 'utf8');
const enhancerSource = readFileSync(join(here, 'usePromptSlotEnhancer.ts'), 'utf8');

test('DOCK_STYLES: provides subtle black/white theme slot capsule styles and brand purple selection', () => {
  assert.ok(DOCK_STYLES.includes('::highlight(omx-prompt-slot)'), 'contains CSS highlight selector for prompt slot');
  assert.doesNotMatch(DOCK_STYLES, /underline wavy/, 'ensures wavy underline is removed');
  assert.ok(DOCK_STYLES.includes('.omx-prompt-slots-dock'), 'contains slots dock container');
  assert.ok(DOCK_STYLES.includes('padding: 4px 16px 6px 16px'), 'ensures left and right safety padding');
  assert.ok(DOCK_STYLES.includes('.omx-prompt-slot-chip'), 'contains slot capsule chip style');
  assert.ok(DOCK_STYLES.includes('border-radius: 9999px'), 'uses pill capsule border-radius');
  assert.ok(DOCK_STYLES.includes('rgba(121, 97, 242,'), 'uses brand purple from design.md for selection/highlight');
  assert.ok(DOCK_STYLES.includes('[data-composer-input="true"] ::selection'), 'styles input selection with brand purple');
  assert.ok(DOCK_STYLES.includes('.omx-prompt-slot-chip.has-value'), 'contains filled slot styles');
});

test('PromptSlotChips: removes "变量槽位" text, removes brackets from text, uses SVG icon instead of emoji', () => {
  assert.doesNotMatch(chipsSource, /变量槽位:/, 'removes 变量槽位: label text');
  assert.doesNotMatch(chipsSource, /✏️/, 'removes pencil emoji');
  assert.ok(chipsSource.includes('FileUploadIcon'), 'uses clean SVG file upload icon');
  assert.ok(chipsSource.includes('AssetFolderIcon'), 'uses clean SVG asset folder icon');
  assert.ok(chipsSource.includes('AssetPickerModal'), 'integrates AssetPickerModal for assets slots');
  assert.ok(chipsSource.includes('type="file"'), 'integrates file input for file slots');
});

test('usePromptSlotEnhancer: selectSlotInEditor selects inner text only and preserves brackets', () => {
  assert.match(enhancerSource, /startOffset\s*=\s*hasBrackets\s*\?\s*idx\s*\+\s*1\s*:\s*idx/, 'starts selection after [');
  assert.match(enhancerSource, /endOffset\s*=\s*hasBrackets\s*\?\s*idx\s*\+\s*slot\.raw\.length\s*-\s*1/, 'ends selection before ]');
  assert.ok(enhancerSource.includes('replaceSlotTextInEditor'), 'exports replaceSlotTextInEditor');
});
