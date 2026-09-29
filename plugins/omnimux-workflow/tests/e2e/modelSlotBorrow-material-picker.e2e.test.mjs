import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const configPanelPath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx');
const borrowPath = join(here, '../../src/shared/graph/feedSlot/modelMaterialCapability.ts');
const feedSlotTypesPath = join(here, '../../src/shared/graph/feedSlot/types.ts');
const slotWellTypesPath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/types.ts');
const materialNodePath = join(here, '../../src/canvas/editor/components/MaterialNode/index.tsx');
const pickerHookPath = join(here, '../../src/canvas/editor/hooks/useResourcePicker.ts');
const modalPath = join(here, '../../src/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.tsx');
const uploadPanePath = join(here, '../../src/canvas/editor/components/ResourcePickerModal/LocalUploadPane.tsx');
const draftUtilPath = join(here, '../../src/canvas/editor/utils/localFileDraft.ts');
const localMediaPath = join(here, '../../src/shared/localMedia.ts');

const configPanelSrc = readFileSync(configPanelPath, 'utf8');
const borrowSrc = readFileSync(borrowPath, 'utf8');
const feedSlotTypesSrc = readFileSync(feedSlotTypesPath, 'utf8');
const slotWellTypesSrc = readFileSync(slotWellTypesPath, 'utf8');
const materialNodeSrc = readFileSync(materialNodePath, 'utf8');
const pickerHookSrc = readFileSync(pickerHookPath, 'utf8');
const modalSrc = readFileSync(modalPath, 'utf8');
const uploadPaneSrc = readFileSync(uploadPanePath, 'utf8');
const draftUtilSrc = readFileSync(draftUtilPath, 'utf8');
const localMediaSrc = readFileSync(localMediaPath, 'utf8');

test('E2E: 模型级素材卡槽借用全链路（派生 → 卡槽 → 弹窗 → 提交自动切操作）', () => {
  // 1. 派生层：deriveModelSlotLayout 借用同模型 listed 兄弟操作并标记 displayOnlyFromOperation
  assert.match(borrowSrc, /export function deriveModelSlotLayout\(/);
  assert.match(borrowSrc, /layout\.displayOnlyFromOperation = borrowed\.id/);

  // 2. 类型契约：SlotLayout 与 SlotPickRequest 都携带 displayOnlyFromOperation
  assert.match(feedSlotTypesSrc, /displayOnlyFromOperation\?:\s*string/);
  assert.match(slotWellTypesSrc, /displayOnlyFromOperation\?:\s*string/);
  assert.match(slotWellTypesSrc, /acceptedTypes:\s*string\[\]/);

  // 3. ConfigPanel：卡槽布局走模型级派生，而非仅按当前操作
  assert.match(configPanelSrc, /deriveModelSlotLayout\(activeCatalog, modelValue, currentOperationId\)/);
  assert.match(configPanelSrc, /deriveModelSlotLayout\(activeCatalog, newModelId, nextOperation\)/);

  // 4. MaterialNode：打开素材选择器时透传 displayOnlyFromOperation
  assert.match(materialNodeSrc, /displayOnlyFromOperation:\s*requestOrMode\.displayOnlyFromOperation/);

  // 5. 提交链：借用槽位提交时通过 setParamsOperation 自动切换到素材所属操作
  assert.match(pickerHookSrc, /const borrowOp = slotTarget\?\.displayOnlyFromOperation/);
  assert.match(pickerHookSrc, /setParamsOperation\(targetNode\?\.data\?\.params, borrowOp\)/);

  // 6. 弹窗链：acceptedTypes 从槽位目标贯穿到本地上传面板
  assert.match(modalSrc, /acceptedTypes=\{slotTarget\?\.acceptedTypes\}/);
  assert.match(uploadPaneSrc, /acceptedTypes\?:\s*string\[\]/);
  assert.match(uploadPaneSrc, /filterDraftsByTypes\(drafts, acceptedTypes\)/);

  // 7. 能力过滤与文本素材入库
  assert.match(draftUtilSrc, /export function filterDraftsByTypes\(/);
  assert.match(localMediaSrc, /TEXT_EXT = new Set\(\['txt', 'md'\]\)/);
});
