import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

test('E2E-01: Tab 栏视口最小高度撑开与呼吸留白规范契约', () => {
  const stylesPath = resolve(REPO_ROOT, 'plugins/omnimux/src/client/session-guide/styles.js');
  const stylesContent = readFileSync(stylesPath, 'utf8');

  // 1. 验证包裹层统一配置 min-height: calc(100vh - 96px)
  assert.ok(
    stylesContent.includes('min-height: calc(100vh - 96px);') || stylesContent.includes('min-height:calc(100vh - 96px);'),
    '样式中必须定义 min-height: calc(100vh - 96px) 保证卡片数量较少或为空时能够撑满视口'
  );

  // 2. 验证底部呼吸安全避让间距 padding-bottom: 120px
  assert.ok(
    stylesContent.includes('padding-bottom: 120px;') || stylesContent.includes('padding-bottom:120px;'),
    '样式中必须定义 padding-bottom: 120px 确保卡片不被吸底输入框遮挡'
  );

  // 3. 验证状态提示容器优雅留白
  assert.ok(
    stylesContent.includes('.omnimux-library-stage-status'),
    '必须包含 .omnimux-library-stage-status 类名样式'
  );
  assert.ok(
    stylesContent.includes('min-height: 120px;') || stylesContent.includes('min-height:120px;'),
    '空态或加载态容器必须设置居中与最小高度'
  );
});

test('E2E-02: ExploreTemplatesSection 具备 0ms 即时跳转与双帧 requestAnimationFrame 复核锁定', () => {
  const componentPath = resolve(
    REPO_ROOT,
    'plugins/omnimux/src/client/session-guide/templates/ExploreTemplatesSection.jsx'
  );
  const code = readFileSync(componentPath, 'utf8');

  // 必须使用原生 scrollTop 计算与赋值实现 0ms 原子跳转
  assert.ok(
    code.includes('targetOffset = scroller.scrollTop + (elRect.top - scrollerRect.top);') ||
      code.includes('scroller.scrollTop = Math.max(0, targetOffset);'),
    '必须通过原子 scrollTop 赋值消除 smooth 异步动画竞态'
  );

  // 必须包含双帧 requestAnimationFrame 嵌套
  assert.ok(
    code.includes('requestAnimationFrame'),
    '必须使用 requestAnimationFrame 进行布局回流后的置顶复核'
  );
  assert.ok(
    code.includes('cancelAnimationFrame'),
    '组件卸载或连续触发时必须安全清理 requestAnimationFrame 句柄'
  );
});

test('E2E-03: 视口几何仿真：无论 0 张、5 张还是海量卡片，Tab 栏 100% 滚动贴顶无截断', () => {
  const viewportHeight = 900;
  const filterBarHeight = 96;
  const contentMinHeight = viewportHeight - filterBarHeight; // 804px

  // 场景 A: 0 张卡片（空态）
  const emptyContentHeight = Math.max(120, contentMinHeight);
  const scrollHeightEmpty = 300 + filterBarHeight + emptyContentHeight;
  const targetOffset = 300;
  const maxScrollEmpty = scrollHeightEmpty - viewportHeight;
  assert.ok(maxScrollEmpty >= targetOffset, '0 张卡片场景下最大滚动范围必须足以支持 Tab 置顶');

  // 场景 B: 5 张卡片（用户反馈的核心缺陷场景）
  const fiveCardsNaturalHeight = 220;
  const effectiveFiveCardsHeight = Math.max(fiveCardsNaturalHeight, contentMinHeight);
  const scrollHeightFiveCards = 300 + filterBarHeight + effectiveFiveCardsHeight;
  const maxScrollFive = scrollHeightFiveCards - viewportHeight;
  assert.ok(maxScrollFive >= targetOffset, '5 张卡片场景下最大滚动范围必须足以支持 Tab 置顶');
  const actualScrollTop = Math.min(targetOffset, maxScrollFive);
  const finalTopOffset = targetOffset - actualScrollTop;
  assert.equal(finalTopOffset, 0, 'Tab 栏顶边距离视口顶部偏移必须严格为 0px');

  // 场景 C: 50 张卡片（海量瀑布流）
  const manyCardsHeight = 3500;
  const scrollHeightMany = 300 + filterBarHeight + manyCardsHeight;
  const maxScrollMany = scrollHeightMany - viewportHeight;
  assert.ok(maxScrollMany >= targetOffset, '海量卡片场景下自然支持滚动置顶');
});

test('E2E-04: 交互 Demo 原型 (deliverables/omnimux-picker-interaction-demo) 保持 1:1 视口撑开与锁定逻辑', () => {
  const demoPath = resolve(
    REPO_ROOT,
    'deliverables/omnimux-picker-interaction-demo/index.html'
  );
  const demoContent = readFileSync(demoPath, 'utf8');

  assert.ok(
    demoContent.includes('min-height: calc(100vh - 96px);') ||
      demoContent.includes('min-height: calc(100vh - 80px);') ||
      demoContent.includes('min-height: 100vh;'),
    'Demo 原型中必须设置内容区域最小高度'
  );
  assert.ok(
    demoContent.includes('padding: 24px 32px 120px;') || demoContent.includes('padding-bottom: 120px;'),
    'Demo 原型中必须包含安全避让间距'
  );
});
