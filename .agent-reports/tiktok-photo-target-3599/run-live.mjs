/**
 * Evidence for Issue #3599: a photo/carousel feed card now resolves to a post.
 *
 * Real browser (Chrome for Testing) + built extension on a real tiktok.com origin.
 * The card is a fixture shaped like the measured photo card: no <video>, several
 * images, and the `data-more-menu-item-id` control that carries the post id.
 */
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const { launchExtensionBrowser } = await import(pathToFileURL(join(REPO, 'scripts/lib/extension-e2e.mjs')).href)
const OUT = HERE
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

const POST_ID = '7693330722479688973'

const FIXTURE = `(() => {
  window.stop();
  document.body.replaceChildren();
  const images = Array.from({ length: 7 }, (_, i) =>
    '<div style="width:120px;height:120px;background:hsl(' + (i * 40) + ',40%,40%)"></div>').join('');
  document.body.insertAdjacentHTML('beforeend', [
    '<div data-e2e="recommend-list-item-container" style="position:absolute;left:0;top:0;width:1200px;height:900px;background:#111;display:flex;align-items:center;justify-content:center;gap:6px">',
    images,
    '<button data-more-menu-item-id="${POST_ID}" style="position:absolute;left:1140px;top:40px;width:32px;height:32px">...</button>',
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
  const detail = root.querySelector('.omx-item-detail');
  return {
    sceneGone: false,
    rows: [...root.querySelectorAll('.omx-item')].map((row) => ({
      action: row.getAttribute('data-action'),
      text: row.textContent.replace(/\\s+/g, ' ').trim(),
      busy: row.classList.contains('is-busy'),
      error: row.classList.contains('is-error'),
    })),
    detail: (detail?.textContent ?? '').trim(),
  };
})()`

const report = { issue: 3599, startedAt: new Date().toISOString() }
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
  const beforeShot = await page.screenshot(join(OUT, '01-photo-card-menu.png'))

  await page.evaluate(`(() => {
    const scene = document.getElementById('omnimux-tiktok-scene-root');
    scene.shadowRoot.querySelector('.omx-item[data-action="audio"]').click();
    return true;
  })()`)
  await sleep(1500)
  report.afterClick = await page.evaluate(READ)
  const afterShot = await page.screenshot(join(OUT, '02-photo-card-after-click.png'))
  await sleep(8000)
  report.settled = await page.evaluate(READ)
  const settledShot = await page.screenshot(join(OUT, '03-photo-card-settled.png'))
  report.downloadedFiles = readdirSync(join(homedir(), 'Downloads')).filter((name) => !downloadsBefore.has(name))
  const noTargetTextsForSettled = ['这一页没有可操作的作品', 'No post to act on here']
  report.settledIsNotNoTarget = !noTargetTextsForSettled.some((text) => report.settled.detail.includes(text))
  // The click must have reached the host: a real audio file, a busy row, or a
  // host-side error are all evidence of resolution; the noTarget line is not.
  report.busyObserved = report.afterClick.rows.some((row) => row.busy)
  report.resolutionProven = report.downloadedFiles.length > 0 || (report.busyObserved && report.settledIsNotNoTarget)

  const noTargetTexts = ['这一页没有可操作的作品', 'No post to act on here']
  const detailAfter = report.afterClick.detail
  report.noTargetStillShown = noTargetTexts.some((text) => detailAfter.includes(text))
  report.reachedHostOrBusy =
    report.afterClick.rows.some((row) => row.busy || row.error) || detailAfter.length > 0
  report.screenshots = [beforeShot, afterShot, settledShot]
  // The run owns whatever it downloaded: remove it after recording the name.
  for (const name of report.downloadedFiles) {
    try { unlinkSync(join(homedir(), 'Downloads', name)) } catch {}
  }
  report.downloadsCleaned = true
  report.finishedAt = new Date().toISOString()
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ before: report.before, afterClick: report.afterClick, noTargetStillShown: report.noTargetStillShown }, null, 2))
} finally {
  await browser.close()
}
