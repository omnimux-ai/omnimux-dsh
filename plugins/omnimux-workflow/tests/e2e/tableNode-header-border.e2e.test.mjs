/**
 * 表格节点（TableNode）顶部表头圆角收敛与高光边框防遮挡 · 端到端契约测试
 * 针对 Issue #1879
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '../..');
const tableNodeSrc = readFileSync(
  join(pluginRoot, 'src/canvas/components/table-node/TableNode.tsx'),
  'utf8',
);
const componentsCss = readFileSync(
  join(pluginRoot, 'src/canvas/theme/components.css'),
  'utf8',
);

test('E2E: TableNode 卡片外框选中环保持 3px 连续高光圆角规范', () => {
  // 1. 卡片外框基础定义为 18px 圆角与 1px 边框
  assert.match(componentsCss, /\.wf-material-node__card\s*\{[\s\S]*?border-radius:\s*18px;/);
  assert.match(componentsCss, /\.wf-material-node__card\s*\{[\s\S]*?border:\s*1px solid var\(--wb-border\);/);

  // 2. 选中态声明白色边框与 2px 白色内阴影高光环
  assert.match(
    componentsCss,
    /\.wf-material-node\.wf-material-node--selected \.wf-material-node__card\s*\{[\s\S]*?border-color:\s*var\(--wb-node-ring\);[\s\S]*?box-shadow:\s*[\s\S]*?inset 0 0 0 2px var\(--wb-node-ring\)/,
  );
});

test('E2E: TableNode 表头与内部包裹层声明内切圆角且背景透明，彻底消除双边框与直角遮挡', () => {
  // 1. 表头外层包裹容器必须声明顶部圆角收缩与 overflow: hidden
  assert.match(
    tableNodeSrc,
    /borderTopLeftRadius:\s*'calc\(var\(--wb-node-radius,\s*18px\)\s*-\s*1px\)'[\s\S]*?borderTopRightRadius:\s*'calc\(var\(--wb-node-radius,\s*18px\)\s*-\s*1px\)'[\s\S]*?overflow:\s*'hidden'/,
    '外层容器必须约束顶部圆角与 overflow: hidden',
  );

  // 2. 表头元素本身具有匹配的顶部内切圆角
  assert.match(
    tableNodeSrc,
    /borderBottom:\s*'1px solid var\(--wb-border\)'[\s\S]*?borderTopLeftRadius:\s*'calc\(var\(--wb-node-radius,\s*18px\)\s*-\s*1px\)'[\s\S]*?borderTopRightRadius:\s*'calc\(var\(--wb-node-radius,\s*18px\)\s*-\s*1px\)'/,
    '表头自身必须声明顶部左右内切圆角',
  );

  // 3. 表头背景必须保持透明（transparent），绝不以深灰底色覆盖父容器高光内阴影
  assert.match(
    tableNodeSrc,
    /background:\s*'transparent'/,
    '表头背景必须为透明，彻底杜绝双边框与遮挡高光环',
  );
});
