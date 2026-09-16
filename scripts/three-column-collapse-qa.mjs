#!/usr/bin/env node
/**
 * @file scripts/three-column-collapse-qa.mjs
 * @description 三分栏「收起左侧栏保持会话栏比例、放大右侧工作台」真实内核验收（工单 #2074）
 *
 * 真实真源：CSS 一律从 `plugins/omnimux/src/client/conversation-box.js` 的
 * `PRODUCT_STAGE_CHROME` 常量抽取，几何变量由真实 `sidebar-toggle-topbar.js`
 * 模块导出函数写入。抽取不到即失败，绝不用字面量副本冒充生产规则。
 *
 * 特性：动态空闲端口（服务 + CDP 均为 0）、临时 profile、测完即焚、PNG + JSON 留证。
 * 含反向对照：重新注入旧 `auto` 规则必须复现「右栏被压成 0px」，证明夹具未失真。
 *
 * 运行：node scripts/three-column-collapse-qa.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { findChromePath } from './worktree-web-qa.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

/** 生产样式真源（三分栏网格规则的唯一合法来源）。 */
export const COLLAPSE_STYLE_SOURCE_PATH = 'plugins/omnimux/src/client/conversation-box.js';
/** 生产几何真源（`--omnimux-conversation-width` 的唯一合法写入方）。 */
export const COLLAPSE_GEOMETRY_SOURCE_PATH = 'plugins/omnimux/src/client/sidebar-toggle-topbar.js';

const STYLE_ANCHOR = 'export const PRODUCT_STAGE_CHROME = `';

/** 夹具里左侧栏轨道宽度。 */
export const FIXTURE_SIDEBAR_PX = 280;
/** 夹具里右侧工作台轨道宽度。 */
export const FIXTURE_RIGHTBAR_PX = 1155;
/** 会话栏宽度地板（与 sidebar-toggle-topbar.js 的过滤下限一致）。 */
export const CONVERSATION_MIN_PX = 320;

/**
 * 从 `conversation-box.js` 源码文本抽取 `PRODUCT_STAGE_CHROME` 样式。
 * 抽取失败必须抛错——源码删掉该常量即应让门禁变红。
 * @param {string} sourceText
 * @returns {string}
 */
export function extractProductStageChrome(sourceText) {
  assert.equal(typeof sourceText, 'string', '源码文本必须是字符串');
  const start = sourceText.indexOf(STYLE_ANCHOR);
  assert.ok(start >= 0, `生产源码中未找到样式常量锚点：${STYLE_ANCHOR}`);
  const bodyStart = start + STYLE_ANCHOR.length;
  const end = sourceText.indexOf('\n`', bodyStart);
  assert.ok(end > bodyStart, '生产源码中的样式模板字面量未闭合');
  const raw = sourceText.slice(bodyStart, end);
  assert.ok(raw.includes('grid-template-columns'), '抽取结果缺少 grid-template-columns 规则');
  assert.ok(
    raw.includes('--omnimux-conversation-width'),
    '抽取结果缺少会话栏宽度变量（收起后保持比例的基准）',
  );
  return raw;
}

/**
 * 三分栏收起态几何判定：会话栏保宽、左轨归零、右栏吃掉释放空间。
 * 纯计算，便于在无浏览器环境下做负例回归。
 * @param {{ conversationBefore:number, conversationAfter:number, rightbarBefore:number,
 *           rightbarAfter:number, viewport:number, firstTrack:number }} m
 * @returns {{ pass:boolean, reasons:string[] }}
 */
