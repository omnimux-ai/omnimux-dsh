import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

// 导入 appLibrary 中的 normalizeWorkflowTopology 与 getPresetWorkflowSnapshot
import {
  normalizeWorkflowTopology,
  getPresetWorkflowSnapshot,
  wrapNodesInGroup,
} from '../plugins/omnimux-workflow/src/client/projects/appLibrary.js';

import { PRESET_WORKFLOW_MAP } from '../plugins/omnimux-workflow/src/client/projects/presetWorkflows.js';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

console.log('================================================================');
console.log('🔍 开始执行 QA 自动化规格合规深度验收脚本');
console.log('================================================================\n');

const EXPECTED_APP_IDS = [
  'app-creatify-3d-cute-vfx',
  'app-creatify-app-demo',
  'app-creatify-apparel-tryon',
  'app-creatify-chasing-product',
  'app-creatify-fall-down-durability',
  'app-creatify-product-spotlight',
  'app-creatify-ugc-selfie',
  'app-builtin-product-video',
  'app-builtin-video-to-prompt',
  'app-builtin-viral-replication',
];

let checkCount = 0;
function pass(desc) {
  checkCount++;
  console.log(`  ✅ [PASS ${checkCount}] ${desc}`);
}

// -------------------------------------------------------------
// 1. 验证 plugins/omnimux-apps/catalog/presets/*.workflow.json 物理文件
// -------------------------------------------------------------
console.log('👉 [Phase 1] 校验 catalog/presets 目录下的 10 套预设 JSON 物理文件...');

const presetsDir = path.join(rootDir, 'plugins/omnimux-apps/catalog/presets');
assert.ok(fs.existsSync(presetsDir), `presetsDir 必须存在: ${presetsDir}`);

for (const appId of EXPECTED_APP_IDS) {
  const filePath = path.join(presetsDir, `${appId}.workflow.json`);
  assert.ok(fs.existsSync(filePath), `预设文件必须存在: ${filePath}`);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  assert.ok(Array.isArray(content.nodes) && content.nodes.length >= 2, `${appId} nodes 必须是非空数组 (>=2)`);
  assert.ok(Array.isArray(content.edges) && content.edges.length >= 1, `${appId} edges 必须是非空数组 (>=1)`);

  const nodeIds = new Set(content.nodes.map(n => n.id));

  // 1.1 连线与 Handle 校验
  for (const edge of content.edges) {
    assert.equal(edge.sourceHandle, 'out', `${appId} 连线 ${edge.id} sourceHandle 必须是 'out'`);
    assert.equal(edge.targetHandle, 'in', `${appId} 连线 ${edge.id} targetHandle 必须是 'in'`);
    assert.ok(nodeIds.has(edge.source), `${appId} 连线 source [${edge.source}] 必须在 nodes 中存在`);
    assert.ok(nodeIds.has(edge.target), `${appId} 连线 target [${edge.target}] 必须在 nodes 中存在`);

    if (edge.source.includes('image')) {
      assert.equal(edge.data?.targetSlot, 'first_frame', `${appId} 图片槽位连线 ${edge.id} 必须指定 targetSlot: 'first_frame'`);
    } else {
      assert.notEqual(edge.data?.targetSlot, 'image', `${appId} 连线 ${edge.id} 不得使用非法的 targetSlot: 'image'`);
      assert.notEqual(edge.data?.targetSlot, 'prompt', `${appId} 连线 ${edge.id} 不得使用非法的 targetSlot: 'prompt'`);
    }
  }

  // 1.2 节点模型与槽位属性校验
  for (const node of content.nodes) {
    if (node.data?.model) {
      assert.equal(node.data.params?.model, node.data.model, `${appId} 节点 ${node.id} params.model 必须与 model 一致`);
      assert.equal(node.data.nodeKind, 'generate', `${appId} 生成节点 ${node.id} nodeKind 必须是 'generate'`);
      if (node.data.materialType === 'text') {
        assert.equal(node.data.model, 'gemini-3.8-flash', `${appId} 文本分析模型必须是 gemini-3.8-flash`);
        assert.equal(node.data.selectedTool, 'text-to-text', `${appId} 文本生成 selectedTool 必须是 text-to-text`);
      } else {
        assert.equal(node.data.model, 'seedance-2.0', `${appId} 视频生成模型必须是 seedance-2.0`);
        assert.equal(node.data.selectedTool, 'omnimux_video_submit', `${appId} 视频生成 selectedTool 必须是 omnimux_video_submit`);
      }
    }
    if (node.data?.isSlot) {
      assert.equal(node.data.nodeKind, 'import', `${appId} 槽位节点 ${node.id} nodeKind 必须是 'import'`);
      assert.equal(node.data.selectedTool, 'import', `${appId} 槽位节点 ${node.id} selectedTool 必须是 'import'`);
      assert.equal(node.data.status, 'completed', `${appId} 槽位节点 ${node.id} status 必须是 'completed'`);
    }
  }

  pass(`物理 JSON 合规: ${appId} (节点: ${content.nodes.length}, 连线: ${content.edges.length})`);
}

