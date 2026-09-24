/**
 * scripts/verify-issue-2642-browser-e2e.mjs
 *
 * 真实无头 Chrome 浏览器环境端到端质量验收脚本 (Issue #2642)
 *
 * 验证矩阵：
 * 1. 默认模型显式绑定工程作者模型：
 *    - 表单首部下拉框收起态呈现 `Seedance 2.0 (工程默认 · 作者推荐)`
 *    - 展开菜单首项呈现 `Seedance 2.0 (工程默认 · 作者推荐)` 及其说明
 * 2. 多参数（比例、时长、分辨率）跟随模型契约自适应：
 *    - 切换模型至 MiniMax H3
 *    - 时长超出范围平滑收敛 (20s -> 15s)
 *    - 分辨率不支持平滑收敛 ('480p' -> '2K')
 *    - 支持的比例正常保留 ('21:9')
 *    - 独立画质参数 quality 严密保护不被篡改 ('hd')
 * 3. 时长输入框键盘输入多位数字（如 10）流畅无跳变与强制 clamp：
 *    - 连续输入 '1' 和 '0'，检查过程中无提前强行 clamp 为 4，最终稳定为 10
 * 4. 提交数据完整性与几何尺寸正向校验：
 *    - 所有表单和控件具备正几何尺寸（width > 0, height > 0）
 *    - 提交 payload 参数完全合规
 * 5. 截图证据落盘至 docs/evidence/
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

console.log('🚀 开始构建浏览器端 AppTab 单页应用与测试环境...');

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
  <title>Issue #2642 AppTab Real Browser Verification</title>
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
    // 注入 mock 宿主 API
    window.__submittedPayload = null;
    window.__OMNIMUX_APPS_EXECUTE__ = async (manifest, formValues) => {
      window.__submittedPayload = { manifest, formValues };
      return {
        executionId: 'exec_verified_browser_2642',
        mediaUrl: 'https://cdn.omnimux.com/verified-output.mp4',
        status: 'COMPLETED'
      };
    };
  </script>
  <script>${appBundleCode}</script>
  <script>
    const SEEDANCE_APP_MANIFEST = {
      appId: 'app-seedance-author-demo',
      metadata: {
        name: 'Seedance 2.0 影视级分镜重构',
        description: '由工程作者深度配置的 Seedance 2.0 影视渲染应用',
        version: '1.0.0',
        official: true,
      },
      workflowBinding: {
        workflowId: 'wf_seedance_author_01',
        snapshot: {
          nodes: [
            {
              id: 'node-prompt-llm',
              type: 'llm_generate',
              data: { model: 'deepseek-v3', params: {} },
            },
            {
              id: 'node-main-generator',
              type: 'omnimux_video_submit',
              data: {
                model: 'seedance-2.0',
                params: {
                  duration: 20,
                  aspectRatio: '21:9',
                  resolution: '480p',
                },
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
            enum: ['9:16', '16:9', '1:1', '21:9'],
            default: '21:9',
          },
          duration: {
            type: 'integer',
            title: '成片时长 (秒)',
            widget: 'slider-range',
            minimum: 4,
            maximum: 20,
            default: 20,
          },
          resolution: {
            type: 'string',
            title: '清晰度',
            widget: 'select-single',
            options: [
              { label: '480p 标清', value: '480p' },
              { label: '720p 高清', value: '720p' },
              { label: '1080p 超清', value: '1080p' },
            ],
            default: '480p',
          },
          quality: {
            type: 'string',
            title: '生成画质',
            widget: 'select-single',
            options: [
              { label: '标准画质', value: 'standard' },
              { label: '超清旗舰', value: 'hd' },
            ],
            default: 'hd',
          },
        },
      },
      demoSnapshot: {
        product_image: '/assets/sample-shoe.webp',
        aspect_ratio: '21:9',
        duration: 20,
        resolution: '480p',
        quality: 'hd',
      },
    };

    const rootContainer = document.getElementById('root');
    const root = window.ReactDOMClient.createRoot(rootContainer);
    root.render(
      window.React.createElement(window.AppTab, {
        seed: {
          id: 'tab_seedance_test',
          title: 'Seedance 2.0 影视级分镜重构',
          extra: { manifest: SEEDANCE_APP_MANIFEST },
        },
      })
    );
    window.__appMounted = true;
  </script>
</body>
</html>`;

// 4. 启动轻量静态 HTTP 服务器
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlPage);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const serverPort = server.address().port;
const appUrl = `http://127.0.0.1:${serverPort}/`;
console.log(`🌐 临时 HTTP 服务已启动: ${appUrl}`);

// 5. 启动无头 Google Chrome
const cdpPort = 9600 + Math.floor(Math.random() * 300);
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

// 等待 Chrome 启动
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

// 等待 React 挂载与 DOM 稳定
await new Promise((r) => setTimeout(r, 1000));
await evalJs(`new Promise((resolve) => {
  const check = () => {
    if (window.__appMounted && document.querySelector('.omx-apptab-form')) resolve(true);
    else setTimeout(check, 100);
  };
  check();
})`);

console.log('✅ Chrome 浏览器已挂载真实页面，开始执行验收断言与截图取证...');

const evidenceResults = {
  task: 'workflow-apptab-model-contracts-issue-2642',
  verifiedAt: new Date().toISOString(),
  environment: {
    browser: 'Google Chrome (Official Build, headless)',
    url: appUrl,
    viewport: '1440x900',
  },
  scenarios: {},
};

// ==========================================
// 场景 1：默认模型显式绑定工程作者模型
// ==========================================
console.log('\n--- 场景 1：核验默认模型显式绑定工程作者模型 ---');
const scene1Data = await evalJs(`(() => {
  const form = document.querySelector('.omx-apptab-form');
  const fieldGroups = Array.from(document.querySelectorAll('.omx-apptab-field-group'));
  const modelGroup = fieldGroups.find(g => g.textContent.includes('生成模型'));
  const trigger = modelGroup?.querySelector('.omx-apptab-select-trigger');
  const rect = trigger?.getBoundingClientRect();

  return {
    formMounted: Boolean(form),
    triggerText: trigger?.textContent?.trim() || '',
    triggerGeometry: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
  };
})()`);

console.log(`[场景 1] 首行模型下拉框收起态按钮文本: "${scene1Data.triggerText}"`);
console.log(`[场景 1] 几何尺寸: ${JSON.stringify(scene1Data.triggerGeometry)}`);

if (!scene1Data.triggerText.includes('Seedance 2.0 (工程默认 · 作者推荐)')) {
  throw new Error(`场景 1 失败：收起态下拉按钮未显式呈现工程作者模型！实际文本: "${scene1Data.triggerText}"`);
}
if (!scene1Data.triggerGeometry || scene1Data.triggerGeometry.width <= 0 || scene1Data.triggerGeometry.height <= 0) {
  throw new Error('场景 1 失败：模型下拉框几何尺寸非正数！');
}

// 点击展开下拉框
await evalJs(`(() => {
  const fieldGroups = Array.from(document.querySelectorAll('.omx-apptab-field-group'));
  const modelGroup = fieldGroups.find(g => g.textContent.includes('生成模型'));
  const trigger = modelGroup?.querySelector('.omx-apptab-select-trigger');
  trigger.click();
})()`);

await new Promise((r) => setTimeout(r, 400));

const scene1DropdownData = await evalJs(`(() => {
  const optionsPanel = document.querySelector('.omx-apptab-select-options');
  if (!optionsPanel) return null;
  const options = Array.from(optionsPanel.querySelectorAll('.omx-apptab-select-option'));
  const firstOpt = options[0];
  const nameEl = firstOpt?.querySelector('.omx-apptab-model-name');
  const subEl = firstOpt?.querySelector('.omx-apptab-model-sub');
  const panelRect = optionsPanel.getBoundingClientRect();

  return {
    isOpen: true,
    firstOptionTitle: nameEl?.textContent?.trim() || firstOpt?.textContent?.trim() || '',
    firstOptionSubtitle: subEl?.textContent?.trim() || '',
    panelGeometry: { x: panelRect.x, y: panelRect.y, width: panelRect.width, height: panelRect.height },
    allOptionsCount: options.length,
  };
})()`);

console.log(`[场景 1] 下拉浮层首项标题: "${scene1DropdownData?.firstOptionTitle}"`);
console.log(`[场景 1] 下拉浮层首项副标题: "${scene1DropdownData?.firstOptionSubtitle}"`);
console.log(`[场景 1] 浮层几何尺寸: ${JSON.stringify(scene1DropdownData?.panelGeometry)}`);

if (!scene1DropdownData?.firstOptionTitle.includes('Seedance 2.0 (工程默认 · 作者推荐)')) {
  throw new Error(`场景 1 失败：下拉浮层首项标题未包含工程作者模型！实际: "${scene1DropdownData?.firstOptionTitle}"`);
}
if (!scene1DropdownData?.firstOptionSubtitle.includes('当前工程节点预设模型，与分镜提示词深度调优')) {
  throw new Error(`场景 1 失败：下拉浮层首项副标题不符合契约！实际: "${scene1DropdownData?.firstOptionSubtitle}"`);
}

// 截取场景 1 证据图片
const shot1Res = await sendCdp('Page.captureScreenshot', { format: 'png' });
const shot1Path = join(EVIDENCE_DIR, 'issue-2642-default-model-bound-verified.png');
writeFileSync(shot1Path, Buffer.from(shot1Res.data, 'base64'));
console.log(`📸 场景 1 证据截图已落盘: ${shot1Path}`);

evidenceResults.scenarios.scenario1_defaultModel = {
  verdict: 'PASS',
  triggerText: scene1Data.triggerText,
  firstOptionTitle: scene1DropdownData.firstOptionTitle,
  firstOptionSubtitle: scene1DropdownData.firstOptionSubtitle,
  triggerGeometry: scene1Data.triggerGeometry,
  panelGeometry: scene1DropdownData.panelGeometry,
  screenshot: 'docs/evidence/issue-2642-default-model-bound-verified.png',
};

// ==========================================
// 场景 2：多参数跟随模型契约自适应联动与自动收敛
// ==========================================
console.log('\n--- 场景 2：核验切换模型后多参数契约联动与自动收敛 ---');

// 点击切换至 MiniMax H3
const switchResult = await evalJs(`(() => {
  const optionsPanel = document.querySelector('.omx-apptab-select-options');
  const options = Array.from(optionsPanel.querySelectorAll('.omx-apptab-select-option'));
  const minimaxOpt = options.find(o => o.textContent.includes('MiniMax H3'));
  if (!minimaxOpt) return { found: false };
  minimaxOpt.click();
  return { found: true };
})()`);

if (!switchResult.found) {
  throw new Error('场景 2 失败：在模型下拉列表中未找到 MiniMax H3 选项！');
}

await new Promise((r) => setTimeout(r, 600));

// 检查切换后的表单状态与各控件值
const scene2Data = await evalJs(`(() => {
  const fieldGroups = Array.from(document.querySelectorAll('.omx-apptab-field-group'));
  
  // 1. 生成模型
  const modelGroup = fieldGroups.find(g => g.textContent.includes('生成模型'));
  const trigger = modelGroup?.querySelector('.omx-apptab-select-trigger');

  // 2. 成片时长
  const durGroup = fieldGroups.find(g => g.textContent.includes('成片时长'));
  const numInput = durGroup?.querySelector('input[type="number"]');
  const durMin = numInput?.getAttribute('min');
  const durMax = numInput?.getAttribute('max');
  const durVal = numInput?.value;

  // 3. 清晰度 (分辨率)
  const resGroup = fieldGroups.find(g => g.textContent.includes('清晰度'));
  const resTrigger = resGroup?.querySelector('.omx-apptab-select-trigger');
  const resVal = resTrigger?.textContent?.trim() || '';

  // 4. 成片画幅 (比例)
  const ratioGroup = fieldGroups.find(g => g.textContent.includes('成片画幅'));
  const activeRatioCard = ratioGroup?.querySelector('.omx-apptab-ratio-card.is-active');
  const ratioVal = activeRatioCard?.textContent?.trim() || '';

  // 5. 生成画质 quality
  const qualityGroup = fieldGroups.find(g => g.textContent.includes('生成画质'));
  const qualityTrigger = qualityGroup?.querySelector('.omx-apptab-select-trigger');
  const qualityVal = qualityTrigger?.textContent?.trim() || '';

  return {
    selectedModelText: trigger?.textContent?.trim() || '',
    duration: { value: durVal, min: durMin, max: durMax },
    resolution: resVal,
    aspectRatio: ratioVal,
    quality: qualityVal,
  };
})()`);

console.log(`[场景 2] 切换后模型下拉框文本: "${scene2Data.selectedModelText}"`);
console.log(`[场景 2] 时长自适应收敛: 当前值=${scene2Data.duration.value} (min=${scene2Data.duration.min}, max=${scene2Data.duration.max})`);
console.log(`[场景 2] 分辨率自适应重置: 当前值="${scene2Data.resolution}"`);
console.log(`[场景 2] 画幅比例当前选中: "${scene2Data.aspectRatio}"`);
console.log(`[场景 2] 独立画质 quality 当前值: "${scene2Data.quality}"`);

if (!scene2Data.selectedModelText.includes('MiniMax H3')) {
  throw new Error(`场景 2 失败：模型未成功切换至 MiniMax H3！实际: "${scene2Data.selectedModelText}"`);
}
// MiniMax H3 契约：连续区间 4–15s。原时长为 20s，必须安全收敛为上限 15s！
if (Number(scene2Data.duration.value) !== 15 || Number(scene2Data.duration.max) !== 15 || Number(scene2Data.duration.min) !== 4) {
  throw new Error(`场景 2 失败：时长未按 MiniMax H3 契约 (4–15s) 收敛！当前值: ${scene2Data.duration.value}`);
}
// MiniMax H3 契约：支持 2K, 768P。原分辨率 480p 不被支持，必须重置为默认 2K！
if (!scene2Data.resolution.includes('2K')) {
  throw new Error(`场景 2 失败：分辨率未按契约重置为 2K！当前值: "${scene2Data.resolution}"`);
}
// MiniMax H3 支持 21:9，原 21:9 必须保持
if (!scene2Data.aspectRatio.includes('21:9')) {
  throw new Error(`场景 2 失败：支持的比例 21:9 未被保留！当前值: "${scene2Data.aspectRatio}"`);
}
// 独立画质 quality 必须保持 'hd'，绝不被误认为 resolution 抹掉
if (!scene2Data.quality.includes('超清旗舰') && !scene2Data.quality.includes('hd')) {
  throw new Error(`场景 2 失败：独立画质 quality 被误篡改！当前值: "${scene2Data.quality}"`);
}

// 截取场景 2 证据图片
const shot2Res = await sendCdp('Page.captureScreenshot', { format: 'png' });
const shot2Path = join(EVIDENCE_DIR, 'issue-2642-model-switch-contract-sync-verified.png');
writeFileSync(shot2Path, Buffer.from(shot2Res.data, 'base64'));
console.log(`📸 场景 2 证据截图已落盘: ${shot2Path}`);

evidenceResults.scenarios.scenario2_contractSync = {
  verdict: 'PASS',
  selectedModelText: scene2Data.selectedModelText,
  durationConvergence: scene2Data.duration,
  resolutionReset: scene2Data.resolution,
  aspectRatioPreserved: scene2Data.aspectRatio,
  independentQualityPreserved: scene2Data.quality,
  screenshot: 'docs/evidence/issue-2642-model-switch-contract-sync-verified.png',
};

// ==========================================
// 场景 3：时长输入框键盘输入多位数字流畅无跳变与强制 clamp
// ==========================================
console.log('\n--- 场景 3：核验键盘连续输入多位数（如 10）流畅无跳变 ---');

// 聚焦输入框并清空
await evalJs(`(() => {
  const durGroup = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(g => g.textContent.includes('成片时长'));
  const numInput = durGroup?.querySelector('input[type="number"]');
  numInput.focus();
  numInput.value = '';
  numInput.dispatchEvent(new Event('input', { bubbles: true }));
  numInput.dispatchEvent(new Event('change', { bubbles: true }));
})()`);

await new Promise((r) => setTimeout(r, 200));

// 键入首字符 '1'
await evalJs(`(() => {
  const durGroup = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(g => g.textContent.includes('成片时长'));
  const numInput = durGroup?.querySelector('input[type="number"]');
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(numInput, '1');
  } else {
    numInput.value = '1';
  }
  numInput.dispatchEvent(new Event('input', { bubbles: true }));
  numInput.dispatchEvent(new Event('change', { bubbles: true }));
})()`);

await new Promise((r) => setTimeout(r, 100));

const char1Value = await evalJs(`(() => {
  const durGroup = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(g => g.textContent.includes('成片时长'));
  return durGroup?.querySelector('input[type="number"]')?.value;
})()`);

console.log(`[场景 3] 键入字符 '1' 后的即时值: "${char1Value}"`);
if (String(char1Value) !== '1') {
  throw new Error(`场景 3 失败：输入 '1' 时遭遇强制 clamp！实际值: "${char1Value}" (期望为 '1')`);
}

// 紧接着键入第二个字符 '0'，合成 '10'
await evalJs(`(() => {
  const durGroup = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(g => g.textContent.includes('成片时长'));
  const numInput = durGroup?.querySelector('input[type="number"]');
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(numInput, '10');
  } else {
    numInput.value = '10';
  }
  numInput.dispatchEvent(new Event('input', { bubbles: true }));
  numInput.dispatchEvent(new Event('change', { bubbles: true }));
})()`);

await new Promise((r) => setTimeout(r, 100));

const char2Value = await evalJs(`(() => {
  const durGroup = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(g => g.textContent.includes('成片时长'));
  return durGroup?.querySelector('input[type="number"]')?.value;
})()`);

console.log(`[场景 3] 键入第二个字符 '0' 后的即时值: "${char2Value}"`);
if (String(char2Value) !== '10') {
  throw new Error(`场景 3 失败：输入 '10' 时异常跳变！实际值: "${char2Value}" (期望为 '10')`);
}

// 失焦 blur
await evalJs(`(() => {
  const durGroup = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(g => g.textContent.includes('成片时长'));
  const numInput = durGroup?.querySelector('input[type="number"]');
  numInput.blur();
  numInput.dispatchEvent(new Event('blur', { bubbles: true }));
})()`);

await new Promise((r) => setTimeout(r, 100));

const finalDurationValue = await evalJs(`(() => {
  const durGroup = Array.from(document.querySelectorAll('.omx-apptab-field-group')).find(g => g.textContent.includes('成片时长'));
  return durGroup?.querySelector('input[type="number"]')?.value;
})()`);

console.log(`[场景 3] 失焦后的稳定值: "${finalDurationValue}"`);
if (Number(finalDurationValue) !== 10) {
  throw new Error(`场景 3 失败：失焦后时长值不是 10！实际值: "${finalDurationValue}"`);
}

// 截取场景 3 证据图片
const shot3Res = await sendCdp('Page.captureScreenshot', { format: 'png' });
const shot3Path = join(EVIDENCE_DIR, 'issue-2642-duration-input-smooth-verified.png');
writeFileSync(shot3Path, Buffer.from(shot3Res.data, 'base64'));
console.log(`📸 场景 3 证据截图已落盘: ${shot3Path}`);

evidenceResults.scenarios.scenario3_smoothNumberInput = {
  verdict: 'PASS',
  char1IntermediateValue: char1Value,
  char2FinalValue: char2Value,
  afterBlurValue: finalDurationValue,
  clampLagPrevented: true,
  screenshot: 'docs/evidence/issue-2642-duration-input-smooth-verified.png',
};

// ==========================================
// 场景 4：表单提交与生成调用数据完整性校验
// ==========================================
console.log('\n--- 场景 4：核验表单提交与生成调用数据完整性 ---');

await evalJs(`(() => {
  const submitBtn = document.querySelector('.omx-apptab-cta-btn');
  submitBtn.click();
})()`);

await new Promise((r) => setTimeout(r, 500));

const submissionData = await evalJs(`window.__submittedPayload`);
console.log(`[场景 4] 提交 payload 提取: ${JSON.stringify(submissionData?.formValues)}`);

if (!submissionData) {
  throw new Error('场景 4 失败：未成功捕获提交的表单数据！');
}
if (submissionData.formValues.__model__ !== 'minimax-h3') {
  throw new Error(`场景 4 失败：提交模型不是 minimax-h3！实际: "${submissionData.formValues.__model__}"`);
}
if (Number(submissionData.formValues.duration) !== 10) {
  throw new Error(`场景 4 失败：提交时长不是 10s！实际: ${submissionData.formValues.duration}`);
}
if (submissionData.formValues.resolution !== '2K') {
  throw new Error(`场景 4 失败：提交分辨率不是 2K！实际: "${submissionData.formValues.resolution}"`);
}
if (submissionData.formValues.aspect_ratio !== '21:9') {
  throw new Error(`场景 4 失败：提交比例不是 21:9！实际: "${submissionData.formValues.aspect_ratio}"`);
}
if (submissionData.formValues.quality !== 'hd') {
  throw new Error(`场景 4 失败：提交画质 quality 不是 hd！实际: "${submissionData.formValues.quality}"`);
}

evidenceResults.scenarios.scenario4_submissionValidation = {
  verdict: 'PASS',
  submittedModel: submissionData.formValues.__model__,
  submittedDuration: submissionData.formValues.duration,
  submittedResolution: submissionData.formValues.resolution,
  submittedAspectRatio: submissionData.formValues.aspect_ratio,
  submittedQuality: submissionData.formValues.quality,
};

// 7. 关闭浏览器与测试服务器
cleanup();

evidenceResults.finalVerdict = 'PASS';
evidenceResults.allPassed = true;

const jsonPath = join(EVIDENCE_DIR, 'workflow-apptab-model-contracts-issue-2642-e2e-evidence.json');
writeFileSync(jsonPath, JSON.stringify(evidenceResults, null, 2), 'utf-8');
console.log(`\n🎉 真实浏览器端到端验收全部通过！结构化结果已写入: ${jsonPath}`);
