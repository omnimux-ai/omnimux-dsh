#!/usr/bin/env node
/**
 * scripts/worktree-app-qa.mjs
 *
 * 在工作树内一条命令跑完「应用级」Web 验收：起完整应用 → 同源登录 → 真实浏览器验收 → 截图与结构化报告 → 自清理。
 * 与 worktree-web-qa.mjs 的分工：后者评的是 Stage 夹具（伪造宿主 + 占位内容），本脚本评的是完整应用本体；
 * 两者证据不得互相冒充。
 *
 * 证据：<root>/.workbuddy/evidence/app-qa/<runId>/（PNG + 明细报告）与 <root>/docs/evidence/worktree-app-qa-report.json。
 * loginUrl 是内存中的一次性能力：绝不解密、打印、落盘或放进截图说明。
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestEnvironment, diagnoseWorktreeRoot } from './test-env-bootstrap.mjs';
import { findChromePath, assertPng } from './worktree-web-qa.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = sourceRoot.split(`${sep}.worktrees${sep}`)[0];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 可见元素几何：排除不可见标签与零尺寸盒，只统计真实占位的元素。
 * 断言必须落在正几何上——HTTP 200、页面标题或合法空态都不足以证明界面就绪。
 */
export const VISIBLE_GEOMETRY_EXPRESSION = `JSON.stringify((() => {
  const skip = new Set(['SCRIPT','STYLE','META','LINK','TITLE','HEAD','NOSCRIPT','TEMPLATE']);
  let visibleCount = 0;
  let largest = { width: 0, height: 0, tag: null };
  for (const el of document.querySelectorAll('body *')) {
    if (skip.has(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    visibleCount += 1;
    if (rect.width * rect.height > largest.width * largest.height) {
      largest = { width: Math.round(rect.width), height: Math.round(rect.height), tag: el.tagName };
    }
  }
  return {
    visibleCount,
    largest,
    vw: innerWidth,
    vh: innerHeight,
    title: document.title,
    bodyTextLength: (document.body && document.body.innerText ? document.body.innerText : '').trim().length,
  };
})())`;

/** 界面就绪判定：足够多的可见元素，且最大可见元素占据实质面积。 */
export function isAppReady(geometry) {
  return Boolean(geometry)
    && geometry.visibleCount >= 10
    && geometry.largest.width > 200
    && geometry.largest.height > 100;
}

/** 工作树根解析：只接受 <repo>/.worktrees/<task> 直接子级，失败时带可读原因。 */
export function resolveWorktreeRoot(candidate, io = fs, repo = repositoryRoot) {
  const diagnosis = diagnoseWorktreeRoot(candidate, io, repo);
  return diagnosis.ok ? { ok: true, root: candidate } : diagnosis;
}

/** 真实无头 Chrome 驱动：动态 CDP 端口、同源 cookie 注入、正几何断言、PNG 取证。 */
async function driveRealBrowser({ origin, cookie, evidenceDir, io = fs, chromePath = findChromePath() }) {
  let chrome; let socket;
  const assertions = [];
  const cdpPort = { value: null };
  try {
    chrome = spawn(chromePath, [
      '--headless=new', '--remote-debugging-port=0', '--no-first-run',
      '--no-default-browser-check', '--disable-gpu', '--window-size=1280,800',
      'about:blank',
    ]);
    cdpPort.value = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('chrome-start-timeout')), 15000);
      let buffer = '';
      chrome.stderr.on('data', chunk => {
        buffer += chunk.toString();
        const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buffer);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
    });
    assertions.push({ name: 'chrome-cdp-listen', pass: true, port: cdpPort.value });

    const targets = await (await fetch(`http://127.0.0.1:${cdpPort.value}/json/list`)).json();
    const page = targets.find(target => target.type === 'page');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((yes, no) => { socket.onopen = yes; socket.onerror = no; });

    let sequence = 0;
    const pending = new Map();
    const send = (method, params) => new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { resolve: yes, reject: no } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) no(new Error(`cdp ${message.error.message}`)); else yes(message.result);
    };

    await send('Network.enable');
    await send('Page.enable');
    const sameSiteCookie = await send('Network.setCookie', {
      name: cookie.name, value: cookie.value, domain: new URL(origin).hostname, path: '/',
      url: `${origin}/`, secure: false, sameSite: 'Lax',
    });
    assertions.push({ name: 'auth-cookie-applied', pass: sameSiteCookie.success !== false });

    await send('Page.navigate', { url: `${origin}/` });
    const deadline = Date.now() + 30000;
    let geometry = null;
    while (Date.now() < deadline) {
      await sleep(700);
      const evaluated = await send('Runtime.evaluate', { expression: VISIBLE_GEOMETRY_EXPRESSION, returnByValue: true });
      geometry = JSON.parse(evaluated.result.value);
      if (isAppReady(geometry)) break;
    }
    assertions.push({ name: 'app-dom-mounted', pass: Boolean(geometry && geometry.bodyTextLength > 0), geometry });
    assertions.push({
      name: 'visible-geometry-positive',
      pass: isAppReady(geometry),
      largest: geometry ? geometry.largest : null,
      visibleCount: geometry ? geometry.visibleCount : 0,
    });

    const captured = await send('Page.captureScreenshot', { format: 'png' });
    const png = Buffer.from(captured.data, 'base64');
    assertPng(png);
    const screenshotPath = join(evidenceDir, 'app-home.png');
    writeFileSync(screenshotPath, png);
    assertions.push({
      name: 'screenshot-png-verified',
      pass: true,
      dimensions: geometry ? { width: geometry.vw, height: geometry.vh } : null,
      bytes: png.length,
    });
    return {
      cdpPort: cdpPort.value,
      assertions,
      geometry,
      screenshot: {
        path: screenshotPath,
        width: geometry ? geometry.vw : 0,
        height: geometry ? geometry.vh : 0,
        bytes: png.length,
      },
    };
  } finally {
    try { socket?.close(); } catch { /* 已关闭 */ }
    try { chrome?.kill('SIGTERM'); } catch { /* 已退出 */ }
  }
}

