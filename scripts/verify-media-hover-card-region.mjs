#!/usr/bin/env node
/**
 * scripts/verify-media-hover-card-region.mjs
 *
 * Real-Chromium verification for the media hover capsule's card-region rule
 * (Issue #2058): while the pointer stays inside a media card the capsule must
 * stay visible; leaving the card is the only pointer-driven hide signal.
 *
 * Two things make this the harness the previous ones were not:
 *
 * 1. the page is served under a whitelisted social host (`www.weibo.cn`, an
 *    HTTP host outside Chrome's HSTS preload list, mapped onto 127.0.0.1), so
 *    the production classifier admits the media instead of rejecting the whole
 *    synthetic document at its hard gate;
 * 2. the pointer is driven with real CDP input events and no candidate is ever
 *    injected by hand, so the *detector* is what resolves the media on every
 *    move — which is exactly the layer the flicker came from.
 *
 * The page carries two card shapes, because "the card" is wider than the
 * `<video>` box in both of them: card A keeps a padding frame and an overlay
 * control row, card B parks the control row below the picture inside the card.
 *
 * Usage: node scripts/verify-media-hover-card-region.mjs [--phase=before|after]
 *
 * @module
 */

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(__filename), '..')
const EVIDENCE_DIR = join(ROOT, 'docs/evidence/media-hover-card-region')
const CONTENT_JS = join(ROOT, 'plugins/omnimux-browser/extension/dist/content.js')
const HOST = 'www.weibo.cn'

const phaseArg = process.argv.find((arg) => arg.startsWith('--phase='))
const PHASE = phaseArg === undefined ? 'after' : phaseArg.slice('--phase='.length)
assert.ok(PHASE === 'before' || PHASE === 'after', `unknown --phase=${PHASE}`)

mkdirSync(EVIDENCE_DIR, { recursive: true })

/** Chrome or Chromium, whichever this machine has. */
function findChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/opt/homebrew/bin/chromium',
  ].filter((value) => typeof value === 'string' && value !== '')
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('Chrome / Chromium executable not found')
}

/** A tiny real mp4, so `<video>` plays a genuine stream rather than a poster. */
function renderClip(dir) {
  const target = join(dir, 'clip.mp4')
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=688x386:rate=15',
    '-t', '3', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    target,
  ])
  if (result.status !== 0 || !existsSync(target)) {
    throw new Error(`ffmpeg failed to render the clip: ${result.stderr?.toString() ?? ''}`)
  }
  return target
}

