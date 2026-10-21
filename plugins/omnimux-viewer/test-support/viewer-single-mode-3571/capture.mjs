import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { join } from 'node:path';

const repo = '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/viewer-single-mode';
const evidenceDir = join(repo, 'docs/evidence/viewer-single-mode-3571') + '/';
await fs.mkdir(evidenceDir, { recursive: true });
const task = await taskSpace('viewer single mode 3571 evidence');
const page = task.page('p1');
const sha256 = async (path) => crypto.createHash('sha256').update(await fs.readFile(path)).digest('hex');

const snapshot = () => page.evaluate(() => {
  const text = document.body.textContent.replace(/\s+/g, ' ');
  return {
    modeButtons: [...document.querySelectorAll('button')]
      .filter((node) => /大图浏览模式|四宫格时间线模式/.test(node.getAttribute('aria-label') || node.title || ''))
      .map((node) => node.getAttribute('aria-label') || node.title),
    capsule: document.querySelectorAll('.omx-mv-capsule').length,
    timeline: document.querySelectorAll('.omx-mv-timeline').length,
    singleStage: Boolean(document.querySelector('.omx-mv-single-stage')),
    singleStageVisible: Boolean(document.querySelector('.omx-mv-single-stage')?.getBoundingClientRect().width),
    toolbarButtons: [...document.querySelectorAll('.omx-mv-toolbar button')]
      .map((node) => node.getAttribute('aria-label') || node.textContent.trim() || node.title)
      .filter(Boolean),
    hasComposer: Boolean(document.querySelector('.omx-mv-composer-root')),
    historyToggle: Boolean(document.querySelector('.omx-mv-history-toggle')),
    text: text.slice(0, 160),
  };
});

await page.goto('file:///tmp/flow-alignment-3533/harness.html?w=1280', { waitUntil: 'load' });
await page.waitForSelector('.omx-mv-single-stage', { timeout: 10000 });
await page.waitForTimeout(600);
const before = await snapshot();
await page.screenshot({ path: `${evidenceDir}wide-single.png` });

// Zoom remains functional without the mode switch.
const zoomBefore = await page.evaluate(() => document.querySelector('.omx-mv-toolbar button[title*="调整缩放比例"]')?.textContent.trim());
await page.click('css=.omx-mv-toolbar button[title*="调整缩放比例"]');
await page.waitForTimeout(400);
const zoomAfter = await page.evaluate(() => document.querySelector('.omx-mv-toolbar button[title*="调整缩放比例"]')?.textContent.trim());
await page.screenshot({ path: `${evidenceDir}wide-single-zoomed.png` });

const assertions = [
  { name: 'no mode switch buttons', pass: before.modeButtons.length === 0, detail: before.modeButtons },
  { name: 'no capsule / timeline DOM', pass: before.capsule === 0 && before.timeline === 0, detail: { capsule: before.capsule, timeline: before.timeline } },
  { name: 'single stage is the default and visible', pass: before.singleStage && before.singleStageVisible, detail: before.singleStageVisible },
  { name: 'single-mode toolbar controls remain', pass: ['打开', '下载原图', '切换两栏/三栏', '添加评论'].every((label) => before.toolbarButtons.some((item) => item.includes(label))), detail: before.toolbarButtons },
  { name: 'composer and history remain', pass: before.hasComposer && before.historyToggle === true, detail: { composer: before.hasComposer, historyToggle: before.historyToggle } },
  { name: 'zoom interaction still works', pass: Boolean(zoomBefore) && Boolean(zoomAfter) && zoomBefore !== zoomAfter, detail: { zoomBefore, zoomAfter } },
];

const report = {
  pass: assertions.every((item) => item.pass),
  issue: 3571,
  capturedAt: new Date().toISOString(),
  browser: 'ego-lite',
  assertions,
  before,
  zoomBefore,
  zoomAfter,
  screenshots: ['wide-single.png', 'wide-single-zoomed.png'],
  sources: {
    tab: await sha256(`${repo}/plugins/omnimux-viewer/src/media-viewer/MediaViewerTab.jsx`),
    styles: await sha256(`${repo}/plugins/omnimux/src/client/media-viewer/styles.js`),
    store: await sha256(`${repo}/plugins/omnimux/src/client/media-viewer/media-viewer-store.js`),
    stage: await sha256(`${repo}/plugins/omnimux/src/client/media-viewer/image-canvas-stage.js`),
  },
  sourceCommit: JSON.parse(await fs.readFile('/tmp/flow-alignment-3533/target.json', 'utf8')).commit,
  sourceDirty: JSON.parse(await fs.readFile('/tmp/flow-alignment-3533/target.json', 'utf8')).dirty,
};
await fs.writeFile(`${evidenceDir}report.json`, JSON.stringify(report, null, 2));
await task.finish({ keep: [] });
console.log(JSON.stringify({ pass: report.pass, assertions }, null, 2));
