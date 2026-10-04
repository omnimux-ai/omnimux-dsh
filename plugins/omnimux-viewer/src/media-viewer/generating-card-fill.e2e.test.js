/**
 * 生成中任务卡"动效彻底铺满、消除四周黑边间距"端到端验证测试
 * 基于 CDP 实机测量产物 (docs/evidence/viewer-generating-card-fill/report.json)
 * 与核心组件类名、样式契约：
 * 1. 卡片 padding 归零（cardPadding: "0px"）；
 * 2. 画布与卡片四边无间隙（gapLeft/Top/Right/Bottom 全为 0）；
 * 3. 根容器带有 .cardFull 修饰类，canvas 带有 .fieldFull 修饰类。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

test('生成中任务卡动效彻底铺满端到端测量契约', async () => {
  // 1. 实测 CDP 数据契约
  const reportPath = join(repoRoot, 'docs/evidence/viewer-generating-card-fill/report.json');
  assert.equal(existsSync(reportPath), true, '必须存在真实浏览器测量证据');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));

  assert.equal(report.cardPadding, '0px', '无头变体卡片 padding 必须清零');
  assert.equal(report.gapLeft, 0, '画布左边缘必须与卡片左边缘完全对齐（无空闲黑边）');
  assert.equal(report.gapTop, 0, '画布上边缘必须与卡片上边缘完全对齐（无空闲黑边）');
  assert.equal(report.gapRight, 0, '画布右边缘必须与卡片右边缘完全对齐（无空闲黑边）');
  assert.equal(report.gapBottom, 0, '画布下边缘必须与卡片下边缘完全对齐（无空闲黑边）');
  assert.equal(report.canvasRect.width, 520, '画布宽度必须 100% 充满卡片');
  assert.equal(report.canvasRect.height, 520, '画布高度必须 100% 充满卡片');

  // 2. 源码结构契约
  const tsx = readFileSync(
    join(repoRoot, 'packages/dsh-ui-kit/src/gen-wave-card/GenWaveCard.tsx'),
    'utf8'
  );
  assert.equal(tsx.includes('statusText ? "" : cssClass(css.cardFull, "cardFull")'), true, '卡片根节点必须条件挂载 cardFull');
  assert.equal(tsx.includes('statusText ? "" : cssClass(css.fieldFull, "fieldFull")'), true, '画布节点必须条件挂载 fieldFull');

  const css = readFileSync(
    join(repoRoot, 'packages/dsh-ui-kit/src/gen-wave-card/GenWaveCard.module.css'),
    'utf8'
  );
  assert.equal(/\.cardFull\s*\{[^}]*padding:\s*0/s.test(css), true, 'cardFull 必须设置 padding: 0');
});
