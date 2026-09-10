import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isConfigPanelVisible } from '../../utils/nodeVisualMath.ts';

const here = dirname(fileURLToPath(import.meta.url));
const materialNodeSrc = readFileSync(join(here, 'index.tsx'), 'utf8');
const configPanelSrc = readFileSync(join(here, 'ConfigPanel/index.tsx'), 'utf8');

test('isConfigPanelVisible 在节点处于生成中（localStatus="generating" 或 executionStatus="running"）时必须隐藏面板', () => {
  // 1. localStatus 为 generating 时无论是否选中都必须隐藏
  assert.equal(isConfigPanelVisible(true, undefined, 'generate', false, undefined, 'generating'), false);
  assert.equal(isConfigPanelVisible(true, 'pending', 'generate', false, undefined, 'generating'), false);

  // 2. executionStatus 为 running 时无论是否选中都必须隐藏
  assert.equal(isConfigPanelVisible(true, 'running', 'generate', false, undefined, undefined), false);

  // 3. 非生成态且普通生成节点选中时显示
  assert.equal(isConfigPanelVisible(true, undefined, 'generate', false, undefined, 'ready'), true);
  assert.equal(isConfigPanelVisible(true, 'completed', 'generate', false, undefined, 'completed'), true);
});

test('MaterialNode 契约：卡片右上角「替换」按钮在生成状态下坚决不显示', () => {
  // 1. 源码定义了严密的 isGenerating 生成状态判断
  assert.match(materialNodeSrc, /const isGenerating =[\s\S]*?generationStatus === 'generating'[\s\S]*?generationStatus === 'pending'[\s\S]*?executionStatus === 'running'[\s\S]*?status === 'generating'/);

  // 2. showReplaceButton 必须严格受 !isGenerating 门禁保护
  assert.match(materialNodeSrc, /const showReplaceButton =\s*!isGenerating/);
});

test('MaterialNode 契约：音频节点操作栏的替换按钮在生成状态下坚决不显示', () => {
  // 3. onReplaceAudio 在生成中必须为 undefined
  assert.match(materialNodeSrc, /onReplaceAudio=\{!isMultiSelected && !isGenerating \? \(\) => \{ void resourcePicker\.fillImportNode\(\); \} : undefined\}/);
});

test('MaterialNode 契约：顶部操作栏（pillActions）在生成状态下不提供 replace-media', () => {
  // 4. pillActions 导入节点在 isGenerating 时不放入 replace-media
  assert.match(materialNodeSrc, /if \(kind === 'import' && materialType === 'image' && !isGenerating\) \{[\s\S]*?key: 'replace-media'/);
  // 5. pillActions 的 useMemo 依赖列表中包含 isGenerating
  assert.match(materialNodeSrc, /isEmptyMediaNode,\s*isGenerating,\s*isOffline/);
});

test('ConfigPanel 契约：ImportConfigPanel 在执行/生成中隐藏替换按钮', () => {
  // 6. ImportConfigPanel 接收 execBusy 并计算 isNodeBusy
  assert.match(configPanelSrc, /const isNodeBusy =\s*Boolean\(execBusy\)/);
  assert.match(configPanelSrc, /onOpenResourcePicker && !isNodeBusy && \(/);
});
