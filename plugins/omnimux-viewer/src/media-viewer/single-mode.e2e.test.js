import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const evidenceDir = join(repoRoot, 'docs/evidence/viewer-single-mode-3571');

test('浏览器证据：模式切换按钮与网格 DOM 已移除，单图交互保留', () => {
  const report = JSON.parse(readFileSync(join(evidenceDir, 'report.json'), 'utf8'));
  assert.equal(report.pass, true);
  assert.equal(report.issue, 3571);
  assert.equal(report.assertions.length, 6);
  assert.equal(report.assertions.filter((item) => item.pass).length, 6);
  assert.deepEqual(report.before.modeButtons, []);
  assert.equal(report.before.capsule, 0);
  assert.equal(report.before.timeline, 0);
  assert.equal(report.before.singleStage, true);
  assert.notEqual(report.zoomBefore, report.zoomAfter);
  assert.deepEqual(report.screenshots, ['wide-single.png', 'wide-single-zoomed.png']);
  for (const name of report.screenshots) {
    const png = PNG.sync.read(readFileSync(join(evidenceDir, name)));
    assert.ok(png.width > 0 && png.height > 0);
  }
});

test('证据哈希绑定单图模式源码，且源码中不再有 grid/subViewMode 入口', () => {
  const report = JSON.parse(readFileSync(join(evidenceDir, 'report.json'), 'utf8'));
  const files = {
    tab: join(here, 'MediaViewerTab.jsx'),
    styles: join(here, '../../../omnimux/src/client/media-viewer/styles.js'),
    store: join(here, '../../../omnimux/src/client/media-viewer/media-viewer-store.js'),
    stage: join(here, '../../../omnimux/src/client/media-viewer/image-canvas-stage.js'),
  };
  for (const key of Object.keys(files)) {
    assert.equal(report.sources[key], createHash('sha256').update(readFileSync(files[key])).digest('hex'), `证据与 ${key} 源码不一致`);
  }
  const tab = readFileSync(files.tab, 'utf8');
  const store = readFileSync(files.store, 'utf8');
  const stage = readFileSync(files.stage, 'utf8');
  for (const source of [tab, store, stage]) {
    assert.doesNotMatch(source, /subViewMode|setSubViewMode|getTimelineGroups|omx-mv-timeline|omx-mv-capsule/);
  }
});
