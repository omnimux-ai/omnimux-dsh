import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E: 云端资产目录全量重构与规范闭环验证', async () => {
  const catalogPath = path.join(root, 'plugins/omnimux-assets/cloud-catalog/manifest.json');
  assert.ok(fs.existsSync(catalogPath), 'manifest.json 必须已生成');

  const manifest = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const charCat = manifest.categories.find((c) => c.id === 'character');
  assert.ok(charCat, '角色分类必须存在');
  assert.equal(charCat.total, 429, '角色总数必须为 429 套 (359 数字人 + 70 款虚拟人设)');

  const typeDim = charCat.dimensions.find((d) => d.id === 'type');
  assert.ok(typeDim, '「类型」维度必须在角色筛选器中注册');
  assert.equal(typeDim.total, 429, '类型维度必须穷尽全部 429 套角色');

  const optionValues = new Set(typeDim.options.map((o) => o.value));
  assert.ok(optionValues.has('digital-human'), '必须包含 digital-human (合并后包含329数字人+30人类原型)');
  assert.ok(optionValues.has('Meme Characters'), '必须包含原生分类 Meme Characters');
  assert.ok(optionValues.has('Animal Character'), '必须包含原生分类 Animal Character');
  assert.ok(optionValues.has('Fantasy_GenreX'), '必须包含原生分类 Fantasy_GenreX');

  const indexPath = path.join(root, 'plugins/omnimux-assets/cloud-catalog/index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const sampleNew = index.find((r) => r.id.startsWith('character-animal-character'));
  assert.ok(sampleNew, '新增动物拟人角色必须录入索引');
  assert.ok(sampleNew.meta.source_cover_url.startsWith('https://assets.omnimux.ai/'), '必须绑定 R2 CDN 官方域名');
  assert.ok(sampleNew.meta.source_media_url.startsWith('https://assets.omnimux.ai/'), '必须绑定 R2 CDN 官方域名');
});
