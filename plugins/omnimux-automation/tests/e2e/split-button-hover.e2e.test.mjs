/**
 * 定时任务工作台分裂创建按钮（Split Button）悬停与胶囊底色 · 端到端契约测试
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '../..');
const stylesJs = readFileSync(
  join(pluginRoot, 'src/client/styles.js'),
  'utf8',
);
const clientBundle = readFileSync(
  join(pluginRoot, 'lib/client.js'),
  'utf8',
);

test('E2E: 分裂创建按钮左右半边必须统一采用 primary-fill 主底色，消除深暗割裂', () => {
  // 1. styles.js 源码中右侧 toggle 必须使用 button-primary-fill 作为底色
  assert.match(
    stylesJs,
    /\.dsh-st-split \.dsh-st-split-toggle\{[^}]*background:var\(--dsw-alias-button-primary-fill/,
    'toggle 默认背景必须与主行动按钮 fill 严格同源',
  );

  // 2. 文本与图标颜色保持主行动按钮前景色
  assert.match(
    stylesJs,
    /\.dsh-st-split \.dsh-st-split-toggle\{[^}]*color:var\(--dsw-alias-label-primary-foreground/,
    'toggle 文本/图标颜色必须对齐 primary-foreground',
  );

  // 3. 彻底根除硬编码的深色图层底色
  assert.doesNotMatch(
    stylesJs,
    /\.dsh-st-split \.dsh-st-split-toggle\{[^}]*background:var\(--dsw-alias-bg-layer-4/,
    '严禁在 toggle 默认背景中使用暗色 bg-layer-4',
  );
});

test('E2E: 分裂创建按钮悬停必须使用 primary-hover 浅色高亮，严禁出现深黑硬块', () => {
  // 1. toggle 悬停与展开态使用 button-primary-hover
  assert.match(
    stylesJs,
    /\.dsh-st-split \.dsh-st-split-toggle:hover,\.dsh-st-split\.is-open \.dsh-st-split-toggle\{background:var\(--dsw-alias-button-primary-hover/,
    'toggle hover 与展开态必须使用 primary-hover',
  );

  // 2. 主按钮悬停态同步支持 primary-hover
  assert.match(
    stylesJs,
    /\.dsh-st-split \.dsh-st-split-main:hover\{background:var\(--dsw-alias-button-primary-hover/,
    'main 按钮 hover 必须使用 primary-hover',
  );

  // 3. 彻底根除 hover 时使用暗色 interactive-bg-hover
  assert.doesNotMatch(
    stylesJs,
    /\.dsh-st-split \.dsh-st-split-toggle:hover\{background:var\(--dsw-alias-interactive-bg-hover/,
    '严禁在 toggle hover 中使用深暗色 interactive-bg-hover',
  );

  // 4. client.js 构建产物同步包含该规范
  assert.match(
    clientBundle,
    /--dsw-alias-button-primary-hover/,
    '构建产物必须同步包含 primary-hover 规则',
  );
});
