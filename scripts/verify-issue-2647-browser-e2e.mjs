/**
 * scripts/verify-issue-2647-browser-e2e.mjs
 *
 * 真实无头 Chrome 浏览器环境端到端质量验收脚本 (Issue #2647)
 * 验证目标：
 * 1. 彻底移除 `(工程默认 · 作者推荐)` 文本提示：
 *    - 下拉框收起态直接显示纯净的模型名称（如 `Seedance 2.0`），绝不含任何括号后缀；
 *    - 下拉菜单展开后，首项主标题直接显示纯净模型名称，副标题展示 `工程预设推荐模型`；
 * 2. 增强默认模型推导，彻底杜绝回退为「智能推荐 (默认)」：
 *    - 历史本地缓存仅有 workspaceId 且 snapshot.nodes 为空时，准确推导出 `Seedance 2.0`；
 *    - 图像类应用（category === 'image'）准确推导出 `GPT Image 2.5`；
 * 3. 产生高分辨率无头 Chrome 交互截图与结构化证据文件至 docs/evidence/。
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import * as esbuild from 'esbuild';

const WORKTREE_ROOT = resolve(process.cwd());
const EVIDENCE_DIR = join(WORKTREE_ROOT, 'docs/evidence');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!existsSync(EVIDENCE_DIR)) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

console.log('🚀 开始编译并挂载真实浏览器环境...');

// 1. 读取 styles.js 中的样式
const stylesSource = readFileSync(
  join(WORKTREE_ROOT, 'plugins/omnimux-workflow/src/client/styles.js'),
  'utf-8',
);
const cssMatch = stylesSource.match(/export const WORKFLOW_CSS = `([\s\S]*?)`\s*export/);
const workflowCss = cssMatch ? cssMatch[1] : '';

// 2. 打包 AppTab React 组件 bundle
const bundleResult = await esbuild.build({
  stdin: {
    contents: `
      import React from 'react';
      import * as ReactDOMClient from 'react-dom/client';
      import { AppTab } from './src/client/projects/AppTab.jsx';
      window.React = React;
      window.ReactDOMClient = ReactDOMClient;
      window.AppTab = AppTab;
    `,
    resolveDir: join(WORKTREE_ROOT, 'plugins/omnimux-workflow'),
    sourcefile: 'browser-entry.js',
    loader: 'js',
  },
  bundle: true,
  format: 'iife',
  globalName: 'OmnimuxAppTabBundle',
  platform: 'browser',
  jsx: 'automatic',
  write: false,
  plugins: [
    {
      name: 'stub-externals',
      setup(b) {
        b.onResolve({ filter: /\.(css|less|scss)$/ }, () => ({
          path: 'stub-css',
          namespace: 'stub-css',
        }));
        b.onLoad({ filter: /.*/, namespace: 'stub-css' }, () => ({
          contents: 'export default {};',
          loader: 'js',
        }));
      },
    },
  ],
});

const appBundleCode = bundleResult.outputFiles[0].text;
console.log(`📦 AppTab 客户端 Bundle 编译完成，体积: ${(appBundleCode.length / 1024).toFixed(1)} KB`);

