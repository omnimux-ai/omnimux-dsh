import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
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

test('浏览器证据：宽档历史栏、窄档抽屉、切换与成本行全部通过', () => {
  const report = readReport();
  assert.equal(report.pass, true);
  assert.equal(report.issue, 3533);
  assert.match(report.commit, /^[0-9a-f]{40}$/);
  assert.ok(report.assertions.length >= 12, '证据断言数量不足');
  assert.equal(report.assertions.filter((item) => item.pass).length, report.assertions.length, '存在失败断言');
  const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(report.sources.tab, sha256(join(here, 'MediaViewerTab.jsx')), '证据与 MediaViewerTab 源码不一致');
  assert.equal(report.sources.panel, sha256(join(here, 'HistoryPanel.jsx')), '证据与 HistoryPanel 源码不一致');
  assert.equal(report.sources.styles, sha256(join(here, 'flow-alignment-styles.js')), '证据与样式源码不一致');
  assert.equal(report.sources.history, sha256(join(here, 'generation-history.js')), '证据与历史投影源码不一致');
  assert.equal(report.sources.cost, sha256(join(here, 'media-cost.js')), '证据与成本源码不一致');

  assert.ok(report.wide.rail.width >= 255 && report.wide.rail.width <= 265, `历史栏宽度异常: ${report.wide.rail.width}`);
  assert.notEqual(report.wide.railVisibility, 'hidden');
  assert.equal(report.wide.toggleDisplay, 'none', '宽档不应显示历史按钮');
  assert.equal(report.wide.cards, 5);
  assert.ok(report.wide.batches.includes('×2'));
  assert.match(report.wide.activeText, /沙漠里的柴犬/);
  assert.match(report.wide.costText, /预估消耗/);
  assert.match(report.wide.costText, /0\.26/);
  assert.notEqual(report.interactions.stageAfterSwitch, report.interactions.stageBefore, '点击历史未切换舞台');
  assert.match(report.interactions.reusedPrompt, /产品图/, '复用提示未回填 composer');

  assert.equal(report.narrowClosed.railVisibility, 'hidden', '窄档历史栏应隐藏');
  assert.notEqual(report.narrowClosed.toggleDisplay, 'none', '窄档应显示历史按钮');
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
});

test('样式与组件契约：容器查询、抽屉状态、历史卡片与成本行', () => {
  const styles = readFileSync(join(here, 'flow-alignment-styles.js'), 'utf8');
  assert.match(styles, /container: omx-mv \/ inline-size/);
  assert.match(styles, /@container omx-mv \(max-width: 899px\)/);
  assert.match(styles, /data-history-open="true"/);
  assert.match(styles, /\.omx-mv-cost/);

  const panel = readFileSync(join(here, 'HistoryPanel.jsx'), 'utf8');
  assert.match(panel, /omx-mv-history__card/);
  assert.match(panel, /aria-current/);
  assert.match(panel, /mediaViewer\.history\.reusePrompt/);

  const tab = readFileSync(join(here, 'MediaViewerTab.jsx'), 'utf8');
  assert.match(tab, /buildHistoryEntries\(sessionMediaList/);
  assert.match(tab, /queueComposerPrefill/);
  assert.match(tab, /data-history-open=/);

  const cost = readFileSync(join(here, 'media-cost.js'), 'utf8');
  assert.match(cost, /estimateMediaPoints/);
  const composerData = readFileSync(join(here, 'MediaViewerComposerData.js'), 'utf8');
  assert.match(composerData, /points: typeof ch\.pricing\?\.pointsEstimate === 'number'/);
});
