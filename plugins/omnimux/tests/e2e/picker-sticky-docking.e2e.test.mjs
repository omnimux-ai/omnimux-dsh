import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const controllerSource = readFileSync(join(here, '../../src/client/composer-add/controller.js'), 'utf8');
const stylesSource = readFileSync(join(here, '../../src/client/session-guide/styles.js'), 'utf8');
const exploreSectionSource = readFileSync(join(here, '../../src/client/session-guide/templates/ExploreTemplatesSection.jsx'), 'utf8');
const dockingHookSource = readFileSync(join(here, '../../src/client/session-guide/useComposerDocking.js'), 'utf8');

test('E2E 契约 1: 全屏状态加号分发守卫，拦截 split 模式并派发置顶与切 Tab 事件', () => {
  // 必须包含全屏新会话探索专区与右栏折叠状态的联合判定
  assert.match(controllerSource, /isFullscreenExplore\s*=\s*Boolean\(win\?.__omnimuxFullscreenExploreActive\)/);
  assert.match(controllerSource, /isRightPanelOpen\s*=\s*Boolean\(win\?.__omnimuxWorkbench\?\.getSnapshot/);
  // 全屏未开右栏时，必须派发 omnimux:explore:scroll-to-tab 并直接 return 拦截 split
  assert.match(controllerSource, /if\s*\(isFullscreenExplore\s*&&\s*!isRightPanelOpen\s*&&\s*win\)\s*\{/);
  assert.match(controllerSource, /win\.dispatchEvent\(new CustomEvent\('omnimux:explore:scroll-to-tab'/);
});

test('E2E 契约 2: Tab 栏吸顶固定样式，对齐图 1 效果', () => {
  // .omnimux-explore-filter-bar 必须具备 position: sticky 与 top: 0 以及 z-index 保证吸顶层级
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*position:\s*sticky/);
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*top:\s*0/);
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*z-index:\s*80/);
});

test('E2E 契约 3: 全屏探索专区生命周期标记与滚动置顶事件闭环', () => {
  // 组件生命周期必须管理 window.__omnimuxFullscreenExploreActive
  assert.match(exploreSectionSource, /window\.__omnimuxFullscreenExploreActive\s*=\s*true/);
  assert.match(exploreSectionSource, /window\.__omnimuxFullscreenExploreActive\s*=\s*false/);
  // 必须监听 omnimux:explore:scroll-to-tab
  assert.match(exploreSectionSource, /window\.addEventListener\('omnimux:explore:scroll-to-tab'/);
  assert.match(exploreSectionSource, /handlePrimaryTabChange\(targetTab\)/);
  // 必须调用 scrollIntoView({ behavior: 'smooth', block: 'start' }) 置顶
  assert.match(exploreSectionSource, /scrollIntoView\(\{\s*behavior:\s*'smooth',\s*block:\s*'start'\s*\}\)/);
  // 必须派发意图驱动事件唤起吸底输入框
  assert.match(exploreSectionSource, /window\.dispatchEvent\(new CustomEvent\('omnimux:composer:dock-intent'/);
});

test('E2E 契约 4: useComposerDocking 意图驱动吸底与收起绝对静默状态机', () => {
  // 必须定义 isIntentDrivenRef 与 isCollapsedRef
  assert.match(dockingHookSource, /isIntentDrivenRef\s*=\s*useRef\(false\)/);
  assert.match(dockingHookSource, /isCollapsedRef\s*=\s*useRef\(false\)/);
  // 主动收起模式下，纯上下滚动必须 Early Return 保持静默
  assert.match(dockingHookSource, /if\s*\(isCollapsedRef\.current\)\s*\{[\s\S]*return[\s\S]*\}/);
  // 未显式触发意图时（纯向下滚动浏览），滑出顶部视口绝不自动吸底
  assert.match(dockingHookSource, /if\s*\(!isIntentDrivenRef\.current\)\s*\{[\s\S]*return[\s\S]*\}/);
  // 监听全局意图驱动事件
  assert.match(dockingHookSource, /window\.addEventListener\('omnimux:composer:dock-intent'/);
});
