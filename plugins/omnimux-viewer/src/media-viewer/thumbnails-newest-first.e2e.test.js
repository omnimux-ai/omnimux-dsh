import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

test('左侧缩略图按时间倒序排列（最新项置顶显示）端到端契约与证据验证', async () => {
  // 1. 验证真实浏览器实测证据产物
  const reportPath = join(repoRoot, 'docs/evidence/viewer-thumbnails-newest-first/report.json');
  assert.equal(existsSync(reportPath), true, '必须存在真实浏览器与DOM测量证据');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));

  assert.equal(report.orderValidation, 'PASS', '证据报告中排序校验必须通过');
  assert.equal(report.itemCount, 4, '缩略图栏项数量必须符合预期');
  assert.equal(report.topItemIsGeneratingTask, true, '缩略图首项（顶部第1个）必须为最新生成任务');
  assert.equal(report.secondItemIsLatestImage, true, '缩略图第二项必须为最新生成的图片');

  // 2. 验证证据截屏存在且尺寸大于 0
  const screenshotPath = join(repoRoot, 'docs/evidence/viewer-thumbnails-newest-first/thumbnails-newest-first-headless.png');
  assert.equal(existsSync(screenshotPath), true, '必须存在 headless 渲染截屏文件');

  // 3. 验证源码关键行绑定契约
  const tabPath = join(here, './MediaViewerTab.jsx');
  const tabSource = readFileSync(tabPath, 'utf8');

  assert.equal(
    tabSource.includes('thumbnailsList.length > 1 ? ('),
    true,
    '缩略图栏渲染必须以 thumbnailsList.length 作为开关'
  );
  assert.equal(
    tabSource.includes('{thumbnailsList.map((item) => {'),
    true,
    '缩略图列表渲染必须遍历按最新倒序排列的 thumbnailsList'
  );
});
