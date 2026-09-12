/**
 * AddNodeMenu 源码契约：Header + kbd/返回箭头、单行 item、中性 32×32 icon-box、
 * Badge 渲染、零 inline 颜色、零副标题。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const menuSrc = readFileSync(join(here, 'AddNodeMenu.tsx'), 'utf8');
const cssSrc = readFileSync(join(here, '../../theme/components.css'), 'utf8');

test('Header 含「添加节点」文案键；dock 渲染 kbd N，context 渲染返回箭头', () => {
  assert.match(menuSrc, /t\('menu\.addNode'\)/);
  assert.match(menuSrc, /<kbd className="wf-node-menu__kbd">N<\/kbd>/);
  assert.match(menuSrc, /scope === 'dock'/);
  assert.match(menuSrc, /scope === 'context'/);
  assert.match(menuSrc, /wf-node-menu__back-btn/);
  assert.match(menuSrc, /<ChevronLeft size=\{16\} \/>/);
});

test('单行 item：icon-box + label + 可选 Badge，无副标题、无 hasSubmenu', () => {
  assert.match(menuSrc, /wf-node-menu__item/);
  assert.match(menuSrc, /wf-node-menu__icon-box/);
  assert.match(menuSrc, /wf-node-menu__label/);
  assert.match(menuSrc, /wf-node-menu__badge--\$\{item\.badge\.variant\}/);
  assert.equal(menuSrc.includes('wf-node-menu__desc'), false);
  assert.equal(menuSrc.includes('hasSubmenu'), false);
  assert.equal(menuSrc.includes('toolbar.add.'), false);
});

test('零 inline 颜色：AddNodeMenu 不含 style={{ color/background }} 与裸色 hex', () => {
  assert.equal(/style=\{\{\s*(color|background)/.test(menuSrc), false);
  assert.equal(/#[0-9a-fA-F]{3,8}/.test(menuSrc), false);
  assert.equal(/rgba?\(/.test(menuSrc), false);
});

test('图标映射覆盖 7 个强符号键，且不得引入弱别名', () => {
  for (const icon of ['Type', 'Table', 'ImagePlus', 'Video', 'AudioLines', 'Film', 'UploadCloud']) {
    assert.match(menuSrc, new RegExp(`\\b${icon}\\b`));
  }
  assert.equal(menuSrc.includes('FileText'), false);
  assert.equal(menuSrc.includes('Music'), false);
  assert.equal(menuSrc.includes('Image as'), false);
});

test('CSS：中性 32×32 icon-box、Badge token 化、无旧彩虹 popover 规则', () => {
  const iconBox = cssSrc.match(/\.wf-node-menu__icon-box\s*\{[^}]+\}/);
  assert.ok(iconBox, 'missing .wf-node-menu__icon-box');
  assert.match(iconBox[0], /width:\s*32px/);
  assert.match(iconBox[0], /height:\s*32px/);
  assert.match(iconBox[0], /var\(--wf-node-icon-bg\)/);
  assert.doesNotMatch(iconBox[0], /#[0-9a-fA-F]{3,8}/);

  const badgePrimary = cssSrc.match(/\.wf-node-menu__badge--primary\s*\{[^}]+\}/);
  assert.ok(badgePrimary);
  assert.match(badgePrimary[0], /var\(--wf-node-badge-primary-bg\)/);
  assert.doesNotMatch(badgePrimary[0], /#5B68F6/);

  assert.equal(cssSrc.includes('.wf-dock-add-popover {'), false);
  assert.equal(cssSrc.includes('.wf-dock-add-popover__desc'), false);
  assert.match(cssSrc, /\.wf-template-picker\s*\{/);
});