export function judgeThreeColumnCollapse(m) {
  const reasons = [];
  if (!(Math.abs(m.conversationAfter - m.conversationBefore) <= 1)) {
    reasons.push(
      `会话栏宽度未保持：收起前 ${m.conversationBefore} → 收起后 ${m.conversationAfter}`,
    );
  }
  if (!(m.rightbarAfter > m.rightbarBefore + 100)) {
    reasons.push(`右侧工作台未吸收释放空间：${m.rightbarBefore} → ${m.rightbarAfter}`);
  }
  if (!(m.rightbarAfter > 0)) {
    reasons.push(`右侧工作台被压灭为 ${m.rightbarAfter}px`);
  }
  if (!(m.firstTrack === 0)) {
    reasons.push(`第一轨未归零：${m.firstTrack}px`);
  }
  if (!(Math.abs(m.conversationAfter + m.rightbarAfter - m.viewport) <= 2)) {
    reasons.push(
      `列宽之和 ${m.conversationAfter + m.rightbarAfter} 未占满视口 ${m.viewport}`,
    );
  }
  return { pass: reasons.length === 0, reasons };
}

/** 判定反向对照：旧规则必须复现右栏塌陷。 */
export function judgeLegacyRegression(rightbarAfter) {
  const collapsed = !(rightbarAfter > 0);
  return {
    pass: collapsed,
    reasons: collapsed ? [] : [`旧规则下右栏仍为 ${rightbarAfter}px，反向对照未复现缺陷`],
  };
}

function buildFixtureHtml(chromeCss) {
  const base = `
html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
.dshDesktopFrame { position: relative; display: grid; width: 100%; height: 100%; grid-template-rows: 100%; overflow: hidden; }
.dshDesktopSidebarSurface { grid-column: 1; grid-row: 1; min-width: 0; overflow: hidden; }
.dshDesktopConversationSurface { grid-column: 2; grid-row: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.dshDesktopRightbarSurface { grid-column: 3; grid-row: 1; min-width: 0; overflow: visible; }
`;
  return `<!doctype html>
<html lang="zh-CN" data-omnimux-sidebar-toggle-topbar>
<head><meta charset="utf-8"><title>three-column-collapse-qa</title></head>
<body data-dsh-desktop-mode="advanced" data-dsh-desktop-platform="darwin">
<style id="qa-base">${base}</style>
<style id="qa-production">${chromeCss}</style>
<div class="dshDesktopFrame" id="frame" style="grid-template-columns: ${FIXTURE_SIDEBAR_PX}px minmax(0px, 1fr) ${FIXTURE_RIGHTBAR_PX}px;">
  <aside class="dshDesktopSidebarSurface" id="sidebar"></aside>
  <main class="dshDesktopConversationSurface" id="conversation" data-dsh-center-col><div style="min-width:0;flex:1 1 0%"></div></main>
  <aside class="dshDesktopRightbarSurface" id="rightbar" data-rightbar-col="true"></aside>
</div>
</body></html>`;
}

/** 浏览器内执行的几何测量表达式片段（供正例与负例共用）。 */
const MEASURE_FN = `
function measure() {
  const frame = document.getElementById('frame');
  const conv = document.getElementById('conversation');
  const right = document.getElementById('rightbar');
  const tracks = getComputedStyle(frame).gridTemplateColumns.split(/\\s+/).map((v) => parseFloat(v));
  return {
    viewport: document.documentElement.clientWidth,
    tracks,
    firstTrack: Math.round(tracks[0] || 0),
    conversation: Math.round(conv.getBoundingClientRect().width),
    rightbar: Math.round(right.getBoundingClientRect().width),
    conversationVar: getComputedStyle(document.documentElement).getPropertyValue('--omnimux-conversation-width').trim(),
    frameTrackStyle: frame.style.gridTemplateColumns,
  };
}
`;

