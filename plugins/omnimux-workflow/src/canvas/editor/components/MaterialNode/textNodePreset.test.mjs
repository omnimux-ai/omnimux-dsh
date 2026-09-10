/**
 * 文本节点预设 Prompt 注入与状态机契约测试：
 * 1. handleApplyPreset 仅注入 prompt 与切换 selectedTool='text-to-text'，严禁写入 content 或覆盖 generatedContent
 * 2. 空态预设包含剧本、策划案、提示词、分镜
 * 3. 未编辑态下卡片为只读/空态预览，生成结果通过 generatedContent 回填
 * 4. Issue #299：预设同时单选当前节点，配置底栏才能展开
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nodeSrc = readFileSync(join(here, 'index.tsx'), 'utf8');
const emptyStateSrc = readFileSync(join(here, 'NodeEmptyState.tsx'), 'utf8');

test('文本节点预设 Prompt 注入不污染 content 与 generatedContent', () => {
  // 必须只更新 prompt 与 selectedTool: 'text-to-text'
  assert.match(nodeSrc, /prompt:\s*injected/);
  assert.match(nodeSrc, /selectedTool:\s*'text-to-text'/);
  // 严禁在 handleApplyPreset 中向 nodeData 写入 content: injected
  assert.doesNotMatch(nodeSrc, /content:\s*injected/);
});

test('文本节点预设支持 script / planning / prompt / storyboard 四类模板', () => {
  assert.match(nodeSrc, /presetKey === 'script'/);
  assert.match(nodeSrc, /presetKey === 'planning'/);
  assert.match(nodeSrc, /presetKey === 'prompt'/);
  assert.match(nodeSrc, /presetKey === 'storyboard'/);
});

test('NodeEmptyState 为文本节点提供手动编写与三类预设生成按钮', () => {
  assert.match(emptyStateSrc, /onClick=\{onStartEdit\}/);
  assert.match(emptyStateSrc, /onApplyPreset\?\.?\('script'\)/);
  assert.match(emptyStateSrc, /onApplyPreset\?\.?\('planning'\)/);
  assert.match(emptyStateSrc, /onApplyPreset\?\.?\('prompt'\)/);
});

test('handleApplyPreset 通过 planSelectAndPatchNode 单选当前节点并同步 selectedElement', () => {
  assert.match(nodeSrc, /planSelectAndPatchNode\(nodes,\s*id,\s*updates\)/);
  assert.match(nodeSrc, /setSelectedElement\('node',\s*id\)/);
  // 空态 nodrag + mousedown stopPropagation 必须保留（防拖拽捕获）
  assert.match(emptyStateSrc, /wf-node-empty__actions nodrag/);
  assert.match(emptyStateSrc, /onMouseDown=\{\(e\) => e\.stopPropagation\(\)\}/);
});

test('文本节点上游连入表格或文本输入时展示关联提示，不再显示通用空态', () => {
  assert.match(nodeSrc, /upstreamTableOrText/);
  assert.match(nodeSrc, /已关联表格输入/);
  assert.match(nodeSrc, /已关联文本输入/);
});
