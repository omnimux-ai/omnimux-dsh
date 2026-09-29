import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E: 资产库产品分流菜单国际化完整覆盖', () => {
  const assetsLocalesPath = path.join(root, 'plugins/omnimux-assets/src/client/locales.js');
  const content = fs.readFileSync(assetsLocalesPath, 'utf-8');
  assert.ok(content.includes("'kind.physical': '实物产品'"), '资产库 zh 必须声明 kind.physical');
  assert.ok(content.includes("'kind.digital': '数字产品'"), '资产库 zh 必须声明 kind.digital');
  assert.ok(content.includes("'add.menu.label': '新建产品'"), '资产库 zh 必须声明 add.menu.label');
  assert.ok(content.includes("'add.menu.physicalDesc'"), '资产库 zh 必须声明 add.menu.physicalDesc');
  assert.ok(content.includes("'add.menu.digitalDesc'"), '资产库 zh 必须声明 add.menu.digitalDesc');
});
