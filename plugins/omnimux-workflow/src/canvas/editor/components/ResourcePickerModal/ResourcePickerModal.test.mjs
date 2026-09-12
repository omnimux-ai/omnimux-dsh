/**
 * ResourcePicker 源码契约：入口联动、CustomSelect、无裸 select。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const modalSrc = readFileSync(join(here, 'ResourcePickerModal.tsx'), 'utf8');
const canvasPaneSrc = readFileSync(join(here, 'CanvasResourcePane.tsx'), 'utf8');
const localPaneSrc = readFileSync(join(here, 'LocalUploadPane.tsx'), 'utf8');
const hookSrc = readFileSync(join(here, '../../hooks/useResourcePicker.ts'), 'utf8');
const emptySrc = readFileSync(join(here, '../MaterialNode/NodeEmptyState.tsx'), 'utf8');
const panelSrc = readFileSync(join(here, '../MaterialNode/ConfigPanel/index.tsx'), 'utf8');
const nodeSrc = readFileSync(join(here, '../MaterialNode/index.tsx'), 'utf8');
const editorSrc = readFileSync(join(here, '../../CanvasEditor.tsx'), 'utf8');
const cssSrc = readFileSync(join(here, '../../../theme/components.css'), 'utf8');

test('弹窗基于 CustomModal，含画布/本地 Tab 与 Footer 使用 N 项', () => {
  assert.match(modalSrc, /CustomModal/);
  assert.match(modalSrc, /picker\.tab\.canvas/);
  assert.match(modalSrc, /picker\.tab\.local/);
  assert.match(modalSrc, /picker\.use/);
  assert.match(modalSrc, /selectedCount === 0/);
});

test('画布面板使用 CustomSelect，禁止裸 select', () => {
  assert.match(canvasPaneSrc, /CustomSelect/);
  assert.equal(/<select\b/.test(canvasPaneSrc), false);
  assert.equal(/<select\b/.test(modalSrc), false);
  assert.equal(/<select\b/.test(localPaneSrc), false);
});

test('本地导入走系统选择器 + 带 path 的拖拽，不写 blob', () => {
  assert.match(localPaneSrc, /pickLocalFiles/);
  assert.match(localPaneSrc, /onDrop=\{handleDrop\}/);
  assert.match(localPaneSrc, /nativePathOf/);
  assert.match(localPaneSrc, /onRemove/);
  assert.equal(/createObjectURL/.test(localPaneSrc), false);
  assert.equal(/objectUrl/.test(localPaneSrc), false);
});

test('提交走 applyCanvasInputMutation / planResourcePickerCommit', () => {
  assert.match(hookSrc, /planResourcePickerCommit/);
  assert.match(hookSrc, /applyCanvasInputMutation/);
});

test('导入空态点击卡片唤起 fillImportNode，无私有 file input', () => {
  assert.match(emptySrc, /onImport\?:/);
  assert.match(nodeSrc, /onImport=\{kind === 'import'/);
  assert.match(nodeSrc, /fillImportNode/);
  assert.equal(/type="file"/.test(emptySrc), false);
  assert.equal(/type="file"/.test(nodeSrc), false);
});

test('ConfigPanel 卡槽 / [+] 唤起弹窗（T03：SlotWells + SlotPickRequest）', () => {
  // 旧 add-ref-btn 已退役；卡槽点击经 SlotPickRequest 进入装填会话
  assert.doesNotMatch(panelSrc, /wf-config-panel__add-ref-btn/);
  assert.match(panelSrc, /onOpenResourcePicker/);
  assert.match(panelSrc, /SlotPickRequest/);
  assert.match(panelSrc, /<SlotWells/);
});

test('MaterialNode 挂载 ResourcePickerModal 与 useResourcePicker', () => {
  assert.match(nodeSrc, /useResourcePicker\(id,/);
  assert.match(nodeSrc, /<ResourcePickerModal/);
  assert.match(nodeSrc, /fillImportNode/);
  assert.match(nodeSrc, /openPicker\('canvas',/);
  // T03：picker 会话携带 slotTarget 进弹窗
  assert.match(nodeSrc, /slotTarget=\{resourcePicker\.slotTarget\}/);
  assert.equal(/createObjectURL/.test(nodeSrc), false);
});

test('导入节点选中不展开 ConfigPanel，有媒体时替换统一走卡片内侧右上角', () => {
  assert.match(nodeSrc, /isConfigPanelVisible\(\s*selected,\s*executionStatus,\s*(?:kind|effectiveKind),\s*isMultiSelected/);
  assert.match(nodeSrc, /hasNodeMaterial/);
  assert.match(nodeSrc, /showReplaceButton/);
  assert.match(nodeSrc, /wf-material-node__replace-btn/);
});

test('画布导入素材入口先选文件再落节点，取消不建空节点', () => {
  assert.match(editorSrc, /pickLocalFiles\(\)/);
  assert.match(editorSrc, /planStandaloneImportNodes/);
  assert.match(hookSrc, /planImportNodeFill/);
  assert.equal(/createImportNode\('image'/.test(editorSrc), false);
  assert.equal(/openPickerOnMount/.test(editorSrc), false);
  assert.equal(/openPickerOnMount/.test(nodeSrc), false);
});

test('资产侧栏入画布走导入节点，画布 Tab 拖入只定位', () => {
  const outlineSrc = readFileSync(join(here, '../assets/views/CanvasOutlineView.tsx'), 'utf8');
  assert.match(editorSrc, /classifyAssetImport/);
  assert.match(editorSrc, /mountImportFromAsset/);
  assert.match(editorSrc, /omnimux-canvas-node/);
  assert.match(outlineSrc, /omnimux-canvas-node/);
  assert.equal(/type: 'omnimux-asset', asset: node/.test(outlineSrc), false);
  const mountBlock = editorSrc.slice(
    editorSrc.indexOf('const mountImportFromAsset'),
    editorSrc.indexOf('const handleInsertAsset'),
  );
  assert.equal(/createMaterialNode/.test(mountBlock), false);
  const dropStart = editorSrc.indexOf('const handleDrop');
  const dropBlock = editorSrc.slice(dropStart, editorSrc.indexOf('return (', dropStart));
  assert.equal(/createMaterialNode/.test(dropBlock), false);
});

test('源码契约：MaterialNode / LocalUploadPane 不得把 createObjectURL 写入节点', () => {
  const policySrc = readFileSync(join(here, '../../utils/resourcePickerPolicy.ts'), 'utf8');
  assert.equal(/createObjectURL/.test(nodeSrc), false);
  assert.equal(/createObjectURL/.test(localPaneSrc), false);
  assert.equal(/createObjectURL/.test(policySrc), false);
  assert.match(policySrc, /buildImportedMediaData/);
  assert.match(nodeSrc, /planImportNodeFill/);
  assert.match(nodeSrc, /nativePathOf/);
  const importBlock = nodeSrc.slice(
    nodeSrc.indexOf('const handleImportFile'),
    nodeSrc.indexOf('const handleDragOver'),
  );
  assert.match(importBlock, /planImportNodeFill/);
  assert.equal(/mediaUrl:\s*url/.test(importBlock), false);
});

test('选择资源样式覆盖 Tab / 网格 / 拖拽区 / 已添加 / [+] 按钮', () => {
  assert.match(cssSrc, /\.wf-picker-tab--active/);
  assert.match(cssSrc, /\.wf-picker-grid/);
  assert.match(cssSrc, /\.wf-picker-dropzone/);
  assert.match(cssSrc, /\.wf-picker-added-badge/);
  // T03：strip 末尾虚线 [+] 槽位（SlotWells）
  assert.match(cssSrc, /\.wf-slot-well--append/);
});

test('选择资源弹窗标题栏与 Tab 行不得再画分割线', () => {
  const pickerBlock = cssSrc.slice(cssSrc.indexOf('ResourcePickerModal'));
  assert.match(pickerBlock, /\.wf-picker-modal \.wf-modal-header[\s\S]*?border-bottom:\s*none/);
  assert.match(pickerBlock, /\.wf-picker-tabs[\s\S]*?border-bottom:\s*none/);
  assert.equal(/\.wf-picker-tabs[\s\S]{0,180}border-bottom:\s*1px/.test(pickerBlock), false);
});

test('预览卡比例适配：media contain + 分档 class + 高度钳制', () => {
  const pickerBlock = cssSrc.slice(cssSrc.indexOf('ResourcePickerModal'));
  assert.match(pickerBlock, /object-fit:\s*contain/);
  assert.match(cssSrc, /\.wf-picker-card__thumb--ultra-wide/);
  assert.match(cssSrc, /\.wf-picker-card__thumb--wide/);
  assert.match(cssSrc, /\.wf-picker-card__thumb--square/);
  assert.match(cssSrc, /\.wf-picker-card__thumb--tall/);
  assert.match(cssSrc, /\.wf-picker-card__thumb--ultra-tall/);
  assert.match(cssSrc, /min-height:\s*72px/);
  assert.match(cssSrc, /max-height:\s*112px/);
  assert.match(cssSrc, /\.wf-picker-card__media \{[\s\S]{0,300}?object-fit:\s*contain/);
  assert.equal(
    /\.wf-picker-card__media[\s\S]{0,200}object-fit:\s*cover/.test(pickerBlock),
    false,
  );
});

test('画布面板与本地面板接入 PreviewThumb', () => {
  assert.match(canvasPaneSrc, /PreviewThumb/);
  assert.match(localPaneSrc, /PreviewThumb/);
});

test('ResourcePickerModal 属性契约：解构声明包含 title，杜绝未定义变量运行时异常', () => {
  assert.match(modalSrc, /title\?: string;/);
  // 核心防线：必须在参数中正确解构 title，严禁遗漏导致 ReferenceError: title is not defined
  assert.match(modalSrc, /const ResourcePickerModal: React\.FC<ResourcePickerModalProps> = \(\{\s*[\s\S]*?\btitle\b[\s\S]*?\}\) =>/);
  assert.match(modalSrc, /const modalTitle =\s*title \|\|/);
});
