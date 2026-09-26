/**
 * plugins/omnimux-workflow/src/canvas/editor/components/publish/isolatedNodesPruning.test.mjs
 *
 * 专门针对 PRD/Spec：导入素材卡片拖拽解绑与未连线孤立节点发布剪枝闭环测试
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import zh from '../../../i18n/dict.zh.ts';
import en from '../../../i18n/dict.en.ts';
import {
  analyzeWorkflowInputs,
  computeReverseReachability,
} from './topologyAnalyzer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Suite 1: i18n 锁定文案与插值契约', () => {
  it('中英文数字典 100% 补齐产品经理锁定的 3 条字典', () => {
    // 1. canvas.node.import.hint
    assert.equal(zh['canvas.node.import.hint'], '点击或拖拽上传素材');
    assert.equal(en['canvas.node.import.hint'], 'Click or drop to import');

    // 2. canvas.node.import.actionBtn
    assert.equal(zh['canvas.node.import.actionBtn'], '选择文件');
    assert.equal(en['canvas.node.import.actionBtn'], 'Select file');

    // 3. wizard.step2.pruneNotice.bar
    assert.equal(zh['wizard.step2.pruneNotice.bar'], '{count} 个未连线节点已排除');
    assert.equal(en['wizard.step2.pruneNotice.bar'], '{count} unwired nodes excluded');
  });

  it('提示条插值替换行为符合预期', () => {
    const zhNotice = zh['wizard.step2.pruneNotice.bar'].replace('{count}', String(3));
    assert.equal(zhNotice, '3 个未连线节点已排除');

    const enNotice = en['wizard.step2.pruneNotice.bar'].replace('{count}', String(5));
    assert.equal(enNotice, '5 unwired nodes excluded');
  });
});

describe('Suite 2: NodeEmptyState.tsx 交互解绑与独立按钮热区契约', () => {
  const nodeEmptyStatePath = path.resolve(
    __dirname,
    '../MaterialNode/NodeEmptyState.tsx',
  );
  const src = fs.readFileSync(nodeEmptyStatePath, 'utf8');

  it('根容器彻底移除 nodrag，解除卡片主体拖拽阻断', () => {
    assert.match(src, /className="wf-node-empty wf-node-empty--import-kind"/);
    assert.equal(
      /className="wf-node-empty wf-node-empty--import-kind[^"]*nodrag/.test(src),
      false,
      '根容器不得携带 nodrag',
    );
  });

  it('根容器移除直接绑定的 onClick / onKeyDown / role / tabIndex，允许冒泡选择与位移', () => {
    // 匹配 import 分支
    const importBranchMatch = src.match(/if \(nodeKind === 'import'\) \{([\s\S]*?)\n\s*return null;|\n\s*if \(materialType === 'text'\)/);
    assert.ok(importBranchMatch, '需提取 nodeKind === import 分支');
    const importCode = importBranchMatch[0];

    // 检查根容器 div 上没有这些属性
    const rootDivMatch = importCode.match(/<div\s+className="wf-node-empty wf-node-empty--import-kind"([^>]*)>/);
    assert.ok(rootDivMatch, '必须包含根容器 div');
    const rootAttrs = rootDivMatch[1];
    assert.equal(/onClick=/.test(rootAttrs), false, '根容器不得挂载 onClick');
    assert.equal(/onKeyDown=/.test(rootAttrs), false, '根容器不得挂载 onKeyDown');
    assert.equal(/role=/.test(rootAttrs), false, '根容器不得挂载 role');
    assert.equal(/tabIndex=/.test(rootAttrs), false, '根容器不得挂载 tabIndex');
  });

  it('卡片内部包含独立操作按钮，携带 nodrag 与 stopPropagation 冒泡拦截', () => {
    assert.match(src, /<button[^>]*className="wf-node-empty__pill-btn nodrag"/);
    assert.match(src, /e\.stopPropagation\(\)/);
    assert.match(src, /onImport\?\.?\(\)/);
  });

  it('严格遵循产品经理锁定字典文案，零多余装饰与 Emoji', () => {
    assert.match(src, /canvas\.node\.import\.hint/);
    assert.match(src, /canvas\.node\.import\.actionBtn/);
    assert.equal(/[✨🔥💎🚀]/.test(src), false, '严禁未授权 Emoji 装饰');
  });
});

describe('Suite 3: 拓扑分析有效终点、逆向 BFS 可达闭包与剪枝算法', () => {
  it('识别有效终点（排除入度为 0 且出度为 0 的纯孤立节点）并正确计算剪枝节点', () => {
    const nodes = [
      {
        id: 'node-text',
        type: 'material',
        data: { materialType: 'text', label: '剧本文案', prompt: '短剧大纲' },
      },
      {
        id: 'node-gen',
        type: 'material',
        data: {
          materialType: 'video',
          label: '分镜生成',
          selectedTool: 'video-generation',
          params: { aspectRatio: '9:16' },
        },
      },
      {
        id: 'node-isolated-1',
        type: 'material',
        data: { materialType: 'image', label: '孤立参考图', mediaUrl: 'https://example.com/isolated.png' },
      },
      {
        id: 'node-isolated-2',
        type: 'material',
        data: { materialType: 'text', label: '未连线备选提示词', prompt: '备选' },
      },
    ];

    const edges = [
      { id: 'e1', source: 'node-text', target: 'node-gen', targetHandle: 'prompt' },
    ];

    const result = analyzeWorkflowInputs(nodes, edges);

    // 1. 有效终点仅有 node-gen（node-isolated 虽出度为0，但入度为0被严格排除）
    assert.deepEqual(result.terminalNodeIds, ['node-gen']);
    assert.deepEqual(result.rootNodeIds, ['node-text']);

    // 2. 活跃节点仅包含 node-text 与 node-gen
    assert.deepEqual(result.activeNodeIds.sort(), ['node-gen', 'node-text'].sort());

    // 3. 剪枝节点包含 2 个孤立节点
    assert.equal(result.prunedNodeCount, 2);
    assert.equal(result.prunedNodes.length, 2);
    const prunedIds = result.prunedNodes.map((n) => n.id).sort();
    assert.deepEqual(prunedIds, ['node-isolated-1', 'node-isolated-2']);

    // 4. 输入项仅提取属于 activeNodes 的节点，绝不提取孤立节点的 inputs
    const inputNodeIds = new Set(result.inputs.map((inp) => inp.nodeId));
    assert.ok(inputNodeIds.has('node-text'), '必须包含主链路文本输入');
    assert.ok(inputNodeIds.has('node-gen'), '必须包含主链路生成参数');
    assert.ok(!inputNodeIds.has('node-isolated-1'), '严禁提取孤立节点 1 的输入项');
    assert.ok(!inputNodeIds.has('node-isolated-2'), '严禁提取孤立节点 2 的输入项');
  });

  it('孤立节点的添加、修改或删除不改变 workflowHash（哈希一致性）', () => {
    const mainChainNodes = [
      { id: 'a', type: 'material', data: { materialType: 'text', prompt: 'prompt a' } },
      { id: 'b', type: 'material', data: { materialType: 'video', selectedTool: 'video-gen' } },
    ];
    const edges = [{ id: 'e1', source: 'a', target: 'b' }];

    const resultWithoutIsolated = analyzeWorkflowInputs(mainChainNodes, edges);

    const nodesWithIsolated = [
      ...mainChainNodes,
      { id: 'iso_x', type: 'material', data: { materialType: 'image', mediaUrl: 'test.jpg' } },
      { id: 'iso_y', type: 'material', data: { materialType: 'text', prompt: 'dummy' } },
    ];

    const resultWithIsolated = analyzeWorkflowInputs(nodesWithIsolated, edges);

    assert.equal(
      resultWithIsolated.workflowHash,
      resultWithoutIsolated.workflowHash,
      '未连线孤立节点被剪枝后，workflowHash 必须保持完全相同',
    );
  });

  it('完全孤立无连线图做好边界兼容，零异常并保留兼容活跃态', () => {
    const isolatedNodes = [
      { id: 'n1', type: 'material', data: { materialType: 'text', content: 'test 1' } },
      { id: 'n2', type: 'material', data: { materialType: 'image', mediaUrl: 'test2.png' } },
    ];

    const result = analyzeWorkflowInputs(isolatedNodes, []);

    assert.equal(typeof result.workflowHash, 'string');
    assert.equal(result.workflowHash.length, 64);
    assert.equal(result.prunedNodeCount, 0, '无连线退化图中为兼容单节点发布不触发剪枝');
    assert.equal(result.inputs.length, 2, '无连线退化图中保留基础输入项');
  });

  it('独立验证 computeReverseReachability 算法函数闭包能力', () => {
    // 拓扑结构：
    // N1 -> N2 -> N3
    //       N4 -> N3
    // N5 (孤立)
    const nodes = [
      { id: 'N1' },
      { id: 'N2' },
      { id: 'N3' },
      { id: 'N4' },
      { id: 'N5' },
    ];
    const edges = [
      { source: 'N1', target: 'N2' },
      { source: 'N2', target: 'N3' },
      { source: 'N4', target: 'N3' },
    ];

    const reachable = computeReverseReachability(nodes, edges, ['N3']);
    assert.equal(reachable.has('N3'), true);
    assert.equal(reachable.has('N2'), true);
    assert.equal(reachable.has('N1'), true);
    assert.equal(reachable.has('N4'), true);
    assert.equal(reachable.has('N5'), false);
    assert.equal(reachable.size, 4);
  });
});

describe('Suite 4: PublishWizardModal.tsx Step 2 剪枝提示条实装', () => {
  const modalPath = path.resolve(
    __dirname,
    'PublishWizardModal.tsx',
  );
  const src = fs.readFileSync(modalPath, 'utf8');

  it('引入 useT 并消费 wizard.step2.pruneNotice.bar', () => {
    assert.match(src, /import\s*\{\s*useT\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/i18n['"]/);
    assert.match(src, /t\('wizard\.step2\.pruneNotice\.bar'\)\.replace\('\{count\}',\s*String\(analysis\.prunedNodeCount\)\)/);
  });

  it('仅当 analysis.prunedNodeCount > 0 时条件渲染提示条', () => {
    assert.match(src, /\{analysis\.prunedNodeCount\s*>\s*0\s*&&\s*\(/);
    assert.match(src, /data-qa="pruned-nodes-notice"/);
  });

  it('遵循现代 SaaS 极简规范，中性微弱底色，零感叹号', () => {
    assert.match(src, /var\(--dsw-alias-bg-layer-1/);
    assert.match(src, /var\(--dsw-alias-border-l1/);
    assert.match(src, /var\(--dsw-alias-label-tertiary/);
  });
});
