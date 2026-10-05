#!/usr/bin/env node
/**
 * scripts/dev-smoke.mjs
 *
 * 物化后开发版冒烟：确认运行中的 OmniMux Dev 窗口真实可达、页面健康，
 * 并对本次物化的插件做「运行中版本 vs 物化版本」时差检测。
 *
 * 设计原则：CDP 只读（不写 localStorage、不提交表单、不触发业务）；
 * 绝不自动重启应用——检测到「运行中进程早于物化写入」时输出 needs-restart 提示。
 *
 * 用法：
 *   node scripts/dev-smoke.mjs                      # 只验 Dev 可达与页面健康
 *   node scripts/dev-smoke.mjs --plugins omnimux-assets
 *   node scripts/dev-smoke.mjs --plugins a,b --expect-restart
 *
 * 退出码：0=PASS / 1=FAIL / 0 且 needsRestart=true=待人工重启 / 2=BLOCKED（应用未运行或调试口不可达）
 */
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CDP_PORT = Number(process.env.OMNIMUX_CDP_PORT || process.env.OMNIMUX_DEV_CDP_PORT || 9229);
const DEV_PAGE_PORT = 45120;
const DEV_MAIN_BUNDLE = '/Applications/OmniMux Dev.app/Contents/MacOS/OmniMux';
const DEV_PROFILE_PLUGINS = join(homedir(), '.omnimux-dev', 'profiles', 'omnimux', 'node_modules');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @returns {Promise<unknown[] | null>} */
function probeCdpTargets(port = CDP_PORT, io = { get: (u, cb) => http.get(u, cb) }) {
  return new Promise((resolve) => {
    const req = io.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(1500, () => { req.destroy(); resolve(null); });
  });
}

function evaluateInPage(wsUrl, expression, timeoutMs = 5000) {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(wsUrl);
      let settled = false;
      const finish = (value) => { if (!settled) { settled = true; clearTimeout(timer); try { ws.close(); } catch {} resolve(value); } };
      const timer = setTimeout(() => finish({ ok: false, error: 'CDP evaluate timed out' }), timeoutMs);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (data.id === 1) finish({ ok: true, result: data?.result?.result?.value });
        } catch (e) { finish({ ok: false, error: e.message }); }
      };
      ws.onerror = (e) => finish({ ok: false, error: e?.message || 'WebSocket error' });
    } catch (e) { resolve({ ok: false, error: e?.message || String(e) }); }
  });
}

function captureScreenshot(wsUrl, timeoutMs = 8000) {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(wsUrl);
      let settled = false;
      const finish = (value) => { if (!settled) { settled = true; clearTimeout(timer); try { ws.close(); } catch {} resolve(value); } };
      const timer = setTimeout(() => finish({ ok: false, error: 'screenshot timed out' }), timeoutMs);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (data.id === 1) finish({ ok: true, data: data?.result?.data });
        } catch (e) { finish({ ok: false, error: e.message }); }
      };
      ws.onerror = (e) => finish({ ok: false, error: e?.message || 'WebSocket error' });
    } catch (e) { resolve({ ok: false, error: e?.message || String(e) }); }
  });
}

/** Dev 主进程启动时间（秒）。找不到进程返回 null。 */
function devProcessStartEpochSec(spawnImpl = spawnSync) {
  const out = spawnImpl('pgrep', ['-f', DEV_MAIN_BUNDLE], { encoding: 'utf8' });
  const pid = String(out.stdout || '').split('\n').filter(Boolean)[0];
  if (!pid) return null;
  const ps = spawnImpl('ps', ['-p', pid, '-o', 'lstart='], { encoding: 'utf8' });
  const str = String(ps.stdout || '').trim();
  if (!str) return null;
  const t = Date.parse(str);
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

/** 物化目录里插件包内最新文件 mtime（秒，扫源码/清单，深度受限防爆量）。不存在返回 null。 */
function pluginMaterializedMtimeSec(plugin, profilePlugins = DEV_PROFILE_PLUGINS, io = { statSync, readdirSync }) {
  const dir = join(profilePlugins, plugin);
  let newest = 0;
  const stack = [dir];
  let visited = 0;
  while (stack.length && visited < 2000) {
    const cur = stack.pop();
    let entries;
    try { entries = io.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(cur, e.name);
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && e.name !== 'node_modules') stack.push(p);
      } else {
        visited++;
        try {
          const m = io.statSync(p).mtimeMs;
          if (m > newest) newest = m;
        } catch {}
      }
    }
  }
  return newest ? Math.floor(newest / 1000) : null;
}

