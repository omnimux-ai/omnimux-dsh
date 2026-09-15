# 规格：左侧侧边栏收起时彻底隐藏（消除 56px 图标栏残留）

## 1. 背景与问题定义

在右侧工作台展开（如资产中心、工作流、产品库等非全屏分屏状态）下，用户点击左上角「收起侧边栏」按钮（`button[data-omnimux-sidebar-toggle-topbar]`）时，官方底层将左侧边栏标记为折叠（`data-sidebar-collapsed`）。
然而在现有实现中：
1. `conversation-box.js` 针对左侧折叠置零的样式规则中，显式排除了存在右侧面板的容器（`:not(:is(.dshDesktopFrame, [class*="frame"]):has([data-sidebar-right-panel]) [class*="sidebarCol"])`），导致最左侧的一列 56px 快捷图标栏（`sidebarCol` / `.dshDesktopSidebarSurface`）依然可见且暴露在外，未实现完全隐藏；
2. `sidebar-toggle-topbar.js` 在计算 CSS 变量 `--omnimux-sidebar-width` 时，当存在带右侧面板的 `nativeFrame` 且处于折叠态（`layout.collapsed === true`）时，错误读取了宿主行内网格声明的 56px 轨宽，导致第一列网格未归零；
3. 用户诉求明确：点击收起左侧侧边栏时，左侧侧栏应该完全隐藏，不留 56px 图标条残留，保留中间聊天输入框与右侧资产中心并排展示（紧凑分屏模式）。

## 2. 交互旅程与验收标准（AC）

### AC-1 左侧侧边栏物理置零与完全隐藏
- 当左侧侧栏处于收起态（DOM 存在 `data-sidebar-collapsed` 属性或 `html[data-omnimux-left-collapsed]` 标记）时，无论右侧面板（`[data-sidebar-right-panel]`）是否打开，最左侧侧边栏节点（`[class*="sidebarCol"]` 及 `.dshDesktopSidebarSurface`）物理尺寸完全归零：
  - `width: 0 !important`、`min-width: 0 !important`、`max-width: 0 !important`；
  - `overflow: hidden !important`、`border: none !important`、`padding: 0 !important`、`display: none !important`；
  - 彻底消除 56px 图标列视觉残留，完全隐藏不可见。

### AC-2 几何网格与变量同步归零
- 当左侧侧栏收起时，`applyTopbarToggleCssVars` 写入的 `--omnimux-sidebar-width` 恒为 `0px`（即使宿主行内声明了 56px，折叠态也强制归零）。
- 分屏模式下的网格第一列收缩为 `0px`，中间会话栏从视口左缘（x=0）贴边排布，右侧工作台充盈铺满剩余空间（`calc(100vw - 440px)`）。

### AC-3 展开状态完整恢复无回归
- 再次点击左上角「打开侧边栏」按钮后，左侧侧边栏平滑展开恢复正常宽度（`~280px`），网格首列及 `--omnimux-sidebar-width` 同步恢复实际宽度，各项图标与会话历史完整恢复交互。

### AC-4 自动化测试与质量门禁通过
- 单元测试与契约测试全量通过，工作树隔离验证无样式冲突或视觉回归。

## 3. 技术约束与实现落点
- 改动仅限于本插件前端样式与几何同步：
  - `plugins/omnimux/src/client/conversation-box.js`：移除排除选择器，增加 `.dshDesktopSidebarSurface` 与 `display: none !important`，确保收起态完全隐藏；
  - `plugins/omnimux/src/client/sidebar-toggle-topbar.js`：折叠态下 `--omnimux-sidebar-width` 严格归零；
  - 补充针对性的单元测试。
