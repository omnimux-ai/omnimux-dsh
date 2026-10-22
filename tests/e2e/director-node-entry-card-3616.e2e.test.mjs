/**
 * tests/e2e/director-node-entry-card-3616.e2e.test.mjs
 *
 * #3616 契约：3D 导演台节点只做入口卡（不再有封面/描述输入），
 * 导演台内每次「截图」新建独立画布图片节点并连线到导演台，关闭不再回写当前节点。
 *
 * 真实浏览器证据见 docs/evidence/2026-10-22-director-node-card-3616/（本用例只锁源码契约）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const NODE_FILE = 'plugins/omnimux-workflow/src/canvas/nodes/definitions/director.tsx';
const THEME_FILE = 'plugins/omnimux-workflow/src/canvas/theme/director.css';
const PANEL_FILE = 'plugins/omnimux-workflow/src/canvas/components/director-panel/DirectorPanel.tsx';
const WORKBENCH_FILE = 'plugins/omnimux-workflow/src/director/vendor/components/canvas-director-workbench.tsx';
const CONTRACT_FILE = 'plugins/omnimux-workflow/src/director/contract.ts';
const PLAN_FILE = 'plugins/omnimux-workflow/src/canvas/bridge/directorOutputPlan.ts';

test('E2E: 导演台节点卡是入口引导卡，不再承载封面与描述输入', () => {
  const node = read(NODE_FILE);
  assert.doesNotMatch(node, /<img\b/, '节点卡不得再渲染封面 <img>');
  assert.doesNotMatch(node, /<textarea\b/, '节点卡不得再渲染描述 <textarea>');
  assert.doesNotMatch(node, /coverUrl/, '节点卡不得再读取 coverUrl');
  assert.doesNotMatch(node, /data\.description/, '节点卡不得再读取 description');
  assert.match(node, /wf-director-card__icon/, '必须有入口卡图标');
  assert.match(node, /wf-director-card__title">3D 导演台</, '必须有入口卡标题');
  assert.match(node, /wf-director-card__caption">在 3D 空间中搭建场景并进行多视角截图。</, '必须有入口卡说明文案');
  assert.match(node, /wf-director-card__cta[^>]*>打开导演台</, '必须有打开导演台按钮');
  assert.match(node, /showRightHandle/, '必须保留右侧连接桩以便连线截图节点');
  assert.match(node, /\{ side: 'out', acceptedTypes: \['image'\] \}/, '导演台节点必须声明图片输出端口');

  const theme = read(THEME_FILE);
  assert.doesNotMatch(theme, /wf-director-card__cover/, '样式不得再保留封面规则');
  assert.doesNotMatch(theme, /wf-director-card__description/, '样式不得再保留描述输入规则');
  assert.match(theme, /\.wf-director-card__cta\s*\{/, '必须保留入口按钮样式');
});

test('E2E: 关闭导演台不再截图回写当前节点', () => {
  const workbench = read(WORKBENCH_FILE);
  assert.doesNotMatch(workbench, /onCaptureCover|onShouldCaptureCover/, 'workbench 不得再保留封面捕获接线');
  const panel = read(PANEL_FILE);
  assert.doesNotMatch(panel, /captureCover/, 'DirectorPanel 不得再实现 captureCover 适配器');
  assert.doesNotMatch(panel, /coverStorageKey|coverRevision/, 'DirectorPanel 不得再写封面字段');
  const contract = read(CONTRACT_FILE);
  assert.doesNotMatch(contract, /captureCover|shouldCaptureCover/, '契约不得再暴露封面适配器');
});

test('E2E: 每次截图新建独立图片节点并连线到导演台', () => {
  const workbench = read(WORKBENCH_FILE);
  assert.match(workbench, /onAddScreenshotNode\(\{/, '截图成功路径必须请求画布出口');
  assert.match(workbench, /screenshotId: screenshot\.id/, '截图出口必须携带截图身份');
  const panel = read(PANEL_FILE);
  assert.match(panel, /addScreenshotNode: async \(input, context\)/, 'DirectorPanel 必须实现截图出口适配器');
  assert.match(panel, /freshNodeId: crypto\.randomUUID\(\)/, '每次截图必须使用新的节点 id');
  assert.match(panel, /sourceHandle: 'out', targetHandle: 'in'/, '新节点必须用 out→in 连线到导演台');
  assert.match(panel, /setEdges\(/, '新节点必须写入画布连线');
  assert.match(panel, /rolledBackNodeIds/, '保存失败时只在节点确实回滚后才删边，避免留下无连线孤儿节点');
  const contract = read(CONTRACT_FILE);
  assert.match(contract, /addScreenshotNode\?\(/, '契约必须声明 addScreenshotNode');
  const plan = read(PLAN_FILE);
  assert.match(plan, /freshNodeId\?: string/, 'planner 必须支持 fresh 节点 id');
  assert.match(plan, /导演新节点只支持单张截图/, 'fresh 模式必须拒绝非单张截图');
});
