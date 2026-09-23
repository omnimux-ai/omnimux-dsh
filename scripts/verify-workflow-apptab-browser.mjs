#!/usr/bin/env node
/**
 * scripts/verify-workflow-apptab-browser.mjs
 *
 * 交付前真实浏览器（Headless Chrome + CDP）全量端到端质量验收脚本 (Issue #2607)
 * 覆盖验收矩阵：
 * 1. 经典应用（如「巨型商品撞屏与荒诞追逐」app-creatify-chasing-product）翻新核验：
 *    - 视频成片比例：ratio-cards 可视化比例卡片按钮组（9:16、16:9、1:1），点击切换高亮激活态
 *    - 解说人声音色：select-single 标准定制下拉菜单，展开与点选切换、文本更新
 *    - 商品主图：标准触发行与卡片化展示，支持一键移除并退回触发行
 * 2. 复合控件全类型健全验证：
 *    - 选项卡（segmented-tabs）：并排切换生效
 *    - 多选胶囊（multi-tags）：标签点选、上限禁用与提示
 *    - 媒体输入（media-uploader）：卡片化展示与一键移除
 * 3. 真实浏览器环境渲染取证：
 *    - 正几何断言（width > 0, height > 0）
 *    - 捕获高分辨率真实渲染 PNG 截图并写入 docs/evidence/workflow-apptab-widgets-browser.png
 * 4. 动态端口与优雅自清理
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { PNG } from 'pngjs';
import { findChromePath, assertPng } from './worktree-web-qa.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const CHASING_PRODUCT_APP = {
  appId: 'app-creatify-chasing-product',
  metadata: {
    name: '巨型商品撞屏与荒诞追逐',
    description: '围绕特定核心商品进行主体视觉锁定与多视角运镜渲染',
    version: '1.2.0',
    official: true,
  },
  formSchema: {
    type: 'object',
    properties: {
      product_image: {
        type: 'string',
        title: '商品主图',
        widget: 'library-picker',
        description: '上传高清商品图，或从资产库选择',
        default: '/assets/sample-shoe.webp',
        library: 'asset',
      },
      aspect_ratio: {
        type: 'string',
        title: '视频成片比例',
        enum: ['9:16', '16:9', '1:1'],
        default: '9:16',
      },
      voice: {
        type: 'string',
        title: '解说人声音色',
        options: [
          { label: '活力女声（电商促销爆款）', value: 'zh_female_energetic' },
          { label: '沉稳男声（数码科技大片）', value: 'zh_male_calm' },
          { label: '甜美解说（美妆护肤首选）', value: 'zh_female_sweet' },
          { label: '磁性男声（轻奢格调推荐）', value: 'zh_male_magnetic' },
        ],
        default: 'zh_female_energetic',
      },
    },
  },
  fieldMappings: {
    product_image: { widget: 'library-picker', library: 'asset' },
    aspect_ratio: { widget: 'ratio-cards' },
    voice: { widget: 'select-single' },
  },
  demoSnapshot: {
    product_image: '/assets/sample-shoe.webp',
    aspect_ratio: '9:16',
    voice: 'zh_female_energetic',
  },
};

const COMPOUND_WIDGETS_APP = {
  appId: 'app-builtin-compound-widgets',
  metadata: {
    name: '复合控件展示应用',
    description: '验证选项卡、多选胶囊与媒体输入卡片',
    version: '1.0.0',
  },
  formSchema: {
    type: 'object',
    properties: {
      video_type: {
        type: 'string',
        title: '视频类型',
        widget: 'segmented-tabs',
        options: [
          { label: '预设视频', value: 'preset' },
          { label: '自定义视频', value: 'custom' },
        ],
        default: 'preset',
      },
      platforms: {
        type: 'array',
        title: '发布平台',
        widget: 'multi-tags',
        options: [
          { label: 'TikTok', value: 'tiktok' },
          { label: 'YouTube Shorts', value: 'youtube' },
          { label: 'Instagram Reels', value: 'instagram' },
          { label: '小红书', value: 'xiaohongshu' },
        ],
        maxItems: 3,
        default: ['tiktok'],
      },
      hero_media: {
        type: 'string',
        title: '素材文件',
        widget: 'media-uploader',
        default: 'https://example.com/demo.mp4',
      },
    },
  },
  fieldMappings: {
    video_type: { widget: 'segmented-tabs' },
    platforms: { widget: 'multi-tags' },
    hero_media: { widget: 'media-uploader' },
  },
  demoSnapshot: {
    video_type: 'preset',
    platforms: ['tiktok'],
    hero_media: 'https://example.com/demo.mp4',
  },
};

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
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { AppTab } from './plugins/omnimux-workflow/src/client/projects/AppTab.jsx';

        const CHASING_APP = ${JSON.stringify(CHASING_PRODUCT_APP)};
        const COMPOUND_APP = ${JSON.stringify(COMPOUND_WIDGETS_APP)};

        function TestHarness() {
          const [currentAppId, setCurrentAppId] = useState('chasing');

          const manifest = currentAppId === 'chasing' ? CHASING_APP : COMPOUND_APP;

          return React.createElement('div', { className: 'qa-harness-root' },
            React.createElement('div', { className: 'qa-toolbar', style: { padding: '12px 16px', borderBottom: '1px solid var(--dsw-alias-border-subtle, #333)', display: 'flex', gap: '8px' } },
              React.createElement('button', {
                id: 'btn-switch-chasing',
                onClick: () => setCurrentAppId('chasing'),
                style: { padding: '6px 12px', background: currentAppId === 'chasing' ? 'var(--dsw-alias-brand-primary, #1677ff)' : '#444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }
              }, '经典应用（巨型商品撞屏）'),
              React.createElement('button', {
                id: 'btn-switch-compound',
                onClick: () => setCurrentAppId('compound'),
                style: { padding: '6px 12px', background: currentAppId === 'compound' ? 'var(--dsw-alias-brand-primary, #1677ff)' : '#444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }
              }, '复合控件全类型应用')
            ),
            React.createElement('div', { id: 'apptab-container', style: { padding: '20px' } },
              React.createElement(AppTab, {
                key: currentAppId,
                seed: {
                  id: 'app_' + manifest.appId,
                  extra: { manifest },
                }
              })
            )
          );
        }

        window.__qa_init = () => {
          const container = document.getElementById('root');
          const root = createRoot(container);
          root.render(React.createElement(TestHarness));
          window.__qa_ready = true;
        };
      `,
      resolveDir: REPO_ROOT,
      sourcefile: 'verify-entry.js',
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
          b.onResolve({ filter: /\.(css|less|scss)$/ }, () => ({
            path: 'stub-css',
            namespace: 'stub-css',
          }));
          b.onLoad({ filter: /.*/, namespace: 'stub-css' }, () => ({
            contents: 'module.exports = {};',
            loader: 'js',
          }));
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
  <title>AppTab 表单控件端到端真实浏览器验收</title>
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
    body {
      margin: 0;
      padding: 0;
      background: #141414;
      min-height: 100vh;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>${bundleJs}<\/script>
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      window.__qa_init();
    });
  <\/script>
