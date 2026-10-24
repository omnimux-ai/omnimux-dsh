#!/usr/bin/env node
/**
 * scripts/verify-apptab-model-selector-gate-browser.mjs
 *
 * 真实浏览器（Headless Chrome + CDP）验收：AppTab「生成模型」选择器显示门禁。
 *
 * 覆盖三条契约（对应 specs/publish-app-category-model-gate.spec.md 变更点 3/4）：
 *   1. 纯文本快照（无生成节点）      → **不得**渲染「生成模型」选择器
 *   2. 含生成节点的快照              → **必须**渲染选择器（正向对照，防止门禁过严）
 *   3. 无内嵌快照（内置应用形态）    → **必须**渲染选择器（证据不足不隐藏，防内置应用回归）
 *
 * 与 `verify-workflow-apptab-browser.mjs` 同构：esbuild 打包真实 AppTab、动态端口 0、
 * 无头 Chrome + CDP、真实 DOM 计算、PNG 截图留证、测完自清理。
 *
 * 输出证据：docs/evidence/workflow-apptab-model-selector-gate.png
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { findChromePath, assertPng } from './worktree-web-qa.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const EVIDENCE_PATH = join(REPO_ROOT, 'docs', 'evidence', 'workflow-apptab-model-selector-gate.png');

const BASE_APP = {
  appId: 'app_gate_probe',
  schemaVersion: '1.0',
  version: '1.0.0',
  metadata: {
    name: '门禁探针应用',
    category: 'video',
    version: '1.0.0',
    official: false,
  },
  formSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', title: '提示词', default: '一只猫' },
    },
    required: [],
  },
  fieldMappings: {
    prompt: { targetPath: 'data.prompt', fieldTitle: '提示词' },
  },
  fixedFields: [],
  showcase: { mode: 'carousel', items: [] },
};

const withSnapshot = (nodes) => ({
  ...BASE_APP,
  workflowBinding: { workspaceId: 'ws_gate_probe', snapshot: { nodes, edges: [] } },
});

/** 1. 纯文本快照：没有任何生成节点。 */
const TEXT_ONLY_APP = {
  ...withSnapshot([{ id: 'node_pure_text', type: 'text', data: { content: '普通文本' } }]),
  appId: 'app_gate_text_only',
};

/** 2. 含生成节点：注册表工具 + modelCategory。 */
const GENERATION_APP = {
  ...withSnapshot([
    { id: 'node_text', type: 'material', data: { materialType: 'text', selectedTool: 'text-editor' } },
    {
      id: 'node_gen_video',
      type: 'material',
      data: { nodeKind: 'generate', selectedTool: 'video-generation', materialType: 'video', model: 'seedance-2.5' },
    },
  ]),
  appId: 'app_gate_generation',
};

/** 3. 无内嵌快照：内置应用形态（只带 workspaceId）。 */
const NO_SNAPSHOT_APP = {
  ...BASE_APP,
  appId: 'app-creatify-chasing-product',
  workflowBinding: { workspaceId: 'ws-app-creatify-chasing-product', workflowVersion: 1 },
};

// 单实例 React：插件源码与其依赖若各带一份 React，会出现 dispatcher 为 null。
// 与 verify-workflow-apptab-browser.mjs 保持一致，把 react 系列全部指向同一份解析结果。
import { createRequire } from 'node:module';
const require = createRequire(REPO_ROOT);
const reactPath = require.resolve('react');
const reactDomPath = require.resolve('react-dom');
const reactDomClientPath = require.resolve('react-dom/client');
const reactJsxRuntimePath = require.resolve('react/jsx-runtime');

