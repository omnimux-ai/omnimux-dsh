/**
 * plugins/omnimux-workflow/tests/e2e/preset-operation-3206.e2e.test.mjs
 *
 * Issue #3206 端到端契约：内置 AI 应用「手机与网页交互实机演示」（appId `app-creatify-app-demo`）
 * 的视频生成节点必须显式声明生成方式 `operation`，副本画布不得再出现「素材不可用，请替换或重试」。
 *
 * 覆盖两层，均为真实判据，不依赖接口 200 或截图存在：
 *
 *  A. 生产行为断言（真实模块 + 随包模板数据）
 *     读取随包发布的 `catalog/presets/app-creatify-app-demo.workflow.json`，把它的节点/连线交给
 *     真实 `recomputeCanvasSlots`（副本画布导入图时唯一的槽位/冲突计算入口）：
 *       - `data.params.operation` 必须等于 `first_frame`，且不得残留 `params.mode`；
 *       - `data.slotConflicts` 必须为空（修复前这里是 `slot_removed`）；
 *       - `data.compat.readyToSubmit` 必须为 true（最小输入满足可提交）。
 *     并附带**反向对照**：把同一节点还原成修复前的 `params.mode` 形状后，同一函数必须产出
 *     `slot_removed` 冲突 —— 证明该判据真的能抓住这个回归，而不是恒真。
 *
 *  B. 真实浏览器功能旅程（真实 Chrome，隔离工作树应用级验收运行器）
 *     运行 `preset-operation-3206.journey.mjs`：在真实运行页面里断言随包发布的内置应用入口
 *     存在、探索页「AI应用」面板渲染出真实一级应用清单，并留存功能场景截图。
 *
 * 未覆盖项（如实声明）：当前构建把该 appId 以**创作模板卡片**形式发布，「AI应用」面板一级清单
 * 不含它，因此「应用卡片 → 创建副本 → 副本画布」这条应用页点击旅程不可达，本用例不做该断言；
 * 副本画布的冲突回归由 A 层在同一份随包数据上覆盖。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PRESET_PATH = join(root, 'plugins/omnimux-apps/catalog/presets/app-creatify-app-demo.workflow.json');
const JOURNEY_PATH = join(root, 'plugins/omnimux-workflow/tests/e2e/preset-operation-3206.journey.mjs');

/** 随包发布的内置应用模板（副本画布的图数据真源）。 */
function readShippedPreset() {
  const preset = JSON.parse(readFileSync(PRESET_PATH, 'utf8'));
  const videoNode = preset.nodes.find((node) => node.data?.materialType === 'video');
  assert.ok(videoNode, '随包模板必须含视频生成节点');
  return { preset, videoNode };
}

/** 生产环境的画布槽位/冲突计算入口（与副本画布导入图时同一份代码）。 */
async function loadProductionSeams() {
  const { buildModelCatalog } = await import(join(root, 'plugins/omnimux/src/catalog/list.js'));
  const { recomputeCanvasSlots } = await import(
    join(root, 'plugins/omnimux-workflow/src/shared/graph/canvasSlotRecompute.ts')
  );
  const catalog = buildModelCatalog({ env: {} });
  assert.ok(catalog?.models?.length, '中枢模型目录不可用，无法判定 operation 合法性');
  return { recomputeCanvasSlots, catalog };
}

