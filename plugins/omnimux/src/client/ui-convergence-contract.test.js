import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../../../');

test('AC-1: 分类筛选胶囊选中态必须声明加粗字重 (font-weight: 700)', () => {
  const assetsStylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js');
  const assetsStyles = fs.readFileSync(assetsStylesPath, 'utf-8');
  assert.ok(
    assetsStyles.includes('font-weight: 700;') && assetsStyles.includes('.omnimux-assets-cloud-chip[aria-pressed="true"]'),
    '资产库分类胶囊激活态必须包含 font-weight: 700;'
  );

  const marketCssPath = path.join(root, 'plugins/omnimux-market/src/client/css.js');
  const marketCss = fs.readFileSync(marketCssPath, 'utf-8');
  assert.ok(
    marketCss.includes('.cat-btn.active') && marketCss.includes('font-weight:700'),
    '技能市场分类胶囊激活态必须包含 font-weight:700'
  );
});

test('AC-2: 下拉选择器触发器与选项文案必须遵守黄金契约，消灭「全部平台」拼接', () => {
  const accountsFilterBarPath = path.join(root, 'plugins/omnimux-accounts/src/client/FilterBar.jsx');
  const accountsFilterBar = fs.readFileSync(accountsFilterBarPath, 'utf-8');
  assert.ok(
    !accountsFilterBar.includes("${t('platform')} · ${t('all')}"),
    '账号中心 FilterBar 不应拼接「平台 · 全部」'
  );
  assert.ok(
    accountsFilterBar.includes("label: t('all')"),
    '账号中心 FilterBar 首项必须为「全部」'
  );

  const inspirationLocalesPath = path.join(root, 'plugins/omnimux-inspiration/src/client/locales.js');
  const inspirationLocales = fs.readFileSync(inspirationLocalesPath, 'utf-8');
  assert.ok(
    inspirationLocales.includes("'platform.all': '全部',"),
    '对标灵感 locales 中 platform.all 必须为「全部」而非「全部平台」'
  );
});

test('AC-5: 删除确认弹窗必须明确提示关联资产名称', () => {
  const productsDialogPath = path.join(root, 'plugins/omnimux-products/src/client/ConfirmRemoveDialog.jsx');
  const productsDialog = fs.readFileSync(productsDialogPath, 'utf-8');
  assert.ok(
    productsDialog.includes('关联资产'),
    '产品库删除确认弹窗必须包含关联资产安全提示'
  );

  const assetsDialogPath = path.join(root, 'plugins/omnimux-assets/src/client/ConfirmRemoveDialog.jsx');
  const assetsDialog = fs.readFileSync(assetsDialogPath, 'utf-8');
  assert.ok(
    assetsDialog.includes('关联资产'),
    '资产库删除确认弹窗必须包含关联资产安全提示'
  );
});