// 3. 构造自包含 HTML 页面
const htmlPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Issue #2647 AppTab Clean Model Name Verification</title>
  <style>
    :root {
      --dsw-alias-bg-base: #141416;
      --dsw-alias-bg-surface: #1e1f23;
      --dsw-alias-bg-hover: #2a2b30;
      --dsw-alias-bg-active: #323339;
      --dsw-alias-label-primary: #ffffff;
      --dsw-alias-label-secondary: #9ea3ae;
      --dsw-alias-label-tertiary: #6b7280;
      --dsw-alias-border-subtle: #2d2e33;
      --dsw-alias-border-default: #3f4249;
      --dsw-alias-accent-primary: #3b82f6;
      --dsw-alias-accent-hover: #2563eb;
      --dsw-alias-danger: #ef4444;
      --dsw-bg: #141416;
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--dsw-alias-bg-base);
      color: var(--dsw-alias-label-primary);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-x: hidden;
    }
    #root {
      width: 1440px;
      height: 900px;
      display: flex;
    }
    ${workflowCss}
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    window.__submittedPayload = null;
    window.__OMNIMUX_APPS_EXECUTE__ = async (manifest, formValues) => {
      window.__submittedPayload = { manifest, formValues };
      return { executionId: 'exec_2647', status: 'COMPLETED' };
    };
  </script>
  <script>${appBundleCode}</script>
  <script>
    const SEEDANCE_APP_MANIFEST = {
      appId: 'app-creatify-chasing-product',
      metadata: {
        name: '巨型商品撞屏与荒诞追逐',
        description: '主体视觉锁定与多视角动态运镜渲染',
        version: '1.2.0',
        official: true,
      },
      workflowBinding: {
        workflowId: 'wf_chasing_01',
        snapshot: {
          nodes: [
            {
              id: 'node-slot-product',
              type: 'input',
              data: { isSlot: true, slotRole: 'product' },
            },
            {
              id: 'node-main-gen',
              type: 'omnimux_video_submit',
              data: {
                model: 'seedance-2.0',
                params: { duration: 5, aspectRatio: '9:16' },
              },
            },
          ],
          edges: [],
        },
      },
      formSchema: {
        type: 'object',
        properties: {
          product_image: {
            type: 'string',
            title: '商品主图',
            widget: 'product-link',
            default: '/assets/sample-shoe.webp',
          },
          aspect_ratio: {
            type: 'string',
            title: '成片画幅',
            widget: 'ratio-cards',
            enum: ['9:16', '16:9', '1:1'],
            default: '9:16',
          },
        },
      },
      demoSnapshot: {
        product_image: '/assets/sample-shoe.webp',
        aspect_ratio: '9:16',
      },
    };

    const rootContainer = document.getElementById('root');
    const root = window.ReactDOMClient.createRoot(rootContainer);

    window.__mountApp = (manifest, title = '测试应用') => {
      root.render(
        window.React.createElement(window.AppTab, {
          seed: {
            id: 'tab_test_' + Date.now(),
            title,
            extra: { manifest },
          },
        })
      );
      window.__appMounted = true;
    };

    window.__mountApp(SEEDANCE_APP_MANIFEST, '巨型商品撞屏与荒诞追逐');
  </script>
</body>
</html>`;

// 4. 启动动态端口 HTTP 服务
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlPage);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const serverPort = server.address().port;
const appUrl = `http://127.0.0.1:${serverPort}/`;
console.log(`🌐 临时 HTTP 服务已启动: ${appUrl}`);

// 5. 启动无头 Google Chrome
const cdpPort = 9700 + Math.floor(Math.random() * 200);
const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1440,900',
  appUrl,
]);

let isTerminated = false;
function cleanup() {
  if (isTerminated) return;
  isTerminated = true;
  try {
    chromeProc.kill('SIGKILL');
  } catch {}
  try {
    server.close();
  } catch {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(1);
});

await new Promise((r) => setTimeout(r, 1500));

// 6. 连接 Chrome DevTools Protocol
const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
const targets = await listRes.json();
const pageTarget = targets.find((t) => t.type === 'page');
if (!pageTarget) {
  cleanup();
  throw new Error('未找到 Chrome 页面调试目标！');
}

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let msgId = 1;
function sendCdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const timer = setTimeout(() => reject(new Error(`CDP ${method} 超时 (8s)`)), 8000);
    const listener = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        clearTimeout(timer);
        ws.removeEventListener('message', listener);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', listener);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expr) {
  const res = await sendCdp('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(`JS 执行异常: ${JSON.stringify(res.exceptionDetails)}`);
  }
  return res.result?.value;
}

await sendCdp('Page.enable');
await sendCdp('Runtime.enable');
await sendCdp('DOM.enable');

await new Promise((r) => setTimeout(r, 1200));
await evalJs(`new Promise((resolve) => {
  const check = () => {
    if (window.__appMounted && document.querySelector('.omx-apptab-form')) resolve(true);
    else setTimeout(check, 100);
  };
  check();
})`);

async function captureScreenshot(filepath) {
  const { data } = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(filepath, Buffer.from(data, 'base64'));
}

console.log('✅ 浏览器已成功渲染，开始执行 3 大场景端到端真实测试...\n');

// -----------------------------------------------------------------------------
// 场景一：工程节点配置 Seedance 2.0，验证纯净模型名称，无 (工程默认 · 作者推荐)
// -----------------------------------------------------------------------------
console.log('--- 场景一：检验工程默认模型纯净展示与下拉菜单首项 ---');
const scene1Data = await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  const trigger = fg?.querySelector('.omx-apptab-select-trigger');
  const triggerText = trigger ? trigger.textContent.trim() : '';
  const triggerRect = trigger?.getBoundingClientRect();

  return {
    found: Boolean(fg && trigger),
    triggerText,
    width: triggerRect ? triggerRect.width : 0,
    height: triggerRect ? triggerRect.height : 0,
  };
})()`);

console.log(`[场景一] 收起态触发器文本: "${scene1Data.triggerText}"`);
if (scene1Data.triggerText !== 'Seedance 2.0') {
  throw new Error(`[场景一失败] 触发器文本应为纯净的 "Seedance 2.0"，实际为: "${scene1Data.triggerText}"`);
}
if (scene1Data.triggerText.includes('工程默认') || scene1Data.triggerText.includes('作者推荐')) {
  throw new Error(`[场景一失败] 触发器文本包含禁止的 "(工程默认 · 作者推荐)" 后缀！`);
}
if (scene1Data.width <= 0 || scene1Data.height <= 0) {
  throw new Error(`[场景一失败] 触发器几何尺寸异常: ${scene1Data.width}x${scene1Data.height}`);
}

// 点击展开下拉框
await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  const trigger = fg.querySelector('.omx-apptab-select-trigger');
  trigger.click();
})()`);
await new Promise((r) => setTimeout(r, 400));

