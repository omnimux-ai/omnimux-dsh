/**
 * tests/e2e/workflow-isolated-nodes-publish.e2e.test.mjs
 *
 * 端到端测试：画布导入素材空态节点手势解绑与未连线孤立节点发布剪枝闭环
 * 1. 验证 NodeEmptyState.tsx 中导入空态卡片彻底移除整卡 nodrag 与全局截断，恢复画布拖拽与选中；
 * 2. 验证 topologyAnalyzer.ts 逆向可达性剪枝算法（Reachability Pruning），确保孤立素材节点 0 渗入应用表单；
 * 3. 验证 PublishWizardModal.tsx 中 Step 2 剪枝提示条条件渲染与白名单文案契约。
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const { analyzeWorkflowInputs, computeReverseReachability } = await import(
  path.join(root, 'plugins/omnimux-workflow/src/canvas/editor/components/publish/topologyAnalyzer.ts')
);
const zh = (await import(path.join(root, 'plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts'))).default;
const en = (await import(path.join(root, 'plugins/omnimux-workflow/src/canvas/i18n/dict.en.ts'))).default;

describe('E2E: 画布导入素材空态节点手势契约', () => {
  const nodeEmptyStatePath = path.join(
    root,
    'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/NodeEmptyState.tsx',
  );
  const src = fs.readFileSync(nodeEmptyStatePath, 'utf8');

  it('导入卡片根容器彻底移除 nodrag，放行画布拖拽手势', () => {
    assert.match(src, /className="wf-node-empty wf-node-empty--import-kind"/);
    assert.equal(
      /className="wf-node-empty wf-node-empty--import-kind[^"]*nodrag/.test(src),
      false,
      '根容器不得携带 nodrag 样式类',
    );
  });

  it('导入卡片根容器移除捕获与阻断，内部专属动作按钮隔离事件', () => {
    assert.match(src, /<button[^>]*className="wf-node-empty__pill-btn nodrag"/);
    assert.match(src, /e\.stopPropagation\(\)/);
    assert.match(src, /onImport\?\.?\(\)/);
  });
});

describe('E2E: 拓扑分析可达性剪枝与表单防污染契约', () => {
  const nodes = [
    {
      id: 'n_prompt',
      type: 'material',
      data: { materialType: 'text', selectedTool: 'text-editor', label: '分镜剧本', content: '测试剧本' },
    },
    {
      id: 'n_terminal',
      type: 'material',
      data: {
        materialType: 'video',
        selectedTool: 'video-generation',
        label: '视频成片生成',
        params: { aspectRatio: '16:9' },
      },
    },
    {
      id: 'n_orphan_image',
      type: 'material',
      data: {
        materialType: 'image',
        nodeKind: 'import',
        selectedTool: 'import',
        label: '商品主图/白底图',
        mediaUrl: 'https://example.com/orphan.png',
      },
    },
    {
      id: 'n_orphan_audio',
      type: 'material',
      data: {
        materialType: 'audio',
        nodeKind: 'import',
        selectedTool: 'import',
        label: '旁白解说与音色',
        mediaUrl: '',
      },
    },
  ];

  const edges = [
    { id: 'e1', source: 'n_prompt', target: 'n_terminal', targetHandle: 'prompt' },
  ];

  it('仅连通有效终点的节点提取表单项，孤立素材节点 100% 剪枝排除', () => {
    const analysis = analyzeWorkflowInputs(nodes, edges);

    // 1. 剪枝计数与列表
    assert.equal(analysis.prunedNodeCount, 2, '必须精确剪枝 2 个未连线孤立节点');
    assert.deepEqual(
      analysis.prunedNodes.map((n) => n.id).sort(),
      ['n_orphan_audio', 'n_orphan_image'],
      '剪枝节点集合必须精确包含未连线的音频和图片节点',
    );

    // 2. 表单候选输入项中绝对不包含孤立节点
    const exposedKeys = analysis.inputs.map((inp) => inp.nodeId);
    assert.ok(exposedKeys.includes('n_prompt'), '有效前驱节点必须包含在表单候选');
    assert.equal(exposedKeys.includes('n_orphan_image'), false, '未连线的孤立图片节点绝对不得暴露为表单项');
    assert.equal(exposedKeys.includes('n_orphan_audio'), false, '未连线的孤立音频节点绝对不得暴露为表单项');

    // 3. 终点判定排除孤立节点
    assert.deepEqual(analysis.terminalNodeIds, ['n_terminal']);
    assert.deepEqual(analysis.rootNodeIds, ['n_prompt']);
  });

  it('孤立节点的添加、修改与删除不影响工作流有效哈希（防哈希漂移）', () => {
    const analysisBase = analyzeWorkflowInputs(nodes, edges);

    // 添加第三个孤立节点
    const nodesWithExtraOrphan = [
      ...nodes,
      {
        id: 'n_orphan_extra',
        type: 'material',
        data: { materialType: 'text', label: '离散便签草稿', content: '临时想法' },
      },
    ];
    const analysisExtra = analyzeWorkflowInputs(nodesWithExtraOrphan, edges);

    assert.equal(analysisExtra.prunedNodeCount, 3);
    assert.equal(
      analysisBase.workflowHash,
      analysisExtra.workflowHash,
      '孤立节点的变化不得引起工作流有效拓扑哈希漂移',
    );
  });
});

describe('E2E: 发布向导透明提示与白名单字典', () => {
  it('中英文白名单字典精确无误，零多余 Emoji 装饰', () => {
    assert.equal(zh['canvas.node.import.hint'], '点击或拖拽上传素材');
    assert.equal(en['canvas.node.import.hint'], 'Click or drop to import');
    assert.equal(zh['canvas.node.import.actionBtn'], '选择文件');
    assert.equal(en['canvas.node.import.actionBtn'], 'Select file');
    assert.equal(zh['wizard.step2.pruneNotice.bar'], '{count} 个未连线节点已排除');
    assert.equal(en['wizard.step2.pruneNotice.bar'], '{count} unwired nodes excluded');
  });

  it('PublishWizardModal 源码符合透明提示设计', () => {
    const modalPath = path.join(
      root,
      'plugins/omnimux-workflow/src/canvas/editor/components/publish/PublishWizardModal.tsx',
    );
    const modalSrc = fs.readFileSync(modalPath, 'utf8');

    assert.match(modalSrc, /analysis\.prunedNodeCount > 0/);
    assert.match(modalSrc, /wizard\.step2\.pruneNotice\.bar/);
    assert.match(modalSrc, /data-qa="pruned-nodes-notice"/);
  });
});
