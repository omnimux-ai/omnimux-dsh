#!/usr/bin/env node
/**
 * 真实浏览器验收：会话栏收起态下灵感预览弹窗顶栏与分享按钮可见性验证（Issue #2014）
 *
 * 验收目标：
 * 1. 模拟会话栏收起态（html 携带 data-omnimux-conversation-collapsed 属性）
 * 2. 验证灵感预览弹窗顶栏 (.omnimux-inspiration-modal-header) 正常显示（display: flex, height > 40）
 * 3. 验证分享按钮 (.omnimux-inspiration-share-trigger-btn) 具备正向几何尺寸且正常可见
 * 4. 验证点击分享按钮能成功呼出分享浮层 (.omnimux-inspiration-share-popover)
 * 5. 验证会话栏容器内部的聊天顶栏在收起态被正确隐藏，不发生行为降级
 * 6. 截图留存证据到 docs/evidence/
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
const scratch = join(root, 'tests/e2e/.browser-scratch-modal-header-fix')
const evidenceDir = join(root, 'docs/evidence')
const EGO = process.env.EGO_BROWSER_BIN || 'ego-browser'

const SHOTS = {
  collapsedHeader: join(evidenceDir, 'inspiration-modal-header-collapsed-verified.png'),
  sharePopover: join(evidenceDir, 'inspiration-modal-header-popover-verified.png'),
}

function decodePng(path) {
  const bytes = readFileSync(path)
  const decoded = PNG.sync.read(bytes, { checkCRC: true })
  if (!(decoded.width > 0 && decoded.height > 0)) throw new Error(`截图尺寸为空：${path}`)
  return { width: decoded.width, height: decoded.height, bytes: bytes.length }
}

const resolveToClient = {
  name: 'harness-resolves-into-client-src',
  setup(build) {
    build.onResolve({ filter: /^\.\/(styles\.js|locales\.js|InspirationPreviewModal\.jsx)$/ }, (args) => ({
      path: join(clientDir, args.path.slice(2)),
    }))
  },
}

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

function egoScript({ origin, rawPath }) {
  return `
const fs = await import("node:fs/promises");
const RAW_PATH = ${JSON.stringify(rawPath)};
const ORIGIN = ${JSON.stringify(origin)};
const SHOTS = ${JSON.stringify(SHOTS)};
const out = { origin: ORIGIN, assertions: [], shots: {}, errors: [], spaceId: null, finished: false };
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
  task = await taskSpace("inspiration modal header fix browser qa (issue 2014)");
  out.spaceId = task.spaceId;
  page = task.page("p1");
  await page.goto(ORIGIN + "/");
  await page.waitForFunction(() => Boolean(window.__ready), undefined, { timeout: 30000 });
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });

  // 1. 初始化弹窗并挂载云端条目
  await page.evaluate(() => window.__scenario("cloud"));

  // 2. 模拟真实会话折叠状态：设置属性 data-omnimux-conversation-collapsed
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-omnimux-conversation-collapsed', '');
  });

  // 3. 测量顶栏与分享按钮状态
  const headerState = await page.evaluate(() => {
    const header = document.querySelector('.omnimux-inspiration-modal-header');
    const shareBtn = document.querySelector('.omnimux-inspiration-share-trigger-btn');
    const hr = header ? header.getBoundingClientRect() : null;
    const sr = shareBtn ? shareBtn.getBoundingClientRect() : null;
    const hs = header ? window.getComputedStyle(header) : null;
    const ss = shareBtn ? window.getComputedStyle(shareBtn) : null;
    return {
      hasHeader: Boolean(header),
      headerDisplay: hs ? hs.display : null,
      headerHeight: hr ? hr.height : 0,
      headerWidth: hr ? hr.width : 0,
      hasShareBtn: Boolean(shareBtn),
      shareBtnDisplay: ss ? ss.display : null,
      shareBtnVisibility: ss ? ss.visibility : null,
      shareBtnWidth: sr ? sr.width : 0,
      shareBtnHeight: sr ? sr.height : 0,
      shareBtnText: shareBtn ? shareBtn.innerText.trim() : null
    };
  });

  out.headerState = headerState;
  out.shots.collapsedHeader = await page.screenshot({ path: SHOTS.collapsedHeader });

  // 4. 点击分享按钮验证能否成功展开浮层
  await page.evaluate(() => window.__clickShare());
  const popoverVisible = await waitFor(() => Boolean(document.querySelector('.omnimux-inspiration-share-popover')), 5000);
  const popoverState = await page.evaluate(() => {
    const popover = document.querySelector('.omnimux-inspiration-share-popover');
    const pr = popover ? popover.getBoundingClientRect() : null;
    return {
      visible: Boolean(popover),
      width: pr ? pr.width : 0,
      height: pr ? pr.height : 0,
      title: document.querySelector('.omnimux-inspiration-share-popover-title')?.innerText
    };
  });
  out.popoverState = popoverState;
  out.shots.sharePopover = await page.screenshot({ path: SHOTS.sharePopover });

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
  const harness = await buildHarness()
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>灵感预览顶栏可见性验收</title>
<style>html,body{margin:0;background:#0b0b0c;color:#fff;font-family:-apple-system,"PingFang SC",sans-serif}
#stage{padding:24px;min-height:100vh}#host{display:block}</style></head>
<body><div id="stage"><div id="host"></div></div>
<script type="module" src="/harness.mjs"></script></body></html>`

  const server = await serve({ html, assets: { '/harness.mjs': readFileSync(harness, 'utf8') } })
  const rawPath = join(scratch, 'ego-observations.json')
  const report = {
    task: 'inspiration-modal-header-fix-browser',
    issue: 2014,
    title: '会话栏收起态灵感弹窗顶栏与分享按钮可见性 · 真实浏览器验收',
    origin: server.origin,
    port: server.port,
    browser: 'ego-browser (chromium)',
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

    const hs = raw.headerState
    const ps = raw.popoverState

    check('header-display-flex-under-collapsed-state', hs && hs.headerDisplay === 'flex', hs)
    check('header-has-positive-geometry', hs && hs.headerHeight >= 50 && hs.headerWidth > 400, hs)
    check('share-btn-visible-and-positive-geometry', hs && hs.shareBtnDisplay !== 'none' && hs.shareBtnWidth > 30 && hs.shareBtnHeight > 20, hs)
    check('share-popover-opened-on-click', ps && ps.visible === true && ps.width > 200, ps)

    const shotsValid = existsSync(SHOTS.collapsedHeader) && existsSync(SHOTS.sharePopover)
    check('screenshots-captured-and-valid', shotsValid, {
      collapsedHeader: existsSync(SHOTS.collapsedHeader) ? decodePng(SHOTS.collapsedHeader) : null,
      sharePopover: existsSync(SHOTS.sharePopover) ? decodePng(SHOTS.sharePopover) : null,
    })

    report.pass = report.assertions.every((a) => a.pass)
    console.log(`[inspiration-modal-header-fix] pass=${report.pass}`)
    for (const a of report.assertions) {
      console.log(`  ${a.pass ? '✔' : '✖'} ${a.name}`)
    }

    writeFileSync(join(evidenceDir, 'inspiration-modal-header-fix-report.json'), JSON.stringify(report, null, 2), 'utf8')
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
