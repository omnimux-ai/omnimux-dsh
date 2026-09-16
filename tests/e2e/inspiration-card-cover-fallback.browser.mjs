#!/usr/bin/env node
/**
 * 真实浏览器验收：灵感卡片封面不可渲染时回退到视频首帧（Issue #2073）
 *
 * 证据设计（全部在真实 Chromium 内核中测量，不使用 jsdom 结论）：
 * 1. 负向对照：把生产行 `insp_34261aa2` 的真实封面文件（HEIC 字节、名为 .mp4、
 *    以 video/mp4 提供）交给 `<img>`，测量 naturalWidth —— 应为 0，即该封面在当前
 *    内核中根本无法解码；同一份字节再以 image/heic 提供，区分「后缀/MIME 错」与
 *    「编码不支持」。
 * 2. 正向验收：卡片挂载该行（坏封面 + 本地可播放视频），断言封面层回退成 `<video>`，
 *    且该元素完成真实解码（videoWidth/Height > 0）、具备正几何尺寸、进入 is-loaded。
 * 3. 回归对照：既无封面也无视频的行仍渲染占位块（既不空转也不误挂 video）。
 *
 * 运行：node tests/e2e/inspiration-card-cover-fallback.browser.mjs
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { PNG } from 'pngjs'

const here = dirname(fileURLToPath(import.meta.url))
/**
 * The repository root, resolved from wherever this file was placed: it is run
 * once from the scratch directory while the walkthrough is being established,
 * and lives under `tests/e2e/` once it is committed.
 */
const root = [resolve(here, '../..'), resolve(here, '..')].find((candidate) =>
  existsSync(join(candidate, 'plugins/omnimux-inspiration/src/client')))
if (!root) throw new Error(`无法从 ${here} 定位仓库根目录`)
const clientDir = join(root, 'plugins/omnimux-inspiration/src/client')
const scratch = join(root, 'tests/e2e/.browser-scratch-card-cover-fallback')
const evidenceDir = join(root, 'docs/evidence')
const EGO = process.env.EGO_BROWSER_BIN || 'ego-browser'

/** 生产行 insp_34261aa2 的真实封面：HEIC 字节、`.mp4` 名。 */
const REAL_COVER_SOURCE = '/Users/x/.omnimux/omnimux/inspirations/media/covers/cover_10b758f2.mp4'
/** 生产行 insp_34261aa2 的真实视频：卡片首帧回退用的是它。 */
const REAL_VIDEO_SOURCE = '/Users/x/.omnimux/omnimux/inspirations/media/videos/video_2831d0b6.mp4'

const SHOTS = {
  videoFrame: join(evidenceDir, 'inspiration-card-cover-preview-verified.png'),
  placeholder: join(evidenceDir, 'inspiration-card-cover-preview-placeholder-verified.png'),
}
const REPORT = join(evidenceDir, 'inspiration-card-cover-preview-report.json')

function decodePng(path) {
  const bytes = readFileSync(path)
  const decoded = PNG.sync.read(bytes, { checkCRC: true })
  if (!(decoded.width > 0 && decoded.height > 0)) throw new Error(`截图尺寸为空：${path}`)
  return { width: decoded.width, height: decoded.height, bytes: bytes.length }
}

const HARNESS_ENTRY = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { InspirationCoverCard } from './InspirationCoverCard.jsx'
import { injectInspirationStyles } from './styles.js'
import { zh } from './locales.js'

// The card's reveal opacity and pointer-events live in the plugin stylesheet, so
// a harness that skips it measures a card no user ever sees.
injectInspirationStyles()

