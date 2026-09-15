import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E: 分类筛选胶囊选中激活态文字加粗与全圆角规格', () => {
  const assetsStylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js');
  const assetsStyles = fs.readFileSync(assetsStylesPath, 'utf-8');
  assert.ok(
    assetsStyles.includes('font-weight: 600;') && assetsStyles.includes('border-radius: 999px;'),
    '资产库分类筛选胶囊必须具备 999px 胶囊圆角与 font-weight: 600 加粗字重'
  );

  const marketCssPath = path.join(root, 'plugins/omnimux-market/src/client/css.js');
  const marketCss = fs.readFileSync(marketCssPath, 'utf-8');
  assert.ok(
    marketCss.includes('.cat-btn.active') && marketCss.includes('font-weight:600'),
    '技能市场分类筛选胶囊激活态必须具备 font-weight:600 加粗字重'
  );
});

test('E2E: 筛选下拉选择器遵循纯实体名与「全部」重置首项黄金契约', () => {
  const accountsFilterBarPath = path.join(root, 'plugins/omnimux-accounts/src/client/FilterBar.jsx');
  const accountsFilterBar = fs.readFileSync(accountsFilterBarPath, 'utf-8');
  assert.ok(
    !accountsFilterBar.includes('全部平台') && !accountsFilterBar.includes("${t('platform')} · ${t('all')}"),
    '账号中心 FilterBar 严禁出现「全部平台」或「平台 · 全部」拼接语病'
  );
  assert.ok(
    accountsFilterBar.includes("label: t('all')"),
    '账号中心 FilterBar 首项必须唯一为「全部」'
  );

  const inspirationLocalesPath = path.join(root, 'plugins/omnimux-inspiration/src/client/locales.js');
  const inspirationLocales = fs.readFileSync(inspirationLocalesPath, 'utf-8');
  assert.ok(
    inspirationLocales.includes("'platform.all': '全部',") &&
    inspirationLocales.includes("'platform.all': 'All',"),
    '对标灵感中英文 locales 中 platform.all 必须为「全部」与「All」'
  );
});

test('E2E: 删除确认弹窗明确提示被删除目标与关联资产', () => {
  const productsDialogPath = path.join(root, 'plugins/omnimux-products/src/client/ConfirmRemoveDialog.jsx');
  const productsDialog = fs.readFileSync(productsDialogPath, 'utf-8');
  assert.ok(
    productsDialog.includes('关联资产'),
    '产品库删除弹窗必须展示关联资产提示'
  );

  const assetsDialogPath = path.join(root, 'plugins/omnimux-assets/src/client/ConfirmRemoveDialog.jsx');
  const assetsDialog = fs.readFileSync(assetsDialogPath, 'utf-8');
  assert.ok(
    assetsDialog.includes('关联资产'),
    '资产库删除弹窗必须展示关联资产提示'
  );
});
