import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E: macOS 全屏且左侧收起时顶栏标签栏自适应避让展开及新建按钮组', () => {
  const topbarJsPath = path.join(root, 'plugins/omnimux/src/client/sidebar-toggle-topbar.js');
  const topbarJs = fs.readFileSync(topbarJsPath, 'utf-8');

  // 1. 验证 macOS 规则采用自适应变量与 164px 安全基准，严禁静态写死 84px
  assert.ok(
    topbarJs.includes('padding-left: var(--omnimux-topbar-toggle-end, 164px) !important;'),
    'macOS 下全屏且左侧收起必须采用 var(--omnimux-topbar-toggle-end, 164px) !important 自适应避让两按钮'
  );
  assert.ok(
    !topbarJs.includes('padding-left: 84px !important;'),
    '严禁静态硬编码 padding-left: 84px !important 遮挡展开和新建会话按钮'
  );

  // 2. 验证同时覆盖 [data-dockkit-strip] 与 [class*="_tabStrip_"]
  assert.ok(
    topbarJs.includes('[data-sidebar-right-panel="fullscreen"] [data-dockkit-strip]') &&
    topbarJs.includes('[data-sidebar-right-panel="fullscreen"] [class*="_tabStrip_"]'),
    '全屏避让规则必须同时覆盖 dockkit 属性与类名选择器'
  );

  // 3. 验证非 macOS 桌面端也自适应对接变量
  assert.ok(
    topbarJs.includes('padding-left: var(--omnimux-topbar-toggle-end, 88px) !important;'),
    '通用桌面端必须自适应对接 --omnimux-topbar-toggle-end 并以 88px 为安全兜底'
  );
});
