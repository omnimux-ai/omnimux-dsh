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

test('E2E 契约 1: 加号选材宽窄自适应分流，大屏跳转 Tab 栏，窄栏打开 split 工作台', () => {
  // 大屏新会话场景下派发 omnimux:explore:scroll-to-tab 平滑就地跳转
  assert.match(controllerSource, /win\.dispatchEvent\(new CustomEvent\('omnimux:explore:scroll-to-tab'/);
  // 窄栏分栏态下统一通过 openWorkbench 唤起 ASSET_HUB_TAB_ID 的 split 模式
  assert.match(controllerSource, /wb\?\.openWorkbench\?\.\(\{[\s\S]*tabId:\s*ASSET_HUB_TAB_ID,[\s\S]*focus:\s*'split'/);
});

test('E2E 契约 2: Tab 栏吸顶固定样式与实心纯色背景防穿透，对齐图 1 效果', () => {
  // .omnimux-explore-filter-bar 必须具备 position: sticky 与 top: 0 以及 z-index 保证吸顶层级
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*position:\s*sticky/);
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*top:\s*0/);
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*z-index:\s*80/);
  // 背景色实心纯色与防穿透断言：严禁包含死黑 #0d0d0f，严禁半透明 transparent，必须消费原生 --dsw-alias-bg-base 保证实心同色
  assert.doesNotMatch(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*#0d0d0f/);
  assert.doesNotMatch(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*--dsw-alias-bg-layer-0/);
  assert.doesNotMatch(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*transparent/);
  assert.match(stylesSource, /\.omnimux-explore-filter-bar\s*\{[^}]*--dsw-alias-bg-base/);
});

test('E2E 契约 3: 全屏探索专区纯净解耦，响应平滑跳转但严禁空载强制吸底', () => {
  // 严禁包含 window.__omnimuxFullscreenExploreActive 全局污染
  assert.doesNotMatch(exploreSectionSource, /__omnimuxFullscreenExploreActive/);
  // 必须监听 omnimux:explore:scroll-to-tab 响应大屏跳转
  assert.match(exploreSectionSource, /omnimux:explore:scroll-to-tab/);
  // 关键：严禁在跳转 Tab 栏时盲目广播强制吸底事件
  assert.doesNotMatch(exploreSectionSource, /omnimux:composer:dock-intent/);
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
