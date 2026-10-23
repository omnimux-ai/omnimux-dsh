import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 端到端契约（静态断言型，沿用 canvas-add-node-button-squircle.e2e.test.mjs 先例）：
// 真实浏览器证据见 .agent-reports/3640-add-node-flat-palette/ —— 画布 harness
// （plugins/omnimux-workflow/scripts/canvas-harness.mjs，动态端口）中「添加节点」
// 面板为无分类平铺列表，顺序与菜单文案对齐参考截图。
const here = dirname(fileURLToPath(import.meta.url));
const menuSrc = readFileSync(join(here, '../../src/canvas/editor/components/AddNodeMenu.tsx'), 'utf8');
const paletteSrc = readFileSync(join(here, '../../src/canvas/editor/components/addNodePalette.ts'), 'utf8');
const cssSrc = readFileSync(join(here, '../../src/canvas/theme/components.css'), 'utf8');
const zhSrc = readFileSync(join(here, '../../src/canvas/i18n/dict.zh.ts'), 'utf8');
const enSrc = readFileSync(join(here, '../../src/canvas/i18n/dict.en.ts'), 'utf8');

test('E2E: 「添加节点」面板为无分类平铺列表，不再渲染分组标题与折叠态', () => {
  assert.equal(menuSrc.includes('wf-node-menu__group'), false, '菜单不得再渲染分类节点');
  assert.equal(menuSrc.includes('collapsedGroups'), false, '折叠态必须整体移除');
  assert.equal(menuSrc.includes('ChevronDown'), false, '分组折叠箭头必须移除');
  assert.equal(cssSrc.includes('.wf-node-menu__group'), false, '分组样式必须移除');
  assert.match(menuSrc, /matches\.map\(/, '面板必须直接按检索结果平铺渲染条目');
});

test('E2E: 条目顺序固定为 文本→表格→图片→视频→音频→导演台→视频剪辑→导入素材', () => {
  const order = ['text', 'table', 'image', 'video', 'audio', 'director', 'video_composition', 'import_asset'];
  const declared = paletteSrc.slice(paletteSrc.indexOf('export const ADD_NODE_PALETTE'));
  const positions = order.map((type) => {
    const index = declared.indexOf(`type: '${type}'`);
    assert.ok(index > -1, `调色板缺少条目 ${type}`);
    return index;
  });
  assert.deepEqual(
    positions.slice().sort((left, right) => left - right),
    positions,
    '声明顺序必须与参考截图一致',
  );
});

test('E2E: 菜单文案与画布节点名分离，节点名不被菜单文案覆盖', () => {
  assert.match(paletteSrc, /'palette\.item\.director'/, '菜单必须用专属文案键显示「导演台」');
  assert.match(paletteSrc, /'palette\.item\.video_composition'/, '菜单必须用专属文案键显示「视频剪辑」');
  assert.match(zhSrc, /'palette\.item\.director': '导演台'/, 'zh 菜单文案必须是「导演台」');
  assert.match(zhSrc, /'palette\.item\.video_composition': '视频剪辑'/, 'zh 菜单文案必须是「视频剪辑」');
  assert.match(zhSrc, /'node\.type\.director': '3D 导演台'/, '节点名必须保持「3D 导演台」');
  assert.match(zhSrc, /'node\.type\.video_composition': '视频合成'/, '节点名必须保持「视频合成」');
  assert.match(enSrc, /'palette\.item\.director': 'Director'/, 'en 菜单文案必须与 zh key 集合对齐');
  assert.match(enSrc, /'palette\.item\.video_composition': 'Video Clip'/, 'en 菜单文案必须与 zh key 集合对齐');
});

test('E2E: 搜索仍按菜单文案命中（分类别名保留，不再有分类标题）', () => {
  assert.match(paletteSrc, /export function addNodeMenuLabelKey/, '菜单文案解析必须单点真源');
  assert.match(paletteSrc, /groupKey \? resolveText\(groupKey\) : ''/, '分类键仅作为检索别名进入匹配串');
  assert.match(menuSrc, /renderLabel\(match\)/, '命中区间高亮必须保留');
});
