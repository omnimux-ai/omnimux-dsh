import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveSlotLayout } from '../../src/shared/graph/feedSlot/deriveSlotLayout.ts';

const here = dirname(fileURLToPath(import.meta.url));
const slotWellsPath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/SlotWells.tsx');
const compatKernelPath = join(here, '../../src/shared/validation/compatKernel.ts');
const slotWellsSrc = readFileSync(slotWellsPath, 'utf8');
const compatKernelSrc = readFileSync(compatKernelPath, 'utf8');

test('E2E: Gemini 3.8 Flash 全模态卡槽派生与文档支持完整性', () => {
  // 1. SlotWells 必须具备对 document 类型的展示支持
  assert.match(
    slotWellsSrc,
    /upstream\.materialType === 'document'/,
    'SlotWells 必须支持文档类型 (document) 素材的渲染',
  );
  assert.match(
    slotWellsSrc,
    /wf-slot-well__placeholder--document/,
    'SlotWells 必须包含文档槽位专属占位样式',
  );

  // 2. compatKernel 必须将 document 纳入合法媒体输入类型
  assert.match(
    compatKernelSrc,
    /export const MEDIA_INPUT_TYPES = Object\.freeze\(\['image', 'video', 'audio', 'document'\] as const\);/,
    'MEDIA_INPUT_TYPES 必须声明 document',
  );

  // 3. 端到端卡槽派生：全模态模型必须派生出图、视、音、文 4 类素材卡槽
  const mockCatalog = {
    models: [{
      id: 'gemini-3.8-flash',
      operations: [{
        id: 'vision_chat',
        listed: true,
        output: { type: 'text' },
        inputs: [
          { slot: 'prompt', type: 'text', role: 'prompt', min: 1, max: 1 },
          { slot: 'reference_images', type: 'image', role: 'reference', min: 0, max: 10 },
          { slot: 'reference_videos', type: 'video', role: 'reference', min: 0, max: 1 },
          { slot: 'reference_audios', type: 'audio', role: 'reference', min: 0, max: 1 },
          { slot: 'reference_documents', type: 'document', role: 'reference', min: 0, max: 1 },
        ],
      }],
    }],
  };

  const layout = deriveSlotLayout(mockCatalog, 'gemini-3.8-flash', 'vision_chat', 'text');
  assert.equal(layout.preset, 'strip', '全模态模型必须派生 strip 预设');
  assert.equal(layout.addButton, true, '必须允许添加素材');
  assert.equal(layout.slots.length, 4, '必须包含图片、视频、音频、文档 4 个卡槽');
  const slotNames = layout.slots.map((s) => s.slot);
  assert.deepEqual(slotNames, ['reference_images', 'reference_videos', 'reference_audios', 'reference_documents']);
});
