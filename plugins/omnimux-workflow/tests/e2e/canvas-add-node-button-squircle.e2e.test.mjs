import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 端到端契约（静态断言型，沿用 tabs-toolbar-polish.e2e.test.mjs 先例）：
// 真实浏览器证据见 docs/evidence/canvas-add-node-squircle/ ——
// 画布 harness 中浅色主题为黑底、深色主题为白底，两者 36×36 且 border-radius=12px。
const here = dirname(fileURLToPath(import.meta.url));
const themePath = join(here, '../../src/canvas/theme/workbench-theme.css');
const toolbarPath = join(here, '../../src/canvas/editor/components/Toolbar.tsx');

const themeSrc = readFileSync(themePath, 'utf8');
const toolbarSrc = readFileSync(toolbarPath, 'utf8');

/** 取某个选择器的声明块（不含 @media 等包裹），用于精确断言单条规则。 */
function ruleBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `未找到选择器 ${selector} 的样式块`);
  return match[1];
}

const baseBlock = ruleBlock(themeSrc, '.wf-canvas-toolbar__item--primary-add');

test('E2E: 画布底部「+」添加节点按钮为圆角方形而非纯圆', () => {
  assert.match(
    baseBlock,
    /border-radius:\s*var\(--wb-pill-radius,\s*12px\);/,
    '主添加按钮圆角必须复用 --wb-pill-radius（12px），与设计体系同档',
  );
  assert.doesNotMatch(
    baseBlock,
    /border-radius:\s*50%/,
    '主添加按钮严禁再使用 50% 纯圆',
  );
  assert.match(baseBlock, /width:\s*36px;/, '主添加按钮宽度必须保持 36px');
  assert.match(baseBlock, /height:\s*36px;/, '主添加按钮高度必须保持 36px');
});

test('E2E: 主添加按钮双主题高对比与 hover 反馈不被圆角改动破坏', () => {
  const darkBlock = ruleBlock(themeSrc, 'body[data-ds-dark-theme] .wf-canvas-toolbar__item--primary-add');
  assert.match(darkBlock, /background:\s*#ffffff;/, '深色主题下主添加按钮必须为白底');
  assert.match(darkBlock, /color:\s*#18191c;/, '深色主题下主添加按钮图标必须为深色');

  assert.match(baseBlock, /background:\s*#18191c;/, '浅色主题下主添加按钮必须为深底');
  assert.match(baseBlock, /color:\s*#ffffff;/, '浅色主题下主添加按钮图标必须为白色');

  const hoverBlock = ruleBlock(themeSrc, '.wf-canvas-toolbar__item--primary-add:hover');
  assert.match(hoverBlock, /transform:\s*scale\(1\.05\);/, 'hover 必须保留 1.05 缩放反馈');
  assert.doesNotMatch(hoverBlock, /border-radius/, 'hover 不得改变圆角，避免形状抖动');

  const darkHoverBlock = ruleBlock(
    themeSrc,
    'body[data-ds-dark-theme] .wf-canvas-toolbar__item--primary-add:hover',
  );
  assert.match(darkHoverBlock, /background:\s*#e4e4e7;/, '深色主题 hover 必须保留浅灰反馈');
});

test('E2E: 工具栏其它按钮形状不受主按钮改动影响', () => {
  const iconOnlyBlock = ruleBlock(themeSrc, '.wf-canvas-toolbar__item--icon-only');
  assert.match(iconOnlyBlock, /border-radius:\s*50%;/, '图标按钮仍为圆形，未被主按钮规则波及');
  const itemBlock = ruleBlock(themeSrc, '.wf-canvas-toolbar__item');
  assert.match(itemBlock, /border-radius:\s*18px;/, '常规工具栏项保持 18px 胶囊圆角');

  assert.match(
    toolbarSrc,
    /wf-canvas-toolbar__item--primary-add/,
    'Toolbar 必须仍挂载主添加按钮的专属类名',
  );
  assert.match(
    toolbarSrc,
    /wf-canvas-toolbar__item wf-canvas-toolbar__item--primary-add/,
    '主添加按钮仍与共享 item 类组合，保证 pointer/hover 基线不变',
  );
});
