/**
 * W1 i18n 骨架测试（计划 §8）：字典 fallback 顺序 active → zh → en → key，
 * 未知 locale 回退 zh。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, setLocale, getLocale } from './index.ts';

test('i18n: zh 默认且未知 locale 回退 zh', () => {
  setLocale('zh');
  assert.equal(getLocale(), 'zh');
  assert.equal(t('node.generating'), '生成中…');

  setLocale('fr');
  assert.equal(getLocale(), 'zh');
  assert.equal(t('node.generating'), '生成中…');

  setLocale(undefined);
  assert.equal(getLocale(), 'zh');
});

test('i18n: en 字典与 zh 同形可取', () => {
  setLocale('en');
  assert.equal(getLocale(), 'en');
  assert.equal(t('node.generating'), 'Generating...');
  assert.equal(t('node.regenerate'), 'Regenerate');
  assert.equal(t('node.taskIdLabel'), 'Task ID:');
});

test('i18n: 缺失 key fallback 到 key 本身', () => {
  setLocale('en');
  assert.equal(t('no.such.key.exists'), 'no.such.key.exists');
  setLocale('zh');
  assert.equal(t('no.such.key.exists'), 'no.such.key.exists');
});

test('i18n: setLocale 幂等且可来回切换', () => {
  setLocale('en');
  setLocale('en');
  assert.equal(getLocale(), 'en');
  setLocale('zh');
  assert.equal(t('node.generationFailed'), '生成失败');
});

test('i18n: 分组 / 模板 / 资产入库 key 中英都有值', () => {
  setLocale('zh');
  assert.equal(t('group.defaultTitle'), '新建组');
  assert.equal(t('template.modal.defaultName'), '新建工作流模板');
  assert.equal(t('asset.modal.defaultName'), '画布产物');
  setLocale('en');
  assert.equal(t('group.defaultTitle'), 'New group');
  assert.equal(t('template.modal.defaultName'), 'New workflow template');
  assert.equal(t('asset.modal.defaultName'), 'Canvas output');
  setLocale('zh');
});

test('i18n: 资产抽屉 (Assets Drawer) 全量中英双语对称与专业术语对齐', () => {
  setLocale('zh');
  assert.equal(t('assets.tab.canvas'), '创作画布');
  assert.equal(t('assets.tab.assets'), '资产');
  assert.equal(t('assets.importFile'), '导入文件');
  assert.equal(t('assets.searchFiles'), '搜索文件');
  assert.equal(t('assets.filter.type'), '类型');
  assert.equal(t('assets.emptyCanvas'), '创作画布暂无素材');

  setLocale('en');
  assert.equal(t('assets.tab.canvas'), 'Canvas');
  assert.equal(t('assets.tab.assets'), 'Assets');
  assert.equal(t('assets.importFile'), 'Import Files');
  assert.equal(t('assets.searchFiles'), 'Search files');
  assert.equal(t('assets.filter.type'), 'Type');
  assert.equal(t('assets.emptyCanvas'), 'No assets on canvas');
  setLocale('zh');
});