test('E2E #3206: 随包内置应用模板的视频节点显式声明 operation，副本画布无槽位冲突且可提交', async () => {
  const { preset, videoNode } = readShippedPreset();
  const { recomputeCanvasSlots, catalog } = await loadProductionSeams();
  const graph = { nodes: preset.nodes, edges: preset.edges };

  // 随包数据层：不得再有旧的 params.mode，必须显式写 operation。
  assert.equal(videoNode.data.params.mode, undefined, '模板不得残留 params.mode（代码只读 params.operation）');
  assert.equal(videoNode.data.params.operation, 'first_frame', '视频节点必须显式声明首帧生成方式');

  // 真实计算层：副本画布导入该图后不得产生任何槽位冲突。
  const fixed = recomputeCanvasSlots(videoNode, graph, { catalog });
  assert.equal(fixed.data.params.operation, 'first_frame', '计算后 operation 必须仍为首帧');
  assert.equal(fixed.data.params.mode, undefined, '计算不得把首帧写回 params.mode');
  assert.deepEqual(fixed.data.slotConflicts, [], `副本画布不得有槽位冲突（wf-input-conflict 的来源）`);
  assert.equal(
    fixed.data.compat?.readyToSubmit,
    true,
    `最小输入应满足可提交，实际 reasonCodes=${JSON.stringify(fixed.data.compat?.reasonCodes)}`,
  );
  assert.deepEqual(
    fixed.data.compat?.reasonCodes ?? [],
    [],
    '可提交状态下不应残留任何阻塞原因码（含 slot_removed / role_conflict）',
  );

  // 连线仍必须落在该 operation 的真实槽位集合内。
  const boundSlots = Object.keys(fixed.data.slotBindings ?? {});
  assert.ok(boundSlots.includes('first_frame'), `商品图连线应绑定到 first_frame 槽位，实际 ${JSON.stringify(boundSlots)}`);
});

test('E2E #3206: 反向对照——还原修复前的 params.mode 形状后，同一计算入口必须报出 slot_removed 冲突', async () => {
  const { preset, videoNode } = readShippedPreset();
  const { recomputeCanvasSlots, catalog } = await loadProductionSeams();

  // 还原修复前形状：首帧写在 params.mode，params.operation 缺失。
  const legacyParams = { ...videoNode.data.params, mode: 'first_frame' };
  delete legacyParams.operation;
  const legacyNode = { ...videoNode, data: { ...videoNode.data, params: legacyParams, slotBindings: undefined, slotConflicts: undefined } };
  const legacy = recomputeCanvasSlots(legacyNode, { nodes: [legacyNode, ...preset.nodes.filter((n) => n.id !== videoNode.id)], edges: preset.edges }, { catalog });

  const reasons = (legacy.data.slotConflicts ?? []).map((conflict) => conflict.reason);
  assert.notEqual(legacy.data.params.operation, 'first_frame',
    '修复前形状下代码无法从 params.mode 读出首帧，operation 必然不是 first_frame');
  assert.ok(reasons.length > 0,
    '修复前形状必须在副本画布上产生槽位冲突（否则本用例无法抓住该回归）');
  assert.ok(reasons.includes('slot_removed'),
    `修复前形状的冲突原因应为 slot_removed，实际 ${JSON.stringify(reasons)}`);
  assert.notEqual(legacy.data.compat?.readyToSubmit, true,
    '修复前形状下最小输入不满足，不得判定为可提交');
});

test('E2E #3206: 真实浏览器功能旅程——内置应用随包发布且探索页应用清单真实渲染', async () => {
  const { runWorktreeAppQa } = await import(join(root, 'scripts/worktree-app-qa.mjs'));
  const report = await runWorktreeAppQa({ root, mode: 'ui', journey: JOURNEY_PATH });

  const journeyAssertions = (report.assertions ?? []).filter((item) => String(item.name).startsWith('journey:'));
  assert.ok(journeyAssertions.length >= 4,
    `真实浏览器旅程应产出断言，实际 ${journeyAssertions.length} 条；errors=${JSON.stringify(report.errors)}`);
  assert.deepEqual(
    journeyAssertions.filter((item) => !item.pass).map((item) => item.name),
    [],
    `真实浏览器旅程存在失败断言：${JSON.stringify(journeyAssertions.filter((item) => !item.pass))}`,
  );
  assert.equal(report.pass, true,
    `隔离工作树应用级验收必须整体通过；errors=${JSON.stringify(report.errors)}`);
  assert.ok(report.screenshot?.bytes > 0, '必须留存可解码的真实浏览器截图');
});
