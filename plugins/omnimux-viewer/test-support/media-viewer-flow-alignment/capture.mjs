/**
 * Capture browser evidence for Issue #3533 (run via `ego-browser nodejs`).
 *
 * The harness renders the real MediaViewerTab, real store, real composer and
 * the new HistoryPanel. Assertions cover what jsdom cannot: computed rail
 * width, container-query drawer behaviour, and visibility.
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const target = JSON.parse(await fs.readFile('/tmp/flow-alignment-3533/target.json', 'utf8'));
const task = await taskSpace('flow alignment 3533 evidence');
const page = task.page('p1');

const sha256 = async (path) => {
  const bytes = await fs.readFile(path);
  return crypto.createHash('sha256').update(bytes).digest('hex');
};

const snapshot = () => page.evaluate(() => {
  const rail = document.querySelector('.omx-mv-history');
  const toggle = document.querySelector('.omx-mv-history-toggle');
  const scrim = document.querySelector('.omx-mv-history-scrim');
  const active = document.querySelector('.omx-mv-history__card[aria-current="true"]');
  const stageImage = document.querySelector('.omx-mv-display img');
  const cost = document.querySelector('.omx-mv-cost');
  const shortcut = document.querySelector('textarea');
  const box = (node) => (node ? node.getBoundingClientRect().toJSON() : null);
  const style = (node, key) => (node ? getComputedStyle(node)[key] : null);
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    frameWidth: Math.round(document.querySelector('.omx-media-viewer')?.getBoundingClientRect().width || 0),
    hasHistoryOpen: document.querySelector('.omx-media-viewer')?.getAttribute('data-history-open'),
    rail: box(rail),
    railVisibility: style(rail, 'visibility'),
    railPosition: style(rail, 'position'),
    railZIndex: style(rail, 'zIndex'),
    toggleDisplay: style(toggle, 'display'),
    toggleVisible: Boolean(toggle && toggle.getBoundingClientRect().width > 0),
    scrimDisplay: style(scrim, 'display'),
    scrimOpacity: style(scrim, 'opacity'),
    cards: document.querySelectorAll('.omx-mv-history__card').length,
    batches: [...document.querySelectorAll('.omx-mv-history__count')].map((node) => node.textContent),
    activeText: active ? active.textContent.replace(/\s+/g, ' ').trim() : '',
    stageSrc: stageImage ? stageImage.getAttribute('src') : '',
    costText: cost ? cost.textContent.trim() : '',
    promptValue: shortcut ? shortcut.value : '',
  };
});

async function open(width) {
  await page.goto(`file://${target.harness}?w=${width}`, { waitUntil: 'load' });
  await page.waitForSelector('.omx-mv-history', { timeout: 10000 });
  await page.waitForTimeout(700);
}

const assertions = [];
const check = (name, pass, detail) => assertions.push({ name, pass: Boolean(pass), detail });

await open(1280);
await page.click('#paramSummaryTriggerBtn');
await page.click('css=.omx-params-panel .omx-mode-pill >> nth=2');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
const wide = await snapshot();
check('wide: rail visible beside stage', wide.railVisibility !== 'hidden' && wide.rail && wide.rail.width >= 255 && wide.rail.width <= 265, wide.rail);
check('wide: history toggle is hidden', wide.toggleDisplay === 'none', wide.toggleDisplay);
check('wide: five generation groups', wide.cards === 5, wide.cards);
check('wide: batch result renders ×2 badge', wide.batches.includes('×2'), wide.batches);
check('wide: newest completed item is current', /产品图/.test(wide.activeText), wide.activeText);
check('wide: image-mode cost estimate visible', /预估消耗/.test(wide.costText) && /0\.26/.test(wide.costText), wide.costText);
await page.screenshot({ path: `${target.evidence}/wide-1280.png` });

const stageBefore = wide.stageSrc;
await page.click('.omx-mv-history__list li:nth-child(3) .omx-mv-history__card');
await page.waitForTimeout(300);
const afterSwitch = await snapshot();
check('wide: history click switches stage media', afterSwitch.stageSrc !== stageBefore, { stageBefore, stageAfter: afterSwitch.stageSrc });
await page.click('css=.omx-mv-history__list li:nth-child(3) .omx-mv-history__actions .omx-mv-history__action >> nth=0');
await page.waitForTimeout(400);
const afterReuse = await snapshot();
check('wide: reuse prompt fills composer', /沙漠里的柴犬/.test(afterReuse.promptValue), afterReuse.promptValue);

await open(640);
const narrowClosed = await snapshot();
check('narrow: rail is hidden off-canvas', narrowClosed.railVisibility === 'hidden', { visibility: narrowClosed.railVisibility, position: narrowClosed.railPosition });
check('narrow: history toggle visible', narrowClosed.toggleDisplay !== 'none' && narrowClosed.toggleVisible, { display: narrowClosed.toggleDisplay, visible: narrowClosed.toggleVisible });
await page.screenshot({ path: `${target.evidence}/narrow-640-closed.png` });

await page.click('.omx-mv-history-toggle');
await page.waitForTimeout(350);
const narrowOpen = await snapshot();
check('narrow: toggle opens the drawer', narrowOpen.hasHistoryOpen === 'true' && narrowOpen.railVisibility === 'visible', { open: narrowOpen.hasHistoryOpen, visibility: narrowOpen.railVisibility });
check('narrow: drawer width stays inside the frame', narrowOpen.rail && narrowOpen.rail.width >= 300 && narrowOpen.rail.width < narrowOpen.frameWidth, narrowOpen.rail);
check('narrow: scrim is interactive when open', narrowOpen.scrimOpacity === '1', narrowOpen.scrimOpacity);
await page.screenshot({ path: `${target.evidence}/narrow-640-open.png` });

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const narrowEscaped = await snapshot();
check('narrow: Escape closes the drawer', narrowEscaped.hasHistoryOpen === 'false' && narrowEscaped.railVisibility === 'hidden', { open: narrowEscaped.hasHistoryOpen, visibility: narrowEscaped.railVisibility });

const sources = {};
for (const [key, path] of Object.entries(target.sources)) sources[key] = await sha256(path);

const report = {
  pass: assertions.every((item) => item.pass),
  issue: 3533,
  capturedAt: new Date().toISOString(),
  sourceCommit: target.commit,
  sourceDirty: target.dirty,
  browser: 'ego-lite',
  harness: target.harness,
  sources,
  assertions,
  wide,
  narrowClosed,
  narrowOpen,
  interactions: { stageBefore, stageAfterSwitch: afterSwitch.stageSrc, reusedPrompt: afterReuse.promptValue },
  screenshots: ['wide-1280.png', 'narrow-640-closed.png', 'narrow-640-open.png'],
};
await fs.writeFile(`${target.evidence}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, assertions: assertions.map((item) => `${item.pass ? 'PASS' : 'FAIL'} ${item.name}`) }, null, 2));