</body>
</html>`;
}

async function runBrowserQa() {
  console.log('🚀 开始 AppTab 表单控件真实浏览器与端到端质量验收...');

  const chromePath = findChromePath();
  console.log(`[QA] 找到 Chrome 可执行路径: ${chromePath}`);

  console.log('[QA] 正在使用 esbuild 打包浏览器测试组件...');
  const bundleJs = await buildBundle();
  const htmlContent = generateHtml(bundleJs);

  // 1. 启动轻量静态服务器（动态端口 0）
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlContent);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const pageUrl = `http://127.0.0.1:${port}/`;
  console.log(`[QA] 本地测试服务器就绪: ${pageUrl}`);

  // 2. 启动无头 Chrome
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
  const cdpPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome 启动超时')), 15000);
    let buf = '';
    chrome.stderr.on('data', (chunk) => {
      buf += chunk.toString();
      const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buf);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
  });

  cdpPort = await cdpPromise;
  console.log(`[QA] 无头 Chrome 已连接 CDP 端口: ${cdpPort}`);

  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const pageTarget = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let seq = 0;
  const pending = new Map();
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params ?? {} }));
    });

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('   [Browser Console]', msg.params.type, ...msg.params.args.map(a => a.value || a.description));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('   [Browser Exception]', msg.params.exceptionDetails);
    }
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve: yes, reject: no } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) no(new Error(`CDP 错误 ${msg.error.message}`));
    else yes(msg.result);
  };

  const evalJs = async (expr) => {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`JS 执行异常: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  };

  const results = [];
  const record = (name, pass, detail) => {
    results.push({ name, pass, detail });
    const mark = pass ? '✅' : '❌';
    console.log(`   ${mark} [${name}]: ${detail}`);
    assert.ok(pass, `验收断言失败 [${name}]: ${detail}`);
  };

  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: pageUrl });

    // 等待 React 挂载
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const ready = await evalJs('Boolean(window.__qa_ready && document.querySelector(".omx-apptab-root"))');
      if (ready) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    const initialMounted = await evalJs('Boolean(document.querySelector(".omx-apptab-root"))');
    record('apptab-dom-mounted', initialMounted, 'AppTab 根布局在真实浏览器成功挂载');

    // ==========================================
    // 验收矩阵 1: 经典应用「巨型商品撞屏与荒诞追逐」翻新核验
    // ==========================================
    console.log('\n--- 1. 经典应用翻新核验（app-creatify-chasing-product） ---');

    // 1.1 视频成片比例 (aspect_ratio) 升级为比例卡片组
    const ratioCheck = await evalJs(`(() => {
      const grid = document.querySelector('.omx-apptab-ratio-grid');
      if (!grid) return { found: false };
      const cards = Array.from(grid.querySelectorAll('.omx-apptab-ratio-card'));
      const activeCard = cards.find(c => c.classList.contains('is-active'));
      const rect = grid.getBoundingClientRect();
      return {
        found: true,
        count: cards.length,
        labels: cards.map(c => c.textContent.trim()),
        defaultActive: activeCard ? activeCard.textContent.trim() : null,
        width: rect.width,
        height: rect.height
      };
    })()`);

    record('ratio-cards-rendered', ratioCheck.found && ratioCheck.count === 3, `比例卡片组渲染成功（数量: ${ratioCheck.count}，选项: ${ratioCheck.labels.join(', ')}）`);
    record('ratio-cards-positive-geometry', ratioCheck.width > 0 && ratioCheck.height > 0, `比例卡片具有正几何（${ratioCheck.width}x${ratioCheck.height}px）`);
    record('ratio-cards-default-active', ratioCheck.defaultActive === '9:16', `默认激活比例为 9:16`);

    // 交互：点击 16:9 卡片
    await evalJs(`(() => {
      const cards = Array.from(document.querySelectorAll('.omx-apptab-ratio-card'));
      const card16x9 = cards.find(c => c.textContent.trim().startsWith('16:9'));
      if (card16x9) card16x9.click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const ratioClickResult = await evalJs(`(() => {
      const cards = Array.from(document.querySelectorAll('.omx-apptab-ratio-card'));
      const newActive = cards.find(c => c.classList.contains('is-active'));
      const oldActive = cards.find(c => c.textContent.trim().startsWith('9:16'));
      return {
        clicked: true,
        newActiveLabel: newActive ? newActive.textContent.trim() : null,
        oldIsActive: oldActive ? oldActive.classList.contains('is-active') : false
      };
    })()`);

    record('ratio-cards-click-toggle', ratioClickResult.newActiveLabel === '16:9' && !ratioClickResult.oldIsActive, `点击 16:9 后高亮激活态切换成功（当前激活: ${ratioClickResult.newActiveLabel}，原卡片失活）`);

    // 1.2 解说人声音色 (voice) 升级为标准定制下拉菜单
    const voiceCheck = await evalJs(`(() => {
      const select = document.querySelector('.omx-apptab-select-single');
      if (!select) return { found: false };
      const trigger = select.querySelector('.omx-apptab-select-trigger');
      const rect = select.getBoundingClientRect();
      return {
        found: true,
        triggerText: trigger ? trigger.textContent.trim() : '',
        width: rect.width,
        height: rect.height
      };
    })()`);

    record('voice-select-rendered', voiceCheck.found, `音色定制单选下拉菜单渲染成功（触发器文案: ${voiceCheck.triggerText}）`);
    record('voice-select-positive-geometry', voiceCheck.width > 0 && voiceCheck.height > 0, `单选下拉菜单具有正几何（${voiceCheck.width}x${voiceCheck.height}px）`);
    record('voice-select-default-value', voiceCheck.triggerText === '活力女声（电商促销爆款）', `默认展示为「活力女声（电商促销爆款）」`);

    // 交互：点击触发器展开下拉面板
    await evalJs(`(() => {
      const trigger = document.querySelector('.omx-apptab-select-single .omx-apptab-select-trigger');
      if (trigger) trigger.click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const voiceExpandResult = await evalJs(`(() => {
      const optionsPanel = document.querySelector('.omx-apptab-select-options');
      if (!optionsPanel) return { opened: false };
      const options = Array.from(optionsPanel.querySelectorAll('.omx-apptab-select-option'));
      const rect = optionsPanel.getBoundingClientRect();
      return {
        opened: true,
        optionCount: options.length,
        options: options.map(o => o.textContent.trim()),
        width: rect.width,
        height: rect.height
      };
    })()`);

    record('voice-select-expand', voiceExpandResult.opened && voiceExpandResult.optionCount >= 4, `点击触发器展开下拉面板成功（候选数: ${voiceExpandResult.optionCount}，面板尺寸: ${voiceExpandResult.width}x${voiceExpandResult.height}px）`);

    // 交互：点选「沉稳男声（数码科技大片）」
    await evalJs(`(() => {
      const options = Array.from(document.querySelectorAll('.omx-apptab-select-option'));
      const maleOpt = options.find(o => o.textContent.includes('沉稳男声'));
      if (maleOpt) maleOpt.click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const voiceSelectResult = await evalJs(`(() => {
      const optionsPanel = document.querySelector('.omx-apptab-select-options');
      const trigger = document.querySelector('.omx-apptab-select-trigger');
      return {
        selected: true,
        panelClosed: optionsPanel === null,
        newTriggerText: trigger ? trigger.textContent.trim() : ''
      };
    })()`);

    record('voice-select-option-select', voiceSelectResult.selected && voiceSelectResult.panelClosed && voiceSelectResult.newTriggerText === '沉稳男声（数码科技大片）', `点选沉稳男声音色成功（面板自动收起，触发器更新为: ${voiceSelectResult.newTriggerText}）`);

    // 1.3 商品主图 (product_image) 触发行与已选卡片化展示
    const productImageCheck = await evalJs(`(() => {
      const picked = document.querySelector('.omx-apptab-picked');
      if (!picked) return { found: false };
      const thumb = picked.querySelector('.omx-apptab-picked-thumb');
      const title = picked.querySelector('.omx-apptab-picked-title');
      const clearBtn = picked.querySelector('.omx-apptab-picked-clear');
      const rect = picked.getBoundingClientRect();
      return {
        found: true,
        hasThumb: Boolean(thumb && (thumb.querySelector('img') || thumb.querySelector('svg'))),
        title: title ? title.textContent.trim() : '',
        hasClearBtn: Boolean(clearBtn),
        width: rect.width,
        height: rect.height
      };
    })()`);

    record('product-image-picked-card', productImageCheck.found && productImageCheck.hasThumb && productImageCheck.hasClearBtn, `商品主图已选素材呈现为标准卡片（含图标/缩略图、标题: ${productImageCheck.title} 与清除按钮）`);
    record('product-image-card-geometry', productImageCheck.width > 0 && productImageCheck.height > 0, `已选卡片具有正几何（${productImageCheck.width}x${productImageCheck.height}px）`);

    // 交互：点击清除按钮，退回为从资产库选择触发按钮
    await evalJs(`(() => {
      const clearBtn = document.querySelector('.omx-apptab-picked-clear');
      if (clearBtn) clearBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const clearResult = await evalJs(`(() => {
      const picked = document.querySelector('.omx-apptab-picked');
      const libTrigger = document.querySelector('.omx-apptab-library-trigger');
      return {
        cleared: true,
        cardRemoved: picked === null,
        libTriggerFound: Boolean(libTrigger),
        libTriggerText: libTrigger ? libTrigger.textContent.trim() : ''
      };
    })()`);

    record('product-image-clear-and-fallback', clearResult.cleared && clearResult.cardRemoved && clearResult.libTriggerFound, `点击一键移除成功（已选卡片移除，回退为标准触发行: ${clearResult.libTriggerText}）`);

    // ==========================================
    // 验收矩阵 2: 复合控件全类型健全验证
    // ==========================================
    console.log('\n--- 2. 复合控件全类型健全验证（segmented-tabs, multi-tags, media-uploader） ---');

    // 切换至复合应用表单
    await evalJs(`document.getElementById('btn-switch-compound').click()`);
    await new Promise((r) => setTimeout(r, 400));

    // 2.1 选项卡 (segmented-tabs) 并排切换
    const segTabsCheck = await evalJs(`(() => {
      const segBox = document.querySelector('.omx-apptab-seg-tabs');
      if (!segBox) return { found: false };
      const tabs = Array.from(segBox.querySelectorAll('.omx-apptab-seg-tab'));
      const rect = segBox.getBoundingClientRect();
      return {
        found: true,
        count: tabs.length,
        defaultActiveIndex: tabs.findIndex(t => t.classList.contains('is-on')),
        labels: tabs.map(t => t.textContent.trim()),
        width: rect.width,
        height: rect.height
      };
    })()`);

    record('segmented-tabs-rendered', segTabsCheck.found && segTabsCheck.count === 2, `分段选项卡渲染成功（选项: ${segTabsCheck.labels.join(', ')}，默认激活: 第 ${segTabsCheck.defaultActiveIndex + 1} 项）`);
    record('segmented-tabs-geometry', segTabsCheck.width > 0 && segTabsCheck.height > 0, `分段选项卡具有正几何（${segTabsCheck.width}x${segTabsCheck.height}px）`);

    // 交互：点击第二项「自定义视频」
    await evalJs(`(() => {
      const tabs = Array.from(document.querySelectorAll('.omx-apptab-seg-tab'));
      if (tabs.length >= 2) tabs[1].click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const segClickResult = await evalJs(`(() => {
      const tabs = Array.from(document.querySelectorAll('.omx-apptab-seg-tab'));
      return {
        tab0IsOn: tabs[0]?.classList.contains('is-on'),
        tab1IsOn: tabs[1]?.classList.contains('is-on')
      };
    })()`);

    record('segmented-tabs-click-switch', !segClickResult.tab0IsOn && segClickResult.tab1IsOn, `点击切换分段选项卡成功（第一项失活，第二项激活）`);

    // 2.2 多选胶囊 (multi-tags) 标签点选、上限禁用与提示
    const multiTagsCheck = await evalJs(`(() => {
      const multiBox = document.querySelector('.omx-apptab-multi-box');
      if (!multiBox) return { found: false };
      const tags = Array.from(multiBox.querySelectorAll('.omx-apptab-mtag'));
      const foot = multiBox.querySelector('.omx-apptab-multi-foot');
      const rect = multiBox.getBoundingClientRect();
      return {
        found: true,
        tagCount: tags.length,
        footText: foot ? foot.textContent.trim() : '',
        activeCount: tags.filter(t => t.classList.contains('is-on')).length,
        width: rect.width,
        height: rect.height
      };
    })()`);

    record('multi-tags-rendered', multiTagsCheck.found && multiTagsCheck.tagCount === 4, `多选胶囊控件渲染成功（4 项候选标签，默认已选 ${multiTagsCheck.activeCount} 项，底部信息: ${multiTagsCheck.footText}）`);
    record('multi-tags-geometry', multiTagsCheck.width > 0 && multiTagsCheck.height > 0, `多选胶囊具有正几何（${multiTagsCheck.width}x${multiTagsCheck.height}px）`);

    // 交互：分步点选第 2 项与第 3 项，触发上限锁定 (maxItems = 3)
    await evalJs(`(() => {
      const tags = Array.from(document.querySelectorAll('.omx-apptab-mtag'));
      if (tags[1]) tags[1].click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    await evalJs(`(() => {
      const tags = Array.from(document.querySelectorAll('.omx-apptab-mtag'));
      if (tags[2]) tags[2].click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const multiTagsLimitResult = await evalJs(`(() => {
      const tags = Array.from(document.querySelectorAll('.omx-apptab-mtag'));
      const activeTags = tags.filter(t => t.classList.contains('is-on'));
      const unselectedTag = tags[3];
      const limitHint = document.querySelector('.omx-apptab-multi-limit');
      const foot = document.querySelector('.omx-apptab-multi-foot');
      return {
        activeCount: activeTags.length,
        unselectedIsLocked: unselectedTag.classList.contains('is-locked'),
        unselectedIsDisabled: unselectedTag.disabled === true,
        limitHintFound: Boolean(limitHint),
        limitHintText: limitHint ? limitHint.textContent.trim() : '',
        footText: foot ? foot.textContent.trim() : ''
      };
    })()`);

    record('multi-tags-limit-locking', multiTagsLimitResult.activeCount === 3 && multiTagsLimitResult.unselectedIsLocked && multiTagsLimitResult.unselectedIsDisabled && multiTagsLimitResult.limitHintFound, `多选达到上限 3 项后未选项正确锁定（第 4 项带 .is-locked 且 disabled=true，提示: ${multiTagsLimitResult.limitHintText}，底部: ${multiTagsLimitResult.footText}）`);

    // 交互：取消第 2 项，解除锁定
    await evalJs(`(() => {
      const tags = Array.from(document.querySelectorAll('.omx-apptab-mtag'));
      if (tags[1]) tags[1].click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const multiTagsUnlockResult = await evalJs(`(() => {
      const tags = Array.from(document.querySelectorAll('.omx-apptab-mtag'));
      const activeTags = tags.filter(t => t.classList.contains('is-on'));
      const unselectedTag = tags[3];
      return {
        activeCount: activeTags.length,
        unselectedIsLocked: unselectedTag.classList.contains('is-locked'),
        unselectedIsDisabled: unselectedTag.disabled === true
      };
    })()`);

    record('multi-tags-unlock', multiTagsUnlockResult.activeCount === 2 && !multiTagsUnlockResult.unselectedIsLocked && !multiTagsUnlockResult.unselectedIsDisabled, `取消已选项后锁定自动解除（当前已选 2 项，第 4 项解除禁用并可点选）`);

    // 2.3 媒体输入控件 (media-uploader) 卡片化展示与一键移除
    const mediaCardCheck = await evalJs(`(() => {
      const picked = document.querySelector('.omx-apptab-picked');
      if (!picked) return { found: false };
      const title = picked.querySelector('.omx-apptab-picked-title');
      const clearBtn = picked.querySelector('.omx-apptab-picked-clear');
      return {
        found: true,
        title: title ? title.textContent.trim() : '',
        hasClearBtn: Boolean(clearBtn)
      };
    })()`);

    record('media-uploader-picked-card', mediaCardCheck.found && mediaCardCheck.hasClearBtn, `媒体输入已解析链接渲染为统一已选卡片（标题: ${mediaCardCheck.title}）`);

    // 移除已选媒体
    await evalJs(`(() => {
      const clearBtn = document.querySelector('.omx-apptab-picked-clear');
      if (clearBtn) clearBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const mediaClearResult = await evalJs(`(() => {
      const uploaderBox = document.querySelector('.omx-apptab-uploader');
      const picked = document.querySelector('.omx-apptab-picked');
      const hint = uploaderBox ? uploaderBox.querySelector('.omx-apptab-uploader-hint') : null;
      return {
        cardRemoved: picked === null,
        uploaderBoxFound: Boolean(uploaderBox),
        hintText: hint ? hint.textContent.trim() : ''
      };
    })()`);

    record('media-uploader-clear', mediaClearResult.cardRemoved && mediaClearResult.uploaderBoxFound && mediaClearResult.hintText.includes('点击选择或拖拽上传'), `媒体卡片支持一键移除，清空后展现标准上传与拖拽区域（提示: ${mediaClearResult.hintText}）`);

    // ==========================================
    // 3. 真实浏览器渲染取证（PNG 截图与尺寸断言）
    // ==========================================
    console.log('\n--- 3. 真实浏览器渲染截图取证 ---');

    // 切回经典应用并展开下拉菜单，拍摄最佳状态截图
    await evalJs(`document.getElementById('btn-switch-chasing').click()`);
    await new Promise((r) => setTimeout(r, 300));
    await evalJs(`document.querySelector('.omx-apptab-select-single .omx-apptab-select-trigger').click()`);
    await new Promise((r) => setTimeout(r, 200));

    const screenshotData = await send('Page.captureScreenshot', { format: 'png' });
    const pngBuffer = Buffer.from(screenshotData.data, 'base64');
    const { width: pngW, height: pngH } = assertPng(pngBuffer);

    const evidencePngPath = join(REPO_ROOT, 'docs/evidence/workflow-apptab-widgets-browser.png');
    mkdirSync(dirname(evidencePngPath), { recursive: true });
    writeFileSync(evidencePngPath, pngBuffer);

    record('browser-screenshot-verified', pngBuffer.length > 5000 && pngW >= 1200 && pngH >= 600, `捕获无头 Chrome 真实渲染截图（${pngW}x${pngH}px, ${pngBuffer.length} 字节）→ ${evidencePngPath}`);

    console.log(`\n🎉 验收矩阵全部通过！共完成 ${results.length} 项端到端浏览器级断言，0 失败。`);

    return {
      pass: true,
      assertionsCount: results.length,
      evidencePath: evidencePngPath,
    };
  } finally {
    try { ws.close(); } catch {}
    try { chrome.kill('SIGTERM'); } catch {}
    try { server.close(); } catch {}
    console.log('[QA] 资源与 Chrome 进程已自清理完成。');
  }
}

runBrowserQa().catch((err) => {
  console.error('\n❌ 浏览器验收未通过:', err);
  process.exit(1);
});