/**
 * 可测的运行器：编排逻辑与浏览器实现解耦，测试可注入桩。
 * @param {{io?: *, startEnv?: Function, driveBrowser?: Function, fetchImpl?: Function, now?: Function, uuid?: Function}} [deps]
 */
export function createAppQaRunner(deps = {}) {
  const io = deps.io ?? fs;
  const startEnv = deps.startEnv ?? startTestEnvironment;
  const driveBrowser = deps.driveBrowser ?? driveRealBrowser;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const uuid = deps.uuid ?? randomUUID;

  return async function runAppQa({ root, repo = repositoryRoot, mode = 'ui' } = {}) {
    const resolved = resolveWorktreeRoot(root, io, repo);
    if (!resolved.ok) {
      const error = new Error(resolved.code);
      error.code = resolved.code;
      error.hint = resolved.hint;
      error.rootReason = resolved.reason;
      throw error;
    }
    const runId = uuid();
    const startedAt = now().toISOString();
    const evidenceDir = join(root, '.workbuddy/evidence/app-qa', runId);
    io.mkdirSync(evidenceDir, { recursive: true });

    const report = {
      runId, mode, root, origin: null, appPort: null, cdpPort: null,
      startedAt, completedAt: null, pass: false,
      summary: null, assertions: [], screenshot: null, errors: [], cleanup: null,
    };
    let env;
    try {
      env = await startEnv({ root, mode });
      report.origin = env.origin;
      report.appPort = Number(new URL(env.origin).port);
      report.summary = env.summary;
      report.assertions.push({ name: 'app-runtime-ready', pass: true, origin: env.origin, evidenceLevel: env.summary?.evidenceLevel });

      // 同源 token→Cookie：只在内存中传递，绝不落盘或打印。
      const loginResponse = await fetchImpl(env.loginUrl, { redirect: 'manual' });
      const rawCookie = loginResponse.headers.getSetCookie()[0] ?? '';
      const cookieName = rawCookie.split('=')[0];
      const cookieValue = rawCookie.split(';')[0].slice(cookieName.length + 1);
      if (!cookieName || !cookieValue) throw new Error('TEST_APP_QA_LOGIN_COOKIE');
      report.assertions.push({ name: 'same-origin-login', pass: loginResponse.status === 303, status: loginResponse.status, cookieName });

      const browser = await driveBrowser({ origin: env.origin, cookie: { name: cookieName, value: cookieValue }, evidenceDir, io });
      report.cdpPort = browser.cdpPort;
      report.assertions.push(...browser.assertions);
      report.screenshot = browser.screenshot;
      report.pass = report.assertions.every(assertion => assertion.pass);
    } catch (error) {
      report.errors.push(error?.code ?? error?.message ?? 'unknown');
      if (error?.hint) report.hint = error.hint;
    } finally {
      if (env?.cleanup) {
        try { report.cleanup = await env.cleanup(); } catch (error) { report.errors.push(error?.code ?? 'TEST_APP_QA_CLEANUP'); }
      }
      report.completedAt = now().toISOString();
      io.writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
      const summaryPath = join(root, 'docs/evidence/worktree-app-qa-report.json');
      io.mkdirSync(dirname(summaryPath), { recursive: true });
      io.writeFileSync(summaryPath, JSON.stringify(report, null, 2) + '\n');
    }
    return report;
  };
}

export const runWorktreeAppQa = createAppQaRunner();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await runWorktreeAppQa({ root: sourceRoot });
    const failed = report.assertions.filter(assertion => !assertion.pass).map(assertion => assertion.name);
    if (report.pass) {
      console.log(`✅ 应用级 Web 验收通过（${report.assertions.length} 项断言，端口 ${report.appPort}，CDP ${report.cdpPort}）`);
      console.log(`   截图: ${report.screenshot?.path} (${report.screenshot?.width}x${report.screenshot?.height}, ${report.screenshot?.bytes} 字节)`);
      console.log('   证据: docs/evidence/worktree-app-qa-report.json');
    } else {
      console.error(`❌ 应用级 Web 验收未通过 -> ${[...report.errors, ...failed].join('; ')}`);
      if (report.hint) console.error(`   原因: ${report.hint}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`❌ 无法开始：${error.message}`);
    if (error.hint) console.error(`   ${error.hint}`);
    process.exitCode = 1;
  }
}
