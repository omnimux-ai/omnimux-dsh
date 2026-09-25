/**
 * scripts/qa-independent-e2e.mjs
 *
 * QA 工程师严过关（Yan）独立质量验收脚本 (Issue #2647)
 * 全流程无头 Chrome 真实环境端到端自动化测试
 * 
 * 验收矩阵覆盖：
 * 1. 纯净模型名称展示验证（无后缀）：
 *    - 收起态展示纯净模型名（如 "Seedance 2.0"），严禁出现 "(工程默认 · 作者推荐)" 文本；
 *    - 展开后首项主标题展示纯净模型名（如 "Seedance 2.0"），副标题为 "工程预设推荐模型"；
 * 2. 多层级推导默认模型验证（消灭误回退）：
 *    - 本地缓存缺失 snapshot.nodes（「手机与网页交互实机演示 (副本)」、「巨型商品撞屏与荒诞追逐」等），100% 准确推导为 "Seedance 2.0"，绝不误回退为 "智能推荐 (默认)"；
 *    - 图片分类应用默认推导为 "GPT Image 2.5"；
 *    - 显式 defaultModel (kling-o3) 准确推导为 "可灵 Kling O3"；
 * 3. 真实无头浏览器端到端交互核验：
 *    - DOM 渲染尺寸 40px 正几何，展开菜单与点选交互无透视；
 * 4. 留存高清证据截图至 docs/evidence/
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

console.log('====================================================');
console.log('🔍 QA 工程师严过关（Yan）· Issue #2647 独立端到端质量验收');
console.log('====================================================\n');

// 1. 编译 AppTab 组件与样式
const stylesSource = readFileSync(
  join(WORKTREE_ROOT, 'plugins/omnimux-workflow/src/client/styles.js'),
  'utf-8',
);
const cssMatch = stylesSource.match(/export const WORKFLOW_CSS = `([\s\S]*?)`\s*export/);
const workflowCss = cssMatch ? cssMatch[1] : '';

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
    sourcefile: 'qa-browser-entry.js',
    loader: 'js',
  },
  bundle: true,
  format: 'iife',
  globalName: 'OmnimuxAppTabQaBundle',
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
console.log(`📦 QA 验收 Bundle 编译成功，体积: ${(appBundleCode.length / 1024).toFixed(1)} KB`);

// 2. 自包含 HTML 页面
const htmlPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>QA Verification - Issue #2647 Clean Model Name</title>
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
      return { executionId: 'exec_qa_2647', status: 'COMPLETED' };
    };
  </script>
  <script>${appBundleCode}</script>
  <script>
    const rootContainer = document.getElementById('root');
    const root = window.ReactDOMClient.createRoot(rootContainer);

    window.__mountApp = (manifest, title = '测试应用') => {
      root.render(
        window.React.createElement(window.AppTab, {
          seed: {
            id: 'tab_qa_' + Math.random().toString(36).slice(2),
            title,
            extra: { manifest },
          },
        })
      );
      window.__appMounted = true;
    };
  </script>
</body>
</html>`;

// 3. 启动本地 HTTP 服务
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlPage);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const serverPort = server.address().port;
const appUrl = `http://127.0.0.1:${serverPort}/`;
console.log(`🌐 验收 HTTP 服务启动: ${appUrl}`);

// 4. 启动无头 Chrome
const cdpPort = 9800 + Math.floor(Math.random() * 150);
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

// 5. 连接 CDP
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

async function captureScreenshot(filepath) {
  const { data } = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(filepath, Buffer.from(data, 'base64'));
}

async function waitFormRendered() {
  await evalJs(`new Promise((resolve) => {
    const check = () => {
      if (document.querySelector('.omx-apptab-form')) resolve(true);
      else setTimeout(check, 50);
    };
    check();
  })`);
  await new Promise((r) => setTimeout(r, 300));
}

const qaResults = [];

// =============================================================================
// 测试用例 1：打开「巨型商品撞屏与荒诞追逐」（标准配置工程，含完整 nodes）
// =============================================================================
console.log('▶ [QA-TC01] 验证「巨型商品撞屏与荒诞追逐」纯净模型名称与展开菜单首项');
await evalJs(`(() => {
  window.__mountApp({
    appId: 'app-creatify-chasing-product',
    metadata: {
      name: '巨型商品撞屏与荒诞追逐',
      description: '主体视觉锁定与多视角动态运镜渲染',
      category: 'video',
      version: '1.2.0',
    },
    workflowBinding: {
      workflowId: 'wf_chasing_product',
      snapshot: {
        nodes: [
          { id: 'slot-1', type: 'input', data: { isSlot: true, slotRole: 'product' } },
          { id: 'node-gen', type: 'omnimux_video_submit', data: { model: 'seedance-2.0', params: { duration: 5 } } },
        ],
      },
    },
    formSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', title: '创意提示词', default: '商品快速冲向镜头' },
      },
    },
  }, '巨型商品撞屏与荒诞追逐');
})()`);
await waitFormRendered();

// 1.1 检查收起态几何与文本
const tc1Trigger = await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  const trigger = fg?.querySelector('.omx-apptab-select-trigger');
  if (!trigger) return null;
  const rect = trigger.getBoundingClientRect();
  const cs = window.getComputedStyle(trigger);
  return {
    text: trigger.textContent.trim(),
    rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
    style: {
      height: cs.height,
      boxSizing: cs.boxSizing,
      lineHeight: cs.lineHeight,
      display: cs.display,
      backgroundColor: cs.backgroundColor,
    }
  };
})()`);

console.log(`  - 触发器文本: "${tc1Trigger?.text}"`);
console.log(`  - 触发器几何尺寸: ${tc1Trigger?.rect?.width}px × ${tc1Trigger?.rect?.height}px (预期高度: 40px)`);

const tc1CheckTriggerText = tc1Trigger?.text === 'Seedance 2.0';
const tc1CheckNoSuffix = !tc1Trigger?.text?.includes('工程默认') && !tc1Trigger?.text?.includes('作者推荐');
const tc1CheckGeometry = Math.abs(tc1Trigger?.rect?.height - 40) <= 1;

if (!tc1CheckTriggerText || !tc1CheckNoSuffix || !tc1CheckGeometry) {
  throw new Error(`[TC01 失败] 触发器文本或尺寸不合规: text="${tc1Trigger?.text}", height=${tc1Trigger?.rect?.height}`);
}

// 1.2 点击展开下拉菜单
await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  fg.querySelector('.omx-apptab-select-trigger').click();
})()`);
await new Promise((r) => setTimeout(r, 400));

const tc1Dropdown = await evalJs(`(() => {
  const panel = document.querySelector('.omx-apptab-select-options');
  if (!panel) return null;
  const rect = panel.getBoundingClientRect();
  const cs = window.getComputedStyle(panel);
  const firstOption = panel.querySelector('.omx-apptab-select-option');
  const title = firstOption?.querySelector('.omx-apptab-model-name')?.textContent.trim() || '';
  const sub = firstOption?.querySelector('.omx-apptab-model-sub')?.textContent.trim() || '';

  return {
    rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
    style: {
      position: cs.position,
      zIndex: cs.zIndex,
      backgroundColor: cs.backgroundColor,
      boxShadow: cs.boxShadow,
    },
    firstOption: { title, sub }
  };
})()`);

console.log(`  - 下拉菜单首项主标题: "${tc1Dropdown?.firstOption?.title}"`);
console.log(`  - 下拉菜单首项副标题: "${tc1Dropdown?.firstOption?.sub}"`);
console.log(`  - 下拉浮层 z-index: ${tc1Dropdown?.style?.zIndex}, 背景: ${tc1Dropdown?.style?.backgroundColor}`);

const tc1CheckDropdownTitle = tc1Dropdown?.firstOption?.title === 'Seedance 2.0';
const tc1CheckDropdownNoSuffix = !tc1Dropdown?.firstOption?.title?.includes('工程默认') && !tc1Dropdown?.firstOption?.title?.includes('作者推荐');
const tc1CheckDropdownSub = tc1Dropdown?.firstOption?.sub === '工程预设推荐模型';
const tc1CheckZIndex = parseInt(tc1Dropdown?.style?.zIndex || '0', 10) >= 50;

if (!tc1CheckDropdownTitle || !tc1CheckDropdownNoSuffix || !tc1CheckDropdownSub || !tc1CheckZIndex) {
  throw new Error(`[TC01 失败] 下拉浮层内容或防透视样式不合规`);
}

const shot1Path = join(EVIDENCE_DIR, 'qa-issue-2647-chasing-product-clean-name.png');
await captureScreenshot(shot1Path);
console.log(`  📸 截图凭证保存: ${shot1Path}`);
qaResults.push({ id: 'TC01', name: '巨型商品撞屏与荒诞追逐纯净模型名称与展开菜单', status: 'PASS' });

// 收起下拉
await evalJs(`document.body.click()`);
await new Promise((r) => setTimeout(r, 300));


// =============================================================================
// 测试用例 2：打开「手机与网页交互实机演示 (副本)」（历史缓存缺失 snapshot.nodes）
// =============================================================================
console.log('\n▶ [QA-TC02] 验证「手机与网页交互实机演示 (副本)」缓存缺失 nodes 时的健壮推导');
await evalJs(`(() => {
  window.__mountApp({
    appId: 'app-creatify-screen-interaction-copy',
    metadata: {
      name: '手机与网页交互实机演示 (副本)',
      description: '本地仅保存了 workspaceId，缺失 snapshot.nodes 节点拓扑',
      category: 'video',
      version: '1.0.0',
    },
    workflowBinding: {
      workspaceId: 'ws-screen-interaction-copy',
      // snapshot.nodes 故意缺失
    },
    formSchema: {
      type: 'object',
      properties: {
        screen_prompt: { type: 'string', title: '交互操作指令', default: '滑动屏幕并打开相册' },
      },
    },
  }, '手机与网页交互实机演示 (副本)');
})()`);
await waitFormRendered();

const tc2Trigger = await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  const trigger = fg?.querySelector('.omx-apptab-select-trigger');
  if (!trigger) return null;
  const rect = trigger.getBoundingClientRect();
  return {
    text: trigger.textContent.trim(),
    rect: { width: rect.width, height: rect.height },
  };
})()`);

console.log(`  - 缺失 nodes 时触发器文本: "${tc2Trigger?.text}"`);
console.log(`  - 触发器几何高度: ${tc2Trigger?.rect?.height}px`);

const tc2CheckModel = tc2Trigger?.text === 'Seedance 2.0';
const tc2CheckNoFallback = !tc2Trigger?.text?.includes('智能推荐');
const tc2CheckNoSuffix = !tc2Trigger?.text?.includes('工程默认') && !tc2Trigger?.text?.includes('作者推荐');
const tc2CheckHeight = Math.abs(tc2Trigger?.rect?.height - 40) <= 1;

if (!tc2CheckModel || !tc2CheckNoFallback || !tc2CheckNoSuffix || !tc2CheckHeight) {
  throw new Error(`[TC02 失败] 缺失 nodes 时未能推导为 "Seedance 2.0" 或误回退: text="${tc2Trigger?.text}"`);
}

// 展开下拉验证首项
await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  fg.querySelector('.omx-apptab-select-trigger').click();
})()`);
await new Promise((r) => setTimeout(r, 400));

const tc2Dropdown = await evalJs(`(() => {
  const panel = document.querySelector('.omx-apptab-select-options');
  const firstOption = panel?.querySelector('.omx-apptab-select-option');
  return {
    title: firstOption?.querySelector('.omx-apptab-model-name')?.textContent.trim() || '',
    sub: firstOption?.querySelector('.omx-apptab-model-sub')?.textContent.trim() || '',
  };
})()`);

console.log(`  - 下拉浮层首项标题: "${tc2Dropdown?.title}"`);
console.log(`  - 下拉浮层首项副标题: "${tc2Dropdown?.sub}"`);

if (tc2Dropdown?.title !== 'Seedance 2.0' || tc2Dropdown?.sub !== '工程预设推荐模型') {
  throw new Error(`[TC02 失败] 下拉浮层首项未正确匹配: title="${tc2Dropdown?.title}", sub="${tc2Dropdown?.sub}"`);
}

const shot2Path = join(EVIDENCE_DIR, 'qa-issue-2647-screen-interaction-copy-cache-empty.png');
await captureScreenshot(shot2Path);
console.log(`  📸 截图凭证保存: ${shot2Path}`);
qaResults.push({ id: 'TC02', name: '手机与网页交互实机演示 (副本) 缺失 nodes 健壮推导 Seedance 2.0', status: 'PASS' });

// 收起下拉
await evalJs(`document.body.click()`);
await new Promise((r) => setTimeout(r, 300));


// =============================================================================
// 测试用例 3：无头浏览器真实点选交互与切换验证（交互无透视）
// =============================================================================
console.log('\n▶ [QA-TC03] 验证真实下拉点选交互切换为 MiniMax H3 并恢复默认');
// 展开下拉
await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  fg.querySelector('.omx-apptab-select-trigger').click();
})()`);
await new Promise((r) => setTimeout(r, 300));

// 点击 MiniMax H3 选项
const clickOptionResult = await evalJs(`(() => {
  const options = Array.from(document.querySelectorAll('.omx-apptab-select-option'));
  const minimaxOpt = options.find(opt => opt.textContent.includes('MiniMax H3'));
  if (!minimaxOpt) return { found: false };
  minimaxOpt.click();
  return { found: true };
})()`);

if (!clickOptionResult.found) {
  throw new Error(`[TC03 失败] 未找到 MiniMax H3 选项！`);
}
await new Promise((r) => setTimeout(r, 400));

// 验证选中后的触发器文本和尺寸
const tc3Selected = await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  const trigger = fg?.querySelector('.omx-apptab-select-trigger');
  const panel = document.querySelector('.omx-apptab-select-options');
  const rect = trigger.getBoundingClientRect();
  return {
    text: trigger?.textContent.trim(),
    panelClosed: !panel,
    height: rect.height,
  };
})()`);

console.log(`  - 切换后触发器文本: "${tc3Selected?.text}"`);
console.log(`  - 下拉面板是否自动收起: ${tc3Selected?.panelClosed}`);
console.log(`  - 触发器高度: ${tc3Selected?.height}px`);

if (tc3Selected?.text !== 'MiniMax H3' || !tc3Selected?.panelClosed || Math.abs(tc3Selected?.height - 40) > 1) {
  throw new Error(`[TC03 失败] 点选 MiniMax H3 失败或样式异常`);
}

const shot3Path = join(EVIDENCE_DIR, 'qa-issue-2647-switch-minimax-h3.png');
await captureScreenshot(shot3Path);
console.log(`  📸 截图凭证保存: ${shot3Path}`);

// 再次点开下拉，点击切回默认项
await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  fg.querySelector('.omx-apptab-select-trigger').click();
})()`);
await new Promise((r) => setTimeout(r, 300));

await evalJs(`(() => {
  const firstOption = document.querySelector('.omx-apptab-select-option');
  firstOption.click();
})()`);
await new Promise((r) => setTimeout(r, 400));

const tc3Restored = await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  return fg?.querySelector('.omx-apptab-select-trigger')?.textContent.trim();
})()`);
console.log(`  - 切回默认模型后触发器文本: "${tc3Restored}"`);
if (tc3Restored !== 'Seedance 2.0') {
  throw new Error(`[TC03 失败] 恢复默认模型失败: "${tc3Restored}"`);
}
qaResults.push({ id: 'TC03', name: '真实下拉点选交互切换为 MiniMax H3 并恢复默认', status: 'PASS' });


// =============================================================================
// 测试用例 4：图片分类应用默认推导为 GPT Image 2.5
// =============================================================================
console.log('\n▶ [QA-TC04] 验证图片分类应用默认推导为 GPT Image 2.5');
await evalJs(`(() => {
  window.__mountApp({
    appId: 'app-ecommerce-product-photo',
    metadata: {
      name: '电商爆款商品摄影生成',
      description: '商业静物级超清商品拍摄图',
      category: 'image',
      version: '1.0.0',
    },
    formSchema: {
      type: 'object',
      properties: {
        product_name: { type: 'string', title: '商品名称', default: '真皮手提包' },
      },
    },
  }, '电商爆款商品摄影生成');
})()`);
await waitFormRendered();

const tc4Trigger = await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  const trigger = fg?.querySelector('.omx-apptab-select-trigger');
  const rect = trigger?.getBoundingClientRect();
  return {
    text: trigger?.textContent.trim(),
    height: rect?.height,
  };
})()`);

console.log(`  - 图片分类触发器文本: "${tc4Trigger?.text}"`);
console.log(`  - 触发器几何高度: ${tc4Trigger?.height}px`);

if (tc4Trigger?.text !== 'GPT Image 2.5' || Math.abs(tc4Trigger?.height - 40) > 1) {
  throw new Error(`[TC04 失败] 图片分类默认模型未能正确推导为 "GPT Image 2.5": text="${tc4Trigger?.text}"`);
}

const shot4Path = join(EVIDENCE_DIR, 'qa-issue-2647-image-category-gpt-image.png');
await captureScreenshot(shot4Path);
console.log(`  📸 截图凭证保存: ${shot4Path}`);
qaResults.push({ id: 'TC04', name: '图片分类应用默认推导为 GPT Image 2.5 且高度 40px', status: 'PASS' });


// =============================================================================
// 测试用例 5：显式 defaultModel: 'kling-o3' 的工程默认模型推导
// =============================================================================
console.log('\n▶ [QA-TC05] 验证显式 defaultModel 为 kling-o3 时的精准推导');
await evalJs(`(() => {
  window.__mountApp({
    appId: 'app-kling-o3-cinematic',
    metadata: {
      name: '可灵光影电影感生成',
      description: '深度调用可灵视频大模型',
      defaultModel: 'kling-o3',
      category: 'video',
      version: '1.0.0',
    },
    formSchema: {
      type: 'object',
      properties: {
        scene: { type: 'string', title: '场景描述', default: '雨夜赛博朋克街道' },
      },
    },
  }, '可灵光影电影感生成');
})()`);
await waitFormRendered();

const tc5Trigger = await evalJs(`(() => {
  const fg = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(el => el.textContent.includes('生成模型'));
  const trigger = fg?.querySelector('.omx-apptab-select-trigger');
  return {
    text: trigger?.textContent.trim(),
  };
})()`);

console.log(`  - 显式配置 kling-o3 触发器文本: "${tc5Trigger?.text}"`);
if (tc5Trigger?.text !== '可灵 Kling O3') {
  throw new Error(`[TC05 失败] 显式 defaultModel: kling-o3 未能解析为 "可灵 Kling O3": text="${tc5Trigger?.text}"`);
}
qaResults.push({ id: 'TC05', name: '显式 defaultModel 声明 (kling-o3) 精准推导为 可灵 Kling O3', status: 'PASS' });


console.log('\n====================================================');
console.log('🎉 验收矩阵 5 大测试用例在真实无头 Chrome 中全部 PASS！');
console.log('====================================================');
console.table(qaResults);

cleanup();