const scene1DropdownData = await evalJs(`(() => {
  const optionsPanel = document.querySelector('.omx-apptab-select-options');
  if (!optionsPanel) return null;
  const firstOption = optionsPanel.querySelector('.omx-apptab-select-option');
  const nameEl = firstOption?.querySelector('.omx-apptab-model-name');
  const subEl = firstOption?.querySelector('.omx-apptab-model-sub');
  return {
    panelVisible: true,
    firstOptionTitle: nameEl ? nameEl.textContent.trim() : '',
    firstOptionSub: subEl ? subEl.textContent.trim() : '',
  };
})()`);

console.log(`[场景一] 下拉浮层首项标题: "${scene1DropdownData?.firstOptionTitle}"`);
console.log(`[场景一] 下拉浮层首项副标题: "${scene1DropdownData?.firstOptionSub}"`);

if (scene1DropdownData?.firstOptionTitle !== 'Seedance 2.0') {
  throw new Error(`[场景一失败] 下拉首项标题应为纯净的 "Seedance 2.0"，实际为: "${scene1DropdownData?.firstOptionTitle}"`);
}
if (scene1DropdownData?.firstOptionTitle.includes('工程默认') || scene1DropdownData?.firstOptionTitle.includes('作者推荐')) {
  throw new Error(`[场景一失败] 下拉首项标题包含禁止的 "(工程默认 · 作者推荐)" 括号后缀！`);
}
if (scene1DropdownData?.firstOptionSub !== '工程预设推荐模型') {
  throw new Error(`[场景一失败] 下拉首项副标题应为 "工程预设推荐模型"，实际为: "${scene1DropdownData?.firstOptionSub}"`);
}

const shot1Path = join(EVIDENCE_DIR, 'issue-2647-clean-model-name.png');
await captureScreenshot(shot1Path);
console.log(`📸 场景一截图已留存: ${shot1Path}\n`);

// 收起下拉
await evalJs(`document.body.click()`);
await new Promise((r) => setTimeout(r, 300));

// -----------------------------------------------------------------------------
// 场景二：历史本地缓存仅有 workspaceId，缺少 snapshot.nodes
// -----------------------------------------------------------------------------
console.log('--- 场景二：检验历史缓存缺少 snapshot.nodes 时的默认模型健全推导 ---');
await evalJs(`(() => {
  const HISTORY_CACHE_MANIFEST = {
    appId: 'app-creatify-chasing-product',
    metadata: {
      name: '巨型商品撞屏与荒诞追逐 (历史缓存)',
      description: '本地仅缓存了 workspaceId，缺失 snapshot.nodes',
      category: 'video',
      version: '1.1.0',
    },
    workflowBinding: {
      workspaceId: 'ws-app-creatify-app-demo',
      // snapshot.nodes 缺失
    },
    formSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', title: '创意提示词', default: '快速生成创意视频' },
      },
    },
  };
  window.__mountApp(HISTORY_CACHE_MANIFEST, '历史缓存应用测试');
})()`);
await new Promise((r) => setTimeout(r, 800));

