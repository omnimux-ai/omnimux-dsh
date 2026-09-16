#!/usr/bin/env node
/**
 * 真实浏览器验收：云端灵感「零上传分享」通道（Issue #1996）
 *
 * 与单测/e2e 的分工：`inspiration-cloud-share.e2e.test.mjs` 在 jsdom 里跑通了整条
 * 服务端链路（含 upload 调用计数为 0），本脚本负责另一半 —— 在**工作树内**用
 * ego-browser 起真实 Chromium，打开一个动态端口的临时静态服务，把工作树源码
 * 构建出的真实 React 弹层（真实样式表 + 真实中文文案）渲染出来，按真实点击走完
 * 云端与本地两条旅程，对真实布局做正几何断言并截图留证。
 *
 * 两条旅程要证明的是同一件事的两面：
 *   云端 —— 点分享后进度只有「准备素材 → 发布中」，全程 0 次上传调用，完成态给出
 *           云端链接并明确标注视频素材不可访问，且页面里没有任何 <video> 元素；
 *   本地 —— 进度仍是三步（含「上传素材」），证明这次改动没有波及既有链路。
 *
 * 上游云端用页面内的脚本化同形响应替身（与 Host 契约同形），因此它证明的是
 * 「界面如何展示这条零上传通道」；服务端真的没有上传，由 e2e 的 upload 计数佐证。
 *
 * 用法：node tests/e2e/inspiration-cloud-share.browser.mjs
 * 证据：docs/evidence/inspiration-cloud-share-browser.json + 三张 PNG
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { PNG } from 'pngjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const clientDir = join(root, 'plugins/omnimux-inspiration/src/client')
const scratch = join(root, 'tests/e2e/.browser-scratch-cloud-share')
const evidenceDir = join(root, 'docs/evidence')
const EGO = process.env.EGO_BROWSER_BIN || 'ego-browser'

const SHARE_URL = 'https://omnimux.ai/s/insp_cloud_e2e_7a31'
const CLOUD_TITLE = '情绪共鸣型助眠歌单推广'
const CLOUD_COVER_PATH = '/api/inspiration/v1/public/media/inspiration-covers/2690'
const CLOUD_MEDIA_PATH = '/api/inspiration/v1/public/media/r2/publications/genviral/videos/2690/video.mp4'
const MEDIA_NOTICE = '云端视频素材当前不可访问（上游存储问题，工单 No. 257），本次仅分享封面与文案'

const SHOTS = {
  cloudProgress: join(evidenceDir, 'inspiration-cloud-share-cloud-progress.png'),
  cloudResult: join(evidenceDir, 'inspiration-cloud-share-cloud-result.png'),
  localRegression: join(evidenceDir, 'inspiration-cloud-share-local-regression.png'),
}

/** 截图必须是可解码的真实 PNG。 */
function decodePng(path) {
  const bytes = readFileSync(path)
  const decoded = PNG.sync.read(bytes, { checkCRC: true })
  if (!(decoded.width > 0 && decoded.height > 0)) throw new Error(`截图尺寸为空：${path}`)
  return { width: decoded.width, height: decoded.height, bytes: bytes.length }
}

/**
 * 夹具入口写在临时目录，但模块解析必须落在真正的客户端源码目录，这样装进去的
 * 是工作树里的真实组件、真实样式与真实文案（不是副本）。
 */
const resolveToClient = {
  name: 'harness-resolves-into-client-src',
  setup(build) {
    build.onResolve({ filter: /^\.\/(styles\.js|locales\.js|InspirationPreviewModal\.jsx)$/ }, (args) => ({
      path: join(clientDir, args.path.slice(2)),
    }))
  },
}

/** @returns {Promise<string>} 构建产物路径 */
async function buildHarness() {
  mkdirSync(scratch, { recursive: true })
  const entry = join(scratch, 'harness-entry.jsx')
  writeFileSync(entry, readFileSync(join(here, 'inspiration-cloud-share.harness.jsx'), 'utf8'))
  const out = join(scratch, 'harness.mjs')
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: {
      'dsh-ui-kit': join(clientDir, 'test-fixtures/ui-kit-shim.mjs'),
    },
    outfile: out,
    logLevel: 'silent',
    // 真实 ui-kit 会拉一份 markdown 样式表与字体；页面跑在没有字体挂载的无头浏览器里，
    // 直接置空而不是复制。浮层自己的样式来自插件样式表，不受影响。
    loader: {
      '.css': 'empty',
      '.woff': 'empty',
      '.woff2': 'empty',
      '.ttf': 'empty',
      '.otf': 'empty',
      '.eot': 'empty',
    },
    plugins: [resolveToClient],
  })
  return out
}