// -------------------------------------------------------------
// 2. 验证 presetWorkflows.js 内联地图
// -------------------------------------------------------------
console.log('\n👉 [Phase 2] 校验 presetWorkflows.js 的 PRESET_WORKFLOW_MAP...');

assert.equal(Object.keys(PRESET_WORKFLOW_MAP).length, 10, 'PRESET_WORKFLOW_MAP 必须严格包含 10 套应用预设');

for (const appId of EXPECTED_APP_IDS) {
  const preset = PRESET_WORKFLOW_MAP[appId];
  assert.ok(preset, `PRESET_WORKFLOW_MAP 必须包含 ${appId}`);
  assert.ok(Array.isArray(preset.nodes) && preset.nodes.length >= 2);
  assert.ok(Array.isArray(preset.edges) && preset.edges.length >= 1);

  const nodeIds = new Set(preset.nodes.map(n => n.id));
  for (const edge of preset.edges) {
    assert.equal(edge.sourceHandle, 'out', `presetWorkflows.js ${appId} ${edge.id} sourceHandle 必须为 'out'`);
    assert.equal(edge.targetHandle, 'in', `presetWorkflows.js ${appId} ${edge.id} targetHandle 必须为 'in'`);
    assert.ok(nodeIds.has(edge.source), `presetWorkflows.js ${appId} 连线 source [${edge.source}] 必须在 nodes 中`);
    assert.ok(nodeIds.has(edge.target), `presetWorkflows.js ${appId} 连线 target [${edge.target}] 必须在 nodes 中`);

    if (edge.source.includes('image')) {
      assert.equal(edge.data?.targetSlot, 'first_frame');
    } else {
      assert.notEqual(edge.data?.targetSlot, 'image');
      assert.notEqual(edge.data?.targetSlot, 'prompt');
    }
  }

  for (const node of preset.nodes) {
    if (node.data?.model) {
      assert.equal(node.data.params?.model, node.data.model);
      assert.equal(node.data.nodeKind, 'generate');
      if (node.data.materialType === 'text') {
        assert.equal(node.data.model, 'gemini-3.8-flash');
        assert.equal(node.data.selectedTool, 'text-to-text');
      } else {
        assert.equal(node.data.model, 'seedance-2.0');
        assert.equal(node.data.selectedTool, 'omnimux_video_submit');
      }
    }
    if (node.data?.isSlot) {
      assert.equal(node.data.nodeKind, 'import');
      assert.equal(node.data.selectedTool, 'import');
      assert.equal(node.data.status, 'completed');
    }
  }

  pass(`presetWorkflows.js 映射合规: ${appId}`);
}

