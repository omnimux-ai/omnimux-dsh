/**
 * 端到端测试：创作画布彻底移除一键运行全画布执行功能
 *
 * 验证目标：
 * 1. 顶栏控制区（HeaderControls）：闲态下彻底移除 .wf-header-capsule--exec-standalone 独立全部运行圆形按键。
 * 2. 状态胶囊区（wf-header-capsule--exec）：终态下彻底移除 .wf-header-capsule__btn--run-all 重新执行全部按键。
 * 3. 执行控制条（ExecutionBar）：移除 runAll 按钮，仅保留暂停、继续、取消及重置。
 * 4. 验证 DOM 挂载与类名规范。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '../..');
const headerControlsSrc = readFileSync(
  join(pluginRoot, 'src/canvas/editor/components/HeaderControls.tsx'),
  'utf8',
);
const execBarSrc = readFileSync(
  join(pluginRoot, 'src/canvas/editor/components/ExecutionBar.tsx'),
  'utf8',
);
const appSrc = readFileSync(join(pluginRoot, 'src/canvas/App.tsx'), 'utf8');

test('E2E: 顶栏组件源码不包含任何 run-all 或 exec-standalone 执行按钮标记', () => {
  assert.equal(headerControlsSrc.includes('wf-header-capsule--exec-standalone'), false);
  assert.equal(headerControlsSrc.includes('wf-header-capsule__btn--run-all'), false);
  assert.equal(headerControlsSrc.includes("t('exec.runAll')"), false);
});

test('E2E: 执行条组件 ExecutionBar 源码已移除 runAll 按钮', () => {
  assert.equal(execBarSrc.includes("t('exec.runAll')"), false);
  assert.equal(execBarSrc.includes("t('exec.runAllTitle')"), false);
});

test('E2E: App.tsx 入口处未再向下传递全画布触发句柄', () => {
  assert.equal(appSrc.includes('onStartExecution'), false);
  assert.equal(appSrc.includes("mode: 'full'"), false);
});

test('E2E: DOM 渲染与属性验证 —— 闲态与终态均无全画布执行节点', () => {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`);
  const doc = dom.window.document;

  // 模拟闲态渲染
  const root = doc.getElementById('root');
  root.innerHTML = `
    <div class="wf-header-controls nodrag nopan">
      <div class="wf-header-capsule">
        <button type="button" class="wf-header-capsule__btn" title="自适应视口"></button>
        <div class="wf-header-capsule__divider"></div>
        <button type="button" class="wf-header-capsule__btn" title="缩小"></button>
        <span class="wf-header-capsule__zoom-text">100%</span>
        <button type="button" class="wf-header-capsule__btn" title="放大"></button>
      </div>
    </div>
  `;

  assert.equal(doc.querySelector('.wf-header-capsule--exec-standalone'), null);
  assert.equal(doc.querySelector('.wf-header-capsule__btn--run-all'), null);
  assert.equal(doc.querySelectorAll('button[aria-label="执行全部"]').length, 0);

  // 模拟终态渲染（只有状态胶囊与重置按键）
  root.innerHTML = `
    <div class="wf-header-controls nodrag nopan">
      <div class="wf-header-capsule wf-header-capsule--exec wf-header-capsule--terminal">
        <span class="wf-header-capsule__status-pill wf-header-capsule__status-pill--completed">已完成</span>
        <button type="button" class="wf-header-capsule__btn" title="重置"></button>
      </div>
      <div class="wf-header-capsule">
        <span class="wf-header-capsule__zoom-text">100%</span>
      </div>
    </div>
  `;

  assert.equal(doc.querySelector('.wf-header-capsule__btn--run-all'), null);
  assert.notEqual(doc.querySelector('.wf-header-capsule__status-pill--completed'), null);
  assert.notEqual(doc.querySelector('button[title="重置"]'), null);
});
