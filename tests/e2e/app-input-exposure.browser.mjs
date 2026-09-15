/**
 * tests/e2e/app-input-exposure.browser.mjs
 *
 * Worktree-isolated browser QA driver for Issue #1994.
 * Bundles the real components with esbuild, serves them on an ephemeral port,
 * drives the journey in a real Chrome instance, then writes PNG + JSON evidence.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const EVIDENCE_DIR = join(ROOT, 'docs/evidence');
const OUT_DIR = join(ROOT, 'tmp/app-input-exposure-qa');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('no chrome binary found');
}

const THEME_TOKENS = `
:root {
  --dsw-alias-bg-base: #111113;
  --dsw-alias-bg-primary: #141416;
  --dsw-alias-bg-layer-1: rgba(255,255,255,0.04);
  --dsw-alias-bg-layer-2: rgba(255,255,255,0.06);
  --dsw-alias-bg-layer-3: rgba(255,255,255,0.08);
  --dsw-alias-bg-elevated: #1c1c1f;
  --dsw-alias-bg-mask-1: rgba(0,0,0,0.55);
  --dsw-alias-label-primary: #ffffff;
  --dsw-alias-label-primary-inverted: #111827;
  --dsw-alias-label-primary-foreground: #ffffff;
  --dsw-alias-label-secondary: rgba(255,255,255,0.72);
  --dsw-alias-label-tertiary: rgba(255,255,255,0.40);
  --dsw-alias-label-dimmed: rgba(255,255,255,0.28);
  --dsw-alias-label-success: #4ade80;
  --dsw-alias-label-warning: #fbbf24;
  --dsw-alias-border-l1: rgba(255,255,255,0.06);
  --dsw-alias-border-l2: rgba(255,255,255,0.12);
  --dsw-alias-border-l3: rgba(255,255,255,0.22);
  --dsw-alias-border: rgba(255,255,255,0.14);
  --dsw-alias-brand-primary: #3b82f6;
  --dsw-alias-state-business-primary: #4c8dff;
  --dsw-alias-state-success-primary: rgba(34,197,94,0.12);
  --dsw-alias-state-warn-primary: rgba(245,158,11,0.12);
  --dsw-alias-state-error-primary: #f87171;
  --dsw-alias-interactive-bg-hover: rgba(255,255,255,0.08);
  --dsw-alias-interactive-bg-active: rgba(255,255,255,0.14);
  --dsw-alias-button-primary-fill: #ffffff;
  --dsw-alias-button-primary-hover: #2563eb;
}
body { margin: 0; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 13px; }
`;

async function bundle() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  await esbuild.build({
    entryPoints: [join(__dirname, 'app-input-exposure.harness.jsx')],
    outfile: join(OUT_DIR, 'bundle.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    loader: { '.css': 'css', '.svg': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning',
    absWorkingDir: ROOT,
    nodePaths: [join(ROOT, 'node_modules')],
    // The plugin packages ship their own React copy; a single instance is required
    // or hooks throw (duplicate React).
    alias: {
      react: join(ROOT, 'plugins/omnimux-workflow/node_modules/react'),
      'react-dom': join(ROOT, 'plugins/omnimux-workflow/node_modules/react-dom'),
    },
  });
  writeFileSync(
    join(OUT_DIR, 'index.html'),
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>QA</title>
<style>${THEME_TOKENS}</style><link rel="stylesheet" href="./bundle.css"></head>
<body><div id="root"></div>
<script>
function reportBootFailure(text) {
  var p = document.createElement('pre'); p.id = 'boot-error'; p.textContent = text; document.body.appendChild(p);
}
window.onerror = function (message, source, line) { reportBootFailure('ERR: ' + message + ' @ ' + source + ':' + line); };
window.onunhandledrejection = function (e) { reportBootFailure('REJ: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)); };
</script>
<script src="./bundle.js"></script></body></html>`,
  );
}

function startServer() {
  const server = http.createServer((req, res) => {
    const name = (req.url || '/').split('?')[0];
    const file = name === '/' ? 'index.html' : name.replace(/^\//, '');
    const path = join(OUT_DIR, file);
    if (!existsSync(path)) {
      res.writeHead(404).end('not found');
      return;
    }
    const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    res.end(readFileSync(path));
  });
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise({ server, port: server.address().port }));
  });
}

function runChrome(chrome, url, args, timeoutMs = 45000) {
  return new Promise((resolvePromise) => {
    const child = spawn(
      chrome,
      ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run', ...args, url],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ stdout, stderr, code });
    });
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
    const dom = await runChrome(chrome, url, ['--virtual-time-budget=20000', '--timeout=25000', '--dump-dom'], 40000);
    const html = dom.stdout || '';
    const match = html.match(/<pre id="qa-report"[^>]*>([\s\S]*?)<\/pre>/);
    if (!match) {
      const bootError = (html.match(/<pre id="boot-error">([\s\S]*?)<\/pre>/) || [])[1] || null;
      report = {
        task: 'Issue #1994',
        pass: false,
        error: 'harness did not produce a report',
        title: (html.match(/<title>([^<]*)<\/title>/) || [])[1] || null,
        bootError,
        rootHtmlLength: (html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script/) || [])[1]?.length ?? null,
        exitCode: dom.code,
        stderr: (dom.stderr || '').slice(0, 2000),
      };
    } else {
      const parsed = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
      report = { ...parsed, pass: parsed.failed === 0 };
    }

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const pngPath = join(EVIDENCE_DIR, 'app-input-exposure-qa.png');
    await runChrome(chrome, url, [`--screenshot=${pngPath}`, '--window-size=1680,1050', '--virtual-time-budget=20000', '--timeout=25000'], 40000);
    report.screenshot = 'docs/evidence/app-input-exposure-qa.png';
    report.screenshotBytes = existsSync(pngPath) ? readFileSync(pngPath).length : 0;
  } finally {
    server.close();
  }

  report.url = url;
  report.chrome = chromeVersion;
  report.bundleSha256 = bundleHash;
  report.baseSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  report.ranAt = new Date().toISOString();

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, 'app-input-exposure-qa-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({ pass: report.pass, total: report.total, failed: report.failed, screenshotBytes: report.screenshotBytes }, null, 2));
  for (const assertion of report.assertions || []) {
    console.log(`${assertion.pass ? '✅' : '❌'} ${assertion.name}${assertion.detail ? ` — ${assertion.detail}` : ''}`);
  }
  if (!report.pass) process.exitCode = 1;
}

await main();
