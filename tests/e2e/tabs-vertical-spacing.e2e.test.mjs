import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E: 技能市场双层导航之间保持 14px 舒适透气呼吸间距', () => {
  const marketCssPath = path.join(root, 'plugins/omnimux-market/src/client/css.js');
  const marketCss = fs.readFileSync(marketCssPath, 'utf-8');

  assert.ok(
    marketCss.includes('.nav-bar{display:flex;flex-wrap:nowrap;align-items:center;justify-content:space-between;margin-bottom:14px;'),
    'nav-bar 必须设置 margin-bottom: 14px，杜绝 2px 贴脸挤压'
  );
});

test('E2E: 资产库双层分类导航保持标准呼吸间距', () => {
  const assetsStylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js');
  const assetsStyles = fs.readFileSync(assetsStylesPath, 'utf-8');

  assert.ok(
    assetsStyles.includes('.omnimux-assets-local-nav {') &&
    assetsStyles.includes('padding: 12px 24px 14px;'),
    '资产库 local nav 保持标准 12px/14px 留白'
  );
  assert.ok(
    assetsStyles.includes('.omnimux-assets-cloud-nav {') &&
    assetsStyles.includes('padding: 12px 0 14px;'),
    '资产库 cloud nav 保持标准 12px/14px 留白'
  );
});
