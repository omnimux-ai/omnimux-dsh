# macOS 全屏且左侧折叠时顶栏标签栏自适应避让验证证据

**任务关联**：Issue #2064 ｜ **验证日期**：2026-09-16

---

## 1. 验证目标与问题根因
- **问题根因**：
  在 macOS 桌面端环境下，右侧工作台处于全屏（`[data-sidebar-right-panel="fullscreen"]`）且左侧折叠（`html[data-omnimux-left-collapsed]`）时：
  左上角拥有红黄绿交通灯（0~84px），紧接着并排注入了展开按钮（84~116px）与新建会话按钮（124~156px），两按钮加间隙累计占用至 164px。
  历史全屏样式中静态硬编码了 `padding-left: 84px !important`，仅避让了交通灯，导致右侧标签栏从 84px 起排，第一个 Tab 标签被两操作按钮严重覆盖重叠。
- **修复方案**：
  1. 将硬编码规则重构为自适应优先对接动态变量：`padding-left: var(--omnimux-topbar-toggle-end, 164px) !important;`；
  2. 同时覆盖 `[data-dockkit-strip]` 与 `[class*="_tabStrip_"]`，杜绝任何类名脱靶；
  3. 非 macOS 系统下自适应对接 `--omnimux-topbar-toggle-end` 并安全回退至 88px。

---

## 2. 验证结果

### 2.1 单元测试与端到端测试
- `plugins/omnimux/src/client/sidebar-toggle-topbar.test.js`：58 项测试全部通过（100% PASS）；
- `tests/e2e/macos-fullscreen-tab-overlap.e2e.test.mjs`：端到端契约测试通过。

### 2.2 几何计算核验
- `toggleLeft`：84px（macOS 交通灯安全边距）；
- `newSessionLeft`：124px（紧随展开按钮，32px 宽度 + 8px 间隙）；
- `toggleEnd`：164px（84 + 32 + 8 + 32 + 8 = 164px）；
- `[data-dockkit-strip]` 的 `padding-left` 达到 164px，首个 Tab 从 164px 开始由左向右顺畅排布，彻底消除任何像素级重叠。
