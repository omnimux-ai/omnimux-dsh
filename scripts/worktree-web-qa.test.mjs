import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertPng,
  findChromePath,
  runSidebarChromeQa,
  runWorktreeWebQa,
  selectStages,
  STAGE_CONFIG,
} from './worktree-web-qa.mjs';
import {
  buildSidebarChromeHarnessHtml,
  extractRightbarChromeStyles,
  interpretNegativeControl,
  interpretSidebarChromeGeometry,
  judgeSidebarChromeRun,
  SIDEBAR_CHROME_SOURCE_PATH,
} from './sidebar-chrome-qa-fixture.mjs';

test('worktree-web-qa: selectStages handles valid and invalid inputs', () => {
  const allStages = selectStages('all');
  assert.deepEqual(allStages, Object.keys(STAGE_CONFIG));

  const single = selectStages('accounts');
  assert.deepEqual(single, ['accounts']);

  assert.throws(() => selectStages('invalid-stage'), /未知 Stage/);
});

test('worktree-web-qa: findChromePath locates an existing browser binary', () => {
  const bin = findChromePath();
  assert.ok(typeof bin === 'string' && bin.length > 0);
  assert.ok(existsSync(bin), `Chrome binary does not exist at ${bin}`);
});

test('worktree-web-qa: assertPng verifies valid and invalid PNG payloads', () => {
  assert.throws(() => assertPng(Buffer.from('short')), /截图 PNG 数据为空/);
  assert.throws(() => assertPng(Buffer.alloc(40)), /截图 PNG 解码失败/);
});

test('worktree-web-qa: end-to-end execution on accounts stage in worktree', async () => {
  const report = await runWorktreeWebQa('accounts');
  assert.equal(report.pass, true, `Expected pass, got errors: ${report.errors.join('; ')}`);
  assert.ok(report.serverPort > 0, 'Server port must be valid dynamic port');
  assert.ok(report.cdpPort > 0, 'CDP port must be valid dynamic port');
  assert.ok(report.screenshot?.path && existsSync(report.screenshot.path), 'Screenshot file must exist');

  const pngBytes = readFileSync(report.screenshot.path);
  const dimensions = assertPng(pngBytes);
  assert.equal(dimensions.width, 1280);
  assert.ok(dimensions.height > 0);

  const stageAssert = report.assertions.find((a) => a.name === 'stage-content-rendered');
  assert.ok(stageAssert && stageAssert.pass, 'Stage content assertion must pass');
});

/* ── 右侧栏 chrome 几何门禁（工单 #1638） ─────────────────────────────── */

test('sidebar-chrome: 从生产源码抽取被测样式，锚点缺失时必须报错', () => {
  const source = readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), SIDEBAR_CHROME_SOURCE_PATH), 'utf8');
  const css = extractRightbarChromeStyles(source);
  assert.ok(css.includes('[data-dockkit-strip]'), '抽取结果必须包含顶栏选择器');
  assert.ok(/height:\s*40px\s*!important/.test(css), '抽取结果必须包含顶栏高度规则');

  assert.throws(
    () => extractRightbarChromeStyles('const SOMETHING_ELSE = `x`'),
    /未找到样式常量锚点/,
    '锚点缺失必须报错',
  );
  assert.throws(
    () => extractRightbarChromeStyles('var RIGHTBAR_CHROME_STYLES = `\n.a{color:red}\n`'),
    /缺少 \[data-dockkit-strip\]/,
    '规则被删除时必须报错',
  );
});

test('sidebar-chrome: 夹具页不得自带修复规则（防自证）', () => {
  const html = buildSidebarChromeHarnessHtml();
  assert.ok(html.includes('data-dockkit-strip'), '夹具必须携带真实顶栏标记');
  assert.ok(html.includes('height: 28px'), '夹具必须镜像真实 28px 顶栏高度以复现缺陷');
  assert.ok(!html.includes('40px'), '夹具不得包含修复后的 40px');
  assert.ok(!html.includes('6px 6px 6px 10px'), '夹具不得包含修复后的内边距');
});

test('sidebar-chrome: 反向对照裁决在夹具失真时必须变红', () => {
  const broken = { stripHeight: 28, tabBottom: 33, paneBodyTop: 28, gap: -5, tabCoveredByContent: true };
  assert.ok(interpretNegativeControl(broken).every((a) => a.pass), '缺陷态必须满足反向对照');

  const alreadyFixed = { stripHeight: 40, tabBottom: 34, paneBodyTop: 40, gap: 6, tabCoveredByContent: false };
  const distorted = interpretNegativeControl(alreadyFixed);
  assert.ok(distorted.some((a) => !a.pass), '夹具若已修好，反向对照必须失败以暴露失真');
});

test('sidebar-chrome: 正向裁决对缺陷态必须全红、对修复态全绿', () => {
  const broken = { stripHeight: 28, stripBoxSizing: 'border-box', stripPadding: '10px 6px 0px 10px', tabTop: 5, tabBottom: 33, paneBodyTop: 28, gap: -5, tabCoveredByContent: true };
  assert.ok(interpretSidebarChromeGeometry(broken).some((a) => !a.pass), '缺陷态不得通过正向裁决');

  const fixed = { stripHeight: 40, stripBoxSizing: 'border-box', stripPadding: '6px 6px 6px 10px', tabTop: 6, tabBottom: 34, paneBodyTop: 40, gap: 6, tabCoveredByContent: false };
  assert.ok(interpretSidebarChromeGeometry(fixed).every((a) => a.pass), '修复态必须全绿');

  const drifted = { ...fixed, gap: 5 };
  assert.equal(judgeSidebarChromeRun({ negative: [], positive: interpretSidebarChromeGeometry(drifted) }).pass, false, '间距回归必须被判定失败');
});

test('sidebar-chrome: 真实浏览器端到端 —— 动态端口、反向对照、零污染释放回执', async () => {
  const report = await runSidebarChromeQa();
  assert.equal(report.pass, true, `Expected pass, got: ${[...report.errors, ...report.assertions.filter((a) => !a.pass).map((a) => a.name)].join('; ')}`);
  assert.ok(report.serverPort > 0, '网页服务端口必须是动态分配的有效端口');
  assert.ok(report.cdpPort > 0, '浏览器调试端口必须是动态分配的有效端口');
  assert.notEqual(report.serverPort, report.cdpPort, '两个端口不得相同');

  assert.equal(report.negativeControl.tabCoveredByContent, true, '反向对照必须复现遮挡');
  assert.ok(report.negativeControl.gap < 0, '反向对照间距必须为负');
  assert.equal(report.positive.stripHeight, 40, '修复后顶栏必须为 40');
  assert.equal(report.positive.gap, 6, '修复后间距必须为 +6');
  assert.equal(report.positive.tabCoveredByContent, false, '修复后不得再被遮挡');

  assert.ok(report.screenshot?.after && existsSync(report.screenshot.after), '修复后截图必须落盘');
  assert.ok(report.screenshot?.before && existsSync(report.screenshot.before), '对照截图必须落盘');
  assert.equal(assertPng(readFileSync(report.screenshot.after)).height > 0, true);

  assert.deepEqual(report.cleanup, {
    cdpPortReleased: true,
    httpServerClosed: true,
    profileRemoved: true,
    allReleased: true,
  }, '资源必须全部释放且零配置目录残留');
});
