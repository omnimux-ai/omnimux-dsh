# 规格：侧边栏分栏状态下右侧面板未占满及宽度过窄导致的中间黑洞空隙修复

- 任务单号：Issue #2042
- 目标模块：`plugins/omnimux`
- 实施分支：`agent/omnimux-split-layout-blackhole-issue-2042`

## 一、背景与问题排查分析

用户反馈在退出全屏为分栏状态下，会话栏右侧与创作画布之间出现了一大片黑灰色空洞死区（约 500px 空白），同时创作画布被挤在仅 300px 左右的窄缝中。

经 CDP 实机抓包分析定位到深层双重根因：
1. **面板自身收缩（shrink-to-fit）死区**：
   - 原生宿主面板 `.Ng7Ira_panel` 采用 `position: absolute; right: 0;` 定位，在分栏（push 模式）下，官方并未强制赋予其 100% 容器宽度；
   - 当其内部未设固定宽度时，面板会 shrink-to-fit 收缩至 Tab 栏宽度（约 245.5px），导致其所在的右侧网格容器左侧空出数百像素的空隙。
2. **分栏宽度被锁定在 300px 极端最小值**：
   - 官方桌面端 `DesktopLayoutState` 的 `panels.rightbar` 在拖拽或边缘状态下可能被记录为 300px（官方最小值）；
   - 导致外层网格列为 `280px minmax(0, 1fr) 300px`，中间会话栏被强行拉扯至 1148px，而会话消息内容宽度为 628px，由此产生整整 520px 的巨大空白黑洞，右侧工作台却被严重挤压。

## 二、架构收敛与方案设计

1. **分栏面板 100% 铺满规则（CSS 保证）**：
   - 在 `conversation-collapse.js` 中增加通用的分栏面板填满规则：
     ```css
     .dshDesktopRightbarSurface [class*="_panel"]:not([data-sidebar-right-panel="fullscreen"]) {
       left: 0 !important;
       right: 0 !important;
       width: 100% !important;
     }
     ```
   - 彻底杜绝分栏状态下面板因绝对定位 shrink-to-fit 造成的自身内部空隙。
2. **健康分栏宽度保底自愈机制（JS 调和保证）**：
   - 在 `tab-viewport-reconciler.js` 中增加 `ensureHealthySplitWidth`；
   - 当工作台页面处于或切入分栏模式（`WORKBENCH_FOCUS.split` / push 模式）时，检查当前桌面底座的 `rightbar` 宽度；
   - 若 `rightbar < 450px`（即处于被压扁或异常极窄状态），自动调用 `layout.setRightbar(Math.round(viewport * 0.45), viewport)` 恢复健康舒适的分栏黄金比例（约 750~800px）；
   - 这样中间会话列自然收敛至舒适的 670px，与右侧工作台完美并排展开，消除两栏间的黑色真空。

## 三、验收标准（Acceptance Criteria）

- **AC-1**：分栏状态下，`.dshDesktopRightbarSurface` 内部的面板 100% 占满容器宽度，不留任何左侧内部空隙。
- **AC-2**：工作台退出全屏为分栏状态时，右侧工作台宽度保持健康舒适尺寸（≥ 500px，标准大屏约为 750~800px），不会被挤压在 300px 细长竖条中。
- **AC-3**：中间会话栏在分栏状态下与右侧工作台无缝衔接，消息气泡和输入框完整居中对齐，中间不再出现 500px 黑色空洞死区。
- **AC-4**：全量单元测试与 E2E 回归测试 100% 通过。