const CARD_STYLE = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0b0d12; color: #e8eaf0; font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; padding: 24px; }
    .feed { display: flex; flex-direction: column; gap: 28px; align-items: flex-start; }
    .stage { position: relative; width: 720px; padding: 16px; background: #14161d; border-radius: 14px; }
    .stage video { display: block; width: 688px; height: 386px; background: #000; border-radius: 6px; }
    .bar { position: absolute; left: 16px; right: 16px; bottom: 16px; height: 48px; display: flex; align-items: center; gap: 12px; padding: 0 14px; background: linear-gradient(to top, rgba(0,0,0,0.86), rgba(0,0,0,0.32)); border-radius: 0 0 6px 6px; }
    .bar button { width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.24); background: rgba(255,255,255,0.12); color: #fff; font-size: 11px; cursor: pointer; }
    .scrub { flex: 1; height: 8px; border-radius: 4px; background: rgba(255,255,255,0.26); }
    .scrub i { display: block; width: 34%; height: 100%; border-radius: 4px; background: #818cf8; }
    .stage2 { position: relative; width: 720px; padding: 16px; background: #14161d; border-radius: 14px; }
    .stage2 video { display: block; width: 688px; height: 386px; background: #000; border-radius: 6px 6px 0 0; }
    .bar2 { display: flex; align-items: center; gap: 12px; height: 48px; padding: 0 14px; background: #1b1e27; border-radius: 0 0 6px 6px; }
    .bar2 button { width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.24); background: rgba(255,255,255,0.12); color: #fff; font-size: 11px; cursor: pointer; }
    .meta { padding: 12px 4px 0; color: #8b90a0; font-size: 13px; }
`

const PAGE_HTML = (contentJs) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Media hover card-region verification</title>
  <style>${CARD_STYLE}</style>
</head>
<body>
  <main id="feed" role="main" class="feed">
    <article class="card-wrap post" id="postA">
      <div class="stage" id="stage">
        <video id="clip" src="/media/clip.mp4" autoplay muted loop playsinline></video>
        <div class="bar" id="bar">
          <button id="play" type="button">Play</button>
          <div class="scrub" id="scrub" role="slider" tabindex="0" aria-label="progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="34"><i></i></div>
          <button id="mute" type="button">Mute</button>
          <button id="gear" type="button">Gear</button>
        </div>
      </div>
      <div class="meta">card A: overlay control row inside the card</div>
    </article>
    <article class="card-wrap post" id="postB">
      <div class="stage2" id="stage2">
        <video id="clip2" src="/media/clip.mp4?v=2" autoplay muted loop playsinline></video>
        <div class="bar2" id="bar2">
          <button id="play2" type="button">Play</button>
          <div class="scrub2" id="scrub2" role="slider" tabindex="0" aria-label="progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="34"><i></i></div>
          <button id="mute2" type="button">Mute</button>
        </div>
      </div>
      <div class="meta">card B: control row below the picture, inside the card</div>
    </article>
  </main>
  <script>
    window.chrome = {
      runtime: {
        getURL: (path) => 'chrome-extension://mock/' + path,
        onMessage: { addListener: () => {}, removeListener: () => {} },
        sendMessage: async () => ({}),
      },
      storage: {
        local: {
          get: async (key) => ({ [key]: true, omnimux_media_hover_enabled: true }),
          set: async () => {},
        },
        onChanged: { addListener: () => {}, removeListener: () => {} },
      },
    };
  </script>
  <script>${contentJs}</script>
</body>
</html>`

const READ_CAPSULE = `(() => {
  const host = document.getElementById('omnimux-media-hover-root');
  const capsule = host && host.shadowRoot ? host.shadowRoot.querySelector('.omnimux-capsule-bar') : null;
  const style = capsule ? getComputedStyle(capsule) : null;
  const overlay = globalThis.__dshBrowserMediaOverlay;
  return {
    mounted: capsule !== null,
    visible: capsule ? capsule.classList.contains('is-visible') : false,
    opacity: style ? style.opacity : null,
    expanded: capsule ? capsule.classList.contains('is-expanded') : false,
    phase: overlay ? overlay.state.phase : null,
    hasPayload: overlay ? overlay.payload !== null : null,
  };
})()`

const READ_GEOMETRY = `(() => {
  const box = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left), top: Math.round(rect.top),
      right: Math.round(rect.right), bottom: Math.round(rect.bottom),
      width: Math.round(rect.width), height: Math.round(rect.height),
      x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2),
      role: element.getAttribute('role'), tag: element.localName,
    };
  };
  return {
    host: document.getElementById('omnimux-media-hover-root') !== null,
    clipSrc: document.querySelector('#clip') ? document.querySelector('#clip').currentSrc : '',
    playing: document.querySelector('#clip') ? !document.querySelector('#clip').paused : false,
    cardA: box('#stage'), videoA: box('#clip'), barA: box('#bar'), playA: box('#play'), scrubA: box('#scrub'), gearA: box('#gear'),
    cardB: box('#stage2'), videoB: box('#clip2'), barB: box('#bar2'), playB: box('#play2'),
  };
})()`

async function main() {
  console.log(`▶ card-region verification (phase=${PHASE})`)
  assert.ok(existsSync(CONTENT_JS), 'extension/dist/content.js missing — build the extension first')
  const contentJs = readFileSync(CONTENT_JS, 'utf8')
  const buildId = createHash('sha256').update(contentJs).digest('hex')

  const scratch = mkdtempSync(join(tmpdir(), 'card-region-'))
  const clipPath = renderClip(scratch)
  const clip = readFileSync(clipPath)

  const page = PAGE_HTML(contentJs)
  const server = http.createServer((req, res) => {
    if ((req.url ?? '').startsWith('/media/clip.mp4')) {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': clip.length })
      res.end(clip)
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(page)
  })
  await new Promise((res) => server.listen(0, '127.0.0.1', res))
  const port = server.address().port
  const url = `http://${HOST}:${port}/`
  console.log(`📡 serving ${url} (127.0.0.1:${port})`)

  const chromeBin = findChromePath()
  const chrome = spawn(chromeBin, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    // The machine proxies through a local filter, which would resolve the mapped
    // host itself and ignore the resolver rule below.
    '--no-proxy-server',
    '--autoplay-policy=no-user-gesture-required',
    `--host-resolver-rules=MAP ${HOST} 127.0.0.1:${port}`,
    '--window-size=1280,1100',
    'about:blank',
  ])

  const cleanup = () => {
    try { chrome.kill('SIGKILL') } catch { /* already gone */ }
    try { server.close() } catch { /* already closed */ }
    try { rmSync(scratch, { recursive: true, force: true }) } catch { /* best effort */ }
  }

  let ws = null
  try {
    const cdpPort = await new Promise((resolvePort, rejectPort) => {
      const timeout = setTimeout(() => rejectPort(new Error('Chrome startup timed out')), 15000)
      chrome.stderr.on('data', (chunk) => {
        const match = chunk.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)
        if (match) { clearTimeout(timeout); resolvePort(Number(match[1])) }
      })
      chrome.on('error', (error) => { clearTimeout(timeout); rejectPort(error) })
    })

    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()
    const pageTarget = targets.find((target) => target.type === 'page')
    ws = new WebSocket(pageTarget.webSocketDebuggerUrl)
    let messageId = 0
    const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
      const id = ++messageId
      const onMessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        ws.removeEventListener('message', onMessage)
        if (message.error) rejectSend(new Error(`CDP ${method} failed: ${JSON.stringify(message.error)}`))
        else resolveSend(message.result ?? message)
      }
      ws.addEventListener('message', onMessage)
      ws.send(JSON.stringify({ id, method, params }))
    })
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    await send('Page.enable')
    await send('Runtime.enable')

    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) {
        throw new Error(`page evaluation failed: ${JSON.stringify(result.exceptionDetails.text)}`)
      }
      return result.result.value
    }
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
    const moveTo = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none', clickCount: 0 })
    }
    const shot = async (name) => {
      const image = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(EVIDENCE_DIR, `${PHASE}-${name}.png`), Buffer.from(image.data, 'base64'))
    }

    await send('Page.navigate', { url })
    await sleep(1200)

    const geometry = await evaluate(READ_GEOMETRY)
    console.log('▶ page identity', await evaluate(`location.href + ' | ' + document.title + ' | ' + document.body.innerText.slice(0, 200)`))
    console.log('▶ page geometry', JSON.stringify({
      host: geometry.host,
      playing: geometry.playing,
      cardA: geometry.cardA,
      videoA: geometry.videoA,
      cardB: geometry.cardB,
      videoB: geometry.videoB,
    }))
    assert.ok(geometry.host, 'the hover overlay host never mounted — content.js did not run')
    assert.ok(geometry.clipSrc !== '', 'the video never resolved a source')

    const timeline = []
    const sample = async (label, x, y, inCard) => {
      const state = await evaluate(READ_CAPSULE)
      timeline.push({ label, x: Math.round(x), y: Math.round(y), inCard, ...state })
      console.log(`   ${String(timeline.length).padStart(2)}. ${label.padEnd(30)} in=${String(inCard).padEnd(5)} visible=${String(state.visible).padEnd(5)} opacity=${state.opacity}`)
      return state
    }

    const cardA = geometry.cardA
    const videoA = geometry.videoA
    const inCard = (x, y) => x >= cardA.left && x <= cardA.right && y >= cardA.top && y <= cardA.bottom

    // ---- Card A: pointer sweeps the picture, the padding frame and the controls.
    const sweepA = [
      ['A1 video body', videoA.x, videoA.y],
      ['A2 video top-right', videoA.right - 40, videoA.top + 40],
      ['A3 card right padding', cardA.right - 8, videoA.y],
      ['A4 card bottom padding', cardA.x, cardA.bottom - 8],
      ['A5 progress slider', geometry.scrubA.x, geometry.scrubA.y],
      ['A6 play button', geometry.playA.x, geometry.playA.y],
      ['A7 gear button', geometry.gearA.x, geometry.gearA.y],
      ['A8 card left padding', cardA.left + 8, videoA.y],
      ['A9 video body again', videoA.x, videoA.y],
    ]

    // The first move only arms the enter debounce; the capsule appears on the move after it.
    await moveTo(videoA.x, videoA.y)
    await sleep(450)
    await sample('A1 video body', videoA.x, videoA.y, true)
    await shot('01-card-a-capsule-on-video')

    for (const [label, x, y] of sweepA.slice(1)) {
      await moveTo(x, y)
      await sleep(320)
      await sample(label, x, y, inCard(x, y))
    }
    await shot('02-card-a-after-sweep')

    // ---- AC-3: a resting pointer is not a reason to disappear.
    await moveTo(videoA.x, videoA.y)
    await sleep(500)
    await sample('A10 rest 0.5s', videoA.x, videoA.y, true)
    await sleep(4200)
    await sample('A11 rest 4.7s (idle window passed)', videoA.x, videoA.y, true)

    // ---- AC-2: leaving the card hides, re-entering brings it back.
    const outsideX = cardA.right + 120
    const outsideY = videoA.y
    await moveTo(outsideX, outsideY)
    await sleep(420)
    await sample('A12 pointer outside the card', outsideX, outsideY, false)
    await shot('03-card-a-pointer-outside')
    await moveTo(videoA.x, videoA.y)
    await sleep(520)
    await sample('A13 pointer back on the video', videoA.x, videoA.y, true)

    // ---- Card B: a control row parked below the picture, inside the card.
    const cardB = geometry.cardB
    const videoB = geometry.videoB
    const inCardB = (x, y) => x >= cardB.left && x <= cardB.right && y >= cardB.top && y <= cardB.bottom
    await moveTo(videoB.x, videoB.y)
    await sleep(450)
    await sample('B1 video body', videoB.x, videoB.y, inCardB(videoB.x, videoB.y))
    await moveTo(geometry.barB.x, geometry.barB.y)
    await sleep(320)
    await sample('B2 control row below the picture', geometry.barB.x, geometry.barB.y, inCardB(geometry.barB.x, geometry.barB.y))
    await moveTo(geometry.playB.x, geometry.playB.y)
    await sleep(320)
    await sample('B3 play button below the picture', geometry.playB.x, geometry.playB.y, inCardB(geometry.playB.x, geometry.playB.y))
    await moveTo(cardB.right - 8, videoB.y)
    await sleep(320)
    await sample('B4 card right padding', cardB.right - 8, videoB.y, inCardB(cardB.right - 8, videoB.y))
    await shot('04-card-b-controls-below')

    // ---- AC-5: teardown still hides immediately.
    await moveTo(videoB.x, videoB.y)
    await sleep(400)
    await evaluate(`window.dispatchEvent(new Event('blur'))`)
    await sleep(250)
    await sample('B5 window blur (teardown path)', videoB.x, videoB.y, false)

    const inCardSamples = timeline.filter((entry) => entry.inCard)
    const hiddenWhileInCard = inCardSamples.filter((entry) => !entry.visible)
    const exitSample = timeline.find((entry) => entry.label.startsWith('A12'))
    const reentrySample = timeline.find((entry) => entry.label.startsWith('A13'))
    const idleSample = timeline.find((entry) => entry.label.startsWith('A11'))
    const blurSample = timeline.find((entry) => entry.label.startsWith('B5'))

    const report = {
      test: 'media-hover-card-region',
      phase: PHASE,
      url,
      build: { contentJs: CONTENT_JS, sha256: buildId },
      geometry,
      timeline,
      metrics: {
        samples: timeline.length,
        inCardSamples: inCardSamples.length,
        hiddenWhileInCard: hiddenWhileInCard.length,
        hiddenWhileInCardLabels: hiddenWhileInCard.map((entry) => entry.label),
      },
      assertions: {
        hiddenWhileInCardZero: hiddenWhileInCard.length === 0,
        idleStillVisible: idleSample?.visible === true,
        exitHidden: exitSample?.visible === false,
        reentryVisible: reentrySample?.visible === true,
        blurHidden: blurSample?.visible === false,
      },
    }
    writeFileSync(join(EVIDENCE_DIR, `${PHASE}-timeline.json`), `${JSON.stringify(timeline, null, 2)}\n`)
    writeFileSync(join(EVIDENCE_DIR, `${PHASE}-report.json`), `${JSON.stringify(report, null, 2)}\n`)

    if (PHASE === 'before') {
      console.log(`\n📊 before: ${hiddenWhileInCard.length}/${inCardSamples.length} in-card samples were hidden`)
      console.log(`   hidden while inside the card: ${hiddenWhileInCard.map((entry) => entry.label).join(', ') || '(none)'}`)
      if (hiddenWhileInCard.length === 0) {
        console.log('⚠️  the flicker did NOT reproduce in this harness — no before/after contrast is available')
      }
      return
    }

    assert.equal(hiddenWhileInCard.length, 0, `capsule hid ${hiddenWhileInCard.length}x while the pointer stayed inside the card: ${hiddenWhileInCard.map((e) => e.label).join(', ')}`)
    assert.equal(idleSample?.visible, true, 'AC-3: a resting pointer inside the card must not hide the capsule')
    assert.equal(exitSample?.visible, false, 'AC-2: leaving the card must hide the capsule')
    assert.equal(reentrySample?.visible, true, 'AC-2: re-entering the card must bring the capsule back')
    assert.equal(blurSample?.visible, false, 'AC-5: window blur must still hide the capsule')
    console.log('\n✅ card-region verification passed')
  } finally {
    cleanup()
    ws?.close?.()
  }
}

process.on('exit', () => { /* cleanup runs in the finally block above */ })

main().catch((error) => {
  console.error(`❌ verification failed: ${error.message}`)
  process.exit(1)
})
