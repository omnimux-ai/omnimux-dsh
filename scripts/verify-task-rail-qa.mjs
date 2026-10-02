#!/usr/bin/env node
/**
 * @file scripts/verify-task-rail-qa.mjs
 * @description Issue #2964 任务刻度轨 · 工作树内真实浏览器验收
 *
 * 用与 worktree-web-qa.mjs 相同的隔离纪律（ephemeral 端口、无头 Chrome、
 * CDP 驱动、自带静态服务、测完即焚），对 tests/harness 的 taskrail 页做
 * 功能路径验收：刻度三态、悬停预览、点击定位落点高亮、排队坞展示。
 *
 * 用法：
 *   node scripts/verify-task-rail-qa.mjs
 *   THEME=dark node scripts/verify-task-rail-qa.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { findChromePath } from './worktree-web-qa.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const HARNESS_DIST = join(REPO, 'plugins/omnimux-browser/extension/tests/harness/dist');
const EVIDENCE = join(REPO, '.agent-reports/task-rail-qa');
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';
const WIDTH = 400;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.json': 'application/json', '.svg': 'image/svg+xml' };

function serveStatic(root) {
  return new Promise((resolveServer) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      const file = join(root, url.pathname === '/' ? 'taskrail.html' : url.pathname);
      if (!file.startsWith(root) || !existsSync(file)) {
        res.writeHead(404); res.end('nf'); return;
      }
      const ext = file.slice(file.lastIndexOf('.'));
      res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
      res.end(readFileSafe(file));
    });
    server.listen(0, '127.0.0.1', () => resolveServer({ server, port: server.address().port }));
  });
}
function readFileSafe(p) { try { return readFileSync(p); } catch { return Buffer.alloc(0); } }

function assertPng(buf) {
  assert.ok(buf.length > 8, 'screenshot too small');
  const png = new PNG({ width: 0, height: 0 });
  // PNG magic
  assert.equal(buf.readUInt32BE(0), 0x89504e47, 'not a png');
  return buf;
}

async function main() {
  assert.ok(existsSync(HARNESS_DIST), `harness dist 未构建：${HARNESS_DIST}（先跑 pnpm run build:harness）`);
  mkdirSync(EVIDENCE, { recursive: true });
  const { server, port } = await serveStatic(HARNESS_DIST);

  const profileDir = join(REPO, '.tmp', `taskrail-qa-${Date.now()}`);
  mkdirSync(profileDir, { recursive: true });
  const chromeProc = spawn(findChromePath(), [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${WIDTH + 80},620`,
    'about:blank',
  ]);

  const report = { page: `taskrail.html?theme=${THEME}&width=${WIDTH}`, assertions: [], shots: [] };
  const cdpPort = await new Promise((resolvePort, reject) => {
    const portFile = join(profileDir, 'DevToolsActivePort');
    const timer = setTimeout(() => reject(new Error('CDP port timeout')), 25000);
    const poll = setInterval(() => {
      try {
        if (!existsSync(portFile)) return;
        const p = Number(readFileSync(portFile, 'utf8').split('\n')[0].trim());
        if (p > 0) { clearInterval(poll); clearTimeout(timer); resolvePort(p); }
      } catch {}
    }, 120);
  });

  let cdpWs;
  try {
    const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
    const pageTarget = targets.find((t) => t.type === 'page');
    cdpWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let msgId = 0;
    const sendCdp = (method, params = {}) => new Promise((res, rej) => {
      const id = ++msgId;
      const onMsg = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id === id) { cdpWs.removeEventListener('message', onMsg); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result || m); }
      };
      cdpWs.addEventListener('message', onMsg);
      cdpWs.send(JSON.stringify({ id, method, params }));
    });
    await new Promise((res, rej) => { cdpWs.addEventListener('open', res); cdpWs.addEventListener('error', rej); });
    await sendCdp('Page.enable');
    await sendCdp('Runtime.enable');
    await sendCdp('Page.navigate', { url: `http://127.0.0.1:${port}/taskrail.html?theme=${THEME}&width=${WIDTH}` });
    await new Promise((r) => setTimeout(r, 900));

    const evalJson = async (expr) => {
      const res = await sendCdp('Runtime.evaluate', { expression: `JSON.stringify(${expr})`, returnByValue: true });
      return JSON.parse(res.result.value);
    };
    const shot = async (name) => {
      const data = await sendCdp('Page.captureScreenshot', { format: 'png' });
      const buf = assertPng(Buffer.from(data.data, 'base64'));
      const path = join(EVIDENCE, name);
      writeFileSync(path, buf);
      report.shots.push(path);
    };

    // 1) 刻度轨存在且刻度数量 = 4 轮 + 2 排队
    const rail = await evalJson(`(() => {
      const rail = document.querySelector('.turn-rail');
      const marks = [...document.querySelectorAll('.turn-rail-mark')];
      const rect = rail?.getBoundingClientRect();
      return {
        exists: !!rail,
        count: marks.length,
        busy: marks.filter(m => m.classList.contains('is-busy')).length,
        queued: marks.filter(m => m.classList.contains('is-queued')).length,
        active: marks.filter(m => m.classList.contains('is-active')).length,
        railWidth: rect?.width ?? 0,
        railRight: rect ? Math.round(rect.right) : null,
      };
    })()`);
    report.rail = rail;
    assert.equal(rail.exists, true, 'turn-rail 未渲染');
    assert.equal(rail.count, 6, `刻度数应为 6（4 轮 + 2 排队），实际 ${rail.count}`);
    assert.equal(rail.busy, 1, '进行中刻度应为 1');
    assert.equal(rail.queued, 2, '排队刻度应为 2');
    report.assertions.push({ name: 'rail-marks-states', pass: true });

    // 2) 悬停出现预览卡（真实 hover）
    const markBox = await evalJson(`(() => {
      const m = document.querySelectorAll('.turn-rail-mark')[0];
      const r = m.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await sendCdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: markBox.x, y: markBox.y });
    await new Promise((r) => setTimeout(r, 350));
    const preview = await evalJson(`(() => {
      const p = document.querySelector('.turn-rail-preview');
      if (!p) return { exists: false };
      return {
        exists: true,
        prompt: p.querySelector('.turn-rail-preview-prompt')?.textContent ?? '',
        response: p.querySelector('.turn-rail-preview-response')?.textContent ?? '',
        status: p.querySelector('.turn-rail-preview-status')?.textContent ?? '',
      };
    })()`);
    report.preview = preview;
    assert.equal(preview.exists, true, '悬停未出现预览卡');
    assert.match(preview.prompt, /总结/, '预览卡首行应为该轮用户语');
    report.assertions.push({ name: 'hover-preview', pass: true });
    await shot('taskrail-hover-preview.png');

    // 3) 点击刻度 → 定位该轮首个 assistant 行并高亮
    await sendCdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: markBox.x, y: markBox.y, button: 'left', clickCount: 1 });
    await sendCdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: markBox.x, y: markBox.y, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 500));
    const landed = await evalJson(`(() => {
      const flashed = document.querySelector('.row.landed-flash');
      const dataTurn = flashed?.dataset.turn ?? null;
      const scrollTop = document.querySelector('.messages')?.scrollTop ?? 0;
      return { dataTurn, scrollTop, flashed: !!flashed };
    })()`);
    report.landed = landed;
    assert.equal(landed.flashed, true, '点击后未见落点高亮');
    assert.equal(landed.dataTurn, '1', '落点应定位到 turn=1 的行');
    report.assertions.push({ name: 'click-locate', pass: true });
    await shot('taskrail-locate-flash.png');

    // 4) 排队坞：官方同款折叠面板——默认收起只显示「N 条排队消息」头部
    const dockCollapsed = await evalJson(`(() => {
      const panel = document.querySelector('.queue-dock-panel');
      const header = document.querySelector('.queue-dock-header');
      const count = document.querySelector('.queue-dock-count')?.textContent ?? '';
      const list = document.querySelector('.queue-dock-list');
      const lead = document.querySelector('.queue-dock-header .queue-dock-lead svg');
      return {
        panel: !!panel,
        header: !!header,
        count,
        listVisible: !!list,
        icon: !!lead,
        expanded: header?.getAttribute('aria-expanded') ?? null,
      };
    })()`);
    report.dockCollapsed = dockCollapsed;
    assert.equal(dockCollapsed.panel, true, '排队坞面板未渲染');
    assert.equal(dockCollapsed.header, true, '多条排队应有可折叠头部');
    assert.match(dockCollapsed.count, /2.*(排队|queued)/i, '头部应显示「2 条排队消息」');
    assert.equal(dockCollapsed.listVisible, false, '默认应收起队列列表');
    assert.equal(dockCollapsed.icon, true, '头部应显示队列图标');
    report.assertions.push({ name: 'queue-dock-collapsed', pass: true });
    await shot('taskrail-queue-dock-collapsed.png');

    // 5) 点击头部展开 → 列表行 + 分隔线 + 行内编辑/删除按钮
    const headerBox = await evalJson(`(() => {
      const r = document.querySelector('.queue-dock-header').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await sendCdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: headerBox.x, y: headerBox.y, button: 'left', clickCount: 1 });
    await sendCdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: headerBox.x, y: headerBox.y, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 300));
    const dockExpanded = await evalJson(`(() => {
      const rows = [...document.querySelectorAll('.queue-dock-row')];
      const sep = rows.length > 1 ? getComputedStyle(rows[1]).boxShadow : 'none';
      return {
        rows: rows.length,
        texts: rows.map((r) => r.querySelector('.queue-dock-preview')?.textContent ?? ''),
        sepWidth: sep,
        actions: rows[0] ? [...rows[0].querySelectorAll('.queue-dock-action')].map((b) => b.getAttribute('aria-label') ?? '') : [],
      };
    })()`);
    report.dockExpanded = dockExpanded;
    assert.equal(dockExpanded.rows, 2, '展开后应有 2 行');
    assert.match(dockExpanded.texts[0] ?? '', /回复角度/, '第一行应为排队任务文本');
    assert.match(dockExpanded.sepWidth, /inset.*0px 1px|1px.*inset|inset 0(px)? 1px/, '行之间应有 1px inset 分隔线');
    assert.equal(dockExpanded.actions.length, 2, '每行应有编辑/删除两个操作钮');
    report.assertions.push({ name: 'queue-dock-expanded', pass: true });
    await shot('taskrail-queue-dock-expanded.png');

    // 6) 点击删除 → 真实 rpc session.updateQueue{kind:'remove'}，行数减 1
    const removeBox = await evalJson(`(() => {
      const b = [...document.querySelectorAll('.queue-dock-row')][0].querySelectorAll('.queue-dock-action')[1];
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await sendCdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: removeBox.x, y: removeBox.y, button: 'left', clickCount: 1 });
    await sendCdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: removeBox.x, y: removeBox.y, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 300));
    const afterRemove = await evalJson(`(() => {
      const rows = [...document.querySelectorAll('.queue-dock-row')];
      const rpc = window.__harnessRpc ?? [];
      const last = rpc[rpc.length - 1];
      return { rows: rows.length, method: last?.method ?? '', kind: last?.payload?.action?.kind ?? '' };
    })()`);
    report.afterRemove = afterRemove;
    assert.equal(afterRemove.method, 'session.updateQueue', '删除应走 session.updateQueue');
    assert.equal(afterRemove.kind, 'remove', '动作应为 remove');
    assert.equal(afterRemove.rows, 1, '删除后应剩 1 行');
    report.assertions.push({ name: 'queue-dock-remove', pass: true });
    await shot('taskrail-queue-dock.png');

    writeFileSync(join(EVIDENCE, 'report.json'), JSON.stringify(report, null, 2));
    console.log('PASS', JSON.stringify({ assertions: report.assertions.length, shots: report.shots }, null, 2));
  } finally {
    chromeProc.kill('SIGKILL');
    cdpWs?.close();
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('TASK_RAIL_QA_FAIL', error);
  process.exit(1);
});
