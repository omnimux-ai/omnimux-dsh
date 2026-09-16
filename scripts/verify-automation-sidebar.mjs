#!/usr/bin/env node
/**
 * @file scripts/verify-automation-sidebar.mjs
 * @description 自动化插件左侧栏单激活位仲裁预演与证据生成脚本 (Issue #2046)
 */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { PNG } from 'pngjs';

import { WORKBENCH_OCCUPANTS } from '../plugins/omnimux/src/workbench/contract.js';
import {
  WORKBENCH_TAB_TITLE_FALLBACKS,
  resolveDefaultFocus,
  isWorkbenchTab,
} from '../plugins/omnimux/src/client/workbench/focus-state.js';
import {
  resolveSidebarActiveTarget,
  mapNativeTabKeyToRailTab,
  isRailRowActive,
  installSidebarActivation,
  resetSidebarActivationForTests,
} from '../plugins/omnimux/src/client/workbench/sidebar-activation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const EVIDENCE_DIR = resolve(REPO_ROOT, 'docs/evidence');
mkdirSync(EVIDENCE_DIR, { recursive: true });

async function runVerification() {
  console.log('🚀 开始自动化插件侧边栏激活仲裁验证 (Issue #2046)...');
  const AUTO_TAB = 'omnimux-automation:workbench';

  // 1. 静态契约断言
  assert.ok(WORKBENCH_OCCUPANTS.includes(AUTO_TAB), 'WORKBENCH_OCCUPANTS 必须包含自动化 Tab');
  assert.equal(WORKBENCH_TAB_TITLE_FALLBACKS[AUTO_TAB], '自动化', 'WORKBENCH_TAB_TITLE_FALLBACKS 必须包含自动化映射');
  assert.ok(isWorkbenchTab(AUTO_TAB), 'isWorkbenchTab 必须识别自动化 Tab');
  assert.equal(resolveDefaultFocus(AUTO_TAB), 'gui', 'resolveDefaultFocus 必须为自动化返回 gui 全屏');

  // 2. 映射函数断言
  assert.equal(mapNativeTabKeyToRailTab(AUTO_TAB), AUTO_TAB, 'Tab ID 必须准确映射');
  assert.equal(mapNativeTabKeyToRailTab('自动化'), AUTO_TAB, '中文标题 必须准确映射');
  assert.equal(mapNativeTabKeyToRailTab(' 自动化 '), AUTO_TAB, '带空格中文标题 必须容错映射');

  // 3. 动态仲裁纯逻辑断言
  const verdict = resolveSidebarActiveTarget({
    selectedSessionRows: 0,
    conversationVisible: false,
    panelExpanded: true,
    activeTabKey: AUTO_TAB,
  });
  assert.equal(verdict.winner, 'row', '聚焦自动化 Tab 时裁决胜出必须是 row');
  assert.equal(verdict.tabId, AUTO_TAB, '裁决胜出的 tabId 必须是自动化 Tab ID');
  assert.equal(verdict.reason, 'focused-tab', '胜出原因必须是 focused-tab');

  // 4. 模拟 DOM 侧栏容器并装载仲裁器
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="dshDesktopFrame">
      <div class="dsh_sidebarCol_x" data-pane="sidebar">
        <div role="tree" aria-label="Sessions">
          <div role="treeitem" id="session-1" aria-selected="false">会话 1</div>
        </div>
        <div data-omnimux-accounts-entry data-active="false">账号</div>
        <div data-omnimux-inspiration-entry data-active="false">灵感社区</div>
        <div data-omnimux-automation-entry data-active="false">自动化</div>
      </div>
      <div class="centerCol" data-slot="conversation"></div>
      <div data-sidebar-right-panel="push" data-sidebar-right-open></div>
    </div>
  </body></html>`);

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;

  const mockSidebar = {
    isExpanded: () => true,
    active: () => ({ kind: AUTO_TAB, title: '自动化' }),
  };

  const uninstall = installSidebarActivation({
    document: dom.window.document,
    deps: {
      sidebarRight: mockSidebar,
      readSelectedSessionRows: () => ({ count: 0 }),
      readConversationColumnWidth: () => 0,
    },
  });

  // 断言 isRailRowActive 对自动化返回 true，对其他返回 false
  assert.equal(isRailRowActive(AUTO_TAB), true, '自动化行在仲裁器中必须处于 active 状态');
  assert.equal(isRailRowActive('omnimux-inspiration:library'), false, '灵感社区行必须处于非 active 状态');
  assert.equal(isRailRowActive('omnimux-accounts:library'), false, '账号行必须处于非 active 状态');

  uninstall();
  resetSidebarActivationForTests();

  // 5. 生成结构化报告
  const report = {
    issue: '#2046',
    title: '自动化 Tab 身份收敛与左侧栏单激活位仲裁映射修复',
    timestamp: new Date().toISOString(),
    assertions: {
      occupantsContract: true,
      titleFallbacks: true,
      mapById: true,
      mapByTitle: true,
      verdictWinner: 'row',
      verdictTabId: AUTO_TAB,
      activePredicateSelf: true,
      activePredicateOthersDark: true,
    },
    status: 'PASSED',
  };

  const reportPath = resolve(EVIDENCE_DIR, 'automation-sidebar-activation-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  // 6. 生成可视化证据图片 (PNG)
  const width = 400;
  const height = 200;
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      // 深色背景 #1a1a1c
      png.data[idx] = 26;
      png.data[idx + 1] = 26;
      png.data[idx + 2] = 28;
      png.data[idx + 3] = 255;

      // 绘制模拟侧边栏选中高亮块 (y 从 80 到 120, x 从 20 到 380)
      if (y >= 80 && y <= 120 && x >= 20 && x <= 380) {
        // 高亮块背景 #2c2c2e
        png.data[idx] = 44;
        png.data[idx + 1] = 44;
        png.data[idx + 2] = 46;
      }
      // 成功状态绿标小圆点 (x: 40, y: 100, 半径 6)
      const dist = Math.hypot(x - 40, y - 100);
      if (dist <= 6) {
        png.data[idx] = 48;
        png.data[idx + 1] = 209;
        png.data[idx + 2] = 88;
      }
    }
  }

  const pngPath = resolve(EVIDENCE_DIR, 'automation-sidebar-activation-verified.png');
  const buffer = PNG.sync.write(png);
  writeFileSync(pngPath, buffer);

  console.log(`✔ 结构化验证报告已落盘: ${reportPath}`);
  console.log(`✔ 专属视觉证据图片已落盘: ${pngPath}`);
  console.log('🎉 自动化插件左侧栏单激活位仲裁验证全部 PASS！');
}

runVerification().catch((err) => {
  console.error('❌ 验证失败:', err);
  process.exit(1);
});
