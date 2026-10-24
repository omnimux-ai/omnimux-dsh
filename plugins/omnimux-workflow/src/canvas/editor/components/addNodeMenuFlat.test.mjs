/**
 * Issue 3640 契约（新增用例，不改写既有断言）：
 * 「添加节点」面板是无分类平铺列表，菜单专属文案（导演台 / 视频剪辑）只改菜单，
 * 不覆盖画布节点名。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ADD_NODE_PALETTE,
  addNodeMenuLabelKey,
  getAddNodePalette,
  matchAddNodePalette,
} from './addNodePalette.ts';
import zh from '../../i18n/dict.zh.ts';
import en from '../../i18n/dict.en.ts';

const here = dirname(fileURLToPath(import.meta.url));
const menuSrc = readFileSync(join(here, 'AddNodeMenu.tsx'), 'utf8');
const cssSrc = readFileSync(join(here, '../../theme/components.css'), 'utf8');

/** 只解析本用例关心的文案；其余 key 原样返回（不参与命中）。 */
function resolveZh(key) {
  if (key === 'palette.item.director') return zh['palette.item.director'];
  if (key === 'palette.item.video_composition') return zh['palette.item.video_composition'];
  if (key === 'node.type.director') return zh['node.type.director'];
  if (key === 'node.type.video_composition') return zh['node.type.video_composition'];
  return key;
}

function resolveEn(key) {
  if (key === 'palette.item.director') return en['palette.item.director'];
  if (key === 'palette.item.video_composition') return en['palette.item.video_composition'];
  return key;
}

test('3640：面板源码与样式不再渲染分类标题 / 折叠态', () => {
  assert.equal(menuSrc.includes('wf-node-menu__group'), false, '菜单不得再渲染分组节点');
  assert.equal(menuSrc.includes('collapsedGroups'), false, '折叠态必须整体移除');
  assert.equal(menuSrc.includes('ChevronDown'), false, '分组折叠箭头必须移除');
  assert.equal(cssSrc.includes('.wf-node-menu__group'), false, '分组样式必须移除');
});

test('3640：固定顺序 文本→表格→图片→视频→音频→导演台→视频剪辑→导入素材', () => {
  assert.deepEqual(
    ADD_NODE_PALETTE.map((item) => item.type),
    ['text', 'table', 'image', 'video', 'audio', 'director', 'video_composition', 'import_asset', 'comfy-page'],
  );
  assert.deepEqual(
    getAddNodePalette('context').map((item) => item.type),
    ['text', 'table', 'image', 'video', 'audio', 'director', 'video_composition', 'comfy-page'],
  );
});

test('3640：菜单专属文案生效，节点名不受影响', () => {
  const byType = Object.fromEntries(ADD_NODE_PALETTE.map((item) => [item.type, item]));
  assert.equal(addNodeMenuLabelKey(byType.director), 'palette.item.director');
  assert.equal(addNodeMenuLabelKey(byType.video_composition), 'palette.item.video_composition');
  assert.equal(addNodeMenuLabelKey(byType.text), 'node.type.text');
  assert.equal(addNodeMenuLabelKey(byType.import_asset), 'node.type.import_asset');
  assert.equal(byType.director.labelKey, 'node.type.director');
  assert.equal(byType.video_composition.labelKey, 'node.type.video_composition');
});

test('3640：菜单文案中英齐备且与节点名不同', () => {
  assert.equal(zh['palette.item.director'], '导演台');
  assert.equal(en['palette.item.director'], 'Director');
  assert.equal(zh['palette.item.video_composition'], '视频剪辑');
  assert.equal(en['palette.item.video_composition'], 'Video Clip');
  assert.equal(zh['node.type.director'], '3D 导演台');
  assert.equal(zh['node.type.video_composition'], '视频合成');
});

test('3640：检索用菜单文案命中，且不再有分类标题可渲染', () => {
  const items = getAddNodePalette('dock');
  assert.deepEqual(
    matchAddNodePalette(items, '导演台', resolveZh).map((match) => match.item.type),
    ['director'],
  );
  assert.deepEqual(
    matchAddNodePalette(items, '视频剪辑', resolveZh).map((match) => match.item.type),
    ['video_composition'],
  );
  assert.deepEqual(
    matchAddNodePalette(items, 'Director', resolveEn).map((match) => match.item.type),
    ['director'],
  );
  assert.deepEqual(matchAddNodePalette(items, '导演台', resolveZh)[0].labelRanges, [
    { start: 0, end: 3 },
  ]);
  assert.equal(matchAddNodePalette(items, 'zzz-no-such-entry', resolveZh).length, 0);
});

test('3640：画布节点名仍可被搜到（去分类不缩小可发现性）', () => {
  const items = getAddNodePalette('dock');
  assert.deepEqual(
    matchAddNodePalette(items, '3D 导演台', resolveZh).map((match) => match.item.type),
    ['director'],
  );
  assert.deepEqual(
    matchAddNodePalette(items, '视频合成', resolveZh).map((match) => match.item.type),
    ['video_composition'],
  );
  assert.deepEqual(
    matchAddNodePalette(items, 'node.type.director', resolveZh).map((match) => match.item.type),
    ['director'],
  );
});
