/**
 * 文本节点模型生成与手动编辑模式互斥与状态机契约测试：
 * 1. 空状态下支持输入 Prompt 生成或自己编辑；
 * 2. 手动编辑填写内容非空时，自动关闭模型生成模式（nodeKind='import'），不再显示模型生成面板；
 * 3. 工作流调度执行时，手动编辑的文本作为静态文本文件输入透传，不触发模型生成；
 * 4. 清空文本内容后恢复到空状态，重新支持模型生成，选中时重新展示生成面板；
 * 5. TextStage 全屏编辑器提交同样严格遵循此互斥与恢复契约。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveNodeKind } from '../../../../shared/graph/materialNode.ts';
import { isConfigPanelVisible } from '../../utils/nodeVisualMath.ts';

const here = dirname(fileURLToPath(import.meta.url));
const materialNodeSrc = readFileSync(join(here, 'index.tsx'), 'utf8');
const canvasEditorSrc = readFileSync(join(here, '../../CanvasEditor.tsx'), 'utf8');

test('TC-MUTUAL-01: resolveNodeKind 文本节点手动编辑与生成模式互斥判定', () => {
  // 1. 空状态下无 content/generatedContent -> generate 模式
  assert.equal(resolveNodeKind({ materialType: 'text' }), 'generate');

  // 2. 手动填写内容非空 -> import 模式（文本文件输入，不再支持模型生成）
  assert.equal(resolveNodeKind({ materialType: 'text', nodeKind: 'import', content: '用户手动填写的剧本内容' }), 'import');
  assert.equal(resolveNodeKind({ materialType: 'text', selectedTool: 'text-editor', content: '覆盖为手动内容' }), 'import');
  assert.equal(resolveNodeKind({ materialType: 'text', nodeKind: 'generate', content: 'https://www.tiktok.com/...' }), 'import');

  // 3. 内容清空或纯空白 -> 恢复为 generate 模式（重新支持模型生成）
  assert.equal(resolveNodeKind({ materialType: 'text', nodeKind: 'generate', content: '' }), 'generate');
  assert.equal(resolveNodeKind({ materialType: 'text', selectedTool: 'text-editor', content: '' }), 'generate');
  assert.equal(resolveNodeKind({ materialType: 'text', selectedTool: 'text-editor', content: '   ' }), 'generate');

  // 4. Prompt 模式 -> generate 模式
  assert.equal(resolveNodeKind({ materialType: 'text', prompt: '写一段分镜脚本' }), 'generate');

  // 5. 模型生成产物（generatedContent）未被手动编辑修改时 -> 保持 generate 模式供再次生成
  assert.equal(resolveNodeKind({ materialType: 'text', generatedContent: '模型生成的文本' }), 'generate');
});

test('TC-MUTUAL-02: isConfigPanelVisible 在手动编辑激活时隐藏模型生成面板，清空后重新显示', () => {
  // 手动编辑非空：nodeKind 为 import，生成面板不显示
  const manualNode = { materialType: 'text', nodeKind: 'import', content: '手动文本' };
  const manualKind = resolveNodeKind(manualNode);
  assert.equal(manualKind, 'import');
  assert.equal(isConfigPanelVisible(true, undefined, manualKind), false);

  // 清空文本恢复空状态：nodeKind 为 generate，选中时重新显示生成面板
  const clearedNode = { materialType: 'text', nodeKind: 'generate', content: '' };
  const clearedKind = resolveNodeKind(clearedNode);
  assert.equal(clearedKind, 'generate');
  assert.equal(isConfigPanelVisible(true, undefined, clearedKind), true);
});

test('TC-MUTUAL-03: MaterialNode 卡片内编辑 onChange 与 onPaste 实现模式互斥切换', () => {
  // onChange 中内容非空切换为 import 并清空 prompt，清空时恢复为 generate
  assert.match(materialNodeSrc, /nodeKind:\s*'import'/);
  assert.match(materialNodeSrc, /prompt:\s*undefined/);
  assert.match(materialNodeSrc, /nodeKind:\s*'generate'/);

  // 文本节点 NodeHeader 保持文本图标，不被错误退化为「导入素材」
  assert.match(
    materialNodeSrc,
    /materialType=\{kind === 'import' && materialType !== 'text' \? 'import_asset' : materialType\}/,
  );
});

test('TC-MUTUAL-04: CanvasEditor 中 TextStage 同步器遵循模式互斥与清空恢复契约', () => {
  // TextStage 提交非空内容切换为 import，清空时恢复为 generate
  assert.match(canvasEditorSrc, /nodeKind:\s*trimmed \? 'import' : 'generate'/);
  assert.match(canvasEditorSrc, /selectedTool:\s*'text-editor',\s*prompt:\s*undefined/);
});
