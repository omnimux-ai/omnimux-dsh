/**
 * 底栏触发器视觉统一（Issue: 模型选择 / 音色 / 参数摘要三处同源）。
 *
 * 用户决策（2026-09-14）：底栏触发器统一为胶囊外形，且必须复用同一份共享样式，
 * 不允许任一触发器再各自手写外观。规格：specs/bar-trigger-visual-unify.spec.md。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const themeCss = readFileSync(new URL('../../../../theme/components.css', import.meta.url), 'utf8');
const cascadeSrc = readFileSync(new URL('./ModelCascadeMenu.tsx', import.meta.url), 'utf8');
const configSrc = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

const SHARED_SELECTOR_HEAD = [
  '.wf-model-cascade-capsule,',
  '.wf-voice-trigger,',
  '.wf-cfg-summary-bar,',
  '.wf-video-trigger-bar,',
].join('\n');

/** 共享触发器组的首块声明（选择器到闭合大括号）。 */
function sharedTriggerBlock() {
  const start = themeCss.indexOf(SHARED_SELECTOR_HEAD);
  assert.notEqual(start, -1, '底栏触发器共享组必须存在（四个触发器加入同一组选择器）');
  const end = themeCss.indexOf('}', start);
  return themeCss.slice(start, end);
}

/** 按选择器取一条规则的声明块；取不到返回空串。 */
function ruleBlock(selector) {
  const start = themeCss.indexOf(`${selector} {`);
  if (start === -1) return '';
  return themeCss.slice(start, themeCss.indexOf('}', start));
}

/** 模型触发器按钮的 JSX 片段。 */
function cascadeTriggerJsx() {
  const start = cascadeSrc.indexOf('data-testid="wf-model-cascade-trigger"');
  assert.notEqual(start, -1, '模型触发器必须仍带 data-testid');
  const end = cascadeSrc.indexOf('</button>', start);
  return cascadeSrc.slice(cascadeSrc.lastIndexOf('<button', start), end);
}

test('底栏三个触发器复用同一份共享几何声明', () => {
  const block = sharedTriggerBlock();
  assert.match(block, /height:\s*32px/);
  assert.match(block, /border-radius:\s*999px/);
  assert.match(block, /padding:\s*0 8px 0 10px/);
  assert.match(block, /font-size:\s*12px/);
});

test('共享组提供 hover / open / active / focus-visible / disabled 五态契约', () => {
  for (const cls of ['wf-model-cascade-capsule', 'wf-voice-trigger', 'wf-cfg-summary-bar', 'wf-video-trigger-bar']) {
    assert.match(themeCss, new RegExp(`\\.${cls}:hover:not\\(:disabled\\)|^\\.${cls}:hover:not`, 'm'), `${cls} 必须共享 hover 态`);
  }
  assert.match(
    themeCss,
    /\.wf-model-cascade-capsule\[aria-expanded='true'\]:not\(:disabled\),\n\.wf-cfg-summary-bar\.wf-cfg-summary-bar--open:not\(:disabled\),/,
    'open 规则必须与 hover 规则同特异性，否则指针停留时展开态描边会被 hover 覆盖',
  );
  assert.match(themeCss, /\.wf-model-cascade-capsule:active:not\(:disabled\),/);
  assert.match(themeCss, /\.wf-model-cascade-capsule:focus-visible,\n\.wf-voice-trigger:focus-visible,/);
  assert.match(themeCss, /\.wf-model-cascade-capsule:disabled,\n\.wf-model-cascade-capsule\[aria-disabled='true'\],/);
});

test('模型触发器不再携带内联业务样式', () => {
  const jsx = cascadeTriggerJsx();
  assert.doesNotMatch(jsx, /style=\{\{/, '模型触发器的业务样式必须落在样式表，不再内联');
  assert.match(jsx, /className="wf-model-cascade-capsule"/);
  assert.match(jsx, /className="wf-model-cascade-capsule__name"/);
  assert.match(jsx, /className="wf-model-cascade-capsule__badge"/);
});

test('模型触发器 chevron 与共享组图标同阶（14px）并随展开翻转', () => {
  assert.match(cascadeTriggerJsx(), /className="wf-model-cascade-capsule__chevron" size=\{14\}/);
  assert.match(themeCss, /\.wf-model-cascade-capsule\[aria-expanded='true'\] \.wf-model-cascade-capsule__chevron \{\n\s*transform: rotate\(180deg\)/);
});

test('音色触发器不再重复声明几何与状态', () => {
  const block = ruleBlock('.wf-voice-trigger');
  assert.notEqual(block, '', '.wf-voice-trigger 必须仍有专属规则');
  assert.doesNotMatch(block, /border-radius|background:|height:/, '几何由共享组提供，专属规则只保留宽度约束');
  assert.match(block, /max-width:\s*180px/);
});

test('模型触发器保留不可压缩与不可选中的专属约束', () => {
  const block = ruleBlock('.wf-model-cascade-capsule');
  assert.match(block, /flex-shrink:\s*0/);
  assert.match(block, /user-select:\s*none/);
});

test('模型触发器仍由 aria-expanded 派生展开态（点击写入路径不变）', () => {
  const jsx = cascadeTriggerJsx();
  assert.match(jsx, /aria-expanded=\{isOpen\}/);
  assert.match(jsx, /disabled=\{execBusy\}/);
  assert.match(configSrc, /<ModelCascadeMenu/);
});

test('共享触发器各规则不写裸色字面量（令牌缺失一律用令牌 mix 兜底）', () => {
  const bareColorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
  const sharedTriggerRe = /wf-model-cascade-capsule|wf-voice-trigger/;
  const offenders = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let match = ruleRe.exec(themeCss);
  while (match !== null) {
    const selector = match[1];
    const body = match[2];
    if (sharedTriggerRe.test(selector) && bareColorRe.test(body)) {
      offenders.push(selector.trim().split('\n').pop().trim());
    }
    match = ruleRe.exec(themeCss);
  }
  assert.deepEqual(offenders, [], `底栏触发器禁止裸色字面量，发现：${offenders.join(' / ')}`);
  assert.match(themeCss, /color-mix\(in srgb, var\(--dsw-alias-brand-primary\) 45%, transparent\)/, '焦点环兜底必须用令牌 mix');
});