const t = (key) => zh[key] || key
const root = createRoot(document.getElementById('host'))
window.__mount = (row) => {
  root.render(React.createElement(InspirationCoverCard, {
    card: { row, t, selected: false, selecting: false, replicateBusy: null, onSelect() {}, onReplicate() {}, revealed: true },
  }))
}
window.__ready = true
`

const resolveToClient = {
  name: 'harness-resolves-into-client-src',
  setup(build) {
    build.onResolve({ filter: /^\.\/(styles\.js|locales\.js|api\.js|feed-helpers\.js|import-status\.js|icons\.jsx|InspirationCoverCard\.jsx)$/ }, (args) => ({
      path: join(clientDir, args.path.slice(2)),
    }))
  },
}

async function buildHarness() {
  mkdirSync(scratch, { recursive: true })
  const entry = join(scratch, 'harness-entry.jsx')
  writeFileSync(entry, HARNESS_ENTRY)
  const out = join(scratch, 'harness.mjs')
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { 'dsh-ui-kit': join(clientDir, 'test-fixtures/ui-kit-shim.mjs') },
    outfile: out,
    logLevel: 'silent',
    loader: { '.css': 'empty', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty', '.otf': 'empty', '.eot': 'empty' },
    plugins: [resolveToClient],
  })
  return out
}

async function serve(files) {
  const server = createServer((req, res) => {
    const path = (req.url || '/').split('?')[0]
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(files.html)
      return
    }
    const asset = files.assets[path]
    if (!asset) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'content-type': asset.type })
    res.end(asset.body)
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  return { port, origin: `http://127.0.0.1:${port}`, close: () => new Promise((done) => server.close(done)) }
}

function egoScript({ origin, rawPath }) {
  return `
const fs = await import("node:fs/promises");
const RAW_PATH = ${JSON.stringify(rawPath)};
const ORIGIN = ${JSON.stringify(origin)};
const SHOTS = ${JSON.stringify(SHOTS)};
const out = { origin: ORIGIN, coverCodec: {}, card: {}, placeholder: {}, shots: {}, errors: [], spaceId: null, finished: false };
let task = null;
let page = null;

const waitFor = async (fn, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(200);
  }
  return false;
};

try {
  task = await taskSpace("inspiration card cover fallback browser qa (issue 2073)");
  out.spaceId = task.spaceId;
  page = task.page("p1");
  await page.goto(ORIGIN + "/");
  await page.waitForFunction(() => Boolean(window.__ready), undefined, { timeout: 30000 });
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  // 1. 负向对照：生产封面字节在两套 Content-Type 下能否被 <img> 解码
  out.coverCodec = await page.evaluate(async () => {
    const probe = (src) => new Promise((done) => {
      const img = document.createElement("img");
      img.onload = () => done({ src, ok: true, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
      img.onerror = () => done({ src, ok: false, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
      img.src = src;
      document.body.appendChild(img);
    });
    const asServed = await probe("/covers/cover_10b758f2.mp4");
    const asHeic = await probe("/covers/cover_10b758f2.heic");
    return { asServed, asHeic };
  });

  // 2. 正向验收：坏封面 + 本地可播放视频 → 卡片回退视频首帧
  await page.evaluate(() => window.__mount({
    id: "insp_heic",
    title: "I just wanna clean everything with this #cordlesspressurewasher",
    is_local: true,
    source_platform: "tiktok",
    cover_url: "/covers/cover_10b758f2.mp4",
    media_urls: ["/omnimux/inspiration/local/media/videos/video_2831d0b6.mp4"],
  }));
  const frameReady = await waitFor(() => {
    const video = document.querySelector(".omnimux-inspiration-cover-video");
    return Boolean(video) && video.readyState >= 2 && video.videoWidth > 0;
  }, 20000);
  out.card = await page.evaluate(() => {
    const video = document.querySelector(".omnimux-inspiration-cover-video");
    const img = document.querySelector(".omnimux-inspiration-cover-img");
    const fallback = document.querySelector(".omnimux-inspiration-cover-fallback");
    const rect = video ? video.getBoundingClientRect() : null;
    return {
      hasImg: Boolean(img),
      hasFallback: Boolean(fallback),
      hasVideo: Boolean(video),
      videoSrc: video ? video.getAttribute("src") : null,
      videoReadyState: video ? video.readyState : null,
      videoWidth: video ? video.videoWidth : null,
      videoHeight: video ? video.videoHeight : null,
      videoRect: rect ? { width: rect.width, height: rect.height } : null,
      videoLoaded: video ? video.className.includes("is-loaded") : false,
      videoMuted: video ? video.muted : null,
      videoControls: video ? video.hasAttribute("controls") : null,
      videoPointerEvents: video ? window.getComputedStyle(video).pointerEvents : null,
    };
  });
  out.frameReady = frameReady;
  out.shots.videoFrame = await page.screenshot({ path: SHOTS.videoFrame });

  // 3. 回归对照：无封面、无视频的行仍走占位块
  await page.evaluate(() => window.__mount({
    id: "insp_bare",
    title: "纯文字推文",
    is_local: true,
    source_platform: "x",
  }));
  await page.waitForTimeout(600);
  out.placeholder = await page.evaluate(() => {
    const fallback = document.querySelector(".omnimux-inspiration-cover-fallback");
    const rect = fallback ? fallback.getBoundingClientRect() : null;
    return {
      hasFallback: Boolean(fallback),
      fallbackRect: rect ? { width: rect.width, height: rect.height } : null,
      hasVideo: Boolean(document.querySelector(".omnimux-inspiration-cover-video")),
    };
  });
  out.shots.placeholder = await page.screenshot({ path: SHOTS.placeholder });
} catch (error) {
  out.errors.push(String(error && error.message ? error.message : error));
} finally {
  if (task) {
    try {
      await task.finish({ keep: [] });
      out.finished = true;
    } catch (error) {
      out.finishError = String(error && error.message ? error.message : error);
    }
  }
  await fs.writeFile(RAW_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log("EGO_RAW_WRITTEN");
}
`
}

