/**
 * REQ-WF-ADD-NODE-MENU：添加节点 palette 单点真源契约。
 * 纯数据模块，可直接 import；同时扫 Toolbar / ContextMenu / CSS 源码，
 * 禁止彩虹、副标题与第二份清单。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ADD_NODE_PALETTE,
  getAddNodePalette,
} from './addNodePalette.ts';

const here = dirname(fileURLToPath(import.meta.url));
const toolbarSrc = readFileSync(join(here, 'Toolbar.tsx'), 'utf8');
const contextSrc = readFileSync(join(here, 'ContextMenu.tsx'), 'utf8');
const menuSrc = readFileSync(join(here, 'AddNodeMenu.tsx'), 'utf8');
const paletteSrc = readFileSync(join(here, 'addNodePalette.ts'), 'utf8');
const cssSrc = readFileSync(join(here, '../../theme/components.css'), 'utf8');

const REQUIRED_ICONS = ['Type', 'Table', 'ImagePlus', 'Video', 'AudioLines', 'Film', 'UploadCloud'];
const REQUIRED_ORDER = [
  'text',
  'table',
  'image',
  'video',
  'audio',
  'video_composition',
  'import_asset',
];
const FORBIDDEN_ICON_ALIASES = ['FileText', 'Music', "Image as ImageIcon", 'ImageIcon'];
const RAINBOW_HEX = ['#38bdf8', '#60a5fa', '#c084fc', '#fb923c', '#34d399', '#10b981', '#f472b6', '#5B68F6'];

test('ADD_NODE_PALETTE 固定 7 项顺序与强符号图标键名', () => {
  assert.equal(ADD_NODE_PALETTE.length, 7);
  assert.deepEqual(ADD_NODE_PALETTE.map((item) => item.type), REQUIRED_ORDER);
  assert.deepEqual(
    ADD_NODE_PALETTE.map((item) => item.icon),
    REQUIRED_ICONS,
  );
  for (const alias of FORBIDDEN_ICON_ALIASES) {
    assert.equal(
      ADD_NODE_PALETTE.some((item) => item.icon === alias),
      false,
      `palette 不得使用弱图标别名 ${alias}`,
    );
  }
});

test('Badge 定义：video/table primary，video_composition new', () => {
  const byType = Object.fromEntries(ADD_NODE_PALETTE.map((item) => [item.type, item]));
  assert.deepEqual(byType.video.badge, { text: 'MiniMax H3', variant: 'primary' });
  assert.deepEqual(byType.table.badge, { text: 'HTable', variant: 'primary' });
  assert.deepEqual(byType.video_composition.badge, { text: 'Clip', variant: 'new' });
  assert.equal(byType.text.badge, undefined);
  assert.equal(byType.image.badge, undefined);
  assert.equal(byType.audio.badge, undefined);
  assert.equal(byType.import_asset.badge, undefined);
});

test('getAddNodePalette 按作用域过滤：dock 7 项、context 不含导入素材', () => {
  const dock = getAddNodePalette('dock');
  const context = getAddNodePalette('context');
  assert.equal(dock.length, 7);
  assert.deepEqual(dock.map((item) => item.type), REQUIRED_ORDER);
  assert.equal(context.length, 6);
  assert.equal(context.some((item) => item.type === 'import_asset'), false);
  assert.deepEqual(
    context.map((item) => item.type),
    REQUIRED_ORDER.filter((type) => type !== 'import_asset'),
  );
});

test('Toolbar / ContextMenu 不再维护 ADD_NODE_ITEMS，统一挂载 AddNodeMenu', () => {
  assert.equal(toolbarSrc.includes('ADD_NODE_ITEMS'), false);
  assert.equal(contextSrc.includes('ADD_NODE_ITEMS'), false);
  assert.equal(contextSrc.includes('AddNodeItemSpec'), false);
  assert.match(toolbarSrc, /<AddNodeMenu scope="dock"/);
  assert.match(contextSrc, /<AddNodeMenu/);
  assert.match(contextSrc, /scope="context"/);
  assert.match(toolbarSrc, /from '\.\/addNodePalette'/);
  assert.match(contextSrc, /from '\.\/addNodePalette'/);
});

test('零彩虹、零副标题：源码与 CSS 不得再写彩色 icon 与 desc 行', () => {
  for (const src of [toolbarSrc, menuSrc, paletteSrc]) {
    assert.equal(src.includes('toolbar.add.'), false, '不得再渲染副标题 i18n key');
    assert.equal(src.includes('__desc'), false);
  }
  assert.equal(contextSrc.includes('__desc'), false);
  assert.equal(contextSrc.includes('toolbar.add.import_assetDesc'), false);
  for (const src of [toolbarSrc, contextSrc, menuSrc, paletteSrc]) {
    for (const hex of RAINBOW_HEX) {
      assert.equal(src.includes(hex), false, `组件源码不得含彩虹色 ${hex}`);
    }
  }
  assert.equal(cssSrc.includes('.wf-dock-add-popover__desc'), false);
  assert.equal(cssSrc.includes('.wf-dock-add-popover__item'), false);
  assert.equal(cssSrc.includes('#5B68F6'), false);
  assert.match(cssSrc, /--wf-node-badge-primary-bg/);
  assert.match(cssSrc, /--wf-node-icon-bg/);
});