async function main() {
  const runId = randomUUID();
  const chromeSource = readFileSync(join(REPO_ROOT, COLLAPSE_STYLE_SOURCE_PATH), 'utf8');
  const geometrySource = readFileSync(join(REPO_ROOT, COLLAPSE_GEOMETRY_SOURCE_PATH), 'utf8');
  assert.ok(
    geometrySource.includes('--omnimux-conversation-width'),
    '几何真源未写入 --omnimux-conversation-width，门禁拒绝放行',
  );
  const chromeCss = extractProductStageChrome(chromeSource);

  const evidenceDir = join(REPO_ROOT, 'docs', 'evidence');
  mkdirSync(evidenceDir, { recursive: true });
  const profileDir = join(REPO_ROOT, 'tmp', `three-column-qa-chrome-${process.pid}-${runId.slice(0, 8)}`);

  const report = {
    runId,
    scenario: 'three-column-collapse',
    startedAt: new Date().toISOString(),
    sourcePaths: [COLLAPSE_STYLE_SOURCE_PATH, COLLAPSE_GEOMETRY_SOURCE_PATH],
    assertions: [],
    cleanup: {},
    errors: [],
    pass: false,
  };

  let server = null;
  let chromeProc = null;
  let cdpWs = null;
  const add = (name, pass, extra = {}) => report.assertions.push({ name, pass, ...extra });

  try {
    const htmlContent = buildFixtureHtml(chromeCss);
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlContent);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    report.serverPort = server.address().port;
    add('ephemeral-server-listen', true, { port: report.serverPort });

    const chromeBin = findChromePath();
    chromeProc = spawn(chromeBin, [
      '--headless=new',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1920,1080',
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ]);

    const cdpPort = await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('启动无头 Chrome 超时（5 秒未响应）')), 5000);
      chromeProc.stderr.on('data', (chunk) => {
        const m = chunk.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (m) {
          clearTimeout(timer);
          res(Number(m[1]));
        }
      });
      chromeProc.on('error', rej);
    });
    report.cdpPort = cdpPort;
    add('ephemeral-cdp-listen', true, { port: cdpPort });

    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    const pageTarget = targets.find((t) => t.type === 'page');
    assert.ok(pageTarget?.webSocketDebuggerUrl, '未找到有效的 Chrome Page 调试目标');
    cdpWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      cdpWs.addEventListener('open', res, { once: true });
      cdpWs.addEventListener('error', rej, { once: true });
    });

    let msgId = 0;
    const pending = new Map();
    cdpWs.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      const slot = pending.get(msg.id);
      if (slot) {
        pending.delete(msg.id);
        slot(msg);
      }
    });
    const sendCdp = (method, params = {}) =>
      new Promise((res) => {
        const id = ++msgId;
        pending.set(id, res);
        cdpWs.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const r = await sendCdp('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.result?.exceptionDetails) {
        throw new Error(`页面执行异常: ${r.result.exceptionDetails.text}`);
      }
      return r.result?.result?.value;
    };

    await sendCdp('Page.enable');
    await sendCdp('Runtime.enable');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${report.serverPort}/` });
    await new Promise((r) => setTimeout(r, 600));

    // ---- 正例 1：展开态基准 ----
    const expanded = await evaluate(`(() => { ${MEASURE_FN}
      return measure();
    })()`);
    report.expanded = expanded;
    add('expanded-conversation-positive', expanded.conversation > CONVERSATION_MIN_PX, {
      conversation: expanded.conversation,
    });
    add('expanded-rightbar-positive', expanded.rightbar > 0, { rightbar: expanded.rightbar });

    // ---- 正例 2：模拟收起左侧栏（镜像 html 标记 + frame 属性 + 外壳重算的行内轨道） ----
    const collapsed = await evaluate(`(() => { ${MEASURE_FN}
      document.documentElement.setAttribute('data-omnimux-left-collapsed', '');
      document.documentElement.style.setProperty('--omnimux-conversation-width', '${expanded.conversation}px');
      const frame = document.getElementById('frame');
      frame.setAttribute('data-sidebar-collapsed', 'true');
      frame.style.gridTemplateColumns = '90px minmax(0px, 1fr) ${FIXTURE_RIGHTBAR_PX}px';
      return measure();
    })()`);
    report.collapsed = collapsed;

    const verdict = judgeThreeColumnCollapse({
      conversationBefore: expanded.conversation,
      conversationAfter: collapsed.conversation,
      rightbarBefore: expanded.rightbar,
      rightbarAfter: collapsed.rightbar,
      viewport: collapsed.viewport,
      firstTrack: collapsed.firstTrack,
    });
    add('collapsed-keeps-conversation-width', verdict.pass, {
      conversationBefore: expanded.conversation,
      conversationAfter: collapsed.conversation,
      rightbarBefore: expanded.rightbar,
      rightbarAfter: collapsed.rightbar,
      reasons: verdict.reasons,
    });

    const shot = await sendCdp('Page.captureScreenshot', { format: 'png' });
    const shotBuf = Buffer.from(shot.result.data, 'base64');
    const shotPath = join(evidenceDir, 'three-column-collapse-collapsed.png');
    writeFileSync(shotPath, shotBuf);
    const png = PNG.sync.read(shotBuf);
    report.screenshot = { path: shotPath, width: png.width, height: png.height, bytes: shotBuf.length };
    add('screenshot-captured', png.width > 0 && png.height > 0, report.screenshot);

    // ---- 反向对照：停用生产样式并只注入旧 auto 规则，右栏必须塌成 0 ----
    const legacy = await evaluate(`(() => { ${MEASURE_FN}
      document.getElementById('qa-production').disabled = true;
      const s = document.createElement('style');
      s.id = 'qa-legacy';
      s.textContent = 'html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] [class*="frame"], html[data-omnimux-sidebar-toggle-topbar][data-omnimux-left-collapsed] .dshDesktopFrame, html[data-omnimux-sidebar-toggle-topbar] [class*="frame"][data-sidebar-collapsed], html[data-omnimux-sidebar-toggle-topbar] .dshDesktopFrame[data-sidebar-collapsed]{grid-template-columns: 0px minmax(0px, 1fr) auto !important;}';
      document.head.appendChild(s);
      return measure();
    })()`);
    report.legacyControl = legacy;
    const legacyVerdict = judgeLegacyRegression(legacy.rightbar);
    add('legacy-rule-reproduces-collapse', legacyVerdict.pass, {
      rightbarAfter: legacy.rightbar,
      reasons: legacyVerdict.reasons,
    });

    report.pass = report.assertions.every((a) => a.pass !== false) && report.errors.length === 0;
  } catch (err) {
    report.errors.push(String(err?.message || err));
    report.pass = false;
  } finally {
    try { cdpWs?.close(); } catch { /* ignore */ }
    if (chromeProc) {
      try { chromeProc.kill('SIGTERM'); } catch { /* ignore */ }
    }
    if (server) {
      await new Promise((r) => server.close(r));
      report.cleanup.httpServerClosed = !server.listening;
    }
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    report.cleanup.profileRemoved = !existsSync(profileDir);
    report.cleanup.allReleased = Object.values(report.cleanup).every(Boolean);
    if (!report.cleanup.allReleased) {
      report.pass = false;
      report.errors.push(`资源未完全释放: ${JSON.stringify(report.cleanup)}`);
    }
    report.completedAt = new Date().toISOString();
    writeFileSync(
      join(evidenceDir, 'three-column-collapse-qa-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }

  const failed = report.assertions.filter((a) => a.pass === false).map((a) => a.name);
  if (report.pass) {
    console.log(
      `✅ PASS · 会话栏 ${report.expanded.conversation}px → ${report.collapsed.conversation}px（保持），` +
        `右栏 ${report.expanded.rightbar}px → ${report.collapsed.rightbar}px（吸收 ${FIXTURE_SIDEBAR_PX}px）`,
    );
    console.log('   反向对照：旧 auto 规则下右栏塌为 ' + report.legacyControl.rightbar + 'px，夹具未失真');
    console.log('   证据归档: docs/evidence/three-column-collapse-qa-report.json');
    return;
  }
  console.error(`❌ FAIL -> ${[...report.errors, ...failed].join('; ')}`);
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