async function buildBundle() {
  const result = await build({
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { AppTab } from './plugins/omnimux-workflow/src/client/projects/AppTab.jsx';

        const APPS = ${JSON.stringify({ textOnly: TEXT_ONLY_APP, generation: GENERATION_APP, noSnapshot: NO_SNAPSHOT_APP })};

        let root = null;
        window.__qa_render = (key) => {
          const manifest = APPS[key];
          const container = document.getElementById('root');
          if (!root) root = createRoot(container);
          root.render(React.createElement(AppTab, {
            key,
            seed: { id: 'app_' + manifest.appId, extra: { manifest } },
          }));
        };
        window.__qa_init = () => {
          window.__qa_render('textOnly');
          window.__qa_ready = true;
        };
      `,
      resolveDir: REPO_ROOT,
      sourcefile: 'gate-verify-entry.js',
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    plugins: [
      {
        name: 'dedupe-react',
        setup(b) {
          b.onResolve({ filter: /^react$/ }, () => ({ path: reactPath }));
          b.onResolve({ filter: /^react-dom$/ }, () => ({ path: reactDomPath }));
          b.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: reactDomClientPath }));
          b.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: reactJsxRuntimePath }));
        },
      },
      {
        name: 'stub-externals',
        setup(b) {
          b.onResolve({ filter: /\.(css|less|scss)$/ }, () => ({ path: 'stub-css', namespace: 'stub-css' }));
          b.onLoad({ filter: /.*/, namespace: 'stub-css' }, () => ({ contents: 'module.exports = {};', loader: 'js' }));
        },
      },
    ],
  });
  return result.outputFiles[0].text;
}

function generateHtml(bundleJs) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>AppTab 生成模型选择器门禁 · 真实浏览器验收</title>
  <style>
    :root {
      --dsw-alias-brand-primary: #1677ff;
      --dsw-alias-interactive-bg-active: rgba(22, 119, 255, 0.12);
      --dsw-alias-interactive-hover: rgba(255, 255, 255, 0.08);
      --dsw-alias-state-warn-primary: #faad14;
      --dsw-alias-state-danger-primary: #ff4d4f;
      --dsw-alias-border-subtle: #303030;
      --dsw-alias-border-hover: #505050;
      --dsw-alias-text-primary: #e6e6e6;
      --dsw-alias-text-secondary: #999999;
      --dsw-alias-text-tertiary: #666666;
      --dsw-alias-surface-bg: #141414;
      --dsw-alias-surface-raised: #1f1f1f;
      --dsw-alias-surface-overlay: #262626;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #141414;
      color: #e6e6e6;
    }
    body { margin: 0; padding: 0; background: #141414; min-height: 100vh; }
    #root { padding: 20px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>${bundleJs}<\/script>
  <script>
    window.addEventListener('DOMContentLoaded', () => { window.__qa_init(); });
  <\/script>
</body>
</html>`;
}

async function runBrowserQa() {
  console.log('🚀 AppTab 生成模型选择器门禁 · 真实浏览器验收');

  const chromePath = findChromePath();
  console.log(`[QA] Chrome: ${chromePath}`);

  const bundleJs = await buildBundle();
  const htmlContent = generateHtml(bundleJs);

  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlContent);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const pageUrl = `http://127.0.0.1:${server.address().port}/`;
  console.log(`[QA] 服务就绪: ${pageUrl}`);

  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900',
    'about:blank',
  ]);

  let cdpPort = null;
  try {
    cdpPort = await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('Chrome 启动超时')), 15000);
      let buf = '';
      chrome.stderr.on('data', (c) => {
        buf += c.toString();
        const m = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buf);
        if (m) { clearTimeout(timer); res(Number(m[1])); }
      });
    });
    console.log(`[QA] CDP 端口: ${cdpPort}`);

    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    const pageTarget = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let seq = 0;
    const pending = new Map();
    const send = (method, params) =>
      new Promise((res, rej) => {
        const id = ++seq;
        pending.set(id, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id, method, params: params ?? {} }));
      });

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('   [Browser Exception]', JSON.stringify(msg.params.exceptionDetails));
      }
      if (!msg.id || !pending.has(msg.id)) return;
      const { resolve: yes, reject: no } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) no(new Error(`CDP 错误 ${msg.error.message}`));
      else yes(msg.result);
    };

    const evalJs = async (expr) => {
      const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) throw new Error(`JS 异常: ${JSON.stringify(res.exceptionDetails)}`);
      return res.result?.value;
    };

    const results = [];
    const record = (name, pass, detail) => {
      results.push({ name, pass, detail });
      console.log(`   ${pass ? '✅' : '❌'} [${name}]: ${detail}`);
      assert.ok(pass, `验收断言失败 [${name}]: ${detail}`);
    };

    // 在当前已渲染的 AppTab 上查询「生成模型」字段组是否可见
    const MODEL_GROUP_PROBE = `(() => {
      const groups = Array.from(document.querySelectorAll('.omx-apptab-field-group'));
      const hit = groups.find((fg) => fg.textContent.includes('生成模型'));
      if (!hit) return { present: false };
      const rect = hit.getBoundingClientRect();
      return {
        present: true,
        width: rect.width,
        height: rect.height,
        visible: rect.width > 0 && rect.height > 0,
        trigger: (hit.querySelector('.omx-apptab-select-trigger') || {}).textContent?.trim() || '',
      };
    })()`;

    const waitMounted = async () => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        if (await evalJs('Boolean(window.__qa_ready && document.querySelector(".omx-apptab-root"))')) return true;
        await new Promise((r) => setTimeout(r, 200));
      }
      return false;
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: pageUrl });

    record('apptab-dom-mounted', await waitMounted(), 'AppTab 根布局在真实浏览器成功挂载');

    // ---- 1. 纯文本快照：不得渲染选择器 ----
    console.log('\n--- 1. 纯文本快照（无生成节点）→ 必须不渲染选择器 ---');
    await evalJs(`window.__qa_render('textOnly')`);
    await new Promise((r) => setTimeout(r, 600));
    const textOnly = await evalJs(MODEL_GROUP_PROBE);
    record(
      'text-only-snapshot-hides-selector',
      textOnly.present === false,
      `纯文本快照下「生成模型」字段组不存在（present=${textOnly.present}）`,
    );

    // ---- 2. 含生成节点：必须渲染选择器（正向对照） ----
    console.log('\n--- 2. 含生成节点的快照 → 必须渲染选择器 ---');
    await evalJs(`window.__qa_render('generation')`);
    await new Promise((r) => setTimeout(r, 600));
    const generation = await evalJs(MODEL_GROUP_PROBE);
    record(
      'generation-snapshot-shows-selector',
      generation.present === true && generation.visible === true,
      `含生成节点时选择器可见（present=${generation.present}, ${generation.width}x${generation.height}, trigger="${generation.trigger}"）`,
    );

    // ---- 3. 无内嵌快照：必须保持既有行为（防内置应用回归） ----
    console.log('\n--- 3. 无内嵌快照（内置应用形态）→ 必须保持渲染 ---');
    await evalJs(`window.__qa_render('noSnapshot')`);
    await new Promise((r) => setTimeout(r, 600));
    const noSnapshot = await evalJs(MODEL_GROUP_PROBE);
    record(
      'no-snapshot-keeps-legacy-selector',
      noSnapshot.present === true && noSnapshot.visible === true,
      `无内嵌快照时选择器保持可见（present=${noSnapshot.present}, ${noSnapshot.width}x${noSnapshot.height}）`,
    );

    // ---- PNG 截图留证（停在正向对照态，便于人工核对） ----
    await evalJs(`window.__qa_render('generation')`);
    await new Promise((r) => setTimeout(r, 600));
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    assert.match(shot?.data || '', /^[A-Za-z0-9+/]+={0,2}$/, 'CDP 截图载荷缺失');
    const bytes = Buffer.from(shot.data, 'base64');
    assertPng(bytes);
    mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
    writeFileSync(EVIDENCE_PATH, bytes);
    console.log(`\n[QA] 截图证据已写入: ${EVIDENCE_PATH} (${bytes.length} bytes)`);

    const report = { stage: 'apptab-model-selector-gate', url: pageUrl, results, evidence: EVIDENCE_PATH };
    mkdirSync(join(REPO_ROOT, 'docs', 'evidence'), { recursive: true });
    writeFileSync(
      join(REPO_ROOT, 'docs', 'evidence', 'workflow-apptab-model-selector-gate.json'),
      JSON.stringify(report, null, 2),
    );

    console.log('\n✅ 门禁真实浏览器验收通过（3/3）');
    return report;
  } finally {
    try { server.close(); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
    console.log('[QA] 资源与 Chrome 进程已自清理完成。');
  }
}

await runBrowserQa();
