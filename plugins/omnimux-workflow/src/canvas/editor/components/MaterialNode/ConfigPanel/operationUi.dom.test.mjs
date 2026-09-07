/**
 * Issue 467 / W2 — ConfigPanel / Segment / TriggerBar / Popover source contracts.
 *
 * DOM-truth style assertions over source (node:test + readFileSync):
 *   - effectiveOps 0/1 → no mode DOM wiring
 *   - ≥2 → OperationSegment only
 *   - filtered models via buildFilteredModelOptions (no disabled greys)
 *   - TriggerBar omits mode text/separator when showModeUi=false
 *   - legacy generationMode write path gone
 *   - --dsw-* only / no raw hex in new files / no banned token island
 *   - portal light/dark has no JS theme branch
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const configSrc = readFileSync(join(here, 'index.tsx'), 'utf8');
const segmentSrc = readFileSync(join(here, 'videoParams/SegmentControls.tsx'), 'utf8');
const triggerSrc = readFileSync(join(here, 'videoParams/VideoTriggerBar.tsx'), 'utf8');
const popoverSrc = readFileSync(join(here, 'videoParams/VideoParamPopover.tsx'), 'utf8');
const cfgSummaryBarSrc = readFileSync(join(here, 'cfg/CfgSummaryBar.tsx'), 'utf8');
const cfgSegmentSrc = readFileSync(join(here, 'cfg/CfgSegment.tsx'), 'utf8');
const adapterSrc = readFileSync(join(here, 'videoParams/videoParamAdapter.ts'), 'utf8');
const summarySrc = readFileSync(join(here, 'videoParams/summaryFormatter.ts'), 'utf8');
const typesSrc = readFileSync(join(here, 'videoParams/types.ts'), 'utf8');
const storeSrc = readFileSync(join(here, '../../../../store/canvasStore.ts'), 'utf8');
const opUiSrc = readFileSync(
  join(here, '../../../../../shared/validation/operationUi.ts'),
  'utf8',
);

test('ConfigPanel 消费 buildFilteredModelOptions / buildEffectiveOpsUiState（唯一判定）', () => {
  assert.match(configSrc, /buildFilteredModelOptions/);
  assert.match(configSrc, /buildEffectiveOpsUiState/);
  assert.match(configSrc, /setParamsOperation/);
  // 不再用 disabled 灰置不兼容模型
  assert.match(configSrc, /disabled:\s*false/);
  assert.match(configSrc, /Hide, Don't Grey|Hide, Don\\'t Grey|zeroCandidates|wf-model-empty/);
  // 不再 evaluateModelCompatibility 驱动 disabled 长列表
  assert.doesNotMatch(configSrc, /evaluateModelCompatibility/);
  assert.doesNotMatch(configSrc, /level === 'disabled'/);
  // Product admission lives in the shared kernel, not a separate picker list.
  assert.doesNotMatch(configSrc, /MATERIAL_NODE_WHITELIST|NODE_MODEL_WHITELIST/);
});

test('ConfigPanel mode UI consumes presentation policy; video retains its popover', () => {
  assert.match(configSrc, /showModeUi/);
  assert.match(configSrc, /OperationSegment/);
  assert.match(configSrc, /wf-operation-mode-inline|wf-compat-error/);
  assert.match(configSrc, /blockGenerate/);
  // 生成门禁绑定 effectiveOps / zeroCandidates / configuration_error
  assert.match(configSrc, /opsState\.blockGenerate|filteredModels\.zeroCandidates|configuration_error/);
});

test('ConfigPanel 写入 canonical params.operation', () => {
  assert.match(configSrc, /updateParam\('operation'/);
  assert.doesNotMatch(configSrc, /updateParam\('generationMode'/);
  assert.doesNotMatch(configSrc, /onParamChange\('generationMode'/);
});

test('SegmentControls：OperationSegment 仅渲染 effective ops；≤1 返回 null', () => {
  assert.match(segmentSrc, /OperationSegment/);
  assert.match(segmentSrc, /effective\.length <= 1/);
  assert.match(segmentSrc, /return null/);
  // 旧 dual-button reference|first_last_frame 硬编码已收口
  assert.doesNotMatch(segmentSrc, /value:\s*'reference'/);
  assert.doesNotMatch(segmentSrc, /value:\s*'first_last_frame'/);
  assert.doesNotMatch(segmentSrc, /'全能参考'/);
  assert.doesNotMatch(segmentSrc, /supportsReference/);
  assert.doesNotMatch(segmentSrc, /GenerationModeSegment/);
  // data-operation-id 由通用 CfgSegment / CfgChoiceTile 承担
  assert.match(cfgSegmentSrc, /data-operation-id/);
});

test('VideoTriggerBar：showModeUi=false 时无 mode DOM / 无多余分隔符', () => {
  assert.match(triggerSrc, /showMode/);
  assert.match(triggerSrc, /params\.showModeUi/);
  assert.match(triggerSrc, /data-show-mode/);
  assert.match(triggerSrc, /wf-trigger-mode|wf-video-trigger-bar__mode/);
  // mode 槽仅 showMode 时入列；折叠 hidden 集合门控由通用 CfgSummaryBar 承担
  assert.match(triggerSrc, /if \(showMode\)/);
  assert.match(cfgSummaryBarSrc, /visible\.hidden\.has\(item\.id\)/);
  // 摘要分隔改用 CSS 竖线：源码无「·」字符节点、无 __dot 类名（注释豁免）
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.doesNotMatch(stripComments(triggerSrc), /·/);
  assert.doesNotMatch(triggerSrc, /wf-video-trigger-bar__dot/);
  assert.doesNotMatch(stripComments(cfgSummaryBarSrc), /·/);
});

test('VideoParamPopover：mode section 仅 showModeUi；写 operation', () => {
  assert.match(popoverSrc, /showModeUi/);
  assert.match(popoverSrc, /wf-operation-mode-section/);
  assert.match(popoverSrc, /OperationSegment/);
  assert.match(popoverSrc, /onParamChange\('operation'/);
  assert.doesNotMatch(popoverSrc, /onParamChange\('generationMode'/);
  assert.doesNotMatch(popoverSrc, /supportedRoles=\{modelItem/);
  // 无 JS theme branch
  assert.doesNotMatch(popoverSrc, /isDark|theme\s*===|matchMedia/);
  assert.doesNotMatch(popoverSrc, /banned-token-/);
});

test('summaryFormatter：modeText 受 showModeUi 门控', () => {
  assert.match(summarySrc, /showModeUi/);
  assert.match(summarySrc, /operationLabel/);
  assert.doesNotMatch(summarySrc, /params\.generationMode === 'first_last_frame' \? '首尾帧' : '全能参考'/);
});

test('types：EffectiveVideoParams 以 operation + showModeUi 为主', () => {
  assert.match(typesSrc, /operation:\s*string/);
  assert.match(typesSrc, /showModeUi:\s*boolean/);
  assert.match(typesSrc, /effectiveOperations/);
  assert.match(typesSrc, /operation\?:/);
});

test('videoParamAdapter：消费 catalog / setParamsOperation，不再写 generationMode', () => {
  assert.match(adapterSrc, /buildEffectiveOpsUiState/);
  assert.match(adapterSrc, /setParamsOperation/);
  assert.match(adapterSrc, /params\.operation|nextParams = setParamsOperation/);
  assert.doesNotMatch(adapterSrc, /nextParams\['generationMode'\]/);
});

test('canvasStore：catalog fingerprint 变化触发 reconcile', () => {
  assert.match(storeSrc, /reconcileCanvasForCatalog/);
  assert.match(storeSrc, /readGraphCatalogFingerprint/);
  assert.match(storeSrc, /previousFingerprint/);
});

test('operationUi 模块：开 string operation id，无 17-union', () => {
  assert.match(opUiSrc, /id: string/);
  assert.doesNotMatch(opUiSrc, /'text_to_image'\s*\|\s*'image_to_image'/);
  assert.match(opUiSrc, /Hide, Don't Grey|effectiveOps/);
});

test('样式门禁：新 UI 源码无 raw hex/rgba、无 banned CSS vars', () => {
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
  for (const [name, src] of [
    ['SegmentControls', segmentSrc],
    ['VideoTriggerBar', triggerSrc],
    ['VideoParamPopover', popoverSrc],
    ['summaryFormatter', summarySrc],
  ]) {
    const code = stripComments(src);
    assert.doesNotMatch(code, colorRe, `${name} must not use raw hex/rgba`);
    assert.doesNotMatch(code, /--omx-/, `${name} must not use banned tokens`);
  }
  const configCode = stripComments(configSrc);
  assert.doesNotMatch(configCode, /--omx-/);
  assert.doesNotMatch(configCode, /#[0-9a-fA-F]{3,8}\b/);
});

test('ASR / audio-transcription 空态接线', () => {
  assert.match(configSrc, /audio-transcription/);
  assert.match(configSrc, /暂无可用转写模型|isAsrTool/);
  assert.match(configSrc, /wf-model-empty/);
});

test('四模态均可消费 filtered model / effectiveOps', () => {
  assert.match(configSrc, /outputTypeForCompat/);
  // 内联 OperationSegment 仅保留文本 / ASR 入口；图像与音频（非 ASR）进各自浮层
  assert.match(configSrc, /materialType === 'text' \|\| isAsrTool/);
  assert.match(configSrc, /materialType === 'image'/);
  assert.match(configSrc, /materialType === 'audio'/);
  assert.match(configSrc, /materialType === 'video'/);
});


test('empty inputs suppress both hint and error banner; fixed audio tabs are absent', () => {
  assert.match(configSrc, /quietReason = reasonCode === 'prompt_required'/);
  assert.doesNotMatch(configSrc, /data-testid="wf-input-hint"/);
  assert.match(configSrc, /!quietReason && \(opsState\.blockGenerate/);
  assert.match(configSrc, /disabledReason=\{blockReason\}/);
  assert.doesNotMatch(configSrc, /handleAudioSubModeChange|wf-config-panel__audio-tabs/);
  assert.match(configSrc, /opsState.selectedOperationId === 'text_to_music'/);
});

test('manual selection remembers the model and reports failed persistence', () => {
  assert.match(configSrc, /rememberGenerationModel\(materialType, newModelId\)\.catch/);
  assert.match(configSrc, /toast\.error/);
  assert.match(configSrc, /nodeCompat\?\.adaptation/);
  assert.match(configSrc, /role="status" data-testid="wf-model-adaptation"/);
});
