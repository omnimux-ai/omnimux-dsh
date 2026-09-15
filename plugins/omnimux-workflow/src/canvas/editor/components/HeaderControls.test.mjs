import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const headerControlsSrc = readFileSync(join(here, 'HeaderControls.tsx'), 'utf8');
const canvasEditorSrc = readFileSync(join(here, '../CanvasEditor.tsx'), 'utf8');
const appSrc = readFileSync(join(here, '../../App.tsx'), 'utf8');
const execBarSrc = readFileSync(join(here, 'ExecutionBar.tsx'), 'utf8');
const controllerSrc = readFileSync(join(here, '../../hooks/useExecutionController.ts'), 'utf8');

test('HeaderControls 不再暴露 onStartExecution 属性', () => {
  assert.equal(headerControlsSrc.includes('onStartExecution'), false);
});

test('HeaderControls 彻底移除全画布执行按钮与类名', () => {
  assert.equal(headerControlsSrc.includes('wf-header-capsule--exec-standalone'), false);
  assert.equal(headerControlsSrc.includes('wf-header-capsule__btn--run-all'), false);
  assert.equal(headerControlsSrc.includes("t('exec.runAll')"), false);
});

test('CanvasEditor 与 App 移除 onStartExecution 全画布触发绑定', () => {
  assert.equal(canvasEditorSrc.includes('onStartExecution'), false);
  assert.equal(appSrc.includes('onStartExecution'), false);
  assert.equal(appSrc.includes("mode: 'full'"), false);
});

test('ExecutionBar 移除全画布一键运行按钮', () => {
  assert.equal(execBarSrc.includes("t('exec.runAll')"), false);
  assert.equal(execBarSrc.includes("t('exec.runAllTitle')"), false);
});

test('useExecutionController 拦截 mode: full 执行并阻断全画布运行', () => {
  assert.match(controllerSrc, /if\s*\(\s*opts\.mode\s*===\s*'full'\s*\)/);
  assert.match(controllerSrc, /创作画布不支持全画布一键运行/);
});
