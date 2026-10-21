/**
 * Evidence for Issue #3590: the second TikTok shortcut reads 下载音频 / Download audio.
 * Real browser (Chrome for Testing) + built extension on a real tiktok.com origin.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
    '<div data-e2e="browse-video" style="position:absolute;left:0;top:0;width:1200px;height:900px;background:#111"></div>',
    '<div class="DivCommentListContainer" style="position:absolute;left:1200px;top:0;width:200px;height:900px;background:#1a1a1a"></div>',
    '<button id="arrow-left" style="position:absolute;left:1150px;top:400px;width:40px;height:40px"></button>',
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
  const root = document.getElementById('omnimux-tiktok-scene-root').shadowRoot;
  return [...root.querySelectorAll('.omx-item')].map((row) => ({
    action: row.getAttribute('data-action'),
    label: row.querySelector('.omx-item-label').textContent,
    busyLabel: null,
  }));
})()`

const report = { issue: 3590, startedAt: new Date().toISOString(), scenarios: [] }
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('https://www.tiktok.com/')
    await sleep(2500)
    const href = await page.evaluate('location.href')
    if (String(href).startsWith('https://www.tiktok.com')) break
    console.log('retry navigation, href =', href)
  }
  console.log('page', await page.evaluate('location.href'))

  for (const locale of ['zh', 'en']) {
    await page.evaluate(`(() => { localStorage.setItem('omnimux_manual_locale', '${locale}'); return true })()`)
    await page.goto('https://www.tiktok.com/')
    await sleep(3000)
    await page.evaluate(FIXTURE)
    await sleep(1200)
    await page.evaluate(OPEN)
    await sleep(400)
    const rows = await page.evaluate(READ)
    const shot = await page.screenshot(join(OUT, `menu-${locale}.png`))
    report.scenarios.push({ locale, rows, screenshot: shot })
  }
  report.zhOk = report.scenarios[0].rows.map((r) => r.label).join('/') === '下载视频/下载音频/收藏到灵感库'
  report.enOk = report.scenarios[1].rows.map((r) => r.label).join('/') === 'Download video/Download audio/Save to library'
  report.audioActionKept = report.scenarios.every((s) => s.rows.some((r) => r.action === 'audio'))
  report.finishedAt = new Date().toISOString()
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ zhOk: report.zhOk, enOk: report.enOk, audioActionKept: report.audioActionKept, scenarios: report.scenarios.map((s) => ({ locale: s.locale, rows: s.rows })) }, null, 2))
} finally {
  await browser.close()
}
