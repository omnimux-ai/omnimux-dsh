/**
 * #3646 3D 导演台 UI 收敛的界面契约。
 *
 * 真实浏览器旅程由 `scripts/director-acceptance-3289.mjs` 执行（任务私有装配 + ego 浏览器 +
 * 独立 ffmpeg 解码，证据落 `.agent-reports/beeftv-director/acceptance-3289-*`）。本用例只锁定
 * 收敛后的几何与规范不变量，防止后续改动把顶栏高度、三栏宽度、字号档位与 token 退回旧值。
 *
 * 依据：`specs/3646-director-ui-convergence.spec.md` 与 Issue #3646 的验收阈值。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const directorDir = join(root, 'plugins', 'omnimux-workflow', 'src', 'director');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

function collectTsx(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) collectTsx(full, found);
    else if (entry.name.endsWith('.tsx')) found.push(full);
  }
  return found;
}

const tsxFiles = collectTsx(directorDir);

test('导演台三栏收敛为 248 / 1fr / 300，并保留左右折叠与窄屏回退变体', () => {
  const workbench = read('plugins/omnimux-workflow/src/director/vendor/components/canvas-director-workbench.tsx');
  assert.equal(workbench.includes('grid-cols-[248px_minmax(0,1fr)_300px]'), true);
  assert.equal(workbench.includes('grid-cols-[48px_minmax(0,1fr)_300px]'), true);
  assert.equal(workbench.includes('grid-cols-[248px_minmax(0,1fr)_0px]'), true);
  assert.equal(workbench.includes('grid-cols-[48px_minmax(0,1fr)_0px]'), true);
  assert.equal(workbench.includes('max-lg:grid-cols-[220px_minmax(0,1fr)]'), true);
  assert.equal(workbench.includes('grid-cols-[280px_minmax(0,1fr)_280px]'), false);
});

test('右栏可折叠：状态、data 属性与按钮三处齐备', () => {
  const workbench = read('plugins/omnimux-workflow/src/director/vendor/components/canvas-director-workbench.tsx');
  assert.equal(workbench.includes('rightDockCollapsed'), true);
  assert.equal(workbench.includes('data-right-dock-collapsed'), true);
  assert.equal(workbench.includes('aria-controls="director-workbench-right-dock"'), true);
  assert.equal(workbench.includes('id="director-workbench-right-dock"'), true);
});

test('顶栏是 48px 正常流，左右栏不再做 52px 顶部补偿', () => {
  const css = read('plugins/omnimux-workflow/src/director/controls.css');
  const topbar = css.match(/\.director-workbench-topbar \{[^}]*\}/)?.[0] ?? '';
  assert.equal(topbar.includes('height:48px'), true);
  assert.equal(topbar.includes('position:absolute'), false);
  assert.equal(topbar.includes('pointer-events:none'), false);
  assert.equal(css.includes('padding-top:52px'), false);
});

test('时间轴默认 236、最小 160，收起目标同步', () => {
  const store = read('plugins/omnimux-workflow/src/director/vendor/store/use-director-workbench-store.ts');
  assert.equal(store.includes('sequencerHeight: 236'), true);
  assert.equal(store.includes('Math.max(160,'), true);
  const sequencer = read('plugins/omnimux-workflow/src/director/vendor/components/director-sequencer.tsx');
  assert.equal(sequencer.includes('minHeight: 160'), true);
  assert.equal(sequencer.includes('onHeightChange(130)'), false);
});

test('token 表补齐 z-popover 与 r-full，移除零引用 token 与硬编码胶囊圆角', () => {
  const build = read('plugins/omnimux-workflow/scripts/build-director.mjs');
  assert.equal(build.includes('--z-popover:30'), true);
  assert.equal(build.includes('--r-full:999px'), true);
  assert.equal(build.includes('--space-10'), false);
  const layout = read('plugins/omnimux-workflow/src/director/vendor/director-layout.css');
  assert.equal(layout.includes('border-radius: 999px'), false);
  assert.equal(layout.includes('var(--r-full)'), true);
});

test('字号只用 {11,12,13,15} 四档，且不再出现 10/14/16px', () => {
  const arbitrary = new Set();
  for (const file of tsxFiles) {
    const text = readFileSync(file, 'utf8');
    assert.equal(/\btext-sm\b/.test(text), false, `${file} 仍有 text-sm(14px)`);
    assert.equal(/\btext-base\b/.test(text), false, `${file} 仍有 text-base(16px)`);
    assert.equal(text.includes('text-[10px]'), false, `${file} 仍有 text-[10px]`);
    for (const match of text.matchAll(/text-\[(\d+)px\]/g)) arbitrary.add(Number(match[1]));
  }
  const allowed = new Set([11, 12, 13, 15]);
  for (const size of arbitrary) assert.equal(allowed.has(size), true, `出现了档位外字号 ${size}px`);
  assert.equal(arbitrary.has(11), true);
  assert.equal(arbitrary.has(13), true);
  assert.equal(arbitrary.has(15), true);
});

test('滑杆只剩一套实现，值框宽度统一到 58', () => {
  for (const file of tsxFiles) {
    const text = readFileSync(file, 'utf8');
    assert.equal(text.includes('accent-cyan'), false, `${file} 仍有手写滑杆配色`);
    assert.equal(text.includes('w-[64px]'), false, `${file} 仍有 64px 值框`);
  }
  const workbench = read('plugins/omnimux-workflow/src/director/vendor/components/canvas-director-workbench.tsx');
  assert.equal(workbench.includes('w-[58px]'), true);
  const css = read('plugins/omnimux-workflow/src/director/controls.css');
  assert.equal(css.includes('.director-slider'), true);
  assert.equal(css.includes('12px'), true);
});