export function createDevSmoke(deps = {}) {
  const io = deps.io ?? { statSync, readdirSync, existsSync, mkdirSync, writeFileSync };
  const fetchTargets = deps.probeCdp ?? probeCdpTargets;
  const evalPage = deps.evaluateInPage ?? evaluateInPage;
  const shoot = deps.captureScreenshot ?? captureScreenshot;
  const psStart = deps.devProcessStart ?? devProcessStartEpochSec;
  const mtimeOf = deps.pluginMtime ?? pluginMaterializedMtimeSec;
  const uuid = deps.uuid ?? randomUUID;
  const now = deps.now ?? (() => new Date());

  return async function runDevSmoke({ plugins = [], evidenceRoot = sourceRoot } = {}) {
    const runId = uuid();
    const evidenceDir = join(evidenceRoot, 'docs', 'evidence', `dev-smoke-${runId}`);
    const reportPath = join(evidenceRoot, 'docs', 'evidence', 'dev-smoke-report.json');
    const report = {
      runId, startedAt: now().toISOString(), completedAt: null,
      cdpPort: CDP_PORT, pageUrl: null, plugins,
      status: 'failed', needsRestart: false, blockedReason: null,
      assertions: [], screenshot: null, restartHint: null,
    };
    const push = (name, pass, detail) => { report.assertions.push({ name, pass, detail }); return pass; };

    try {
      const targets = await fetchTargets(CDP_PORT);
      if (!Array.isArray(targets) || targets.length === 0) {
        report.status = 'blocked';
        report.blockedReason = `CDP ${CDP_PORT} 无目标：Dev 应用未运行或调试口未开（不算 PASS，也不误报失败）`;
        push('cdp-targets', false, report.blockedReason);
        return report;
      }
      push('cdp-targets', true, `${targets.length} targets`);
      // 只认 :45120 页面——别的 page 不能冒充 Dev 窗口。
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl && String(t.url).includes(`:${DEV_PAGE_PORT}`));
      if (!page) {
        report.status = 'blocked';
        report.blockedReason = 'CDP 有目标但无 :45120 页面';
        push('dev-page', false, report.blockedReason);
        return report;
      }
      report.pageUrl = page.url;

      const geo = await evalPage(page.webSocketDebuggerUrl,
        `JSON.stringify({title:document.title, bodyLen:(document.body?.innerText||'').length, readyState:document.readyState})`);
      if (!geo.ok) { push('page-health', false, geo.error); }
      else {
        const g = JSON.parse(geo.result || '{}');
        push('page-health', g.readyState === 'complete' && g.bodyLen > 0, g);
      }

      const shot = await shoot(page.webSocketDebuggerUrl);
      if (shot.ok && shot.data) {
        const png = Buffer.from(shot.data, 'base64');
        io.mkdirSync(evidenceDir, { recursive: true });
        const shotPath = join(evidenceDir, 'dev-page.png');
        io.writeFileSync(shotPath, png);
        report.screenshot = { path: shotPath, bytes: png.length };
        push('screenshot', png.length > 1000, { bytes: png.length });
      } else {
        push('screenshot', false, shot.error || 'no data');
      }

      const startSec = psStart();
      push('dev-process', startSec !== null, startSec ? `pid lstart ${new Date(startSec * 1000).toISOString()}` : 'Dev 主进程未找到');

      const stale = [];
      for (const plugin of plugins) {
        const mtime = mtimeOf(plugin);
        if (mtime === null) { push(`plugin:${plugin}:materialized`, false, '物化包不存在'); continue; }
        push(`plugin:${plugin}:materialized`, true, { mtime });
        if (startSec !== null && mtime > startSec) stale.push(plugin);
      }
      if (stale.length > 0) {
        report.needsRestart = true;
        report.status = 'needs-restart';
        report.restartHint = `物化版本晚于运行中进程：${stale.join(', ')}。开发版有更新，请退出并重新打开 OmniMux Dev 生效（Agent 不自动重启）。`;
        push('version-freshness', false, report.restartHint);
      } else {
        push('version-freshness', true, plugins.length ? '所有物化插件均早于进程启动' : '未指定插件，跳过版本时差');
      }

      const allPass = report.assertions.every((a) => a.pass);
      if (report.status === 'failed') report.status = allPass ? 'pass' : 'fail';
      if (report.status === 'pass' && report.needsRestart) report.status = 'needs-restart';
    } catch (error) {
      report.status = 'fail';
      report.blockedReason = error?.message ?? String(error);
      push('unhandled', false, report.blockedReason);
    } finally {
      report.completedAt = now().toISOString();
      io.mkdirSync(dirname(reportPath), { recursive: true });
      io.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    }
    return report;
  };
}

export const runDevSmoke = createDevSmoke();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const pluginsArg = argv.find((a) => a.startsWith('--plugins='))?.split('=')[1]
    ?? (argv.includes('--plugins') ? argv[argv.indexOf('--plugins') + 1] : null);
  const plugins = pluginsArg ? pluginsArg.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const report = await runDevSmoke({ plugins });
  const tag = { pass: '✅', 'needs-restart': '⏳', blocked: '🚫', fail: '❌' }[report.status] ?? '❌';
  console.log(`${tag} dev-smoke status=${report.status}（${report.assertions.filter((a) => a.pass).length}/${report.assertions.length} 断言通过）`);
  if (report.screenshot) console.log(`   截图: ${report.screenshot.path} (${report.screenshot.bytes}B)`);
  console.log(`   报告: ${join(sourceRoot, 'docs', 'evidence', 'dev-smoke-report.json')}`);
  if (report.restartHint) console.warn(`   ${report.restartHint}`);
  if (report.blockedReason) console.warn(`   ${report.blockedReason}`);
  process.exitCode = { pass: 0, 'needs-restart': 0, blocked: 2, fail: 1 }[report.status] ?? 1;
}
