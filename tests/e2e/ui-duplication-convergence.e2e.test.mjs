import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E-1: 模型选择器单一真源与 Market 幽灵死代码物理消除', () => {
  // 1. 确认 omnimux-market 源码与构建输出中彻底不存在 model-picker.js
  const marketModelPickerPath = path.join(root, 'plugins/omnimux-market/src/client/model-picker.js');
  assert.equal(fs.existsSync(marketModelPickerPath), false, 'Market 插件的 model-picker.js 必须被物理删除');

  const marketClientJsPath = path.join(root, 'plugins/omnimux-market/lib/client.js');
  const marketClientJs = fs.readFileSync(marketClientJsPath, 'utf-8');
  assert.ok(!marketClientJs.includes('data-omnimux-model-picker'), 'Market 构建产物中不得包含 model-picker 标记');

  // 2. 确认宿主 ModelPicker 正常挂载并具备全局互斥事件协同
  const hostModelPickerPath = path.join(root, 'plugins/omnimux/src/client/composer-quick-shortcuts/ModelPicker.jsx');
  const hostModelPicker = fs.readFileSync(hostModelPickerPath, 'utf-8');
  assert.ok(hostModelPicker.includes('omnimux:composer:overlay:open'), '宿主 ModelPicker 必须集成浮层互斥事件');
  assert.ok(hostModelPicker.includes("detail: { id: 'model-picker' }"), '宿主 ModelPicker 广播浮层 ID 必须为 model-picker');
});

test('E2E-2: 爆款推荐算法引擎单一真源收敛与跨域桥接', () => {
  const hostRecPath = path.join(root, 'plugins/omnimux/src/client/session-guide/trending/recommendation-engine.js');
  const hostRec = fs.readFileSync(hostRecPath, 'utf-8');
  assert.ok(
    hostRec.includes('omnimux-inspiration/src/recommendation-engine.js'),
    '宿主 recommendation-engine 必须直接从 omnimux-inspiration 单一真源导出'
  );

  const inspirationRecPath = path.join(root, 'plugins/omnimux-inspiration/src/recommendation-engine.js');
  assert.ok(fs.existsSync(inspirationRecPath), '灵感库算法真源必须存在');
});

test('E2E-3: 新建产品分流菜单单一真源收敛与资产库副本清除', () => {
  const assetsMenuPath = path.join(root, 'plugins/omnimux-assets/src/client/CreateProductMenu.jsx');
  const assetsMenu = fs.readFileSync(assetsMenuPath, 'utf-8');
  assert.ok(
    assetsMenu.includes('omnimux-products/src/client/CreateProductMenu.jsx'),
    '资产库 CreateProductMenu 必须直接从 omnimux-products 单一真源导出'
  );

  const productsMenuPath = path.join(root, 'plugins/omnimux-products/src/client/CreateProductMenu.jsx');
  const productsMenu = fs.readFileSync(productsMenuPath, 'utf-8');
  assert.ok(productsMenu.includes('label'), '商品库原生 CreateProductMenu 必须支持 label 属性解构与透传');
});

test('E2E-4: 删除二次确认弹窗原生 ConfirmModal 替代与薄包装清除', () => {
  // 确认三处冗余的 ConfirmRemoveDialog.jsx 均已被物理删除
  const p1 = path.join(root, 'plugins/omnimux-assets/src/client/ConfirmRemoveDialog.jsx');
  const p2 = path.join(root, 'plugins/omnimux-inspiration/src/client/ConfirmRemoveDialog.jsx');
  const p3 = path.join(root, 'plugins/omnimux-products/src/client/ConfirmRemoveDialog.jsx');
  assert.equal(fs.existsSync(p1), false, '资产库 ConfirmRemoveDialog 必须已删除');
  assert.equal(fs.existsSync(p2), false, '灵感库 ConfirmRemoveDialog 必须已删除');
  assert.equal(fs.existsSync(p3), false, '商品库 ConfirmRemoveDialog 必须已删除');

  // 确认调用方直接内联了 ConfirmModal
  const assetsStage = fs.readFileSync(path.join(root, 'plugins/omnimux-assets/src/client/AssetsStage.jsx'), 'utf-8');
  assert.ok(assetsStage.includes('<ConfirmModal'), '资产库 Stage 必须直接内联使用 ConfirmModal');

  const productsStage = fs.readFileSync(path.join(root, 'plugins/omnimux-products/src/client/ProductsStage.jsx'), 'utf-8');
  assert.ok(productsStage.includes('<ConfirmModal'), '商品库 Stage 必须直接内联使用 ConfirmModal');

  const inspSection = fs.readFileSync(path.join(root, 'plugins/omnimux-inspiration/src/client/InspirationSection.jsx'), 'utf-8');
  assert.ok(inspSection.includes('<ConfirmModal'), '灵感库 Section 必须直接内联使用 ConfirmModal');
});

test('E2E-5: 资产库瀑布流算法收敛至 library-flow 统一内核', () => {
  const assetsMasonry = fs.readFileSync(path.join(root, 'plugins/omnimux-assets/src/client/masonry.js'), 'utf-8');
  assert.ok(
    assetsMasonry.includes('omnimux/src/client/components/library-flow/masonry-layout.js'),
    '资产库 masonry.js 算法必须桥接自 library-flow 统一内核'
  );
});
