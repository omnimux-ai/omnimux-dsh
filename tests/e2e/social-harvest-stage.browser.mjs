/**
 * tests/e2e/social-harvest-stage.browser.mjs
 *
 * Issue #2426 工作树隔离浏览器 QA 驱动：
 * esbuild 打包真实 HarvestStage → 127.0.0.1 动态端口 → 无头 Chrome 取断言报告 + PNG 截图。
 * 证据落 docs/evidence/social-harvest-stage-qa.{png,json}，自清理临时产物。
 *
 * 依赖解析说明：工作树无 node_modules，react / dsh-ui-kit / ui-primitives
 * 一律向上解析主仓副本（工作树是 <repo>/.worktrees/<task>，向上两级即主仓）。
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..'); // 任务工作树根
const MAIN_ROOT = resolve(ROOT, '../..'); // 主仓（工作树向上两级）
const EVIDENCE_DIR = join(ROOT, 'docs/evidence');
const OUT_DIR = join(MAIN_ROOT, 'tmp/social-harvest-qa');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
  throw new Error('no chrome binary found');
}

// 宿主暗色主题 Token 快照（含 OmniMux 极光紫；宿主升级后需重新抽取）
const THEME_TOKENS = `
:root {
  --dsw-alias-bg-base: #111113;
  --dsw-alias-bg-layer-1: rgba(255,255,255,0.04);
  --dsw-alias-bg-layer-2: rgba(255,255,255,0.06);
  --dsw-alias-bg-elevated: #1c1c1f;
  --dsw-alias-bg-mask-1: rgba(0,0,0,0.55);
  --dsw-alias-label-primary: #ffffff;
  --dsw-alias-label-primary-inverted: #111827;
  --dsw-alias-label-secondary: rgba(255,255,255,0.72);
  --dsw-alias-label-tertiary: rgba(255,255,255,0.40);
  --dsw-alias-label-success: #4ade80;
  --dsw-alias-label-warning: #fbbf24;
  --dsw-alias-label-danger: #f87171;
  --dsw-alias-border-l1: rgba(255,255,255,0.06);
  --dsw-alias-border-l2: rgba(255,255,255,0.12);
  --dsw-alias-border: rgba(255,255,255,0.14);
  --dsw-alias-border-hover: rgba(255,255,255,0.22);
  --dsw-alias-brand-primary: #7961f2;
  --dsw-alias-state-business-tertiary: rgba(121,97,242,0.22);
  --dsw-alias-status-success: #4ade80;
  --dsw-alias-state-warn-primary: #fbbf24;
  --dsw-alias-state-error-primary: #f87171;
  --dsw-alias-interactive-bg-hover: rgba(255,255,255,0.08);
  --dsw-alias-interactive-bg-active: rgba(255,255,255,0.14);
  --dsw-alias-button-primary-fill: #ffffff;
  --dsw-alias-button-primary-hover: rgba(255,255,255,0.88);
}
body { margin: 0; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 13px; }
`;

async function bundle() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const wfModules = join(MAIN_ROOT, 'plugins/omnimux-workflow/node_modules');
  await esbuild.build({
    entryPoints: [join(__dirname, 'social-harvest-stage.harness.jsx')],
    outfile: join(OUT_DIR, 'bundle.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    loader: { '.css': 'css', '.svg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning',
    absWorkingDir: ROOT,
    nodePaths: [join(MAIN_ROOT, 'node_modules'), wfModules],
    // 插件包各自带 React 副本；单实例是 hooks 正常工作的前提
    alias: {
      react: join(wfModules, 'react'),
      'react-dom': join(wfModules, 'react-dom'),
      'dsh-ui-kit': join(MAIN_ROOT, '../..', 'personal/dsh-ui-kit/lib/index.js'),
      '@deepseek-ai/dsh-client-ui-primitives': join(wfModules, '@deepseek-ai/dsh-client-ui-primitives'),
    },
  });
  writeFileSync(
    join(OUT_DIR, 'index.html'),
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>QA</title>
<style>${THEME_TOKENS}</style></head>
<body><div id="root"></div>
<script>
function reportBootFailure(text) {
  var p = document.createElement('pre'); p.id = 'boot-error'; p.textContent = text; document.body.appendChild(p);
}
window.onerror = function (m, s, l) { reportBootFailure('ERR: ' + m + ' @ ' + s + ':' + l); };
window.onunhandledrejection = function (e) { reportBootFailure('REJ: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)); };
</script>
<script src="./bundle.js"></script></body></html>`,
  );
}

function startServer() {
  const server = http.createServer((req, res) => {
    const name = (req.url || '/').split('?')[0];
    const file = name === '/' ? 'index.html' : name.replace(/^\//, '');
    const p = join(OUT_DIR, file);
    if (!existsSync(p)) { res.writeHead(404).end('not found'); return; }
    const type = file.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    res.end(readFileSync(p));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

function runChrome(chrome, url, args, timeoutMs = 45000) {
  return new Promise((r) => {
    const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run', ...args, url], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); r({ stdout, stderr, code }); });
  });
}

async function main() {
  await bundle();
  const bundleHash = createHash('sha256').update(readFileSync(join(OUT_DIR, 'bundle.js'))).digest('hex');
  const { server, port } = await startServer();
  const url = `http://127.0.0.1:${port}/`;
  const chrome = findChrome();
  const chromeVersion = spawnSync(chrome, ['--version'], { encoding: 'utf8' }).stdout.trim();

  let report;
  try {
    const dom = await runChrome(chrome, url, ['--virtual-time-budget=15000', '--timeout=20000', '--dump-dom'], 35000);
    const html = dom.stdout || '';
    const match = html.match(/<pre id="qa-report"[^>]*>([\s\S]*?)<\/pre>/);
    if (!match) {
      const bootError = (html.match(/<pre id="boot-error">([\s\S]*?)<\/pre>/) || [])[1] || null;
      report = { task: 'Issue #2426', pass: false, error: 'harness did not produce a report', bootError, exitCode: dom.code, stderr: (dom.stderr || '').slice(0, 2000) };
    } else {
      const parsed = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
      report = { ...parsed, pass: parsed.failed === 0 };
    }

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const pngPath = join(EVIDENCE_DIR, 'social-harvest-stage-qa.png');
    await runChrome(chrome, url, [`--screenshot=${pngPath}`, '--window-size=1440,900', '--virtual-time-budget=8000', '--timeout=12000'], 25000);
    report.screenshot = 'docs/evidence/social-harvest-stage-qa.png';
    report.screenshotBytes = existsSync(pngPath) ? readFileSync(pngPath).length : 0;
  } finally {
    server.close();
    rmSync(OUT_DIR, { recursive: true, force: true }); // 自清理
  }

  report.url = url;
  report.chrome = chromeVersion;
  report.bundleSha256 = bundleHash;
  report.baseSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  report.ranAt = new Date().toISOString();

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, 'social-harvest-stage-qa-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({ pass: report.pass, total: report.total, failed: report.failed, screenshotBytes: report.screenshotBytes }, null, 2));
  for (const a of report.assertions || []) console.log(`${a.pass ? '✅' : '❌'} ${a.name}${a.detail ? ` — ${a.detail}` : ''}`);
  if (!report.pass) process.exitCode = 1;
}

await main();