/** 临时静态服务：动态端口，返回页面与构建产物。 */
async function serve(files) {
  const server = createServer((req, res) => {
    const path = (req.url || '/').split('?')[0]
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(files.html)
      return
    }
    const body = files.assets[path]
    if (!body) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    res.end(body)
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  return { port, origin: `http://127.0.0.1:${port}`, close: () => new Promise((done) => server.close(done)) }
}

/**
 * 交给 `ego-browser nodejs` 的驱动脚本，从 stdin 读入。
 *
 * 全程只用 ASCII：中文只出现在页面里，由脚本从 DOM 读出后写成 UTF-8 文件，
 * 断言与期望文案留在本文件（真正的 UTF-8 源），避免任何管道编码差异污染证据。
 * @param {{ origin: string, rawPath: string }} args
 */
function egoScript({ origin, rawPath }) {
  return `
const fs = await import("node:fs/promises");
const RAW_PATH = ${JSON.stringify(rawPath)};
const ORIGIN = ${JSON.stringify(origin)};
const SHOTS = ${JSON.stringify(SHOTS)};
const out = { origin: ORIGIN, phases: {}, shots: {}, errors: [], spaceId: null, finished: false };
let task = null;
let page = null;

const waitFor = async (fn, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(250);
  }
  return false;
};

const collect = () => page.evaluate(() => {
  const box = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { width: Math.round(r.width), height: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) };
  };
  const styleOf = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { position: cs.position, fontSize: cs.fontSize, background: cs.backgroundColor, color: cs.color };
  };
  const text = (selector) => {
    const el = document.querySelector(selector);
    return el ? el.textContent.trim() : "";
  };
  return {
    stepIds: [...document.querySelectorAll("[data-share-step]")].map((el) => el.dataset.shareStep),
    steps: [...document.querySelectorAll("[data-share-step]")].map((el) => ({
      id: el.dataset.shareStep, state: el.dataset.shareState, label: el.textContent.trim(),
    })),
    uploadingStepCount: document.querySelectorAll('[data-share-step="uploading"]').length,
    linkValue: document.querySelector(".omnimux-inspiration-share-input")
      ? document.querySelector(".omnimux-inspiration-share-input").value : "",
    noticePresent: Boolean(document.querySelector('[data-share-notice="media-unavailable"]')),
    noticeText: text('[data-share-notice="media-unavailable"]'),
    doneTag: text(".omnimux-inspiration-share-done"),
    metaText: text(".omnimux-inspiration-share-meta"),
    errorText: text(".omnimux-inspiration-share-tip.is-error"),
    videoCount: document.querySelectorAll("video").length,
    iframeCount: document.querySelectorAll(".omnimux-inspiration-player-frame").length,
    playerNotice: text(".omnimux-inspiration-player-notice"),
    modalTitle: text(".omnimux-inspiration-modal-heading h2"),
    popoverBox: box(".omnimux-inspiration-share-popover"),
    popoverStyle: styleOf(".omnimux-inspiration-share-popover"),
    progressBox: box(".omnimux-inspiration-share-progress"),
    resultBox: box(".omnimux-inspiration-share-result"),
    linkBoxBox: box(".omnimux-inspiration-share-link-box"),
    noticeBox: box('[data-share-notice="media-unavailable"]'),
    noticeStyle: styleOf('[data-share-notice="media-unavailable"]'),
    playerBoxBox: box(".omnimux-inspiration-modal-player-box"),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    styleTagCount: document.querySelectorAll("style").length,
    calls: (window.__calls || []).map((call) => ({ ...call })),
  };
});

try {
  task = await taskSpace("inspiration cloud share browser qa (issue 1996)");
  out.spaceId = task.spaceId;
  page = task.page("p1");
  await page.goto(ORIGIN + "/");
  const ready = await page.waitForFunction(() => Boolean(window.__ready), undefined, { timeout: 30000 });
  out.phases.ready = Boolean(ready);
  try {
    await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  } catch (error) {
    out.viewportOverrideError = String(error && error.message ? error.message : error);
  }

  /* ---------------- 旅程 A：云端条目零上传分享 ---------------- */
  await page.evaluate(() => window.__scenario("cloud"));
  const cloudOpened = await page.evaluate(() => window.__clickShare());
  const cloudPopoverVisible = await waitFor(() => Boolean(document.querySelector(".omnimux-inspiration-share-popover")), 10000);
  const cloudCreateClicked = await page.evaluate(() => window.__clickCreate());
  // 真实阶段推进：服务端把行推到 publishing 之后才截图，不摆拍。
  const cloudReachedPublishing = await waitFor(
    () => Boolean(document.querySelector('[data-share-step="publishing"][data-share-state="active"]')), 25000);
  const cloudProgress = await collect();
  out.shots.cloudProgress = await page.screenshot({ path: SHOTS.cloudProgress });
  const cloudSettled = await waitFor(() => Boolean(document.querySelector(".omnimux-inspiration-share-input")), 30000);
  const cloudDone = await collect();
  out.shots.cloudResult = await page.screenshot({ path: SHOTS.cloudResult });
  out.phases.cloud = {
    opened: cloudOpened, popoverVisible: cloudPopoverVisible, createClicked: cloudCreateClicked,
    reachedPublishing: cloudReachedPublishing, settled: cloudSettled,
    progress: cloudProgress, done: cloudDone,
  };

  /* ---------------- 旅程 B：本地条目分享回归 ---------------- */
  await page.evaluate(() => window.__scenario("local"));
  const localOpened = await page.evaluate(() => window.__clickShare());
  const localPopoverVisible = await waitFor(() => Boolean(document.querySelector(".omnimux-inspiration-share-popover")), 10000);
  const localCreateClicked = await page.evaluate(() => window.__clickCreate());
  const localReachedUploading = await waitFor(
    () => Boolean(document.querySelector('[data-share-step="uploading"][data-share-state="active"]')), 25000);
  const localProgress = await collect();
  out.shots.localRegression = await page.screenshot({ path: SHOTS.localRegression });
  out.phases.local = {
    opened: localOpened, popoverVisible: localPopoverVisible, createClicked: localCreateClicked,
    reachedUploading: localReachedUploading, progress: localProgress,
  };
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

/**
 * 用 `ego-browser nodejs`（脚本从 stdin 读入）跑真实 Chromium。
 *
 * 完成信号是驱动脚本自己写下的观测文件，而不是子进程退出：ego-browser 跑完脚本后
 * 进程不会自行结束，等它 'close' 会把整轮验收挂死。观测文件一落盘就说明浏览器
 * 那半程已经跑完（TaskSpace 也在同一段脚本里关掉了），此时收掉子进程即可。
 * @param {string} script @param {string} rawPath
 */
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

function gitHead() {
  const child = spawn('git', ['-C', root, 'rev-parse', 'HEAD'])
  let out = ''
  child.stdout.on('data', (chunk) => { out += chunk.toString() })
  return new Promise((done) => child.on('close', () => done(out.trim())))
}

function gitBranch() {
  const child = spawn('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'])
  let out = ''
  child.stdout.on('data', (chunk) => { out += chunk.toString() })
  return new Promise((done) => child.on('close', () => done(out.trim())))
}

/** 本场景发往 Host 的请求里，有没有上传调用。 */
const uploadCalls = (calls) => (calls || []).filter((call) => call.upload === true)
const sharePosts = (calls) => (calls || []).filter((call) => call.method === 'POST' && String(call.url).endsWith('/share'))

async function main() {
  rmSync(scratch, { recursive: true, force: true })
  const harness = await buildHarness()
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>云端灵感分享验收</title>
<style>html,body{margin:0;background:#0b0b0c;color:#fff;font-family:-apple-system,"PingFang SC",sans-serif}
#stage{padding:24px;min-height:100vh}#host{display:block}</style></head>
<body><div id="stage"><div id="host"></div></div>
<script type="module" src="/harness.mjs"></script></body></html>`

  const server = await serve({ html, assets: { '/harness.mjs': readFileSync(harness, 'utf8') } })
  const rawPath = join(scratch, 'ego-observations.json')
  const report = {
    task: 'inspiration-cloud-share-browser',
    issue: 1996,
    title: '云端灵感零上传分享 · 工作树内真实浏览器验收',
    branch: await gitBranch(),
    headSha: await gitHead(),
    origin: server.origin,
    port: server.port,
    browser: 'ego-browser (chromium, 真实浏览器实例)',
    startedAt: new Date().toISOString(),
    assertions: [],
    screenshots: [],
    observations: {},
    pass: false,
    errors: [],
  }
  const check = (name, pass, detail) => report.assertions.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) })

  try {
    const run = await runEgo(egoScript({ origin: server.origin, rawPath }), rawPath)
    report.egoExitCode = run.code
    report.egoStdoutTail = run.stdout.trim().split('\n').slice(-4).join('\n')
    report.egoStderrTail = run.stderr.trim().split('\n').slice(-8).join('\n')
    if (!existsSync(rawPath)) {
      throw new Error(`ego-browser 未产出观测文件（exit=${run.code}）：${run.stderr.trim() || run.stdout.trim()}`)
    }
    const raw = JSON.parse(readFileSync(rawPath, 'utf8'))
    report.taskSpaceId = raw.spaceId
    report.taskSpaceClosed = raw.finished === true
    report.errors.push(...(raw.errors || []))
    if (raw.viewportOverrideError) report.errors.push(`viewport: ${raw.viewportOverrideError}`)
    report.observations = raw.phases

    const cloud = raw.phases.cloud
    const local = raw.phases.local
    if (!cloud || !local) throw new Error(`旅程未跑完：${JSON.stringify({ cloud: Boolean(cloud), local: Boolean(local), errors: raw.errors })}`)

    const progress = cloud.progress
    const done = cloud.done

    /* ------------------------- 旅程 A：云端 ------------------------- */
    check('page-served-over-http-on-a-dynamic-port', /^http:\/\/127\.0\.0\.1:\d+$/.test(report.origin) && report.port > 0, {
      origin: report.origin, port: report.port,
    })
    check('real-react-modal-mounted-with-real-copy', progress.modalTitle === CLOUD_TITLE && progress.styleTagCount > 0, {
      modalTitle: progress.modalTitle, styleTagCount: progress.styleTagCount,
    })
    check('cloud-share-popover-opened-by-click', cloud.opened === true && cloud.popoverVisible === true)
    check('cloud-create-link-clicked', cloud.createClicked === true)
    check('cloud-progress-has-positive-geometry',
      Boolean(progress.progressBox) && progress.progressBox.width > 100 && progress.progressBox.height > 20,
      progress.progressBox)
    check('cloud-progress-renders-exactly-two-stages',
      JSON.stringify(progress.stepIds) === JSON.stringify(['preparing', 'publishing']),
      { stepIds: progress.stepIds, labels: progress.steps.map((step) => step.label) })
    check('cloud-progress-renders-no-uploading-step', progress.uploadingStepCount === 0, {
      uploadingStepCount: progress.uploadingStepCount,
      uploadingLabelPresent: progress.steps.some((step) => /上传素材/.test(step.label)),
    })
    check('cloud-progress-follows-the-real-server-stage',
      cloud.reachedPublishing === true &&
        progress.steps.some((step) => step.id === 'publishing' && step.state === 'active') &&
        progress.steps.some((step) => step.id === 'preparing' && step.state === 'done'),
      progress.steps)
    check('cloud-progress-shows-no-link-while-running', progress.linkValue === '', { linkValue: progress.linkValue })
    check('cloud-journey-issues-zero-upload-calls',
      uploadCalls(progress.calls).length === 0 && uploadCalls(done.calls).length === 0,
      { progressUploads: uploadCalls(progress.calls).length, totalUploads: uploadCalls(done.calls).length, calls: done.calls })
    const cloudPosts = sharePosts(done.calls)
    let cloudBody = {}
    try { cloudBody = JSON.parse(cloudPosts[0]?.body || '{}') } catch { cloudBody = {} }
    check('cloud-share-request-declares-cloud-source', cloudPosts.length === 1 && cloudBody.source === 'cloud', {
      postCount: cloudPosts.length, body: cloudBody,
    })
    check('cloud-share-request-republishes-cloud-addresses-without-media-bytes',
      cloudBody.coverUrl === CLOUD_COVER_PATH &&
        Array.isArray(cloudBody.mediaUrls) && cloudBody.mediaUrls[0] === CLOUD_MEDIA_PATH &&
        !/form-data/i.test(cloudPosts[0]?.body || '') && !('local_paths' in cloudBody),
      { coverUrl: cloudBody.coverUrl, mediaUrls: cloudBody.mediaUrls })
    check('cloud-done-shows-the-cloud-link', done.linkValue === SHARE_URL, { linkValue: done.linkValue })
    check('cloud-done-shows-published-tag-and-validity',
      done.doneTag === '已发布' && /链接有效期 72 小时/.test(done.metaText),
      { doneTag: done.doneTag, metaText: done.metaText })
    check('cloud-done-shows-media-unavailable-notice', done.noticePresent === true && done.noticeText === MEDIA_NOTICE, {
      noticeText: done.noticeText,
    })
    check('cloud-done-notice-has-positive-geometry',
      Boolean(done.noticeBox) && done.noticeBox.width > 100 && done.noticeBox.height > 10,
      { box: done.noticeBox, style: done.noticeStyle })
    check('cloud-done-page-has-no-video-element', done.videoCount === 0, {
      videoCount: done.videoCount, playerFrames: done.iframeCount, playerNotice: done.playerNotice,
    })
    check('cloud-done-result-has-positive-geometry',
      Boolean(done.resultBox) && done.resultBox.width > 100 && done.resultBox.height > 20 &&
        Boolean(done.linkBoxBox) && done.linkBoxBox.width > 100,
      { resultBox: done.resultBox, linkBox: done.linkBoxBox })
    check('cloud-popover-renders-with-the-real-plugin-stylesheet',
      done.popoverStyle?.position === 'absolute' && done.popoverStyle?.background !== 'rgba(0, 0, 0, 0)',
      done.popoverStyle)

    /* ------------------------- 旅程 B：本地 ------------------------- */
    const localProgress = local.progress
    check('local-share-popover-opened-by-click', local.opened === true && local.popoverVisible === true)
    check('local-create-link-clicked', local.createClicked === true)
    check('local-progress-still-walks-three-stages',
      JSON.stringify(localProgress.stepIds) === JSON.stringify(['preparing', 'uploading', 'publishing']),
      { stepIds: localProgress.stepIds, labels: localProgress.steps.map((step) => step.label) })
    check('local-progress-active-stage-is-uploading',
      local.reachedUploading === true &&
        localProgress.steps.some((step) => step.id === 'uploading' && step.state === 'active'),
      localProgress.steps)
    check('local-progress-has-positive-geometry',
      Boolean(localProgress.progressBox) && localProgress.progressBox.width > 100 && localProgress.progressBox.height > 20,
      localProgress.progressBox)
    let localBody = null
    const localPosts = sharePosts(localProgress.calls)
    try { localBody = localPosts[0]?.body ? JSON.parse(localPosts[0].body) : null } catch { localBody = null }
    check('local-share-request-does-not-take-the-cloud-path',
      localPosts.length === 1 && (localBody === null || localBody.source !== 'cloud'),
      { postCount: localPosts.length, body: localBody, rawBody: localPosts[0]?.body || '' })
    check('local-progress-shows-no-link-while-running', localProgress.linkValue === '', { linkValue: localProgress.linkValue })

    /* --------------------------- 环境与证据 --------------------------- */
    check('ego-browser-task-space-closed', raw.finished === true, { spaceId: raw.spaceId, finishError: raw.finishError || null })
    check('three-screenshots-captured', Object.values(SHOTS).every((path) => existsSync(path)), SHOTS)

    mkdirSync(evidenceDir, { recursive: true })
    for (const [name, path] of Object.entries(SHOTS)) {
      if (!existsSync(path)) continue
      report.screenshots.push({ name, path, ...decodePng(path) })
    }
    check('screenshots-are-real-decodable-pngs', report.screenshots.length === 3, report.screenshots)

    report.pass = report.assertions.every((assertion) => assertion.pass)
  } catch (error) {
    report.errors.push(error?.message || String(error))
  } finally {
    await server.close()
    rmSync(scratch, { recursive: true, force: true })
    report.completedAt = new Date().toISOString()
    mkdirSync(evidenceDir, { recursive: true })
    const target = join(evidenceDir, 'inspiration-cloud-share-browser.json')
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`[inspiration-cloud-share] pass=${report.pass} evidence=${target}`)
    for (const assertion of report.assertions) {
      console.log(`  ${assertion.pass ? '✔' : '✖'} ${assertion.name}`)
    }
    if (report.errors.length > 0) console.log(`  errors: ${report.errors.join('; ')}`)
  }
  if (!report.pass) process.exitCode = 1
}

await main()
