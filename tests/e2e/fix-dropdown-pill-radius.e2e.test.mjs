import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E: 全局 HUB_CSS 中统一下拉选择器为 999px 全圆角胶囊', () => {
  const hubStylesPath = path.join(root, 'plugins/omnimux/src/client/styles.js');
  const hubStyles = fs.readFileSync(hubStylesPath, 'utf-8');

  assert.ok(
    hubStyles.includes('.dshUk-DropdownSelect-trigger') &&
    hubStyles.includes('border-radius: 999px !important;'),
    'HUB_CSS 必须声明全局 .dshUk-DropdownSelect-trigger 为 border-radius: 999px !important;'
  );
});

test('E2E: 灵感中心私有覆盖收敛为 999px 全圆角胶囊', () => {
  const inspirationStylesPath = path.join(root, 'plugins/omnimux-inspiration/src/client/styles.js');
  const inspirationStyles = fs.readFileSync(inspirationStylesPath, 'utf-8');

  assert.ok(
    inspirationStyles.includes('.omnimux-inspiration-subfilter-select .dshUk-DropdownSelect-trigger') &&
    inspirationStyles.includes('border-radius: 999px;'),
    '灵感中心二级筛选器必须使用 border-radius: 999px;'
  );

  assert.ok(
    inspirationStyles.includes('.omnimux-inspiration-filter-select .dshUk-DropdownSelect-trigger') &&
    inspirationStyles.includes('border-radius: 999px;'),
    '灵感中心一级筛选器必须使用 border-radius: 999px;'
  );
});
