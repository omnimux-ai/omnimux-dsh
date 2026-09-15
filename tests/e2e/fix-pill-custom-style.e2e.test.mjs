import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E: 技能市场分类胶囊选中态采用暗灰半透明底与纯白加粗文字（方案B）', () => {
  const marketCssPath = path.join(root, 'plugins/omnimux-market/src/client/css.js');
  const marketCss = fs.readFileSync(marketCssPath, 'utf-8');

  assert.ok(
    marketCss.includes('.cat-btn.active,.sh-mkt .cat-btn.active{background:var(--dsw-alias-interactive-bg-active,rgba(255,255,255,.16));') &&
    marketCss.includes('color:var(--dsw-alias-label-primary,#ffffff);') &&
    marketCss.includes('font-weight:700;'),
    '技能市场分类胶囊必须使用半透明暗灰底与纯白 700 加粗文字'
  );
});