async function runEgo(script, rawPath) {
  const child = spawn(EGO, ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  let spawnError = ''
  child.on('error', (error) => { spawnError = error.message })
  child.stdin.write(script)
  child.stdin.end()

  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    if (existsSync(rawPath) || child.exitCode !== null || spawnError) break
    await new Promise((done) => setTimeout(done, 500))
  }
  if (existsSync(rawPath)) await new Promise((done) => setTimeout(done, 300))
  const code = child.exitCode
  try { child.kill('SIGTERM') } catch { /* 已退出 */ }
  await new Promise((done) => setTimeout(done, 1500))
  if (child.exitCode === null) {
    try { child.kill('SIGKILL') } catch { /* 已退出 */ }
  }
  return { code, stdout, stderr: spawnError ? `${stderr}\nspawn-error: ${spawnError}` : stderr }
}

async function main() {
  rmSync(scratch, { recursive: true, force: true })
  if (!existsSync(REAL_COVER_SOURCE)) throw new Error(`缺少生产封面样本：${REAL_COVER_SOURCE}`)
  if (!existsSync(REAL_VIDEO_SOURCE)) throw new Error(`缺少生产视频样本：${REAL_VIDEO_SOURCE}`)

  const harness = await buildHarness()
  const coverBytes = readFileSync(REAL_COVER_SOURCE)
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>灵感卡片封面回退验收</title>
<style>html,body{margin:0;background:#0b0b0c;color:#fff;font-family:-apple-system,"PingFang SC",sans-serif}
#stage{padding:24px;min-height:100vh}#host{display:block;width:300px}</style></head>
<body><div id="stage"><div id="host"></div></div>
<script type="module" src="/harness.mjs"></script></body></html>`

  const server = await serve({
    html,
    assets: {
      '/harness.mjs': { type: 'text/javascript; charset=utf-8', body: readFileSync(harness) },
      // 与应用一致：同一份 HEIC 字节以 .mp4 名、video/mp4 提供。
      '/covers/cover_10b758f2.mp4': { type: 'video/mp4', body: coverBytes },
      // 对照：同一份字节以 image/heic 提供，用于区分命名/MIME 与编码支持。
      '/covers/cover_10b758f2.heic': { type: 'image/heic', body: coverBytes },
      '/omnimux/inspiration/local/media/videos/video_2831d0b6.mp4': { type: 'video/mp4', body: readFileSync(REAL_VIDEO_SOURCE) },
    },
  })
  const rawPath = join(scratch, 'ego-observations.json')
  const report = {
    task: 'inspiration-card-cover-fallback-browser',
    issue: 2073,
    title: '灵感卡片封面不可渲染时回退视频首帧 · 真实浏览器验收',
    origin: server.origin,
    port: server.port,
    browser: 'ego-browser (chromium)',
    samples: { cover: REAL_COVER_SOURCE, video: REAL_VIDEO_SOURCE, coverBytes: coverBytes.length },
    startedAt: new Date().toISOString(),
    assertions: [],
    pass: false,
    errors: [],
  }

  const check = (name, pass, detail) => report.assertions.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) })

  try {
    const run = await runEgo(egoScript({ origin: server.origin, rawPath }), rawPath)
    if (!existsSync(rawPath)) {
      throw new Error(`ego-browser 未产出观测文件（exit=${run.code}）：${run.stderr.trim() || run.stdout.trim()}`)
    }
    const raw = JSON.parse(readFileSync(rawPath, 'utf8'))
    report.errors.push(...(raw.errors || []))
    report.observations = { coverCodec: raw.coverCodec, card: raw.card, placeholder: raw.placeholder, frameReady: raw.frameReady }

    const codec = raw.coverCodec || {}
    check(
      'stored-cover-is-undecodable-as-served',
      codec.asServed && codec.asServed.ok === false,
      codec.asServed,
    )

    const card = raw.card || {}
    check('card-mounts-video-frame-layer', card.hasVideo === true, card)
    check(
      'video-frame-is-the-row-own-video',
      card.videoSrc === '/omnimux/inspiration/local/media/videos/video_2831d0b6.mp4',
      card.videoSrc,
    )
    check('video-frame-decoded-a-real-frame', Number(card.videoWidth) > 0 && Number(card.videoHeight) > 0, {
      videoWidth: card.videoWidth,
      videoHeight: card.videoHeight,
      readyState: card.videoReadyState,
    })
    check('video-frame-has-positive-geometry', card.videoRect && card.videoRect.width > 0 && card.videoRect.height > 0, card.videoRect)
    check('video-frame-revealed-and-hidden-from-input', card.videoLoaded === true && card.videoPointerEvents === 'none', {
      loaded: card.videoLoaded,
      pointerEvents: card.videoPointerEvents,
    })
    check('card-no-longer-shows-the-dead-placeholder', card.hasFallback === false, card)
    check('video-frame-is-a-silent-thumbnail', card.videoMuted === true && card.videoControls === false, {
      muted: card.videoMuted,
      controls: card.videoControls,
    })

    const placeholder = raw.placeholder || {}
    check(
      'row-without-cover-or-video-keeps-the-placeholder',
      placeholder.hasFallback === true && placeholder.hasVideo === false,
      placeholder,
    )

    const shotsValid = existsSync(SHOTS.videoFrame) && existsSync(SHOTS.placeholder)
    check('screenshots-captured-and-valid', shotsValid, {
      videoFrame: existsSync(SHOTS.videoFrame) ? decodePng(SHOTS.videoFrame) : null,
      placeholder: existsSync(SHOTS.placeholder) ? decodePng(SHOTS.placeholder) : null,
    })

    report.pass = report.assertions.every((a) => a.pass)
    console.log(`[inspiration-card-cover-fallback] pass=${report.pass}`)
    for (const a of report.assertions) {
      console.log(`  ${a.pass ? '✔' : '✖'} ${a.name}`)
    }

    writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8')
  } finally {
    await server.close()
    rmSync(scratch, { recursive: true, force: true })
  }

  if (!report.pass) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
