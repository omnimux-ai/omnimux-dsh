import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const evidenceDir = join(repoRoot, 'docs/evidence/media-viewer-flow-alignment');
const reportPath = join(evidenceDir, 'report.json');

function readReport() {
  assert.equal(existsSync(reportPath), true, '必须存在本轮浏览器证据 report.json');
  return JSON.parse(readFileSync(reportPath, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const sourceFiles = {
  tab: join(here, 'MediaViewerTab.jsx'),
  panel: join(here, 'HistoryPanel.jsx'),
  styles: join(here, 'flow-alignment-styles.js'),
  history: join(here, 'generation-history.js'),
  cost: join(here, 'media-cost.js'),
  composer: join(here, 'MediaViewerComposer.jsx'),
  composerData: join(here, 'MediaViewerComposerData.js'),
  configControls: join(here, 'MediaConfigControls.jsx'),
  mount: join(here, 'mount.js'),
  locales: join(here, '../client/locales.ts'),
  copy: join(here, 'flow-alignment-copy.js'),
  harness: join(here, '../../test-support/media-viewer-flow-alignment/harness.jsx'),
  capture: join(here, '../../test-support/media-viewer-flow-alignment/capture.mjs'),
  buildHarness: join(here, '../../test-support/media-viewer-flow-alignment/build-harness.mjs'),
};

test('浏览器证据：宽档历史栏、窄档抽屉、切换与成本行全部通过', () => {
  const report = readReport();
  assert.equal(report.pass, true);
  assert.equal(report.issue, 3533);
  assert.match(report.sourceCommit, /^[0-9a-f]{40}$/);
  assert.equal(report.sourceDirty, false, '证据必须在干净的源码提交上生成');
  execFileSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', report.sourceCommit, 'HEAD']);
  assert.ok(report.assertions.length >= 12, '证据断言数量不足');
  assert.equal(report.assertions.filter((item) => item.pass).length, report.assertions.length, '存在失败断言');

  const wide = report.wide;
  assert.ok(wide.rail.width >= 255 && wide.rail.width <= 265, `历史栏宽度异常: ${wide.rail.width}`);
  assert.notEqual(wide.railVisibility, 'hidden');
  assert.equal(wide.toggleDisplay, 'none', '宽档不应显示历史按钮');
  assert.equal(wide.cards, 5);
  assert.ok(wide.batches.includes('×2'));
  assert.match(wide.activeText, /产品图/, '最新完成项应为当前项');
  assert.match(wide.costText, /预估消耗/);
  assert.match(wide.costText, /0\.26/);
  assert.notEqual(report.interactions.stageAfterSwitch, report.interactions.stageBefore, '点击历史未切换舞台');
  assert.match(report.interactions.reusedPrompt, /沙漠里的柴犬/, '复用提示未回填 composer');

  const narrowClosed = report.narrowClosed;
  assert.equal(narrowClosed.frameWidth, 640, '窄档证据必须以 640px 容器生成');
  assert.equal(narrowClosed.railVisibility, 'hidden', '窄档历史栏应隐藏');
  assert.notEqual(narrowClosed.toggleDisplay, 'none', '窄档应显示历史按钮');
  assert.equal(report.narrowOpen.hasHistoryOpen, 'true');
  assert.equal(report.narrowOpen.railVisibility, 'visible');
  assert.ok(report.narrowOpen.rail.width >= 300, '抽屉宽度异常');
  assert.equal(report.narrowOpen.scrimOpacity, '1');
});

test('浏览器证据截图是可解码的真实 PNG 且覆盖宽窄两档', () => {
  const report = readReport();
  assert.deepEqual(report.screenshots, ['wide-1280.png', 'narrow-640-closed.png', 'narrow-640-open.png']);
  for (const name of report.screenshots) {
    const file = join(evidenceDir, name);
    assert.equal(existsSync(file), true, `缺少截图 ${name}`);
    const png = PNG.sync.read(readFileSync(file));
    assert.equal(png.width, report.wide.viewport.width);
    assert.equal(png.height, report.wide.viewport.height);
  }
  assert.ok(report.wide.viewport.width >= 1280);
});

test('证据哈希覆盖历史、成本与 harness 的完整切片，且与当前源码一致', () => {
  const report = readReport();
  for (const key of Object.keys(sourceFiles)) {
    assert.match(report.sources[key] || '', /^[0-9a-f]{64}$/, `证据缺少 ${key} 哈希`);
    assert.equal(report.sources[key], sha256(sourceFiles[key]), `证据与 ${key} 源码不一致`);
  }
});
