import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const target = JSON.parse(await fs.readFile('/tmp/picker-mime-3548/target.json', 'utf8'));
const task = await taskSpace('picker mime 3548 evidence');
const page = task.page('p1');
const sha256 = async (path) => crypto.createHash('sha256').update(await fs.readFile(path)).digest('hex');

const snapshot = () => page.evaluate(() => {
  const notice = document.querySelector('.omx-slot-notice');
  const picker = document.querySelector('.omx-ref-picker-popover');
  const cards = [...document.querySelectorAll('.omx-slot-card')];
  const slotImages = [...document.querySelectorAll('.omx-slot-card img')].map((img) => img.getAttribute('src'));
  return {
    notice: notice ? notice.textContent.trim() : '',
    pickerOpen: Boolean(picker),
    slotCards: cards.length,
    slotImages,
    bodyText: document.body.textContent.replace(/\s+/g, ' ').slice(0, 240),
  };
});

await page.goto(`file://${target.harness}`, { waitUntil: 'load' });
await page.waitForSelector('.omx-slot-btn', { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${target.evidence}/before-picker.png` });

await page.click('.omx-slot-btn');
await page.waitForSelector('.omx-ref-picker-popover', { timeout: 5000 });
await page.waitForSelector('[aria-label="本地角色"]', { timeout: 8000 });
await page.screenshot({ path: `${target.evidence}/picker-open.png` });
await page.click('[aria-label="本地角色"]');
await page.waitForTimeout(800);
const after = await snapshot();
await page.screenshot({ path: `${target.evidence}/after-select.png` });

const assertions = [
  { name: 'local asset maps to MIME and enters the slot', pass: !/格式不明/.test(after.notice) && after.slotCards >= 1, detail: after },
  { name: 'no format-unknown notice after selection', pass: !/格式不明/.test(after.notice) && !/格式不明/.test(after.bodyText), detail: after.notice },
  { name: 'picker closes after acceptance', pass: after.pickerOpen === false, detail: after.pickerOpen },
];
const sources = {};
for (const [key, path] of Object.entries(target.sources)) sources[key] = await sha256(path);
const report = {
  pass: assertions.every((item) => item.pass),
  issue: 3548,
  capturedAt: new Date().toISOString(),
  sourceCommit: target.commit,
  sourceDirty: target.dirty,
  browser: 'ego-lite',
  assertions,
  after,
  sources,
  screenshots: ['before-picker.png', 'picker-open.png', 'after-select.png'],
};
await fs.writeFile(`${target.evidence}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, assertions }, null, 2));