// -------------------------------------------------------------
// 3. 验证 builtinCatalogData.ts 源码中的 PRESET_WORKFLOW_SNAPSHOTS
// -------------------------------------------------------------
console.log('\n👉 [Phase 3] 校验 builtinCatalogData.ts 中的内置预设快照...');

const builtinDataPath = path.join(rootDir, 'plugins/omnimux-apps/src/shared/builtinCatalogData.ts');
const builtinTsContent = fs.readFileSync(builtinDataPath, 'utf8');

// 简单正则提取 PRESET_WORKFLOW_SNAPSHOTS
for (const appId of EXPECTED_APP_IDS) {
  assert.ok(builtinTsContent.includes(`"${appId}":`), `builtinCatalogData.ts 必须包含预设 key "${appId}"`);
  pass(`builtinCatalogData.ts 包含预设声明: ${appId}`);
}

// 校验不存在旧版错误的 targetHandle: "image" 或 targetHandle: "prompt"
const badTargetHandleImage = /"targetHandle":\s*"image"/g;
const badTargetHandlePrompt = /"targetHandle":\s*"prompt"/g;
assert.ok(!badTargetHandleImage.test(builtinTsContent), 'builtinCatalogData.ts 绝不能包含 "targetHandle": "image"');
assert.ok(!badTargetHandlePrompt.test(builtinTsContent), 'builtinCatalogData.ts 绝不能包含 "targetHandle": "prompt"');
pass('builtinCatalogData.ts 中 0 处非法 "targetHandle": "image" 或 "targetHandle": "prompt"');

// -------------------------------------------------------------
// 4. 深度验证 normalizeWorkflowTopology 自愈逻辑与边界防御
// -------------------------------------------------------------
console.log('\n👉 [Phase 4] 验证 normalizeWorkflowTopology 自愈逻辑与边界防御...');

// 4.1 空与非数组防御
assert.deepEqual(normalizeWorkflowTopology(null, null), { nodes: [], edges: [] });
assert.deepEqual(normalizeWorkflowTopology(undefined, undefined), { nodes: [], edges: [] });
assert.deepEqual(normalizeWorkflowTopology('bad', 123), { nodes: [], edges: [] });
pass('空/非数组防御测试通过');

// 4.2 非对象元素防御
const rawNodesWithJunk = [null, undefined, 42, 'invalid', { id: 'n1', data: { model: 'seedance-2.0' } }];
const rawEdgesWithJunk = [null, undefined, false, 'edge', { id: 'e1', source: 'n0', target: 'n1' }];
const resJunk = normalizeWorkflowTopology(rawNodesWithJunk, rawEdgesWithJunk);
assert.equal(resJunk.nodes.length, 5);
assert.equal(resJunk.nodes[4].data.params.model, 'seedance-2.0');
assert.equal(resJunk.edges.length, 5);
assert.equal(resJunk.edges[4].sourceHandle, 'out');
assert.equal(resJunk.edges[4].targetHandle, 'in');
pass('脏数组混合非对象元素防御测试通过');

// 4.3 edge.data 为非纯对象（字符串、数组）时的清理
const edgesWithDirtyData = [
  { id: 'e1', source: 's1', target: 't1', data: 'string_data' },
  { id: 'e2', source: 's2', target: 't2', data: [1, 2, 3] },
  { id: 'e3', source: 's3', target: 't3', data: { valid: true } },
];
const resDirtyData = normalizeWorkflowTopology([], edgesWithDirtyData);
assert.equal(resDirtyData.edges[0].data, undefined);
assert.equal(resDirtyData.edges[1].data, undefined);
assert.deepEqual(resDirtyData.edges[2].data, { valid: true });
pass('edge.data 非纯对象展开污染防御测试通过');

