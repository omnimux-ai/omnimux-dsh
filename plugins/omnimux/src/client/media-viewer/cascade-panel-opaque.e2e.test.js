/**
 * 图像生成页面模型级联面板取消透明效果与实体底色契约测试
 * Issue #2503, specs/fix-image-generation-cascade-panel-opaque.spec.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function extractRule(source, selector) {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `样式中必须存在选择器 ${selector}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`选择器 ${selector} 规则块未闭合`);
}

test('契约验证: 图像生成浮层面板取消透明效果并具备不透明实体底色 (AC-1 & AC-2)', async () => {
  const stylesSource = await readFile(resolve(here, 'styles.js'), 'utf8');

  // 1. 浮层外壳容器 .omx-popover-shell
  const shellRule = extractRule(stylesSource, '.omx-popover-shell {');
  assert.ok(
    shellRule.includes('background: var(--dsw-alias-bg-elevated, #1c1c1f)'),
    '浮层外壳必须具备不透明深色实体兜底色值 var(--dsw-alias-bg-elevated, #1c1c1f)'
  );
  assert.ok(
    !shellRule.includes('backdrop-filter'),
    '浮层外壳必须彻底移除 backdrop-filter 毛玻璃特效以取消透明效果'
  );

  // 2. 级联模型面板主体 .omx-cascade-panel
  const cascadeRule = extractRule(stylesSource, '.omx-cascade-panel {');
  assert.ok(
    cascadeRule.includes('background: var(--dsw-alias-bg-elevated, #1c1c1f)'),
    '级联面板主体必须明确声明实体背景底色，杜绝继承透明度'
  );
  assert.ok(
    !cascadeRule.includes('backdrop-filter'),
    '级联面板主体不得包含 backdrop-filter 滤镜'
  );

  // 3. 操作模式浮层与参数浮层 .omx-op-mode-popover / .omx-params-panel
  const opModeRule = extractRule(stylesSource, '.omx-op-mode-popover {');
  assert.ok(
    opModeRule.includes('background: var(--dsw-alias-bg-elevated, #1c1c1f)'),
    '操作模式浮层必须具备不透明实体底色'
  );

  const paramsRule = extractRule(stylesSource, '.omx-params-panel {');
  assert.ok(
    paramsRule.includes('background: var(--dsw-alias-bg-elevated, #1c1c1f)'),
    '参数配置浮层必须具备不透明实体底色'
  );
});

test('契约验证: 底部胶囊条触发按钮与激活态选项卡具备实体兜底底色 (AC-2)', async () => {
  const stylesSource = await readFile(resolve(here, 'styles.js'), 'utf8');

  // 4. 底部胶囊条 hover 与 active 状态
  const triggerHoverRule = extractRule(stylesSource, '.omx-capsule-trigger:hover {');
  assert.ok(
    triggerHoverRule.includes('background: var(--dsw-alias-bg-elevated, #1c1c1f)'),
    '.omx-capsule-trigger:hover 必须包含 #1c1c1f 兜底'
  );

  const triggerActiveRule = extractRule(stylesSource, '.omx-capsule-trigger.is-active {');
  assert.ok(
    triggerActiveRule.includes('background: var(--dsw-alias-bg-elevated, #1c1c1f)'),
    '.omx-capsule-trigger.is-active 必须包含 #1c1c1f 兜底'
  );

  // 5. 参数分段控件 pill 激活态
  const pillActiveRule = extractRule(stylesSource, '.omx-mode-pill.is-active {');
  assert.ok(
    pillActiveRule.includes('background: var(--dsw-alias-bg-elevated, #1c1c1f)'),
    '.omx-mode-pill.is-active 必须包含 #1c1c1f 兜底'
  );
});

test('防御性安全门禁: 全量检查 styles.js 中无裸用未兜底的 var(--dsw-alias-bg-elevated)', async () => {
  const stylesSource = await readFile(resolve(here, 'styles.js'), 'utf8');

  // 匹配所有 var(--dsw-alias-bg-elevated...)
  const matches = stylesSource.match(/var\(--dsw-alias-bg-elevated[^)]*\)/g) || [];
  assert.ok(matches.length > 0, '应存在 var(--dsw-alias-bg-elevated) 相关声明');

  for (const item of matches) {
    assert.equal(
      item,
      'var(--dsw-alias-bg-elevated, #1c1c1f)',
      `发现未补齐 #1c1c1f 兜底的 CSS 变量调用: ${item}`
    );
  }
});
