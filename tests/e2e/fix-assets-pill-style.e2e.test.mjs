import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E: 资产库分类胶囊选中态必须采用方案B暗灰低调底色与纯白加粗文字', () => {
  const assetsStylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js');
  const assetsStyles = fs.readFileSync(assetsStylesPath, 'utf-8');

  assert.ok(
    assetsStyles.includes('background: var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, 0.16));') &&
    assetsStyles.includes('color: var(--dsw-alias-label-primary, #ffffff);') &&
    assetsStyles.includes('font-weight: 700;'),
    '资产库分类胶囊必须使用方案 B 声明暗灰低调底色与纯白加粗文字'
  );
});
