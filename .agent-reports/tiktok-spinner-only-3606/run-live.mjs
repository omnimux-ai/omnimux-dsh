/**
 * Evidence for Issue #3606: a running menu row shows only the spinner, no status text.
 * Real browser (Chrome for Testing) + built extension on a real tiktok.com origin.
 */
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const { launchExtensionBrowser } = await import(pathToFileURL(join(REPO, 'scripts/lib/extension-e2e.mjs')).href)
const OUT = HERE
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

const FIXTURE = `(() => {
  window.stop();
  document.body.replaceChildren();
  document.body.insertAdjacentHTML('beforeend', [
    '<div data-e2e="recommend-list-item-container" style="position:absolute;left:0;top:0;width:1200px;height:900px;background:#111;display:flex;align-items:center;justify-content:center">',
    '<video style="width:600px;height:800px;background:#222"></video>',
    '<button data-more-menu-item-id="7693330722479688973" style="position:absolute;left:1140px;top:40px;width:32px;height:32px">...</button>',
    '</div>',
  ].join(''));
  window.dispatchEvent(new Event('resize'));
  return true;
})()`

const OPEN = `(async () => {
  const scene = document.getElementById('omnimux-tiktok-scene-root');
  scene.shadowRoot.querySelector('.omx-anchor').dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, pointerType: 'mouse' }));
  await new Promise((r) => setTimeout(r, 500));
  return true;
})()`

const READ = `(() => {
  const host = document.getElementById('omnimux-tiktok-scene-root');
  const root = host && host.shadowRoot;
  if (!root) return { sceneGone: true, rows: [], detail: '' };
  return {
    sceneGone: false,
    rows: [...root.querySelectorAll('.omx-item')].map((row) => ({
      action: row.getAttribute('data-action'),
      text: row.textContent.replace(/\\s+/g, ' ').trim(),
      busy: row.classList.contains('is-busy'),
      ariaBusy: row.getAttribute('aria-busy'),
      spinner: row.querySelector('.omx-spinner') !== null,
      stateNode: row.querySelector('.omx-item-state') !== null,
    })),
    detail: (root.querySelector('.omx-item-detail')?.textContent ?? '').trim(),
  };
})()`

const report = { issue: 3606, startedAt: new Date().toISOString() }
const browser = await launchExtensionBrowser({ extensionDir: join(REPO, 'plugins/omnimux-browser/extension/dist'), width: 1400, height: 900 })
try {
  report.chromePath = browser.chromePath
  for (let i = 0; i < 80; i += 1) {
    const worker = await browser.extensionServiceWorker()
    if (worker) { report.extensionId = worker.extensionId; break }
    await sleep(100)
  }
  if (!report.extensionId) throw new Error('extension service worker not loaded')
  const page = await browser.newPage('about:blank')
  await page.goto('https://www.tiktok.com/')
  await sleep(3000)
  const downloadsBefore = new Set(readdirSync(join(homedir(), 'Downloads')))
  await page.evaluate(FIXTURE)
  await sleep(1500)
  await page.evaluate(OPEN)
  await sleep(400)
  report.before = await page.evaluate(READ)
  const beforeShot = await page.screenshot(join(OUT, '01-menu-default.png'))

  await page.evaluate(`(() => {
    const scene = document.getElementById('omnimux-tiktok-scene-root');
    scene.shadowRoot.querySelector('.omx-item[data-action="audio"]').click();
    return true;
  })()`)
  await sleep(400)
  report.during = await page.evaluate(READ)
  const duringShot = await page.screenshot(join(OUT, '02-menu-running-spinner.png'))
  await sleep(9000)
  report.after = await page.evaluate(READ)
  const afterShot = await page.screenshot(join(OUT, '03-menu-settled.png'))

  report.downloadedFiles = readdirSync(join(homedir(), 'Downloads')).filter((name) => !downloadsBefore.has(name))
  const runningRow = report.during.rows.find((row) => row.action === 'audio') || {}
  report.runningHasSpinnerOnly =
    runningRow.busy === true &&
    runningRow.spinner === true &&
    runningRow.stateNode === false &&
    runningRow.text === '下载音频' &&
    runningRow.ariaBusy === 'true'
  report.noStateNodeAnywhere = report.during.rows.every((row) => row.stateNode === false)
  const cleanup = report.downloadedFiles.map((name) => {
    try { unlinkSync(join(homedir(), 'Downloads', name)); return { name, removed: true } } catch { return { name, removed: false } }
  })
  report.downloadCleanup = cleanup
  report.downloadsCleaned = cleanup.every((entry) => entry.removed)
  report.screenshots = [beforeShot, duringShot, afterShot]
  report.finishedAt = new Date().toISOString()
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ during: report.during, runningHasSpinnerOnly: report.runningHasSpinnerOnly, downloaded: report.downloadedFiles }, null, 2))
} finally {
  await browser.close()
}