const scene2Data = await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  const trigger = fg?.querySelector('.omx-apptab-select-trigger');
  return {
    triggerText: trigger ? trigger.textContent.trim() : '',
  };
})()`);

console.log(`[场景二] 缺失 nodes 时触发器文本: "${scene2Data.triggerText}"`);
if (scene2Data.triggerText !== 'Seedance 2.0') {
  throw new Error(`[场景二失败] 历史缓存缺失 nodes 时应健全推导为 "Seedance 2.0"，实际为: "${scene2Data.triggerText}"`);
}
if (scene2Data.triggerText.includes('智能推荐')) {
  throw new Error(`[场景二失败] 错误回退为了 "智能推荐 (默认)"！增强推导未能生效！`);
}

const shot2Path = join(EVIDENCE_DIR, 'issue-2647-history-cache-nodes-empty.png');
await captureScreenshot(shot2Path);
console.log(`📸 场景二截图已留存: ${shot2Path}\n`);

// -----------------------------------------------------------------------------
// 场景三：图片类应用（category === 'image'）缺少 nodes 时推导为 GPT Image 2.5
// -----------------------------------------------------------------------------
console.log('--- 场景三：检验图片类应用健全推导为 GPT Image 2.5 ---');
await evalJs(`(() => {
  const IMAGE_APP_MANIFEST = {
    appId: 'app-ecommerce-product-photo',
    metadata: {
      name: '电商爆款商品棚拍图',
      description: '超清商品静物摄影生成',
      category: 'image',
      version: '1.0.0',
    },
    formSchema: {
      type: 'object',
      properties: {
        product_name: { type: 'string', title: '商品名称', default: '智能手表' },
      },
    },
  };
  window.__mountApp(IMAGE_APP_MANIFEST, '图片类应用测试');
})()`);
await new Promise((r) => setTimeout(r, 800));

const scene3Data = await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  const trigger = fg?.querySelector('.omx-apptab-select-trigger');
  return {
    triggerText: trigger ? trigger.textContent.trim() : '',
  };
})()`);

console.log(`[场景三] 图片类应用触发器文本: "${scene3Data.triggerText}"`);
if (scene3Data.triggerText !== 'GPT Image 2.5') {
  throw new Error(`[场景三失败] 图片类应用应推导为 "GPT Image 2.5"，实际为: "${scene3Data.triggerText}"`);
}
if (scene3Data.triggerText.includes('智能推荐') || scene3Data.triggerText.includes('工程默认')) {
  throw new Error(`[场景三失败] 图片类应用模型文案包含禁止词汇！`);
}

const shot3Path = join(EVIDENCE_DIR, 'issue-2647-image-category-model.png');
await captureScreenshot(shot3Path);
console.log(`📸 场景三截图已留存: ${shot3Path}\n`);

// 7. 生成结构化验证报告
const reportContent = `# Issue #2647 真实浏览器端到端质量验证报告

## 1. 验证目标与结论
- **结论判定**：**PASS (100% 达标)**
- **业务验证目标**：
  1. 彻底移除 \`(工程默认 · 作者推荐)\` 文本提示；
  2. 收起按钮与下拉浮层首项统一展示纯净模型名称（如 \`Seedance 2.0\`）；
  3. 下拉浮层首项副标题极简展示为 \`工程预设推荐模型\`；
  4. 解决历史缓存缺少 \`snapshot.nodes\` 误回退为「智能推荐 (默认)」的缺陷，实现多层级健全推导。

## 2. 真实浏览器场景实测明细

| 场景编号 | 测试场景描述 | 预期表现 | 真实浏览器实测读数 | 判定 |
|---|---|---|---|---|
| **场景一** | 影视级应用配置 Seedance 2.0 (含 nodes) | 收起按钮展示纯净 "Seedance 2.0"；下拉首项标题 "Seedance 2.0"，副标题 "工程预设推荐模型" | 收起按钮: \`${scene1Data.triggerText}\`<br>首项标题: \`${scene1DropdownData.firstOptionTitle}\`<br>首项副标题: \`${scene1DropdownData.firstOptionSub}\` | **PASS** |
| **场景二** | 历史本地缓存仅有 workspaceId (nodes 为空) | 健全识别 creatify 预设与视频分类，推导为 "Seedance 2.0"，杜绝智能推荐 | 触发器文本: \`${scene2Data.triggerText}\` | **PASS** |
| **场景三** | 图像类应用 (category === 'image') | 健全识别图片分类，推导为 "GPT Image 2.5" | 触发器文本: \`${scene3Data.triggerText}\` | **PASS** |

## 3. 留存截图证据
- \`docs/evidence/issue-2647-clean-model-name.png\`：场景一纯净模型名称与展开菜单截图
- \`docs/evidence/issue-2647-history-cache-nodes-empty.png\`：场景二历史缓存 nodes 缺失推导截图
- \`docs/evidence/issue-2647-image-category-model.png\`：场景三图像类应用推导截图

---
*验证执行时间: ${new Date().toISOString()}*
*环境: Headless Google Chrome (CDP)*
`;

const reportPath = join(EVIDENCE_DIR, 'workflow-apptab-clean-model-name-issue-2647-verified.md');
writeFileSync(reportPath, reportContent, 'utf-8');
console.log(`📄 验证报告已落盘: ${reportPath}`);

cleanup();
console.log('\n🎉 Issue #2647 真实浏览器端到端质量验收全部通过！');