// 4.4 node.data.params 为非纯对象（字符串、数组）时的清理与补齐
const nodesWithDirtyParams = [
  { id: 'n1', data: { model: 'seedance-2.0', params: 'string_params' } },
  { id: 'n2', data: { model: 'seedance-2.0', params: [1, 2, 3] } },
];
const resDirtyParams = normalizeWorkflowTopology(nodesWithDirtyParams, []);
assert.deepEqual(resDirtyParams.nodes[0].data.params, { model: 'seedance-2.0' });
assert.deepEqual(resDirtyParams.nodes[1].data.params, { model: 'seedance-2.0' });
pass('node.data.params 非纯对象覆盖补全测试通过');

// 4.5 各种 targetHandle 自愈矩阵
const targetHandleCases = [
  { inHandle: 'image', inData: undefined, expSlot: 'first_frame' },
  { inHandle: 'end_frame', inData: undefined, expSlot: 'end_frame' },
  { inHandle: 'reference', inData: undefined, expSlot: 'reference' },
  { inHandle: 'input', inData: undefined, expSlot: undefined },
  { inHandle: 'prompt', inData: undefined, expSlot: undefined },
  { inHandle: 'reference_image', inData: undefined, expSlot: undefined },
  { inHandle: 'first_last_frame', inData: undefined, expSlot: undefined },
  { inHandle: 'random_unknown', inData: undefined, expSlot: undefined },
  { inHandle: 'image', inData: { targetSlot: 'existing_slot' }, expSlot: 'existing_slot' },
];

for (let i = 0; i < targetHandleCases.length; i++) {
  const tc = targetHandleCases[i];
  const e = { id: `e_${i}`, source: 's', target: 't', targetHandle: tc.inHandle };
  if (tc.inData) e.data = tc.inData;
  const { edges } = normalizeWorkflowTopology([], [e]);
  assert.equal(edges[0].targetHandle, 'in', `case ${i} (${tc.inHandle}) 必须归一化为 in`);
  assert.equal(edges[0].data?.targetSlot, tc.expSlot, `case ${i} (${tc.inHandle}) targetSlot 必须为 ${tc.expSlot}`);
}
pass('targetHandle 全量测试矩阵自愈断言全部通过');

// 4.6 looksLikeSlot 识别矩阵
const slotCases = [
  { data: { isSlot: true }, expKind: 'import' },
  { data: { slotRole: 'custom_role' }, expKind: 'import' },
  { id: 'node-slot-something', data: {} },
  { data: { tool: 'import-image' }, expKind: 'import' },
  { data: { tool: 'prompt-template' }, expKind: 'import' },
];

for (let i = 0; i < slotCases.length; i++) {
  const sc = slotCases[i];
  const n = { id: sc.id || `node_${i}`, data: { ...sc.data, status: 'idle' } };
  const { nodes } = normalizeWorkflowTopology([n], []);
  assert.equal(nodes[0].data.nodeKind, 'import');
  assert.equal(nodes[0].data.selectedTool, 'import');
  assert.equal(nodes[0].data.status, 'completed');
}
pass('looksLikeSlot 全量识别矩阵断言全部通过');

// 4.7 幂等性断言
const validNodes = [
  { id: 'n1', data: { model: 'seedance-2.0', params: { model: 'seedance-2.0' }, nodeKind: 'generate', selectedTool: 'omnimux_video_submit' } }
];
const validEdges = [
  { id: 'e1', source: 's1', sourceHandle: 'out', target: 't1', targetHandle: 'in', data: { targetSlot: 'first_frame' } }
];
const resIdempotent1 = normalizeWorkflowTopology(validNodes, validEdges);
const resIdempotent2 = normalizeWorkflowTopology(resIdempotent1.nodes, resIdempotent1.edges);
assert.deepEqual(resIdempotent1, resIdempotent2);
pass('normalizeWorkflowTopology 绝对幂等性断言通过');

console.log('\n================================================================');
console.log(`🎉 全部 ${checkCount} 项 QA 自动化规格断言 100% 顺利通过！`);
console.log('================================================================\n');
