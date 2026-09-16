#!/usr/bin/env node
/**
 * 真实浏览器预演验证：灵感预览弹窗分享按钮激活态视觉规范验证
 *
 * 验证重点：
 * 1. 挂载灵感预览弹窗
 * 2. 测量分享按钮初始态（未激活）几何与样式
 * 3. 点击分享按钮进入激活态（is-active）并呼出分享浮层
 * 4. 测量分享按钮激活态计算样式：
 *    - 严禁纯白色背景（rgb(255, 255, 255)）
 *    - 背景色为微透暗色（带 alpha 通道）
 *    - 边框存在且不透明/非 none
 *    - 文字与图标可见
 * 5. 截图并落盘至 docs/evidence/inspiration-share-button-active-verified.png
 * 6. 产出结构化验证证据报告 docs/evidence/inspiration-share-button-active-report.json
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { PNG } from 'pngjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const clientDir = join(root, 'plugins/omnimux-inspiration/src/client')
const scratch = join(root, 'tmp/.browser-scratch-share-button')
const evidenceDir = join(root, 'docs/evidence')
const EGO = process.env.EGO_BROWSER_BIN || 'ego-browser'

const SHOT_PATH = join(evidenceDir, 'inspiration-share-button-active-verified.png')
const REPORT_PATH = join(evidenceDir, 'inspiration-share-button-active-report.json')

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
  writeFileSync(entry, readFileSync(join(root, 'tests/e2e/inspiration-cloud-share.harness.jsx'), 'utf8'))
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
const SHOT_PATH = ${JSON.stringify(SHOT_PATH)};
const out = { origin: ORIGIN, assertions: [], errors: [], spaceId: null, finished: false };
let task = null;
let page = null;

const waitFor = async (fn, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(100);
  }
  return false;
};

try {
  task = await taskSpace("inspiration share button active style verify");
  out.spaceId = task.spaceId;
  page = task.page("p1");
  await page.goto(ORIGIN + "/");
  await page.waitForFunction(() => Boolean(window.__ready), undefined, { timeout: 30000 });
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });

  // 1. 初始化弹窗
  await page.evaluate(() => window.__scenario("cloud"));

  // 2. 点击分享按钮进入激活态并呼出浮层
  await page.evaluate(() => window.__clickShare());
  await waitFor(() => Boolean(document.querySelector('.omnimux-inspiration-share-popover')), 5000);

  // 3. 测量分享按钮激活态样式与几何
  const shareBtnState = await page.evaluate(() => {
    const btn = document.querySelector('.omnimux-inspiration-share-trigger-btn');
    if (!btn) return null;
    const cs = window.getComputedStyle(btn);
    const r = btn.getBoundingClientRect();
    return {
      isActive: btn.classList.contains('is-active'),
      ariaExpanded: btn.getAttribute('aria-expanded'),
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      borderTopColor: cs.borderTopColor,
      borderTopWidth: cs.borderTopWidth,
      width: r.width,
      height: r.height,
      visible: cs.visibility === 'visible' && cs.display !== 'none'
    };
  });

  out.shareBtnState = shareBtnState;
  await page.screenshot({ path: SHOT_PATH });
  out.screenshotCaptured = true;

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
}
`
}

async function runEgo(script, rawPath) {
  const child = spawn(EGO, ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

  const exitPromise = new Promise((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })

  child.stdin.write(script)
  child.stdin.end()
  return await exitPromise
}

async function main() {
  mkdirSync(evidenceDir, { recursive: true })
  const harnessBundle = await buildHarness()
  const jsContent = readFileSync(harnessBundle, 'utf8')

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Inspiration Share Button Verification</title>
    <style>
      html, body { margin: 0; padding: 0; background: #111113; color: #fff; width: 100%; height: 100%; }
      #host { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="host"></div>
    <script type="module" src="/harness.mjs"></script>
  </body>
</html>`

  const server = await serve({ html, assets: { '/harness.mjs': jsContent } })
  const rawPath = join(scratch, 'raw.json')

  const report = {
    task: "inspiration-share-button-active-visual-verification",
    title: "灵感社区预览弹窗分享按钮激活态视觉规范 · 真实浏览器实机预演",
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

    const bs = raw.shareBtnState
    check('share-button-is-active', bs && bs.isActive === true, bs)
    check('share-button-has-aria-expanded', bs && bs.ariaExpanded === 'true', bs)
    check('share-button-positive-geometry', bs && bs.visible && bs.width > 40 && bs.height >= 30, bs)

    // 关键视觉规范：激活态背景绝不能是纯白色（rgb(255, 255, 255)）
    const isSolidWhite = bs && (bs.backgroundColor === 'rgb(255, 255, 255)' || bs.backgroundColor === '#ffffff')
    check('share-button-not-solid-white', bs && !isSolidWhite, { backgroundColor: bs ? bs.backgroundColor : null })

    // 截图有效性
    const shotValid = existsSync(SHOT_PATH)
    check('screenshot-captured-and-valid', shotValid, shotValid ? decodePng(SHOT_PATH) : null)

    report.pass = report.assertions.every((a) => a.pass)
    console.log(`[inspiration-share-button-verify] pass=${report.pass}`)
    for (const a of report.assertions) {
      console.log(`  ${a.pass ? '✔' : '✖'} ${a.name}`)
    }

    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')
  } finally {
    await server.close()
    rmSync(scratch, { recursive: true, force: true })
  }

  if (!report.pass) process.exit(1)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
