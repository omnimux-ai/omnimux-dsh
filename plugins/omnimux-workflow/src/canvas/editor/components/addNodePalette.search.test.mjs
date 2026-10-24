import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAddNodePalette,
  groupAddNodePalette,
  matchAddNodePalette,
  matchRanges,
  paletteGroupKey,
  paletteKeywordKeys,
} from './addNodePalette.ts';

const resolve = (key) => key;

test('未声明分组时归入 null 组，不伪造分类', () => {
  assert.equal(paletteGroupKey('text'), null, '本进程未注册 definition，必须返回 null');
  assert.equal(paletteGroupKey('import_asset'), 'palette.group.source');
  const groups = groupAddNodePalette(getAddNodePalette('dock'), (item) => item.type, () => null);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].groupKey, null);
  assert.equal(groups[0].items.length, 8, '分组不得丢项');
});

test('检索词按 MATERIAL_TOOLS_BY_TYPE 真实工具键收窄到子类型', () => {
  const textKeys = paletteKeywordKeys('text');
  assert.ok(textKeys.includes('tool.audio-transcription'));
  assert.ok(!textKeys.includes('tool.video-generation'));
  assert.ok(paletteKeywordKeys('video').includes('tool.video-generation'));
  assert.deepEqual(paletteKeywordKeys('import_asset'), ['assets.importFile']);
});

test('检索：空查询返回全部，标签/类型 id 命中，无命中返回空数组', () => {
  const items = getAddNodePalette('dock');
  assert.equal(matchAddNodePalette(items, '', resolve).length, 8);
  assert.equal(matchAddNodePalette(items, '  ', resolve).length, 8);
  assert.ok(matchAddNodePalette(items, 'table', resolve).some((match) => match.item.type === 'table'));
  assert.deepEqual(matchAddNodePalette(items, 'zzz-no-such-node', resolve), []);
});

test('命中区间：标签内出现位置全覆盖，空查询无区间', () => {
  assert.deepEqual(matchRanges('abcabc', 'bc'), [{ start: 1, end: 3 }, { start: 4, end: 6 }]);
  assert.deepEqual(matchRanges('abc', 'ABC'), [{ start: 0, end: 3 }]);
  assert.deepEqual(matchRanges('abc', ''), []);
});
